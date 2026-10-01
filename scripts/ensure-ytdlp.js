import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';

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
    console.log('Windows detected, skipping Linux yt-dlp setup');
    return;
  }

  // 1. Try pip install for maximum speed on Linux/Render
  try {
    console.log('Attempting to install yt-dlp via pip for native performance...');
    execSync('python3 -m pip install -U --no-cache-dir yt-dlp --break-system-packages', {
      stdio: 'inherit',
      timeout: 30000
    });
    console.log('pip install yt-dlp finished successfully.');
  } catch (err) {
    console.log('pip install note:', err.message);
  }

  // 2. Ensure official lightweight standalone python script (zipapp ~3MB) in ./bin/yt-dlp
  const binDir = path.resolve('./bin');
  if (!fs.existsSync(binDir)) fs.mkdirSync(binDir, { recursive: true });

  const dest = path.join(binDir, 'yt-dlp');
  const exists = fs.existsSync(dest);
  const size = exists ? fs.statSync(dest).size : 0;

  // We want the ~3MB official python zipapp, not the heavy 40MB PyInstaller ELF that times out on Render
  if (!exists || size < 2000000 || size > 30000000) {
    console.log('Downloading official yt-dlp standalone python zipapp (~3MB)...');
    if (exists) {
      try { fs.unlinkSync(dest); } catch (_) {}
    }
    await downloadFile('https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp', dest);
    console.log('Downloaded yt-dlp successfully! Size:', fs.statSync(dest).size, 'bytes');
  } else {
    console.log('yt-dlp script already present, size:', size);
  }

  try {
    fs.chmodSync(dest, 0o755);
    console.log('Set 0755 executable permissions on ./bin/yt-dlp');
  } catch (err) {
    console.warn('chmod warning:', err.message);
  }
}

run().catch((err) => {
  console.warn('ensure-ytdlp notice:', err.message);
});

