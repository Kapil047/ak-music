import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import NodeID3 from 'node-id3';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { innertubePool } from './innertubePool.js';
import { downloadLimit } from './downloadQueue.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { getYtDlpCommand, getCookieArgs } from './streamService.js';

const execFileAsync = promisify(execFile);

// Setup static binary for cross-platform Windows compatibility
if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export async function convertAndDownloadMp3(videoId, metadata = {}) {
  return downloadLimit(async () => {
    const tempId = uuidv4();
    const tempDir = path.resolve(env.DOWNLOAD_TEMP_DIR);

    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    const inputPath = path.join(tempDir, `${tempId}.input`);
    const outputPath = path.join(tempDir, `${tempId}.mp3`);

    try {
      logger.info({ videoId, tempId }, 'Starting audio extraction for MP3 download');

      let downloadSuccess = false;
      try {
        // 1. Try Innertube first
        const stream = await innertubePool.executeWithRetry(async (client) => {
          return await client.download(videoId, {
            type: 'audio',
            quality: 'best'
          });
        });

        // Write raw stream to temp file
        const fileStream = fs.createWriteStream(inputPath);
        const reader = stream.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          fileStream.write(value);
        }
        fileStream.end();

        await new Promise((resolve, reject) => {
          fileStream.on('finish', resolve);
          fileStream.on('error', reject);
        });

        // Transcode with ffmpeg
        await new Promise((resolve, reject) => {
          ffmpeg(inputPath)
            .toFormat('mp3')
            .audioBitrate(320)
            .on('end', resolve)
            .on('error', reject)
            .save(outputPath);
        });
        downloadSuccess = true;
      } catch (innerErr) {
        logger.warn({ videoId, err: innerErr.message }, 'Innertube download failed, falling back to yt-dlp');
      }

      // If innertube failed, use yt-dlp direct extraction
      if (!downloadSuccess) {
        logger.info({ videoId }, 'Extracting audio via yt-dlp...');
        const { command: ytdlpCmd, argsPrefix } = getYtDlpCommand();
        await execFileAsync(ytdlpCmd, [
          ...argsPrefix,
          ...getCookieArgs(),
          '-x',
          '--audio-format', 'mp3',
          '--audio-quality', '0',
          '--ffmpeg-location', ffmpegPath,
          '-o', outputPath,
          `https://www.youtube.com/watch?v=${videoId}`
        ], { timeout: 90000 });
      }

      // 3. Inject ID3 Tags
      const tags = {
        title: metadata.title || 'Unknown Title',
        artist: metadata.artist || 'Unknown Artist',
        album: metadata.album || 'ak-music'
      };
      NodeID3.write(tags, outputPath);

      logger.info({ videoId, outputPath }, 'MP3 conversion & tagging completed');

      return {
        filePath: outputPath,
        cleanup: () => {
          try {
            if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
            if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
          } catch (e) {
            logger.warn({ err: e.message }, 'Failed to remove temp files');
          }
        }
      };
    } catch (err) {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      throw err;
    }
  });
}
