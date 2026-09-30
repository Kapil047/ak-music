import fs from 'fs';
import path from 'path';
import https from 'https';

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error('Failed to download: status ' + res.statusCode));
      }
      const file = fs.createWriteStream(dest);
      res.pipe(file);
      file.on('finish', () => {
        file.close(() => resolve(dest));
      });
    }).on('error', reject);
  });
}

async function run() {
  if (process.platform === 'win32') {
    console.log('Windows detected, skipping Linux yt-dlp binary download');
    return;
  }

  const binDir = path.resolve('./bin');
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

  const dest = path.join(binDir, 'yt-dlp');
  // Check if true standalone ELF binary (>= 35MB) is present
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 35000000) {
    console.log('Downloading yt-dlp_linux standalone ELF binary for production...');
    await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux', dest);
    console.log('Downloaded yt-dlp_linux successfully! Size:', fs.statSync(dest).size, 'bytes');
  } else {
    console.log('yt-dlp_linux already present, size:', fs.statSync(dest).size);
  }

  try {
    fs.chmodSync(dest, 0o755);
    console.log('Set 0755 executable permissions on yt-dlp');
  } catch (err) {
    console.warn('chmod warning:', err.message);
  }
}

run().catch((err) => {
  console.warn('ensure-ytdlp notice:', err.message);
});
