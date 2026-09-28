import axios from 'axios';
import { logger } from '../utils/logger.js';
import { cacheService } from './cacheService.js';
import { innertubePool } from './innertubePool.js';
import { env } from '../config/env.js';

export async function getSearchSuggestions(query) {
  if (!query || !query.trim()) return [];

  const cacheKey = `sugg:${query.toLowerCase().trim()}`;
  const cached = cacheService.get(cacheKey);
  if (cached) return cached;

  // 1. Primary: Google Suggestqueries (Fastest ~15ms)
  try {
    const url = `https://suggestqueries-clients6.youtube.com/complete/search?client=youtube&ds=yt&q=${encodeURIComponent(query)}`;
    const response = await axios.get(url, { timeout: 2500 });
    
    // Pattern match ["query", ["sugg1", "sugg2", ...]]
    const rawText = response.data;
    const match = rawText.match(/\["(.*?)",\[(.*?)\]\]/);

    if (match && match[2]) {
      const items = match[2]
        .split('],[')
        .map((chunk) => {
          const itemMatch = chunk.match(/\[?"(.*?)"/);
          return itemMatch ? itemMatch[1] : null;
        })
        .filter(Boolean);

      if (items.length > 0) {
        cacheService.set(cacheKey, items, env.CACHE_TTL_SUGGESTIONS);
        return items;
      }
    }
  } catch (err) {
    logger.debug({ err: err.message }, 'Primary Google suggestions failed, trying Innertube...');
  }

  // 2. Fallback: Innertube Music search suggestions
  try {
    const results = await innertubePool.executeWithRetry(async (client) => {
      const musicSearch = await client.music.getSearchSuggestions(query);
      return musicSearch.map((s) => (typeof s === 'string' ? s : s.text || s.title)).filter(Boolean);
    });

    if (results && results.length > 0) {
      cacheService.set(cacheKey, results, env.CACHE_TTL_SUGGESTIONS);
      return results;
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'All suggestion providers failed');
  }

  return [];
}
