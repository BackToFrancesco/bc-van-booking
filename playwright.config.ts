import { defineConfig } from '@playwright/test';

const PORT = 4400;
const isCI = !!process.env.CI;

/**
 * End-to-end tests: a real browser clicks through the site.
 * The dev server runs with `--mode e2e` (.env.e2e): throwaway PGlite database and mocked
 * emails written to .mail-outbox-e2e/, both wiped at every run. Never touches Neon.
 */
export default defineConfig({
  testDir: 'e2e',
  // Tests share one database: run them one at a time, each on its own dates/vans
  fullyParallel: false,
  workers: 1,
  retries: isCI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: 'it-IT',
    timezoneId: 'Europe/Rome',
    viewport: { width: 1280, height: 900 },
    // Local runs use the installed Google Chrome; CI installs Playwright's Chromium
    channel: isCI ? undefined : 'chrome',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `rm -rf .pglite-e2e .mail-outbox-e2e && npx astro dev --mode e2e --port ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
