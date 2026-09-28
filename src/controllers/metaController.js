import { innertubePool } from '../services/innertubePool.js';
import { cacheService } from '../services/cacheService.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { env } from '../config/env.js';

export async function getAlbum(req, res, next) {
  try {
    const { id } = req.params;
    const cacheKey = `album:${id}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return ApiResponse.success(res, cached, { fromCache: true });

    const album = await innertubePool.executeWithRetry(async (client) => {
      return await client.music.getAlbum(id);
    });

    cacheService.set(cacheKey, album, env.CACHE_TTL_METADATA);
    return ApiResponse.success(res, album);
  } catch (err) {
    next(err);
  }
}

export async function getArtist(req, res, next) {
  try {
    const { id } = req.params;
    const cacheKey = `artist:${id}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return ApiResponse.success(res, cached, { fromCache: true });

    const artist = await innertubePool.executeWithRetry(async (client) => {
      return await client.music.getArtist(id);
    });

    cacheService.set(cacheKey, artist, env.CACHE_TTL_METADATA);
    return ApiResponse.success(res, artist);
  } catch (err) {
    next(err);
  }
}

export async function getPlaylist(req, res, next) {
  try {
    const { id } = req.params;
    const cacheKey = `playlist:${id}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return ApiResponse.success(res, cached, { fromCache: true });

    const playlist = await innertubePool.executeWithRetry(async (client) => {
      return await client.music.getPlaylist(id);
    });

    cacheService.set(cacheKey, playlist, env.CACHE_TTL_METADATA);
    return ApiResponse.success(res, playlist);
  } catch (err) {
    next(err);
  }
}

export async function getLyrics(req, res, next) {
  try {
    const { id } = req.params;
    const cacheKey = `lyrics:${id}`;
    const cached = cacheService.get(cacheKey);
    if (cached) return ApiResponse.success(res, cached, { fromCache: true });

    const lyrics = await innertubePool.executeWithRetry(async (client) => {
      return await client.music.getLyrics(id);
    });

    cacheService.set(cacheKey, lyrics, env.CACHE_TTL_METADATA);
    return ApiResponse.success(res, lyrics);
  } catch (err) {
    next(err);
  }
}
