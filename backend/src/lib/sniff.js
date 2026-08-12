const fs = require('fs');

const MAGIC = {
  ogg:  [[0x4F, 0x67, 0x67, 0x53]],
  flac: [[0x66, 0x4C, 0x61, 0x43]],
  pdf:  [[0x25, 0x50, 0x44, 0x46]],
  jpeg: [[0xFF, 0xD8, 0xFF]],
  png:  [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  gif:  [[0x47, 0x49, 0x46, 0x38]],
  zip:  [[0x50, 0x4B, 0x03, 0x04]],
  ole2: [[0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]],
};

function bytesMatch(buf, magic) {
  if (buf.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (buf[i] !== magic[i]) return false;
  }
  return true;
}

function detectMP4(buf) {
  if (buf.length < 8) return false;
  return buf[4] === 0x66 && buf[5] === 0x74 && buf[6] === 0x79 && buf[7] === 0x70;
}

function sniffBuffer(buf) {
  if (detectMP4(buf)) return 'mp4';
  if (buf.length >= 4 && bytesMatch(buf, [0x1A, 0x45, 0xDF, 0xA3])) return 'webm';
  if (buf.length >= 4 && bytesMatch(buf, [0x52, 0x49, 0x46, 0x46]) && buf.length >= 12) {
    if (buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
    if (buf[8] === 0x57 && buf[9] === 0x41 && buf[10] === 0x56 && buf[11] === 0x45) return 'wav';
  }
  if (buf.length >= 3 && buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return 'mp3';
  if (buf.length >= 2 && buf[0] === 0xFF && (buf[1] & 0xE0) === 0xE0 && (buf[1] & 0x06) === 0x02) return 'mp3';
  if (buf.length >= 2 && buf[0] === 0xFF && (buf[1] & 0xF6) === 0xF0) return 'aac';

  for (const [type, signatures] of Object.entries(MAGIC)) {
    for (const sig of signatures) {
      if (bytesMatch(buf, sig)) return type;
    }
  }
  if (buf.length > 0 && buf.every(b => b >= 0x20 || b === 0x09 || b === 0x0A || b === 0x0D || b === 0x00)) return 'txt';
  return null;
}

function sniffType(filePath) {
  try {
    return sniffBuffer(fs.readFileSync(filePath));
  } catch {
    return null;
  }
}

const DECLARED_MAP = {
  mp3:  'recording',
  aac:  'recording',
  wav:  'recording',
  ogg:  'recording',
  flac: 'recording',
  mp4:  ['recording', 'video'],
  webm: 'video',
  avi:  'video',
  mov:  'video',
  mkv:  'video',
  pdf:  ['pdf', 'attachment'],
  jpeg: 'image',
  png:  'image',
  webp: 'image',
  gif:  'image',
  zip:  'attachment',
  ole2: 'attachment',
  txt:  'attachment',
};

function matchesDeclaredType(sniffed, declared) {
  const allowed = DECLARED_MAP[sniffed];
  if (!allowed) return false;
  return allowed === declared || (Array.isArray(allowed) && allowed.includes(declared));
}

const EXT_MAP = {
  mp3:  '.mp3',
  aac:  '.aac',
  wav:  '.wav',
  ogg:  '.ogg',
  flac: '.flac',
  mp4:  '.mp4',
  webm: '.webm',
  avi:  '.avi',
  mov:  '.mov',
  mkv:  '.mkv',
  pdf:  '.pdf',
  jpeg: '.jpg',
  png:  '.png',
  webp: '.webp',
  gif:  '.gif',
  zip:  '.docx',
  ole2: '.doc',
  txt:  '.txt',
};

function extensionForSniffed(sniffed) {
  return EXT_MAP[sniffed] || '.bin';
}

function extensionForDeclared(declared) {
  const map = { recording: '.mp3', video: '.mp4', pdf: '.pdf', image: '.jpg', attachment: '.bin' };
  return map[declared] || '.bin';
}

// Serve-time allowlist: only these extensions are served inline (audio/video/image/PDF).
// Everything else (HTML, SVG, JS, office documents, unknown) is forced to
// application/octet-stream so the browser downloads it instead of rendering it.
// Content is validated by magic-byte sniffing at upload time; this whitelist
// only decides how already-uploaded files are presented to browsers.
const SAFE_SERVE_EXTENSIONS = new Set([
  '.mp3', '.aac', '.wav', '.ogg', '.flac', '.m4a',
  '.mp4', '.webm', '.avi', '.mov', '.mkv',
  '.jpg', '.jpeg', '.png', '.webp', '.gif',
  '.pdf',
]);

function isSafeServeExtension(ext) {
  return SAFE_SERVE_EXTENSIONS.has(String(ext || '').trim().toLowerCase());
}

module.exports = {
  sniffType,
  sniffBuffer,
  matchesDeclaredType,
  extensionForSniffed,
  extensionForDeclared,
  isSafeServeExtension,
};
