const router = require('express').Router();
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { requiredString, integer } = require('../lib/validation');
const { queueMediaCleanup, drainMediaCleanupJobs } = require('../services/media-cleanup.service');

// List all hizbs with quarters
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const hizbs = await prisma.hizb.findMany({
    orderBy: { number: 'asc' },
    include: { quarters: { orderBy: { number: 'asc' } } },
  });
  res.json(hizbs);
}));

// Create hizb
router.post('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const number = integer(req.body.number, 'رقم الحزب', { min: 1, max: 60 });
  const juz = req.body.juz === undefined || req.body.juz === null || req.body.juz === ''
    ? Math.ceil(number / 2)
    : integer(req.body.juz, 'رقم الجزء', { min: 1, max: 30 });
  const title = requiredString(req.body.title, 'العنوان', { max: 160 });
  try {
    const hizb = await prisma.hizb.create({
      data: {
        number,
        juz,
        title,
        quarters: {
          create: [
            { number: 1, name: 'الربع الأول' },
            { number: 2, name: 'الربع الثاني' },
            { number: 3, name: 'الربع الثالث' },
            { number: 4, name: 'الربع الرابع' },
          ],
        },
      },
      include: { quarters: true },
    });
    res.status(201).json(hizb);
  } catch (err) {
    if (err.code === 'P2002') return res.status(409).json({ error: 'رقم الحزب موجود بالفعل' });
    throw err;
  }
}));

// Delete hizb (cascades quarters/recordings/resources/progress)
router.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const hizb = await prisma.hizb.findUnique({ where: { id: req.params.id }, include: { quarters: { include: { recordings: true, resources: true } } } });
  if (!hizb) return res.status(404).json({ error: 'السجل غير موجود' });
  const media = hizb.quarters.flatMap((quarter) => [...quarter.recordings, ...quarter.resources]);
  await prisma.$transaction(async (tx) => {
    await queueMediaCleanup(tx, media);
    await tx.hizb.delete({ where: { id: hizb.id } });
  });
  drainMediaCleanupJobs().catch(() => {});
  res.status(204).end();
}));

// ---- Quarters within a hizb ----

// Create quarter in a hizb
router.post('/:hizbId/quarters', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const name = requiredString(req.body.name, 'اسم الربع', { max: 160 });
  const hizb = await prisma.hizb.findUnique({ where: { id: req.params.hizbId }, include: { quarters: true } });
  if (!hizb) return res.status(404).json({ error: 'الحزب غير موجود' });
  const nextNumber = hizb.quarters.length ? Math.max(...hizb.quarters.map((quarter) => quarter.number)) + 1 : 1;
  const quarter = await prisma.quarter.create({
    data: { hizbId: req.params.hizbId, number: nextNumber, name },
  });
  res.status(201).json(quarter);
}));

// Delete quarter
router.delete('/:hizbId/quarters/:quarterId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const quarter = await prisma.quarter.findFirst({ where: { id: req.params.quarterId, hizbId: req.params.hizbId }, include: { recordings: true, resources: true } });
  if (!quarter) return res.status(404).json({ error: 'الربع غير موجود في الحزب المحدد' });
  await prisma.$transaction(async (tx) => {
    await queueMediaCleanup(tx, [...quarter.recordings, ...quarter.resources]);
    await tx.quarter.delete({ where: { id: quarter.id } });
  });
  drainMediaCleanupJobs().catch(() => {});
  res.status(204).end();
}));

module.exports = router;
