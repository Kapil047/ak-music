import { cacheService } from './cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import fs from 'fs';
import path from 'path';
import { innertubePool } from './innertubePool.js';

const execFileAsync = promisify(execFile);

function getYtDlpPath() {
  // 1. Linux/Render project local binary
  const localLinux = path.resolve('./bin/yt-dlp');
  if (fs.existsSync(localLinux) && process.platform !== 'win32') {
    try {
      fs.chmodSync(localLinux, 0o755);
    } catch (_) {}
    return localLinux;
  }

  const localRoot = path.resolve('./yt-dlp');
  if (fs.existsSync(localRoot) && process.platform !== 'win32') {
    try {
      fs.chmodSync(localRoot, 0o755);
    } catch (_) {}
    return localRoot;
  }

  // 2. Windows specific path
  if (process.platform === 'win32') {
    const winPath = 'C:\\Users\\RYZEN 4750\\AppData\\Roaming\\Python\\Python313\\Scripts\\yt-dlp.exe';
    if (fs.existsSync(winPath)) return winPath;
  }

  // 3. Global paths
  if (fs.existsSync('/usr/local/bin/yt-dlp')) return '/usr/local/bin/yt-dlp';
  if (fs.existsSync('/usr/bin/yt-dlp')) return '/usr/bin/yt-dlp';

  return 'yt-dlp';
}

export async function getYtDlpAudioUrl(videoId) {
  const cacheKey = `ytdlp_url:${videoId}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  const ytdlpPath = getYtDlpPath();

  try {
    const { stdout } = await execFileAsync(ytdlpPath, [
      '-g',
      '-f',
      'bestaudio',
      '--no-playlist',
      '--no-warnings',
      '--no-check-certificate',
      `https://www.youtube.com/watch?v=${videoId}`
    ]);
    const url = stdout.trim();
    if (url && url.startsWith('http')) {
      cacheService.set(cacheKey, url, 14400); // Cache for 4 hours
      return url;
    }
  } catch (err) {
    logger.error({ videoId, ytdlpPath, err: err.message }, 'yt-dlp extraction error');
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

export async function pipeAudioStream(videoId, req, res) {
  // 1. Primary: yt-dlp direct CDN redirect
  const directUrl = await getYtDlpAudioUrl(videoId);
  if (directUrl) {
    return res.redirect(directUrl);
  }

  // 2. Secondary fallback: Innertube stream pipe
  try {
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




