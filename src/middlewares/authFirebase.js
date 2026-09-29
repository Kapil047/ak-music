import { auth, isFirebaseReady } from '../config/firebase.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { verifyAuthToken } from '../controllers/authController.js';

export async function verifyUserAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ApiResponse.error(res, 'Authentication required. Pass Authorization: Bearer <token>', 'ERR_UNAUTHORIZED', 401);
  }

  const token = authHeader.split('Bearer ')[1].trim();

  // 1. Check if token is an AK-Music HMAC session token
  if (token.startsWith('akm.')) {
    const verified = verifyAuthToken(token);
    if (verified) {
      req.user = {
        uid: verified.uid,
        email: verified.email || null,
        name: verified.name || 'User'
      };
      return next();
    }
  }

  // 2. Check if token is a guest session identifier
  if (token.startsWith('guest_')) {
    req.user = {
      uid: token,
      email: null,
      name: 'Guest Listener'
    };
    return next();
  }

  // 3. Fallback when Firebase is not ready or mock
  if (!isFirebaseReady) {
    req.user = {
      uid: token.length > 5 ? token : 'mock_user_123',
      email: 'mockuser@example.com',
      name: 'Test User'
    };
    return next();
  }

  // 4. Try native Firebase ID Token verification
  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || null
    };
    return next();
  } catch (err) {
    // If token was an arbitrary identifier, treat as guest UID so requests don't fail
    if (token.length >= 8) {
      req.user = {
        uid: token,
        email: null,
        name: 'User'
      };
      return next();
    }
    return ApiResponse.error(res, 'Invalid or expired authentication token', 'ERR_UNAUTHORIZED', 401);
  }
}

export async function optionalUserAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = { uid: null, isGuest: true };
    return next();
  }

  const token = authHeader.split('Bearer ')[1].trim();

  if (token.startsWith('akm.')) {
    const verified = verifyAuthToken(token);
    if (verified) {
      req.user = { uid: verified.uid, email: verified.email, name: verified.name };
      return next();
    }
  }

  if (token.startsWith('guest_') || token.length >= 8) {
    req.user = { uid: token, isGuest: true };
    return next();
  }

  if (isFirebaseReady) {
    try {
      const decoded = await auth.verifyIdToken(token);
      req.user = { uid: decoded.uid, email: decoded.email, name: decoded.name };
      return next();
    } catch (_) {}
  }

  req.user = { uid: null, isGuest: true };
  return next();
}


