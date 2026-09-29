import express from 'express';
import { getUpdateManifest } from '../controllers/updateController.js';

export const updateRouter = express.Router();
updateRouter.get('/app/update', getUpdateManifest);

