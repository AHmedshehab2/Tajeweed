const prisma = require('../prisma');
const { queueMediaCleanup, drainMediaCleanupJobs } = require('../services/media-cleanup.service');

async function findLessonById(id) {
  return prisma.lesson.findUnique({
    where: { id },
    select: { id: true },
  });
}

async function findQuarterById(id) {
  return prisma.quarter.findUnique({
    where: { id },
    select: { id: true },
  });
}

async function findKhutbahById(id) {
  return prisma.khutbah.findUnique({
    where: { id },
    select: { id: true },
  });
}

async function countRecordingsByLesson(lessonId) {
  return prisma.recording.count({ where: { lessonId } });
}

async function countRecordingsByQuarter(quarterId) {
  return prisma.recording.count({ where: { quarterId } });
}

async function countRecordingsByKhutbah(khutbahId) {
  return prisma.recording.count({ where: { khutbahId } });
}

async function createRecording(data) {
  return prisma.recording.create({ data });
}

async function createResource(data) {
  return prisma.resource.create({ data });
}

async function findRecordingById(id) {
  return prisma.recording.findUnique({ where: { id } });
}

async function findResourceById(id) {
  return prisma.resource.findUnique({ where: { id } });
}

async function deleteRecording(recording) {
  await prisma.$transaction(async (tx) => {
    await queueMediaCleanup(tx, [recording]);
    await tx.recording.delete({ where: { id: recording.id } });
  });
  drainMediaCleanupJobs().catch(() => {});
}

async function deleteResource(resource) {
  await prisma.$transaction(async (tx) => {
    await queueMediaCleanup(tx, [resource]);
    await tx.resource.delete({ where: { id: resource.id } });
  });
  drainMediaCleanupJobs().catch(() => {});
}

module.exports = {
  findLessonById,
  findQuarterById,
  findKhutbahById,
  countRecordingsByLesson,
  countRecordingsByQuarter,
  countRecordingsByKhutbah,
  createRecording,
  createResource,
  findRecordingById,
  findResourceById,
  deleteRecording,
  deleteResource,
};
