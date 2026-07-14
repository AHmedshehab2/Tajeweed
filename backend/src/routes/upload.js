const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const asyncHandler = require('../lib/asyncHandler');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.\-]/g, '_')}`),
});

// Mimetype whitelist per upload type
const ALLOWED_MIMETYPES = {
  recording:  ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/aac', 'audio/x-m4a', 'audio/mp4', 'audio/flac'],
  pdf:        ['application/pdf'],
  image:      ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  attachment: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
};

// Per-type file size limits (bytes)
const SIZE_LIMITS = {
  recording:  100 * 1024 * 1024, // 100 MB
  pdf:        10 * 1024 * 1024,  // 10 MB
  image:      10 * 1024 * 1024,  // 10 MB
  attachment: 10 * 1024 * 1024,  // 10 MB
};

// Accept up to 100 MB initially; per-type validation happens after multer
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });

const KIND_LABEL = { recording: 'تسجيل صوتي', pdf: 'PDF', image: 'صورة', attachment: 'ملف إضافي' };

function tryDeleteFile(fileUrl) {
  if (!fileUrl) return;
  const filePath = path.join(__dirname, '../../', fileUrl.replace(/^\//, ''));
  fs.unlink(filePath, () => {});
}

// Post-multer middleware: validate mimetype and file size against declared type
function validateUpload(req, res, next) {
  const type = req.body.type;
  const file = req.files && req.files['file'] && req.files['file'][0];
  if (!file || !type) return next();

  const allowed = ALLOWED_MIMETYPES[type];
  if (!allowed || !allowed.includes(file.mimetype)) {
    tryDeleteFile(`/uploads/${file.filename}`);
    return res.status(400).json({ error: `نوع الملف غير مسموح لـ ${KIND_LABEL[type] || type}` });
  }

  const maxSize = SIZE_LIMITS[type];
  if (maxSize && file.size > maxSize) {
    tryDeleteFile(`/uploads/${file.filename}`);
    return res.status(400).json({ error: `حجم الملف يتجاوز الحد الأقصى (${Math.round(maxSize / 1024 / 1024)} MB)` });
  }

  // Also validate board image mimetype if present
  const board = req.files && req.files['board'] && req.files['board'][0];
  if (board) {
    const boardAllowed = ALLOWED_MIMETYPES.image;
    if (!boardAllowed || !boardAllowed.includes(board.mimetype)) {
      tryDeleteFile(`/uploads/${board.filename}`);
      return res.status(400).json({ error: 'صورة السبورة يجب أن تكون صورة (JPEG, PNG, WebP)' });
    }
  }

  next();
}

// POST /api/upload  (multipart/form-data)
// fields: area=curriculum|quran|khutbah, targetId, title, type, file (required), board (optional image)
const uploadFields = upload.fields([{ name: 'file', maxCount: 1 }, { name: 'board', maxCount: 1 }]);
router.post('/', requireAuth, requireAdmin, uploadFields, validateUpload, asyncHandler(async (req, res) => {
  const { area, targetId, title, type } = req.body;
  const file = req.files && req.files['file'] && req.files['file'][0];
  if (!file || !area || !targetId || !title) return res.status(400).json({ error: 'بيانات ناقصة' });
  const fileUrl = `/uploads/${file.filename}`;
  const boardFile = req.files && req.files['board'] && req.files['board'][0];
  const boardUrl = boardFile ? `/uploads/${boardFile.filename}` : null;

  try {
    if (area === 'curriculum') {
      if (type === 'recording') {
        const count = await prisma.recording.count({ where: { lessonId: targetId } });
        const rec = await prisma.recording.create({
          data: { lessonId: targetId, title, duration: 'جديد', version: count + 1, audioUrl: fileUrl },
        });
        if (boardUrl) {
          await prisma.resource.create({
            data: { lessonId: targetId, title: 'صورة السبورة', kind: 'صورة', fileUrl: boardUrl },
          });
        }
        return res.status(201).json(rec);
      }
      const resource = await prisma.resource.create({
        data: { lessonId: targetId, title, kind: KIND_LABEL[type] || 'ملف إضافي', fileUrl },
      });
      return res.status(201).json(resource);
    }

    if (area === 'quran') {
      if (type === 'recording') {
        const count = await prisma.recording.count({ where: { quarterId: targetId } });
        const rec = await prisma.recording.create({
          data: { quarterId: targetId, title, duration: 'جديد', version: count + 1, audioUrl: fileUrl },
        });
        return res.status(201).json(rec);
      }
      const resource = await prisma.resource.create({
        data: { quarterId: targetId, title, kind: KIND_LABEL[type] || 'ملف إضافي', fileUrl },
      });
      return res.status(201).json(resource);
    }

    if (area === 'khutbah') {
      if (type === 'recording') {
        const count = await prisma.recording.count({ where: { khutbahId: targetId } });
        const rec = await prisma.recording.create({
          data: { khutbahId: targetId, title, duration: 'جديد', version: count + 1, audioUrl: fileUrl },
        });
        return res.status(201).json(rec);
      }
      const resource = await prisma.resource.create({
        data: { khutbahId: targetId, title, kind: KIND_LABEL[type] || 'ملف إضافي', fileUrl },
      });
      return res.status(201).json(resource);
    }

    res.status(400).json({ error: 'قسم غير معروف' });
  } catch (err) {
    // Clean up orphaned files on failed DB insert
    tryDeleteFile(fileUrl);
    if (boardUrl) tryDeleteFile(boardUrl);
    res.status(400).json({ error: 'تعذر ربط الملف بالمحتوى المختار' });
  }
}));

// DELETE /api/upload/recordings/:id
router.delete('/recordings/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  try {
    const rec = await prisma.recording.findUnique({ where: { id: req.params.id } });
    if (!rec) return res.status(404).json({ error: 'التسجيل غير موجود' });
    tryDeleteFile(rec.audioUrl);
    await prisma.recording.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'تعذر حذف التسجيل' });
  }
}));

// DELETE /api/upload/resources/:id
router.delete('/resources/:id', requireAuth, requireAdmin, asyncHandler(async (req, res) => {
  try {
    const resrc = await prisma.resource.findUnique({ where: { id: req.params.id } });
    if (!resrc) return res.status(404).json({ error: 'المورد غير موجود' });
    tryDeleteFile(resrc.fileUrl);
    await prisma.resource.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'تعذر حذف المورد' });
  }
}));

module.exports = router;
