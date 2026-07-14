const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const backendDir = path.join(__dirname);
const testDbPath = path.join(backendDir, 'prisma/test.db');

module.exports = async function setup() {
  process.env.DATABASE_URL = `file:${testDbPath}`;
  process.env.JWT_SECRET = 'test-secret-for-testing-only';
  process.env.NODE_ENV = 'test';

  // Clean up any leftover test DB
  try { fs.unlinkSync(testDbPath); } catch (_) {}

  execSync('npx prisma migrate deploy', {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: `file:${testDbPath}` },
    stdio: 'pipe',
  });

  execSync('node prisma/seed.js', {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: `file:${testDbPath}`, SEED_STUDENT_PASSWORD: 'test1234', SEED_ADMIN_PASSWORD: 'admin1234' },
    stdio: 'pipe',
  });
};

module.exports.teardown = async function teardown() {
  const testDbPath = path.join(__dirname, 'prisma/test.db');
  try { fs.unlinkSync(testDbPath); } catch (_) {}
};
