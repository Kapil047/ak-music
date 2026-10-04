# AK Music - System Architecture

## Overview
AK Music is a hardened, encrypted YouTube Music streaming and content backend engine with a Flutter mobile client, re-architected to mirror **YMusic's TVHTML5 OAuth 2.0 and direct CDN streaming engine**.

```
+-------------------------------------------------------------+
|                  Flutter Mobile Client                      |
| (Riverpod, JustAudio, CachedNetworkImage, Custom UI System) |
+------------------------------+------------------------------+
                               |
                   HTTPS Encrypted JSON / Stream
                               |
                               v
+-------------------------------------------------------------+
|                 Node.js / Express Backend                   |
|                                                             |
|  +--------------------+  +-------------------------------+  |
|  | Security & Auth    |  | Stream Service                |  |
|  | - Helmet, CORS     |  | - Priority 1: Innertube OAuth |  |
|  | - Rate Limiter     |  | - Priority 2: yt-dlp Cookies  |  |
|  | - AES-256-GCM      |  | - Chrome 122 + Sec-Fetch Hdr  |  |
|  | - Firebase UserAuth|  | - HTTP Range (206) Pipe & Seek|  |
|  +--------------------+  +-------------------------------+  |
|                                                             |
|  +--------------------+  +-------------------------------+  |
|  | YMusic OAuth Engine|  | Persistence & Sync            |  |
|  | - TVHTML5 Device   |  | - Firebase Admin SDK          |  |
|  | - Mutex Lock Auto- |  | - Cloud Firestore Session Sync|  |
|  |   Refresh Engine   |  |   (Survives Render spin-downs)|  |
|  | - AES Token Storage|  | - NodeCache In-Memory TTLs    |  |
|  +--------------------+  +-------------------------------+  |
+-------------------------------------------------------------+
```

## Directory Structure
- `src/config/`: Environment validation (`env.js` with `zod`), `oauthConfig.js` (Google TVHTML5 credentials & endpoints), and `constants.js`.
- `src/controllers/`: Route handlers (`streamController`, `searchController`, `healthController`, `youtubeAuthController`).
- `src/middlewares/`: Security, authentication (`auth.js`), rate limiting, request ID, encryption envelope.
- `src/routes/`: Express route definitions (`authRoutes`, `streamRoutes`, `searchRoutes`, etc.).
- `src/services/`: Core logic:
  - `youtubeAuthService.js`: TVHTML5 OAuth device code generation, background polling, Mutex-locked auto-refresh, and Firestore cloud persistence.
  - `streamService.js`: Multi-tier fallback streaming (Innertube OAuth ➡️ yt-dlp with cookies), HTTP 206 range piping, memory leak cleanup on client disconnect, and ETag caching.
  - `innertubePool.js`: Anti-ban multi-client rotation with dynamic TVHTML5 OAuth session injection.
  - `audioService.js`: Concurrency-controlled MP3 extraction with ID3 tagging.
- `src/utils/`: Standardized `ApiResponse` envelope, AES-256-GCM `crypto.js`, Pino `logger.js`.
- `tests/`: Automated unit and E2E streaming test suites.
