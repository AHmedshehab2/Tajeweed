const { defineConfig } = require('vitest/config');

const testDatabaseUrl = 'file:./prisma/test.db';

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
      JWT_SECRET: 'test-secret-for-testing-only',
      NODE_ENV: 'test',
    },
  },
});
