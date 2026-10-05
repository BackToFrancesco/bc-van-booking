import { test, expect } from '@playwright/test';

// Read-only checks on the live site: nothing is created or changed.

test('home shows the three vans and the service notice', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Servizio riservato alle ASD/SSD iscritte al RASD')).toBeVisible();
  await expect(page.locator('.van-card')).toHaveCount(3);
});

test('van pages load with the request form and pickup info', async ({ page }) => {
  for (const van of ['pulmino-1', 'pulmino-2', 'pulmino-3']) {
    await page.goto(`/pulmini/${van}`);
    await expect(page.locator('#book-btn')).toBeVisible();
    await expect(page.locator('.info-box', { hasText: 'Ritiro e riconsegna' })).toContainText('Palestra Morelli');
  }
});

test('instructions page and disciplinare are online', async ({ page, request }) => {
  await page.goto('/istruzioni');
  await expect(page.getByRole('heading', { name: 'Alla riconsegna' })).toBeVisible();
  const pdf = await request.get('/disciplinare.pdf');
  expect(pdf.status()).toBe(200);
  expect(pdf.headers()['content-type']).toContain('application/pdf');
});

test('availability API answers (database reachable)', async ({ request }) => {
  const today = new Date().toISOString().slice(0, 10);
  const res = await request.get(`/api/slots?van=pulmino-1&from=${today}&to=${today}`);
  expect(res.status()).toBe(200);
  expect(await res.json()).toHaveProperty('bookings');
});

test('admin is protected', async ({ page, request }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin-login$/);
  expect((await request.get('/api/admin/block-series')).status()).toBe(401);
});
