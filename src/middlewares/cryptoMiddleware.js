import { encryptData, decryptData } from '../utils/crypto.js';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function cryptoMiddleware(req, res, next) {
  if (!env.ENABLE_API_ENCRYPTION) {
    return next();
  }

  // 1. INBOUND DECRYPTION
  // Agar body me payload + iv + authTag hai toh automatically decrypt karein
  if (req.body && req.body.payload && req.body.iv && req.body.authTag) {
    try {
      req.body = decryptData(req.body.payload, req.body.iv, req.body.authTag);
      req.wasEncrypted = true;
    } catch (err) {
      logger.warn({ err: err.message }, 'Failed to decrypt incoming request payload');
      return res.status(400).json({
        success: false,
        error: {
          code: 'ERR_DECRYPTION',
          message: 'Malformed or invalid encrypted payload'
        }
      });
    }
  }

  // 2. OUTBOUND AUTO-ENCRYPTION
  const originalJson = res.json.bind(res);

  res.json = function (body) {
    // Health check routes, stream status, aur raw downloads ko plain rehne do
    if (req.path.includes('/health') || req.path.includes('/metrics') || req.path.includes('/test-stream') || req.path.includes('/stream') || req.path.includes('/download')) {
      return originalJson(body);
    }

    try {
      const encrypted = encryptData(body);
      return originalJson({
        success: true,
        encrypted: true,
        data: encrypted,
        timestamp: Date.now()
      });
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to encrypt outgoing response payload');
      return originalJson(body);
    }
  };

  next();
}
