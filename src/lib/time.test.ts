import { describe, it, expect } from 'vitest';
import { romeDateTime, romeDateStr, getRomeParts, addDays, dayOfWeek, formatDuration } from './time';

describe('romeDateTime', () => {
  it('converts summer wall-clock time (UTC+2)', () => {
    expect(romeDateTime('2026-07-10', 16).toISOString()).toBe('2026-07-10T14:00:00.000Z');
  });
  it('converts winter wall-clock time (UTC+1)', () => {
    expect(romeDateTime('2026-12-10', 16).toISOString()).toBe('2026-12-10T15:00:00.000Z');
  });
  it('handles the day after the autumn DST switch', () => {
    expect(romeDateTime('2026-10-26', 0).toISOString()).toBe('2026-10-25T23:00:00.000Z');
  });
  it('handles midnight in summer', () => {
    expect(romeDateTime('2026-10-05', 0).toISOString()).toBe('2026-10-04T22:00:00.000Z');
  });
});

describe('Rome date parts', () => {
  it('romeDateStr uses the Rome calendar day', () => {
    expect(romeDateStr(new Date('2026-10-04T22:30:00Z'))).toBe('2026-10-05');
  });
  it('getRomeParts returns 0 for midnight', () => {
    expect(getRomeParts(new Date('2026-10-04T22:00:00Z')).hour).toBe(0);
  });
  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-09-28', 7)).toBe('2026-10-05');
  });
  it('dayOfWeek', () => {
    expect(dayOfWeek('2026-09-28')).toBe(1); // Monday
  });
});

describe('formatDuration', () => {
  it('formats hours, days and both', () => {
    expect(formatDuration(3 * 3_600_000)).toBe('3 h');
    expect(formatDuration(48 * 3_600_000)).toBe('2 g');
    expect(formatDuration(33 * 3_600_000)).toBe('1 g 9 h');
  });
});
