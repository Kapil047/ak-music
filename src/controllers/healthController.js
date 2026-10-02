import { cacheService } from '../services/cacheService.js';
import { innertubePool } from '../services/innertubePool.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { getYtDlpCommand } from '../services/streamService.js';
import { exec } from 'child_process';
import fs from 'fs';
import path from 'path';

// Cached diagnostics so /health responds instantly (< 2ms) without blocking Node's event loop
let cachedDiagnostics = { status: 'initializing' };

function refreshDiagnostics() {
  const diag = {};
  try {
    const localLinux = path.resolve('./bin/yt-dlp');
    diag.binExists = fs.existsSync(localLinux);
    if (diag.binExists) {
      diag.binSize = fs.statSync(localLinux).size;
    }

    const { command, argsPrefix } = getYtDlpCommand();
    diag.ytdlpTarget = `${command} ${argsPrefix.join(' ')}`.trim();

    const cmdStr = argsPrefix.length > 0 ? `"${command}" ${argsPrefix.join(' ')} --version` : `"${command}" --version`;
    exec(cmdStr, { timeout: 10000 }, (err, stdout) => {
      if (!err && stdout) {
        diag.ytdlpVersion = stdout.trim();
      } else if (err) {
        diag.ytdlpExecErr = err.message;
      }
      cachedDiagnostics = diag;
    });
  } catch (err) {
    diag.error = err.message;
    cachedDiagnostics = diag;
  }
}

// Run in background after bootstrap
setTimeout(refreshDiagnostics, 1500);

export function getHealth(req, res) {
  const memory = process.memoryUsage();

  return ApiResponse.success(res, {
    status: 'healthy',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    diagnostics: cachedDiagnostics,
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

export async function testYtDlp(req, res) {
  const videoId = req.params.id || 'NJAv_7lHUIU';
  const start = Date.now();
  const { command, argsPrefix } = getYtDlpCommand();

  const args = [
    ...argsPrefix,
    '-g',
    '-f', 'bestaudio',
    '--no-playlist',
    '--no-warnings',
    '--no-check-certificate',
    `https://www.youtube.com/watch?v=${videoId}`
  ];

  try {
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const execFileAsync = promisify(execFile);
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 20000 });
    return res.json({
      success: true,
      durationMs: Date.now() - start,
      command,
      args,
      stdout: stdout.trim(),
      stderr: stderr ? stderr.trim() : null
    });
  } catch (err) {
    return res.json({
      success: false,
      durationMs: Date.now() - start,
      command,
      args,
      message: err.message,
      stdout: err.stdout ? err.stdout.trim() : null,
      stderr: err.stderr ? err.stderr.trim() : null
    });
  }
}




