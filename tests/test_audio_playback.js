import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getStreamUrl, YT_HEADERS } from '../src/services/streamService.js';

async function testPlayableAudio() {
  console.log('Testing and downloading real playable audio chunk from YouTube CDN...');
  const videoId = 'NJAv_7lHUIU'; // Real track
  const url = await getStreamUrl(videoId);

  if (!url) {
    throw new Error('Failed to resolve stream URL');
  }

  const tempDir = path.resolve('./temp');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const testFile = path.join(tempDir, 'test_playback.webm');

  // Request first 256KB of the actual audio stream
  const response = await axios.get(url, {
    headers: {
      ...YT_HEADERS,
      'Range': 'bytes=0-262143' // 256KB of real audio data
    },
    responseType: 'arraybuffer'
  });

  fs.writeFileSync(testFile, Buffer.from(response.data));
  const stats = fs.statSync(testFile);

  console.log('✅ File written to disk:', testFile);
  console.log('✅ Bytes received:', stats.size, 'bytes');
  console.log('✅ Content-Type:', response.headers['content-type']);
  console.log('✅ HTTP Status:', response.status);

  // Check magic bytes for WebM/Matroska header (0x1A 0x45 0xDF 0xA3)
  const header = Buffer.from(response.data.slice(0, 4));
  const isWebm = header[0] === 0x1A && header[1] === 0x45 && header[2] === 0xDF && header[3] === 0xA3;
  console.log('✅ Valid WebM / Opus Audio Container Magic Bytes:', isWebm ? 'YES (Valid Playable Stream)' : 'NO');
}

testPlayableAudio().catch(console.error);
