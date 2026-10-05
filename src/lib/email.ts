import nodemailer from 'nodemailer';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { TZ } from './config';
import { MAIL_FROM, LOGBOOK_URL } from './contact';
import { formatDuration } from './time';
import { USAGE_TYPES, AGE_GROUPS } from './booking-rules';

const SENDER_NAME = 'Servizio Pulmini — Basket Conselve ASD';
const SUBJECT_PREFIX = 'BC Pulmini';

// MAIL_OUTBOX lets end-to-end tests read the mocked emails from their own file
export const OUTBOX_FILE = resolve(
  process.cwd(),
  import.meta.env.MAIL_OUTBOX || process.env.MAIL_OUTBOX || '.mail-outbox/emails.json',
);

type MailOptions = { from: string; to: string; replyTo?: string; subject: string; text: string; html: string };
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

function durationText(start: Date | string, end: Date | string): string {
  return formatDuration(new Date(end).getTime() - new Date(start).getTime());
}

export type EmailBooking = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  van_label: string;
  start_at: Date | string;
  end_at: Date | string;
  destination: string | null;
  usage_type: string | null;
  age_group: string | null;
  estimated_km: number | null;
  notes: string | null;
  driver_name: string | null;
  driver_phone: string | null;
  rejection_reason: string | null;
  pickup_location: string | null;
  return_instructions: string | null;
};

function siteUrl(): string {
  return import.meta.env.SITE_URL ?? 'http://localhost:4321';
}

const usageLabel = (b: EmailBooking) => (b.usage_type ? USAGE_TYPES[b.usage_type as keyof typeof USAGE_TYPES] ?? b.usage_type : null);
const ageLabel = (b: EmailBooking) => (b.age_group ? AGE_GROUPS[b.age_group as keyof typeof AGE_GROUPS] ?? b.age_group : null);
const driverText = (b: EmailBooking) => (b.driver_name ? `${b.driver_name}${b.driver_phone ? ` (${b.driver_phone})` : ''}` : null);

type Field = [label: string, value: string | number | null | undefined];

/** "Label: value" lines, skipping empty values (so missing data never shows up as a placeholder). */
function fieldsText(fields: Field[]): string {
  return fields.filter(([, v]) => v !== null && v !== undefined && v !== '').map(([l, v]) => `${l}: ${v}`).join('\n');
}

function fieldsHtml(fields: Field[]): string {
  return fields
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([l, v]) => `<strong>${escapeHtml(l)}:</strong> ${escapeHtml(String(v))}`)
    .join('<br />');
}

function paragraphsHtml(text: string): string {
  return text.split('\n\n').map((p) => `<p>${escapeHtml(p).replace(/\n/g, '<br />')}</p>`).join('\n');
}

const SIGNATURE_TEXT = 'Servizio Pulmini\nBasket Conselve ASD';
const SIGNATURE_HTML = '<p>Servizio Pulmini<br />Basket Conselve ASD</p>';

function send(to: string, subject: string, text: string, html: string) {
  return getTransport().sendMail({
    from: fromHeader(),
    to,
    replyTo: MAIL_FROM,
    subject: `${SUBJECT_PREFIX} — ${subject}`,
    text,
    html: `<div style="font-family:system-ui,-apple-system,sans-serif;line-height:1.55;color:#1a1a1a;max-width:640px">${html}</div>`,
  });
}

// ── Admin ─────────────────────────────────────────────────────────────────

export async function sendAdminNewBooking(b: EmailBooking) {
  const adminUrl = `${siteUrl()}/admin`;
  const fields: Field[] = [
    ['Pulmino', b.van_label],
    ['Ritiro', formatDateTime(b.start_at)],
    ['Riconsegna', formatDateTime(b.end_at)],
    ['Durata', durationText(b.start_at, b.end_at)],
    ['Associazione', b.company],
    ['Referente', b.name],
    ['Email', b.email],
    ['Telefono', b.phone],
    ['Destinazione', b.destination],
    ['Tipo di attività', usageLabel(b)],
    ["Fascia d'età", ageLabel(b)],
    ['Km stimati', b.estimated_km],
    ['Conducente', driverText(b)],
    ['Patente conducente', 'dichiarata valida (cat. B o superiore)'],
    ['Note', b.notes],
    ['ID richiesta', b.id],
  ];

  await send(
    import.meta.env.ADMIN_EMAIL,
    `Nuova richiesta — ${b.van_label} — ${b.company} — ${formatDate(b.start_at)}`,
    `Nuova richiesta di utilizzo pulmino\n\n${fieldsText(fields)}\n\nVai alla pagina admin per accettare o rifiutare:\n${adminUrl}\n`,
    `<h2>Nuova richiesta di utilizzo pulmino</h2>
      <p>${fieldsHtml(fields)}</p>
      <p><a href="${adminUrl}" style="background:#C8102E;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;">Apri la pagina admin</a></p>`,
  );
}

// ── User ──────────────────────────────────────────────────────────────────

export async function sendUserBookingReceived(b: EmailBooking) {
  const fields: Field[] = [
    ['Associazione', b.company],
    ['Pulmino richiesto', b.van_label],
    ['Ritiro', formatDateTime(b.start_at)],
    ['Riconsegna', formatDateTime(b.end_at)],
    ['Destinazione', b.destination],
    ['Tipo di attività', usageLabel(b)],
    ['Conducente indicato', b.driver_name],
  ];
  const outro = `La richiesta è in attesa di valutazione e non costituisce ancora una prenotazione confermata.

Riceverai una nuova email quando la richiesta sarà accettata o rifiutata. Fino a quel momento il mezzo non deve essere considerato assegnato.

Se uno dei dati riportati non è corretto, rispondi a questa email.`;

  await send(
    b.email,
    `Richiesta ricevuta — ${formatDate(b.start_at)}`,
    `Ciao ${b.name},\n\nabbiamo ricevuto la tua richiesta di utilizzo del pulmino.\n\n${fieldsText(fields)}\n\n${outro}\n\n${SIGNATURE_TEXT}\n`,
    `<p>Ciao ${escapeHtml(b.name)},</p>
      <p>abbiamo ricevuto la tua richiesta di utilizzo del pulmino.</p>
      <p>${fieldsHtml(fields)}</p>
      ${paragraphsHtml(outro)}
      ${SIGNATURE_HTML}`,
  );
}

export async function sendUserApproved(b: EmailBooking) {
  const fields: Field[] = [
    ['Associazione', b.company],
    ['Pulmino assegnato', b.van_label],
    ['Ritiro', formatDateTime(b.start_at)],
    ['Riconsegna', formatDateTime(b.end_at)],
    ['Luogo di ritiro e riconsegna', b.pickup_location],
    ['Destinazione', b.destination],
    ['Tipo di attività', usageLabel(b)],
    ['Conducente autorizzato', b.driver_name],
  ];
  // Only the essentials here: the full rules live on the site
  const essentials = [
    'Il mezzo può essere guidato esclusivamente dal conducente indicato.',
    'Al ritiro e alla riconsegna fai fotografie o un breve video dello stato interno ed esterno del mezzo: sono obbligatori.',
    'Registra nel libretto di bordo elettronico orario e chilometri, alla partenza e al rientro.',
    'Segnala subito eventuali danni, incidenti o anomalie.',
    ...(b.return_instructions ? [`${b.return_instructions.replace(/[.;]\s*$/, '')}.`] : []),
  ];
  const instructionsUrl = `${siteUrl()}/istruzioni`;
  const rulesUrl = `${siteUrl()}/disciplinare.pdf`;
  const intro = "la richiesta è stata accettata. Il pulmino è quindi prenotato per l'associazione indicata.";
  const priority = 'Come previsto dal disciplinare, il Comune di Conselve può richiedere eccezionalmente il mezzo per esigenze istituzionali o di Protezione Civile: in tal caso sarete avvisati tempestivamente.';

  const linksText = [
    `Istruzioni complete per il ritiro e la riconsegna: ${instructionsUrl}`,
    ...(LOGBOOK_URL ? [`Libretto di bordo elettronico: ${LOGBOOK_URL}`] : []),
    `Disciplinare: ${rulesUrl}`,
  ].join('\n');
  const button = (href: string, label: string, primary = false) =>
    `<a href="${href}" style="background:${primary ? '#C8102E' : '#f3f4f6'};color:${primary ? '#ffffff' : '#1a1a1a'};padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;margin:0 6px 6px 0;">${label}</a>`;

  await send(
    b.email,
    `Prenotazione confermata — ${formatDate(b.start_at)}`,
    `Ciao ${b.name},\n\n${intro}\n\n${fieldsText(fields)}\n\nDa ricordare:\n\n${essentials.map((r) => `• ${r}`).join('\n')}\n\n${linksText}\n\n${priority}\n\nBuon viaggio!\n\n${SIGNATURE_TEXT}\n`,
    `<p>Ciao ${escapeHtml(b.name)},</p>
      <p>${escapeHtml(intro)}</p>
      <p>${fieldsHtml(fields)}</p>
      <div style="background:#fffbeb;border-left:4px solid #f59e0b;border-radius:4px;padding:12px 16px;margin:16px 0;">
        <strong>Da ricordare</strong>
        <ul style="margin:8px 0 0;padding-left:20px;">${essentials.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>
      </div>
      <p>
        ${button(instructionsUrl, 'Istruzioni per ritiro e riconsegna', true)}
        ${LOGBOOK_URL ? button(LOGBOOK_URL, 'Libretto di bordo') : ''}
        ${button(rulesUrl, 'Disciplinare (PDF)')}
      </p>
      <p style="font-size:0.92em;color:#555;">${escapeHtml(priority)}</p>
      <p>Buon viaggio!</p>
      ${SIGNATURE_HTML}`,
  );
}

export async function sendUserRejected(b: EmailBooking) {
  const fields: Field[] = [
    ['Associazione', b.company],
    ['Pulmino richiesto', b.van_label],
    ['Ritiro', formatDateTime(b.start_at)],
    ['Riconsegna', formatDateTime(b.end_at)],
  ];
  const reason = b.rejection_reason ? `Motivazione: ${b.rejection_reason}` : '';
  const outro = `La prenotazione non è quindi confermata. Puoi tornare sul sito per verificare la disponibilità degli altri mezzi o scegliere un periodo differente.

Per eventuali chiarimenti puoi rispondere a questa email.`;

  await send(
    b.email,
    `Richiesta non accettata — ${formatDate(b.start_at)}`,
    `Ciao ${b.name},\n\npurtroppo non possiamo accettare la seguente richiesta:\n\n${fieldsText(fields)}\n\n${reason ? `${reason}\n\n` : ''}${outro}\n\n${SIGNATURE_TEXT}\n`,
    `<p>Ciao ${escapeHtml(b.name)},</p>
      <p>purtroppo non possiamo accettare la seguente richiesta:</p>
      <p>${fieldsHtml(fields)}</p>
      ${b.rejection_reason ? `<p><strong>Motivazione:</strong> ${escapeHtml(b.rejection_reason)}</p>` : ''}
      ${paragraphsHtml(outro)}
      <p><a href="${siteUrl()}">${escapeHtml(siteUrl().replace(/^https?:\/\//, ''))}</a></p>
      ${SIGNATURE_HTML}`,
  );
}

export async function sendUserRescheduled(b: EmailBooking & { old_start_at: Date | string; old_end_at: Date | string }) {
  const oldFields: Field[] = [['Ritiro', formatDateTime(b.old_start_at)], ['Riconsegna', formatDateTime(b.old_end_at)]];
  const newFields: Field[] = [['Ritiro', formatDateTime(b.start_at)], ['Riconsegna', formatDateTime(b.end_at)]];
  const outro = 'Per eventuali chiarimenti puoi rispondere a questa email.';

  await send(
    b.email,
    `Periodo aggiornato — ${formatDate(b.start_at)}`,
    `Ciao ${b.name},\n\nil periodo della richiesta per il pulmino ${b.van_label} (${b.company}) è stato modificato.\n\nPeriodo precedente\n${fieldsText(oldFields)}\n\nNuovo periodo\n${fieldsText(newFields)}\n\n${outro}\n\n${SIGNATURE_TEXT}\n`,
    `<p>Ciao ${escapeHtml(b.name)},</p>
      <p>il periodo della richiesta per il pulmino <strong>${escapeHtml(b.van_label)}</strong> (${escapeHtml(b.company)}) è stato modificato.</p>
      <p><strong>Periodo precedente</strong><br /><s>${fieldsHtml(oldFields)}</s></p>
      <p><strong>Nuovo periodo</strong><br />${fieldsHtml(newFields)}</p>
      ${paragraphsHtml(outro)}
      ${SIGNATURE_HTML}`,
  );
}
