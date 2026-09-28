import nodemailer from 'nodemailer';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { TZ } from './config';
import { CONTACT, MAIL_FROM } from './contact';
import { formatDuration } from './time';

const SENDER_NAME = 'Basket Conselve — Pulmini';
const SUBJECT_PREFIX = 'BC Pulmini';

export const OUTBOX_FILE = resolve(process.cwd(), '.mail-outbox/emails.json');

type MailOptions = { from: string; to: string; subject: string; text: string; html: string };
export type OutboxEmail = MailOptions & { id: string; timestamp: string };

export function isMockTransport(): boolean {
  return (import.meta.env.EMAIL_TRANSPORT ?? 'mock') !== 'smtp';
}

export function readOutbox(): OutboxEmail[] {
  try {
    return existsSync(OUTBOX_FILE) ? JSON.parse(readFileSync(OUTBOX_FILE, 'utf8')) : [];
  } catch {
    return [];
  }
}

function getTransport(): { sendMail: (m: MailOptions) => Promise<unknown> } {
  if (isMockTransport()) {
    return {
      sendMail: async (mail) => {
        const emails = readOutbox();
        emails.push({ id: crypto.randomUUID(), timestamp: new Date().toISOString(), ...mail });
        mkdirSync(resolve(OUTBOX_FILE, '..'), { recursive: true });
        writeFileSync(OUTBOX_FILE, JSON.stringify(emails, null, 2), 'utf8');
        console.log(`[mock email] to=${mail.to} subject="${mail.subject}"`);
        return { messageId: 'mock-message-id' };
      },
    };
  }

  // basketconselve.com is on Google Workspace: SMTP via Gmail with an App Password of the sender account
  const port = Number(import.meta.env.SMTP_PORT ?? 465);
  return nodemailer.createTransport({
    host: import.meta.env.SMTP_HOST ?? 'smtp.gmail.com',
    port,
    secure: port === 465,
    auth: { user: import.meta.env.SMTP_USER, pass: import.meta.env.SMTP_PASSWORD },
  });
}

function fromHeader(): string {
  return `"${SENDER_NAME}" <${MAIL_FROM}>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function contactBlockText(): string {
  if (!CONTACT) return '';
  const { name: CONTACT_NAME, phone: CONTACT_NUMBER, waLink: CONTACT_WA_LINK } = CONTACT;
  return `Per qualsiasi dubbio o domanda, scrivi su WhatsApp a ${CONTACT_NUMBER} (${CONTACT_NAME}):\n${CONTACT_WA_LINK}`;
}

function contactBlockHtml(): string {
  if (!CONTACT) return '';
  const { name: CONTACT_NAME, phone: CONTACT_NUMBER, waLink: CONTACT_WA_LINK } = CONTACT;
  return `<div style="margin-top:1.5rem;padding-top:0.75rem;border-top:1px solid #eee;font-size:0.92em;color:#444;">
        <p style="margin:0 0 0.6rem 0;">Per qualsiasi dubbio o domanda, scrivi su WhatsApp a ${CONTACT_NAME} (${CONTACT_NUMBER}):</p>
        <a href="${CONTACT_WA_LINK}" style="background:#25d366;color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;font-size:0.95em;">Scrivi su WhatsApp</a>
      </div>`;
}

export function formatDateTime(d: Date | string): string {
  return new Date(d).toLocaleString('it-IT', {
    weekday: 'long', day: '2-digit', month: 'long',
    year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: TZ,
  });
}

function formatDate(d: Date | string): string {
  return new Date(d).toLocaleString('it-IT', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric', timeZone: TZ,
  });
}

export function periodText(start: Date | string, end: Date | string): string {
  return `dal ${formatDateTime(start)} al ${formatDateTime(end)}`;
}

function durationText(start: Date | string, end: Date | string): string {
  return formatDuration(new Date(end).getTime() - new Date(start).getTime());
}

export type EmailBooking = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  van_name: string;
  start_at: Date | string;
  end_at: Date | string;
};

function siteUrl(): string {
  return import.meta.env.SITE_URL ?? 'http://localhost:4321';
}

export async function sendAdminNewBooking(b: EmailBooking) {
  const adminUrl = `${siteUrl()}/admin`;
  const text = `Nuova richiesta di prenotazione pulmino

Pulmino: ${b.van_name}
Periodo: ${periodText(b.start_at, b.end_at)}
Durata: ${durationText(b.start_at, b.end_at)}
Nome: ${b.name}
Società: ${b.company}
Email: ${b.email}
Telefono: ${b.phone}
ID prenotazione: ${b.id}

Vai alla pagina admin per accettare o rifiutare:
${adminUrl}
`;

  await getTransport().sendMail({
    from: fromHeader(),
    to: import.meta.env.ADMIN_EMAIL,
    subject: `${SUBJECT_PREFIX} — Nuova richiesta — ${b.van_name} — ${b.company} — ${formatDate(b.start_at)}`,
    text,
    html: `
      <h2>Nuova richiesta di prenotazione pulmino</h2>
      <p><strong>Pulmino:</strong> ${escapeHtml(b.van_name)}</p>
      <p><strong>Periodo:</strong> ${periodText(b.start_at, b.end_at)}</p>
      <p><strong>Durata:</strong> ${durationText(b.start_at, b.end_at)}</p>
      <p><strong>Nome:</strong> ${escapeHtml(b.name)}</p>
      <p><strong>Società:</strong> ${escapeHtml(b.company)}</p>
      <p><strong>Email:</strong> ${escapeHtml(b.email)}</p>
      <p><strong>Telefono:</strong> ${escapeHtml(b.phone)}</p>
      <p><strong>ID prenotazione:</strong> <code>${b.id}</code></p>
      <p>
        <a href="${adminUrl}" style="background:#C8102E;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">
          Apri la pagina admin
        </a>
      </p>
    `,
  });
}

export async function sendUserBookingReceived(b: EmailBooking) {
  const shortId = b.id.slice(0, 8);
  const text = `Ciao ${b.name},

abbiamo ricevuto la tua richiesta di prenotazione.

Pulmino: ${b.van_name}
Periodo: ${periodText(b.start_at, b.end_at)}
Durata: ${durationText(b.start_at, b.end_at)}
Società: ${b.company}

La richiesta è in attesa di approvazione. Riceverai un'altra email quando confermeremo la disponibilità del pulmino.

Codice prenotazione: ${shortId}

A presto,
Basket Conselve

${contactBlockText()}
`;

  await getTransport().sendMail({
    from: fromHeader(),
    to: b.email,
    subject: `${SUBJECT_PREFIX} — Richiesta ricevuta — ${formatDate(b.start_at)}`,
    text,
    html: `
      <h2>Abbiamo ricevuto la tua richiesta</h2>
      <p>Ciao ${escapeHtml(b.name)},</p>
      <p>abbiamo ricevuto la tua richiesta di prenotazione.</p>
      <p><strong>Pulmino:</strong> ${escapeHtml(b.van_name)}</p>
      <p><strong>Periodo:</strong> ${periodText(b.start_at, b.end_at)}</p>
      <p><strong>Durata:</strong> ${durationText(b.start_at, b.end_at)}</p>
      <p><strong>Società:</strong> ${escapeHtml(b.company)}</p>
      <p style="background:#fff3cd;border-left:4px solid #f59e0b;padding:0.7rem 1rem;border-radius:4px;">
        <strong>In attesa di approvazione.</strong> Riceverai un'altra email quando confermeremo la disponibilità del pulmino.
      </p>
      <p style="font-size:0.9em;color:#666;">Codice prenotazione: <code>${shortId}</code></p>
      <p>A presto,<br>Basket Conselve</p>
      ${contactBlockHtml()}
    `,
  });
}

export async function sendUserApproved(b: EmailBooking) {
  const shortId = b.id.slice(0, 8);
  const text = `Ciao ${b.name},

la tua prenotazione è confermata: il pulmino è disponibile.

Pulmino: ${b.van_name}
Periodo: ${periodText(b.start_at, b.end_at)}
Durata: ${durationText(b.start_at, b.end_at)}

Codice prenotazione: ${shortId}

Buon viaggio!
Basket Conselve

${contactBlockText()}
`;

  await getTransport().sendMail({
    from: fromHeader(),
    to: b.email,
    subject: `${SUBJECT_PREFIX} — Prenotazione confermata — ${formatDate(b.start_at)}`,
    text,
    html: `
      <h2>Prenotazione confermata!</h2>
      <p>Ciao ${escapeHtml(b.name)},</p>
      <p>la tua prenotazione è confermata: il pulmino è disponibile.</p>
      <p><strong>Pulmino:</strong> ${escapeHtml(b.van_name)}</p>
      <p><strong>Periodo:</strong> ${periodText(b.start_at, b.end_at)}</p>
      <p><strong>Durata:</strong> ${durationText(b.start_at, b.end_at)}</p>
      <p style="font-size:0.9em;color:#666;">Codice prenotazione: <code>${shortId}</code></p>
      <p>Buon viaggio!<br>Basket Conselve</p>
      ${contactBlockHtml()}
    `,
  });
}

export async function sendUserRejected(b: EmailBooking) {
  const text = `Ciao ${b.name},

purtroppo il pulmino non è disponibile per il periodo richiesto (${periodText(b.start_at, b.end_at)}).

Puoi effettuare una nuova richiesta per un altro periodo o un altro pulmino.

A presto,
Basket Conselve

${contactBlockText()}
`;

  await getTransport().sendMail({
    from: fromHeader(),
    to: b.email,
    subject: `${SUBJECT_PREFIX} — Aggiornamento prenotazione — ${formatDate(b.start_at)}`,
    text,
    html: `
      <h2>Aggiornamento sulla tua prenotazione</h2>
      <p>Ciao ${escapeHtml(b.name)},</p>
      <p>purtroppo il pulmino <strong>${escapeHtml(b.van_name)}</strong> non è disponibile per il periodo richiesto (${periodText(b.start_at, b.end_at)}).</p>
      <p>Puoi effettuare una nuova richiesta per un altro periodo o un altro pulmino.</p>
      <p>A presto,<br>Basket Conselve</p>
      ${contactBlockHtml()}
    `,
  });
}

export async function sendUserRescheduled(b: EmailBooking & { old_start_at: Date | string; old_end_at: Date | string }) {
  const shortId = b.id.slice(0, 8);
  const text = `Ciao ${b.name},

il periodo della tua prenotazione del pulmino ${b.van_name} è stato modificato.

Vecchio periodo: ${periodText(b.old_start_at, b.old_end_at)}
Nuovo periodo:   ${periodText(b.start_at, b.end_at)}

Codice prenotazione: ${shortId}

A presto,
Basket Conselve

${contactBlockText()}
`;

  await getTransport().sendMail({
    from: fromHeader(),
    to: b.email,
    subject: `${SUBJECT_PREFIX} — Periodo aggiornato — ${formatDate(b.start_at)}`,
    text,
    html: `
      <h2>Il periodo della tua prenotazione è stato aggiornato</h2>
      <p>Ciao ${escapeHtml(b.name)},</p>
      <p>il periodo della tua prenotazione del pulmino <strong>${escapeHtml(b.van_name)}</strong> è stato modificato:</p>
      <p>
        <strong>Vecchio periodo:</strong> <s>${periodText(b.old_start_at, b.old_end_at)}</s><br />
        <strong>Nuovo periodo:</strong> ${periodText(b.start_at, b.end_at)}
      </p>
      <p style="font-size:0.9em;color:#666;">Codice prenotazione: <code>${shortId}</code></p>
      <p>A presto,<br>Basket Conselve</p>
      ${contactBlockHtml()}
    `,
  });
}
