import { describe, it, expect } from 'vitest';
import { validateBookingRange, rangesOverlap, earliestBookableStart } from './booking-rules';

// Rome is UTC+2 in summer (CEST), UTC+1 in winter (CET)
const NOW = new Date('2026-09-28T10:00:00Z'); // Mon 28 Sep 2026, 12:00 Rome

describe('earliestBookableStart', () => {
  it('is midnight Rome of today + 7 days', () => {
    expect(earliestBookableStart(NOW).toISOString()).toBe('2026-10-04T22:00:00.000Z'); // 5 Oct 00:00 Rome
  });
});

describe('validateBookingRange', () => {
  const at = (iso: string) => new Date(iso);

  it('accepts a multi-day booking aligned to hours', () => {
    expect(validateBookingRange(at('2026-10-10T07:00:00Z'), at('2026-10-12T16:00:00Z'), NOW)).toBeNull();
  });

  it('accepts exactly the minimum duration of 1 hour', () => {
    expect(validateBookingRange(at('2026-10-10T07:00:00Z'), at('2026-10-10T08:00:00Z'), NOW)).toBeNull();
  });

  it('rejects end before or equal to start', () => {
    expect(validateBookingRange(at('2026-10-10T08:00:00Z'), at('2026-10-10T08:00:00Z'), NOW)).toMatch(/successiva/);
  });

  it('rejects non-hour-aligned times', () => {
    expect(validateBookingRange(at('2026-10-10T07:30:00Z'), at('2026-10-10T09:00:00Z'), NOW)).toMatch(/ore intere/);
  });

  it('rejects bookings with less than 7 days of notice', () => {
    expect(validateBookingRange(at('2026-10-04T08:00:00Z'), at('2026-10-04T10:00:00Z'), NOW)).toMatch(/7 giorni/);
  });

  it('accepts the first bookable hour', () => {
    expect(validateBookingRange(at('2026-10-04T22:00:00Z'), at('2026-10-04T23:00:00Z'), NOW)).toBeNull();
  });

  it('rejects bookings beyond the horizon', () => {
    expect(validateBookingRange(at('2028-01-10T08:00:00Z'), at('2028-01-10T10:00:00Z'), NOW)).toMatch(/limite/);
  });

  it('accepts a booking spanning the DST change (25 Oct 2026)', () => {
    // 24 Oct 20:00 CEST → 26 Oct 09:00 CET
    expect(validateBookingRange(at('2026-10-24T18:00:00Z'), at('2026-10-26T08:00:00Z'), NOW)).toBeNull();
  });

  it('rejects invalid dates', () => {
    expect(validateBookingRange(new Date('x'), at('2026-10-10T08:00:00Z'), NOW)).toMatch(/non valide/);
  });
});

describe('rangesOverlap', () => {
  const r = (s: string, e: string) => ({ start: new Date(s), end: new Date(e) });
  it('detects overlap across days', () => {
    expect(rangesOverlap(r('2026-10-10T00:00Z', '2026-10-12T00:00Z'), r('2026-10-11T10:00Z', '2026-10-11T12:00Z'))).toBe(true);
  });
  it('treats touching ranges as free', () => {
    expect(rangesOverlap(r('2026-10-10T08:00Z', '2026-10-10T10:00Z'), r('2026-10-10T10:00Z', '2026-10-10T12:00Z'))).toBe(false);
  });
});
