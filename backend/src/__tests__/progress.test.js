const request = require('supertest');
const app = require('../server');

describe('Progress routes', () => {
  let cookie;
  let lessonId;

  beforeAll(async () => {
    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'student@example.com', password: 'test1234' });
    cookie = loginRes.headers['set-cookie'];

    const contentRes = await request(app)
      .get('/api/content')
      .set('Cookie', cookie);
    lessonId = contentRes.body.chapters[0].lessons[0].id;
  });

  describe('POST /api/progress/lessons/:id (blind cycle)', () => {
    it('cycles: not-started -> in-progress', async () => {
      const res = await request(app)
        .post(`/api/progress/lessons/${lessonId}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('in-progress');
    });

    it('cycles: in-progress -> completed', async () => {
      const res = await request(app)
        .post(`/api/progress/lessons/${lessonId}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
    });

    it('cycles: completed -> not-started', async () => {
      const res = await request(app)
        .post(`/api/progress/lessons/${lessonId}`)
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('not-started');
    });
  });

  describe('POST /api/progress/lessons/:id (guarded transitions)', () => {
    beforeAll(async () => {
      await request(app).post(`/api/progress/lessons/${lessonId}`).set('Cookie', cookie);
    });

    it('transitions to in-progress with targetState from not-started', async () => {
      const res = await request(app)
        .post(`/api/progress/lessons/${lessonId}`)
        .set('Cookie', cookie)
        .send({ state: 'in-progress' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('in-progress');
    });

    it('transitions to completed with targetState from in-progress', async () => {
      const res = await request(app)
        .post(`/api/progress/lessons/${lessonId}`)
        .set('Cookie', cookie)
        .send({ state: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('completed');
    });

    it('does not transition to completed from not-started', async () => {
      await request(app).post(`/api/progress/lessons/${lessonId}`).set('Cookie', cookie);
      const res = await request(app)
        .post(`/api/progress/lessons/${lessonId}`)
        .set('Cookie', cookie)
        .send({ state: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('not-started');
    });
  });

  describe('POST /api/progress/lessons/:id (invalid ID)', () => {
    it('returns 404 for non-existent lesson', async () => {
      const res = await request(app)
        .post('/api/progress/lessons/nonexistent-id')
        .set('Cookie', cookie);

      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/progress/me', () => {
    it('returns user progress', async () => {
      const res = await request(app)
        .get('/api/progress/me')
        .set('Cookie', cookie);

      expect(res.status).toBe(200);
      expect(res.body.lessons).toBeDefined();
      expect(res.body.activity).toBeDefined();
    });

    it('rejects without auth', async () => {
      const res = await request(app).get('/api/progress/me');
      expect(res.status).toBe(401);
    });
  });
});
