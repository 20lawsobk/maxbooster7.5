/**
 * Set the application schema on every app-owned PostgreSQL client.
 *
 * Neon/PgBouncer transaction pooling can route separate statements from one
 * logical client through different backend sessions. The application must not
 * depend on a session-level search_path being inherited from an earlier query.
 * Main application queries target the public schema; MaxCore's separate direct
 * connection configures its own schema independently.
 */
export const APPLICATION_DATABASE_SESSION_SQL =
  "SELECT set_config('search_path', 'public', false), " +
  "set_config('statement_timeout', '30s', false)";

export interface QueryableDatabaseClient {
  query(statement: string): Promise<unknown>;
}

export async function configureApplicationDatabaseSession(
  client: QueryableDatabaseClient,
): Promise<void> {
  await client.query(APPLICATION_DATABASE_SESSION_SQL);
}
