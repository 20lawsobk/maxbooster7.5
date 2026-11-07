/** Real private-mode HTTP/session/SQL evidence; refuses any non-owned database. */
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import bcrypt from "bcrypt";
import { withFixtureDatabase } from "./helpers-http-fixture";

const suffix = randomUUID().replaceAll("-", "");
const password = "IsolatedAdmin93!Fixture";
function account(label: string) {
  const cookies = new Map<string, string>();
  const email = `${label}_${suffix}@maxbooster-test.invalid`;
  const id = randomUUID();
  async function api(method: string, path: string, body?: Record<string, unknown>) {
    if (method !== "GET" && !cookies.has("csrf-token")) await api("GET", "/api/csrf-token");
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (cookies.size) headers.Cookie = [...cookies].map(([key, value]) => `${key}=${value}`).join("; ");
    if (method !== "GET" && cookies.has("csrf-token")) headers["x-csrf-token"] = cookies.get("csrf-token")!;
    const response = await fetch(process.env.TEST_BASE_URL + path, {
      method, headers, redirect: "manual", ...(body ? { body: JSON.stringify(body) } : {}),
    });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";", 1)[0], index = pair.indexOf("=");
      cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return { status: response.status, data: await response.json() };
  }
  return { email, id, api, sessionToken: "" };
}
const admin = account("private_admin");
const ordinary = account("private_user");
const visitor = account("visitor");
let projectId: string;

beforeAll(async () => {
  if (process.env.MAXBOOSTER_TEST_ACCESS_PROFILE !== "private-admin") {
    throw new Error("This suite requires the owned private-admin HTTP fixture");
  }
  await withFixtureDatabase(admin.email, async client => {
    const hashed = await bcrypt.hash(password, 12);
    for (const [user, role] of [[admin, "admin"], [ordinary, "user"]] as const) {
      await client.query(
        "INSERT INTO users (id,email,username,password,role,subscription_tier,subscription_status,onboarding_completed) VALUES ($1,$2,$3,$4,$5,'free','none',true)",
        [user.id, user.email, user.email.split("@")[0], hashed, role],
      );
    }
  });
  for (const user of [admin, ordinary]) {
    const login = await user.api("POST", "/api/auth/login", { email: user.email, password });
    expect(login.status).toBe(200);
    user.sessionToken = login.data.sessionToken;
  }
});

describe("private administrator real HTTP release boundary", () => {
  it("admits a real admin bearer token without cookies and rejects a non-admin token", async () => {
    for (const [user, status] of [[admin, 200], [ordinary, 403]] as const) {
      expect(typeof user.sessionToken).toBe("string");
      expect(user.sessionToken.length).toBeGreaterThan(20);
      const response = await fetch(process.env.TEST_BASE_URL + "/api/projects", {
        headers: { Authorization: `Bearer ${user.sessionToken}` },
      });
      expect(response.status).toBe(status);
    }
  });
  it("publishes the private policy in the authoritative session", async () => {
    const response = await admin.api("GET", "/api/auth/me");
    expect(response.status).toBe(200);
    expect(response.data.role).toBe("admin");
    expect(response.data.adminOnlyMode).toBe(true);
  });
  it("rejects registration even with a forged administrator role", async () => {
    const response = await visitor.api("POST", "/api/auth/register", {
      email: visitor.email, username: `visitor_${suffix}`, password, role: "admin",
    });
    expect(response.status).toBe(403);
    await withFixtureDatabase(visitor.email, async client => {
      expect((await client.query("SELECT id FROM users WHERE email=$1", [visitor.email])).rowCount).toBe(0);
    });
  });
  it("denies ordinary-account and anonymous access before domain dispatch", async () => {
    for (const user of [ordinary, visitor]) {
      for (const path of ["/api/projects", "/api/developer/keys", "/api/studio/projects", "/api/admin/dashboard"]) {
        const response = await user.api("GET", path);
        expect(response.status).toBe(403);
        expect(response.data.code).toBe("ADMIN_ONLY_MODE");
      }
    }
  });
  it("saves an admin-owned project without a public subscription", async () => {
    const response = await admin.api("POST", "/api/projects", { title: `Private ${suffix}`, userId: ordinary.id });
    expect(response.status).toBe(200);
    expect(response.data.userId).toBe(admin.id);
    projectId = response.data.id;
    await withFixtureDatabase(admin.email, async client => {
      expect((await client.query("SELECT user_id FROM projects WHERE id=$1", [projectId])).rows[0].user_id).toBe(admin.id);
    });
  });
  it("preserves the project through logout and a fresh login", async () => {
    expect(projectId).toBeTruthy();
    expect((await admin.api("POST", "/api/auth/logout", {})).status).toBe(200);
    expect((await admin.api("GET", `/api/studio/projects/${projectId}`)).status).toBe(403);
    expect((await admin.api("POST", "/api/auth/login", { email: admin.email, password })).status).toBe(200);
    const response = await admin.api("GET", `/api/studio/projects/${projectId}`);
    expect(response.status).toBe(200);
    expect(response.data.id).toBe(projectId);
  });
  it("creates an Enterprise API key for the admin rather than the submitted owner", async () => {
    const response = await admin.api("POST", "/api/developer/keys/create", {
      keyName: "private-admin-verification", tier: "enterprise", userId: ordinary.id,
    });
    expect(response.status).toBe(201);
    expect(response.data.apiKey.tier).toBe("enterprise");
  });
});
