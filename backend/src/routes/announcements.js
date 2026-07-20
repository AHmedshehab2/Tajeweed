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

router.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  await prisma.announcement.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

module.exports = router;
