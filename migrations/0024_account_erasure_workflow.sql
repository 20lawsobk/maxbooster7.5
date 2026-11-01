-- AUTHORED ONLY. Requires 0020; apply through the reviewed migration procedure.
-- A request cycle has its own identity so cancelled/reopened cases cannot reuse receipts.
ALTER TABLE account_erasure_requests
  ADD COLUMN IF NOT EXISTS request_id uuid NOT NULL DEFAULT gen_random_uuid();
CREATE UNIQUE INDEX IF NOT EXISTS account_erasure_request_id_idx
  ON account_erasure_requests(request_id);

-- No FK to users: evidence must survive eventual subject removal.
-- Resource references must be opaque inventory IDs, never URLs, credentials or raw PII.
CREATE TABLE IF NOT EXISTS account_erasure_steps (
  -- No FK to the current request cycle: receipts survive cancellation/reopening.
  request_id uuid NOT NULL,
  system_id text NOT NULL,
  inventory_version text NOT NULL,
  policy_version text NOT NULL,
  approval_ref text NOT NULL,
  approved_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'running', 'retry', 'acknowledged')),
  attempts integer NOT NULL DEFAULT 0,
  lease_id uuid,
  lease_until timestamptz,
  retry_at timestamptz,
  receipt_ref text,
  acknowledged_at timestamptz,
  PRIMARY KEY (request_id, system_id),
  CHECK (status <> 'acknowledged' OR
    (receipt_ref IS NOT NULL AND acknowledged_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS account_erasure_steps_retry_idx
  ON account_erasure_steps(status, retry_at, lease_until);