CREATE TABLE IF NOT EXISTS arrakis_sessions (
  session_hash text PRIMARY KEY,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS arrakis_sessions_expires_idx ON arrakis_sessions (expires_at);

CREATE TABLE IF NOT EXISTS arrakis_rate_limits (
  bucket_key text PRIMARY KEY,
  count integer NOT NULL,
  reset_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS arrakis_rate_limits_reset_idx ON arrakis_rate_limits (reset_at);

CREATE TABLE IF NOT EXISTS arrakis_base_imports (
  owner_id text NOT NULL,
  import_day date NOT NULL,
  operation_id text NOT NULL,
  payload jsonb NOT NULL,
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (owner_id, operation_id)
);
CREATE INDEX IF NOT EXISTS arrakis_base_imports_daily_idx ON arrakis_base_imports (owner_id, import_day);
CREATE INDEX IF NOT EXISTS arrakis_base_imports_expires_idx ON arrakis_base_imports (expires_at);

CREATE TABLE IF NOT EXISTS arrakis_leases (
  lease_key text PRIMARY KEY,
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS arrakis_population_samples (
  source_id text NOT NULL,
  captured_at timestamptz NOT NULL,
  online integer NOT NULL CHECK (online >= 0),
  PRIMARY KEY (source_id, captured_at)
);

CREATE TABLE IF NOT EXISTS arrakis_guild_logos (
  guild_id text PRIMARY KEY,
  logo_data text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT NOW()
);
