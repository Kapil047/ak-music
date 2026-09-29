import { cacheService } from './cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const YTDLP_PATH = 'C:\\Users\\RYZEN 4750\\AppData\\Roaming\\Python\\Python313\\Scripts\\yt-dlp.exe';

export async function getYtDlpAudioUrl(videoId) {
  const cacheKey = `ytdlp_url:${videoId}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  try {
    const { stdout } = await execFileAsync(YTDLP_PATH, [
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
    logger.error({ videoId, err: err.message }, 'yt-dlp extraction error');
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
  const directUrl = await getYtDlpAudioUrl(videoId);
  if (directUrl) {
    return res.redirect(directUrl);
  }
  throw new Error('Failed to resolve audio stream URL');
}




