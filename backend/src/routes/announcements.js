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
  const isScheduleUpdate = Boolean(req.body.isScheduleUpdate);
  const scheduleChangeType = req.body.scheduleChangeType || null;
  const affectedDays = Array.isArray(req.body.affectedDays) ? req.body.affectedDays : [];

  if (isScheduleUpdate && !scheduleChangeType) {
    return res.status(400).json({ error: 'نوع التغيير مطلوب لتحديث الموعد' });
  }
  if (scheduleChangeType && !['CANCELLED', 'ADDITIONAL_CLASS', 'MODIFIED'].includes(scheduleChangeType)) {
    return res.status(400).json({ error: 'نوع التغيير غير صالح' });
  }
  for (const d of affectedDays) {
    if (!Number.isInteger(d) || d < 1 || d > 7) {
      return res.status(400).json({ error: 'affectedDays يجب أن تكون أرقاماً من 1 إلى 7' });
    }
  }

  const announcement = await prisma.announcement.create({
    data: {
      title,
      body,
      priority,
      expiresAt,
      isScheduleUpdate,
      scheduleChangeType: isScheduleUpdate ? scheduleChangeType : null,
      affectedDays: isScheduleUpdate && affectedDays.length
        ? { create: affectedDays.map(d => ({ dayOfWeek: d })) }
        : undefined,
    },
    include: { affectedDays: true },
  });
  res.status(201).json(announcement);
}));

router.patch('/:id/resolve', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const existing = await prisma.announcement.findUnique({ where: { id: req.params.id }, select: { id: true } });
  if (!existing) return res.status(404).json({ error: 'الإعلان غير موجود' });
  const announcement = await prisma.announcement.update({
    where: { id: req.params.id },
    data: { resolvedAt: new Date() },
    include: { affectedDays: true },
  });
  res.json(announcement);
}));

router.delete('/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  await prisma.announcement.delete({ where: { id: req.params.id } });
  res.status(204).end();
}));

module.exports = router;
