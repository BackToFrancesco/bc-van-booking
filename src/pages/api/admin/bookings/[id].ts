import type { APIRoute } from 'astro';
import { updateBooking } from '../../../../lib/booking-actions';
import { json, error, readJson } from '../../../../lib/http';

// No DELETE on purpose: bookings are never removed, cancelling one means rejecting it (kept in the history).

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
