import { cacheService } from './cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'fs';
import path from 'path';
import { innertubePool } from './innertubePool.js';

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
    '-f', 'bestaudio',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
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
 * Streams audio to client:
 * 1. Primary: Direct 302 Redirect to YouTube Google Video CDN (zero server RAM/CPU, max speed).
 * 2. Secondary fallback: Innertube stream pipe (handles cases where yt-dlp triggers bot checks on cloud IP).
 */
export async function pipeAudioStream(videoId, req, res) {
  // 1. Primary: yt-dlp direct CDN redirect
  const directUrl = await getYtDlpAudioUrl(videoId);
  if (directUrl) {
    return res.redirect(directUrl);
  }

  // 2. Secondary fallback: Innertube stream pipe
  try {
    logger.info({ videoId }, 'yt-dlp failed or blocked, falling back to Innertube stream');
    const stream = await innertubePool.executeWithRetry(async (client) => {
      return await client.download(videoId, {
        type: 'audio',
        quality: 'best'
      });
    });

    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Accept-Ranges', 'none');

    const reader = stream.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) return res.end();
      if (!res.write(value)) res.once('drain', pump);
      else pump();
    };
    return pump();
  } catch (err) {
    logger.error({ videoId, err: err.message }, 'All audio streaming methods failed');
  }

  throw new Error('Failed to resolve audio stream URL');
}






