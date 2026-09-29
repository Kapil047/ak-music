import express from 'express';
import { searchSongs, getSuggestions, recordSearchQuery, recordPlayEvent } from '../controllers/searchController.js';
import { validate } from '../middlewares/validate.js';
import { searchSchema, suggestionsSchema } from '../validators/searchSchema.js';
import { optionalUserAuth } from '../middlewares/authFirebase.js';

export const searchRouter = express.Router();
searchRouter.get('/search', validate(searchSchema), searchSongs);
searchRouter.get('/suggestions', optionalUserAuth, validate(suggestionsSchema), getSuggestions);
searchRouter.get('/search/suggestions', optionalUserAuth, validate(suggestionsSchema), getSuggestions);
searchRouter.post('/search/record', optionalUserAuth, recordSearchQuery);
searchRouter.post('/play/record', optionalUserAuth, recordPlayEvent);


