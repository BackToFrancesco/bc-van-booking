import type { APIRoute } from 'astro';
import { findConflict, listVans } from '../../lib/repo';
import { validateBookingRange } from '../../lib/booking-rules';
import { json, error } from '../../lib/http';

// Public: which vans (other than `exclude`) are free for the whole period. No personal data.
export const GET: APIRoute = async ({ url }) => {
  const start = new Date(url.searchParams.get('start') ?? '');
  const end = new Date(url.searchParams.get('end') ?? '');
  const invalid = validateBookingRange(start, end);
  if (invalid) return error(invalid);

  const exclude = url.searchParams.get('exclude');
  const vans = (await listVans()).filter((v) => v.id !== exclude);
  const conflicts = await Promise.all(vans.map((v) => findConflict(v.id, start, end)));
  const free = vans
    .filter((_, i) => conflicts[i] === null)
    .map((v) => ({ id: v.id, name: v.name, seats: v.seats }));

  return json({ free });
};
