import type { APIRoute } from 'astro';
import sql from '../../../lib/db';
import { validateBookingRange } from '../../../lib/booking-rules';
import { findConflict, getVan } from '../../../lib/repo';
import { sendAdminNewBooking, sendUserBookingReceived } from '../../../lib/email';
import { loadEmailBooking, sendInBackground } from '../../../lib/notify';
import { json, error, readJson } from '../../../lib/http';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

type Body = {
  van?: string; name?: string; company?: string; email?: string; phone?: string;
  start_at?: string; end_at?: string;
};

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<Body>(request);
  if (!body) return error('JSON non valido');

  const vanId = body.van?.trim() ?? '';
  const name = body.name?.trim().slice(0, 100) ?? '';
  const company = body.company?.trim().slice(0, 150) ?? '';
  const email = body.email?.trim().toLowerCase().slice(0, 255) ?? '';
  const phone = body.phone?.trim().slice(0, 30) ?? '';

  if (!vanId || !name || !company || !email || !phone || !body.start_at || !body.end_at) {
    return error('Pulmino, nome, società, email, telefono, inizio e fine sono obbligatori');
  }
  if (name.length < 2) return error('Nome troppo corto');
  if (!EMAIL_RE.test(email)) return error('Formato email non valido');

  const van = await getVan(vanId);
  if (!van) return error('Pulmino non trovato', 404);

  const start = new Date(body.start_at);
  const end = new Date(body.end_at);
  const invalid = validateBookingRange(start, end);
  if (invalid) return error(invalid);

  const conflict = await findConflict(vanId, start, end);
  if (conflict) return error(conflict, 409);

  const [booking] = await sql<{ id: string }>`
    INSERT INTO bookings (van_id, name, company, email, phone, start_at, end_at, status)
    VALUES (${vanId}, ${name}, ${company}, ${email}, ${phone}, ${start}, ${end}, 'pending')
    RETURNING id
  `;

  const emailBooking = await loadEmailBooking(booking.id);
  if (emailBooking) {
    sendInBackground('sendAdminNewBooking', sendAdminNewBooking(emailBooking));
    sendInBackground('sendUserBookingReceived', sendUserBookingReceived(emailBooking));
  }

  return json({ ok: true, id: booking.id }, 201);
};
