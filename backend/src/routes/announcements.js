const router = require('express').Router();
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

router.post('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { title, body, expiresAt, priority } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'بيانات ناقصة' });
  const announcement = await prisma.announcement.create({
    data: { title, body, priority: priority || 'normal', expiresAt: expiresAt ? new Date(expiresAt) : null },
  });
  res.status(201).json(announcement);
}));

router.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  await prisma.announcement.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

module.exports = router;
