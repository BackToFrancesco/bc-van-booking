import type { APIRoute } from 'astro';
import sql from '../../../lib/db';
import { validateBookingRange, parseBookingDetails } from '../../../lib/booking-rules';
import { findConflict, getVan } from '../../../lib/repo';
import { sendAdminNewBooking, sendUserBookingReceived } from '../../../lib/email';
import { loadEmailBooking, sendInBackground } from '../../../lib/notify';
import { json, error, readJson } from '../../../lib/http';

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<Record<string, unknown>>(request);
  if (!body) return error('JSON non valido');

  const vanId = typeof body.van === 'string' ? body.van.trim() : '';
  if (!vanId || typeof body.start_at !== 'string' || typeof body.end_at !== 'string') {
    return error('Pulmino, inizio e fine sono obbligatori');
  }

  const d = parseBookingDetails(body);
  if (typeof d === 'string') return error(d);

  const van = await getVan(vanId);
  if (!van) return error('Pulmino non trovato', 404);

  const start = new Date(body.start_at);
  const end = new Date(body.end_at);
  const invalid = validateBookingRange(start, end);
  if (invalid) return error(invalid);

  const conflict = await findConflict(vanId, start, end);
  if (conflict) return error(conflict, 409);

  const [booking] = await sql<{ id: string }>`
    INSERT INTO bookings (
      van_id, name, company, email, phone, start_at, end_at, status,
      destination, usage_type, age_group, estimated_km, notes, driver_name, driver_phone, license_declared
    )
    VALUES (
      ${vanId}, ${d.name}, ${d.company}, ${d.email}, ${d.phone}, ${start}, ${end}, 'pending',
      ${d.destination}, ${d.usage_type}, ${d.age_group}, ${d.estimated_km}, ${d.notes},
      ${d.driver_name}, ${d.driver_phone}, ${d.license_declared}
    )
    RETURNING id
  `;

  const emailBooking = await loadEmailBooking(booking.id);
  if (emailBooking) {
    sendInBackground('sendAdminNewBooking', sendAdminNewBooking(emailBooking));
    sendInBackground('sendUserBookingReceived', sendUserBookingReceived(emailBooking));
  }

  return json({ ok: true, id: booking.id }, 201);
};
