/** Prepare a paid account only in the HTTP runner's owned disposable database.
 * Authentication still uses the real registration, password and session routes.
 * This fixture does not verify payment settlement or alter application gates.
 */
import pg from "pg";

export async function withFixtureDatabase<T>(email: string, operation: (client: pg.Client) => Promise<T>): Promise<T> {
  const database = process.env.DATABASE_URL;
  const base = process.env.TEST_BASE_URL;
  const token = process.env.MAXBOOSTER_ISOLATED_FIXTURE_TOKEN;
  const loopback = new Set(["127.0.0.1", "localhost", "[::1]"]);
  if (process.env.READINESS_ISOLATED_PG !== "1" || !database || !base || !token ||
      !/^[A-Za-z0-9._+-]+@maxbooster-test\.invalid$/.test(email) ||
      !loopback.has(new URL(database).hostname) || !loopback.has(new URL(base).hostname)) {
    throw new Error("Paid fixtures require the owned isolated HTTP runner and synthetic .invalid account");
  }
  const client = new pg.Client({ connectionString: database });
  try {
    await client.connect();
    const owner = await client.query("SELECT current_user AS role");
    if (owner.rows[0]?.role !== "test_fixture") throw new Error("Disposable fixture database role mismatch");
    const proof = await client.query("SELECT token FROM maxbooster_test_fixture_proof WHERE token=$1", [token]);
    if (proof.rowCount !== 1) throw new Error("Disposable fixture database ownership proof mismatch");
    return await operation(client);
  } finally {
    await client.end();
  }
}

export async function provisionFixtureEntitlement(email: string): Promise<string> {
  return withFixtureDatabase(email, async client => {
    const user = await client.query("UPDATE users SET subscription_tier='pro', subscription_status='active', onboarding_completed=true WHERE email=$1 RETURNING id", [email]);
    if (user.rowCount !== 1) throw new Error("Expected one registered synthetic fixture account");
    return user.rows[0].id;
  });
}
