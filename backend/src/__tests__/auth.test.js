const request = require('supertest');
const app = require('../server');

describe('Auth routes', () => {
  describe('POST /api/auth/register', () => {
    it('creates STUDENT by default, ADMIN only for tajeweed@gmail.com', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Test User', email: 'test-register@example.com', password: 'password123', role: 'ADMIN' });

      expect(res.status).toBe(201);
      expect(res.body.user.role).toBe('STUDENT');
      expect(res.body.user.email).toBe('test-register@example.com');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('rejects duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Dup', email: 'test-register@example.com', password: 'password123' });

      expect(res.status).toBe(409);
    });

    it('rejects missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'NoEmail' });

      expect(res.status).toBe(400);
    });

    it('rejects short password', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({ name: 'Short', email: 'short@example.com', password: '123' });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/auth/login', () => {
    it('returns cookie on valid login', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student@example.com', password: 'test1234' });

      expect(res.status).toBe(200);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.role).toBe('STUDENT');
      expect(res.headers['set-cookie']).toBeDefined();
    });

    it('rejects wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student@example.com', password: 'wrongpassword' });

      expect(res.status).toBe(401);
    });

    it('rejects nonexistent user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nobody@example.com', password: 'password123' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/me', () => {
    let cookie;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student@example.com', password: 'test1234' });
      cookie = res.headers['set-cookie'];
    });

    it('returns user with valid cookie', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe('student@example.com');
    });

    it('returns null user without cookie', async () => {
      const res = await request(app).get('/api/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.user).toBeNull();
    });
  });

  describe('POST /api/auth/logout', () => {
    it('clears cookie and sets Clear-Site-Data', async () => {
      const res = await request(app).post('/api/auth/logout');
      expect(res.status).toBe(200);
      expect(res.headers['clear-site-data']).toBeDefined();
    });
  });

  describe('Admin routes rejection for non-admin', () => {
    let cookie;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'student@example.com', password: 'test1234' });
      cookie = res.headers['set-cookie'];
    });

    it('rejects student from creating chapter', async () => {
      const res = await request(app)
        .post('/api/chapters')
        .set('Cookie', cookie)
        .send({ name: 'Test', order: 1 });

      expect(res.status).toBe(403);
    });
  });
});
