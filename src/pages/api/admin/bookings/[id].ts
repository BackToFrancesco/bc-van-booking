import type { APIRoute } from 'astro';
import sql from '../../../../lib/db';
import { updateBooking } from '../../../../lib/booking-actions';
import { json, error, readJson } from '../../../../lib/http';

export const DELETE: APIRoute = async ({ params }) => {
  const [deleted] = await sql`DELETE FROM bookings WHERE id = ${params.id!} RETURNING id`;
  if (!deleted) return error('Prenotazione non trovata', 404);
  return json({ ok: true });
};

export const PATCH: APIRoute = async ({ params, request }) => {
  const body = await readJson<{ status?: string; start_at?: string; end_at?: string; notify?: boolean; rejection_reason?: string }>(request);
  if (!body) return error('JSON non valido');
  if (body.status === undefined && body.start_at === undefined && body.end_at === undefined) {
    return error('Nessun dato da aggiornare');
  }

  const result = await updateBooking(params.id!, {
    status: body.status,
    start_at: body.start_at ? new Date(body.start_at) : undefined,
    end_at: body.end_at ? new Date(body.end_at) : undefined,
    notify: body.notify,
    rejection_reason: body.rejection_reason,
  });
  if (!result.ok) return error(result.error, result.status);
  return json({ ok: true });
};
