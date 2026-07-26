const router = require('express').Router();
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const FIXED_DAYS = [1, 3, 4]; // Monday=1, Wednesday=3, Thursday=4
const DAY_LABELS = { 1: 'الاثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت', 7: 'الأحد' };

function serializeAnnouncementForSchedule(a) {
  return {
    id: a.id,
    title: a.title,
    body: a.body,
    scheduleChangeType: a.scheduleChangeType,
    publishedAt: a.publishedAt.toISOString().slice(0, 10),
    expiresAt: a.expiresAt ? a.expiresAt.toISOString().slice(0, 10) : null,
  };
}

// GET /api/schedule -> effective schedule for the current week
router.get('/', requireAuth, asyncHandler(async (req, res) => {
  const now = new Date();
  const [availability, announcements] = await Promise.all([
    prisma.teacherAvailability.findMany(),
    prisma.announcement.findMany({
      where: {
        isScheduleUpdate: true,
        resolvedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gte: now } }],
      },
      include: { affectedDays: true },
    }),
  ]);

  const availableDays = new Set(availability.filter(a => a.isAvailable).map(a => a.dayOfWeek));

  const days = [];
  for (let d = 1; d <= 7; d++) {
    const isFixed = FIXED_DAYS.includes(d);
    const isOptionalAvailable = availableDays.has(d);
    const dayAnnouncements = announcements.filter(a =>
      a.affectedDays.some(ad => ad.dayOfWeek === d),
    );

    let status = 'inactive';
    if (isFixed) status = 'fixed';
    else if (isOptionalAvailable) status = 'available';

    const activeCancellation = dayAnnouncements.find(a => a.scheduleChangeType === 'CANCELLED');
    if (activeCancellation) {
      status = 'cancelled';
    } else {
      const activeModification = dayAnnouncements.find(a => a.scheduleChangeType === 'MODIFIED');
      if (activeModification) status = 'modified';

      const activeAddition = dayAnnouncements.find(a => a.scheduleChangeType === 'ADDITIONAL_CLASS');
      if (activeAddition && status === 'inactive') status = 'additional';
    }

    days.push({
      dayOfWeek: d,
      label: DAY_LABELS[d],
      status,
      isFixed,
      isOptionalAvailable,
      announcements: dayAnnouncements.map(serializeAnnouncementForSchedule),
    });
  }

  res.json({ days, fixedDays: FIXED_DAYS });
}));

// GET /api/schedule/availability -> teacher availability
router.get('/availability', requireAuth, asyncHandler(async (req, res) => {
  const availability = await prisma.teacherAvailability.findMany({ orderBy: { dayOfWeek: 'asc' } });
  res.json(availability);
}));

// PUT /api/schedule/availability -> bulk upsert teacher availability
router.put('/availability', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  const entries = req.body.entries;
  if (!Array.isArray(entries)) return res.status(400).json({ error: 'بيانات غير صالحة' });

  for (const entry of entries) {
    if (typeof entry.dayOfWeek !== 'number' || entry.dayOfWeek < 1 || entry.dayOfWeek > 7) continue;
    await prisma.teacherAvailability.upsert({
      where: { dayOfWeek: entry.dayOfWeek },
      update: { isAvailable: Boolean(entry.isAvailable) },
      create: { dayOfWeek: entry.dayOfWeek, isAvailable: Boolean(entry.isAvailable) },
    });
  }

  const availability = await prisma.teacherAvailability.findMany({ orderBy: { dayOfWeek: 'asc' } });
  res.json(availability);
}));

module.exports = router;
