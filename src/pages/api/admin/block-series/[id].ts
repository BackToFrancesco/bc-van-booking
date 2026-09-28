import type { APIRoute } from 'astro';
import sql from '../../../../lib/db';
import { json, error } from '../../../../lib/http';

// Deleting the series cascades to all its blocked_slots occurrences.
export const DELETE: APIRoute = async ({ params }) => {
  const [deleted] = await sql`DELETE FROM block_series WHERE id = ${params.id!} RETURNING id`;
  if (!deleted) return error('Serie non trovata', 404);
  return json({ ok: true });
};
