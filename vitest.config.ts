import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Unit tests only: browser tests in e2e/ run with Playwright
    include: ['src/**/*.test.ts'],
  },
});
