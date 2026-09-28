import axios from 'axios';
import { decryptData, encryptData } from './src/utils/crypto.js';
import { env } from './src/config/env.js';

const BASE_URL = `http://localhost:${env.PORT}/api/v1`;
const API_KEY = env.API_SECRET_KEY;

async function runTestLoop() {
  console.log('🧪 Starting ak-music Comprehensive Verification Loop...\n');

  try {
    // 1. Health
    const health = await axios.get(`${BASE_URL}/health`);
    console.log('✅ 1. Health:', health.data.data.status, '| RSS:', health.data.data.memory.rssMb, 'MB');

    // 2. Suggestions (Decrypted)
    const suggRes = await axios.get(`${BASE_URL}/suggestions?q=arijit`, {
      headers: { 'x-api-key': API_KEY }
    });
    let sugg = suggRes.data;
    if (sugg.encrypted) sugg = decryptData(sugg.data.payload, sugg.data.iv, sugg.data.authTag);
    console.log('✅ 2. Suggestions:', sugg.data[0]);

    // 3. User Favorites (POST)
    console.log('\n🔥 Testing Firebase User Module...');
    const favRes = await axios.post(`${BASE_URL}/user/favorites`, {
      songId: 'NJAv_7lHUIU',
      title: 'Kesariya',
      artist: 'Arijit Singh'
    }, {
      headers: {
        'x-api-key': API_KEY,
        'Authorization': 'Bearer test_token_user_99'
      }
    });
    let favData = favRes.data;
    if (favData.encrypted) favData = decryptData(favData.data.payload, favData.data.iv, favData.data.authTag);
    console.log('✅ 3. Added Favorite:', favData.data.title);

    // 4. User Favorites (GET)
    const getFavRes = await axios.get(`${BASE_URL}/user/favorites`, {
      headers: {
        'x-api-key': API_KEY,
        'Authorization': 'Bearer test_token_user_99'
      }
    });
    let getFav = getFavRes.data;
    if (getFav.encrypted) getFav = decryptData(getFav.data.payload, getFav.data.iv, getFav.data.authTag);
    console.log('✅ 4. Retrieved Favorites Count:', getFav.data.length);

    // 5. User Playlist (POST)
    const plRes = await axios.post(`${BASE_URL}/user/playlists`, {
      name: 'My Romantic Hits 2026'
    }, {
      headers: {
        'x-api-key': API_KEY,
        'Authorization': 'Bearer test_token_user_99'
      }
    });
    let plData = plRes.data;
    if (plData.encrypted) plData = decryptData(plData.data.payload, plData.data.iv, plData.data.authTag);
    console.log('✅ 5. Created Playlist:', plData.data.name, `(${plData.data.id})`);

    console.log('\n🎉 ALL USER & MUSIC ENGINE TESTS PASSED 100%!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Test failed:', err.response ? err.response.data : err.message);
    process.exit(1);
  }
}

runTestLoop();
