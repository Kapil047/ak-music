import { convertAndDownloadMp3 } from '../services/audioService.js';
import { getActiveQueueStats } from '../services/downloadQueue.js';
import { ApiResponse } from '../utils/apiResponse.js';

export async function downloadMp3(req, res, next) {
  try {
    const { id } = req.params;
    const { title, artist, album } = req.query;

    const result = await convertAndDownloadMp3(id, { title, artist, album });

    res.download(result.filePath, `${title || id}.mp3`, (err) => {
      // Auto-cleanup temp file immediately after download completes or fails
      result.cleanup();
      if (err && !res.headersSent) {
        next(err);
      }
    });
  } catch (err) {
    next(err);
  }
}

export function getDownloadStats(req, res) {
  return ApiResponse.success(res, getActiveQueueStats());
}
