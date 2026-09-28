import NodeCache from 'node-cache';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

class CacheService {
  constructor() {
    this.cache = new NodeCache({
      stdTTL: env.CACHE_TTL_SEARCH,
      checkperiod: 120,
      useClones: false
    });

    this.cache.on('expired', (key) => {
      logger.debug({ key }, 'Cache key expired');
    });
  }

  get(key) {
    return this.cache.get(key);
  }

  set(key, value, ttlSeconds) {
    return this.cache.set(key, value, ttlSeconds);
  }

  has(key) {
    return this.cache.has(key);
  }

  del(key) {
    return this.cache.del(key);
  }

  flush() {
    return this.cache.flushAll();
  }

  getStats() {
    return this.cache.getStats();
  }
}

export const cacheService = new CacheService();
