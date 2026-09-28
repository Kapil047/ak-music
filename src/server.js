import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './utils/logger.js';
import { innertubePool } from './services/innertubePool.js';

async function bootstrap() {
  try {
    logger.info('Starting ak-music engine bootstrap...');

    // 1. Initialize Innertube Anti-Ban Pool
    await innertubePool.initialize();

    // 2. Start HTTP Server
    const server = app.listen(env.PORT, () => {
      logger.info(`🚀 ak-music engine live on http://localhost:${env.PORT}`);
      logger.info(`🔐 AES-256-GCM Encryption: ${env.ENABLE_API_ENCRYPTION ? 'ENABLED' : 'DISABLED'}`);
      logger.info(`🔑 API Key Auth: ENABLED`);
    });

    // 3. Graceful Shutdown
    const shutdown = (signal) => {
      logger.info(`${signal} received. Performing graceful shutdown...`);
      server.close(() => {
        logger.info('HTTP server closed successfully');
        process.exit(0);
      });

      // Force exit after 10s if dangling handles
      setTimeout(() => {
        logger.error('Forced shutdown due to timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    logger.error({ err: err.message, stack: err.stack }, 'Fatal error during engine startup');
    process.exit(1);
  }
}

bootstrap();
