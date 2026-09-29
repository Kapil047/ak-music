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

