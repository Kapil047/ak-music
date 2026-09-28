import express from 'express';
import { getHomeFeed, getExploreFeed, getRadioQueue } from '../controllers/exploreController.js';
import { validate } from '../middlewares/validate.js';
import { idParamSchema } from '../validators/metaSchema.js';

export const exploreRouter = express.Router();
exploreRouter.get('/home', getHomeFeed);
exploreRouter.get('/trending', getExploreFeed);
exploreRouter.get('/radio/:id', validate(idParamSchema), getRadioQueue);
