import express from 'express';
import { verifyUserAuth } from '../middlewares/authFirebase.js';
import {
  addFavorite,
  getFavorites,
  removeFavorite,
  createPlaylist,
  getUserPlaylists,
  addTrackToPlaylist,
  logPlaybackHistory,
  getPlaybackHistory
} from '../controllers/userController.js';

export const userRouter = express.Router();

// All user routes protected by Firebase Auth
userRouter.use('/user', verifyUserAuth);

// Favorites
userRouter.post('/user/favorites', addFavorite);
userRouter.get('/user/favorites', getFavorites);
userRouter.delete('/user/favorites/:songId', removeFavorite);

// Playlists
userRouter.post('/user/playlists', createPlaylist);
userRouter.get('/user/playlists', getUserPlaylists);
userRouter.post('/user/playlists/:playlistId/tracks', addTrackToPlaylist);

// History
userRouter.post('/user/history', logPlaybackHistory);
userRouter.get('/user/history', getPlaybackHistory);
