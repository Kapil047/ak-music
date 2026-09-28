import express from 'express';
import { streamAudio, getStreamInfo } from '../controllers/streamController.js';
import { validate } from '../middlewares/validate.js';
import { streamSchema } from '../validators/streamSchema.js';

export const streamRouter = express.Router();
streamRouter.get('/stream/:id', validate(streamSchema), streamAudio);
streamRouter.get('/stream/info/:id', validate(streamSchema), getStreamInfo);
