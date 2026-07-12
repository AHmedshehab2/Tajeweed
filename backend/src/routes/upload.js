const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.\-]/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

const KIND_LABEL = { recording: 'تسجيل صوتي', pdf: 'PDF', image: 'صورة', attachment: 'ملف إضافي' };

// POST /api/upload  (multipart/form-data)
// fields: area=curriculum|quran|khutbah, targetId, title, type, file (required), board (optional image)
const uploadFields = upload.fields([{ name: 'file', maxCount: 1 }, { name: 'board', maxCount: 1 }]);
router.post('/', requireAuth, requireAdmin, uploadFields, async (req, res) => {
  const { area, targetId, title, type } = req.body;
  const file = req.files && req.files['file'] && req.files['file'][0];
  if (!file || !area || !targetId || !title) return res.status(400).json({ error: 'بيانات ناقصة' });
  const fileUrl = `/uploads/${file.filename}`;

  try {
    if (area === 'curriculum') {
      if (type === 'recording') {
        const count = await prisma.recording.count({ where: { lessonId: targetId } });
        const rec = await prisma.recording.create({
          data: { lessonId: targetId, title, duration: 'جديد', version: count + 1, audioUrl: fileUrl },
        });
        const boardFile = req.files && req.files['board'] && req.files['board'][0];
        if (boardFile) {
          const boardUrl = `/uploads/${boardFile.filename}`;
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

    if (area === "khutbah") {
      if (type === "recording") {
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
    res.status(400).json({ error: 'تعذر ربط الملف بالمحتوى المختار' });
  }
});

function tryDeleteFile(fileUrl) {
  if (!fileUrl) return;
  const filePath = path.join(__dirname, '../../', fileUrl.replace(/^\//, ''));
  fs.unlink(filePath, () => {});
}

// DELETE /api/upload/recordings/:id
router.delete('/recordings/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const rec = await prisma.recording.findUnique({ where: { id: req.params.id } });
    if (!rec) return res.status(404).json({ error: 'التسجيل غير موجود' });
    tryDeleteFile(rec.audioUrl);
    await prisma.recording.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'تعذر حذف التسجيل' });
  }
});

// DELETE /api/upload/resources/:id
router.delete('/resources/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const resrc = await prisma.resource.findUnique({ where: { id: req.params.id } });
    if (!resrc) return res.status(404).json({ error: 'المورد غير موجود' });
    tryDeleteFile(resrc.fileUrl);
    await prisma.resource.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: 'تعذر حذف المورد' });
  }
});

module.exports = router;
