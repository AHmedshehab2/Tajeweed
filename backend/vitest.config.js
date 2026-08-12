const { defineConfig } = require('vitest/config');

const testDatabaseUrl = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/testdb';

module.exports = defineConfig({
  test: {
    globals: true,
    root: __dirname,
    include: ['src/__tests__/**/*.test.js'],
    globalSetup: './vitest.global-setup.js',
    testTimeout: 15000,
    singleThread: true,
    env: {
      DATABASE_URL: testDatabaseUrl,
      DIRECT_URL: process.env.DIRECT_URL || testDatabaseUrl,
      JWT_SECRET: 'test-secret-for-testing-only',
      NODE_ENV: 'test',
    },
  },
});
