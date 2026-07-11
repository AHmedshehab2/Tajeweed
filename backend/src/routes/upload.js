const router = require('express').Router();
const multer = require('multer');
const path = require('path');
const prisma = require('../prisma');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const storage = multer.diskStorage({
  destination: path.join(__dirname, '../../uploads'),
  filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.\-]/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });

const KIND_LABEL = { recording: 'تسجيل صوتي', pdf: 'PDF', image: 'صورة', attachment: 'ملف إضافي' };

// POST /api/upload  (multipart/form-data)
// fields: area=curriculum|quran|khutbah, targetId, title, type
router.post('/', requireAuth, requireAdmin, upload.single('file'), async (req, res) => {
  const { area, targetId, title, type } = req.body;
  if (!req.file || !area || !targetId || !title) return res.status(400).json({ error: 'بيانات ناقصة' });
  const fileUrl = `/uploads/${req.file.filename}`;

  try {
    if (area === 'curriculum') {
      if (type === 'recording') {
        const count = await prisma.recording.count({ where: { lessonId: targetId } });
        const rec = await prisma.recording.create({
          data: { lessonId: targetId, title, duration: 'جديد', version: count + 1, audioUrl: fileUrl },
        });
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
        const khutbah = await prisma.khutbah.update({
          where: { id: targetId },
          data: { audioUrl: fileUrl, duration: 'جديد' },
        });
        return res.status(201).json(khutbah);
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

module.exports = router;
