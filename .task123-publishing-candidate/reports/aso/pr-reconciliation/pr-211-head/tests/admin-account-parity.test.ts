/** Real HTTP/session/SQL boundaries. Only the owned disposable runner may run this suite. */
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { withFixtureDatabase, withFixtureAccountPolicyState } from "./helpers-http-fixture";

const base = process.env.TEST_BASE_URL!;
const suffix = randomUUID().replaceAll("-", "");
type Json = Record<string, unknown>;

function account(name: string) {
  const cookies = new Map<string, string>();
  const email = `parity_${name}_${suffix}@maxbooster-test.invalid`;
  const password = "ParityFixture94!Secure";
  async function api(method: string, path: string, body?: Json) {
    if (method !== "GET" && !cookies.has("csrf-token")) await api("GET", "/api/csrf-token");
    const headers: Record<string, string> = { "Content-Type": "application/json", "x-maxbooster-fixture-client": name };
    if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
    if (method !== "GET" && cookies.has("csrf-token")) headers["x-csrf-token"] = cookies.get("csrf-token")!;
    const response = await fetch(base + path, { method, headers, redirect: "manual",
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0];
      const equals = pair.indexOf("=");
      cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
    }
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: response.status, data };
  }
  return { email, password, api, id: "", clear: () => cookies.clear() };
}

const admin = account("admin"), paid = account("paid"), other = account("other"), free = account("free");
const owned = new Map<string, Json>();

beforeAll(async () => {
  if (!process.env.MAXBOOSTER_ISOLATED_FIXTURE_TOKEN) throw new Error("Use the owned isolated HTTP runner");
  for (const user of [admin, paid, other, free]) {
    const registered = await user.api("POST", "/api/auth/register", {
      email: user.email, password: user.password, birthdate: "1990-01-01", firstName: "Parity", lastName: "Fixture",
      role: "admin", subscriptionTier: "lifetime", subscriptionStatus: "active",
    });
    expect(registered.status).toBe(200);
    user.id = await withFixtureDatabase(user.email, async client => {
      const row = await client.query("SELECT id,role,subscription_tier FROM users WHERE email=$1", [user.email]);
      expect(row.rowCount).toBe(1);
      expect(row.rows[0].role).toBe("user");
      expect(row.rows[0].subscription_tier).not.toBe("lifetime");
      await client.query(`UPDATE users SET role=$1, subscription_tier=$2, subscription_status=$3,
        trial_ends_at=NULL, subscription_ends_at=NULL, onboarding_completed=true WHERE email=$4`,
        [user === admin ? "admin" : "user", user === paid || user === other ? "monthly" : "free",
          user === paid || user === other ? "active" : "none", user.email]);
      return String(row.rows[0].id);
    });
    user.clear();
    expect((await user.api("POST", "/api/auth/login", { email: user.email, password: user.password })).status).toBe(200);
  }
});

describe("admin and regular accounts share real feature handlers", () => {
  for (const [label, user] of [["admin", admin], ["paid user", paid]] as const) {
    it(`${label} creates and reads a durable project through shared routes`, async () => {
      const created = await user.api("POST", "/api/projects", { title: `Private ${label}`, userId: other.id });
      expect(created.status).toBe(200);
      const project = created.data as Json;
      expect(project.userId).toBe(user.id);
      expect(typeof project.id).toBe("string");
      owned.set(user.id, project);
      const fetched = await user.api("GET", `/api/studio/projects/${project.id}`);
      expect(fetched.status).toBe(200);
      expect((fetched.data as Json).id).toBe(project.id);
      await withFixtureDatabase(user.email, async client => {
        const saved = await client.query("SELECT user_id,title FROM projects WHERE id=$1", [project.id]);
        expect(saved.rows).toEqual([{ user_id: user.id, title: `Private ${label}` }]);
      });
    });
  }

  it("shared listings keep admin and paid-user projects scoped to their owners", async () => {
    for (const user of [admin, paid, other]) {
      const response = await user.api("GET", "/api/studio/projects");
      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect((response.data as Json[]).every(row => row.userId === user.id)).toBe(true);
      for (const [owner, project] of owned) {
        expect((response.data as Json[]).some(row => row.id === project.id)).toBe(owner === user.id);
      }
    }
  });

  it("admin has paid feature access without a public subscription", async () => {
    expect((await admin.api("GET", "/api/studio/projects")).status).toBe(200);
  });

  it("free accounts cannot obtain paid access through forged request fields", async () => {
    const response = await free.api("GET", "/api/studio/projects?role=admin&subscriptionTier=lifetime");
    expect(response.status).toBe(403);
    expect((response.data as Json).code).toBe("PAID_SUBSCRIPTION_REQUIRED");
  });

  it("ordinary paid accounts cannot open admin-only endpoints", async () => {
    expect((await paid.api("GET", "/api/admin/dashboard?role=admin")).status).toBe(403);
    expect((await admin.api("GET", "/api/admin/dashboard")).status).toBe(200);
  });

  it("anonymous access to private features remains denied", async () => {
    const response = await account("anonymous").api("GET", "/api/studio/projects");
    expect(response.status).toBe(401);
  });

  it("admin reaches AI input validation without being forced to buy a plan", async () => {
    // Invalid input proves entitlement admission without invoking any AI provider.
    const response = await admin.api("POST", "/api/ai/optimize-content", {});
    expect(response.status).toBe(400);
    expect((response.data as Json).message).toContain("Content is required");
  });

  it("paid conversion supersedes an old trial date without bypassing subscription expiration", async () => {
    await withFixtureDatabase(paid.email, async client => {
      await client.query("UPDATE users SET trial_ends_at='2000-01-01' WHERE id=$1", [paid.id]);
      try {
        expect((await paid.api("GET", "/api/studio/projects")).status).toBe(200);
      } finally {
        await client.query("UPDATE users SET trial_ends_at=NULL WHERE id=$1", [paid.id]);
      }
    });
    await withFixtureAccountPolicyState(paid.email, "subscription-expired", async () => {
      const result = await paid.api("GET", "/api/studio/projects");
      expect(result.status).toBe(403);
      expect((result.data as Json).subscriptionExpired).toBe(true);
    });
  });

  it("expired trials without active paid conversion remain denied", async () => {
    await withFixtureAccountPolicyState(paid.email, "trial-expired", async () => {
      const result = await paid.api("GET", "/api/studio/projects");
      expect(result.status).toBe(403);
      expect((result.data as Json).trialExpired).toBe(true);
    });
  });
});

describe("ordinary feature routes preserve isolation even for administrators", () => {
  for (const [label, actor, victim] of [["another user", other, paid], ["admin", admin, paid], ["paid user", paid, admin]] as const) {
    it(`${label} cannot read or mutate another account's project`, async () => {
      const project = owned.get(victim.id)!;
      expect(project).toBeDefined();
      const path = `/api/studio/projects/${project.id}`;
      expect((await actor.api("GET", path)).status).toBe(404);
      expect((await actor.api("PATCH", path, { expectedUpdatedAt: project.updatedAt, title: "Unauthorized" })).status).toBe(404);
      expect((await actor.api("DELETE", path, { expectedUpdatedAt: project.updatedAt })).status).toBe(404);
      await withFixtureDatabase(victim.email, async client => {
        const saved = await client.query("SELECT user_id,title FROM projects WHERE id=$1", [project.id]);
        expect(saved.rows).toEqual([{ user_id: victim.id, title: project.title }]);
      });
    });
  }

  it("concurrent edits cannot silently overwrite an accepted project change", async () => {
    const project = owned.get(paid.id)!;
    const path = `/api/studio/projects/${project.id}`;
    const results = await Promise.all(["First edit", "Second edit"].map(title =>
      paid.api("PATCH", path, { title, expectedUpdatedAt: project.updatedAt })));
    expect(results.map(result => result.status).sort()).toEqual([200, 409]);
    const accepted = results.find(result => result.status === 200)!.data as Json;
    const current = await paid.api("GET", path);
    expect(current.status).toBe(200);
    expect((current.data as Json).title).toBe(accepted.title);
  });

  it("saved projects survive logout and fresh real authentication", async () => {
    expect((await paid.api("POST", "/api/auth/logout")).status).toBe(200);
    paid.clear();
    expect((await paid.api("POST", "/api/auth/login", { email: paid.email, password: paid.password })).status).toBe(200);
    const current = await paid.api("GET", `/api/studio/projects/${owned.get(paid.id)!.id}`);
    expect(current.status).toBe(200);
    expect((current.data as Json).userId).toBe(paid.id);
  });

  it("admin privilege cannot bypass a required MFA challenge", async () => {
    await withFixtureDatabase(admin.email, async client => {
      await client.query("UPDATE users SET two_factor_enabled=true WHERE id=$1", [admin.id]);
      try { expect((await admin.api("GET", "/api/admin/dashboard")).status).toBe(401); }
      finally { await client.query("UPDATE users SET two_factor_enabled=false WHERE id=$1", [admin.id]); }
    });
  });
});
