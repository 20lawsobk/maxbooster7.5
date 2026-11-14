/**
 * Select the app's PostgreSQL target.
 *
 * NEON_DATABASE_URL is the canonical application database. DATABASE_URL is
 * retained only as a compatibility fallback for environments that have not
 * configured the app-specific Neon secret. NEON_PRIMARY_URL is intentionally
 * not used: it may point at a different Neon endpoint than the configured app
 * database.
 */
export function selectApplicationDatabaseUrl(environment: {
  NEON_DATABASE_URL?: string;
  DATABASE_URL?: string;
}): string {
  return (
    environment.NEON_DATABASE_URL?.trim() ||
    environment.DATABASE_URL?.trim() ||
    ""
  );
}
