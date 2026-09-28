import express from 'express';
import { searchSongs, getSuggestions } from '../controllers/searchController.js';
import { validate } from '../middlewares/validate.js';
import { searchSchema, suggestionsSchema } from '../validators/searchSchema.js';

export const searchRouter = express.Router();
searchRouter.get('/search', validate(searchSchema), searchSongs);
searchRouter.get('/suggestions', validate(suggestionsSchema), getSuggestions);
