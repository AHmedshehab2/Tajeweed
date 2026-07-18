const fs = require('fs');

const MAGIC = {
  mp3:  [[0x49, 0x44, 0x33], [0xFF, 0xFB], [0xFF, 0xF3], [0xFF, 0xF2]],
  aac:  [[0xFF, 0xF1], [0xFF, 0xF9]],
  wav:  [[0x52, 0x49, 0x46, 0x46]],
  ogg:  [[0x4F, 0x67, 0x67, 0x53]],
  flac: [[0x66, 0x4C, 0x61, 0x43]],
  pdf:  [[0x25, 0x50, 0x44, 0x46]],
  jpeg: [[0xFF, 0xD8, 0xFF]],
  png:  [[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]],
  // webp removed — shares RIFF prefix with wav; handled before the loop
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
  if (buf.length < 12) return false;
  if (buf[4] !== 0x66 || buf[5] !== 0x74 || buf[6] !== 0x79 || buf[7] !== 0x70) return false;
  const size = (buf[0] << 24) | (buf[1] << 16) | (buf[2] << 8) | buf[3];
  return size >= 8 && size <= 64;
}

function sniffBuffer(buf) {
  if (detectMP4(buf)) return 'mp4';
  if (bytesMatch(buf, [0x52, 0x49, 0x46, 0x46]) && buf.length >= 12 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    return 'webp';
  }
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
  mp4:  'recording',
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
  mp4:  '.m4a',
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
  const map = { recording: '.mp3', pdf: '.pdf', image: '.jpg', attachment: '.bin' };
  return map[declared] || '.bin';
}

module.exports = { sniffType, sniffBuffer, matchesDeclaredType, extensionForSniffed, extensionForDeclared };
