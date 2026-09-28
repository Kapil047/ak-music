import { cacheService } from '../services/cacheService.js';
import { innertubePool } from '../services/innertubePool.js';
import { ApiResponse } from '../utils/apiResponse.js';

export function getHealth(req, res) {
  const memory = process.memoryUsage();

  return ApiResponse.success(res, {
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    memory: {
      rssMb: Math.round(memory.rss / 1024 / 1024),
      heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024)
    },
    innertube: {
      isInitialized: innertubePool.isInitialized,
      activeProfiles: Array.from(innertubePool.clients.keys())
    },
    cache: cacheService.getStats()
  });
}
