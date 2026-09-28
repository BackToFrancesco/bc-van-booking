import { TZ } from './config';

export type RomeParts = { year: number; month: number; day: number; hour: number; minute: number; second: number };

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  year: 'numeric', month: 'numeric', day: 'numeric',
  hour: 'numeric', minute: 'numeric', second: 'numeric',
  hour12: false,
});

export function getRomeParts(date: Date): RomeParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter.formatToParts(date)) {
    if (p.type !== 'literal' && p.type !== 'dayPeriod') out[p.type] = parseInt(p.value, 10);
  }
  return {
    year: out.year, month: out.month, day: out.day,
    hour: out.hour === 24 ? 0 : out.hour, minute: out.minute, second: out.second,
  };
}

/** Converts a Rome wall-clock time ("YYYY-MM-DD", hour) to the matching UTC instant (DST-aware). */
export function romeDateTime(dateStr: string, hour: number, minute = 0): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  // Offset of Rome at the guessed instant, then correct once more around DST switches
  let ts = guess;
  for (let i = 0; i < 2; i++) {
    const p = getRomeParts(new Date(ts));
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    ts = ts - (asUtc - guess);
  }
  return new Date(ts);
}

/** "YYYY-MM-DD" of the given instant in Rome. */
export function romeDateStr(date: Date): string {
  const p = getRomeParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** Day of week (0=Sun) of a "YYYY-MM-DD" calendar date. */
export function dayOfWeek(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString('it-IT', {
    weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', timeZone: TZ,
  });
}

export function formatRange(start: Date | string, end: Date | string): string {
  return `${formatDateTime(start)} → ${formatDateTime(end)}`;
}

/** Human duration in Italian, e.g. "1 g 9 h", "3 h". */
export function formatDuration(ms: number): string {
  const totalHours = Math.round(ms / 3_600_000);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days === 0) return `${hours} h`;
  if (hours === 0) return `${days} g`;
  return `${days} g ${hours} h`;
}
