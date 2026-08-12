const request = require('supertest');
const app = require('../server');
const prisma = require('../prisma');
const { resolveOAuthUser } = require('../lib/passport');

describe('OAuth routes', () => {
  const savedGoogle = {};

  beforeAll(() => {
    savedGoogle.id = process.env.GOOGLE_CLIENT_ID;
    savedGoogle.secret = process.env.GOOGLE_CLIENT_SECRET;
  });

  afterAll(() => {
    if (savedGoogle.id !== undefined) process.env.GOOGLE_CLIENT_ID = savedGoogle.id;
    else delete process.env.GOOGLE_CLIENT_ID;
    if (savedGoogle.secret !== undefined) process.env.GOOGLE_CLIENT_SECRET = savedGoogle.secret;
    else delete process.env.GOOGLE_CLIENT_SECRET;
  });

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
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
      const res = await request(app).get('/api/auth/config');
      expect(res.body.google.enabled).toBe(false);
    });

    it('reports Facebook as not configured when env vars missing', async () => {
      const res = await request(app).get('/api/auth/config');
      expect(res.body.facebook.enabled).toBe(false);
    });
  });

  describe('GET /api/auth/google (not configured)', () => {
    beforeAll(() => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
    });

    it('redirects to frontend with auth_error=provider', async () => {
      const res = await request(app).get('/api/auth/google');
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('auth_error=provider');
    });
  });

  describe('GET /api/auth/google/callback (not configured)', () => {
    beforeAll(() => {
      delete process.env.GOOGLE_CLIENT_ID;
      delete process.env.GOOGLE_CLIENT_SECRET;
    });

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

  describe('resolveOAuthUser bootstrap promotion', () => {
    const savedBootstrap = process.env.ADMIN_BOOTSTRAP_EMAIL;
    const trackedEmails = [];

    const makeProfile = ({ id, email, verified }) => ({
      id,
      displayName: 'Test User',
      emails: [{ value: email, verified }],
      photos: [],
    });

    const uniqEmail = (tag) =>
      `oauth-${tag}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

    const setBootstrap = (email) => {
      process.env.ADMIN_BOOTSTRAP_EMAIL = email;
    };

    afterAll(async () => {
      if (savedBootstrap === undefined) delete process.env.ADMIN_BOOTSTRAP_EMAIL;
      else process.env.ADMIN_BOOTSTRAP_EMAIL = savedBootstrap;
      if (trackedEmails.length) {
        await prisma.user.deleteMany({ where: { email: { in: trackedEmails } } });
      }
    });

    const track = (email) => {
      trackedEmails.push(email);
      return email;
    };

    it('A: Google with verified bootstrap email -> ADMIN', async () => {
      const email = track(uniqEmail('a'));
      setBootstrap(email);
      const user = await resolveOAuthUser('google', makeProfile({ id: 'ga-a', email, verified: true }));
      expect(user.email).toBe(email);
      expect(user.role).toBe('ADMIN');
    });

    it('B: Facebook with verified bootstrap email -> ADMIN', async () => {
      const email = track(uniqEmail('b'));
      setBootstrap(email);
      const user = await resolveOAuthUser('facebook', makeProfile({ id: 'fb-b', email, verified: true }));
      expect(user.role).toBe('ADMIN');
    });

    it('C: Facebook with unverified bootstrap email -> STUDENT', async () => {
      const email = track(uniqEmail('c'));
      setBootstrap(email);
      const user = await resolveOAuthUser('facebook', makeProfile({ id: 'fb-c', email, verified: false }));
      expect(user.role).toBe('STUDENT');
    });

    it('D: Google with unverified bootstrap email -> STUDENT', async () => {
      const email = track(uniqEmail('d'));
      setBootstrap(email);
      const user = await resolveOAuthUser('google', makeProfile({ id: 'ga-d', email, verified: false }));
      expect(user.role).toBe('STUDENT');
    });

    it('E: existing provider-linked STUDENT with verified bootstrap email -> ADMIN', async () => {
      const email = track(uniqEmail('e'));
      setBootstrap(email);
      const created = await prisma.user.create({
        data: {
          name: 'Linked User',
          email,
          passwordHash: 'x',
          role: 'STUDENT',
          googleId: 'ga-e',
        },
      });
      const user = await resolveOAuthUser('google', makeProfile({ id: 'ga-e', email, verified: true }));
      expect(user.id).toBe(created.id);
      expect(user.role).toBe('ADMIN');
    });

    it('F: existing provider-linked STUDENT with unverified bootstrap email stays STUDENT', async () => {
      const email = track(uniqEmail('f'));
      setBootstrap(email);
      await prisma.user.create({
        data: {
          name: 'Linked User',
          email,
          passwordHash: 'x',
          role: 'STUDENT',
          facebookId: 'fb-f',
        },
      });
      const user = await resolveOAuthUser('facebook', makeProfile({ id: 'fb-f', email, verified: false }));
      expect(user.role).toBe('STUDENT');
    });
  });

  describe('OAuth callback state enforcement', () => {
    const savedGoogle = {
      id: process.env.GOOGLE_CLIENT_ID,
      secret: process.env.GOOGLE_CLIENT_SECRET,
    };
    let configuredApp;

    const stateCookie = (payload) =>
      Buffer.from(JSON.stringify(payload)).toString('base64');

    beforeAll(async () => {
      process.env.GOOGLE_CLIENT_ID = 'fake-client-id';
      process.env.GOOGLE_CLIENT_SECRET = 'fake-client-secret';
      vi.resetModules();
      configuredApp = (await import('../server')).default;
    });

    afterAll(() => {
      if (savedGoogle.id !== undefined) process.env.GOOGLE_CLIENT_ID = savedGoogle.id;
      else delete process.env.GOOGLE_CLIENT_ID;
      if (savedGoogle.secret !== undefined) process.env.GOOGLE_CLIENT_SECRET = savedGoogle.secret;
      else delete process.env.GOOGLE_CLIENT_SECRET;
    });

    it('aborts with 400 when state is missing', async () => {
      const res = await request(configuredApp).get('/api/auth/google/callback');
      expect(res.status).toBe(400);
    });

    it('aborts with 400 when state does not match the cookie', async () => {
      const res = await request(configuredApp)
        .get('/api/auth/google/callback?state=evil')
        .set('Cookie', `oauth_state=${stateCookie({ state: 'good', origin: 'http://localhost:4000' })}`);
      expect(res.status).toBe(400);
    });

    it('aborts with 400 when the state cookie is malformed', async () => {
      const res = await request(configuredApp)
        .get('/api/auth/google/callback?state=abc')
        .set('Cookie', 'oauth_state=not-json');
      expect(res.status).toBe(400);
    });

    it('proceeds when state matches the cookie (flow continues, no 400)', async () => {
      const res = await request(configuredApp)
        .get('/api/auth/google/callback?state=good')
        .set('Cookie', `oauth_state=${stateCookie({ state: 'good', origin: 'http://localhost:4000' })}`);
      expect(res.status).toBe(302);
      expect(res.headers.location).toContain('accounts.google.com');
    });
  });
});
