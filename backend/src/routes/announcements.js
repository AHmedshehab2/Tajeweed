const router = require('express').Router();
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');
const { requiredString, isoDate, enumValue } = require('../lib/validation');

router.post('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const title = requiredString(req.body.title, 'العنوان', { max: 240 });
  const body = requiredString(req.body.body, 'النص', { max: 10000 });
  const expiresAt = req.body.expiresAt ? isoDate(req.body.expiresAt, 'تاريخ الانتهاء') : null;
  const priority = req.body.priority === undefined ? 'normal' : enumValue(req.body.priority, ['normal', 'important'], 'الأولوية');

  const announcement = await prisma.announcement.create({
    data: { title, body, priority, expiresAt },
  });
  res.status(201).json(announcement);
}));

router.patch('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'الإعلان غير موجود' });

  const data = {};
  if (req.body.title !== undefined) data.title = requiredString(req.body.title, 'العنوان', { max: 240 });
  if (req.body.body !== undefined) data.body = requiredString(req.body.body, 'النص', { max: 10000 });
  if (req.body.priority !== undefined) data.priority = enumValue(req.body.priority, ['normal', 'important'], 'الأولوية');
  if (req.body.expiresAt !== undefined) data.expiresAt = req.body.expiresAt ? isoDate(req.body.expiresAt, 'تاريخ الانتهاء') : null;
  if (req.body.target !== undefined) data.target = requiredString(req.body.target, 'الجهة', { max: 100 });

  const announcement = await prisma.announcement.update({
    where: { id: req.params.id },
    data,
  });
  res.json(announcement);
}));

router.patch('/:id/resolve', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: 'الإعلان غير موجود' });
  const announcement = await prisma.announcement.update({
    where: { id: req.params.id },
    data: { resolvedAt: new Date() },
  });
  res.json(announcement);
}));

router.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  await prisma.announcement.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

module.exports = router;
