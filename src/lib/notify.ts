import { waitUntil } from '@vercel/functions';
import sql from './db';
import type { EmailBooking } from './email';

/** Loads a booking joined with its van name, in the shape the email templates expect. */
export async function loadEmailBooking(id: string): Promise<EmailBooking | null> {
  const [b] = await sql<EmailBooking>`
    SELECT b.id, b.name, b.company, b.email, b.phone, b.start_at, b.end_at, v.name AS van_name
    FROM bookings b JOIN vans v ON v.id = b.van_id
    WHERE b.id = ${id}
  `;
  return b ?? null;
}

/** Fire-and-forget email send that survives the response on Vercel. */
export function sendInBackground(label: string, promise: Promise<unknown>): void {
  waitUntil(promise.catch((err) => console.error(`${label} failed:`, err)));
}
