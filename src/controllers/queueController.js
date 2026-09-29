import { getRadioForSong } from '../services/queueService.js';
import { ApiResponse } from '../utils/apiResponse.js';

const VIDEO_ID_RE = /^[\w-]{11}$/;

/**
 * POST /queue/next
 * Body: { currentSongId, excludeIds?: string[], limit?: number }
 *
 * Called by the player:
 *   1. When a song starts playing — to pre-fill "up next".
 *   2. When the queue is about to run out (last ~3 songs) — to auto-extend it.
 *
 * No auth required — this is seeded by the currently playing song, not by
 * the user's identity, so guests get the same quality suggestions.
 */
export async function getNextSongs(req, res, next) {
  try {
    const { currentSongId, excludeIds, limit } = req.body || {};

    if (!currentSongId || typeof currentSongId !== 'string') {
      return ApiResponse.error(res, 'currentSongId is required', 'ERR_VALIDATION', 400);
    }
    if (!VIDEO_ID_RE.test(currentSongId)) {
      return ApiResponse.error(res, 'currentSongId is not a valid video id', 'ERR_VALIDATION', 400);
    }

    const cappedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 25);
    const safeExclude = Array.isArray(excludeIds)
      ? excludeIds.filter((id) => typeof id === 'string' && VIDEO_ID_RE.test(id)).slice(0, 200)
      : [];

    const songs = await getRadioForSong(currentSongId, { limit: cappedLimit, excludeIds: safeExclude });

    return ApiResponse.success(res, {
      seed: currentSongId,
      songs,
      count: songs.length,
    });
  } catch (err) {
    next(err);
  }
}
