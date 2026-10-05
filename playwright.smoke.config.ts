import { defineConfig } from '@playwright/test';

/** Read-only checks against the live site (default: production). SMOKE_URL overrides it. */
export default defineConfig({
  testDir: 'smoke',
  workers: 1,
  retries: 1,
  reporter: [['list']],
  use: {
    baseURL: process.env.SMOKE_URL ?? 'https://bc-van-booking.vercel.app',
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    channel: process.env.CI ? undefined : 'chrome',
  },
});
