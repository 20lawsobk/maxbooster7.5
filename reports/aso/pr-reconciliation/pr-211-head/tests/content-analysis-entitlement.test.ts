/** Real paid access at the mounted router; invalid asset input never invokes a provider. */
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { withFixtureDatabase } from "./helpers-http-fixture";

const email = `content_entitlement_${randomUUID().replaceAll("-", "")}@maxbooster-test.invalid`;
const password = "ContentFixture79!Secure";
const cookies = new Map<string, string>();
async function request(method: string, path: string, body?: Record<string, unknown>): Promise<Response> {
  if (method !== "GET" && !cookies.has("csrf-token")) await request("GET", "/api/csrf-token");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  if (method !== "GET") headers["x-csrf-token"] = cookies.get("csrf-token")!;
  const response = await fetch(process.env.TEST_BASE_URL + path, { method, headers,
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20000) });
  for (const header of response.headers.getSetCookie()) {
    const pair = header.split(";", 1)[0], index = pair.indexOf("=");
    cookies.set(pair.slice(0, index), pair.slice(index + 1));
  }
  return response;
}

beforeAll(async () => {
  if (!process.env.MAXBOOSTER_ISOLATED_FIXTURE_TOKEN) throw new Error("Use the owned isolated HTTP runner");
  expect((await request("POST", "/api/auth/register", { email, password, birthdate: "1990-01-01" })).status).toBe(200);
  expect((await request("POST", "/api/auth/login", { email, password })).status).toBe(200);
});

describe("content analysis uses current paid entitlements", () => {
  it.each([
    { role: "user", tier: "monthly", status: "inactive", expected: 403 },
    { role: "user", tier: "yearly", status: "canceled", expected: 403 },
    { role: "user", tier: "monthly", status: "past_due", expected: 403 },
    { role: "user", tier: "pro", status: "active", expected: 400 },
    { role: "user", tier: "monthly", status: "active", expected: 400 },
    { role: "admin", tier: "free", status: "none", expected: 400 },
  ])("$role/$tier/$status returns $expected before provider work", async policy => {
    await withFixtureDatabase(email, async client => {
      const updated = await client.query(`UPDATE users SET role=$1, subscription_tier=$2, subscription_status=$3,
        trial_ends_at=NULL, subscription_ends_at=NULL WHERE email=$4 RETURNING id`,
        [policy.role, policy.tier, policy.status, email]);
      expect(updated.rowCount).toBe(1);
    });
    const response = await request("POST", "/api/content-analysis/assets", {});
    expect(response.status).toBe(policy.expected);
    const body = await response.json();
    expect(body.error).toBe(policy.expected === 403 ? "Paid subscription required" : 'kind must be "image" or "video"');
  });
});
