import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { addDays, romeDateStr, romeDateTime, dayOfWeek } from '../src/lib/time';

export const ADMIN_PASSWORD = 'e2e-admin';
export const ADMIN_EMAIL = 'admin@e2e.test';
const OUTBOX = resolve(process.cwd(), '.mail-outbox-e2e/emails.json');

// ── Dates (always relative to today in Rome, so tests never expire) ────────

/** "YYYY-MM-DD" of today + n days (Rome calendar). */
export function daysFromNow(n: number): string {
  return addDays(romeDateStr(new Date()), n);
}

export { dayOfWeek };

/** UTC ISO string for a Rome wall-clock time, e.g. iso('2026-10-20', 9). */
export function iso(dateStr: string, hour: number): string {
  return romeDateTime(dateStr, hour).toISOString();
}

// ── Mocked emails ──────────────────────────────────────────────────────────

export type Email = { to: string; subject: string; text: string; html: string; replyTo?: string };

export function readOutbox(): Email[] {
  if (!existsSync(OUTBOX)) return [];
  try {
    return JSON.parse(readFileSync(OUTBOX, 'utf8'));
  } catch {
    return []; // caught mid-write by the server: the next poll reads it whole
  }
}

/** Waits until an email matching `predicate` is in the outbox (emails are sent in background). */
export async function waitForEmail(predicate: (e: Email) => boolean, what: string): Promise<Email> {
  let found: Email | undefined;
  await expect
    .poll(() => (found = readOutbox().find(predicate)), { message: `email: ${what}`, timeout: 10_000 })
    .toBeTruthy();
  return found!;
}

// ── Request data ───────────────────────────────────────────────────────────

export type Request = {
  name: string; company: string; email: string; phone: string; destination: string;
  usage: 'official_match' | 'training' | 'social_sports_event' | 'other';
  age: 'minors' | 'adults'; km: number; notes?: string; driverName: string; driverPhone: string;
};

export function makeRequest(tag: string, overrides: Partial<Request> = {}): Request {
  return {
    name: `Referente ${tag}`,
    company: `ASD ${tag}`,
    email: `${tag.toLowerCase().replace(/\W+/g, '-')}@e2e.test`,
    phone: '3471234567',
    destination: 'PalaFabris, Padova',
    usage: 'official_match',
    age: 'minors',
    km: 70,
    driverName: `Conducente ${tag}`,
    driverPhone: '3339876543',
    ...overrides,
  };
}

/** Creates a request through the public API (used to prepare a state, not to test the form). */
export async function createRequestViaApi(
  request: APIRequestContext, van: string, date: string, startHour: number, endHour: number, r: Request,
): Promise<string> {
  const res = await request.post('/api/bookings', {
    data: {
      van, name: r.name, company: r.company, email: r.email, phone: `+39${r.phone}`,
      destination: r.destination, usage_type: r.usage, age_group: r.age, estimated_km: r.km,
      notes: r.notes ?? '', driver_name: r.driverName, driver_phone: `+39${r.driverPhone}`, license_declared: true,
      start_at: iso(date, startHour), end_at: iso(date, endHour),
    },
  });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()).id;
}

// ── UI helpers ─────────────────────────────────────────────────────────────

/** Opens a flatpickr calendar (the visible input after `inputSelector`) and clicks the day. */
export async function pickDate(page: Page, inputSelector: string, dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  await page.locator(`${inputSelector} + input`).click();
  const cal = page.locator('.flatpickr-calendar.open');
  await expect(cal).toBeVisible();

  for (let i = 0; i < 24; i++) {
    const shownMonth = Number(await cal.locator('.flatpickr-monthDropdown-months').inputValue());
    const shownYear = Number(await cal.locator('.cur-year').inputValue());
    const diff = (y - shownYear) * 12 + (m - 1 - shownMonth);
    if (diff === 0) break;
    await cal.locator(diff > 0 ? '.flatpickr-next-month' : '.flatpickr-prev-month').click();
  }
  await cal
    .locator('.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)')
    .getByText(String(d), { exact: true })
    .click();
}

/** Chooses the period on a van page with the date pickers and hour selects. */
export async function choosePeriod(page: Page, start: string, startHour: number, end: string, endHour: number) {
  await pickDate(page, '#start-date', start);
  await page.selectOption('#start-hour', String(startHour));
  await pickDate(page, '#end-date', end);
  await page.selectOption('#end-hour', String(endHour));
}

/** Fills the request modal (already open). */
export async function fillRequestForm(page: Page, r: Request, { declareLicense = true } = {}) {
  await page.fill('#inp-name', r.name);
  await page.fill('#inp-company', r.company);
  await page.fill('#inp-email', r.email);
  await page.fill('#inp-email-confirm', r.email);
  await page.fill('#inp-phone', r.phone);
  await page.fill('#inp-destination', r.destination);
  await page.selectOption('#inp-usage', r.usage);
  await page.fill('#inp-km', String(r.km));
  await page.locator(`input[name="age-group"][value="${r.age}"] + span`).click();
  if (r.notes) await page.fill('#inp-notes', r.notes);
  await page.fill('#inp-driver-name', r.driverName);
  await page.fill('#inp-driver-phone', r.driverPhone);
  if (declareLicense) await page.locator('#inp-license').check();
}

/**
 * Admin calendar: switches to month view and moves forward until the event containing `text` shows up,
 * then opens it. Waits for each month's events to load before deciding to move on.
 */
export async function openEventInCalendar(page: Page, text: string) {
  const loaded = () => page.waitForResponse((r) => r.url().includes('/api/admin/calendar-events'));
  const event = page.locator('.fc-event', { hasText: text }).first();
  const shows = () => event.waitFor({ state: 'visible', timeout: 1500 }).then(() => true, () => false);

  // Rejected requests are hidden by default: show everything so any event can be found
  const showRejected = page.locator('#show-rejected');
  if (!(await showRejected.isChecked())) {
    await Promise.all([loaded(), showRejected.check()]);
  }
  await Promise.all([loaded(), page.locator('.fc-dayGridMonth-button').click()]);
  for (let i = 0; i < 14 && !(await shows()); i++) {
    await Promise.all([loaded(), page.locator('.fc-next-button').click()]);
  }
  await event.click();
  await expect(page.locator('#detail-modal')).toBeVisible();
}

/** Opens the event and switches the detail modal to edit mode. */
export async function startEdit(page: Page, text: string) {
  await openEventInCalendar(page, text);
  await page.locator('#detail-actions').getByRole('button', { name: 'Modifica' }).click();
}

export async function adminLogin(page: Page) {
  await page.goto('/admin-login');
  await page.fill('#password', ADMIN_PASSWORD);
  await Promise.all([page.waitForURL('**/admin'), page.click('#login-btn')]);
}
