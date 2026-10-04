import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { OAUTH_CONFIG } from '../config/oauthConfig.js';
import { encryptData, decryptData } from '../utils/crypto.js';
import { logger } from '../utils/logger.js';

// ─────────────────────────────────────────────
// GAP #1 FIX: Promise-based Mutex for token refresh
// Prevents race conditions when multiple requests hit an expired token
// ─────────────────────────────────────────────
let refreshPromise = null;

const TOKEN_DIR = path.dirname(OAUTH_CONFIG.tokenStoragePath);
const TOKEN_FILE = OAUTH_CONFIG.tokenStoragePath;

// Dynamic Firestore helper to keep test runners decoupled from heavy SDK loaders
async function getFirestoreDb() {
  try {
    const { db, isFirebaseReady } = await import('../config/firebase.js');
    if (isFirebaseReady && db) return db;
  } catch (_) {}
  return null;
}

// ─────────────────────────────────────────────
// STORAGE (Encrypted with existing AES-256-GCM crypto.js & Cloud Firestore sync)
// ─────────────────────────────────────────────
function ensureDir() {
  if (!fs.existsSync(TOKEN_DIR)) {
    fs.mkdirSync(TOKEN_DIR, { recursive: true, mode: 0o700 });
  }
}

export function saveTokens(tokens) {
  ensureDir();
  const encrypted = encryptData(tokens);
  fs.writeFileSync(TOKEN_FILE, JSON.stringify(encrypted, null, 2), { mode: 0o600 });
  logger.info('OAuth tokens encrypted and stored securely');

  // Cloud Firestore Sync: Survives Render Free Tier container restarts & spin-downs
  getFirestoreDb().then((db) => {
    if (db) {
      db.collection('system_config').doc('youtube_oauth').set({
        ...encrypted,
        updatedAt: Date.now()
      }).then(() => {
        logger.info('OAuth tokens backed up to Cloud Firestore (Render cloud persistence enabled)');
      }).catch((err) => {
        logger.warn({ err: err.message }, 'Failed to backup OAuth tokens to Firestore');
      });
    }
  });
}

export async function restoreTokensFromFirestore() {
  if (fs.existsSync(TOKEN_FILE)) return;
  const db = await getFirestoreDb();
  if (!db) return;

  try {
    const doc = await db.collection('system_config').doc('youtube_oauth').get();
    if (doc.exists) {
      const data = doc.data();
      if (data && data.payload && data.iv && data.authTag) {
        ensureDir();
        fs.writeFileSync(TOKEN_FILE, JSON.stringify({
          payload: data.payload,
          iv: data.iv,
          authTag: data.authTag
        }, null, 2), { mode: 0o600 });
        logger.info('Restored OAuth tokens from Cloud Firestore onto disk');
      }
    }
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not restore OAuth tokens from Firestore');
  }
}

export function loadTokens() {
  if (!fs.existsSync(TOKEN_FILE)) return null;
  try {
    const raw = fs.readFileSync(TOKEN_FILE, 'utf8');
    const encryptedObj = JSON.parse(raw);
    const tokens = decryptData(encryptedObj.payload, encryptedObj.iv, encryptedObj.authTag);
    return typeof tokens === 'string' ? JSON.parse(tokens) : tokens;
  } catch (err) {
    logger.error({ err: err.message }, 'Failed to load or decrypt OAuth tokens');
    return null;
  }
}

// ─────────────────────────────────────────────
// STEP 1: Initiate Device Code Flow (TVHTML5)
// ─────────────────────────────────────────────
export async function initiateDeviceFlow() {
  const params = new URLSearchParams();
  params.append('client_id', OAUTH_CONFIG.clientId);
  params.append('scope', OAUTH_CONFIG.scope);

  const { data } = await axios.post(OAUTH_CONFIG.deviceCodeUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000
  });

  logger.info({ userCode: data.user_code, verificationUrl: data.verification_url }, 'OAuth device code generated');

  return {
    userCode: data.user_code,
    verificationUrl: data.verification_url,
    deviceCode: data.device_code,
    expiresIn: data.expires_in,
    interval: data.interval || 5
  };
}

// ─────────────────────────────────────────────
// STEP 2: Poll Google Token Endpoint
// ─────────────────────────────────────────────
export async function pollForToken(deviceCode, intervalSec = 5, expiresInSec = 1800) {
  const startTime = Date.now();
  const expiresAt = startTime + (expiresInSec * 1000);
  let pollInterval = intervalSec;

  while (Date.now() < expiresAt) {
    await new Promise((resolve) => setTimeout(resolve, pollInterval * 1000));

    try {
      const params = new URLSearchParams();
      params.append('client_id', OAUTH_CONFIG.clientId);
      params.append('client_secret', OAUTH_CONFIG.clientSecret);
      params.append('code', deviceCode);
      params.append('grant_type', 'urn:ietf:params:oauth:grant-type:device_code');

      const { data } = await axios.post(OAUTH_CONFIG.tokenUrl, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 15000
      });

      const tokens = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        token_type: data.token_type || 'Bearer',
        expires_at: Date.now() + (data.expires_in * 1000),
        refresh_expires_at: Date.now() + (90 * 24 * 60 * 60 * 1000), // 90 days
        created_at: Date.now(),
        last_refreshed: Date.now()
      };

      saveTokens(tokens);
      logger.info('OAuth TVHTML5 login successful! Tokens stored.');
      return tokens;
    } catch (err) {
      const error = err.response?.data?.error;
      if (error === 'authorization_pending') {
        continue;
      }
      if (error === 'slow_down') {
        pollInterval += 5;
        continue;
      }
      if (error === 'expired_token' || error === 'access_denied') {
        logger.warn({ error }, 'OAuth device code polling terminated');
        throw new Error(`OAuth authorization ended: ${error}`);
      }
      logger.warn({ err: err.message, error }, 'OAuth polling error, retrying...');
    }
  }

  throw new Error('Device code expired without user authorization');
}

// ─────────────────────────────────────────────
// STEP 3: Mutex-Locked Auto-Refresh Access Token
// ─────────────────────────────────────────────
export async function getValidAccessToken() {
  const tokens = loadTokens();
  if (!tokens) {
    throw new Error('No OAuth tokens found. Please complete device login at /api/v1/auth/youtube/device-code');
  }

  // Check if current access token is still fresh
  if (tokens.expires_at > Date.now() + OAUTH_CONFIG.refreshThresholdMs) {
    return tokens.access_token;
  }

  // MUTEX: Only one concurrent refresh call allowed
  if (!refreshPromise) {
    refreshPromise = doRefresh(tokens.refresh_token)
      .finally(() => {
        refreshPromise = null;
      });
  }

  const refreshed = await refreshPromise;
  return refreshed.access_token;
}

async function doRefresh(refreshToken) {
  logger.info('Refreshing YouTube OAuth token (mutex locked)...');

  const params = new URLSearchParams();
  params.append('client_id', OAUTH_CONFIG.clientId);
  params.append('client_secret', OAUTH_CONFIG.clientSecret);
  params.append('refresh_token', refreshToken);
  params.append('grant_type', 'refresh_token');

  const { data } = await axios.post(OAUTH_CONFIG.tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 15000
  });

  const tokens = loadTokens() || {};
  const updatedTokens = {
    ...tokens,
    access_token: data.access_token,
    expires_at: Date.now() + (data.expires_in * 1000),
    last_refreshed: Date.now()
  };

  saveTokens(updatedTokens);
  logger.info('OAuth token refreshed successfully');
  return updatedTokens;
}

// ─────────────────────────────────────────────
// STATUS & DIAGNOSTICS
// ─────────────────────────────────────────────
export function getAuthStatus() {
  const tokens = loadTokens();
  if (!tokens) {
    return {
      authenticated: false,
      message: 'No active YouTube OAuth session'
    };
  }

  const expiresInMs = Math.max(0, tokens.expires_at - Date.now());
  const refreshExpiresInMs = Math.max(0, (tokens.refresh_expires_at || 0) - Date.now());
  const daysUntilRefreshExpiry = Math.floor(refreshExpiresInMs / (1000 * 60 * 60 * 24));

  return {
    authenticated: true,
    expiresInSeconds: Math.floor(expiresInMs / 1000),
    refreshExpiresInDays: daysUntilRefreshExpiry,
    warning: daysUntilRefreshExpiry < 7 ? 'Refresh token expires within 7 days. Re-authorization recommended.' : null,
    lastRefreshed: tokens.last_refreshed ? new Date(tokens.last_refreshed).toISOString() : null,
    createdAt: tokens.created_at ? new Date(tokens.created_at).toISOString() : null
  };
}

export function logout() {
  if (fs.existsSync(TOKEN_FILE)) {
    try {
      fs.unlinkSync(TOKEN_FILE);
    } catch (_) {}
  }
  getFirestoreDb().then((db) => {
    if (db) db.collection('system_config').doc('youtube_oauth').delete().catch(() => {});
  });
  refreshPromise = null;
  logger.info('YouTube OAuth session cleared');
}
