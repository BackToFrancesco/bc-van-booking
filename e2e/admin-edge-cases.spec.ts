import { test, expect } from '@playwright/test';
import {
  adminLogin, choosePeriod, openEventInCalendar, startEdit, createRequestViaApi, dayOfWeek, daysFromNow, iso, makeRequest, pickDate, readOutbox,
} from './helpers';

const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];



const emailsTo = (address: string) => readOutbox().filter((e) => e.to === address);

/** First date ≥ `from` falling on weekday `dow`. */
function firstWeekdayFrom(fromOffset: number, dow: number): number {
  for (let i = fromOffset; i < fromOffset + 7; i++) if (dayOfWeek(daysFromNow(i)) === dow) return i;
  throw new Error('unreachable');
}

test('re-accepting a rejected request is refused when its slot was taken meanwhile', async ({ page, request }) => {
  const day = daysFromNow(40);
  const first = makeRequest('Rifiutata Poi Occupata');
  await createRequestViaApi(request, 'pulmino-2', day, 9, 18, first);

  await adminLogin(page);
  await page.locator('.bookings-table tbody tr', { hasText: first.company }).getByRole('button', { name: 'Rifiuta' }).click();
  await page.fill('#reject-reason', 'Sovrapposizione');
  await page.click('#reject-confirm');
  await expect(page.locator('.bookings-table tbody tr', { hasText: first.company })).toHaveCount(0);

  // The slot is free again, someone else takes it
  await createRequestViaApi(request, 'pulmino-2', day, 10, 12, makeRequest('Nuova Sullo Slot'));

  await startEdit(page, first.company);
  await page.selectOption('#detail-status', 'approved');
  await page.click('#detail-save');
  await expect(page.locator('#detail-error')).toContainText('già prenotato');
  expect(emailsTo(first.email).some((e) => e.subject.includes('confermata'))).toBe(false);
});

test('moving a request onto a blocked period is refused', async ({ page, request }) => {
  const day = daysFromNow(42);
  const r = makeRequest('Spostata Su Blocco');
  await createRequestViaApi(request, 'pulmino-3', day, 9, 12, r);

  await adminLogin(page);
  const block = await page.request.post('/api/admin/blocked-slots', {
    data: { van: 'pulmino-3', start_at: iso(day, 14), end_at: iso(day, 16), reason: 'Tagliando' },
  });
  expect(block.status()).toBe(201);

  await startEdit(page, r.company);
  await page.evaluate((v) => (document.querySelector('#detail-end') as any)._flatpickr.setDate(v, true), `${day}T18:00`);
  await page.click('#detail-save');
  await expect(page.locator('#detail-error')).toContainText('non è disponibile');
  expect(emailsTo(r.email).some((e) => e.subject.includes('Periodo aggiornato'))).toBe(false);
});

test('unchecking "Invia email" saves the change without emailing the user', async ({ page, request }) => {
  const day = daysFromNow(44);
  const r = makeRequest('Modifica Silenziosa');
  await createRequestViaApi(request, 'pulmino-1', day, 9, 12, r);

  await adminLogin(page);
  await startEdit(page, r.company);
  await page.evaluate((v) => (document.querySelector('#detail-end') as any)._flatpickr.setDate(v, true), `${day}T15:00`);
  await page.locator('#detail-notify').uncheck();
  await page.click('#detail-save');
  await page.waitForLoadState('load');

  // Saved: the new end shows in the detail, but no email went out
  await openEventInCalendar(page, r.company);
  await expect(page.locator('#detail-end + input')).toHaveValue(`${day.split('-').reverse().join('/')} 15:00`);
  await page.waitForTimeout(1000);
  expect(emailsTo(r.email).map((e) => e.subject)).toEqual([expect.stringContaining('Richiesta ricevuta')]);
});

test('deleting a request frees the slot and sends no email', async ({ page, request }) => {
  const day = daysFromNow(46);
  const r = makeRequest('Da Eliminare');
  await createRequestViaApi(request, 'pulmino-3', day, 9, 18, r);

  await adminLogin(page);
  await openEventInCalendar(page, r.company);
  await page.locator('#detail-actions').getByRole('button', { name: 'Elimina' }).click();
  await expect(page.locator('#detail-confirm-text')).toContainText(r.company);
  await page.click('#detail-confirm-yes');
  await page.waitForLoadState('load');
  await page.locator('.fc-dayGridMonth-button').click();
  await expect(page.locator('.fc-event', { hasText: r.company })).toHaveCount(0);

  const user = await page.context().newPage();
  await user.goto('/pulmini/pulmino-3');
  await choosePeriod(user, day, 9, day, 18);
  await expect(user.locator('#range-status')).toContainText('Pulmino 3 (Ford Ibrido) disponibile');
  expect(emailsTo(r.email)).toHaveLength(1); // only "Richiesta ricevuta"
});

test('season block over an existing request warns, and "Crea comunque" creates it', async ({ page, request }) => {
  const target = daysFromNow(260);
  const r = makeRequest('Sotto Blocco Stagionale');
  await createRequestViaApi(request, 'pulmino-1', target, 17, 19, r);
  const reason = 'Stagionale con conflitto';

  await adminLogin(page);
  await page.selectOption('#series-van', 'pulmino-1');
  await page.fill('#series-reason', reason);
  await page.locator('.weekdays').getByText(DAY_SHORT[dayOfWeek(target)], { exact: true }).click();
  await page.selectOption('#series-start-hour', '18');
  await page.selectOption('#series-end-hour', '20');
  await pickDate(page, '#series-from', daysFromNow(255));
  await pickDate(page, '#series-to', daysFromNow(275));
  await page.click('#series-create');

  const conflicts = page.locator('#series-conflicts');
  await expect(conflicts).toContainText('si sovrappone a 1 prenotazioni');
  await expect(conflicts).toContainText(r.company);
  await expect(page.locator('.bookings-table tbody tr', { hasText: reason })).toHaveCount(0); // not created yet

  await conflicts.getByRole('button', { name: 'Crea comunque' }).click();
  await expect(page.locator('.bookings-table tbody tr', { hasText: reason })).toContainText('Pulmino 1');
});

test('unblocking a single day of a season block leaves the other days blocked', async ({ page }) => {
  const fromOffset = 300;
  const dow = dayOfWeek(daysFromNow(fromOffset + 3));
  const firstOffset = firstWeekdayFrom(fromOffset, dow);
  const reason = 'Stagionale sblocco singolo';

  await adminLogin(page);
  await page.selectOption('#series-van', 'pulmino-2');
  await page.fill('#series-reason', reason);
  await page.locator('.weekdays').getByText(DAY_SHORT[dow], { exact: true }).click();
  await page.selectOption('#series-start-hour', '9');
  await page.selectOption('#series-end-hour', '11');
  await pickDate(page, '#series-from', daysFromNow(fromOffset));
  await pickDate(page, '#series-to', daysFromNow(fromOffset + 20));
  await page.click('#series-create');
  await expect(page.locator('.bookings-table tbody tr', { hasText: reason })).toContainText('3 occorrenze');

  // The first occurrence is the first event shown when moving forward month by month
  await openEventInCalendar(page, reason);
  await expect(page.locator('#detail-blocked-type')).toHaveText('Blocco stagionale (ricorrente)');
  await page.locator('#detail-actions').getByRole('button', { name: 'Sblocca solo questo giorno' }).click();
  await page.reload();
  await expect(page.locator('.bookings-table tbody tr', { hasText: reason })).toContainText('2 occorrenze');

  const user = await page.context().newPage();
  await user.goto('/pulmini/pulmino-2');
  await choosePeriod(user, daysFromNow(firstOffset), 9, daysFromNow(firstOffset), 10);
  await expect(user.locator('#range-status')).toContainText('Pulmino 2 (Fiat Elettrico) disponibile');
  await choosePeriod(user, daysFromNow(firstOffset + 7), 9, daysFromNow(firstOffset + 7), 10);
  await expect(user.locator('#range-status')).toContainText('non è disponibile');
});

test.describe('admin on a phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test('pending request card keeps labels and values in separate columns', async ({ page, request }) => {
    const r = makeRequest('Layout Mobile');
    await createRequestViaApi(request, 'pulmino-1', daysFromNow(48), 9, 18, r);

    await adminLogin(page);
    const row = page.locator('.bookings-table tbody tr', { hasText: r.company });
    for (const label of ['Pulmino', 'Periodo', 'Associazione', 'Utilizzo', 'Conducente']) {
      const cell = row.locator(`td[data-label="${label}"]`);
      const cellBox = (await cell.boundingBox())!;
      // Every piece of content sits in the value column, to the right of the label
      const lefts = await cell.evaluate((td) =>
        [...td.querySelectorAll('strong, a, span, div')]
          .filter((el) => (el as HTMLElement).offsetParent && el.getBoundingClientRect().width > 0)
          .map((el) => el.getBoundingClientRect().left),
      );
      expect(lefts.length, label).toBeGreaterThan(0);
      for (const left of lefts) expect(left - cellBox.x, `${label} content`).toBeGreaterThan(100);
    }
    // No horizontal scroll on the page
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
