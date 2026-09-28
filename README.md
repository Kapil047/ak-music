# 🎵 ak-music Engine (Backend)

High-performance, hardened, and end-to-end encrypted YouTube Music streaming, search, and content delivery backend built with Express.js and Innertube (YouTubei.js).

## 🚀 Key Features

* **🔐 AES-256-GCM End-to-End Encryption:** All inbound and outbound JSON payloads are encrypted with authentication tags.
* **🤖 Anti-Ban Multi-Client Pool:** Automatic round-robin rotation between `ANDROID`, `IOS`, `WEB`, and `TVHTML5` client profiles with exponential backoff & jitter retry.
* **🧠 Tiered In-Memory Caching:** Sub-20ms cache hits for suggestions (10m), searches (5m), streams (5.5h), and metadata (24h).
* **⚡ Zero-Video Audio Streaming:** Extracts pure audio streams with `Range` header support (`HTTP 206 Partial Content`) and backpressure management.
* **🎬 Concurrency-Capped MP3 Downloads:** `p-limit` restricted FFmpeg conversions with automatic ID3 tagging and temp file self-cleanup.
* **🛡️ Hardened Security:** Helmet security headers, rate limiting (IP & API key), UUID correlation tracking, and strict Zod request schema validation.

---

## ⚙️ Environment Configuration (`.env`)

```env
PORT=3030
NODE_ENV=development

# 🔐 AES-256-GCM Key (64 hex characters / 32 bytes)
CRYPTO_SECRET_KEY=your_64_hex_character_key_here
CRYPTO_ALGORITHM=aes-256-gcm
CRYPTO_IV_LENGTH=16
ENABLE_API_ENCRYPTION=true

# 🔑 Server Auth Key (Header: x-api-key)
API_SECRET_KEY=ak_music_super_secret_key_2026
```

---

## 📡 API Reference

Base URL: `http://localhost:3030/api/v1`

### 1. Health & Metrics (Plain Text)
* `GET /health` — Server uptime, memory, Innertube pool status.
* `GET /metrics` — Engine metrics.

### 2. Search & Auto-Suggestions (Encrypted)
* `GET /suggestions?q=arijit` — Instant auto-complete queries.
* `GET /search?q=kesariya&type=song&page=1` — Search songs, albums, artists, or playlists.

### 3. Audio Streaming (Direct Audio Chunks)
* `GET /stream/:id` — Stream direct audio with byte-range seek support.
* `GET /stream/info/:id` — Returns available audio formats, bitrates, and durations.

### 4. Explore & Radio
* `GET /home` — Curated YouTube Music explore & new releases feed.
* `GET /trending` — Top charts.
* `GET /radio/:id` — Autoplay radio queue based on a song ID.

### 5. Metadata & Lyrics
* `GET /album/:id` — Full album details and tracks.
* `GET /artist/:id` — Artist profile and top releases.
* `GET /playlist/:id` — Playlist tracklist.
* `GET /lyrics/:id` — Song lyrics (plain or synchronized).

### 6. MP3 Download
* `GET /download/:id?title=SongTitle&artist=ArtistName` — Converted 320kbps MP3 with embedded ID3 tags.
* `GET /download/stats` — Current conversion queue status.

### 7. App Update & CDN
* `GET /app/update` — Returns update manifest for Android app updates.
* `GET /app/scripts/inject.js` — Serves WebView client injection script.

---

## 🧪 Running Tests

To run the automated verification loop:
```bash
node test_loop.js
```
