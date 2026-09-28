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
    return ApiResponse.success(res, info);
  } catch (err) {
    next(err);
  }
}
