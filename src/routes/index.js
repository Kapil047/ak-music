import express from 'express';
import { searchRouter } from './searchRoutes.js';
import { streamRouter } from './streamRoutes.js';
import { exploreRouter } from './exploreRoutes.js';
import { metaRouter } from './metaRoutes.js';
import { downloadRouter } from './downloadRoutes.js';
import { healthRouter } from './healthRoutes.js';
import { updateRouter } from './updateRoutes.js';
import { userRouter } from './userRoutes.js';
import { authRouter } from './authRoutes.js';
import { queueRouter } from './queueRoutes.js';

export const apiRouter = express.Router();

apiRouter.use('/', healthRouter);
apiRouter.use('/', updateRouter);
apiRouter.use('/', authRouter);
apiRouter.use('/', searchRouter);
apiRouter.use('/', streamRouter);
apiRouter.use('/', exploreRouter);
apiRouter.use('/', metaRouter);
apiRouter.use('/', downloadRouter);
apiRouter.use('/', userRouter);
apiRouter.use('/', queueRouter);


