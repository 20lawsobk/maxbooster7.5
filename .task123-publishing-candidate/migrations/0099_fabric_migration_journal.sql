-- Apply after 0096 with old catalog writers drained. A target reservation and
-- its cleanup receipt preserve capacity across failed/ambiguous physical I/O.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('fabric-chunk:root-catalog',0));
CREATE TABLE IF NOT EXISTS fabric_migration_jobs (
  id text PRIMARY KEY,
  chunk_id text NOT NULL UNIQUE,
  from_node text NOT NULL,
  to_node text NOT NULL,
  source_key text NOT NULL,
  target_key text NOT NULL UNIQUE,
  size_bytes bigint NOT NULL CHECK(size_bytes>=0),
  checksum text NOT NULL,
  state text NOT NULL CHECK(state IN ('copying','published')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(from_node<>to_node)
);
COMMIT;
