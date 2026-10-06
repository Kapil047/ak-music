import { initiateDeviceFlow, pollForToken, getAuthStatus } from '../src/services/youtubeAuthService.js';
import { db, isFirebaseReady } from '../src/config/firebase.js';
import { innertubePool } from '../src/services/innertubePool.js';
import { getStreamUrl } from '../src/services/streamService.js';

async function main() {
   
  await new Promise((r) => setTimeout(r, 2000));

  // Verify Firestore backup
  if (isFirebaseReady && db) {
    try {
      const doc = await db.collection('system_config').doc('youtube_oauth').get();
      if (doc.exists) {
        console.log('✅ CLOUD FIRESTORE BACKUP CONFIRMED: system_config/youtube_oauth is stored!');
      } else {
        console.warn('⚠️ Firestore doc not found, retrying...');
      }
    } catch (e) {
      console.warn('Firestore check error:', e.message);
    }
  }

  // Initialize Innertube pool with the new tokens
  console.log('\n🔄 Initializing Innertube with TVHTML5 authenticated session...');
  await innertubePool.initialize();
  await innertubePool.syncOAuthSession();

  // Test real audio stream resolution
  console.log('\n🎵 Testing stream resolution for track NJAv_7lHUIU...');
  const testTrackId = 'NJAv_7lHUIU';
  const audioUrl = await getStreamUrl(testTrackId);
  if (audioUrl && audioUrl.startsWith('http')) { 
    console.log('Sample Stream URL (first 80 chars):', audioUrl.substring(0, 80) + '...');
  } else {
    console.log('Stream URL result:', audioUrl);
  }
 
}

main().catch((err) => {
  console.error('\n❌ OAuth Setup Error:', err.message);
  process.exit(1);
});
