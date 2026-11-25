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

/** Actual session policy, including pre-router authority/user hydration.
 * Suspended/banned rows are excluded by the authoritative session store;
 * unverified MFA is excluded by attachUser. These sessions receive the same
 * error-only 401 as an anonymous request, before requireAuth's expiry checks.
 */
export const FIXTURE_ACCOUNT_POLICY_DENIALS = [
  { state: "suspended", status: 401, body: { error: "Authentication required" } },
  { state: "banned", status: 401, body: { error: "Authentication required" } },
  { state: "mfa-required", status: 401, body: { error: "Authentication required" } },
  { state: "trial-expired", status: 403, body: {
    error: "Your 30-day trial has expired. Please contact support to continue using Max Booster.",
    trialExpired: true,
  } },
  { state: "subscription-expired", status: 403, body: {
    error: "Your monthly subscription has expired. Please renew your subscription to continue using Max Booster.",
    subscriptionExpired: true, plan: "monthly",
  } },
] as const;

type FixtureAccountPolicyState = typeof FIXTURE_ACCOUNT_POLICY_DENIALS[number]["state"];

/** Change only this owned synthetic user's policy fields, then restore the
 * original SQL values even if an HTTP assertion fails. No auth epoch, session,
 * provider, payment or application authorization implementation is replaced.
 */
export async function withFixtureAccountPolicyState<T>(
  email: string, state: FixtureAccountPolicyState, operation: () => Promise<T>,
): Promise<T> {
  if (!FIXTURE_ACCOUNT_POLICY_DENIALS.some(row => row.state === state)) {
    throw new Error("Unsupported fixture account policy state");
  }
  return withFixtureDatabase(email, async client => {
    const original = await client.query(
      `SELECT id, role, subscription_status, subscription_tier, trial_ends_at::text AS trial_ends_at,
              subscription_ends_at::text AS subscription_ends_at, two_factor_enabled FROM users WHERE email=$1`, [email],
    );
    if (original.rowCount !== 1 || original.rows[0].role !== "user") {
      throw new Error("Expected one ordinary owned synthetic fixture account");
    }
    const saved = original.rows[0];
    const expired = new Date("2000-01-01T00:00:00.000Z");
    try {
      // Clear other policy conditions so each case isolates the selected gate.
      const changed = await client.query(
        `UPDATE users SET subscription_status=$1, subscription_tier='monthly',
                trial_ends_at=$2, subscription_ends_at=$3, two_factor_enabled=$4
         WHERE id=$5 AND email=$6 RETURNING id`,
        [state === "suspended" || state === "banned" ? state : "active",
          state === "trial-expired" ? expired : null,
          state === "subscription-expired" ? expired : null,
          state === "mfa-required", saved.id, email],
      );
      if (changed.rowCount !== 1) throw new Error("Fixture account policy update lost its owner");
      return await operation();
    } finally {
      const restored = await client.query(
        `UPDATE users SET subscription_status=$1, subscription_tier=$2,
                trial_ends_at=$3, subscription_ends_at=$4, two_factor_enabled=$5
         WHERE id=$6 AND email=$7
         RETURNING id, role, subscription_status, subscription_tier, trial_ends_at::text AS trial_ends_at,
                   subscription_ends_at::text AS subscription_ends_at, two_factor_enabled`,
        [saved.subscription_status, saved.subscription_tier, saved.trial_ends_at,
          saved.subscription_ends_at, saved.two_factor_enabled, saved.id, email],
      );
      if (restored.rowCount !== 1 || JSON.stringify(restored.rows[0]) !== JSON.stringify(saved)) {
        throw new Error("Fixture account policy was not restored to its original SQL values");
      }
    }
  });
}
