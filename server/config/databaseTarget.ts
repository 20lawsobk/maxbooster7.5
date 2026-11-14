/**
 * Select the app's PostgreSQL target.
 *
 * NEON_PRIMARY_URL is the canonical live application database. The app-specific
 * NEON_DATABASE_URL and generic DATABASE_URL remain fallbacks for environments
 * that do not provide the primary Neon URL.
 */
export function selectApplicationDatabaseUrl(environment: {
  NEON_PRIMARY_URL?: string;
  NEON_DATABASE_URL?: string;
  DATABASE_URL?: string;
}): string {
  return (
    environment.NEON_PRIMARY_URL?.trim() ||
    environment.NEON_DATABASE_URL?.trim() ||
    environment.DATABASE_URL?.trim() ||
    ""
  );
}
