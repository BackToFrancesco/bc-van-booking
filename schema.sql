-- gen_random_uuid() is built into PostgreSQL 13+ (Neon, PGlite)

CREATE TABLE IF NOT EXISTS vans (
  id          VARCHAR(50) PRIMARY KEY,   -- slug used in URLs
  name        VARCHAR(100) NOT NULL,
  seats       SMALLINT NOT NULL,
  description VARCHAR(500),
  photo       VARCHAR(255),
  sort_order  SMALLINT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bookings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  van_id     VARCHAR(50) NOT NULL REFERENCES vans(id),
  name       VARCHAR(100) NOT NULL,
  company    VARCHAR(150) NOT NULL,
  email      VARCHAR(255) NOT NULL,
  phone      VARCHAR(30) NOT NULL,
  start_at   TIMESTAMPTZ NOT NULL,
  end_at     TIMESTAMPTZ NOT NULL,
  status     VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- status: 'pending' | 'approved' | 'rejected'
CREATE INDEX IF NOT EXISTS bookings_van_range ON bookings (van_id, start_at, end_at);

-- Recurring blocks (e.g. an association booking every Tue/Thu for the whole season)
CREATE TABLE IF NOT EXISTS block_series (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  van_id     VARCHAR(50) REFERENCES vans(id),  -- NULL = all vans
  weekdays   VARCHAR(20) NOT NULL,             -- comma separated, 0=Sun ... 6=Sat
  start_hour SMALLINT NOT NULL,                -- 0-23
  end_hour   SMALLINT NOT NULL,                -- 1-24, exclusive
  valid_from DATE NOT NULL,
  valid_to   DATE NOT NULL,
  reason     VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS blocked_slots (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  van_id     VARCHAR(50) REFERENCES vans(id),  -- NULL = all vans
  start_at   TIMESTAMPTZ NOT NULL,
  end_at     TIMESTAMPTZ NOT NULL,
  reason     VARCHAR(255),
  series_id  UUID REFERENCES block_series(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS blocked_slots_range ON blocked_slots (start_at, end_at);

-- ── Migrations (idempotent: safe to re-run on an existing database) ───────

-- Van details shown to users and used in the confirmation email
ALTER TABLE vans ADD COLUMN IF NOT EXISTS model               VARCHAR(100);  -- e.g. "Fiat Elettrico"
ALTER TABLE vans ADD COLUMN IF NOT EXISTS pickup_location     VARCHAR(255);
ALTER TABLE vans ADD COLUMN IF NOT EXISTS return_instructions VARCHAR(500);
ALTER TABLE vans ADD COLUMN IF NOT EXISTS rate                VARCHAR(255);  -- unused: the rate is defined in the disciplinare

-- Request details (nullable in the DB so older rows stay valid; required by the API)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS destination      VARCHAR(200);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS usage_type       VARCHAR(40);   -- official_match | training | social_sports_event | other
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS age_group        VARCHAR(20);   -- minors | adults
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS estimated_km     INTEGER;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS notes            VARCHAR(1000);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_name      VARCHAR(100);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS driver_phone     VARCHAR(30);
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS license_declared BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(1000);

-- ── Seed ──────────────────────────────────────────────────────────────────
-- seats = passenger seats, the driver is extra ("8 posti + conducente")
INSERT INTO vans (id, name, model, seats, sort_order, pickup_location, return_instructions) VALUES
  ('pulmino-1', 'Pulmino 1', 'Fiat Elettrico', 8, 1,
   'Palestra Morelli, parcheggio lato Mattei (in angolo vicino al campo da Beach Volley)',
   'Se la batteria è sotto il 35%, riporta il pulmino dentro la palestra Morelli (lato spogliatoi), davanti ai box di ricarica; altrimenti riportalo dove lo hai ritirato'),
  ('pulmino-2', 'Pulmino 2', 'Fiat Elettrico', 8, 2,
   'Palestra Morelli, parcheggio lato Mattei (in angolo vicino al campo da Beach Volley)',
   'Se la batteria è sotto il 35%, riporta il pulmino dentro la palestra Morelli (lato spogliatoi), davanti ai box di ricarica; altrimenti riportalo dove lo hai ritirato'),
  ('pulmino-3', 'Pulmino 3', 'Ford Ibrido',    8, 3,
   'Palestra Morelli, parcheggio lato Mattei (in angolo vicino al campo da Beach Volley)',
   'Riconsegna il pulmino con il serbatoio di benzina completamente pieno')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, model = EXCLUDED.model, seats = EXCLUDED.seats,
  pickup_location = EXCLUDED.pickup_location, return_instructions = EXCLUDED.return_instructions;
