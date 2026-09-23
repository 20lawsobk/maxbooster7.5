const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const ENCODED_CONTROL_CHARACTER = /%(?:0[0-9a-f]|1[0-9a-f]|7f)/i;

const SAFE_INHERITED_ENVIRONMENT = [
  "PATH",
  "HOME",
  "LANG",
  "LC_ALL",
  "TMPDIR",
  "SSL_CERT_FILE",
  "SSL_CERT_DIR",
] as const;

export function assertSafeSpawnArguments(args: readonly string[]): void {
  for (const argument of args) {
    if (CONTROL_CHARACTER.test(argument)) {
      throw new Error("Subprocess argument contains a control character");
    }
  }
}

export function restrictedChildEnvironment(
  overrides: Readonly<Record<string, string>>,
  inherited: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const name of SAFE_INHERITED_ENVIRONMENT) {
    const value = inherited[name];
    if (value && !CONTROL_CHARACTER.test(value)) environment[name] = value;
  }
  for (const [name, value] of Object.entries(overrides)) {
    if (CONTROL_CHARACTER.test(name) || CONTROL_CHARACTER.test(value)) {
      throw new Error("Subprocess environment contains a control character");
    }
    environment[name] = value;
  }
  return environment;
}

/**
 * Accept a direct PostgreSQL URI, rather than a libpq service indirection or
 * session-option carrier. The canonical URI is suitable for PGDATABASE.
 */
export function validatePostgresConnectionUrl(value: string): string {
  if (CONTROL_CHARACTER.test(value) || ENCODED_CONTROL_CHARACTER.test(value)) {
    throw new Error("Restore target URL contains a control character");
  }
  const parsed = new URL(value);
  if (
    (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") ||
    !parsed.hostname
  ) {
    throw new Error("Restore target must be a PostgreSQL URL with a hostname");
  }
  if (parsed.hash) throw new Error("Restore target URL must not contain a fragment");

  // These libpq parameters can redirect the connection or inject server
  // command-line settings. Connection/TLS parameters such as sslmode remain
  // available for legitimate managed PostgreSQL targets.
  const forbiddenParameters = new Set([
    "host",
    "hostaddr",
    "service",
    "passfile",
    "options",
    "dbname",
    "port",
  ]);
  for (const name of parsed.searchParams.keys()) {
    if (forbiddenParameters.has(name.toLowerCase())) {
      throw new Error(`Restore target URL must not set libpq ${name}`);
    }
  }
  return parsed.toString();
}

export interface PostgresDatabaseIdentity {
  host: string;
  port: string;
  database: string;
}

/**
 * Resolve the libpq connection fields that identify a database. Query
 * overrides are included for source URLs; validated restore targets forbid
 * them, preventing an apparently isolated path/port from naming production.
 */
export function postgresDatabaseIdentity(value: string): PostgresDatabaseIdentity {
  const parsed = new URL(value);
  const parameters = new Map<string, string>();
  for (const [name, parameterValue] of parsed.searchParams) {
    parameters.set(name.toLowerCase(), parameterValue);
  }
  const rawHost =
    parameters.get("hostaddr") ?? parameters.get("host") ?? parsed.hostname;
  const host = rawHost
    .toLowerCase()
    .replace(/^\[(.*)\]$/, "$1")
    .replace(/\.+$/, "");
  const rawPort = parameters.get("port") ?? (parsed.port || "5432");
  const port = /^\d+$/.test(rawPort) ? String(Number(rawPort)) : rawPort;
  const encodedDatabase = parsed.pathname.startsWith("/")
    ? parsed.pathname.slice(1)
    : parsed.pathname;
  const database =
    parameters.get("dbname") ??
    decodeURIComponent(encodedDatabase || parsed.username);
  return { host, port, database };
}

export function isSamePostgresDatabase(left: string, right: string): boolean {
  const source = postgresDatabaseIdentity(left);
  const target = postgresDatabaseIdentity(right);
  return (
    source.host === target.host &&
    source.port === target.port &&
    source.database === target.database
  );
}