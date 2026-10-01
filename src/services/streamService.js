import { cacheService } from './cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

const execFileAsync = promisify(execFile);

/**
 * Returns command and arguments prefix for executing yt-dlp across Windows, Linux, and Render cloud containers
 */
export function getYtDlpCommand() {
  // 1. Windows specific path
  if (process.platform === 'win32') {
    const winPath = 'C:\\Users\\RYZEN 4750\\AppData\\Roaming\\Python\\Python313\\Scripts\\yt-dlp.exe';
    if (fs.existsSync(winPath)) return { command: winPath, argsPrefix: [] };
    return { command: 'yt-dlp.exe', argsPrefix: [] };
  }

  // 2. Linux / Render container:
  // Priority A: Project local python script via python3 (lightweight, zero unpack latency)
  const localLinux = path.resolve('./bin/yt-dlp');
  if (fs.existsSync(localLinux)) {
    try {
      fs.chmodSync(localLinux, 0o755);
    } catch (_) {}
    return { command: 'python3', argsPrefix: [localLinux] };
  }

  const localRoot = path.resolve('./yt-dlp');
  if (fs.existsSync(localRoot)) {
    try {
      fs.chmodSync(localRoot, 0o755);
    } catch (_) {}
    return { command: 'python3', argsPrefix: [localRoot] };
  }

  // Priority B: Global bin paths
  if (fs.existsSync('/usr/local/bin/yt-dlp')) return { command: '/usr/local/bin/yt-dlp', argsPrefix: [] };
  if (fs.existsSync('/usr/bin/yt-dlp')) return { command: '/usr/bin/yt-dlp', argsPrefix: [] };

  // Priority C: Python module execution
  return { command: 'python3', argsPrefix: ['-m', 'yt_dlp'] };
}

export async function getYtDlpAudioUrl(videoId) {
  const cacheKey = `ytdlp_url:${videoId}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  const { command, argsPrefix } = getYtDlpCommand();

  const args = [
    ...argsPrefix,
    '-g',
    '-f', 'bestaudio/ba/b',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    '--socket-timeout', '10',
    '--force-ipv4',
    `https://www.youtube.com/watch?v=${videoId}`
  ];

  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 25000 });
    const url = stdout.trim();
    if (url && url.startsWith('http')) {
      cacheService.set(cacheKey, url, 14400); // Cache for 4 hours
      return url;
    }
    if (stderr) {
      logger.warn({ videoId, stderr }, 'yt-dlp extraction warning');
    }
  } catch (err) {
    logger.error({ videoId, command, err: err.message, stderr: err.stderr }, 'yt-dlp extraction error');
  }
  return null;
}

export async function getAudioStreamInfo(videoId) {
  const cacheKey = `stream_info:${videoId}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  const directUrl = await getYtDlpAudioUrl(videoId);
  const result = {
    videoId,
    formats: [
      {
        itag: 251,
        mimeType: 'audio/webm; codecs="opus"',
        bitrate: 160000,
        audioQuality: 'AUDIO_QUALITY_MEDIUM',
        url: directUrl
      }
    ]
  };

  cacheService.set(cacheKey, result, env.CACHE_TTL_STREAM);
  return result;
}

/**
 * Streams audio to client by proxying chunks with full Range (HTTP 206) seek support.
 * This guarantees playback works on mobile clients without Google Video 403 Forbidden IP-mismatch errors.
 */
export async function pipeAudioStream(videoId, req, res) {
  const directUrl = await getYtDlpAudioUrl(videoId);
  if (!directUrl) {
    throw new Error('Failed to resolve audio stream URL');
  }

  try {
    const upstreamHeaders = {};
    if (req.headers.range) {
      upstreamHeaders['Range'] = req.headers.range;
    }

    const response = await axios.get(directUrl, {
      headers: upstreamHeaders,
      responseType: 'stream',
      validateStatus: (status) => status >= 200 && status < 400,
      timeout: 15000
    });

    res.status(response.status);

    const headersToForward = [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'cache-control'
    ];

    for (const header of headersToForward) {
      if (response.headers[header]) {
        res.setHeader(header, response.headers[header]);
      }
    }

    if (!res.getHeader('accept-ranges')) {
      res.setHeader('Accept-Ranges', 'bytes');
    }

    // Pipe stream directly to client response
    response.data.pipe(res);

    req.on('close', () => {
      if (!res.writableEnded) {
        response.data.destroy();
      }
    });
  } catch (err) {
    // If upstream Google Video link was expired (403/410), clear cached link for fresh retry
    if (err.response && (err.response.status === 403 || err.response.status === 410)) {
      cacheService.del(`ytdlp_url:${videoId}`);
    }

    logger.error({ videoId, err: err.message }, 'Failed to proxy audio stream');

    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error: { code: 'ERR_STREAM_PROXY', message: 'Failed to stream audio from source' }
      });
    }
  }
}





