const multer = require('multer');
const AppError = require('../lib/AppError');
const { sniffBuffer, matchesDeclaredType } = require('../lib/sniff');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024 },
});

const ALLOWED_MIMETYPES = {
  recording: [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/ogg',
    'audio/aac',
    'audio/x-m4a',
    'audio/mp4',
    'audio/flac',
  ],
  pdf: ['application/pdf'],
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif'],
  attachment: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ],
};

const SIZE_LIMITS = {
  recording: 100 * 1024 * 1024,
  pdf: 10 * 1024 * 1024,
  image: 10 * 1024 * 1024,
  attachment: 10 * 1024 * 1024,
};

const KIND_LABEL = {
  recording: 'تسجيل صوتي',
  pdf: 'PDF',
  image: 'صورة',
  attachment: 'ملف إضافي',
};

const uploadFields = upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'board', maxCount: 1 },
]);

function validateUpload(req, _res, next) {
  const type = req.body.type;
  const file = req.files && req.files['file'] && req.files['file'][0];
  if (!file || !type) return next();

  const allowed = ALLOWED_MIMETYPES[type];
  if (!allowed || !allowed.includes(file.mimetype)) {
    return next(new AppError(`نوع الملف غير مسموح لـ ${KIND_LABEL[type] || type}`, 400));
  }

  const maxSize = SIZE_LIMITS[type];
  if (maxSize && file.size > maxSize) {
    return next(
      new AppError(`حجم الملف يتجاوز الحد الأقصى (${Math.round(maxSize / 1024 / 1024)} MB)`, 400)
    );
  }

  const sniffed = sniffBuffer(file.buffer);
  if (!sniffed || !matchesDeclaredType(sniffed, type)) {
    return next(new AppError('محتويات الملف لا تطابق النوع المحدد', 400));
  }

  const board = req.files && req.files['board'] && req.files['board'][0];
  if (board) {
    const boardAllowed = ALLOWED_MIMETYPES.image;
    if (!boardAllowed || !boardAllowed.includes(board.mimetype)) {
      return next(new AppError('صورة السبورة يجب أن تكون صورة (JPEG, PNG, WebP)', 400));
    }
    const boardSniffed = sniffBuffer(board.buffer);
    if (!boardSniffed || !matchesDeclaredType(boardSniffed, 'image')) {
      return next(new AppError('محتويات صورة السبورة لا تطابق النوع', 400));
    }
  }

  next();
}

function timeoutHandler(ms) {
  return (_req, res, next) => {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({ error: 'انتهت مهلة الرفع' });
      }
    }, ms);
    res.on('finish', () => clearTimeout(timer));
    next();
  };
}

module.exports = {
  uploadFields,
  validateUpload,
  timeoutHandler,
  KIND_LABEL,
};
