const router = require("express").Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const prisma = require("../prisma");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const asyncHandler = require("../lib/asyncHandler");
const { sniffBuffer, matchesDeclaredType } = require("../lib/sniff");
const { isConfigured: cloudinaryConfigured, uploadBuffer, destroy } = require("../services/cloudinary.service");

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } });
const UPLOADS_DIR = path.join(__dirname, "../../uploads");

if (!cloudinaryConfigured) {
  try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (_) {}
}

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
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
  ],
};

const SIZE_LIMITS = {
  recording: 250 * 1024 * 1024,
  pdf: 50 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  attachment: 10 * 1024 * 1024,
};

const KIND_LABEL = {
  recording: "تسجيل صوتي",
  pdf: "PDF",
  image: "صورة",
  attachment: "ملف إضافي",
};

async function storeFile(buffer, originalname) {
  if (cloudinaryConfigured) {
    const base = originalname.replace(/[^\w.\-]/g, "_").replace(/\.[^.]+$/, "");
    const result = await uploadBuffer(buffer, {
      folder: "tajweed",
      public_id: `${Date.now()}-${base}`,
    });
    return { url: result.secure_url, cloudinaryId: result.public_id };
  }
  const filename = `${Date.now()}-${originalname.replace(/[^\w.\-]/g, "_")}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return { url: `/uploads/${filename}`, cloudinaryId: null };
}

function tryDeleteFile(fileUrl, cloudinaryId) {
  if (cloudinaryId) {
    destroy(cloudinaryId).catch(() => {});
    return;
  }
  if (!fileUrl || typeof fileUrl !== "string") return;
  if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return;
  const relative = fileUrl.replace(/^\//, "");
  if (!relative.startsWith("uploads/") || relative.includes("..")) return;
  const filePath = path.resolve(path.join(__dirname, "../../", relative));
  const uploadsRoot = path.resolve(UPLOADS_DIR);
  if (!filePath.startsWith(uploadsRoot + path.sep) && filePath !== uploadsRoot) return;
  fs.unlink(filePath, () => {});
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

function timeoutHandler(ms) {
  return (req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({ error: 'انتهت مهلة الرفع' });
      }
    }, ms);
    res.on('finish', () => clearTimeout(timer));
    next();
  };
}

const uploadFields = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "board", maxCount: 1 },
]);

router.use((req, _res, next) => {
  console.log("[upload 1] route hit", req.method, req.path);
  next();
});

router.post(
  "/",
  requireAuth,
  requireAdmin,
  timeoutHandler(120000),
  uploadFields,
  (req, _res, next) => {
    console.log("[upload 2] multer done, fields:", Object.keys(req.body || {}), "files:", Object.keys(req.files || {}));
    next();
  },
  validateUpload,
  validateTargetId,
  asyncHandler(async (req, res) => {
    res.on("finish", () => console.log("[upload DONE] status:", res.statusCode));
    console.log("[upload 3] handler start — cloudinaryConfigured:", cloudinaryConfigured);
    const { area, targetId, title, type } = req.body;
    const file = req.files && req.files["file"] && req.files["file"][0];
    if (!file || !area || !title)
      return res.status(400).json({ error: "بيانات ناقصة" });
    if (area !== "general" && !targetId)
      return res.status(400).json({ error: "بيانات ناقصة" });

    let fileResult, boardResult;
    console.log("[upload 4] storeFile start — size:", file.size, "name:", file.originalname);
    try {
      fileResult = await storeFile(file.buffer, file.originalname);
      console.log("[upload 5] storeFile done — url:", fileResult.url, "cloudinaryId:", fileResult.cloudinaryId);
    } catch (e) {
      console.log("[upload ERR] storeFile failed:", e.message);
      return res.status(500).json({ error: "فشل حفظ الملف" });
    }

    const boardFile = req.files && req.files["board"] && req.files["board"][0];
    if (boardFile) {
      try {
        boardResult = await storeFile(boardFile.buffer, boardFile.originalname);
      } catch (_) {
        tryDeleteFile(fileResult.url, fileResult.cloudinaryId);
        return res.status(500).json({ error: "فشل حفظ صورة السبورة" });
      }
    }

    const fileUrl = fileResult.url;
    const filePublicId = fileResult.cloudinaryId;
    const boardUrl = boardResult ? boardResult.url : null;
    const boardPublicId = boardResult ? boardResult.cloudinaryId : null;

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
              duration: "00:00",
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
              duration: "00:00",
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
              duration: "00:00",
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

      tryDeleteFile(fileUrl, filePublicId);
      if (boardUrl) tryDeleteFile(boardUrl, boardPublicId);
      res.status(400).json({ error: "قسم غير معروف" });
    } catch (err) {
      tryDeleteFile(fileUrl, filePublicId);
      if (boardUrl) tryDeleteFile(boardUrl, boardPublicId);
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
      tryDeleteFile(rec.audioUrl, rec.cloudinaryId);
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
      tryDeleteFile(resrc.fileUrl, resrc.cloudinaryId);
      await prisma.resource.delete({ where: { id: req.params.id } });
      res.json({ ok: true });
    } catch (err) {
      res.status(400).json({ error: "تعذر حذف المورد" });
    }
  }),
);

module.exports = router;
