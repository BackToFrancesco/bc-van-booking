import sql from './db';
import { BOOKING_STATUSES, type BookingStatus } from './booking-rules';
import { findConflict, getBooking } from './repo';
import { sendUserApproved, sendUserRejected, sendUserRescheduled } from './email';
import { loadEmailBooking, sendInBackground } from './notify';

export type UpdateResult = { ok: true } | { ok: false; error: string; status: number };

/**
 * Applies a status and/or period change to a booking (admin).
 * Any status transition is allowed; overlap is re-checked whenever the result is not 'rejected'.
 * Moving to 'rejected' requires a reason, which is sent to the user.
 */
export async function updateBooking(
  id: string,
  changes: { status?: string; start_at?: Date; end_at?: Date; notify?: boolean; rejection_reason?: string },
): Promise<UpdateResult> {
  const current = await getBooking(id);
  if (!current) return { ok: false, error: 'Prenotazione non trovata', status: 404 };

  if (changes.status !== undefined && !BOOKING_STATUSES.includes(changes.status as BookingStatus)) {
    return { ok: false, error: 'Stato non valido', status: 400 };
  }

  const status = (changes.status ?? current.status) as BookingStatus;
  const start = changes.start_at ?? new Date(current.start_at);
  const end = changes.end_at ?? new Date(current.end_at);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
    return { ok: false, error: 'Intervallo non valido', status: 400 };
  }

  const statusChanged = status !== current.status;
  const timeChanged =
    start.getTime() !== new Date(current.start_at).getTime() ||
    end.getTime() !== new Date(current.end_at).getTime();
  if (!statusChanged && !timeChanged) return { ok: true };

  const reason = changes.rejection_reason?.trim().slice(0, 1000) || null;
  if (statusChanged && status === 'rejected' && !reason) {
    return { ok: false, error: 'Indica la motivazione del rifiuto', status: 400 };
  }

  if (status !== 'rejected') {
    const conflict = await findConflict(current.van_id, start, end, id);
    if (conflict) return { ok: false, error: conflict, status: 409 };
  }

  await sql`
    UPDATE bookings
    SET status = ${status}, start_at = ${start}, end_at = ${end},
        rejection_reason = ${status === 'rejected' ? (reason ?? current.rejection_reason) : null}
    WHERE id = ${id}
  `;

  if (changes.notify !== false) {
    const b = await loadEmailBooking(id);
    if (b) {
      if (statusChanged && status === 'approved') sendInBackground('sendUserApproved', sendUserApproved(b));
      else if (statusChanged && status === 'rejected') sendInBackground('sendUserRejected', sendUserRejected(b));
      else if (timeChanged && status !== 'rejected') {
        sendInBackground('sendUserRescheduled', sendUserRescheduled({
          ...b, old_start_at: current.start_at, old_end_at: current.end_at,
        }));
      }
    }
  }
  return { ok: true };
}
