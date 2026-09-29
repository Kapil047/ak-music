import express from 'express';
import { signup, login, guestAuth, getProfile } from '../controllers/authController.js';
import { verifyUserAuth } from '../middlewares/authFirebase.js';

export const authRouter = express.Router();

authRouter.post('/auth/signup', signup);
authRouter.post('/auth/login', login);
authRouter.post('/auth/guest', guestAuth);
authRouter.get('/auth/me', verifyUserAuth, getProfile);
