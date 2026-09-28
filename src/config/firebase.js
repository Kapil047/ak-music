import admin from 'firebase-admin';
import { logger } from '../utils/logger.js';

let db = null;
let auth = null;
let isFirebaseReady = false;

try {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
      privateKey = privateKey.slice(1, -1);
    }
    privateKey = privateKey.replace(/\\n/g, '\n');

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      })
    });

    db = admin.firestore();
    auth = admin.auth();
    isFirebaseReady = true;
    logger.info('🔥 Firebase Admin SDK initialized successfully');
  } else {
    logger.warn('⚠️ Firebase credentials not configured in .env. Running in Mock/Local DB mode for user endpoints.');
  }
} catch (err) {
  logger.error({ err: err.message }, 'Failed to initialize Firebase Admin');
}

export { admin, db, auth, isFirebaseReady };
