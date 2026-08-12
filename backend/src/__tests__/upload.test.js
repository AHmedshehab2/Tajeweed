const request = require('supertest');
const fs = require('fs');
const path = require('path');
const app = require('../server');
const prisma = require('../prisma');

describe('Upload routes', () => {
  const UPLOADS_DIR = path.join(__dirname, '../../uploads');
  const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ID3_PREFIX = Buffer.from('ID3');
  let adminCookie;
  const createdIds = [];

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'admin1234' });
    adminCookie = res.headers['set-cookie'];
  });

  afterAll(async () => {
    if (createdIds.length) {
      const rows = await prisma.resource.findMany({ where: { id: { in: createdIds } } });
      await prisma.resource.deleteMany({ where: { id: { in: createdIds } } });
      rows.forEach((row) => {
        if (row.fileUrl && row.fileUrl.startsWith('/uploads/')) {
          fs.unlink(path.join(UPLOADS_DIR, path.basename(row.fileUrl)), () => {});
        }
      });
    }
  });

  const uploadWithBoard = (boardBuffer) =>
    request(app)
      .post('/api/upload')
      .set('Cookie', adminCookie)
      .field('area', 'general')
      .field('title', 'Board size test')
      .field('type', 'recording')
      .attach('file', Buffer.concat([ID3_PREFIX, Buffer.alloc(64)]), {
        filename: 'clip.mp3',
        contentType: 'audio/mpeg',
      })
      .attach('board', boardBuffer, { filename: 'board.png', contentType: 'image/png' });

  describe('Board image size limit', () => {
    it('rejects an oversized board (>10MB) with 400', async () => {
      const res = await uploadWithBoard(Buffer.concat([PNG_SIG, Buffer.alloc(10 * 1024 * 1024)]));
      expect(res.status).toBe(400);
      expect(res.body.error).toContain('السبورة');
      expect(res.body.error).toContain('10 MB');
    });

    it('accepts a valid small board with 201', async () => {
      const res = await uploadWithBoard(Buffer.concat([PNG_SIG, Buffer.alloc(256)]));
      expect(res.status).toBe(201);
      expect(res.body.id).toBeDefined();
      createdIds.push(res.body.id);
    });
  });

  describe('Upload serving Content-Type hardening', () => {
    const writtenFiles = [];

    afterAll(() => {
      writtenFiles.forEach((p) => {
        try { fs.unlinkSync(p); } catch (_) {}
      });
    });

    const writeUpload = (name, content) => {
      const p = path.join(UPLOADS_DIR, name);
      fs.writeFileSync(p, content);
      writtenFiles.push(p);
      return p;
    };

    const cases = [
      ['html', 'serve-test.html', '<html><script>alert(1)</script></html>', 'application/octet-stream'],
      ['svg', 'serve-test.svg', '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 'application/octet-stream'],
      ['js', 'serve-test.js', 'alert(1)', 'application/octet-stream'],
      ['mp3', 'serve-test.mp3', Buffer.concat([Buffer.from('ID3'), Buffer.alloc(8)]), 'audio/mpeg'],
      ['jpg', 'serve-test.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
      ['pdf', 'serve-test.pdf', Buffer.from('%PDF-1.4'), 'application/pdf'],
    ];

    cases.forEach(([label, name, content, expected]) => {
      it(`serves ${label} as ${expected}`, async () => {
        writeUpload(name, content);
        const res = await request(app).get(`/uploads/${name}`);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toBe(expected);
        expect(res.headers['x-content-type-options']).toBe('nosniff');
      });
    });

    it('serves unknown extensions as octet-stream', async () => {
      writeUpload('serve-test.xyz', 'data');
      const res = await request(app).get('/uploads/serve-test.xyz');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/octet-stream');
    });
  });
});
