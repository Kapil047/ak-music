import { innertubePool } from '../services/innertubePool.js';
import { cacheService } from '../services/cacheService.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { env } from '../config/env.js';

export async function getHomeFeed(req, res, next) {
  try {
    const cacheKey = 'explore:home';
    const cached = cacheService.get(cacheKey);
    if (cached) return ApiResponse.success(res, cached, { fromCache: true });

    const home = await innertubePool.executeWithRetry(async (client) => {
      return await client.music.getHomeFeed();
    });

    cacheService.set(cacheKey, home, env.CACHE_TTL_EXPLORE);
    return ApiResponse.success(res, home);
  } catch (err) {
    next(err);
  }
}

export async function getExploreFeed(req, res, next) {
  try {
    const cacheKey = 'explore:trending';
    const cached = cacheService.get(cacheKey);
    if (cached) return ApiResponse.success(res, cached, { fromCache: true });

    const explore = await innertubePool.executeWithRetry(async (client) => {
      return await client.music.getExplore();
    });

    cacheService.set(cacheKey, explore, env.CACHE_TTL_EXPLORE);
    return ApiResponse.success(res, explore);
  } catch (err) {
    next(err);
  }
}

export async function getRadioQueue(req, res, next) {
  try {
    const { id } = req.params;
    const cacheKey = `radio:${id}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return ApiResponse.success(res, cached, { fromCache: true });

    let songs = [];
    try {
      const upNext = await innertubePool.executeWithRetry(async (client) => {
        return await client.music.getUpNext(id, { isAudioOnly: true });
      });

      if (Array.isArray(upNext?.contents)) {
        songs = upNext.contents
          .filter((item) => item && (item.video_id || item.id))
          .map((item) => ({
            id: item.video_id || item.id,
            videoId: item.video_id || item.id,
            title: typeof item.title === 'string' ? item.title : (item.title?.text || item.title?.runs?.[0]?.text || 'Unknown Title'),
            artist: item.artists?.map((a) => (typeof a === 'string' ? a : a.name || '')).filter(Boolean).join(', ') || item.author || 'Various Artists',
            author: item.author || 'Various Artists',
            thumbnail: item.thumbnail?.[item.thumbnail.length - 1]?.url || item.thumbnails?.[item.thumbnails.length - 1]?.url || null,
            thumbnails: item.thumbnail || item.thumbnails || [],
            duration: item.duration?.seconds || 0,
            album: item.album?.name || null
          }));
      }
    } catch (innerErr) {
      const related = await innertubePool.executeWithRetry(async (client) => {
        return await client.music.getRelated(id);
      }).catch(() => null);
      if (related) songs = related;
    }

    cacheService.set(cacheKey, songs, env.CACHE_TTL_EXPLORE);
    return ApiResponse.success(res, songs);
  } catch (err) {
    next(err);
  }
}
