const fs = require('fs/promises');
const path = require('path');
const prisma = require('../prisma');
const { destroy } = require('./r2.service');

const UPLOADS_DIR = path.resolve(__dirname, '../../uploads');

async function deleteStoredMedia(fileUrl, cloudinaryId) {
  if (cloudinaryId) return destroy(cloudinaryId);
  if (!fileUrl || /^https?:\/\//i.test(fileUrl)) return;
  const relative = fileUrl.replace(/^\//, '');
  if (!relative.startsWith('uploads/') || relative.includes('..')) return;
  const candidate = path.resolve(__dirname, '../../', relative);
  if (!candidate.startsWith(`${UPLOADS_DIR}${path.sep}`)) throw new Error('Unsafe media path');
  try {
    await fs.unlink(candidate);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

async function queueMediaCleanup(tx, media) {
  const jobs = media.filter((item) => item?.fileUrl || item?.audioUrl || item?.cloudinaryId).map((item) => ({
    fileUrl: item.fileUrl || item.audioUrl || null,
    cloudinaryId: item.cloudinaryId || null,
  }));
  if (!jobs.length) return;
  await tx.mediaCleanupJob.createMany({ data: jobs });
}

async function drainMediaCleanupJobs(limit = 25) {
  const jobs = await prisma.mediaCleanupJob.findMany({ where: { completedAt: null }, orderBy: { createdAt: 'asc' }, take: limit });
  await Promise.all(jobs.map(async (job) => {
    try {
      await deleteStoredMedia(job.fileUrl, job.cloudinaryId);
      await prisma.mediaCleanupJob.update({ where: { id: job.id }, data: { completedAt: new Date(), attempts: { increment: 1 }, lastError: null } });
    } catch (error) {
      await prisma.mediaCleanupJob.update({ where: { id: job.id }, data: { attempts: { increment: 1 }, lastError: String(error.message || error).slice(0, 1000) } });
    }
  }));
}

module.exports = { queueMediaCleanup, drainMediaCleanupJobs };
