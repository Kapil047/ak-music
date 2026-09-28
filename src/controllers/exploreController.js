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

    const related = await innertubePool.executeWithRetry(async (client) => {
      return await client.music.getRelated(id);
    });

    cacheService.set(cacheKey, related, env.CACHE_TTL_EXPLORE);
    return ApiResponse.success(res, related);
  } catch (err) {
    next(err);
  }
}
