const path = require('path');
const fs = require('fs');
const contentRepo = require('../repositories/content.repository');
const AppError = require('../lib/AppError');
const { KIND_LABEL } = require('../middleware/upload.middleware');
const { isConfigured: storageConfigured, uploadBuffer, destroy } = require('./r2.service');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
if (!storageConfigured) {
  try { fs.mkdirSync(UPLOADS_DIR, { recursive: true }); } catch (_) {}
}

async function storeFile(buffer, originalname) {
  if (storageConfigured) {
    const base = originalname.replace(/[^\w.\-]/g, '_').replace(/\.[^.]+$/, '');
    const result = await uploadBuffer(buffer, {
      folder: 'tajweed',
      public_id: `${Date.now()}-${base}`,
    });
    return { url: result.secure_url, cloudinaryId: result.public_id };
  }
  const filename = `${Date.now()}-${originalname.replace(/[^\w.\-]/g, '_')}`;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  return { url: `/uploads/${filename}`, cloudinaryId: null };
}

function tryDeleteFile(fileUrl, cloudinaryId) {
  if (cloudinaryId) {
    destroy(cloudinaryId).catch(() => {});
    return;
  }
  if (!fileUrl || typeof fileUrl !== 'string') return;
  if (fileUrl.startsWith('http://') || fileUrl.startsWith('https://')) return;
  const relative = fileUrl.replace(/^\//, '');
  if (!relative.startsWith('uploads/') || relative.includes('..')) return;
  const filePath = path.resolve(path.join(__dirname, '../../', relative));
  const uploadsRoot = path.resolve(UPLOADS_DIR);
  if (!filePath.startsWith(uploadsRoot + path.sep) && filePath !== uploadsRoot) return;
  fs.unlink(filePath, () => {});
}

async function validateTargetId(area, targetId) {
  if (!area || !targetId) return;
  if (area === 'curriculum') {
    const lesson = await contentRepo.findLessonById(targetId);
    if (!lesson) throw new AppError('الدرس غير موجود', 404);
  } else if (area === 'quran') {
    const quarter = await contentRepo.findQuarterById(targetId);
    if (!quarter) throw new AppError('الربع غير موجود', 404);
  } else if (area === 'khutbah') {
    const khutbah = await contentRepo.findKhutbahById(targetId);
    if (!khutbah) throw new AppError('الخطبة غير موجودة', 404);
  }
}

async function handleUpload({ area, targetId, title, type, files }) {
  const file = files && files['file'] && files['file'][0];
  if (!file || !area || !title) throw new AppError('بيانات ناقصة', 400);
  if (area !== 'general' && !targetId) throw new AppError('بيانات ناقصة', 400);

  await validateTargetId(area, targetId);

  let fileResult, boardResult;
  try {
    fileResult = await storeFile(file.buffer, file.originalname);
  } catch (e) {
    console.error('[upload] storeFile failed:', e);
    throw new AppError('فشل حفظ الملف', 500);
  }

  const boardFile = files && files['board'] && files['board'][0];
  if (boardFile) {
    try {
      boardResult = await storeFile(boardFile.buffer, boardFile.originalname);
    } catch (e) {
      console.error('[upload] storeFile (board) failed:', e);
      tryDeleteFile(fileResult.url, fileResult.cloudinaryId);
      throw new AppError('فشل حفظ صورة السبورة', 500);
    }
  }

  const fileUrl = fileResult.url;
  const filePublicId = fileResult.cloudinaryId;
  const boardUrl = boardResult ? boardResult.url : null;
  const boardPublicId = boardResult ? boardResult.cloudinaryId : null;

  try {
    if (area === 'curriculum') {
      if (type === 'recording' || type === 'video') {
        const count = await contentRepo.countRecordingsByLesson(targetId);
        const rec = await contentRepo.createRecording({
          lessonId: targetId,
          title,
          kind: type === 'video' ? 'video' : 'audio',
          duration: '00:00',
          version: count + 1,
          audioUrl: fileUrl,
          cloudinaryId: filePublicId,
        });
        if (boardUrl) {
          await contentRepo.createResource({
            lessonId: targetId,
            title: 'صورة السبورة',
            kind: 'صورة',
            fileUrl: boardUrl,
            cloudinaryId: boardPublicId,
          });
        }
        return rec;
      }
      return await contentRepo.createResource({
        lessonId: targetId,
        title,
        kind: KIND_LABEL[type] || 'ملف إضافي',
        fileUrl,
        cloudinaryId: filePublicId,
      });
    }

    if (area === 'quran') {
      if (type === 'recording') {
        const count = await contentRepo.countRecordingsByQuarter(targetId);
        return await contentRepo.createRecording({
          quarterId: targetId,
          title,
          duration: '00:00',
          version: count + 1,
          audioUrl: fileUrl,
          cloudinaryId: filePublicId,
        });
      }
      return await contentRepo.createResource({
        quarterId: targetId,
        title,
        kind: KIND_LABEL[type] || 'ملف إضافي',
        fileUrl,
        cloudinaryId: filePublicId,
      });
    }

    if (area === 'khutbah') {
      if (type === 'recording') {
        const count = await contentRepo.countRecordingsByKhutbah(targetId);
        return await contentRepo.createRecording({
          khutbahId: targetId,
          title,
          duration: '00:00',
          version: count + 1,
          audioUrl: fileUrl,
          cloudinaryId: filePublicId,
        });
      }
      return await contentRepo.createResource({
        khutbahId: targetId,
        title,
        kind: KIND_LABEL[type] || 'ملف إضافي',
        fileUrl,
        cloudinaryId: filePublicId,
      });
    }

    if (area === 'general') {
      return await contentRepo.createResource({
        title,
        kind: KIND_LABEL[type] || 'ملف إضافي',
        fileUrl,
        cloudinaryId: filePublicId,
      });
    }

    tryDeleteFile(fileUrl, filePublicId);
    if (boardUrl) tryDeleteFile(boardUrl, boardPublicId);
    throw new AppError('قسم غير معروف', 400);
  } catch (err) {
    tryDeleteFile(fileUrl, filePublicId);
    if (boardUrl) tryDeleteFile(boardUrl, boardPublicId);
    if (err instanceof AppError) throw err;
    throw new AppError('تعذر ربط الملف بالمحتوى المختار', 400);
  }
}

async function removeRecording(id) {
  const rec = await contentRepo.findRecordingById(id);
  if (!rec) throw new AppError('التسجيل غير موجود', 404);
  try {
    await contentRepo.deleteRecording(rec);
  } catch (err) {
    throw new AppError('تعذر حذف التسجيل', 400);
  }
}

async function removeResource(id) {
  const resrc = await contentRepo.findResourceById(id);
  if (!resrc) throw new AppError('المورد غير موجود', 404);
  try {
    await contentRepo.deleteResource(resrc);
  } catch (err) {
    throw new AppError('تعذر حذف المورد', 400);
  }
}

module.exports = {
  storeFile,
  tryDeleteFile,
  handleUpload,
  removeRecording,
  removeResource,
};
