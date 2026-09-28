import { MIN_ADVANCE_DAYS, MIN_BOOKING_HOURS, MAX_BOOKING_HOURS, BOOKING_HORIZON_MS, SLOT_MS } from './config';
import { getRomeParts, romeDateStr, addDays, romeDateTime } from './time';

export const BOOKING_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export type Range = { start: Date; end: Date };

export function rangesOverlap(a: Range, b: Range): boolean {
  return a.start < b.end && a.end > b.start;
}

/** First bookable instant: midnight (Rome) of today + MIN_ADVANCE_DAYS. */
export function earliestBookableStart(now: Date): Date {
  return romeDateTime(addDays(romeDateStr(now), MIN_ADVANCE_DAYS), 0);
}

/** Returns an Italian error message, or null if the range is valid. */
export function validateBookingRange(start: Date, end: Date, now: Date = new Date()): string | null {
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'Date non valide';
  if (end <= start) return "La data di fine deve essere successiva a quella di inizio";

  for (const d of [start, end]) {
    const p = getRomeParts(d);
    if (p.minute !== 0 || p.second !== 0 || d.getMilliseconds() !== 0) {
      return 'Inizio e fine devono essere a ore intere';
    }
  }

  const durationMs = end.getTime() - start.getTime();
  if (durationMs % SLOT_MS !== 0) return 'La durata deve essere un multiplo di 1 ora';
  if (durationMs < MIN_BOOKING_HOURS * 3_600_000) return `La durata minima è ${MIN_BOOKING_HOURS} ora`;
  if (MAX_BOOKING_HOURS !== null && durationMs > MAX_BOOKING_HOURS * 3_600_000) {
    return `La durata massima è ${MAX_BOOKING_HOURS} ore`;
  }

  if (start < earliestBookableStart(now)) {
    return `Le prenotazioni vanno richieste con almeno ${MIN_ADVANCE_DAYS} giorni di anticipo`;
  }
  if (start.getTime() > now.getTime() + BOOKING_HORIZON_MS) {
    return 'Data oltre il limite di prenotazione consentito';
  }
  return null;
}
