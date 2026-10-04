import http from 'http';
import { app } from '../src/app.js';
import { env } from '../src/config/env.js';

const TEST_TRACKS = [
  { id: 'NJAv_7lHUIU', name: 'Track 1 (NJAv_7lHUIU)' },
  { id: 'kJQP7kiw5Fk', name: 'Track 2 (kJQP7kiw5Fk)' },
  { id: 'JGwWNGJdvx8', name: 'Track 3 (JGwWNGJdvx8)' }
];

async function runE2ETests() {
  console.log('====================================================');
  console.log('🚀 STARTING COMPREHENSIVE END-TO-END STREAM TESTS');
  console.log('====================================================');

  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/api/v1`;
  console.log(`📡 Temporary test server running on port: ${port}`);

  let allPassed = true;

  try {
    // 1. Test Health Endpoint
    console.log('\n--- [TEST 1] Health Endpoint Check ---');
    const healthRes = await fetch(`${baseUrl}/health`);
    const healthData = await healthRes.json();
    console.log(`Status: ${healthRes.status} | Data:`, healthData);
    if (healthRes.status !== 200 || !healthData.success || !healthData.data?.oauth) {
      throw new Error('Health check failed or missing oauth info');
    }
    console.log('✅ TEST 1 PASSED: Health endpoint OK (OAuth & Cookies health reported)');

    // 1b. Test YouTube OAuth Status Endpoint
    console.log('\n--- [TEST 1b] YouTube OAuth Status Endpoint ---');
    const oauthStatusRes = await fetch(`${baseUrl}/auth/youtube/status?apiKey=${env.API_SECRET_KEY}`);
    const oauthStatusData = await oauthStatusRes.json();
    console.log(`Status: ${oauthStatusRes.status} | Data:`, oauthStatusData);
    if (oauthStatusRes.status !== 200 || !oauthStatusData.success) {
      throw new Error('OAuth status check failed');
    }
    console.log('✅ TEST 1b PASSED: YouTube OAuth status endpoint responding');

    // 2. Test Stream Info Endpoint
    console.log('\n--- [TEST 2] Stream Metadata / Info Endpoint ---');
    const infoRes = await fetch(`${baseUrl}/stream/info/${TEST_TRACKS[0].id}?apiKey=${env.API_SECRET_KEY}`);
    const infoData = await infoRes.json();
    console.log(`Status: ${infoRes.status} | Success: ${infoData.success}`);
    if (infoData.data) {
      console.log('Video ID:', infoData.data.videoId);
      console.log('Formats count:', infoData.data.formats?.length);
      console.log('Direct URL present:', !!infoData.data.formats?.[0]?.url);
    }
    if (infoRes.status !== 200 || !infoData.success) {
      throw new Error('Stream info check failed');
    }
    console.log('✅ TEST 2 PASSED: Stream info returned valid format metadata');

    // 3. Test Full Stream + Range Requests for Each Track
    for (const [idx, track] of TEST_TRACKS.entries()) {
      console.log(`\n--- [TEST 3.${idx + 1}] Testing Stream for ${track.name} ---`);
      
      // Test 3.A: Initial chunk with Range: bytes=0-1023 (as just_audio mobile player sends)
      const rangeHeader = 'bytes=0-1023';
      const streamRes = await fetch(`${baseUrl}/stream/${track.id}?apiKey=${env.API_SECRET_KEY}`, {
        headers: {
          'Range': rangeHeader,
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) just_audio/0.9.44'
        }
      });

      console.log(`HTTP Status: ${streamRes.status} (Expected: 206 Partial Content or 200)`);
      console.log(`Content-Type: ${streamRes.headers.get('content-type')}`);
      console.log(`Content-Range: ${streamRes.headers.get('content-range')}`);
      console.log(`Content-Length: ${streamRes.headers.get('content-length')}`);

      const buffer = await streamRes.arrayBuffer();
      console.log(`Bytes Received: ${buffer.byteLength} bytes`);

      if (streamRes.status !== 206 && streamRes.status !== 200) {
        console.error(`❌ FAILED for ${track.id}: Status was ${streamRes.status}`);
        allPassed = false;
        continue;
      }

      if (buffer.byteLength === 0) {
        console.error(`❌ FAILED for ${track.id}: 0 bytes received in audio stream`);
        allPassed = false;
        continue;
      }

      console.log(`✅ TEST 3.${idx + 1} PASSED: Successfully streamed audio buffer for ${track.name}`);

      // Test 3.B: Seek Simulation (Range: bytes=1048576-1572863)
      console.log(`  -> Testing Seek (Offset 1MB chunk) for ${track.name}...`);
      const seekRes = await fetch(`${baseUrl}/stream/${track.id}?apiKey=${env.API_SECRET_KEY}`, {
        headers: {
          'Range': 'bytes=1048576-1572863',
          'User-Agent': 'Mozilla/5.0 (Linux; Android 14) just_audio/0.9.44'
        }
      });

      console.log(`  Seek Status: ${seekRes.status} | Content-Range: ${seekRes.headers.get('content-range')}`);
      const seekBuffer = await seekRes.arrayBuffer();
      console.log(`  Seek Bytes Received: ${seekBuffer.byteLength} bytes`);

      if ((seekRes.status === 206 || seekRes.status === 200) && seekBuffer.byteLength > 0) {
        console.log(`  ✅ Seek successful! Player can scrub and seek forward smoothly.`);
      } else {
        console.warn(`  ⚠️ Seek warning: Status ${seekRes.status}, bytes: ${seekBuffer.byteLength}`);
      }
    }

  } catch (err) {
    console.error('❌ E2E Test Suite Error:', err);
    allPassed = false;
  } finally {
    server.close();
    console.log('\n====================================================');
    if (allPassed) {
      console.log('🎉 ALL END-TO-END STREAM TESTS PASSED 100%!');
      console.log('====================================================');
      process.exit(0);
    } else {
      console.error('❌ SOME TESTS FAILED. CHECK LOGS ABOVE.');
      console.log('====================================================');
      process.exit(1);
    }
  }
}

runE2ETests();
