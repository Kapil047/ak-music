import { cacheService } from '../services/cacheService.js';
import { innertubePool } from '../services/innertubePool.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { getYtDlpCommand } from '../services/streamService.js';
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
    }

    try {
      diag.pythonVersion = execSync('python3 --version', { timeout: 3000 }).toString().trim();
    } catch (e) {
      diag.pythonErr = e.message;
    }

    const { command, argsPrefix } = getYtDlpCommand();
    diag.ytdlpTarget = `${command} ${argsPrefix.join(' ')}`.trim();

    try {
      const cmdStr = argsPrefix.length > 0 ? `"${command}" ${argsPrefix.join(' ')} --version` : `"${command}" --version`;
      diag.ytdlpVersion = execSync(cmdStr, { timeout: 8000 }).toString().trim();
    } catch (e) {
      diag.ytdlpExecErr = e.message;
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


