import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import {
  saveTokens,
  loadTokens,
  getAuthStatus,
  logout
} from '../../src/services/youtubeAuthService.js';
import { getCookieArgs } from '../../src/services/streamService.js';
import { OAUTH_CONFIG } from '../../src/config/oauthConfig.js';

describe('YouTube Auth & OAuth Engine Tests', () => {
  const tokenFile = OAUTH_CONFIG.tokenStoragePath;
  let backupFile = null;

  beforeEach(() => {
    if (fs.existsSync(tokenFile)) {
      backupFile = fs.readFileSync(tokenFile);
    }
  });

  afterEach(() => {
    if (backupFile) {
      fs.writeFileSync(tokenFile, backupFile);
    } else if (fs.existsSync(tokenFile)) {
      fs.unlinkSync(tokenFile);
    }
    logout();
  });

  it('should encrypt and save tokens, and decrypt them accurately', () => {
    const mockTokens = {
      access_token: 'test_access_token_12345',
      refresh_token: 'test_refresh_token_67890',
      token_type: 'Bearer',
      expires_at: Date.now() + 3600 * 1000,
      refresh_expires_at: Date.now() + 90 * 86400 * 1000,
      created_at: Date.now(),
      last_refreshed: Date.now()
    };

    saveTokens(mockTokens);

    // Verify file on disk is encrypted (contains payload, iv, authTag, NOT plaintext tokens)
    const rawDisk = fs.readFileSync(tokenFile, 'utf8');
    expect(rawDisk).not.toContain('test_access_token_12345');
    const diskJson = JSON.parse(rawDisk);
    expect(diskJson).toHaveProperty('payload');
    expect(diskJson).toHaveProperty('iv');
    expect(diskJson).toHaveProperty('authTag');

    // Verify loadTokens decrypts back to original data
    const loaded = loadTokens();
    expect(loaded).toBeDefined();
    expect(loaded.access_token).toBe('test_access_token_12345');
    expect(loaded.refresh_token).toBe('test_refresh_token_67890');
  });

  it('should report correct status and expiry metadata', () => {
    logout();
    const unauthenticated = getAuthStatus();
    expect(unauthenticated.authenticated).toBe(false);

    const mockTokens = {
      access_token: 'valid_token',
      refresh_token: 'valid_refresh',
      expires_at: Date.now() + 1800 * 1000, // 30 mins
      refresh_expires_at: Date.now() + 5 * 86400 * 1000, // 5 days (triggers < 7 day warning)
      created_at: Date.now(),
      last_refreshed: Date.now()
    };
    saveTokens(mockTokens);

    const status = getAuthStatus();
    expect(status.authenticated).toBe(true);
    expect(status.expiresInSeconds).toBeGreaterThan(1700);
    expect(status.refreshExpiresInDays).toBe(4); // or 5 depending on ms
    expect(status.warning).toContain('Refresh token expires within 7 days');
  });

  it('should clear stored session on logout', () => {
    saveTokens({ access_token: 'temp', expires_at: Date.now() + 1000 });
    expect(loadTokens()).toBeDefined();

    logout();
    expect(loadTokens()).toBeNull();
    expect(getAuthStatus().authenticated).toBe(false);
  });

  it('should return empty array if cookies.txt is not found', () => {
    const originalEnv = process.env.YTDLP_COOKIES_PATH;
    process.env.YTDLP_COOKIES_PATH = './cookies/non_existent_cookies_file.txt';

    const args = getCookieArgs();
    expect(args).toEqual([]);

    process.env.YTDLP_COOKIES_PATH = originalEnv;
  });
});
