import { innertubePool } from '../services/innertubePool.js';
import { getSearchSuggestions, getHomeFeed } from '../services/suggestionService.js';
import { userHistoryService } from '../services/userHistoryService.js';

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

    let rawItems = [];
    if (Array.isArray(searchResponse.results) && searchResponse.results.length > 0) {
      rawItems = searchResponse.results;
    } else if (Array.isArray(searchResponse.contents)) {
      for (const section of searchResponse.contents) {
        if (Array.isArray(section.contents) && section.contents.length > 0) {
          rawItems.push(...section.contents);
        }
      }
    }

    const results = rawItems.map((item) => {
      const thumbs = item.thumbnails || (item.thumbnail?.contents || []);
      let bestThumb = null;
      if (Array.isArray(thumbs) && thumbs.length > 0) {
        bestThumb = thumbs[thumbs.length - 1]?.url || thumbs[0]?.url;
        if (bestThumb && bestThumb.includes('googleusercontent.com')) {
          bestThumb = bestThumb.replace(/=w\d+-h\d+/, '=w800-h800').replace(/=s\d+/, '=s800');
        }
      }
      const extractedTitle = typeof item.title === 'string' 
        ? item.title 
        : (item.title?.text || item.title?.runs?.[0]?.text || item.name || 'Unknown Title');

      let extractedArtists = [];
      if (Array.isArray(item.artists) && item.artists.length > 0) {
        extractedArtists = item.artists.map((a) => (typeof a === 'string' ? a : a.name || a.text || ''));
      } else if (Array.isArray(item.authors) && item.authors.length > 0) {
        extractedArtists = item.authors.map((a) => (typeof a === 'string' ? a : a.name || a.text || ''));
      } else if (item.author) {
        extractedArtists = [typeof item.author === 'string' ? item.author : item.author.name || ''];
      }

      return {
        id: item.id || item.videoId || '',
        title: extractedTitle,
        artists: extractedArtists.filter(Boolean),
        album: item.album ? (typeof item.album === 'string' ? item.album : item.album.name || item.album.text || null) : null,
        duration: item.duration ? (typeof item.duration.seconds === 'number' ? item.duration.seconds : (typeof item.duration === 'number' ? item.duration : 0)) : 0,
        thumbnail: bestThumb,
        thumbnails: thumbs
      };
    }).filter((item) => item.id);

    const continuation = searchResponse.has_continuation ? searchResponse.continuation : null;

    cacheService.set(cacheKey, { results, continuation }, env.CACHE_TTL_SEARCH);
    return ApiResponse.success(res, results, { continuation });
  } catch (err) {
    next(err);
  }
}

export async function getSuggestions(req, res, next) {
  try {
    const { q, limit } = req.query;
    const uid = req.user?.uid || null;

    // Empty query = Home Feed (Recent > Top > Favorites > Trending)
    if (!q || !q.trim()) {
      const feed = await getHomeFeed(uid, limit ? parseInt(limit, 10) : 20);
      return ApiResponse.success(res, {
        top: null,
        all: feed,
        isTrending: true,
        isPersonalized: !!uid && feed.some((f) => f.source !== 'trending'),
      });
    }

    const suggestions = await getSearchSuggestions(
      q,
      uid,
      limit ? parseInt(limit, 10) : 10
    );

    return ApiResponse.success(res, suggestions);
  } catch (err) {
    next(err);
  }
}

export async function recordPlayEvent(req, res, next) {
  try {
    const uid = req.user?.uid;
    const { songId, title, artist, thumbnail, duration } = req.body || {};

    if (!songId || !title) {
      return ApiResponse.error(res, 'songId and title are required', 'ERR_VALIDATION', 400);
    }

    if (!uid) {
      return ApiResponse.success(res, { recorded: false, reason: 'no_uid' });
    }

    await userHistoryService.recordPlay(uid, { songId, title, artist, thumbnail, duration });
    return ApiResponse.success(res, { recorded: true }, { message: 'Play recorded' });
  } catch (err) {
    next(err);
  }
}

export async function recordSearchQuery(req, res, next) {
  try {
    const uid = req.user?.uid;
    const { query } = req.body || {};

    if (!uid || !query || !query.trim()) {
      return ApiResponse.success(res, { recorded: false });
    }

    await userHistoryService.recordSearch(uid, query.trim());
    return ApiResponse.success(res, { recorded: true });
  } catch (err) {
    next(err);
  }
}


