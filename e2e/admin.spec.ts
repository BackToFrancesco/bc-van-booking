import { test, expect, type Page } from '@playwright/test';
import {
  adminLogin, choosePeriod, createRequestViaApi, dayOfWeek, daysFromNow, makeRequest, pickDate, waitForEmail,
} from './helpers';

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];

/** Admin calendar: month view, then forward until the event of `company` shows up, and open it. */
async function openEventInCalendar(page: Page, company: string) {
  await page.locator('.fc-dayGridMonth-button').click();
  const event = page.locator('.fc-event', { hasText: company }).first();
  for (let i = 0; i < 14 && !(await event.isVisible()); i++) {
    await page.locator('.fc-next-button').click();
  }
  await event.click();
  await expect(page.locator('#detail-modal')).toBeVisible();
}

async function startEdit(page: Page, company: string) {
  await openEventInCalendar(page, company);
  await page.locator('#detail-actions').getByRole('button', { name: 'Modifica' }).click();
}

test('admin accepts a pending request from the table', async ({ page, request }) => {
  const r = makeRequest('Da Accettare');
  await createRequestViaApi(request, 'pulmino-2', daysFromNow(20), 9, 18, r);

  await adminLogin(page);
  const row = page.locator('.bookings-table tbody tr', { hasText: r.company });
  await expect(row).toContainText('Pulmino 2');
  await expect(row).toContainText(r.driverName);
  await expect(row).toContainText('Gara ufficiale');
  await row.getByRole('button', { name: 'Accetta' }).click();
  await expect(page.locator('.bookings-table tbody tr', { hasText: r.company })).toHaveCount(0);

  const mail = await waitForEmail((e) => e.to === r.email && e.subject.includes('Prenotazione confermata'), 'confirmation');
  expect(mail.text).toContain('Pulmino assegnato: Pulmino 2 (Fiat Elettrico)');
  expect(mail.text).toContain('Luogo di ritiro e riconsegna: Palestra Morelli');
  expect(mail.text).toContain('sotto il 35%');
  expect(mail.text).toContain('/istruzioni');
  expect(mail.text).toContain('/disciplinare.pdf');
  expect(mail.text).not.toContain('Tariffa');
});

test('rejecting requires a reason, which is emailed to the user', async ({ page, request }) => {
  const r = makeRequest('Da Rifiutare');
  await createRequestViaApi(request, 'pulmino-3', daysFromNow(22), 8, 12, r);

  await adminLogin(page);
  await page.locator('.bookings-table tbody tr', { hasText: r.company }).getByRole('button', { name: 'Rifiuta' }).click();
  await expect(page.locator('#reject-modal')).toBeVisible();

  await page.click('#reject-confirm');
  await expect(page.locator('#reject-error')).toHaveText('Indica la motivazione del rifiuto.');

  const reason = 'Pulmino già impegnato per una trasferta della prima squadra';
  await page.fill('#reject-reason', reason);
  await page.click('#reject-confirm');
  await expect(page.locator('.bookings-table tbody tr', { hasText: r.company })).toHaveCount(0);

  const mail = await waitForEmail((e) => e.to === r.email && e.subject.includes('non accettata'), 'rejection');
  expect(mail.text).toContain(`Motivazione: ${reason}`);
  expect(mail.text).toContain('Pulmino richiesto: Pulmino 3 (Ford Ibrido)');
});

test('admin edits the period, then rejects and accepts again', async ({ page, request }) => {
  const r = makeRequest('Da Modificare');
  const day = daysFromNow(24);
  await createRequestViaApi(request, 'pulmino-3', day, 9, 12, r);
  await adminLogin(page);

  // 1. Move the end to the next day at 18:00 → "Periodo aggiornato"
  await startEdit(page, r.company);
  await page.evaluate((v) => (document.querySelector('#detail-end') as any)._flatpickr.setDate(v, true), `${daysFromNow(25)}T18:00`);
  await expect(page.locator('#detail-notify-help')).toContainText('Periodo aggiornato');
  await page.click('#detail-save');
  const moved = await waitForEmail((e) => e.to === r.email && e.subject.includes('Periodo aggiornato'), 'reschedule');
  expect(moved.text).toMatch(/Nuovo periodo[\s\S]*Riconsegna: .* 18:00/);

  // 2. Reject from the edit form: the reason is required
  await startEdit(page, r.company);
  await page.selectOption('#detail-status', 'rejected');
  await expect(page.locator('#detail-edit-reason')).toBeVisible();
  await expect(page.locator('#detail-save')).toBeDisabled();
  await page.fill('#detail-edit-reason', 'Esigenza istituzionale del Comune');
  await expect(page.locator('#detail-save')).toBeEnabled();
  await page.click('#detail-save');
  await waitForEmail((e) => e.to === r.email && e.text.includes('Motivazione: Esigenza istituzionale del Comune'), 'rejection from edit');

  // 3. Rejected → accepted again
  await startEdit(page, r.company);
  await page.selectOption('#detail-status', 'approved');
  await page.click('#detail-save');
  const confirmed = await waitForEmail((e) => e.to === r.email && e.subject.includes('Prenotazione confermata'), 'confirmation after rejection');
  expect(confirmed.text).toContain('serbatoio di benzina completamente pieno');
});

test('dragging on the calendar blocks a period for one van', async ({ page }) => {
  const day = daysFromNow(16);
  await adminLogin(page);
  await page.locator('#van-filter .chip', { hasText: 'Pulmino 1' }).click();

  const column = page.locator(`.fc-timegrid-col[data-date="${day}"]`);
  for (let i = 0; i < 6 && !(await column.isVisible()); i++) await page.locator('.fc-next-button').click();
  const colBox = (await column.boundingBox())!;
  const from = (await page.locator('.fc-timegrid-slot-lane[data-time="10:00:00"]').boundingBox())!;
  const to = (await page.locator('.fc-timegrid-slot-lane[data-time="12:00:00"]').boundingBox())!;
  const x = colBox.x + colBox.width / 2;
  await page.mouse.move(x, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(x, to.y + to.height / 2, { steps: 8 });
  await page.mouse.up();

  await expect(page.locator('#block-modal')).toBeVisible();
  await expect(page.locator('#block-van')).toHaveValue('pulmino-1');
  await page.fill('#block-reason', 'Manutenzione e2e');
  await page.click('#block-confirm-btn');
  await expect(page.locator('#block-modal')).toBeHidden();
  await expect(page.locator('.fc-event', { hasText: 'Manutenzione e2e' })).toBeVisible();

  // The user can no longer pick that slot on Pulmino 1, but Pulmino 2 is still free
  const user = await page.context().newPage();
  await user.goto('/pulmini/pulmino-1');
  await choosePeriod(user, day, 10, day, 11);
  await expect(user.locator('#range-status')).toContainText('non è disponibile');
  await expect(user.locator('#range-status .alternative', { hasText: 'Pulmino 2' })).toBeVisible();
});

test('season block makes every van unavailable until the series is deleted', async ({ page }) => {
  const from = daysFromNow(200);
  const to = daysFromNow(230);
  const target = daysFromNow(205);
  const reason = 'Associazione E2E stagione';

  await adminLogin(page);
  await page.selectOption('#series-van', '');
  await page.fill('#series-reason', reason);
  await page.locator('.weekdays').getByText(DAY_SHORT[dayOfWeek(target)], { exact: true }).click();
  await page.selectOption('#series-start-hour', '18');
  await page.selectOption('#series-end-hour', '20');
  await pickDate(page, '#series-from', from);
  await pickDate(page, '#series-to', to);
  await page.click('#series-create');

  const seriesRow = page.locator('.bookings-table tbody tr', { hasText: reason });
  await expect(seriesRow).toContainText('Tutti');
  await expect(seriesRow).toContainText(/[45] occorrenze/);

  const user = await page.context().newPage();
  await user.goto('/pulmini/pulmino-2');
  await choosePeriod(user, target, 17, target, 19);
  await expect(user.locator('#range-status')).toContainText('non è disponibile');
  await expect(user.locator('#range-status')).toContainText('non ci sono altri pulmini liberi');

  page.once('dialog', (d) => d.accept());
  await seriesRow.getByRole('button', { name: 'Elimina serie' }).click();
  await expect(page.locator('.bookings-table tbody tr', { hasText: reason })).toHaveCount(0);

  await user.reload();
  await choosePeriod(user, target, 17, target, 19);
  await expect(user.locator('#range-status')).toContainText('Pulmino 2 (Fiat Elettrico) disponibile');
});
