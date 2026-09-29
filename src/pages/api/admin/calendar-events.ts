import type { APIRoute } from 'astro';
import sql from '../../../lib/db';
import { json, error, parseRangeParams } from '../../../lib/http';
import { vanLabel } from '../../../lib/vans';

const STATUS_COLOR: Record<string, string> = {
  pending:  '#eab308',
  approved: '#dc2626',
  rejected: '#9ca3af',
  blocked:  '#374151',
};

export const GET: APIRoute = async ({ url }) => {
  const van = url.searchParams.get('van') || null; // null = all vans
  const range = parseRangeParams(url);
  if (typeof range === 'string') return error(range);

  const [bookings, blocked] = await Promise.all([
    sql`
      SELECT b.id, b.van_id, v.name AS van_name, v.model AS van_model, b.name, b.company, b.email, b.phone,
             b.start_at, b.end_at, b.status, b.destination, b.usage_type, b.age_group, b.estimated_km,
             b.notes, b.driver_name, b.driver_phone, b.license_declared, b.rejection_reason
      FROM bookings b JOIN vans v ON v.id = b.van_id
      WHERE (${van}::text IS NULL OR b.van_id = ${van})
        AND b.start_at < ${range.to} AND b.end_at > ${range.from}
    `,
    sql`
      SELECT s.id, s.van_id, v.name AS van_name, v.model AS van_model, s.start_at, s.end_at, s.reason, s.series_id
      FROM blocked_slots s LEFT JOIN vans v ON v.id = s.van_id
      WHERE (${van}::text IS NULL OR s.van_id IS NULL OR s.van_id = ${van})
        AND s.start_at < ${range.to} AND s.end_at > ${range.from}
    `,
  ]);

  const events = [
    ...bookings.map((b) => ({
      id: b.id,
      title: `${van ? '' : `${b.van_name} · `}${b.company} — ${b.name}`,
      start: b.start_at,
      end: b.end_at,
      backgroundColor: STATUS_COLOR[b.status],
      borderColor: STATUS_COLOR[b.status],
      classNames: b.status === 'rejected' ? ['ev-rejected'] : [],
      extendedProps: {
        type: 'booking', bookingId: b.id, vanId: b.van_id,
        vanName: vanLabel({ name: b.van_name, model: b.van_model }),
        name: b.name, company: b.company, email: b.email, phone: b.phone, status: b.status,
        destination: b.destination, usageType: b.usage_type, ageGroup: b.age_group, estimatedKm: b.estimated_km,
        notes: b.notes, driverName: b.driver_name, driverPhone: b.driver_phone,
        licenseDeclared: b.license_declared, rejectionReason: b.rejection_reason,
      },
    })),
    ...blocked.map((s) => ({
      id: s.id,
      title: `🔒 ${s.van_name ?? 'Tutti i pulmini'}${s.reason ? ` · ${s.reason}` : ''}`,
      start: s.start_at,
      end: s.end_at,
      backgroundColor: STATUS_COLOR.blocked,
      borderColor: STATUS_COLOR.blocked,
      extendedProps: {
        type: 'blocked', blockId: s.id, vanId: s.van_id, vanName: s.van_name ? vanLabel({ name: s.van_name, model: s.van_model }) : 'Tutti i pulmini',
        reason: s.reason, seriesId: s.series_id,
      },
    })),
  ];

  return json(events);
};
