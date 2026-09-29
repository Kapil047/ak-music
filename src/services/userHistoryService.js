import crypto from 'crypto';
import { db, isFirebaseReady } from '../config/firebase.js';
import { logger } from '../utils/logger.js';
import { cacheService } from './cacheService.js';

// In-Memory store fallback if Firebase is offline
const localSearches = new Map();
const localHistory = new Map();
const localFavorites = new Map();

class UserHistoryService {
  /**
   * Firestore se user ke history & search queries matching text
   * Path: users/{uid}/history & users/{uid}/searches
   */
  async getMatchingHistory(uid, query, limit = 5) {
    if (!uid || !query) return [];
    const normalizedQuery = query.toLowerCase().trim();

    try {
      const matches = [];

      if (isFirebaseReady) {
        // 1. Fetch recent 50 history tracks
        const historySnap = await db
          .collection('users')
          .doc(uid)
          .collection('history')
          .orderBy('playedAt', 'desc')
          .limit(50)
          .get()
          .catch(() => ({ empty: true, docs: [] }));

        if (!historySnap.empty) {
          historySnap.forEach((doc) => {
            const data = doc.data();
            const title = (data.title || '').trim();
            const artist = (data.artist || '').trim();
            const lowerTitle = title.toLowerCase();
            const lowerArtist = artist.toLowerCase();

            if (lowerTitle.startsWith(normalizedQuery) || lowerArtist.startsWith(normalizedQuery)) {
              matches.push({
                text: title,
                frequency: data.playCount || 1,
                lastPlayedAt: data.playedAt || Date.now(),
                isExactPrefix: true,
              });
            } else if (lowerTitle.includes(normalizedQuery) || lowerArtist.includes(normalizedQuery)) {
              matches.push({
                text: title,
                frequency: data.playCount || 1,
                lastPlayedAt: data.playedAt || Date.now(),
                isExactPrefix: false,
              });
            }
          });
        }

        // 2. Fetch recent searches
        const searchSnap = await db
          .collection('users')
          .doc(uid)
          .collection('searches')
          .orderBy('lastSearchedAt', 'desc')
          .limit(30)
          .get()
          .catch(() => ({ empty: true, docs: [] }));

        if (!searchSnap.empty) {
          searchSnap.forEach((doc) => {
            const data = doc.data();
            const q = (data.searchQuery || '').trim();
            const lowerQ = q.toLowerCase();

            if (lowerQ.startsWith(normalizedQuery) || lowerQ.includes(normalizedQuery)) {
              matches.push({
                text: q,
                frequency: data.count || 1,
                lastPlayedAt: data.lastSearchedAt || Date.now(),
                isExactPrefix: lowerQ.startsWith(normalizedQuery),
              });
            }
          });
        }
      } else {
        // In-memory fallback
        const userSearches = localSearches.get(uid) || [];
        for (const item of userSearches) {
          const lower = item.searchQuery.toLowerCase();
          if (lower.startsWith(normalizedQuery) || lower.includes(normalizedQuery)) {
            matches.push({
              text: item.searchQuery,
              frequency: item.count || 1,
              lastPlayedAt: item.lastSearchedAt,
              isExactPrefix: lower.startsWith(normalizedQuery),
            });
          }
        }
      }

      // Deduplicate by text (case-insensitive) & prioritize prefix + frequency
      const uniqueMap = new Map();
      for (const m of matches) {
        const key = m.text.toLowerCase().trim();
        if (!uniqueMap.has(key)) {
          uniqueMap.set(key, m);
        } else {
          const existing = uniqueMap.get(key);
          existing.frequency += m.frequency;
        }
      }

      return Array.from(uniqueMap.values())
        .sort((a, b) => {
          if (a.isExactPrefix && !b.isExactPrefix) return -1;
          if (!a.isExactPrefix && b.isExactPrefix) return 1;
          return b.frequency - a.frequency || b.lastPlayedAt - a.lastPlayedAt;
        })
        .slice(0, limit);
    } catch (err) {
      logger.error({ err: err.message, uid }, 'Firestore getMatchingHistory error');
      return [];
    }
  }

  /**
   * User ke top played songs (song objects with source: 'top')
   */
  async getTopPlayed(uid, limit = 10) {
    if (!uid) return [];
    try {
      if (isFirebaseReady) {
        // Query history ordered by playCount (or playedAt if playCount index not created yet)
        let snapshot;
        try {
          snapshot = await db
            .collection('users')
            .doc(uid)
            .collection('history')
            .orderBy('playCount', 'desc')
            .limit(limit)
            .get();
        } catch (_) {
          snapshot = await db
            .collection('users')
            .doc(uid)
            .collection('history')
            .orderBy('lastPlayedAt', 'desc')
            .limit(limit)
            .get()
            .catch(() => ({ empty: true, docs: [] }));
        }

        if (!snapshot.empty) {
          return snapshot.docs.map((doc) => {
            const d = doc.data();
            return {
              songId: doc.id,
              id: doc.id,
              title: d.title || 'Unknown Title',
              artist: d.artist || 'Unknown Artist',
              thumbnail: d.thumbnail || null,
              duration: d.duration || 0,
              playCount: d.playCount || 1,
              lastPlayedAt: d.lastPlayedAt || d.playedAt || Date.now(),
              source: 'top',
            };
          }).filter((s) => s.title);
        }
      } else {
        const userHist = localHistory.get(uid) || [];
        return [...userHist].sort((a, b) => (b.playCount || 1) - (a.playCount || 1)).slice(0, limit);
      }
    } catch (err) {
      logger.error({ err: err.message, uid }, 'Firestore getTopPlayed failed');
    }
    return [];
  }

  /**
   * User ke recent history (latest first)
   */
  async getRecentHistory(uid, limit = 10) {
    if (!uid) return [];
    try {
      if (isFirebaseReady) {
        let snapshot;
        try {
          snapshot = await db
            .collection('users')
            .doc(uid)
            .collection('history')
            .orderBy('lastPlayedAt', 'desc')
            .limit(limit)
            .get();
        } catch (_) {
          snapshot = await db
            .collection('users')
            .doc(uid)
            .collection('history')
            .orderBy('playedAt', 'desc')
            .limit(limit)
            .get()
            .catch(() => ({ empty: true, docs: [] }));
        }

        if (!snapshot.empty) {
          return snapshot.docs.map((doc) => {
            const d = doc.data();
            return {
              songId: doc.id,
              id: doc.id,
              title: d.title || 'Unknown Title',
              artist: d.artist || 'Unknown Artist',
              thumbnail: d.thumbnail || null,
              duration: d.duration || 0,
              playCount: d.playCount || 1,
              lastPlayedAt: d.lastPlayedAt || d.playedAt || Date.now(),
              source: 'recent',
            };
          }).filter((s) => s.title);
        }
      } else {
        const userHist = localHistory.get(uid) || [];
        return [...userHist].sort((a, b) => b.lastPlayedAt - a.lastPlayedAt).slice(0, limit);
      }
    } catch (err) {
      logger.error({ err: err.message, uid }, 'Firestore getRecentHistory failed');
    }
    return [];
  }

  /**
   * User ke favorites
   */
  async getFavorites(uid, limit = 10) {
    if (!uid) return [];
    try {
      if (isFirebaseReady) {
        const snapshot = await db
          .collection('users')
          .doc(uid)
          .collection('favorites')
          .orderBy('addedAt', 'desc')
          .limit(limit)
          .get()
          .catch(() => ({ empty: true, docs: [] }));

        if (!snapshot.empty) {
          return snapshot.docs.map((doc) => {
            const d = doc.data();
            return {
              songId: d.songId || doc.id,
              id: d.songId || doc.id,
              title: d.title || 'Unknown Title',
              artist: d.artist || 'Unknown Artist',
              thumbnail: d.thumbnail || null,
              duration: d.duration || 0,
              addedAt: d.addedAt || Date.now(),
              source: 'favorite',
            };
          }).filter((s) => s.title);
        }
      } else {
        const userFavs = localFavorites.get(uid) || [];
        return userFavs.slice(0, limit);
      }
    } catch (err) {
      logger.error({ err: err.message, uid }, 'Firestore getFavorites failed');
    }
    return [];
  }

  /**
   * Record song playback to Firestore history collection
   */
  async recordPlay(uid, { songId, title, artist, thumbnail, duration }) {
    if (!uid || !songId) return;
    const now = Date.now();

    try {
      if (isFirebaseReady) {
        const ref = db.collection('users').doc(uid).collection('history').doc(songId);
        const doc = await ref.get().catch(() => ({ exists: false }));

        if (doc.exists) {
          const currentCount = doc.data().playCount || 1;
          await ref.set({
            title: title || doc.data().title || 'Unknown Title',
            artist: artist || doc.data().artist || 'Unknown Artist',
            thumbnail: thumbnail || doc.data().thumbnail || null,
            duration: duration || doc.data().duration || 0,
            playCount: currentCount + 1,
            lastPlayedAt: now,
            playedAt: now, // Both field names for 100% backward index compatibility
          }, { merge: true });
        } else {
          await ref.set({
            songId,
            id: songId,
            title: title || 'Unknown Title',
            artist: artist || 'Unknown Artist',
            thumbnail: thumbnail || null,
            duration: duration || 0,
            playCount: 1,
            lastPlayedAt: now,
            playedAt: now,
            createdAt: now,
          });
        }
        logger.info({ uid, songId, title }, '🎵 Playback recorded in Firestore');
      } else {
        if (!localHistory.has(uid)) localHistory.set(uid, []);
        const list = localHistory.get(uid);
        const existing = list.find((item) => item.songId === songId);
        if (existing) {
          existing.playCount = (existing.playCount || 1) + 1;
          existing.lastPlayedAt = now;
          existing.playedAt = now;
        } else {
          list.unshift({
            songId,
            id: songId,
            title,
            artist,
            thumbnail,
            duration,
            playCount: 1,
            lastPlayedAt: now,
            playedAt: now,
          });
        }
      }

      cacheService.invalidateForUser(uid);
    } catch (err) {
      logger.error({ err: err.message, uid, songId }, 'recordPlay failed');
    }
  }

  /**
   * Record search query to Firestore subcollection
   */
  async recordSearch(uid, searchQuery) {
    if (!uid || !searchQuery || !searchQuery.trim()) return;
    const clean = searchQuery.toLowerCase().trim();
    const hash = crypto.createHash('md5').update(clean).digest('hex').slice(0, 16);
    const docId = `search_${hash}`;

    try {
      if (isFirebaseReady) {
        const ref = db.collection('users').doc(uid).collection('searches').doc(docId);
        const doc = await ref.get();
        if (doc.exists) {
          const currentCount = doc.data().count || 1;
          await ref.update({
            count: currentCount + 1,
            lastSearchedAt: Date.now(),
          });
        } else {
          await ref.set({
            searchQuery: clean,
            count: 1,
            lastSearchedAt: Date.now(),
            createdAt: Date.now(),
          });
        }
      } else {
        if (!localSearches.has(uid)) localSearches.set(uid, []);
        const list = localSearches.get(uid);
        const existing = list.find((item) => item.searchQuery === clean);
        if (existing) {
          existing.count = (existing.count || 1) + 1;
          existing.lastSearchedAt = Date.now();
        } else {
          list.push({ searchQuery: clean, count: 1, lastSearchedAt: Date.now() });
        }
      }

      cacheService.invalidateForUser(uid);
    } catch (err) {
      logger.error({ err: err.message, uid, searchQuery }, 'recordSearch failed');
    }
  }
}

export const userHistoryService = new UserHistoryService();
