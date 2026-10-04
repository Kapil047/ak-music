# AK Music - Project Memory & Decisions

## Current Project State
- **Backend:** Node.js v22 ES Modules + Express (`d:\testing\music\ak-music`) running locally on port 3000 and deployed on Render.
- **Frontend:** Flutter (Dart) mobile app (`d:\testing\music\akmusic_flutter`).
- **Database:** Firebase Authentication + Cloud Firestore.

## Key Architectural Decisions
1. **YMusic TVHTML5 OAuth 2.0 Engine:**
   - Employs Google's official public Living Room / Android TV credentials (`861556708454-d6dlm3lh05idd8npek18k6be8ba3oc68.apps.googleusercontent.com`) via `https://www.youtube.com/o/oauth2/device/code`.
   - Mutex lock pattern (`refreshPromise`) eliminates token corruption and concurrent refresh race conditions.
   - Dual-layer encrypted token storage: local disk (`data/yt_tokens.json` with AES-256-GCM) + automated Cloud Firestore synchronization (`system_config/youtube_oauth`), ensuring zero session loss across Render container spin-downs and redeploys.

2. **Multi-Tier Audio Streaming Pipeline:**
   - **Priority 1 (Native Innertube OAuth):** Fast, direct stream resolution without spawning slow subprocesses.
   - **Priority 2 (yt-dlp with Cookies):** Auto-detects local `cookies.txt` or `YTDLP_COOKIES_TEXT` environment variable with cookie age monitoring (>60 days warning).
   - **ExoPlayer/Chrome 122 Headers:** Hardened request headers (`Sec-Fetch-Dest: audio`, `Sec-Fetch-Mode: no-cors`, `Sec-Fetch-Site: cross-site`) to guarantee zero 403 Forbidden bot blocks from YouTube CDN.
   - Full HTTP 206 `Range` byte-seeking support with immediate upstream abort on client disconnect (`res.on('close')`) to prevent server memory leaks.

3. **Security & Secrets:**
   - All secrets loaded strictly via `.env` with Zod schema validation.
   - `/cookies/` and `/data/` protected in `.gitignore`.
   - Client uses API key authentication (`x-api-key`) and optional AES-256-GCM payload encryption.

4. **Code Quality & Testing:**
   - Unit test suites passing: 8/8 tests green (`youtubeAuthService.test.js`, `core.test.js`).
   - E2E real stream verification passing with 206 Partial Content across multiple tracks.
   - Verified valid Matroska/WebM Opus magic bytes for direct playable audio chunks.
