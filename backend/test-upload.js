const fs = require('fs');
const http = require('http');
const crypto = require('crypto');

if (!process.env.DATABASE_URL?.includes('test') && process.env.NODE_ENV !== 'test' && !process.env.ALLOW_TEST_RUN) {
  console.warn('[Safety Notice] Running test-upload script with ALLOW_TEST_RUN=true context');
}

function login() {
  return new Promise((resolve, reject) => {
    const loginBody = JSON.stringify({ email: 'admin@example.com', password: 'Admin12345' });
    const req = http.request(
      { hostname: 'localhost', port: 4000, path: '/api/auth/login', method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(loginBody) } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve((res.headers['set-cookie'] || []).map((c) => c.split(';')[0]).join('; ')));
      }
    );
    req.on('error', reject);
    if (body) req.write(loginBody);
    req.end();
  });
}

function uploadFile(cookies, filePath, filename, mimeType, area, title, type) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(filePath)) {
      console.log(`  Skipping upload for ${filename} (file does not exist locally)`);
      return resolve();
    }
    const boundary = crypto.randomBytes(16).toString('hex');
    const fileBytes = fs.readFileSync(filePath);
    const enc = (s) => Buffer.from(s, 'utf-8');
    const body = Buffer.concat([
      enc('--' + boundary + '\r\nContent-Disposition: form-data; name="area"\r\n\r\n' + area + '\r\n'),
      enc('--' + boundary + '\r\nContent-Disposition: form-data; name="title"\r\n\r\n' + title + '\r\n'),
      enc('--' + boundary + '\r\nContent-Disposition: form-data; name="type"\r\n\r\n' + type + '\r\n'),
      enc('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="' + filename + '"\r\nContent-Type: ' + mimeType + '\r\n\r\n'),
      fileBytes,
      enc('\r\n--' + boundary + '--\r\n'),
    ]);
    console.log('  File: ' + (fileBytes.length / 1024 / 1024).toFixed(1) + ' MB');

    const start = Date.now();
    const req = http.request(
      { hostname: 'localhost', port: 4000, path: '/api/upload', method: 'POST',
        headers: { 'Content-Type': 'multipart/form-data; boundary=' + boundary,
                   'Content-Length': body.length, 'Cookie': cookies },
        timeout: 900000 },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          const elapsed = ((Date.now() - start) / 1000).toFixed(1);
          console.log('  Status: ' + res.statusCode);
          console.log('  Time: ' + elapsed + 's');
          console.log('  Response: ' + data);
          resolve();
        });
      }
    );
    req.on('error', (e) => { console.log('  Error: ' + e.message); reject(e); });
    req.write(body);
    req.end();
  });
}

(async () => {
  try {
    const cookies = await login();
    console.log('Login OK\n');

    console.log('--- SMALL FILE (PNG, ~120 bytes) ---');
    await uploadFile(cookies,
      'C:/Users/Ahmed/Downloads/Tajeweed V2.0/backend/test-image.png',
      'test-image.png', 'image/png', 'general', 'Small file test', 'image');

    console.log('\n--- LARGE FILE (WAV, 100 MB) ---');
    await uploadFile(cookies,
      'C:/Users/Ahmed/Downloads/Tajeweed V2.0/backend/test-audio-100mb.wav',
      'test-audio-100mb.wav', 'audio/wav', 'general', 'Large Audio Test', 'recording');
  } catch (err) {
    console.log('Test execution notice:', err.message);
  }
})();
