// @ts-check
import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  vite: {
    // PGlite ships WASM + data files that must not be pre-bundled
    optimizeDeps: {
      exclude: ['@electric-sql/pglite'],
      include: [
        '@fullcalendar/core', '@fullcalendar/core/locales/it', '@fullcalendar/timegrid', '@fullcalendar/daygrid',
        '@fullcalendar/interaction', '@fullcalendar/luxon3', 'intl-tel-input', 'intl-tel-input/utils',
        'flatpickr', 'flatpickr/dist/l10n/it.js',
      ],
    },
    ssr: { external: ['@electric-sql/pglite'] },
    // Local DB and mocked emails are written inside the project: don't restart the dev server on them
    server: { watch: { ignored: ['**/.pglite/**', '**/.mail-outbox/**'] } },
  },
});
