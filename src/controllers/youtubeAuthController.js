import {
  initiateDeviceFlow,
  pollForToken,
  getAuthStatus,
  restoreTokensFromFirestore,
  logout
} from '../services/youtubeAuthService.js';
import { ApiResponse } from '../utils/apiResponse.js';
import { logger } from '../utils/logger.js';

export async function startDeviceFlow(req, res, next) {
  try {
    const flow = await initiateDeviceFlow();

    // Start asynchronous polling in background (will capture tokens once user completes approval)
    pollForToken(flow.deviceCode, flow.interval, flow.expiresIn)
      .then(async () => {
        const { innertubePool } = await import('../services/innertubePool.js');
        await innertubePool.syncOAuthSession();
      })
      .catch((err) => {
        logger.warn({ err: err.message }, 'Background OAuth device code polling ended');
      });

    return ApiResponse.success(res, {
      userCode: flow.userCode,
      verificationUrl: flow.verificationUrl,
      expiresIn: flow.expiresIn,
      interval: flow.interval,
      instructions: `Open ${flow.verificationUrl} in your browser or phone and enter code: ${flow.userCode}`
    });
  } catch (err) {
    next(err);
  }
}

export async function getStatus(req, res, next) {
  try {
    await restoreTokensFromFirestore();
    const status = getAuthStatus();
    return ApiResponse.success(res, status);
  } catch (err) {
    next(err);
  }
}

export async function doLogout(req, res, next) {
  try {
    logout();
    return ApiResponse.success(res, { message: 'YouTube OAuth session cleared' });
  } catch (err) {
    next(err);
  }
}
