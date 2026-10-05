import path from 'path';
import { env } from './env.js';

export const OAUTH_CONFIG = {
  // TVHTML5 client — Google's official Android TV / Living Room client (YMusic uses this)
  clientId: env.TVHTML5_CLIENT_ID || '861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com',
  clientSecret: env.TVHTML5_CLIENT_SECRET || 'SboVhoG9s0rNafixCSGGKXAT',
  scope: 'http://gdata.youtube.com https://www.googleapis.com/auth/youtube',

  deviceCodeUrl: 'https://www.youtube.com/o/oauth2/device/code',
  tokenUrl: 'https://www.youtube.com/o/oauth2/token',
  verificationUrl: 'https://www.youtube.com/activate',

  tokenStoragePath: path.resolve('./data/yt_tokens.json'),
  refreshThresholdMs: 5 * 60 * 1000 // Refresh 5 minutes before expiration
};
