const router = require('express').Router();
const prisma = require('../prisma');
const { requireAuth } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

// GET /api/progress/me -> { lessons: {lessonId: status}, quarters: [quarterId...], activity: [...] }
router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  const [lessonProgress, quarterProgress, activity] = await Promise.all([
    prisma.lessonProgress.findMany({ where: { userId: req.user.id } }),
    prisma.quarterProgress.findMany({ where: { userId: req.user.id } }),
    prisma.activityEntry.findMany({ where: { userId: req.user.id }, orderBy: { date: 'desc' }, take: 5 }),
  ]);
  res.json({
    lessons: Object.fromEntries(lessonProgress.map(p => [p.lessonId, p.status.toLowerCase().replaceAll('_', '-')])),
    quarters: quarterProgress.map(p => p.quarterId),
    activity: activity.map(a => ({ id: a.refId, title: a.title, kind: a.kind, date: a.date.toISOString().slice(0, 10) })),
  });
}));

const CYCLE = { 'not-started': 'in-progress', 'in-progress': 'completed', 'completed': 'not-started' };

// POST /api/progress/lessons/:id
//   Body (optional): { state: "in-progress" | "completed" }
//   Without state: blind cycle (backward compatible)
//   With state: guarded transition — only applies if current state matches expected prerequisite
router.post('/lessons/:id', requireAuth, asyncHandler(async (req, res) => {
  const lessonId = req.params.id;
  const targetState = req.body?.state;

  const lessonExists = await prisma.lesson.findUnique({ where: { id: lessonId }, select: { id: true } });
  if (!lessonExists) return res.status(404).json({ error: 'الدرس غير موجود' });

  const existing = await prisma.lessonProgress.findUnique({ where: { userId_lessonId: { userId: req.user.id, lessonId } } });
  const current = existing ? existing.status.toLowerCase().replaceAll('_', '-') : 'not-started';

  let next;
  if (targetState && (targetState === 'in-progress' || targetState === 'completed')) {
    const GUARD = { 'in-progress': 'not-started', 'completed': 'in-progress' };
    const expected = GUARD[targetState];
    if (current !== expected) {
      return res.json({ status: current });
    }
    next = targetState;
  } else {
    next = CYCLE[current];
  }

  const status = next.toUpperCase().replaceAll('-', '_');
  const saved = await prisma.lessonProgress.upsert({
    where: { userId_lessonId: { userId: req.user.id, lessonId } },
    update: { status },
    create: { userId: req.user.id, lessonId, status },
  });
  res.json({ status: saved.status.toLowerCase().replaceAll('_', '-') });
}));

// POST /api/progress/quarters/:id -> toggles completion
router.post('/quarters/:id', requireAuth, asyncHandler(async (req, res) => {
  const quarterId = req.params.id;
  const quarterExists = await prisma.quarter.findUnique({ where: { id: quarterId }, select: { id: true } });
  if (!quarterExists) return res.status(404).json({ error: 'الربع غير موجود' });
  const existing = await prisma.quarterProgress.findUnique({ where: { userId_quarterId: { userId: req.user.id, quarterId } } });
  if (existing) {
    await prisma.quarterProgress.delete({ where: { userId_quarterId: { userId: req.user.id, quarterId } } });
    return res.json({ completed: false });
  }
  await prisma.quarterProgress.create({ data: { userId: req.user.id, quarterId } });
  res.json({ completed: true });
}));

// POST /api/progress/activity -> log a listen event, keeps last 5
router.post('/activity', requireAuth, asyncHandler(async (req, res) => {
  const { refId, title, kind } = req.body;
  if (!refId || !title) return res.status(400).json({ error: 'بيانات ناقصة' });
  await prisma.activityEntry.deleteMany({ where: { userId: req.user.id, refId } });
  await prisma.activityEntry.create({ data: { userId: req.user.id, refId, title, kind: kind || 'استماع' } });
  const surplus = await prisma.activityEntry.findMany({ where: { userId: req.user.id }, orderBy: { date: 'desc' }, skip: 5 });
  if (surplus.length) await prisma.activityEntry.deleteMany({ where: { id: { in: surplus.map(s => s.id) } } });
  res.status(204).end();
}));

module.exports = router;
module.exports.CYCLE = CYCLE;
