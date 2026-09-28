import type { APIRoute } from 'astro';
import sql from '../../../../lib/db';
import { getVan, listBlockSeries } from '../../../../lib/repo';
import { json, error, readJson } from '../../../../lib/http';

type Body = {
  van?: string | null; weekdays?: number[]; start_hour?: number; end_hour?: number;
  valid_from?: string; valid_to?: string; reason?: string; force?: boolean;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const GET: APIRoute = async () => json(await listBlockSeries());

/**
 * Creates a recurring block and materializes one blocked_slots row per matching day
 * (Rome wall-clock hours, DST-aware). Without `force`, returns 409 with the list of
 * non-rejected bookings it would overlap.
 */
export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<Body>(request);
  if (!body) return error('JSON non valido');

  const weekdays = [...new Set(body.weekdays ?? [])].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  const startHour = Number(body.start_hour);
  const endHour = Number(body.end_hour);
  const { valid_from: from, valid_to: to } = body;

  if (weekdays.length === 0) return error('Seleziona almeno un giorno della settimana');
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || endHour > 24 || startHour >= endHour) {
    return error("L'ora di inizio deve essere precedente all'ora di fine");
  }
  if (!from || !to || !DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    return error('Periodo di validità non valido');
  }

  const vanId = body.van || null;
  if (vanId && !(await getVan(vanId))) return error('Pulmino non trovato', 404);
  const reason = body.reason?.trim().slice(0, 255) || null;
  const weekdaysStr = weekdays.sort().join(',');

  if (!body.force) {
    const conflicts = await sql`
      WITH occ AS (
        SELECT (d::date + make_interval(hours => ${startHour}::int)) AT TIME ZONE 'Europe/Rome' AS s,
               (d::date + make_interval(hours => ${endHour}::int)) AT TIME ZONE 'Europe/Rome' AS e
        FROM generate_series(${from}::date, ${to}::date, interval '1 day') d
        WHERE extract(dow from d)::int = ANY(string_to_array(${weekdaysStr}::text, ',')::int[])
      )
      SELECT DISTINCT b.id, v.name AS van_name, b.company, b.name, b.start_at, b.end_at, b.status
      FROM bookings b JOIN vans v ON v.id = b.van_id JOIN occ ON b.start_at < occ.e AND b.end_at > occ.s
      WHERE b.status != 'rejected' AND (${vanId}::text IS NULL OR b.van_id = ${vanId})
      ORDER BY b.start_at
    `;
    if (conflicts.length > 0) {
      return json({ error: 'Il blocco si sovrappone a prenotazioni esistenti', conflicts }, 409);
    }
  }

  const [series] = await sql<{ id: string }>`
    INSERT INTO block_series (van_id, weekdays, start_hour, end_hour, valid_from, valid_to, reason)
    VALUES (${vanId}, ${weekdaysStr}, ${startHour}, ${endHour}, ${from}, ${to}, ${reason})
    RETURNING id
  `;
  const inserted = await sql`
    INSERT INTO blocked_slots (van_id, start_at, end_at, reason, series_id)
    SELECT ${vanId}, (d::date + make_interval(hours => ${startHour}::int)) AT TIME ZONE 'Europe/Rome',
           (d::date + make_interval(hours => ${endHour}::int)) AT TIME ZONE 'Europe/Rome',
           ${reason}, ${series.id}::uuid
    FROM generate_series(${from}::date, ${to}::date, interval '1 day') d
    WHERE extract(dow from d)::int = ANY(string_to_array(${weekdaysStr}::text, ',')::int[])
    RETURNING id
  `;

  return json({ ok: true, id: series.id, occurrences: inserted.length }, 201);
};
