import type { APIRoute } from 'astro';
import { updateBooking } from '../../../../../lib/booking-actions';
import { json, error } from '../../../../../lib/http';

export const POST: APIRoute = async ({ params }) => {
  const result = await updateBooking(params.id!, { status: 'approved' });
  if (!result.ok) return error(result.error, result.status);
  return json({ ok: true });
};
