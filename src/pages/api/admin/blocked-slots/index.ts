import type { APIRoute } from 'astro';
import sql from '../../../../lib/db';
import { getVan } from '../../../../lib/repo';
import { json, error, readJson } from '../../../../lib/http';

export const POST: APIRoute = async ({ request }) => {
  const body = await readJson<{ van?: string | null; start_at?: string; end_at?: string; reason?: string }>(request);
  if (!body?.start_at || !body?.end_at) return error('Inizio e fine obbligatori');

  const start = new Date(body.start_at);
  const end = new Date(body.end_at);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) return error('Intervallo non valido');

  const vanId = body.van || null;
  if (vanId && !(await getVan(vanId))) return error('Pulmino non trovato', 404);
  const reason = body.reason?.trim().slice(0, 255) || null;

  const [row] = await sql<{ id: string }>`
    INSERT INTO blocked_slots (van_id, start_at, end_at, reason)
    VALUES (${vanId}, ${start}, ${end}, ${reason})
    RETURNING id
  `;
  return json({ ok: true, id: row.id }, 201);
};
