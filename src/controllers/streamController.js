import { getAudioStreamInfo, pipeAudioStream } from '../services/streamService.js';
import { ApiResponse } from '../utils/apiResponse.js';

export async function streamAudio(req, res, next) {
  try {
    const { id } = req.params;
    await pipeAudioStream(id, req, res);
  } catch (err) {
    next(err);
  }
}

export async function getStreamInfo(req, res, next) {
  try {
    const { id } = req.params;
    const info = await getAudioStreamInfo(id);
    if (!info) {
      return res.status(404).json({
        success: false,
        error: {
          code: 'ERR_STREAM_INFO_UNAVAILABLE',
          message: 'Could not fetch stream info. Try again.'
        }
      });
    }
    return ApiResponse.success(res, info);
  } catch (err) {
    next(err);
  }
}

export async function prewarmStreams(req, res, next) {
  try {
    const { videoIds } = req.body || {};
    const { prewarmStreamUrls } = await import('../services/streamService.js');
    const result = await prewarmStreamUrls(videoIds);
    return ApiResponse.success(res, result);
  } catch (err) {
    next(err);
  }
}

