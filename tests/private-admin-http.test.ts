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
      for (const path of [
        "/api/projects",
        "/api/developer/keys",
        "/api/press-kit",
        "/api/fan-hub/subscribers",
        "/api/studio/projects",
        "/api/distribution/releases",
        "/api/playlist-pitching",
        "/api/revenue-forecast",
        "/api/assistant/history",
        "/api/collaborations/projects",
        "/api/marketplace/my-beats",
        "/api/billing/subscription",
        "/api/admin/dashboard",
      ]) {
        const response = await user.api("GET", path);
        expect(response.status).toBe(403);
        expect(response.data.code).toBe("ADMIN_ONLY_MODE");
      }
    }
  });
  it("saves and reloads the admin-owned artist press kit", async () => {
    const pressKit = {
      artistName: `Admin artist ${suffix}`,
      bio: "Disposable private-admin acceptance fixture.",
      shortBio: "Private admin fixture.",
      genres: ["electronic"],
      isPublic: false,
    };
    expect((await admin.api("PUT", "/api/press-kit", pressKit)).status).toBe(200);
    const reloaded = await admin.api("GET", "/api/press-kit");
    expect(reloaded.status).toBe(200);
    expect(reloaded.data).toMatchObject(pressKit);
    await withFixtureDatabase(admin.email, async client => {
      const saved = await client.query(
        "SELECT user_id, artist_name, bio FROM press_kits WHERE user_id=$1",
        [admin.id],
      );
      expect(saved.rows).toEqual([{
        user_id: admin.id,
        artist_name: pressKit.artistName,
        bio: pressKit.bio,
      }]);
    });
  });
  it("creates, updates, reloads and deletes an admin-owned fan subscriber", async () => {
    const email = `fan_${suffix}@maxbooster-test.invalid`;
    const created = await admin.api("POST", "/api/fan-hub/subscribers", {
      email, name: "Fixture fan", source: "private-admin-test", tags: ["new"],
    });
    expect(created.status).toBe(201);
    const subscriberId = created.data.id as string;
    expect(typeof subscriberId).toBe("string");
    expect((await admin.api("PUT", `/api/fan-hub/subscribers/${subscriberId}`, {
      name: "Updated fixture fan", tags: ["returning"],
    })).status).toBe(200);
    const listed = await admin.api("GET", "/api/fan-hub/subscribers");
    expect(listed.status).toBe(200);
    expect(listed.data.subscribers).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: subscriberId, name: "Updated fixture fan", tags: ["returning"] }),
    ]));
    await withFixtureDatabase(admin.email, async client => {
      const saved = await client.query(
        "SELECT user_id, email, name FROM fan_subscribers WHERE id=$1",
        [subscriberId],
      );
      expect(saved.rows).toEqual([{
        user_id: admin.id, email, name: "Updated fixture fan",
      }]);
    });
    expect((await admin.api("DELETE", `/api/fan-hub/subscribers/${subscriberId}`)).status).toBe(200);
  });
  it("saves a fan campaign draft and reloads it without sending", async () => {
    const campaign = await admin.api("POST", "/api/fan-campaigns", {
      name: `Private draft ${suffix}`,
      campaignType: "newsletter",
      subject: "Fixture subject",
      body: "Disposable draft; no recipient delivery.",
    });
    expect(campaign.status).toBe(201);
    const campaignId = campaign.data.id as string;
    const updated = await admin.api("PUT", `/api/fan-campaigns/${campaignId}`, {
      name: `Private draft updated ${suffix}`,
    });
    expect(updated.status).toBe(200);
    expect((await admin.api("GET", `/api/fan-campaigns/${campaignId}`)).data.name)
      .toBe(`Private draft updated ${suffix}`);
    expect((await admin.api("DELETE", `/api/fan-campaigns/${campaignId}`)).status).toBe(200);
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
  it("creates and reloads an admin-owned studio project", async () => {
    const created = await admin.api("POST", "/api/studio/projects", {
      title: `Private studio ${suffix}`, genre: "electronic", bpm: 120,
    });
    expect(created.status).toBe(201);
    const studioProjectId = created.data.id as string;
    const reloaded = await admin.api("GET", `/api/studio/projects/${studioProjectId}`);
    expect(reloaded.status).toBe(200);
    expect(reloaded.data).toMatchObject({ id: studioProjectId, userId: admin.id, title: `Private studio ${suffix}` });
    await withFixtureDatabase(admin.email, async client => {
      const saved = await client.query(
        "SELECT user_id,title FROM projects WHERE id=$1",
        [studioProjectId],
      );
      expect(saved.rows).toEqual([{ user_id: admin.id, title: `Private studio ${suffix}` }]);
    });
    const track = await admin.api("POST", "/api/studio/tracks", {
      projectId: studioProjectId,
      name: "Fixture synth",
      trackType: "instrument",
      trackNumber: 0,
    });
    expect(track.status).toBe(201);
    const trackId = track.data.id as string;
    expect((await admin.api("PATCH", `/api/studio/tracks/${trackId}`, {
      name: "Fixture synth edited",
    })).status).toBe(200);
    const tracks = await admin.api("GET", `/api/studio/projects/${studioProjectId}/tracks`);
    expect(tracks.status).toBe(200);
    expect(JSON.stringify(tracks.data)).toContain("Fixture synth edited");
    expect((await admin.api("DELETE", `/api/studio/tracks/${trackId}`)).status).toBe(200);
  });
  it("creates, edits, reloads and removes an undispatched distribution draft", async () => {
    const created = await admin.api("POST", "/api/distribution/releases", {
      title: `Private release ${suffix}`,
      artistName: "Private fixture artist",
      releaseType: "single",
      primaryGenre: "electronic",
      language: "en",
      copyrightYear: 2026,
      copyrightOwner: "Private fixture",
    });
    expect([200, 201]).toContain(created.status);
    const releaseId = created.data.id as string;
    expect(typeof releaseId).toBe("string");
    const edited = await admin.api("PATCH", `/api/distribution/releases/${releaseId}`, {
      title: `Private release edited ${suffix}`,
    });
    expect(edited.status).toBe(200);
    const reloaded = await admin.api("GET", `/api/distribution/releases/${releaseId}`);
    expect(reloaded.status).toBe(200);
    expect(reloaded.data.title).toBe(`Private release edited ${suffix}`);
    const providerStatus = await admin.api("GET", "/api/distribution/platforms/status");
    expect(providerStatus.status).toBe(409);
    expect(providerStatus.data).toMatchObject({
      connected: false,
      requiresConnection: true,
      apiStatus: "not_connected",
    });
    // No provider submission is attempted without a connected sandbox account/receipt.
    expect((await admin.api("DELETE", `/api/distribution/releases/${releaseId}`)).status).toBe(200);
  });
  it("creates and reloads an unsent playlist-pitch marketing draft", async () => {
    const created = await admin.api("POST", "/api/playlist-pitching", {
      trackTitle: `Fixture track ${suffix}`,
      artistName: "Private fixture artist",
      genre: "electronic",
      status: "draft",
    });
    expect(created.status).toBe(201);
    const pitchId = created.data.id as string;
    const listed = await admin.api("GET", "/api/playlist-pitching");
    expect(listed.status).toBe(200);
    expect(listed.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: pitchId, status: "draft" }),
    ]));
    expect((await admin.api("DELETE", `/api/playlist-pitching/${pitchId}`)).status).toBe(200);
  });
  it("loads revenue reports and assistant history for the admin session", async () => {
    for (const path of [
      "/api/revenue-forecast",
      "/api/revenue-forecast/projections",
      "/api/revenue-forecast/accuracy",
      "/api/revenue-forecast/rate",
      "/api/assistant/history",
    ]) {
      expect((await admin.api("GET", path)).status, path).toBe(200);
    }
    const invalidChat = await admin.api("POST", "/api/assistant/chat", { message: "" });
    expect(invalidChat.status).toBe(400);
    expect(invalidChat.data.error).toBe("Message is required");
    // AI generation is not called: this runner has no real model service/receipt.
    const generatedScenario = await admin.api("POST", "/api/revenue-forecast/generate", { months: 2 });
    expect(generatedScenario.status).toBe(200);
    expect(generatedScenario.data.data.provenance).toMatchObject({
      modelVersion: "heuristic-scenario-v2",
      revenueRate: "assumed",
      currency: null,
    });
    await withFixtureDatabase(admin.email, async client => {
      const saved = await client.query(
        "SELECT user_id, period, methodology FROM revenue_forecasts WHERE user_id=$1 AND period='2 months' ORDER BY forecast_date DESC LIMIT 1",
        [admin.id],
      );
      expect(saved.rows).toEqual([{
        user_id: admin.id,
        period: "2 months",
        methodology: "heuristic-scenario-v2",
      }]);
    });
  });
  it("creates and reloads a private collaboration project", async () => {
    const title = `Private collaboration ${suffix}`;
    const created = await admin.api("POST", "/api/collaborations/projects", {
      title, description: "Disposable acceptance fixture", isPublic: false,
    });
    expect([200, 201]).toContain(created.status);
    const projectId = created.data.id as string;
    expect(typeof projectId).toBe("string");
    const listed = await admin.api("GET", "/api/collaborations/projects?ownOnly=true");
    expect(listed.status).toBe(200);
    expect(JSON.stringify(listed.data)).toContain(projectId);
  });
  it("creates, updates, reloads and deletes an admin-owned marketplace merch item", async () => {
    const name = `Fixture merch ${suffix}`;
    const created = await admin.api("POST", "/api/merch", {
      name, description: "Disposable local catalog fixture", price: 12.5,
      category: "clothing", inventory: 1, isActive: true,
    });
    expect(created.status).toBe(201);
    const itemId = created.data.id as string;
    expect((await admin.api("PUT", `/api/merch/${itemId}`, { name: `${name} updated` })).status).toBe(200);
    const listed = await admin.api("GET", "/api/merch");
    expect(listed.status).toBe(200);
    expect(listed.data).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: itemId, name: `${name} updated` }),
    ]));
    expect((await admin.api("DELETE", `/api/merch/${itemId}`)).status).toBe(200);
  });
  it("loads subscription choices and current admin entitlement without checkout", async () => {
    expect((await admin.api("GET", "/api/billing/plans")).status).toBe(200);
    expect((await admin.api("GET", "/api/billing/subscription")).status).toBe(200);
    // Checkout, cancellation and settlement remain provider-backed and are not simulated here.
  });
  it("loads administrator operations without mutating platform settings", async () => {
    for (const path of ["/api/admin/dashboard", "/api/admin/users", "/api/admin/system-health"]) {
      expect((await admin.api("GET", path)).status, path).toBe(200);
    }
  });
  it("creates an Enterprise API key for the admin rather than the submitted owner", async () => {
    const response = await admin.api("POST", "/api/developer/keys/create", {
      keyName: "private-admin-verification", tier: "enterprise", userId: ordinary.id,
    });
    expect(response.status).toBe(201);
    expect(response.data.apiKey.tier).toBe("enterprise");
    const keyId = response.data.apiKey.id as string;
    await withFixtureDatabase(admin.email, async client => {
      const saved = await client.query(
        "SELECT user_id, is_active FROM api_keys WHERE id=$1",
        [keyId],
      );
      expect(saved.rows).toEqual([{ user_id: admin.id, is_active: true }]);
    });
    const listed = await admin.api("GET", "/api/developer/keys");
    expect(listed.status).toBe(200);
    expect(listed.data.apiKeys).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: keyId, tier: "enterprise" }),
    ]));
    expect((await admin.api("DELETE", `/api/developer/keys/${keyId}`)).status).toBe(200);
    await withFixtureDatabase(admin.email, async client => {
      const revoked = await client.query("SELECT is_active FROM api_keys WHERE id=$1", [keyId]);
      expect(revoked.rows).toEqual([{ is_active: false }]);
    });
  });
});
