import express from 'express';
import { downloadMp3, getDownloadStats } from '../controllers/downloadController.js';
import { downloadLimiter } from '../middlewares/rateLimiter.js';
import { validate } from '../middlewares/validate.js';
import { idParamSchema } from '../validators/metaSchema.js';

export const downloadRouter = express.Router();
downloadRouter.get('/download/:id', downloadLimiter, validate(idParamSchema), downloadMp3);
downloadRouter.get('/download/stats', getDownloadStats);
