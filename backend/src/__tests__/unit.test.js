const { parseObjectives, serializeRecording, serializeResource } = require('../routes/content');
const { CYCLE } = require('../routes/progress');

describe('parseObjectives', () => {
  it('returns [] for falsy values', () => {
    expect(parseObjectives(null)).toEqual([]);
    expect(parseObjectives(undefined)).toEqual([]);
    expect(parseObjectives('')).toEqual([]);
  });

  it('returns the array if already an array', () => {
    const arr = ['a', 'b'];
    expect(parseObjectives(arr)).toEqual(arr);
  });

  it('parses a JSON string array', () => {
    expect(parseObjectives('["x","y"]')).toEqual(['x', 'y']);
  });

  it('returns [] for invalid JSON', () => {
    expect(parseObjectives('not json')).toEqual([]);
  });

  it('returns [] if JSON parses to non-array', () => {
    expect(parseObjectives('{"key":"value"}')).toEqual([]);
  });
});

describe('serializeRecording', () => {
  it('formats uploadedAt to YYYY-MM-DD', () => {
    const input = { id: '1', title: 'test', uploadedAt: new Date('2026-03-15T10:30:00Z') };
    const result = serializeRecording(input);
    expect(result.uploadedAt).toBe('2026-03-15');
    expect(result.id).toBe('1');
  });
});

describe('serializeResource', () => {
  it('formats uploadedAt to YYYY-MM-DD', () => {
    const input = { id: '2', title: 'doc', kind: 'PDF', uploadedAt: new Date('2026-01-01T00:00:00Z') };
    const result = serializeResource(input);
    expect(result.uploadedAt).toBe('2026-01-01');
  });
});

describe('CYCLE state machine', () => {
  it('not-started -> in-progress', () => {
    expect(CYCLE['not-started']).toBe('in-progress');
  });

  it('in-progress -> completed', () => {
    expect(CYCLE['in-progress']).toBe('completed');
  });

  it('completed -> not-started', () => {
    expect(CYCLE['completed']).toBe('not-started');
  });

  it('completes a full cycle', () => {
    let state = 'not-started';
    state = CYCLE[state];
    expect(state).toBe('in-progress');
    state = CYCLE[state];
    expect(state).toBe('completed');
    state = CYCLE[state];
    expect(state).toBe('not-started');
  });
});
