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

// ── Request details (form fields beyond the period) ────────────────────────

export const USAGE_TYPES = {
  official_match: 'Gara ufficiale',
  training: 'Allenamento',
  social_sports_event: 'Manifestazione socio-sportiva',
  other: 'Altro',
} as const;
export type UsageType = keyof typeof USAGE_TYPES;

export const AGE_GROUPS = {
  minors: 'Minorenni',
  adults: 'Maggiorenni',
} as const;
export type AgeGroup = keyof typeof AGE_GROUPS;

export const MAX_ESTIMATED_KM = 20_000;

export type BookingDetails = {
  name: string;           // referent
  company: string;        // association / sports club
  email: string;
  phone: string;
  destination: string;
  usage_type: UsageType;
  age_group: AgeGroup;
  estimated_km: number;
  notes: string | null;
  driver_name: string;
  driver_phone: string;
  license_declared: true;
};

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

/** Normalizes and validates the request form. Returns the clean details or an Italian error message. */
export function parseBookingDetails(body: Record<string, unknown>): BookingDetails | string {
  const d = {
    name: str(body.name, 100),
    company: str(body.company, 150),
    email: str(body.email, 255).toLowerCase(),
    phone: str(body.phone, 30),
    destination: str(body.destination, 200),
    usage_type: str(body.usage_type, 40),
    age_group: str(body.age_group, 20),
    estimated_km: Number(body.estimated_km),
    notes: str(body.notes, 1000) || null,
    driver_name: str(body.driver_name, 100),
    driver_phone: str(body.driver_phone, 30),
    license_declared: body.license_declared === true,
  };

  if (d.name.length < 2) return 'Inserisci nome e cognome del referente';
  if (!d.company) return "Inserisci l'associazione / società sportiva";
  if (!EMAIL_RE.test(d.email)) return 'Formato email non valido';
  if (!d.phone) return 'Inserisci il telefono del referente';
  if (!d.destination) return 'Inserisci la destinazione';
  if (!(d.usage_type in USAGE_TYPES)) return 'Seleziona la tipologia di utilizzo';
  if (!(d.age_group in AGE_GROUPS)) return "Seleziona la fascia d'età";
  if (!Number.isInteger(d.estimated_km) || d.estimated_km < 1 || d.estimated_km > MAX_ESTIMATED_KM) {
    return 'Inserisci i chilometri complessivi stimati (numero intero)';
  }
  if (d.driver_name.length < 2) return 'Inserisci nome e cognome del conducente';
  if (!d.driver_phone) return 'Inserisci il telefono del conducente';
  if (!d.license_declared) return 'È necessario dichiarare che il conducente possiede una patente valida';

  return d as BookingDetails;
}
