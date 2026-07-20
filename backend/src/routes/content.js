const router = require("express").Router();
const prisma = require("../prisma");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { requiredString, optionalString, integer, stringArray } = require('../lib/validation');
const { queueMediaCleanup, drainMediaCleanupJobs } = require('../services/media-cleanup.service');

const recSelect = {
  id: true,
  title: true,
  duration: true,
  uploadedAt: true,
  version: true,
  audioUrl: true,
  cloudinaryId: true,
};
const resSelect = {
  id: true,
  title: true,
  kind: true,
  uploadedAt: true,
  fileUrl: true,
  cloudinaryId: true,
};

function serializeRecording(r) {
  return { ...r, uploadedAt: r.uploadedAt.toISOString().slice(0, 10) };
}
function serializeResource(r) {
  return { ...r, uploadedAt: r.uploadedAt.toISOString().slice(0, 10) };
}
function parseObjectives(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// GET /api/content -> full tree shaped like the old defaultContent()/data object
router.get(
  "/content",
  requireAuth,
  asyncHandler(async (req, res) => {
    const [chapters, hizbs, khutbahs, announcements, tajweedResources] =
      await Promise.all([
        prisma.chapter.findMany({
          orderBy: { order: "asc" },
          include: {
            lessons: {
              include: {
                recordings: { select: recSelect },
                resources: { select: resSelect },
              },
            },
          },
        }),
        prisma.hizb.findMany({
          orderBy: { number: "asc" },
          include: {
            quarters: {
              include: {
                recordings: { select: recSelect },
                resources: { select: resSelect },
              },
              orderBy: { number: "asc" },
            },
          },
        }),
        prisma.khutbah.findMany({
          orderBy: { date: "desc" },
          include: {
            resources: { select: resSelect },
            recordings: { select: recSelect, orderBy: { uploadedAt: "desc" } },
          },
        }),
        prisma.announcement.findMany({
          where: req.user.role === 'ADMIN' ? undefined : {
            OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
          },
          orderBy: { publishedAt: "desc" },
        }),
        prisma.resource.findMany({
          where: { lessonId: null, quarterId: null, khutbahId: null },
          orderBy: { uploadedAt: "desc" },
          select: resSelect,
        }),
      ]);

    res.json({
      chapters: chapters.map((c) => ({
        ...c,
        lessons: c.lessons.map((l) => ({
          ...l,
          objectives: parseObjectives(l.objectives),
          recordings: l.recordings.map(serializeRecording),
          resources: l.resources.map(serializeResource),
        })),
      })),
      hizbs: hizbs.map((h) => ({
        ...h,
        title: h.title,
        quarters: h.quarters.map((q) => ({
          ...q,
          recordings: q.recordings.map(serializeRecording),
          resources: q.resources.map(serializeResource),
        })),
      })),
      khutbahs: khutbahs.map((k) => ({
        ...k,
        date: k.date.toISOString().slice(0, 10),
        recordings: k.recordings.map(serializeRecording),
        resources: k.resources.map(serializeResource),
      })),
      announcements: announcements.map((a) => ({
        ...a,
        publishedAt: a.publishedAt.toISOString().slice(0, 10),
        expiresAt: a.expiresAt ? a.expiresAt.toISOString().slice(0, 10) : "",
      })),
      resources: tajweedResources.map(serializeResource),
    });
  }),
);

// ---- Chapters ----
router.post(
  "/chapters",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const name = requiredString(req.body.name, 'الاسم', { max: 160 });
    const order = integer(req.body.order, 'الترتيب', { min: 1, max: 10000 });
    const description = optionalString(req.body.description, 'الوصف');
    const chapter = await prisma.chapter.create({
      data: { name, order, description },
    });
    res.status(201).json(chapter);
  }),
);

router.patch(
  "/chapters/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { name, order, description } = req.body;
    if (name !== undefined) requiredString(name, 'الاسم', { max: 160 });
    if (order !== undefined) integer(order, 'الترتيب', { min: 1, max: 10000 });
    if (description !== undefined) optionalString(description, 'الوصف');
    const chapter = await prisma.chapter.update({
      where: { id: req.params.id },
      data: {
        name: name === undefined ? undefined : name.trim(),
        order: order !== undefined ? Number(order) : undefined,
        description: description === undefined ? undefined : (description?.trim() || null),
      },
    });
    res.json(chapter);
  }),
);

router.delete(
  "/chapters/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const chapter = await prisma.chapter.findUnique({ where: { id: req.params.id }, include: { lessons: { include: { recordings: true, resources: true } } } });
    if (!chapter) return res.status(404).json({ error: 'السجل غير موجود' });
    const media = chapter.lessons.flatMap((lesson) => [...lesson.recordings, ...lesson.resources]);
    await prisma.$transaction(async (tx) => {
      await queueMediaCleanup(tx, media);
      await tx.chapter.delete({ where: { id: chapter.id } });
    });
    drainMediaCleanupJobs().catch(() => {});
    res.status(204).end();
  }),
);

// ---- Lessons ----
router.post(
  "/lessons",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { chapterId } = req.body;
    const title = requiredString(req.body.title, 'العنوان', { max: 240 });
    const description = optionalString(req.body.description, 'الوصف');
    const objectives = stringArray(req.body.objectives || [], 'الأهداف');
    if (typeof chapterId !== 'string' || !chapterId) return res.status(400).json({ error: "بيانات ناقصة" });
    const chapterExists = await prisma.chapter.findUnique({
      where: { id: chapterId },
      select: { id: true },
    });
    if (!chapterExists)
      return res.status(404).json({ error: "الباب غير موجود" });
    const lesson = await prisma.lesson.create({
      data: {
        chapterId,
        title,
        description,
        objectives: JSON.stringify(objectives),
      },
    });
    res.status(201).json(lesson);
  }),
);

router.patch(
  "/lessons/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { chapterId, title, description, objectives } = req.body;
    if (chapterId !== undefined && (typeof chapterId !== 'string' || !chapterId)) return res.status(400).json({ error: 'بيانات غير صالحة' });
    if (title !== undefined) requiredString(title, 'العنوان', { max: 240 });
    if (description !== undefined) optionalString(description, 'الوصف');
    if (objectives !== undefined) stringArray(objectives, 'الأهداف');
    const lesson = await prisma.lesson.update({
      where: { id: req.params.id },
      data: {
        chapterId,
        title: title === undefined ? undefined : title.trim(),
        description: description === undefined ? undefined : (description?.trim() || null),
        objectives: objectives === undefined ? undefined : JSON.stringify(objectives),
      },
    });
    res.json(lesson);
  }),
);

router.delete(
  "/lessons/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const lesson = await prisma.lesson.findUnique({ where: { id: req.params.id }, include: { recordings: true, resources: true } });
    if (!lesson) return res.status(404).json({ error: 'السجل غير موجود' });
    await prisma.$transaction(async (tx) => {
      await queueMediaCleanup(tx, [...lesson.recordings, ...lesson.resources]);
      await tx.lesson.delete({ where: { id: lesson.id } });
    });
    drainMediaCleanupJobs().catch(() => {});
    res.status(204).end();
  }),
);

module.exports = router;
module.exports.parseObjectives = parseObjectives;
module.exports.serializeRecording = serializeRecording;
module.exports.serializeResource = serializeResource;
