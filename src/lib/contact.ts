// Server-only: contact details come from env vars so they are not committed to the repo.
// Do not import this file from client-side <script> blocks.

export const MAIL_FROM = import.meta.env.MAIL_FROM || 'pulmini@basketconselve.com';

const name = import.meta.env.CONTACT_NAME ?? '';
const phone = import.meta.env.CONTACT_PHONE ?? ''; // e.g. "+39 333 123 4567"

export type Contact = { name: string; phone: string; waLink: string };

/** WhatsApp contact shown on the site and in emails, or null if not configured. */
export const CONTACT: Contact | null = name && phone
  ? { name, phone, waLink: `https://wa.me/${phone.replace(/\D/g, '')}` }
  : null;
