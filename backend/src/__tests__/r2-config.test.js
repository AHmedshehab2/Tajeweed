const R2_ENV_KEYS = [
  'R2_ACCOUNT_ID',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_BUCKET_NAME',
  'R2_PUBLIC_URL',
];
const originalEnv = Object.fromEntries(R2_ENV_KEYS.map((key) => [key, process.env[key]]));

function loadStorageConfig(values = {}) {
  for (const key of R2_ENV_KEYS) delete process.env[key];
  Object.assign(process.env, values);
  vi.resetModules();
  return require('../services/r2.service');
}

afterAll(() => {
  for (const key of R2_ENV_KEYS) {
    if (originalEnv[key] === undefined) delete process.env[key];
    else process.env[key] = originalEnv[key];
  }
  vi.resetModules();
});

describe('R2 configuration validation', () => {
  it('rejects partial R2 configuration instead of falling back to local storage', () => {
    const storage = loadStorageConfig({ R2_ACCOUNT_ID: 'account' });
    expect(storage.getStorageConfigurationError()).toContain('R2_ACCESS_KEY_ID');
  });

  it('requires complete R2 configuration when durable object storage is mandatory', () => {
    const storage = loadStorageConfig();
    expect(storage.getStorageConfigurationError({ required: true }))
      .toBe('Durable R2 storage is required but not configured');
  });
});
