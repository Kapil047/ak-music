import { logger } from '../utils/logger.js';
import { innertubePool } from './innertubePool.js';

/**
 * Core "radio" fetch — YouTube's own genre/mood/artist-style related-song
 * engine (getUpNext), not a text/name search. Shared by:
 *   - suggestionService.getHomeFeed()  → "Suggested For You" shelf
 *   - queueController.getNextSongs()   → play-time queue auto-suggest
 *
 * @param {string} seedId - the videoId to seed the radio from
 * @param {object} opts
 * @param {number} opts.limit - max songs to return
 * @param {string[]} opts.excludeIds - videoIds to skip (already in queue/feed)
 */
export async function getRadioForSong(seedId, { limit = 10, excludeIds = [] } = {}) {
  if (!seedId) return [];
  const exclude = new Set([seedId, ...excludeIds]);
  const songs = [];

  try {
    const radio = await innertubePool.executeWithRetry(async (client) => {
      return await client.music.getUpNext(seedId, true); // true = automix/radio mode
    });

    for (const node of radio?.contents || []) {
      if (songs.length >= limit) break;
      // Items can come wrapped (PlaylistPanelVideoWrapper) or bare
      // (PlaylistPanelVideo) — handle both shapes.
      const video = node?.content || node;
      const videoId = video?.video_id || video?.id;
      if (!videoId || exclude.has(videoId)) continue;

      const title = typeof video.title === 'string' ? video.title : video.title?.text || '';
      if (!title) continue;

      let artist = 'Various Artists';
      if (typeof video.author === 'string' && video.author.trim()) {
        artist = video.author.trim();
      } else if (Array.isArray(video.artists) && video.artists.length > 0) {
        artist = video.artists
          .map((a) => (typeof a === 'string' ? a : a.name || a.text || ''))
          .filter(Boolean)
          .join(', ') || 'Various Artists';
      }

      let thumbnail = null;
      if (Array.isArray(video.thumbnail) && video.thumbnail.length > 0) {
        thumbnail = video.thumbnail[video.thumbnail.length - 1]?.url || video.thumbnail[0]?.url;
      } else if (Array.isArray(video.thumbnails) && video.thumbnails.length > 0) {
        thumbnail = video.thumbnails[video.thumbnails.length - 1]?.url || video.thumbnails[0]?.url;
      }
      if (thumbnail && thumbnail.includes('googleusercontent.com')) {
        thumbnail = thumbnail.replace(/=w\d+-h\d+/, '=w800-h800').replace(/=s\d+/, '=s800');
      }

      songs.push({
        id: videoId,
        songId: videoId,
        title,
        artist,
        thumbnail,
        duration: typeof video.duration?.seconds === 'number' ? video.duration.seconds : 0,
        source: 'radio',
      });
      exclude.add(videoId);
    }
  } catch (err) {
    logger.warn({ err: err.message, seedId }, 'getRadioForSong (getUpNext) failed');
  }

  return songs.filter((s) => s.title);
}
