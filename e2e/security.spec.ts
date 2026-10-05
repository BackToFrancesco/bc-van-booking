import { createHash } from 'crypto';
import { test, expect } from '@playwright/test';
import { daysFromNow, iso, makeRequest } from './helpers';

// sha256('') — the cookie an attacker could forge if ADMIN_PASSWORD were missing
const FORGED_SESSION = createHash('sha256').update('').digest('hex');

test('admin pages redirect to login without a session', async ({ page }) => {
  for (const path of ['/admin', '/dev/emails']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/admin-login$/);
  }
});

test('admin API refuses missing and forged sessions', async ({ request, playwright, baseURL }) => {
  const res = await request.get('/api/admin/block-series');
  expect(res.status()).toBe(401);

  const forged = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: { cookie: `admin_session=${FORGED_SESSION}` },
  });
  expect((await forged.get('/api/admin/block-series')).status()).toBe(401);
  expect((await forged.get(`/api/admin/calendar-events?from=${daysFromNow(0)}&to=${daysFromNow(7)}`)).status()).toBe(401);
  await forged.dispose();
});

test('login rejects a wrong password', async ({ page }) => {
  await page.goto('/admin-login');
  await page.fill('#password', 'sbagliata');
  await page.click('#login-btn');
  await expect(page.locator('#err')).toHaveText('Password errata.');
  await expect(page).toHaveURL(/\/admin-login$/);
});

test('booking API enforces the rules even without the browser', async ({ request }) => {
  const r = makeRequest('Api Diretta');
  const base = {
    van: 'pulmino-1', name: r.name, company: r.company, email: r.email, phone: '+393471234567',
    destination: r.destination, usage_type: r.usage, age_group: r.age, estimated_km: r.km,
    driver_name: r.driverName, driver_phone: '+393339876543', license_declared: true,
  };
  const at = (days: number, h: number) => iso(daysFromNow(days), h);

  const tooSoon = await request.post('/api/bookings', { data: { ...base, start_at: at(2, 9), end_at: at(2, 11) } });
  expect(tooSoon.status()).toBe(400);
  expect((await tooSoon.json()).error).toContain('7 giorni');

  const noLicense = await request.post('/api/bookings', { data: { ...base, license_declared: false, start_at: at(30, 9), end_at: at(30, 11) } });
  expect(noLicense.status()).toBe(400);

  const halfHour = await request.post('/api/bookings', { data: { ...base, start_at: at(30, 9).replace(':00:00', ':30:00'), end_at: at(30, 11) } });
  expect(halfHour.status()).toBe(400);
});
