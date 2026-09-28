# BC Van Booking

Online booking system for the vans ("pulmini") of **Basket Conselve ASD**. Same concept and style as `bc-booking` (beach volley court), adapted for multi-day bookings.

## Stack

Astro (SSR, Vercel adapter) · TypeScript · PostgreSQL (PGlite locally, Neon in production) · FullCalendar v6 (+ Luxon for the Europe/Rome time zone) · flatpickr · Nodemailer

## Features

- Landing page with one card per van → one booking page per van (`/pulmini/<id>`).
- Booking page: "Dal/Al" form (gg/mm/aaaa date picker + whole hour) with live availability check; if the van is busy it suggests the other free vans (with seats) and links to them with the same period prefilled. Below, a read-only week calendar of the van (tap once for start, again for end).
- Rules: whole hours, min 1 h, no max (multi-day allowed), at least 7 days in advance, any day/hour. Config in `src/lib/config.ts`, validation in `src/lib/booking-rules.ts` (shared by client and API).
- Admin (`/admin`): pending requests (accept / reject), calendar filterable per van, status editable in any direction (e.g. rejected → accepted), period editable, delete; drag on the calendar to block a period (single van or all vans); **season blocks** — recurring weekdays + hours over a date range (e.g. an association every Tue/Thu 18–20 for the whole season), with conflict warning.
- Status flow: `pending → approved | rejected`, with email notifications (request received, new request for admin with link, confirmed, rejected, period changed).

## Setup

```bash
npm install
cp .env.example .env       # ADMIN_PASSWORD etc.
npm run dev                # localhost:4321
```

No database to install: without `DATABASE_URL` the app uses **PGlite** (Postgres in WASM) persisted in `.pglite/`, and applies `schema.sql` automatically. Delete `.pglite/` to reset the local data.

### Emails (mocked)

With `EMAIL_TRANSPORT=mock` (default) emails are not sent: they are saved to `.mail-outbox/emails.json` and can be viewed at **`/dev/emails`** (admin login required; link in the admin header).
To send real emails: `EMAIL_TRANSPORT=smtp`, `SMTP_USER=pulmini@basketconselve.com`, `SMTP_PASSWORD=<App Password>`.
basketconselve.com is on Google Workspace, so SMTP defaults to `smtp.gmail.com:465`; the App Password is created on the `pulmini@` account (2-Step Verification must be on).

### Environment

```env
ADMIN_PASSWORD=...
ADMIN_EMAIL=...             # receives "new request" emails
SITE_URL=http://localhost:4321
EMAIL_TRANSPORT=mock        # mock | smtp
SMTP_USER=pulmini@basketconselve.com
SMTP_PASSWORD=...           # Google App Password (16 chars)
CONTACT_NAME=...            # WhatsApp contact on site + emails (hidden if unset)
CONTACT_PHONE=+39 ...
# DATABASE_URL=postgresql://...   # Neon; leave unset for local PGlite
```

### Deploy (later)

1. Create the Neon DB and run `schema.sql` on it.
2. Set the env vars on Vercel (`DATABASE_URL`, `ADMIN_PASSWORD`, `ADMIN_EMAIL`, `SITE_URL`, `EMAIL_TRANSPORT=smtp`, SMTP vars, `CONTACT_NAME`, `CONTACT_PHONE`).
3. Van names/photos: edit the `vans` rows (`photo` = path under `public/`).

`src/lib/db.ts` exposes a single `sql` tagged template that works on both drivers — keep queries plain and parameterized (no postgres.js-only helpers).

## Project layout

```
src/
├── layouts/PublicLayout.astro   # topbar, hero, contact box, footer
├── pages/
│   ├── index.astro              # van selection
│   ├── pulmini/[slug].astro     # booking page
│   ├── admin.astro              # admin panel
│   ├── dev/emails.astro         # mocked email viewer
│   └── api/                     # slots, bookings, admin endpoints
├── lib/                         # db, repo, booking rules, time (Rome TZ), email, config
└── middleware.ts                # admin auth (/admin, /api/admin, /dev)
schema.sql                       # DB schema + van seed
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Dev server |
| `npm test` | Unit tests (booking rules, time zone helpers) |
| `npm run build` | Production build |

## Notes

- All times are Europe/Rome; DB stores UTC (`TIMESTAMPTZ`). Calendars are pinned to Rome time regardless of the device time zone.
- Season blocks are materialized as rows in `blocked_slots` (linked by `series_id`): a single day can be unblocked, or the whole series deleted.
- Not done yet: the optional third email with the mileage (km) form link.
