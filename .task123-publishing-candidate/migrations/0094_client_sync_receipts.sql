-- PENDING APPLICATION: additive only; authoring does not apply to shared Neon.
-- Every supported sync mutation and its receipt commit in one transaction.
CREATE TABLE IF NOT EXISTS client_sync_receipts (
  owner_id varchar NOT NULL REFERENCES users(id),
  operation_id varchar(160) NOT NULL,
  payload_hash varchar(64) NOT NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, operation_id)
);
-- Do not expire receipts while clients can replay operations. Retention/GC
-- requires an explicit protocol epoch; time-based deletion reopens duplicates.