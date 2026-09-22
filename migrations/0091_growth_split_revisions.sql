-- Additive only. Pending operator application to shared Neon database.
CREATE TABLE IF NOT EXISTS growth_split_revisions (
  sheet_id text NOT NULL,
  revision integer NOT NULL CHECK (revision > 0),
  content jsonb NOT NULL,
  content_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sheet_id, revision)
);
CREATE TABLE IF NOT EXISTS growth_split_assents (
  sheet_id text NOT NULL,
  revision integer NOT NULL,
  user_id text NOT NULL,
  signature_hash text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (sheet_id, revision, user_id),
  FOREIGN KEY (sheet_id, revision) REFERENCES growth_split_revisions(sheet_id, revision)
);