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
  const binDir = path.resolve('./bin');
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

  const dest = path.join(binDir, 'yt-dlp');
  if (!fs.existsSync(dest) || fs.statSync(dest).size < 1000000) {
    console.log('Downloading yt-dlp standalone Linux binary for production...');
    await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', dest);
    console.log('Downloaded yt-dlp successfully! Size:', fs.statSync(dest).size, 'bytes');
  } else {
    console.log('yt-dlp already present, size:', fs.statSync(dest).size);
  }

  if (process.platform !== 'win32') {
    try {
      fs.chmodSync(dest, 0o755);
      console.log('Set executable permissions on yt-dlp');
    } catch (_) {}
  }
}

run().catch((err) => {
  console.warn('ensure-ytdlp notice:', err.message);
});
