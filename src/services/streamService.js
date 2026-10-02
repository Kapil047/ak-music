import { cacheService } from './cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { innertubePool } from './innertubePool.js';

const execFileAsync = promisify(execFile);

// YouTube stream headers required by Google Video CDN to prevent 403 Forbidden
const YT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.youtube.com',
  'Referer': 'https://www.youtube.com/',
  'Connection': 'keep-alive',
};

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
    '--socket-timeout', '30',
    '--retries', '3',
    `https://www.youtube.com/watch?v=${videoId}`
  ];

  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 35000 });
    const url = stdout.trim().split('\n')[0];
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

export const getStreamUrl = getYtDlpAudioUrl;

export async function getAudioStreamInfo(videoId) {
  const cacheKey = `stream_info:${videoId}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  const directUrl = await getYtDlpAudioUrl(videoId);
  if (directUrl) {
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

  // Fallback to Innertube metadata if yt-dlp did not provide direct url
  try {
    const info = await innertubePool.executeWithRetry(async (client) => {
      return await client.getInfo(videoId);
    });
    const formats = info?.streaming_data?.adaptive_formats?.filter(f => f.has_audio) || [];
    const bestAudio = formats.sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0))[0];
    const url = bestAudio?.decipher?.(info.player) || bestAudio?.url;
    if (url) {
      const result = {
        videoId,
        formats: [
          {
            itag: bestAudio.itag || 251,
            mimeType: bestAudio.mime_type || 'audio/webm; codecs="opus"',
            bitrate: bestAudio.bitrate || 160000,
            audioQuality: 'AUDIO_QUALITY_MEDIUM',
            url
          }
        ]
      };
      cacheService.set(cacheKey, result, env.CACHE_TTL_STREAM);
      return result;
    }
  } catch (err) {
    logger.warn({ videoId, err: err.message }, 'Innertube getAudioStreamInfo fallback failed');
  }

  return null;
}

/**
 * Streams audio to client with full HTTP Range (206) seek support, YouTube CDN headers,
 * and automatic memory cleanup on client disconnect.
 */
export async function pipeAudioStream(videoId, req, res) {
  const mode = req.query.mode || 'proxy';
  const directUrl = await getYtDlpAudioUrl(videoId);

  if (!directUrl) {
    return res.status(503).json({
      success: false,
      error: { code: 'ERR_STREAM_UNAVAILABLE', message: 'Could not resolve audio stream URL' }
    });
  }

  // 1. Direct Redirect Mode (zero server bandwidth, fastest if client IP matches)
  if (mode === 'redirect') {
    return res.redirect(302, directUrl);
  }

  // 2. Proxy Streaming Mode (Default — Solves 403 Forbidden & IP mismatch errors)
  try {
    const upstreamHeaders = { ...YT_HEADERS };
    if (req.headers.range) {
      upstreamHeaders['Range'] = req.headers.range;
    }

    const upstream = await axios.get(directUrl, {
      headers: upstreamHeaders,
      responseType: 'stream',
      timeout: 30000,
      maxRedirects: 5,
      validateStatus: (s) => s >= 200 && s < 400,
    });

    res.status(upstream.status);
    res.setHeader('Content-Type', upstream.headers['content-type'] || 'audio/webm');
    res.setHeader('Accept-Ranges', 'bytes');

    if (upstream.headers['content-length']) {
      res.setHeader('Content-Length', upstream.headers['content-length']);
    }
    if (upstream.headers['content-range']) {
      res.setHeader('Content-Range', upstream.headers['content-range']);
    }

    // Pipe audio stream to client
    upstream.data.pipe(res);

    // Client abort/disconnect handler — kills upstream immediately to prevent memory leak
    res.on('close', () => {
      if (!upstream.data.destroyed) {
        upstream.data.destroy();
      }
    });

    upstream.data.on('error', (err) => {
      logger.error({ videoId, err: err.message }, 'Upstream stream piping error');
      if (!res.headersSent) {
        res.status(502).json({
          success: false,
          error: { code: 'ERR_STREAM_PIPE', message: 'Failed to pipe upstream audio' }
        });
      } else {
        res.end();
      }
    });
  } catch (err) {
    // If upstream link expired (403/410), clear cache for next request
    if (err.response?.status === 403 || err.response?.status === 410) {
      cacheService.del(`ytdlp_url:${videoId}`);
      if (!res.headersSent) {
        return res.status(503).json({
          success: false,
          error: { code: 'ERR_YT_BLOCKED', message: 'Upstream YouTube stream expired or blocked, refresh cache' }
        });
      }
    }

    logger.error({ videoId, err: err.message }, 'Failed to stream audio');
    if (!res.headersSent) {
      res.status(502).json({
        success: false,
        error: { code: 'ERR_STREAM_PROXY', message: 'Failed to proxy audio stream' }
      });
    }
  }
}







