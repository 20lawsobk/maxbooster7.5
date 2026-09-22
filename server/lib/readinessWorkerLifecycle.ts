/** A single-flight, draining scheduler. Work errors are always reported. */
export function scheduleDrainingWork(
  work: () => Promise<unknown>,
  intervalMs: number,
  reportError: (error: unknown) => void,
) {
  let stopped = false;
  let active: Promise<void> | undefined;
  const tick = () => {
    if (stopped || active) return;
    active = Promise.resolve().then(work).then(() => {}, reportError)
      .finally(() => { active = undefined; });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return async () => {
    stopped = true;
    clearInterval(timer);
    await active;
  };
}

/** Read-only capability checks, not migration application or provenance approval. */
export async function assertWorkerSchema(
  query: (sql: string) => Promise<unknown>,
  backups: boolean,
  fanMail: boolean,
) {
  await query("SELECT id, profile_id, user_id, state, attempts, lease_owner, lease_until, available_at, result, error, updated_at FROM integration_catalog_jobs LIMIT 0");
  if (backups) {
    await query("SELECT key, name, size, checksum, state, created_at FROM runtime_backup_catalog LIMIT 0");
    await query("SELECT day, owner, target_identity, state, started_at, finished_at, lease_until FROM runtime_backup_runs LIMIT 0");
  }
  if (fanMail) {
    await query("SELECT id, artist_id, command_key, subject, body, created_at FROM growth_fan_commands LIMIT 0");
    await query("SELECT command_id, email, state, unsubscribe_hash, unsubscribe_token, attempted_at, completed_at, provider_message_id, outcome_reason FROM growth_fan_recipients LIMIT 0");
    await query("SELECT artist_id, email, state FROM growth_fan_permissions LIMIT 0");
    await query("SELECT event_id, provider_message_id, event_type, occurred_at FROM growth_fan_provider_events LIMIT 0");
  }
}