const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const prisma = require("../prisma");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { sniffBuffer, matchesDeclaredType } = require("../lib/sniff");
const { uploadBuffer, destroy } = require("../services/cloudinary.service");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } });

const ALLOWED_MIMETYPES = {
  recording: [
    "audio/mpeg",
    "audio/mp3",
    "audio/wav",
    "audio/ogg",
    "audio/aac",
    "audio/x-m4a",
    "audio/mp4",
    "audio/flac",
  ],
  pdf: ["application/pdf"],
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  attachment: [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "text/plain",
  ],
};

const SIZE_LIMITS = {
  recording: 250 * 1024 * 1024,
  pdf: 10 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  attachment: 10 * 1024 * 1024,
};

const KIND_LABEL = {
  recording: "تسجيل صوتي",
  pdf: "PDF",
  image: "صورة",
  attachment: "ملف إضافي",
};

function tryDeleteFile(fileUrl) {
  if (!fileUrl) return;
  const filePath = path.join(__dirname, "../../", fileUrl.replace(/^\//, ""));
  fs.unlink(filePath, () => {});
}

function tryDeleteCloudinary(cloudinaryId) {
  if (cloudinaryId) destroy(cloudinaryId).catch(() => {});
}

function validateUpload(req, res, next) {
  const type = req.body.type;
  const file = req.files && req.files["file"] && req.files["file"][0];
  if (!file || !type) return next();

  const allowed = ALLOWED_MIMETYPES[type];
  if (!allowed || !allowed.includes(file.mimetype)) {
    return res
      .status(400)
      .json({ error: `نوع الملف غير مسموح لـ ${KIND_LABEL[type] || type}` });
  }

  const maxSize = SIZE_LIMITS[type];
  if (maxSize && file.size > maxSize) {
    return res
      .status(400)
      .json({
        error: `حجم الملف يتجاوز الحد الأقصى (${Math.round(maxSize / 1024 / 1024)} MB)`,
      });
  }

  const sniffed = sniffBuffer(file.buffer);
  if (!sniffed || !matchesDeclaredType(sniffed, type)) {
    return res
      .status(400)
      .json({ error: "محتويات الملف لا تطابق النوع المحدد" });
  }

  const board = req.files && req.files["board"] && req.files["board"][0];
  if (board) {
    const boardAllowed = ALLOWED_MIMETYPES.image;
    if (!boardAllowed || !boardAllowed.includes(board.mimetype)) {
      return res
        .status(400)
        .json({ error: "صورة السبورة يجب أن تكون صورة (JPEG, PNG, WebP)" });
    }
    const boardSniffed = sniffBuffer(board.buffer);
    if (!boardSniffed || !matchesDeclaredType(boardSniffed, "image")) {
      return res
        .status(400)
        .json({ error: "محتويات صورة السبورة لا تطابق النوع" });
    }
  }

  next();
}

async function validateTargetId(req, res, next) {
  const { area, targetId } = req.body;
  if (!area || !targetId) return next();

  try {
    if (area === "curriculum") {
      const lesson = await prisma.lesson.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!lesson) {
        return res.status(404).json({ error: "الدرس غير موجود" });
      }
    } else if (area === "quran") {
      const quarter = await prisma.quarter.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!quarter) {
        return res.status(404).json({ error: "الربع غير موجود" });
      }
    } else if (area === "khutbah") {
      const khutbah = await prisma.khutbah.findUnique({
        where: { id: targetId },
        select: { id: true },
      });
      if (!khutbah) {
        return res.status(404).json({ error: "الخطبة غير موجودة" });
      }
    }
  } catch (_) {
    return res.status(400).json({ error: "قسم غير معروف" });
  }
  next();
}

function sanitizeFilename(original) {
  return original.replace(/[^\w.\-]/g, "_").replace(/\.[^.]+$/, "");
}

async function uploadToCloudinary(buffer, originalname) {
  const base = sanitizeFilename(originalname);
  const result = await uploadBuffer(buffer, {
    folder: "tajweed",
    public_id: `${Date.now()}-${base}`,
  });
  return { url: result.secure_url, publicId: result.public_id };
}

const uploadFields = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "board", maxCount: 1 },
]);

router.post(
  "/",
  requireAuth,
  requireAdmin,
  uploadFields,
  validateUpload,
  validateTargetId,
  asyncHandler(async (req, res) => {
    const { area, targetId, title, type } = req.body;
    const file = req.files && req.files["file"] && req.files["file"][0];
    if (!file || !area || !title)
      return res.status(400).json({ error: "بيانات ناقصة" });
    if (area !== "general" && !targetId)
      return res.status(400).json({ error: "بيانات ناقصة" });

    let fileResult, boardResult;
    try {
      fileResult = await uploadToCloudinary(file.buffer, file.originalname);
    } catch (_) {
      return res.status(500).json({ error: "فشل رفع الملف إلى السحابة" });
    }

    const boardFile = req.files && req.files["board"] && req.files["board"][0];
    if (boardFile) {
      try {
        boardResult = await uploadToCloudinary(boardFile.buffer, boardFile.originalname);
      } catch (_) {
        tryDeleteCloudinary(fileResult.publicId);
        return res.status(500).json({ error: "فشل رفع صورة السبورة إلى السحابة" });
      }
    }

    const fileUrl = fileResult.url;
    const filePublicId = fileResult.publicId;
    const boardUrl = boardResult ? boardResult.url : null;
    const boardPublicId = boardResult ? boardResult.publicId : null;

    try {
      if (area === "curriculum") {
        if (type === "recording") {
          const count = await prisma.recording.count({
            where: { lessonId: targetId },
          });
          const rec = await prisma.recording.create({
            data: {
              lessonId: targetId,
              title,
              duration: "جديد",
              version: count + 1,
              audioUrl: fileUrl,
              cloudinaryId: filePublicId,
            },
          });
          if (boardUrl) {
            await prisma.resource.create({
              data: {
                lessonId: targetId,
                title: "صورة السبورة",
                kind: "صورة",
                fileUrl: boardUrl,
                cloudinaryId: boardPublicId,
              },
            });
          }
          return res.status(201).json(rec);
        }
        const resource = await prisma.resource.create({
          data: {
            lessonId: targetId,
            title,
            kind: KIND_LABEL[type] || "ملف إضافي",
            fileUrl,
            cloudinaryId: filePublicId,
          },
        });
        return res.status(201).json(resource);
      }

      if (area === "quran") {
        if (type === "recording") {
          const count = await prisma.recording.count({
            where: { quarterId: targetId },
          });
          const rec = await prisma.recording.create({
            data: {
              quarterId: targetId,
              title,
              duration: "جديد",
              version: count + 1,
              audioUrl: fileUrl,
              cloudinaryId: filePublicId,
            },
          });
          return res.status(201).json(rec);
        }
        const resource = await prisma.resource.create({
          data: {
            quarterId: targetId,
            title,
            kind: KIND_LABEL[type] || "ملف إضافي",
            fileUrl,
            cloudinaryId: filePublicId,
          },
        });
        return res.status(201).json(resource);
      }

      if (area === "khutbah") {
        if (type === "recording") {
          const count = await prisma.recording.count({
            where: { khutbahId: targetId },
          });
          const rec = await prisma.recording.create({
            data: {
              khutbahId: targetId,
              title,
              duration: "جديد",
              version: count + 1,
              audioUrl: fileUrl,
              cloudinaryId: filePublicId,
            },
          });
          return res.status(201).json(rec);
        }
        const resource = await prisma.resource.create({
          data: {
            khutbahId: targetId,
            title,
            kind: KIND_LABEL[type] || "ملف إضافي",
            fileUrl,
            cloudinaryId: filePublicId,
          },
        });
        return res.status(201).json(resource);
      }

      if (area === "general") {
        const resource = await prisma.resource.create({
          data: { title, kind: KIND_LABEL[type] || "ملف إضافي", fileUrl, cloudinaryId: filePublicId },
        });
        return res.status(201).json(resource);
      }

      tryDeleteCloudinary(filePublicId);
      if (boardPublicId) tryDeleteCloudinary(boardPublicId);
      res.status(400).json({ error: "قسم غير معروف" });
    } catch (err) {
      tryDeleteCloudinary(filePublicId);
      if (boardPublicId) tryDeleteCloudinary(boardPublicId);
      res.status(400).json({ error: "تعذر ربط الملف بالمحتوى المختار" });
    }
  }),
);

router.delete(
  "/recordings/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    try {
      const rec = await prisma.recording.findUnique({
        where: { id: req.params.id },
      });
      if (!rec) return res.status(404).json({ error: "التسجيل غير موجود" });
      if (rec.cloudinaryId) {
        tryDeleteCloudinary(rec.cloudinaryId);
      } else {
        tryDeleteFile(rec.audioUrl);
      }
      await prisma.recording.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: "تعذر حذف التسجيل" });
    }
  }),
);

router.delete(
  "/resources/:id",
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    try {
      const resrc = await prisma.resource.findUnique({
        where: { id: req.params.id },
      });
      if (!resrc) return res.status(404).json({ error: "المورد غير موجود" });
      if (resrc.cloudinaryId) {
        tryDeleteCloudinary(resrc.cloudinaryId);
      } else {
        tryDeleteFile(resrc.fileUrl);
      }
      await prisma.resource.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: "تعذر حذف المورد" });
    }
  }),
);

module.exports = router;
