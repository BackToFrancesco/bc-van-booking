import { test, expect } from '@playwright/test';
import {
  ADMIN_EMAIL, choosePeriod, createRequestViaApi, daysFromNow, fillRequestForm, makeRequest, pickDate, waitForEmail,
} from './helpers';

// Each test works on its own van/dates so they never collide in the shared database.

test('full request from the home page sends user and admin emails', async ({ page }) => {
  const r = makeRequest('Percorso Completo');
  const day = daysFromNow(10);

  await page.goto('/');
  await expect(page.getByText('Servizio riservato alle ASD/SSD iscritte al RASD')).toBeVisible();
  await expect(page.locator('.van-card')).toHaveCount(3);
  await page.locator('.van-card', { hasText: 'Pulmino 1' }).getByRole('link', { name: /Richiedi/ }).click();

  await expect(page).toHaveURL(/\/pulmini\/pulmino-1$/);
  await expect(page.locator('.fc')).toHaveCount(0); // no public calendar
  await choosePeriod(page, day, 9, day, 18);
  await expect(page.locator('#range-status')).toContainText('Pulmino 1 (Fiat Elettrico) disponibile');

  await page.click('#book-btn');
  await expect(page.locator('#modal-slot-info')).toContainText('Pulmino 1 (Fiat Elettrico)');
  await fillRequestForm(page, { ...r, notes: 'Partenza dalla palestra comunale' });
  await page.click('#modal-submit');

  await expect(page.locator('#modal-success')).toBeVisible();
  await expect(page.locator('#success-email')).toHaveText(r.email);

  const userMail = await waitForEmail((e) => e.to === r.email && e.subject.includes('Richiesta ricevuta'), 'request received');
  expect(userMail.text).toContain('Pulmino richiesto: Pulmino 1 (Fiat Elettrico)');
  expect(userMail.text).toContain(`Conducente indicato: ${r.driverName}`);
  expect(userMail.text).toContain('non costituisce ancora una prenotazione confermata');
  expect(userMail.replyTo).toBe('pulmini@basketconselve.com');

  const adminMail = await waitForEmail((e) => e.to === ADMIN_EMAIL && e.text.includes(r.company), 'admin notification');
  expect(adminMail.subject).toContain('Nuova richiesta');
  expect(adminMail.text).toContain('Note: Partenza dalla palestra comunale');
  expect(adminMail.text).toContain('/admin');

  // The same period is now taken for this van
  await page.click('#modal-success-ok');
  await choosePeriod(page, day, 9, day, 18);
  await expect(page.locator('#range-status')).toContainText('non è disponibile in questo periodo');
});

test('form validation: notice period, email match and licence declaration', async ({ page }) => {
  await page.goto('/pulmini/pulmino-2');

  // Days closer than 7 days cannot be picked
  await page.locator('#start-date + input').click();
  const tooSoon = Number(daysFromNow(3).split('-')[2]);
  const cal = page.locator('.flatpickr-calendar.open');
  const tooSoonCell = cal.locator('.flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)').getByText(String(tooSoon), { exact: true });
  if (await tooSoonCell.count()) await expect(tooSoonCell).toHaveClass(/flatpickr-disabled/);
  await page.keyboard.press('Escape');

  const day = daysFromNow(11);
  await choosePeriod(page, day, 9, day, 12);
  await page.click('#book-btn');

  // Empty form
  await page.click('#modal-submit');
  await expect(page.locator('#modal-error')).toHaveText('Inserisci nome e cognome del referente');

  // Emails do not match
  const r = makeRequest('Validazione');
  await fillRequestForm(page, r, { declareLicense: false });
  await page.fill('#inp-email-confirm', 'altra@e2e.test');
  await page.click('#modal-submit');
  await expect(page.locator('#modal-error')).toHaveText('Le email non corrispondono.');

  // Licence declaration is mandatory
  await page.fill('#inp-email-confirm', r.email);
  await page.click('#modal-submit');
  await expect(page.locator('#modal-error')).toContainText('patente valida');
  await expect(page.locator('#declaration')).toHaveClass(/error-field/);

  // Nothing was sent
  await page.locator('#inp-license').check();
  await page.click('#modal-cancel');
  await expect(page.locator('#modal-overlay')).toBeHidden();
});

test('busy van suggests the free ones and the link keeps the chosen period', async ({ page, request }) => {
  const day = daysFromNow(12);
  await createRequestViaApi(request, 'pulmino-1', day, 9, 18, makeRequest('Occupa Pulmino Uno'));

  await page.goto('/pulmini/pulmino-1');
  await choosePeriod(page, day, 10, day, 12);
  const status = page.locator('#range-status');
  await expect(status).toContainText('Pulmino 1 (Fiat Elettrico) non è disponibile in questo periodo');
  await expect(page.locator('#book-btn')).toBeDisabled();
  await expect(status.locator('.alternative')).toHaveCount(2);
  await expect(status).toContainText('Pulmino 3 (Ford Ibrido) · 8 posti + conducente');

  await status.locator('.alternative', { hasText: 'Pulmino 2' }).click();
  await expect(page).toHaveURL(/\/pulmini\/pulmino-2\?start=/);
  await expect(page.locator('#start-date + input')).toHaveValue(day.split('-').reverse().join('/'));
  await expect(page.locator('#start-hour')).toHaveValue('10');
  await expect(page.locator('#end-hour')).toHaveValue('12');
  await expect(page.locator('#range-status')).toContainText('Pulmino 2 (Fiat Elettrico) disponibile');

  const r = makeRequest('Alternativa');
  await page.click('#book-btn');
  await fillRequestForm(page, r);
  await page.click('#modal-submit');
  await expect(page.locator('#modal-success')).toBeVisible();
  const mail = await waitForEmail((e) => e.to === r.email, 'request on the suggested van');
  expect(mail.text).toContain('Pulmino richiesto: Pulmino 2 (Fiat Elettrico)');
});

test('instructions page, disciplinare PDF and footer links', async ({ page, request }) => {
  await page.goto('/pulmini/pulmino-3');
  const box = page.locator('.info-box', { hasText: 'Ritiro e riconsegna' });
  await expect(box).toContainText('Palestra Morelli');
  await expect(box).toContainText('serbatoio di benzina completamente pieno');
  await expect(box).toContainText('Foto o video obbligatori');

  await page.locator('footer').getByRole('link', { name: 'Istruzioni per ritiro e riconsegna' }).click();
  await expect(page).toHaveURL(/\/istruzioni$/);
  for (const heading of ['Al ritiro del pulmino', "Durante l'utilizzo", 'Alla riconsegna']) {
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
  }
  await expect(page.getByText('Fotografie o video sono obbligatori')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Apri in Maps →' })).toHaveAttribute('href', /google\.com\/maps/);

  const pdf = await request.get('/disciplinare.pdf');
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
});

test.describe('mobile, device in another time zone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'America/New_York' });

  test('request from a phone keeps Italian times', async ({ page }) => {
    const r = makeRequest('Mobile');
    const day = daysFromNow(14);

    await page.goto('/pulmini/pulmino-3');
    await choosePeriod(page, day, 8, day, 20);
    // Shown in Rome time even if the phone is in New York
    await expect(page.locator('#range-status')).toContainText('08:00');
    await expect(page.locator('#range-status')).toContainText('20:00');

    await page.click('#book-btn');
    await fillRequestForm(page, r);
    await page.click('#modal-submit');
    await expect(page.locator('#modal-success')).toBeVisible();

    const mail = await waitForEmail((e) => e.to === r.email, 'mobile request');
    expect(mail.text).toMatch(/Ritiro: .* 08:00/);
    expect(mail.text).toMatch(/Riconsegna: .* 20:00/);
  });
});

// Makes the date picker helper fail loudly if the page structure changes
test('date picker helper selects the requested day', async ({ page }) => {
  await page.goto('/pulmini/pulmino-2');
  const day = daysFromNow(40);
  await pickDate(page, '#start-date', day);
  await expect(page.locator('#start-date')).toHaveValue(day);
});
