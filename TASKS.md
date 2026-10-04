# AK Music - Tasks & Roadmap

## Sprint History & Completed Tasks

- [x] **TASK-001**: Implement robust backend audio streaming with YouTube CDN headers & Range seek support (`src/services/streamService.js`).
- [x] **TASK-002**: Clean up unused filter chips and dead code in Flutter search & library screens (`flutter analyze` -> 0 issues).
- [x] **TASK-003**: Fix library top tab bar left-side gap with Material 3 start alignment (`library_screen.dart`).
- [x] **TASK-004**: Remove hardcoded secret keys from `env.js` fallback defaults; enforce `.env` loading.
- [x] **TASK-005**: Add unit test suites for AES-256-GCM crypto and ApiResponse utilities (`tests/core.test.js`).
- [x] **TASK-006**: Configure `player_client=android_vr,tv_embedded,visionos` extractor args and standalone ELF binary execution in `src/services/streamService.js` to bypass cloud datacenter bot detection.
- [x] **TASK-007**: Implement YMusic TVHTML5 OAuth 2.0 Device Flow with Mutex-locked auto-refresh (`src/services/youtubeAuthService.js`).
- [x] **TASK-008**: Add Cloud Firestore token persistence to prevent session loss on Render free tier container sleep/restarts.
- [x] **TASK-009**: Add yt-dlp cookie auto-detection, age warning (>60 days), and Render env auto-restore (`YTDLP_COOKIES_TEXT`).
- [x] **TASK-010**: Integrate Innertube OAuth multi-tier fallback and harden headers (`Sec-Fetch-*`).
- [x] **TASK-011**: Verify live playable audio streaming from YouTube CDN (confirmed HTTP 206, 256KB Opus chunk with valid magic bytes).

## Future / Pending Tasks
- [ ] **TASK-012**: *(On Hold)* Phase 4: Implement `LockCachingAudioSource` in Flutter app for local device audio disk caching.
- [ ] **TASK-013**: Add database-driven dynamic theme styling across Flutter app.
