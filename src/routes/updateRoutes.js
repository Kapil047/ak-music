import express from 'express';
import { getUpdateManifest, getClientScript } from '../controllers/updateController.js';

export const updateRouter = express.Router();
updateRouter.get('/app/update', getUpdateManifest);
updateRouter.get('/app/scripts/inject.js', getClientScript);
