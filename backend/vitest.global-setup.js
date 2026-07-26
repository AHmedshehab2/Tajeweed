const { execSync } = require('child_process');

const backendDir = __dirname;

module.exports = async function setup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set for tests');
  }

  execSync('npx prisma db push --force-reset --accept-data-loss', {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: process.env.DIRECT_URL || databaseUrl },
    stdio: 'pipe',
  });

  execSync('node prisma/seed.js', {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: databaseUrl, DIRECT_URL: process.env.DIRECT_URL || databaseUrl, SEED_STUDENT_PASSWORD: 'test1234', SEED_ADMIN_PASSWORD: 'admin1234' },
    stdio: 'pipe',
  });
};

module.exports.teardown = async function teardown() {};
