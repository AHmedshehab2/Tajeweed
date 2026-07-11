const router = require('express').Router();
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const recSelect = { id: true, title: true, duration: true, uploadedAt: true, version: true, audioUrl: true };
const resSelect = { id: true, title: true, kind: true, uploadedAt: true, fileUrl: true };

function serializeRecording(r) { return { ...r, uploadedAt: r.uploadedAt.toISOString().slice(0, 10) }; }
function serializeResource(r) { return { ...r, uploadedAt: r.uploadedAt.toISOString().slice(0, 10) }; }
function parseObjectives(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// GET /api/content -> full tree shaped like the old defaultContent()/data object
router.get('/content', requireAuth, async (req, res) => {
  const [chapters, hizbs, khutbahs, announcements] = await Promise.all([
    prisma.chapter.findMany({
      orderBy: { order: 'asc' },
      include: { lessons: { include: { recordings: { select: recSelect }, resources: { select: resSelect } } } },
    }),
    prisma.hizb.findMany({
      orderBy: { number: 'asc' },
      include: { quarters: { include: { recordings: { select: recSelect }, resources: { select: resSelect } }, orderBy: { number: 'asc' } } },
    }),
    prisma.khutbah.findMany({ orderBy: { date: 'desc' }, include: { resources: { select: resSelect } } }),
    prisma.announcement.findMany({ orderBy: { publishedAt: 'desc' } }),
  ]);

  res.json({
    chapters: chapters.map(c => ({
      ...c,
      lessons: c.lessons.map(l => ({
        ...l,
        objectives: parseObjectives(l.objectives),
        recordings: l.recordings.map(serializeRecording),
        resources: l.resources.map(serializeResource),
      })),
    })),
    hizbs: hizbs.map(h => ({
      ...h,
      title: h.title,
      quarters: h.quarters.map(q => ({
        ...q,
        recordings: q.recordings.map(serializeRecording),
        resources: q.resources.map(serializeResource),
      })),
    })),
    khutbahs: khutbahs.map(k => ({
      ...k,
      date: k.date.toISOString().slice(0, 10),
      resources: k.resources.map(serializeResource),
    })),
    announcements: announcements.map(a => ({
      ...a,
      publishedAt: a.publishedAt.toISOString().slice(0, 10),
      expiresAt: a.expiresAt ? a.expiresAt.toISOString().slice(0, 10) : '',
    })),
  });
});

// ---- Chapters ----
router.post('/chapters', requireAuth, requireAdmin, async (req, res) => {
  const { name, order, description } = req.body;
  if (!name || !Number.isFinite(Number(order))) return res.status(400).json({ error: 'بيانات ناقصة' });
  const chapter = await prisma.chapter.create({ data: { name, order: Number(order), description } });
  res.status(201).json(chapter);
});

router.patch('/chapters/:id', requireAuth, requireAdmin, async (req, res) => {
  const { name, order, description } = req.body;
  const chapter = await prisma.chapter.update({
    where: { id: req.params.id },
    data: { name, order: order !== undefined ? Number(order) : undefined, description },
  });
  res.json(chapter);
});

router.delete('/chapters/:id', requireAuth, requireAdmin, async (req, res) => {
  await prisma.chapter.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

// ---- Lessons ----
router.post('/lessons', requireAuth, requireAdmin, async (req, res) => {
  const { chapterId, title, description } = req.body;
  if (!chapterId || !title) return res.status(400).json({ error: 'بيانات ناقصة' });
  const lesson = await prisma.lesson.create({
    data: { chapterId, title, description, objectives: JSON.stringify([]) },
  });
  res.status(201).json(lesson);
});

router.patch('/lessons/:id', requireAuth, requireAdmin, async (req, res) => {
  const { chapterId, title, description, objectives } = req.body;
  const lesson = await prisma.lesson.update({
    where: { id: req.params.id },
    data: {
      chapterId,
      title,
      description,
      objectives: objectives ? JSON.stringify(objectives) : undefined,
    },
  });
  res.json(lesson);
});

router.delete('/lessons/:id', requireAuth, requireAdmin, async (req, res) => {
  await prisma.lesson.delete({ where: { id: req.params.id } });
  res.status(204).end();
});

module.exports = router;
