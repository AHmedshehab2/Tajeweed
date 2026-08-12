const scheduleRepo = require('../repositories/schedule.repository');
const AppError = require('../lib/AppError');
const { isoDate } = require('../lib/validation');
const { DAY_NAMES_AR, TAG_LABELS_AR, DAY_TYPES } = require('../constants');

function formatTime12(time24) {
  if (!time24) return '';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'م' : 'ص';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function resolveDay(date, template, exception) {
  const result = {
    date: date.toISOString().slice(0, 10),
    dayOfWeek: date.getDay(),
    dayName: DAY_NAMES_AR[date.getDay()],
    available: false,
    reason: null,
    tag: null,
    tagLabel: null,
    time: null,
    note: null,
  };

  if (!template || template.dayType === DAY_TYPES.NONE) {
    result.reason = 'no-lessons';
    return result;
  }

  if (template.dayType === DAY_TYPES.FIXED) {
    if (exception && exception.isCancelled) {
      result.reason = 'cancelled';
      result.note = exception.note || null;
      return result;
    }
    result.available = true;
    const tag = (exception && exception.lessonTag) || template.lessonTag;
    result.tag = tag || null;
    result.tagLabel = tag ? TAG_LABELS_AR[tag] : null;
    const start = (exception && exception.startTime) || template.startTime;
    const end = (exception && exception.endTime) || template.endTime;
    if (start && end) result.time = `${formatTime12(start)} - ${formatTime12(end)}`;
    if (exception && exception.note) result.note = exception.note;
    return result;
  }

  if (template.dayType === DAY_TYPES.OPTIONAL) {
    if (exception && exception.isAdded) {
      result.available = true;
      const tag = exception.lessonTag || template.lessonTag;
      result.tag = tag || null;
      result.tagLabel = tag ? TAG_LABELS_AR[tag] : null;
      const start = exception.startTime || template.startTime;
      const end = exception.endTime || template.endTime;
      if (start && end) result.time = `${formatTime12(start)} - ${formatTime12(end)}`;
      if (exception.note) result.note = exception.note;
      return result;
    }
    result.reason = 'optional-not-activated';
    return result;
  }

  result.reason = 'unknown';
  return result;
}

async function getSchedule(weekStartQuery) {
  let weekStart;
  if (weekStartQuery) {
    weekStart = isoDate(weekStartQuery, 'تاريخ بداية الأسبوع');
  } else {
    const now = new Date();
    const day = now.getDay();
    weekStart = new Date(now);
    weekStart.setDate(now.getDate() - day);
    weekStart.setUTCHours(0, 0, 0, 0);
  }

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setUTCHours(23, 59, 59, 999);

  const [templates, exceptions] = await Promise.all([
    scheduleRepo.findTemplates(),
    scheduleRepo.findExceptionsInRange(weekStart, weekEnd),
  ]);

  const templateMap = {};
  templates.forEach((t) => {
    templateMap[t.dayOfWeek] = t;
  });

  const days = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + i);
    const dow = date.getDay();
    const template = templateMap[dow] || null;
    const exception =
      exceptions.find((e) => {
        const eDate = new Date(e.date);
        return (
          eDate.getUTCFullYear() === date.getUTCFullYear() &&
          eDate.getUTCMonth() === date.getUTCMonth() &&
          eDate.getUTCDate() === date.getUTCDate()
        );
      }) || null;
    days.push(resolveDay(date, template, exception));
  }

  const fixedDays = templates
    .filter((t) => t.dayType === DAY_TYPES.FIXED)
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((t) => DAY_NAMES_AR[t.dayOfWeek])
    .filter(Boolean);

  return {
    weekStart: weekStart.toISOString().slice(0, 10),
    days,
    fixedDays,
  };
}

async function getTemplates() {
  return scheduleRepo.findTemplates();
}

async function updateTemplates(entries) {
  if (!Array.isArray(entries)) {
    throw new AppError('بيانات غير صالحة', 400);
  }

  for (const e of entries) {
    if (typeof e.dayOfWeek !== 'number' || e.dayOfWeek < 0 || e.dayOfWeek > 6) continue;
    const data = { dayType: e.dayType || DAY_TYPES.NONE };
    if (e.lessonTag !== undefined) data.lessonTag = e.lessonTag || null;
    if (e.startTime !== undefined) data.startTime = e.startTime || null;
    if (e.endTime !== undefined) data.endTime = e.endTime || null;

    await scheduleRepo.upsertTemplate(e.dayOfWeek, data);
  }

  return scheduleRepo.findTemplates();
}

async function getExceptions(fromQuery, toQuery) {
  const where = {};
  if (fromQuery) {
    isoDate(fromQuery, 'التاريخ من');
    where.date = { ...where.date, gte: new Date(fromQuery + 'T00:00:00Z') };
  }
  if (toQuery) {
    isoDate(toQuery, 'التاريخ إلى');
    where.date = { ...where.date, lte: new Date(toQuery + 'T23:59:59Z') };
  }

  const exceptions = await scheduleRepo.findExceptionsWithFilter(where);
  return exceptions.map((e) => ({
    ...e,
    date: e.date.toISOString().slice(0, 10),
    createdAt: e.createdAt.toISOString(),
  }));
}

async function createException(dto) {
  const { date, isCancelled, isAdded, lessonTag, startTime, endTime, note } = dto || {};
  if (!date) throw new AppError('التاريخ مطلوب', 400);
  isoDate(date, 'التاريخ');
  if (isCancelled && isAdded) throw new AppError('لا يمكن أن يكون الإلغاء والإضافة معاً', 400);

  const exceptionDate = new Date(date + 'T00:00:00Z');
  try {
    const exception = await scheduleRepo.createException({
      date: exceptionDate,
      isCancelled: Boolean(isCancelled),
      isAdded: Boolean(isAdded),
      lessonTag: lessonTag || null,
      startTime: startTime || null,
      endTime: endTime || null,
      note: note || null,
    });
    return {
      ...exception,
      date: exception.date.toISOString().slice(0, 10),
    };
  } catch (err) {
    if (err.code === 'P2002') {
      throw new AppError('يوجد استثناء بهذا التاريخ بالفعل', 409);
    }
    throw err;
  }
}

async function updateException(id, dto) {
  const existing = await scheduleRepo.findExceptionById(id);
  if (!existing) throw new AppError('الاستثناء غير موجود', 404);

  const data = {};
  if (dto.isCancelled !== undefined) data.isCancelled = Boolean(dto.isCancelled);
  if (dto.isAdded !== undefined) data.isAdded = Boolean(dto.isAdded);
  if (dto.lessonTag !== undefined) data.lessonTag = dto.lessonTag || null;
  if (dto.startTime !== undefined) data.startTime = dto.startTime || null;
  if (dto.endTime !== undefined) data.endTime = dto.endTime || null;
  if (dto.note !== undefined) data.note = dto.note || null;

  const exception = await scheduleRepo.updateException(id, data);
  return {
    ...exception,
    date: exception.date.toISOString().slice(0, 10),
  };
}

async function deleteException(id) {
  const existing = await scheduleRepo.findExceptionById(id);
  if (!existing) throw new AppError('الاستثناء غير موجود', 404);

  await scheduleRepo.deleteException(id);
}

module.exports = {
  formatTime12,
  resolveDay,
  getSchedule,
  getTemplates,
  updateTemplates,
  getExceptions,
  createException,
  updateException,
  deleteException,
};
