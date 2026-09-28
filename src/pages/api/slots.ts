import type { APIRoute } from 'astro';
import sql from '../../lib/db';
import { json, error, parseRangeParams } from '../../lib/http';

// Public availability for one van: no personal data.
export const GET: APIRoute = async ({ url }) => {
  const van = url.searchParams.get('van');
  if (!van) return error('Parametro "van" obbligatorio');
  const range = parseRangeParams(url);
  if (typeof range === 'string') return error(range);

  const [bookings, blocked] = await Promise.all([
    sql`
      SELECT start_at, end_at, status FROM bookings
      WHERE van_id = ${van} AND status != 'rejected'
        AND start_at < ${range.to} AND end_at > ${range.from}
    `,
    sql`
      SELECT start_at, end_at, reason FROM blocked_slots
      WHERE (van_id IS NULL OR van_id = ${van})
        AND start_at < ${range.to} AND end_at > ${range.from}
    `,
  ]);

  return json({ bookings, blocked });
};
