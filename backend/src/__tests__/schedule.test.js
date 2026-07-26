const { resolveDay, formatTime12 } = require('../services/schedule.service');
const { DAY_TYPES, LESSON_TAGS } = require('../constants');

describe('Schedule Service Unit Tests', () => {
  describe('formatTime12', () => {
    it('formats 24h string to 12h Arabic string', () => {
      expect(formatTime12('09:00')).toBe('9:00 ص');
      expect(formatTime12('14:30')).toBe('2:30 م');
      expect(formatTime12('00:15')).toBe('12:15 ص');
      expect(formatTime12('12:00')).toBe('12:00 م');
      expect(formatTime12(null)).toBe('');
    });
  });

  describe('resolveDay business logic', () => {
    const fixedTemplate = {
      dayOfWeek: 1, // Monday
      dayType: DAY_TYPES.FIXED,
      lessonTag: LESSON_TAGS.IQRAA,
      startTime: '18:00',
      endTime: '19:30',
    };

    const optionalTemplate = {
      dayOfWeek: 2, // Tuesday
      dayType: DAY_TYPES.OPTIONAL,
      lessonTag: LESSON_TAGS.TAJWEED,
      startTime: '17:00',
      endTime: '18:00',
    };

    const date = new Date('2026-07-27T00:00:00Z'); // Monday

    it('resolves FIXED template without exception as available', () => {
      const day = resolveDay(date, fixedTemplate, null);
      expect(day.available).toBe(true);
      expect(day.tag).toBe(LESSON_TAGS.IQRAA);
      expect(day.tagLabel).toBe('إقراء');
      expect(day.time).toBe('6:00 م - 7:30 م');
      expect(day.reason).toBeNull();
    });

    it('resolves FIXED template with isCancelled exception as unavailable', () => {
      const exception = { isCancelled: true, note: 'عطلة رسمية' };
      const day = resolveDay(date, fixedTemplate, exception);
      expect(day.available).toBe(false);
      expect(day.reason).toBe('cancelled');
      expect(day.note).toBe('عطلة رسمية');
    });

    it('resolves OPTIONAL template without exception as not activated', () => {
      const day = resolveDay(date, optionalTemplate, null);
      expect(day.available).toBe(false);
      expect(day.reason).toBe('optional-not-activated');
    });

    it('resolves OPTIONAL template with isAdded exception as available', () => {
      const exception = { isAdded: true, lessonTag: LESSON_TAGS.TAJWEED, startTime: '17:00', endTime: '18:00', note: 'حصة إضافية' };
      const day = resolveDay(date, optionalTemplate, exception);
      expect(day.available).toBe(true);
      expect(day.tag).toBe(LESSON_TAGS.TAJWEED);
      expect(day.tagLabel).toBe('تجويد');
      expect(day.note).toBe('حصة إضافية');
    });

    it('resolves missing or NONE template as no-lessons', () => {
      const day = resolveDay(date, null, null);
      expect(day.available).toBe(false);
      expect(day.reason).toBe('no-lessons');

      const noneTemplate = { dayOfWeek: 0, dayType: DAY_TYPES.NONE };
      const day2 = resolveDay(date, noneTemplate, null);
      expect(day2.available).toBe(false);
      expect(day2.reason).toBe('no-lessons');
    });

    it('reverts to template default when exception is removed (null exception)', () => {
      // Simulates deleting an exception: passing null returns template default
      const dayBefore = resolveDay(date, fixedTemplate, { isCancelled: true });
      expect(dayBefore.available).toBe(false);

      const dayAfter = resolveDay(date, fixedTemplate, null);
      expect(dayAfter.available).toBe(true);
      expect(dayAfter.reason).toBeNull();
    });
  });
});
