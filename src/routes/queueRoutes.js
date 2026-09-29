import express from 'express';
import { getNextSongs } from '../controllers/queueController.js';
import { optionalUserAuth } from '../middlewares/authFirebase.js';

export const queueRouter = express.Router();

queueRouter.post('/queue/next', optionalUserAuth, getNextSongs);
