import crypto from 'crypto';
import { env } from '../config/env.js';

const ALGORITHM = env.CRYPTO_ALGORITHM || 'aes-256-gcm';
const KEY = Buffer.from(env.CRYPTO_SECRET_KEY, 'hex');

/**
 * Encrypts arbitrary JS object or string using AES-256-GCM
 * Returns { payload, iv, authTag } in Base64
 */
export function encryptData(data) {
  const iv = crypto.randomBytes(env.CRYPTO_IV_LENGTH || 16);
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv);

  const plainText = typeof data === 'string' ? data : JSON.stringify(data);
  let encrypted = cipher.update(plainText, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag().toString('base64');

  return {
    payload: encrypted,
    iv: iv.toString('base64'),
    authTag: authTag
  };
}

/**
 * Decrypts AES-256-GCM encrypted payload
 * Verifies AuthTag integrity
 */
export function decryptData(encryptedPayload, ivBase64, authTagBase64) {
  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encryptedPayload, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  try {
    return JSON.parse(decrypted);
  } catch {
    return decrypted;
  }
}
