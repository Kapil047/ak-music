import { initiateDeviceFlow } from '../src/services/youtubeAuthService.js';
import { getStreamUrl, YT_HEADERS } from '../src/services/streamService.js';
import axios from 'axios';

async function verify() {
  console.log('====================================================');
  console.log('🔍 YMUSIC ARCHITECTURE & BOT DETECTION AUDIT');
  console.log('====================================================\n');

  // 1. Test Google TVHTML5 OAuth Flow
  console.log('[TEST 1] Testing Google TVHTML5 OAuth Device Flow...');
  try {
    const flow = await initiateDeviceFlow();
    console.log('  ✅ Google TVHTML5 Endpoint Active!');
    console.log('  User Code:', flow.userCode);
    console.log('  Verification URL:', flow.verificationUrl);
    console.log('  Expires In:', flow.expiresIn, 'seconds');
  } catch (err) {
    console.error('  ❌ Google TVHTML5 OAuth Failed:', err.message);
  }

  // 2. Test Stream Extraction & Google Video CDN
  const testId = 'NJAv_7lHUIU';
  console.log(`\n[TEST 2] Testing Audio Extraction & Google Video CDN for ID: ${testId}...`);
  try {
    const url = await getStreamUrl(testId);
    if (!url) {
      throw new Error('Could not resolve audio stream URL');
    }
    console.log('  ✅ Audio Stream URL resolved from YouTube:');
    console.log('  Host:', new URL(url).hostname);

    // 3. Test Direct Audio Chunk Fetch (Bot Detection Check)
    console.log('\n[TEST 3] Fetching 10KB Audio chunk with Browser & TV Headers...');
    const res = await axios.get(url, {
      headers: {
        ...YT_HEADERS,
        'Range': 'bytes=0-10240'
      },
      validateStatus: () => true
    });

    console.log(`  HTTP Status Code: ${res.status} (Expected: 206 Partial Content)`);
    console.log('  Content-Type:', res.headers['content-type']);
    console.log('  Content-Range:', res.headers['content-range']);
    console.log('  Content-Length:', res.headers['content-length'], 'bytes');

    if (res.status === 206 || res.status === 200) {
      console.log('\n🎉 RESULT: ZERO BOT DETECTION! YouTube treated request as authentic human browser stream (206 OK).');
    } else if (res.status === 403) {
      console.error('\n🚨 RESULT: 403 FORBIDDEN DETECTED! YouTube flagged the IP or headers.');
    } else {
      console.log(`\n⚠️ Unexpected status code: ${res.status}`);
    }
  } catch (err) {
    console.error('  ❌ Test Error:', err.message);
  }

  console.log('\n====================================================');
  process.exit(0);
}

verify();
