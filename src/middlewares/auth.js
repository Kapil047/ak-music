import { env } from '../config/env.js';
import { ApiResponse } from '../utils/apiResponse.js';

export function authMiddleware(req, res, next) {
  // Public routes bypass
  if (
    req.path.includes('/health') ||
    req.path.includes('/metrics') ||
    req.path.includes('/app/update') ||
    req.path.includes('/app/scripts') ||
    req.path.startsWith('/public')
  ) {
    return next();
  }

  const apiKey = req.headers['x-api-key'] || req.query.apiKey;

  if (!apiKey || apiKey !== env.API_SECRET_KEY) {
    return ApiResponse.error(res, 'Missing or invalid API key. Pass x-api-key header.', 'ERR_UNAUTHORIZED', 401);
  }

  next();
}
