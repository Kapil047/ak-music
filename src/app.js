import express from 'express';
import dns from 'dns';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// Force IPv4 resolution first on Linux/Render to eliminate 20-30s IPv6 connect timeouts
dns.setDefaultResultOrder('ipv4first');

import { env } from './config/env.js';
import { requestIdMiddleware } from './middlewares/requestId.js';
import { globalLimiter } from './middlewares/rateLimiter.js';
import { authMiddleware } from './middlewares/auth.js';
import { cryptoMiddleware } from './middlewares/cryptoMiddleware.js';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler.js';
import { apiRouter } from './routes/index.js';

export const app = express();

// Enable trust proxy for Render / Cloudflare reverse proxy headers (fixes express-rate-limit ERR_ERL_UNEXPECTED_X_FORWARDED_FOR)
app.set('trust proxy', 1);

// 1. Security & Optimizations
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// 1.5. Render / Free Cloud Keep-Active & Ping Route (Public, No Auth & No Crypto needed)
app.get(['/keepactive', '/keep-active', '/check-keepactive', '/ping'], (req, res) => {
  res.status(200).json({
    status: 'active',
    service: 'AK Music Backend',
    message: 'Server is awake and active',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: Date.now()
  });
});

// 2. Correlation Tracking & Rate Limiting
app.use(requestIdMiddleware);
app.use('/api', globalLimiter);

// 3. Authentication
app.use('/api', authMiddleware);

// 4. End-to-End Encryption & Decryption
app.use('/api', cryptoMiddleware);

// 5. API Routes
app.use('/api/v1', apiRouter);

// 6. Static public CDN
app.use('/public', express.static('./public'));

// 7. Error Handling
app.use(notFoundHandler);
app.use(errorHandler);
