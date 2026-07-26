const prisma = require('../prisma');

async function findTemplates() {
  return prisma.weeklyScheduleTemplate.findMany({
    orderBy: { dayOfWeek: 'asc' },
  });
}

async function upsertTemplate(dayOfWeek, data) {
  return prisma.weeklyScheduleTemplate.upsert({
    where: { dayOfWeek },
    update: data,
    create: { dayOfWeek, ...data },
  });
}

async function findExceptionsInRange(startDate, endDate) {
  return prisma.scheduleException.findMany({
    where: {
      date: {
        gte: startDate,
        lte: endDate,
      },
    },
    orderBy: { date: 'asc' },
  });
}

async function findExceptionsWithFilter(where) {
  return prisma.scheduleException.findMany({
    where,
    orderBy: { date: 'asc' },
  });
}

async function findExceptionById(id) {
  return prisma.scheduleException.findUnique({
    where: { id },
  });
}

async function createException(data) {
  return prisma.scheduleException.create({
    data,
  });
}

async function updateException(id, data) {
  return prisma.scheduleException.update({
    where: { id },
    data,
  });
}

async function deleteException(id) {
  return prisma.scheduleException.delete({
    where: { id },
  });
}

module.exports = {
  findTemplates,
  upsertTemplate,
  findExceptionsInRange,
  findExceptionsWithFilter,
  findExceptionById,
  createException,
  updateException,
  deleteException,
};
