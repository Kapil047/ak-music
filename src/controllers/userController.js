import { db, isFirebaseReady } from '../config/firebase.js';
import { ApiResponse } from '../utils/apiResponse.js';

// In-Memory fallback store if Firebase credentials not set yet
const localStore = {
  favorites: new Map(),
  playlists: new Map(),
  history: new Map(),
  settings: new Map()
};

// ---------------- FAVORITES ----------------
export async function addFavorite(req, res, next) {
  try {
    const { uid } = req.user;
    const { songId, title, artist, thumbnail, duration } = req.body;

    if (!songId) {
      return ApiResponse.error(res, 'songId is required', 'ERR_VALIDATION', 400);
    }

    const songData = {
      songId,
      title: title || 'Unknown Title',
      artist: artist || 'Unknown Artist',
      thumbnail: thumbnail || null,
      duration: duration || null,
      addedAt: Date.now()
    };

    if (isFirebaseReady) {
      await db.collection('users').doc(uid).collection('favorites').doc(songId).set(songData);
    } else {
      if (!localStore.favorites.has(uid)) localStore.favorites.set(uid, new Map());
      localStore.favorites.get(uid).set(songId, songData);
    }

    return ApiResponse.success(res, songData, { message: 'Song added to favorites' });
  } catch (err) {
    next(err);
  }
}

export async function getFavorites(req, res, next) {
  try {
    const { uid } = req.user;
    let favorites = [];

    if (isFirebaseReady) {
      const snapshot = await db.collection('users').doc(uid).collection('favorites').orderBy('addedAt', 'desc').get();
      favorites = snapshot.docs.map((doc) => doc.data());
    } else {
      const userFavs = localStore.favorites.get(uid);
      if (userFavs) {
        favorites = Array.from(userFavs.values()).reverse();
      }
    }

    return ApiResponse.success(res, favorites);
  } catch (err) {
    next(err);
  }
}

export async function removeFavorite(req, res, next) {
  try {
    const { uid } = req.user;
    const { songId } = req.params;

    if (isFirebaseReady) {
      await db.collection('users').doc(uid).collection('favorites').doc(songId).delete();
    } else {
      const userFavs = localStore.favorites.get(uid);
      if (userFavs) userFavs.delete(songId);
    }

    return ApiResponse.success(res, { songId }, { message: 'Song removed from favorites' });
  } catch (err) {
    next(err);
  }
}

// ---------------- PLAYLISTS ----------------
export async function createPlaylist(req, res, next) {
  try {
    const { uid } = req.user;
    const { name, description } = req.body;

    if (!name || !name.trim()) {
      return ApiResponse.error(res, 'Playlist name is required', 'ERR_VALIDATION', 400);
    }

    const playlistId = 'pl_' + Date.now();
    const playlistData = {
      id: playlistId,
      name,
      description: description || '',
      tracks: [],
      createdAt: Date.now()
    };

    if (isFirebaseReady) {
      await db.collection('users').doc(uid).collection('playlists').doc(playlistId).set(playlistData);
    } else {
      if (!localStore.playlists.has(uid)) localStore.playlists.set(uid, new Map());
      localStore.playlists.get(uid).set(playlistId, playlistData);
    }

    return ApiResponse.success(res, playlistData, { message: 'Playlist created' });
  } catch (err) {
    next(err);
  }
}

export async function getUserPlaylists(req, res, next) {
  try {
    const { uid } = req.user;
    let playlists = [];

    if (isFirebaseReady) {
      const snapshot = await db.collection('users').doc(uid).collection('playlists').orderBy('createdAt', 'desc').get();
      playlists = snapshot.docs.map((doc) => doc.data());
    } else {
      const userPls = localStore.playlists.get(uid);
      if (userPls) playlists = Array.from(userPls.values()).reverse();
    }

    return ApiResponse.success(res, playlists);
  } catch (err) {
    next(err);
  }
}

export async function addTrackToPlaylist(req, res, next) {
  try {
    const { uid } = req.user;
    const { playlistId } = req.params;
    const track = req.body;

    if (!track || !track.songId) {
      return ApiResponse.error(res, 'track.songId is required', 'ERR_VALIDATION', 400);
    }

    if (isFirebaseReady) {
      const ref = db.collection('users').doc(uid).collection('playlists').doc(playlistId);
      const doc = await ref.get();
      if (!doc.exists) return ApiResponse.error(res, 'Playlist not found', 'ERR_NOT_FOUND', 404);

      const playlist = doc.data();
      playlist.tracks.push({ ...track, addedAt: Date.now() });
      await ref.update({ tracks: playlist.tracks });
      return ApiResponse.success(res, playlist);
    } else {
      const userPls = localStore.playlists.get(uid);
      const playlist = userPls ? userPls.get(playlistId) : null;
      if (!playlist) return ApiResponse.error(res, 'Playlist not found', 'ERR_NOT_FOUND', 404);

      playlist.tracks.push({ ...track, addedAt: Date.now() });
      return ApiResponse.success(res, playlist);
    }
  } catch (err) {
    next(err);
  }
}

// ---------------- HISTORY ----------------
export async function logPlaybackHistory(req, res, next) {
  try {
    const { uid } = req.user;
    const { songId, title, artist, thumbnail } = req.body;

    const historyItem = {
      songId,
      title: title || 'Unknown Title',
      artist: artist || 'Unknown Artist',
      thumbnail: thumbnail || null,
      playedAt: Date.now()
    };

    if (isFirebaseReady) {
      const ref = db.collection('users').doc(uid).collection('history').doc(songId);
      const doc = await ref.get().catch(() => ({ exists: false }));
      const playCount = doc.exists ? ((doc.data()?.playCount || 1) + 1) : 1;
      await ref.set({ ...historyItem, playCount }, { merge: true });
    } else {
      if (!localStore.history.has(uid)) localStore.history.set(uid, new Map());
      localStore.history.get(uid).set(songId, historyItem);
    }

    return ApiResponse.success(res, historyItem);
  } catch (err) {
    next(err);
  }
}

export async function clearPlaybackHistory(req, res, next) {
  try {
    const { uid } = req.user;
    if (isFirebaseReady) {
      const snapshot = await db.collection('users').doc(uid).collection('history').get();
      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    } else {
      localStore.history.delete(uid);
    }
    return ApiResponse.success(res, { cleared: true }, { message: 'History cleared' });
  } catch (err) {
    next(err);
  }
}


export async function getPlaybackHistory(req, res, next) {
  try {
    const { uid } = req.user;
    let history = [];

    if (isFirebaseReady) {
      const snapshot = await db.collection('users').doc(uid).collection('history').orderBy('playedAt', 'desc').limit(50).get();
      history = snapshot.docs.map((doc) => doc.data());
    } else {
      const userHist = localStore.history.get(uid);
      if (userHist) history = Array.from(userHist.values()).reverse().slice(0, 50);
    }

    return ApiResponse.success(res, history);
  } catch (err) {
    next(err);
  }
}

// ---------------- USER SETTINGS (CLOUD & OFFLINE SYNC) ----------------
export async function getUserSettings(req, res, next) {
  try {
    const { uid } = req.user;
    let settings = {
      seekDurationSeconds: 10,
      accentColor: 'Emerald Green',
      audioQuality: 'High Quality',
      language: 'Hindi, Punjabi, English',
      region: 'IN'
    };

    if (isFirebaseReady) {
      const doc = await db.collection('users').doc(uid).collection('settings').doc('preferences').get();
      if (doc.exists) {
        settings = { ...settings, ...doc.data() };
      }
    } else {
      const userSet = localStore.settings.get(uid);
      if (userSet) settings = { ...settings, ...userSet };
    }

    return ApiResponse.success(res, settings);
  } catch (err) {
    next(err);
  }
}

export async function saveUserSettings(req, res, next) {
  try {
    const { uid } = req.user;
    const newSettings = req.body || {};

    if (isFirebaseReady) {
      const ref = db.collection('users').doc(uid).collection('settings').doc('preferences');
      await ref.set({ ...newSettings, updatedAt: Date.now() }, { merge: true });
    } else {
      const existing = localStore.settings.get(uid) || {};
      localStore.settings.set(uid, { ...existing, ...newSettings, updatedAt: Date.now() });
    }

    return ApiResponse.success(res, newSettings, { message: 'Settings saved successfully' });
  } catch (err) {
    next(err);
  }
}

