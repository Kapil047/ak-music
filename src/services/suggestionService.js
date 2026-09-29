import axios from 'axios';
import { logger } from '../utils/logger.js';
import { cacheService } from './cacheService.js';
import { innertubePool } from './innertubePool.js';
import { env } from '../config/env.js';
import { userHistoryService } from './userHistoryService.js';

/**
 * 3-Layer Personalized Search Suggestions with Ranking
 * @param {string} query - User typed search query
 * @param {string} uid - Firebase UID or Guest ID
 * @param {number} limit - Maximum number of suggestions to return
 */
export async function getSearchSuggestions(query, uid = null, limit = 10) {
  if (!query || !query.trim()) {
    return { top: null, all: [], isPersonalized: false };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const cacheKey = `sugg:${uid || 'guest'}:${normalizedQuery}:${limit}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  // ═══════════════════════════════════════════════════════════
  // LAYER 1: User History & Searches (Firestore)
  // ═══════════════════════════════════════════════════════════
  let personalSuggestions = [];
  if (uid) {
    try {
      personalSuggestions = await userHistoryService.getMatchingHistory(
        uid,
        normalizedQuery,
        5
      );
    } catch (err) {
      logger.warn({ err: err.message, uid }, 'Personal suggestions error');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LAYER 2: Live Query-Based (Google Suggestqueries + Innertube)
  // ═══════════════════════════════════════════════════════════
  let querySuggestions = [];

  // 2a. Primary: Google Suggestqueries (Fastest ~15ms JSON array)
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, { timeout: 2500 });
    if (Array.isArray(response.data) && Array.isArray(response.data[1])) {
      querySuggestions = response.data[1].filter(
        (s) => typeof s === 'string' && s.trim().length > 0
      );
    }
  } catch (err) {
    logger.debug({ err: err.message }, 'Primary Google suggestions failed');
  }

  // 2b. Fallback: Innertube
  if (querySuggestions.length === 0) {
    try {
      const results = await innertubePool.executeWithRetry(async (client) => {
        const musicSearch = await client.music.getSearchSuggestions(query);
        return musicSearch
          .map((s) => (typeof s === 'string' ? s : s.text || s.title))
          .filter(Boolean);
      });
      querySuggestions = results || [];
    } catch (err) {
      logger.warn({ err: err.message }, 'Innertube suggestion fallback failed');
    }
  }

  // ═══════════════════════════════════════════════════════════
  // LAYER 3: Scoring & Ranking Algorithm
  // ═══════════════════════════════════════════════════════════
  const ranked = rankSuggestions({
    personal: personalSuggestions,
    query: querySuggestions,
    userQuery: normalizedQuery,
  });

  const final = ranked.slice(0, limit);
  const result = {
    top: final[0] || null, // ⭐ Top 1 highlighted recommendation
    all: final,
    isPersonalized: personalSuggestions.length > 0,
  };

  cacheService.set(cacheKey, result, env.CACHE_TTL_SUGGESTIONS);
  return result;
}

/**
 * Score-based ranking algorithm
 */
function rankSuggestions({ personal, query, userQuery }) {
  const scores = new Map();

  const addScore = (text, score, isPersonal = false) => {
    if (!text) return;
    const cleanText = text.trim();
    const key = cleanText.toLowerCase();

    if (!scores.has(key)) {
      scores.set(key, { text: cleanText, score, isPersonal });
    } else {
      const existing = scores.get(key);
      // Multi-source boost: if found in personal AND Google autocomplete
      existing.score += score * 0.35;
      if (isPersonal) existing.isPersonal = true;
    }
  };

  // 1. Personal suggestions (Top priority)
  personal.forEach((item) => {
    const text = typeof item === 'string' ? item : item.text || item.title;
    if (!text) return;
    const lower = text.toLowerCase().trim();

    let score = 50;
    if (lower === userQuery) score = 100;
    else if (lower.startsWith(userQuery)) score = 80;
    else if (lower.includes(userQuery)) score = 60;

    const freq = item.frequency || 1;
    score += Math.min(freq * 5, 20);

    if (item.lastPlayedAt) {
      const hoursAgo = (Date.now() - item.lastPlayedAt) / 3600000;
      if (hoursAgo < 24) score += 15;
      else if (hoursAgo < 168) score += 5;
    }

    addScore(text, score, true);
  });

  // 2. Query suggestions
  query.forEach((text) => {
    if (!text) return;
    const lower = text.toLowerCase().trim();
    let score = 10;
    if (lower === userQuery) score = 90;
    else if (lower.startsWith(userQuery)) score = 70;
    else if (lower.includes(userQuery)) score = 40;

    addScore(text, score, false);
  });

  return Array.from(scores.values())
    .sort((a, b) => b.score - a.score)
    .map((item) => item.text);
}


/**
 * Home page personalized feed: Recent > Top > Favorites > Global Trending
 * Returns full song objects for the Home "Suggested For You" shelf
 */
export async function getHomeFeed(uid = null, limit = 20) {
  const cacheKey = `home_feed:${uid || 'guest'}:${limit}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  let merged = [];

  if (uid) {
    try {
      const [recent, top, favorites] = await Promise.all([
        userHistoryService.getRecentHistory(uid, 10),
        userHistoryService.getTopPlayed(uid, 10),
        userHistoryService.getFavorites(uid, 10),
      ]);

      const seen = new Set();

      // Priority 1: Recently played
      for (const item of recent) {
        const key = (item.title || '').toLowerCase().trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          merged.push({ ...item, source: 'recent' });
        }
      }

      // Priority 2: Most played (Top)
      for (const item of top) {
        const key = (item.title || '').toLowerCase().trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          merged.push({ ...item, source: 'top' });
        }
      }

      // Priority 3: Favorites
      for (const item of favorites) {
        const key = (item.title || '').toLowerCase().trim();
        if (key && !seen.has(key)) {
          seen.add(key);
          merged.push({ ...item, source: 'favorite' });
        }
      }
    } catch (err) {
      logger.error({ err: err.message, uid }, 'Failed to generate personalized home feed');
    }
  }

  // If user has fewer than `limit` tracks or is guest, backfill with Global Trending songs from Innertube
  if (merged.length < limit) {
    try {
      const remaining = limit - merged.length;
      const searchRes = await innertubePool.executeWithRetry(async (client) => {
        return await client.music.search('Trending Hits 2026', { type: 'song' });
      });

      let rawItems = [];
      if (Array.isArray(searchRes.results)) {
        rawItems = searchRes.results;
      } else if (Array.isArray(searchRes.contents)) {
        for (const sec of searchRes.contents) {
          if (Array.isArray(sec.contents)) rawItems.push(...sec.contents);
        }
      }

      const seenKeys = new Set(merged.map((m) => (m.title || '').toLowerCase().trim()));

      for (const item of rawItems) {
        const title = typeof item.title === 'string' ? item.title : (item.title?.text || 'Unknown Title');
        const key = title.toLowerCase().trim();
        if (!seenKeys.has(key) && merged.length < limit) {
          seenKeys.add(key);
          merged.push({
            id: item.id || item.videoId || '',
            songId: item.id || item.videoId || '',
            title,
            artist: item.artists?.[0]?.name || (typeof item.artists?.[0] === 'string' ? item.artists[0] : 'Various Artists'),
            thumbnail: item.thumbnails?.[0]?.url || null,
            duration: item.duration?.seconds || 0,
            source: 'trending',
          });
        }
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to backfill trending songs for home feed');
    }
  }

  const finalFeed = merged.slice(0, limit);
  cacheService.set(cacheKey, finalFeed, 300); // 5 min cache
  return finalFeed;
}

