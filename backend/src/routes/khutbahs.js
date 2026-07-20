const router = require('express').Router();
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { requiredString, optionalString, isoDate } = require('../lib/validation');
const { queueMediaCleanup, drainMediaCleanupJobs } = require('../services/media-cleanup.service');

router.post('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const title = requiredString(req.body.title, 'العنوان', { max: 240 });
  const date = isoDate(req.body.date, 'التاريخ');
  const description = optionalString(req.body.description, 'الوصف');
  const duration = optionalString(req.body.duration, 'المدة', { max: 20 });
  const khutbah = await prisma.khutbah.create({
    data: { title, date, description, duration },
  });
  res.status(201).json(khutbah);
}));

router.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const khutbah = await prisma.khutbah.findUnique({ where: { id: req.params.id }, include: { recordings: true, resources: true } });
  if (!khutbah) return res.status(404).json({ error: 'السجل غير موجود' });
  await prisma.$transaction(async (tx) => {
    await queueMediaCleanup(tx, [...khutbah.recordings, ...khutbah.resources]);
    await tx.khutbah.delete({ where: { id: khutbah.id } });
  });
  drainMediaCleanupJobs().catch(() => {});
  res.status(204).end();
}));

module.exports = router;
