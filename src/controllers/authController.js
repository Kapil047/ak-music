import crypto from 'crypto';
import { db, isFirebaseReady } from '../config/firebase.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { env } from '../config/env.js';

// In-Memory store fallback if Firebase is offline
const localUsers = new Map();

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const verifyHash = crypto.pbkdf2Sync(password, salt, 10000, 64, 'sha512').toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(verifyHash, 'hex'));
}

export function createAuthToken(payload) {
  const secret = env.ENCRYPTION_KEY || 'default_secret_key_akmusic_secure_2026';
  const data = Buffer.from(JSON.stringify({ ...payload, exp: Date.now() + 30 * 24 * 60 * 60 * 1000 })).toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `akm.${data}.${signature}`;
}

export function verifyAuthToken(token) {
  if (!token || !token.startsWith('akm.')) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [, data, signature] = parts;
  const secret = env.ENCRYPTION_KEY || 'default_secret_key_akmusic_secure_2026';
  const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  if (signature !== expectedSignature) return null;
  try {
    const payload = JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function signup(req, res, next) {
  try {
    const { email, password, name } = req.body;

    if (!email || !email.includes('@')) {
      return ApiResponse.error(res, 'Valid email is required', 'ERR_VALIDATION', 400);
    }
    if (!password || password.length < 6) {
      return ApiResponse.error(res, 'Password must be at least 6 characters', 'ERR_VALIDATION', 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    const cleanName = (name && name.trim()) || cleanEmail.split('@')[0];

    // Check if user already exists
    if (isFirebaseReady) {
      const snap = await db.collection('users').where('email', '==', cleanEmail).limit(1).get();
      if (!snap.empty) {
        return ApiResponse.error(res, 'User with this email already exists', 'ERR_CONFLICT', 409);
      }
    } else {
      for (const u of localUsers.values()) {
        if (u.email === cleanEmail) {
          return ApiResponse.error(res, 'User with this email already exists', 'ERR_CONFLICT', 409);
        }
      }
    }

    const uid = 'usr_' + crypto.randomBytes(8).toString('hex');
    const passwordHash = hashPassword(password);
    const userData = {
      uid,
      email: cleanEmail,
      name: cleanName,
      createdAt: Date.now()
    };

    if (isFirebaseReady) {
      await db.collection('users').doc(uid).set({
        ...userData,
        passwordHash
      });
    } else {
      localUsers.set(uid, { ...userData, passwordHash });
    }

    const token = createAuthToken({ uid, email: cleanEmail, name: cleanName });
    return ApiResponse.success(res, { token, user: userData }, { message: 'Signup successful' });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return ApiResponse.error(res, 'Email and password are required', 'ERR_VALIDATION', 400);
    }

    const cleanEmail = email.toLowerCase().trim();
    let userRecord = null;

    if (isFirebaseReady) {
      const snap = await db.collection('users').where('email', '==', cleanEmail).limit(1).get();
      if (!snap.empty) {
        userRecord = snap.docs[0].data();
      }
    } else {
      for (const u of localUsers.values()) {
        if (u.email === cleanEmail) {
          userRecord = u;
          break;
        }
      }
    }

    if (!userRecord || !verifyPassword(password, userRecord.passwordHash)) {
      return ApiResponse.error(res, 'Invalid email or password', 'ERR_UNAUTHORIZED', 401);
    }

    const { passwordHash, ...userData } = userRecord;
    const token = createAuthToken({ uid: userData.uid, email: userData.email, name: userData.name });

    return ApiResponse.success(res, { token, user: userData }, { message: 'Login successful' });
  } catch (err) {
    next(err);
  }
}

export async function guestAuth(req, res, next) {
  try {
    const { deviceId } = req.body || {};
    const guestId = deviceId ? `guest_${deviceId}` : `guest_${crypto.randomBytes(6).toString('hex')}`;
    const userData = {
      uid: guestId,
      name: 'Guest Listener',
      email: null,
      isGuest: true,
      createdAt: Date.now()
    };

    const token = createAuthToken(userData);
    return ApiResponse.success(res, { token, user: userData });
  } catch (err) {
    next(err);
  }
}

export async function getProfile(req, res, next) {
  try {
    return ApiResponse.success(res, { user: req.user });
  } catch (err) {
    next(err);
  }
}
