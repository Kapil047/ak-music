import { cacheService } from '../services/cacheService.js';
import { innertubePool } from '../services/innertubePool.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

export function getHealth(req, res) {
  const memory = process.memoryUsage();

  const diag = {};
  try {
    const localLinux = path.resolve('./bin/yt-dlp');
    diag.binExists = fs.existsSync(localLinux);
    if (diag.binExists) {
      diag.binSize = fs.statSync(localLinux).size;
      try {
        fs.chmodSync(localLinux, 0o755);
        diag.chmodOk = true;
      } catch (e) {
        diag.chmodErr = e.message;
      }
      try {
        diag.binVersion = execSync(`${localLinux} --version`, { timeout: 4000 }).toString().trim();
      } catch (e) {
        diag.binExecErr = e.message;
      }
    }

    try {
      diag.pythonVersion = execSync('python3 --version', { timeout: 3000 }).toString().trim();
    } catch (e) {
      diag.pythonErr = e.message;
    }
  } catch (err) {
    diag.error = err.message;
  }

  return ApiResponse.success(res, {
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    diagnostics: diag,
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

