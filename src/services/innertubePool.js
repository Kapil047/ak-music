import { Innertube, UniversalCache } from 'youtubei.js';
import { logger } from '../utils/logger.js';
import { CLIENT_PROFILES } from '../config/constants.js';
import { loadTokens } from './youtubeAuthService.js';

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

        // 📺 OAuth Injection for TVHTML5 (YMusic Engine)
        if (profile === 'TVHTML5') {
          const tokens = loadTokens();
          if (tokens && tokens.access_token) {
            try {
              await client.session.signIn({
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                expiry_date: new Date(tokens.expires_at).toISOString()
              });
              logger.info('📺 TVHTML5 client authenticated with saved YouTube OAuth session');
            } catch (authErr) {
              logger.warn({ err: authErr.message }, 'Could not sign in TVHTML5 client with stored OAuth token');
            }
          }
        }

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

  async syncOAuthSession() {
    const tvClient = this.clients.get('TVHTML5');
    if (!tvClient) return false;
    const tokens = loadTokens();
    if (!tokens || !tokens.access_token) return false;

    try {
      await tvClient.session.signIn({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: new Date(tokens.expires_at).toISOString()
      });
      logger.info('📺 TVHTML5 client dynamically authenticated with new OAuth session');
      return true;
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to dynamically sync TVHTML5 OAuth session');
      return false;
    }
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
