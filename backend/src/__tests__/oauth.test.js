const request = require('supertest');
const app = require('../server');

describe('OAuth routes', () => {
  describe('GET /api/auth/config', () => {
    it('returns provider status object', async () => {
      const res = await request(app).get('/api/auth/config');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('supabase');
      expect(res.body).toHaveProperty('google');
      expect(res.body).toHaveProperty('facebook');
      expect(res.body.google).toHaveProperty('enabled');
      expect(res.body.facebook).toHaveProperty('enabled');
      expect(typeof res.body.google.enabled).toBe('boolean');
      expect(typeof res.body.facebook.enabled).toBe('boolean');
    });

    it('reports Google as not configured when env vars missing', async () => {
      const res = await request(app).get('/api/auth/config');
      expect(res.body.google.enabled).toBe(false);
    });

    it('reports Facebook as not configured when env vars missing', async () => {
      const res = await request(app).get('/api/auth/config');
      expect(res.body.facebook.enabled).toBe(false);
    });
  });

  describe('GET /api/auth/google (not configured)', () => {
    it('redirects to frontend with auth_error=provider', async () => {
      const res = await request(app).get('/api/auth/google');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('auth_error=provider');
    });
  });

  describe('GET /api/auth/google/callback (not configured)', () => {
    it('redirects to frontend with auth_error=1', async () => {
      const res = await request(app).get('/api/auth/google/callback');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('auth_error=1');
    });
  });

  describe('GET /api/auth/facebook (not configured)', () => {
    it('redirects to frontend with auth_error=provider', async () => {
      const res = await request(app).get('/api/auth/facebook');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('auth_error=provider');
    });
  });

  describe('GET /api/auth/facebook/callback (not configured)', () => {
    it('redirects to frontend with auth_error=1', async () => {
      const res = await request(app).get('/api/auth/facebook/callback');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('auth_error=1');
    });
  });
});
