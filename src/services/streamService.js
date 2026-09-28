import { innertubePool } from './innertubePool.js';
import { cacheService } from './cacheService.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export async function getAudioStreamInfo(videoId) {
  const cacheKey = `stream_info:${videoId}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  const info = await innertubePool.executeWithRetry(async (client) => {
    return await client.getBasicInfo(videoId);
  });

  const streamingData = info.streaming_data;
  if (!streamingData || !streamingData.adaptive_formats) {
    throw new Error('No audio formats available for this video');
  }

  // Filter only audio formats & sort by bitrate descending
  const audioFormats = streamingData.adaptive_formats
    .filter((f) => f.mime_type && f.mime_type.startsWith('audio/'))
    .sort((a, b) => (b.bitrate || 0) - (a.bitrate || 0));

  if (audioFormats.length === 0) {
    throw new Error('No compatible audio stream found');
  }

  const result = {
    videoId,
    title: info.basic_info.title,
    duration: info.basic_info.duration,
    author: info.basic_info.author,
    formats: audioFormats.map((f) => ({
      itag: f.itag,
      mimeType: f.mime_type,
      bitrate: f.bitrate,
      audioQuality: f.audio_quality,
      contentLength: f.content_length,
      url: f.url
    }))
  };

  cacheService.set(cacheKey, result, env.CACHE_TTL_STREAM);
  return result;
}

export async function pipeAudioStream(videoId, req, res) {
  const streamInfo = await getAudioStreamInfo(videoId);
  const bestFormat = streamInfo.formats[0];

  if (!bestFormat || !bestFormat.url) {
    // If direct URL is protected/ciphered, use Innertube stream downloader
    const stream = await innertubePool.executeWithRetry(async (client) => {
      return await client.download(videoId, {
        type: 'audio',
        quality: 'best'
      });
    });

    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Accept-Ranges', 'none');

    // Convert web ReadableStream to Node stream & pipe
    const reader = stream.getReader();
    const pump = async () => {
      const { done, value } = await reader.read();
      if (done) {
        res.end();
        return;
      }
      if (!res.write(value)) {
        res.once('drain', pump);
      } else {
        pump();
      }
    };
    pump();
    return;
  }

  // If direct URL is present, handle Range requests
  const totalLength = parseInt(bestFormat.contentLength || '0', 10);
  const rangeHeader = req.headers.range;

  if (rangeHeader && totalLength > 0) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${totalLength}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': bestFormat.mimeType.split(';')[0] || 'audio/webm'
    });
  } else {
    res.writeHead(200, {
      'Content-Length': totalLength || undefined,
      'Accept-Ranges': 'bytes',
      'Content-Type': bestFormat.mimeType.split(';')[0] || 'audio/webm'
    });
  }

  // Redirect or pipe from Google CDN
  res.redirect(bestFormat.url);
}
