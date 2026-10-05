import sql from './db';
import type { BookingStatus } from './booking-rules';

export type Van = {
  id: string; name: string; model: string | null; seats: number; description: string | null; photo: string | null;
  pickup_location: string | null; return_instructions: string | null;
};

export type Booking = {
  id: string; van_id: string; name: string; company: string; email: string; phone: string;
  start_at: Date; end_at: Date; status: BookingStatus; created_at: Date;
  destination: string | null; usage_type: string | null; age_group: string | null; estimated_km: number | null;
  notes: string | null; driver_name: string | null; driver_phone: string | null; license_declared: boolean;
  rejection_reason: string | null;
};

export type BlockedSlot = {
  id: string; van_id: string | null; start_at: Date; end_at: Date; reason: string | null; series_id: string | null;
};

export type BlockSeries = {
  id: string; van_id: string | null; weekdays: string; start_hour: number; end_hour: number;
  valid_from: string; valid_to: string; reason: string | null; occurrences: number;
};

export async function listVans(): Promise<Van[]> {
  return sql<Van>`SELECT id, name, model, seats, description, photo, pickup_location, return_instructions FROM vans ORDER BY sort_order, id`;
}

export async function getVan(id: string): Promise<Van | null> {
  const [van] = await sql<Van>`SELECT id, name, model, seats, description, photo, pickup_location, return_instructions FROM vans WHERE id = ${id}`;
  return van ?? null;
}

export async function getBooking(id: string): Promise<Booking | null> {
  const [b] = await sql<Booking>`SELECT * FROM bookings WHERE id = ${id}`;
  return b ?? null;
}

/**
 * Returns a short Italian description of what the range collides with, or null if free.
 * Rejected bookings never block; blocks with van_id NULL apply to every van.
 */
export async function findConflict(
  vanId: string, start: Date, end: Date, excludeBookingId: string | null = null,
): Promise<string | null> {
  const [booking] = await sql<{ id: string }>`
    SELECT id FROM bookings
    WHERE van_id = ${vanId} AND status != 'rejected'
      AND start_at < ${end} AND end_at > ${start}
      AND (${excludeBookingId}::uuid IS NULL OR id != ${excludeBookingId}::uuid)
    LIMIT 1
  `;
  if (booking) return 'Il pulmino è già prenotato in quel periodo';

  const [block] = await sql<{ id: string }>`
    SELECT id FROM blocked_slots
    WHERE (van_id IS NULL OR van_id = ${vanId})
      AND start_at < ${end} AND end_at > ${start}
    LIMIT 1
  `;
  if (block) return 'Il pulmino non è disponibile in quel periodo';
  return null;
}

export async function listPendingBookings(): Promise<(Booking & { van_name: string; van_model: string | null })[]> {
  return sql<Booking & { van_name: string; van_model: string | null }>`
    SELECT b.*, v.name AS van_name, v.model AS van_model
    FROM bookings b JOIN vans v ON v.id = b.van_id
    WHERE b.status = 'pending'
    ORDER BY b.start_at ASC
  `;
}

export async function listBlockSeries(): Promise<BlockSeries[]> {
  return sql<BlockSeries>`
    SELECT s.id, s.van_id, s.weekdays, s.start_hour, s.end_hour,
           to_char(s.valid_from, 'YYYY-MM-DD') AS valid_from,
           to_char(s.valid_to, 'YYYY-MM-DD') AS valid_to,
           s.reason,
           (SELECT COUNT(*)::int FROM blocked_slots b WHERE b.series_id = s.id) AS occurrences
    FROM block_series s
    ORDER BY s.valid_from, s.created_at
  `;
}
