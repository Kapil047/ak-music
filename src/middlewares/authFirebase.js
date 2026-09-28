import { auth, isFirebaseReady } from '../config/firebase.js';
import { ApiResponse } from '../utils/apiResponse.js';

export async function verifyUserAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return ApiResponse.error(res, 'Authentication required. Pass Authorization: Bearer <token>', 'ERR_UNAUTHORIZED', 401);
  }

  const token = authHeader.split('Bearer ')[1];

  if (!isFirebaseReady) {
    // Development / Mock mode fallback
    req.user = {
      uid: token.length > 5 ? token : 'mock_user_123',
      email: 'mockuser@example.com'
    };
    return next();
  }

  try {
    const decodedToken = await auth.verifyIdToken(token);
    req.user = {
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name || null
    };
    next();
  } catch (err) {
    return ApiResponse.error(res, 'Invalid or expired Firebase authentication token', 'ERR_UNAUTHORIZED', 401);
  }
}
