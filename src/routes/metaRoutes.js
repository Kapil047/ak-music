import express from 'express';
import { getAlbum, getArtist, getPlaylist, getLyrics } from '../controllers/metaController.js';
import { validate } from '../middlewares/validate.js';
import { idParamSchema } from '../validators/metaSchema.js';

export const metaRouter = express.Router();
metaRouter.get('/album/:id', validate(idParamSchema), getAlbum);
metaRouter.get('/artist/:id', validate(idParamSchema), getArtist);
metaRouter.get('/playlist/:id', validate(idParamSchema), getPlaylist);
metaRouter.get('/lyrics/:id', validate(idParamSchema), getLyrics);
