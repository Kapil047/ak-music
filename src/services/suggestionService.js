import axios from 'axios';
import { logger } from '../utils/logger.js';
import { cacheService } from './cacheService.js';
import { innertubePool } from './innertubePool.js';
import { env } from '../config/env.js';
import { userHistoryService } from './userHistoryService.js';
import { getRadioForSong } from './queueService.js';

/**
 * 3-Layer Personalized Search Suggestions with Ranking
 */
export async function getSearchSuggestions(query, uid = null, limit = 10) {
  if (!query || !query.trim()) {
    return { top: null, all: [], isPersonalized: false };
  }

  const normalizedQuery = query.toLowerCase().trim();
  const cacheKey = `sugg:${uid || 'guest'}:${normalizedQuery}:${limit}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  // LAYER 1: User History & Searches (Firestore)
  let personalSuggestions = [];
  if (uid) {
    try {
      personalSuggestions = await userHistoryService.getMatchingHistory(uid, normalizedQuery, 5);
    } catch (err) {
      logger.warn({ err: err.message, uid }, 'Personal suggestions error');
    }
  }

  // LAYER 2: Live Query-Based (Google Suggestqueries + Innertube Fallback)
  let querySuggestions = [];
  try {
    const url = `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, { timeout: 2500 });
    if (Array.isArray(response.data) && Array.isArray(response.data[1])) {
      querySuggestions = response.data[1].filter((s) => typeof s === 'string' && s.trim().length > 0);
    }
  } catch (err) {
    logger.debug({ err: err.message }, 'Primary Google suggestions failed');
  }

  if (querySuggestions.length === 0) {
    try {
      const results = await innertubePool.executeWithRetry(async (client) => {
        const musicSearch = await client.music.getSearchSuggestions(query);
        return musicSearch.map((s) => (typeof s === 'string' ? s : s.text || s.title)).filter(Boolean);
      });
      querySuggestions = results || [];
    } catch (err) {
      logger.warn({ err: err.message }, 'Innertube suggestion fallback failed');
    }
  }

  // LAYER 3: Scoring & Ranking Algorithm
  const ranked = rankSuggestions({
    personal: personalSuggestions,
    query: querySuggestions,
    userQuery: normalizedQuery,
  });

  const final = ranked.slice(0, limit);
  const result = {
    top: final[0] || null,
    all: final,
    isPersonalized: personalSuggestions.length > 0,
  };

  cacheService.set(cacheKey, result, env.CACHE_TTL_SUGGESTIONS);
  return result;
}

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
      existing.score += score * 0.35;
      if (isPersonal) existing.isPersonal = true;
    }
  };

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

function dedupKey(item) {
  const title = (item.title || '').toLowerCase().trim();
  const artist = (item.artist || '').toLowerCase().trim();
  return `${title}|${artist}`;
}

/**
 * Home page "Suggested For You" feed.
 *
 * 100% discovery: user's recent/top plays are used ONLY as seeds to fetch
 * YouTube's radio (getUpNext) for each one — every song actually shown is
 * a fresh recommendation that the user hasn't already played.
 * Global trending is the last-resort fallback only.
 */
export async function getHomeFeed(uid = null, limit = 20) {
  const cacheKey = `home_feed:${uid || 'guest'}:${limit}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  const merged = [];
  const seenIds = new Set();
  const seenKeys = new Set();

  const tryAdd = (song) => {
    if (merged.length >= limit) return false;
    if (!song?.title || !song?.songId) return false;
    const key = dedupKey(song);
    if (seenIds.has(song.songId) || seenKeys.has(key)) return false;
    seenIds.add(song.songId);
    seenKeys.add(key);
    merged.push(song);
    return true;
  };

  let seedSongs = [];
  if (uid) {
    const [recentR, topR] = await Promise.allSettled([
      userHistoryService.getRecentHistory(uid, 10),
      userHistoryService.getTopPlayed(uid, 10),
    ]);

    const recent = recentR.status === 'fulfilled' ? recentR.value : [];
    const top = topR.status === 'fulfilled' ? topR.value : [];

    if (recentR.status === 'rejected') logger.error({ err: recentR.reason }, 'getRecentHistory failed');
    if (topR.status === 'rejected') logger.error({ err: topR.reason }, 'getTopPlayed failed');

    // Add user's already played tracks to seen set so they are NOT suggested
    for (const item of [...recent, ...top]) {
      const id = item.songId || item.id;
      if (id) seenIds.add(id);
      const k = dedupKey(item);
      if (k) seenKeys.add(k);
    }

    // Used ONLY as radio seeds — never pushed into `merged` directly.
    const seedMap = new Map();
    for (const item of [...recent, ...top]) {
      const id = item.songId || item.id;
      if (id && !seedMap.has(id)) seedMap.set(id, item);
    }
    seedSongs = Array.from(seedMap.values()).slice(0, 4);
  }

  // Real discovery: one radio call per seed, feeding each result through
  // the same dedup as everything else.
  for (const seed of seedSongs) {
    if (merged.length >= limit) break;
    const seedId = seed.songId || seed.id;
    if (!seedId) continue;

    const radioSongs = await getRadioForSong(seedId, {
      limit: limit - merged.length,
      excludeIds: Array.from(seenIds),
    });
    for (const song of radioSongs) {
      tryAdd(song);
    }
  }

  // Last resort only — no seeds at all (guest/new user), or radio
  // couldn't fill the remaining slots.
  if (merged.length < limit) {
    try {
      const searchRes = await innertubePool.executeWithRetry(async (client) => {
        return await client.music.search('Trending Hits 2026', { type: 'song' });
      });
      for (const item of extractSongItems(searchRes)) {
        if (merged.length >= limit) break;
        tryAdd(normalizeSong(item, 'trending'));
      }
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to backfill trending songs for home feed');
    }
  }

  const finalFeed = merged.slice(0, limit);
  cacheService.set(cacheKey, finalFeed, 300);
  return finalFeed;
}

function extractSongItems(searchRes) {
  if (Array.isArray(searchRes?.results)) return searchRes.results;
  const items = [];
  if (Array.isArray(searchRes?.contents)) {
    for (const sec of searchRes.contents) {
      if (Array.isArray(sec.contents)) items.push(...sec.contents);
    }
  }
  return items;
}

function normalizeSong(item, source) {
  const title = typeof item.title === 'string' ? item.title : item.title?.text || 'Unknown Title';
  let thumbnail = null;
  if (Array.isArray(item.thumbnails) && item.thumbnails.length > 0) {
    thumbnail = item.thumbnails[item.thumbnails.length - 1]?.url || item.thumbnails[0]?.url;
  }
  if (thumbnail && thumbnail.includes('googleusercontent.com')) {
    thumbnail = thumbnail.replace(/=w\d+-h\d+/, '=w800-h800').replace(/=s\d+/, '=s800');
  }
  return {
    id: item.id || item.videoId || '',
    songId: item.id || item.videoId || '',
    title,
    artist: item.artists?.[0]?.name || (typeof item.artists?.[0] === 'string' ? item.artists[0] : 'Various Artists'),
    thumbnail,
    duration: item.duration?.seconds || 0,
    source,
  };
}
