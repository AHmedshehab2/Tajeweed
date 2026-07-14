const router = require('express').Router();
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

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
  const { number, juz, title } = req.body;
  if (!number || !title) return res.status(400).json({ error: 'الرقم والعنوان مطلوبان' });
  try {
    const hizb = await prisma.hizb.create({
      data: {
        number: Number(number),
        juz: juz ? Number(juz) : Math.ceil(Number(number) / 2),
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
  await prisma.hizb.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

// ---- Quarters within a hizb ----

// Create quarter in a hizb
router.post('/:hizbId/quarters', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: 'اسم الربع مطلوب' });
  const hizb = await prisma.hizb.findUnique({ where: { id: req.params.hizbId }, include: { quarters: true } });
  if (!hizb) return res.status(404).json({ error: 'الحزب غير موجود' });
  const nextNumber = hizb.quarters.length + 1;
  const quarter = await prisma.quarter.create({
    data: { hizbId: req.params.hizbId, number: nextNumber, name },
  });
  res.status(201).json(quarter);
}));

// Delete quarter
router.delete('/:hizbId/quarters/:quarterId', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  await prisma.quarter.delete({ where: { id: req.params.quarterId } });
  res.status(204).end();
}));

module.exports = router;
