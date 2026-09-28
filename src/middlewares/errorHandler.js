import { logger } from '../utils/logger.js';
import { ApiResponse } from '../utils/apiResponse.js';

export function errorHandler(err, req, res, next) {
  logger.error({
    reqId: req.id,
    url: req.originalUrl,
    method: req.method,
    err: err.message,
    stack: err.stack
  }, 'Unhandled Application Error');

  if (res.headersSent) {
    return next(err);
  }

  return ApiResponse.error(
    res,
    process.env.NODE_ENV === 'production' ? 'An unexpected internal error occurred' : err.message,
    'ERR_INTERNAL',
    err.status || 500
  );
}

export function notFoundHandler(req, res) {
  return ApiResponse.error(res, `Route not found: ${req.method} ${req.originalUrl}`, 'ERR_NOT_FOUND', 404);
}
