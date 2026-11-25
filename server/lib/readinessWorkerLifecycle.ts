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
  const schemaProbe = await query(
    `SELECT current_schema() AS current_schema,
       array_agg(required.name) FILTER (
         WHERE to_regclass('public.' || required.name) IS NULL
       ) AS missing_relations
     FROM unnest(ARRAY[
       'fabric_catalog_fence',
       'generated_contracts',
       'integration_catalog_jobs',
       'integration_notification_digest',
       'ip_blacklist',
       'posts',
       'social_accounts',
       'storefront_domains',
       'storefront_hosts',
       'storefronts',
       'user_storage_files',
       'users'
     ]::text[]) AS required(name)`,
  ) as {
    rows?: Array<{
      current_schema?: string | null;
      missing_relations?: string[] | null;
    }>;
  };
  const schemaState = schemaProbe.rows?.[0];
  if (schemaState?.current_schema !== "public") {
    throw new Error(
      `Application database session must resolve public first; current_schema=${schemaState?.current_schema ?? "null"}`,
    );
  }
  if (schemaState.missing_relations?.length) {
    throw new Error(
      `Application database is missing required public relations: ${schemaState.missing_relations.join(", ")}`,
    );
  }
  await query(
    "SELECT id, profile_id, user_id, state, attempts, lease_owner, lease_until, available_at, result, error, updated_at FROM public.integration_catalog_jobs LIMIT 0",
  );
  if (backups) {
    await query("SELECT key, name, size, checksum, state, created_at FROM public.runtime_backup_catalog LIMIT 0");
    await query("SELECT day, owner, target_identity, state, started_at, finished_at, lease_until FROM public.runtime_backup_runs LIMIT 0");
  }
  if (fanMail) {
    await query("SELECT id, artist_id, command_key, subject, body, created_at FROM public.growth_fan_commands LIMIT 0");
    await query("SELECT command_id, email, state, unsubscribe_hash, unsubscribe_token, attempted_at, completed_at, provider_message_id, outcome_reason FROM public.growth_fan_recipients LIMIT 0");
    await query("SELECT artist_id, email, state FROM public.growth_fan_permissions LIMIT 0");
    await query("SELECT event_id, provider_message_id, event_type, occurred_at FROM public.growth_fan_provider_events LIMIT 0");
  }
}