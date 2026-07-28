-- Add ACME certificate storage columns to storefront_hosts.
-- Issued via Let's Encrypt DNS-01 (we control the zone), private keys are
-- AES-256-GCM encrypted with the acme_key_encryption_key in platform_settings.

ALTER TABLE storefront_hosts
  ADD COLUMN IF NOT EXISTS cert_pem                    TEXT,
  ADD COLUMN IF NOT EXISTS cert_key_encrypted          TEXT,
  ADD COLUMN IF NOT EXISTS cert_chain_pem              TEXT,
  ADD COLUMN IF NOT EXISTS cert_serial                 TEXT,
  ADD COLUMN IF NOT EXISTS cert_provision_attempts     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cert_last_error             TEXT,
  ADD COLUMN IF NOT EXISTS cert_last_attempt_at        TIMESTAMP,
  ADD COLUMN IF NOT EXISTS cert_renewal_after          TIMESTAMP;

-- Index for the renewal worker: find hosts whose certs are due for renewal.
CREATE INDEX IF NOT EXISTS idx_storefront_hosts_cert_renewal_after
  ON storefront_hosts (cert_renewal_after)
  WHERE cert_status = 'issued';

-- Index for backoff: find hosts with failed/pending provisioning to retry.
CREATE INDEX IF NOT EXISTS idx_storefront_hosts_cert_status_attempt
  ON storefront_hosts (cert_status, cert_last_attempt_at);
