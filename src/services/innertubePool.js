import { Innertube, UniversalCache } from 'youtubei.js';
import { logger } from '../utils/logger.js';
import { CLIENT_PROFILES } from '../config/constants.js';

class InnertubePool {
  constructor() {
    this.clients = new Map();
    this.currentIndex = 0;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) return;

    logger.info('Initializing Innertube Multi-Client Pool...');

    for (const profile of CLIENT_PROFILES) {
      try {
        const client = await Innertube.create({
          cache: new UniversalCache(false),
          generate_session_locally: true,
          client_type: profile
        });

        this.clients.set(profile, client);
        logger.info({ profile }, `Registered Innertube profile: ${profile}`);
      } catch (err) {
        logger.warn({ profile, err: err.message }, `Failed to init profile ${profile}, fallback to default`);
      }
    }

    // Default fallback if profiles failed
    if (this.clients.size === 0) {
      logger.warn('Creating default Innertube client fallback...');
      const fallback = await Innertube.create();
      this.clients.set('DEFAULT', fallback);
    }

    this.isInitialized = true;
    logger.info(`Innertube Pool initialized with ${this.clients.size} active clients`);
  }

  getClient() {
    if (!this.isInitialized || this.clients.size === 0) {
      throw new Error('Innertube pool not initialized');
    }

    const profiles = Array.from(this.clients.keys());
    const profile = profiles[this.currentIndex % profiles.length];
    this.currentIndex = (this.currentIndex + 1) % profiles.length;

    return {
      profile,
      client: this.clients.get(profile)
    };
  }

  async executeWithRetry(fn, maxRetries = 2) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const { profile, client } = this.getClient();

      try {
        return await fn(client);
      } catch (err) {
        lastError = err;
        logger.warn(
          { attempt, profile, err: err.message },
          'Innertube request failed, rotating client...'
        );

        // Exponential backoff with jitter
        const jitter = Math.random() * 200;
        await new Promise((r) => setTimeout(r, Math.pow(2, attempt) * 200 + jitter));
      }
    }

    throw lastError;
  }
}

export const innertubePool = new InnertubePool();
