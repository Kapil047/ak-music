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
export const YT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://www.youtube.com',
  'Referer': 'https://www.youtube.com/',
  'Sec-Fetch-Dest': 'audio',
  'Sec-Fetch-Mode': 'no-cors',
  'Sec-Fetch-Site': 'cross-site',
  'Connection': 'keep-alive',
};

/**
 * Auto-detects yt-dlp cookies.txt and logs warning if older than 60 days
 */
export function getCookieArgs() {
  const cookiePath = env.YTDLP_COOKIES_PATH
    ? path.resolve(env.YTDLP_COOKIES_PATH)
    : path.resolve('./cookies/cookies.txt');

  // Auto-restore cookies from environment variable on Render if file doesn't exist yet
  if (!fs.existsSync(cookiePath)) {
    if (process.env.YTDLP_COOKIES_TEXT) {
      try {
        const cookieDir = path.dirname(cookiePath);
        if (!fs.existsSync(cookieDir)) fs.mkdirSync(cookieDir, { recursive: true });
        fs.writeFileSync(cookiePath, process.env.YTDLP_COOKIES_TEXT, 'utf8');
        logger.info('Restored cookies.txt from YTDLP_COOKIES_TEXT environment variable');
      } catch (_) {}
    } else if (process.env.YTDLP_COOKIES_BASE64) {
      try {
        const cookieDir = path.dirname(cookiePath);
        if (!fs.existsSync(cookieDir)) fs.mkdirSync(cookieDir, { recursive: true });
        fs.writeFileSync(cookiePath, Buffer.from(process.env.YTDLP_COOKIES_BASE64, 'base64').toString('utf8'), 'utf8');
        logger.info('Restored cookies.txt from YTDLP_COOKIES_BASE64 environment variable');
      } catch (_) {}
    }
  }

  if (!fs.existsSync(cookiePath)) {
    return [];
  }

  try {
    const stats = fs.statSync(cookiePath);
    const daysOld = (Date.now() - stats.mtimeMs) / (1000 * 60 * 60 * 24);
    if (daysOld > 60) {
      logger.warn({ daysOld: Math.floor(daysOld), cookiePath }, 'yt-dlp cookies are older than 60 days — re-export recommended');
    }
  } catch (_) {}

  return ['--cookies', cookiePath];
}

/**
 * Returns command and arguments prefix for executing yt-dlp across Windows, Linux, and Render cloud containers
 */
export function getYtDlpCommand() {
  // 1. Windows specific path
  if (process.platform === 'win32') {
    const candidates = [
      process.env.YTDLP_PATH_WINDOWS,
      'C:\\Users\\RYZEN 4750\\AppData\\Roaming\\Python\\Python313\\Scripts\\yt-dlp.exe',
      process.env.APPDATA ? path.join(process.env.APPDATA, 'Python', 'Python313', 'Scripts', 'yt-dlp.exe') : null,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python313', 'Scripts', 'yt-dlp.exe') : null,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python312', 'Scripts', 'yt-dlp.exe') : null,
      process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Programs', 'Python', 'Python311', 'Scripts', 'yt-dlp.exe') : null
    ];
    for (const p of candidates) {
      if (p && fs.existsSync(p)) return { command: p, argsPrefix: [] };
    }
    return { command: 'yt-dlp.exe', argsPrefix: [] };
  }

  // 2. Linux / Render container:
  // Priority A: Project local binary or Python zipapp script
  const localLinux = path.resolve('./bin/yt-dlp');
  if (fs.existsSync(localLinux)) {
    try {
      fs.chmodSync(localLinux, 0o755);
    } catch (_) {}
    try {
      const buffer = Buffer.alloc(4);
      const fd = fs.openSync(localLinux, 'r');
      fs.readSync(fd, buffer, 0, 4, 0);
      fs.closeSync(fd);
      const isElf = buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46;
      if (isElf) {
        return { command: localLinux, argsPrefix: [] };
      }
    } catch (_) {}
    return { command: 'python3', argsPrefix: [localLinux] };
  }

  const localRoot = path.resolve('./yt-dlp');
  if (fs.existsSync(localRoot)) {
    try {
      fs.chmodSync(localRoot, 0o755);
    } catch (_) {}
    try {
      const buffer = Buffer.alloc(4);
      const fd = fs.openSync(localRoot, 'r');
      fs.readSync(fd, buffer, 0, 4, 0);
      fs.closeSync(fd);
      const isElf = buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46;
      if (isElf) {
        return { command: localRoot, argsPrefix: [] };
      }
    } catch (_) {}
    return { command: 'python3', argsPrefix: [localRoot] };
  }

  // Priority B: Global bin paths
  if (fs.existsSync('/usr/local/bin/yt-dlp')) return { command: '/usr/local/bin/yt-dlp', argsPrefix: [] };
  if (fs.existsSync('/usr/bin/yt-dlp')) return { command: '/usr/bin/yt-dlp', argsPrefix: [] };

  // Priority C: Python module execution fallback
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
    '--extractor-args', 'youtube:player_client=android_vr,tv_embedded,visionos',
    ...getCookieArgs(),
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

export async function getStreamUrlViaInnertube(videoId) {
  try {
    return await innertubePool.executeWithRetry(async (client) => {
      const info = await client.getInfo(videoId);
      const format = info.chooseFormat({ type: 'audio', quality: 'best' });
      if (!format) return null;
      if (format.decipher) {
        return await format.decipher(client.session.player);
      }
      return format.url || null;
    });
  } catch (err) {
    logger.warn({ videoId, err: err.message }, 'Innertube direct stream extraction failed, falling back');
    return null;
  }
}

export async function getStreamUrl(videoId) {
  const cacheKey = `stream:${videoId}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  // PRIORITY 1: Authenticated Innertube (Fastest, zero subprocess overhead)
  const innertubeUrl = await getStreamUrlViaInnertube(videoId);
  if (innertubeUrl) {
    cacheService.set(cacheKey, innertubeUrl, 14400);
    logger.info({ videoId, source: 'innertube-oauth' }, 'Audio stream URL resolved');
    return innertubeUrl;
  }

  // PRIORITY 2: yt-dlp with cookies (Reliable fallback)
  const ytdlpUrl = await getYtDlpAudioUrl(videoId);
  if (ytdlpUrl) {
    cacheService.set(cacheKey, ytdlpUrl, 14400);
    logger.info({ videoId, source: 'yt-dlp' }, 'Audio stream URL resolved');
    return ytdlpUrl;
  }

  return null;
}

export async function getAudioStreamInfo(videoId) {
  const cacheKey = `stream_info:${videoId}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  const directUrl = await getStreamUrl(videoId);
  if (!directUrl) return null;

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

export async function prewarmStreamUrls(videoIds = []) {
  if (!Array.isArray(videoIds) || videoIds.length === 0) {
    return { requested: 0, warmed: 0 };
  }
  const uniqueIds = [...new Set(videoIds)].slice(0, 10);
  const results = await Promise.allSettled(
    uniqueIds.map((id) => getStreamUrl(id))
  );
  const successCount = results.filter((r) => r.status === 'fulfilled' && r.value).length;
  return { requested: uniqueIds.length, warmed: successCount };
}

/**
 * Streams audio to client with full HTTP Range (206) seek support, YouTube CDN headers,
 * and automatic memory cleanup on client disconnect.
 */
export async function pipeAudioStream(videoId, req, res) {
  const mode = req.query.mode || 'proxy';
  const directUrl = await getStreamUrl(videoId);

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
    if (upstream.headers['etag']) {
      res.setHeader('ETag', upstream.headers['etag']);
      res.setHeader('Cache-Control', 'public, max-age=14400');
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
      cacheService.del(`stream:${videoId}`);
      if (!res.headersSent) {
        return res.status(503).json({
          success: false,
          error: { code: 'ERR_YT_BLOCKED', message: 'Upstream YouTube stream expired or blocked, refresh cache', retryable: true }
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







