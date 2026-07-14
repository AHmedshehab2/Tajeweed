const router = require('express').Router();
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

router.post('/', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { title, date, description, duration } = req.body;
  if (!title || !date) return res.status(400).json({ error: 'العنوان والتاريخ مطلوبان' });
  const khutbah = await prisma.khutbah.create({
    data: { title, date: new Date(date), description, duration },
  });
  res.status(201).json(khutbah);
}));

router.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  await prisma.khutbah.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

module.exports = router;
