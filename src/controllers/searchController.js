import { innertubePool } from '../services/innertubePool.js';
import { getSearchSuggestions } from '../services/suggestionService.js';
import { cacheService } from '../services/cacheService.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { env } from '../config/env.js';

export async function searchSongs(req, res, next) {
  try {
    const { q, type, page } = req.query;
    const cacheKey = `search:${type}:${q}:${page || 1}`;

    const cached = cacheService.get(cacheKey);
    if (cached) {
      return ApiResponse.success(res, cached.results, { fromCache: true, continuation: cached.continuation });
    }

    const searchResponse = await innertubePool.executeWithRetry(async (client) => {
      return await client.music.search(q, { type });
    });

    const results = (searchResponse.results || []).map((item) => ({
      id: item.id,
      title: item.title,
      artists: item.artists ? item.artists.map((a) => a.name) : [],
      album: item.album ? item.album.name : null,
      duration: item.duration ? item.duration.seconds : null,
      thumbnails: item.thumbnails || []
    }));

    const continuation = searchResponse.has_continuation ? searchResponse.continuation : null;

    cacheService.set(cacheKey, { results, continuation }, env.CACHE_TTL_SEARCH);
    return ApiResponse.success(res, results, { continuation });
  } catch (err) {
    next(err);
  }
}

export async function getSuggestions(req, res, next) {
  try {
    const { q } = req.query;
    const suggestions = await getSearchSuggestions(q);
    return ApiResponse.success(res, suggestions);
  } catch (err) {
    next(err);
  }
}
