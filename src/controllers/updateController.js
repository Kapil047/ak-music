import fs from 'fs';
import path from 'path';
import { ApiResponse } from '../utils/apiResponse.js';

export function getUpdateManifest(req, res) {
  const updateFile = path.resolve('./public/updates/update.json');
  if (fs.existsSync(updateFile)) {
    const data = JSON.parse(fs.readFileSync(updateFile, 'utf8'));
    return ApiResponse.success(res, data);
  }
  return ApiResponse.error(res, 'Update manifest not found', 'ERR_NOT_FOUND', 404);
}

export function getClientScript(req, res) {
  const scriptFile = path.resolve('./public/scripts/inject_ytmusic.js');
  if (fs.existsSync(scriptFile)) {
    res.setHeader('Content-Type', 'application/javascript');
    return res.sendFile(scriptFile);
  }
  return ApiResponse.error(res, 'Script not found', 'ERR_NOT_FOUND', 404);
}
