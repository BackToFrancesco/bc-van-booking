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

INSERT INTO vans (id, name, seats, description, sort_order) VALUES
  ('pulmino-1', 'Pulmino 1', 9, NULL, 1),
  ('pulmino-2', 'Pulmino 2', 9, NULL, 2),
  ('pulmino-3', 'Pulmino 3', 9, NULL, 3)
ON CONFLICT (id) DO NOTHING;
