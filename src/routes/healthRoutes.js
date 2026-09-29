import express from 'express';
import { getHealth } from '../controllers/healthController.js';

export const healthRouter = express.Router();
healthRouter.get('/health', getHealth);
healthRouter.get('/metrics', getHealth);
healthRouter.get('/keepactive', getHealth);
healthRouter.get('/check-keepactive', getHealth);
