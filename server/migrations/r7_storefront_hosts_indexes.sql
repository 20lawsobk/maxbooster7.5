-- Reassert the indexes already declared by migrations 0014 and r6.
-- The production primary had storefront_hosts but none of these indexes.
-- Run each statement separately; CONCURRENTLY cannot run inside a transaction.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_storefront_hosts_cert_renewal_after
  ON public.storefront_hosts (cert_renewal_after)
  WHERE cert_status = 'issued';

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_storefront_hosts_cert_status_attempt
  ON public.storefront_hosts (cert_status, cert_last_attempt_at);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_storefront_hosts_storefront_id
  ON public.storefront_hosts (storefront_id);
