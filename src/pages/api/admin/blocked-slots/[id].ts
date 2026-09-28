import type { APIRoute } from 'astro';
import sql from '../../../../lib/db';
import { json, error } from '../../../../lib/http';

export const DELETE: APIRoute = async ({ params }) => {
  const [deleted] = await sql`DELETE FROM blocked_slots WHERE id = ${params.id!} RETURNING id`;
  if (!deleted) return error('Blocco non trovato', 404);
  return json({ ok: true });
};
