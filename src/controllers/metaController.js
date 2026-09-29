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

    const rawPlaylist = await innertubePool.executeWithRetry(async (client) => {
      return await client.music.getPlaylist(id);
    });

    const rawItems = rawPlaylist?.items || rawPlaylist?.contents || [];
    const tracks = [];
    if (Array.isArray(rawItems)) {
      for (const item of rawItems) {
        const thumbs = item.thumbnails || (item.thumbnail?.contents || []);
        let bestThumb = null;
        if (Array.isArray(thumbs) && thumbs.length > 0) {
          bestThumb = thumbs[thumbs.length - 1]?.url || thumbs[0]?.url;
          if (bestThumb && bestThumb.includes('googleusercontent.com')) {
            bestThumb = bestThumb.replace(/=w\d+-h\d+/, '=w800-h800').replace(/=s\d+/, '=s800');
          }
        }
        const songId = item.id || item.videoId || '';
        if (songId) {
          tracks.push({
            id: songId,
            songId,
            title: typeof item.title === 'string' ? item.title : (item.title?.text || item.title?.runs?.[0]?.text || 'Unknown Title'),
            artist: item.artists ? item.artists.map((a) => (typeof a === 'string' ? a : a.name || a.text || '')).filter(Boolean).join(', ') : (item.author?.name || 'Various Artists'),
            album: item.album ? (typeof item.album === 'string' ? item.album : item.album.name || null) : null,
            duration: item.duration ? (typeof item.duration.seconds === 'number' ? item.duration.seconds : 0) : 0,
            thumbnail: bestThumb
          });
        }
      }
    }

    const playlist = {
      id,
      title: typeof rawPlaylist?.title === 'string' ? rawPlaylist.title : (rawPlaylist?.title?.text || 'Playlist'),
      description: rawPlaylist?.description || '',
      trackCount: tracks.length,
      tracks,
      thumbnails: rawPlaylist?.thumbnails || []
    };

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
