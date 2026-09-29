import type { APIRoute } from 'astro';
import { updateBooking } from '../../../../../lib/booking-actions';
import { json, error, readJson } from '../../../../../lib/http';

export const POST: APIRoute = async ({ params, request }) => {
  const body = await readJson<{ reason?: string }>(request);
  const result = await updateBooking(params.id!, { status: 'rejected', rejection_reason: body?.reason ?? '' });
  if (!result.ok) return error(result.error, result.status);
  return json({ ok: true });
};
