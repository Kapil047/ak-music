import pLimit from 'p-limit';
import { env } from '../config/env.js';

// Strict concurrency limit on CPU-heavy FFmpeg transcoding
export const downloadLimit = pLimit(env.MAX_CONCURRENT_DOWNLOADS);

export function getActiveQueueStats() {
  return {
    activeCount: downloadLimit.activeCount,
    pendingCount: downloadLimit.pendingCount,
    maxConcurrency: env.MAX_CONCURRENT_DOWNLOADS
  };
}
