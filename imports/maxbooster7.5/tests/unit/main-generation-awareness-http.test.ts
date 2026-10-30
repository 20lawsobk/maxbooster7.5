import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ origin: "", receipt: "fresh", upstreamStatus: 200 }));
vi.mock("../../server/config/index.js", () => ({ config: {
  get maxcoreUrl() { return fixture.origin; }, maxcoreGenerationKey: "fixture-channel",
  maxcoreLocal: { enabled: true },
} }));
vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/middleware/auth.js", () => ({
  requireAdmin: (_req: unknown, res: express.Response) => res.sendStatus(403),
  requireAuthOnly: (req: express.Request, res: express.Response, next: () => void) => {
    if (req.get("x-fixture-session") !== "authenticated") return res.sendStatus(401);
    req.user = { id: "session-owner" } as Express.User;
    next();
  },
}));

import proxy from "../../server/routes/maxcoreProxy.js";
let client: typeof import("../../server/services/maxcoreClient.js").MaxCoreAIClient;
const requests: Array<{ path: string; body: Record<string, unknown>; authorization?: string; owner?: string }> = [];
const servers: Server[] = [];
let publicOrigin: string;
async function listen(app: ReturnType<typeof express>) {
  const server = app.listen(0, "127.0.0.1");
  servers.push(server);
  await new Promise<void>(resolve => server.once("listening", resolve));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  const upstream = express();
  upstream.use(express.json());
  upstream.get("/api/platform/model/info", (_req, res) => res.json({
    model_ready: false, model_config: {}, platform_endpoints: [],
  }));
  upstream.use((req, res) => {
    requests.push({ path: req.path, body: req.body,
      authorization: req.get("authorization"), owner: req.get("x-maxcore-user-id") });
    if (req.get("authorization") !== "Bearer fixture-channel") return res.sendStatus(401);
    if (req.path === "/api/awareness/unified/context") {
      if (fixture.receipt === "unavailable") return res.status(503).json({ detail: "private upstream detail" });
      return res.json({
        snapshot_id: fixture.receipt === "warming" ? null : "canonical-live-snapshot",
        ready: fixture.receipt !== "warming",
        expires_at: Date.now() / 1000 + (fixture.receipt === "stale" ? -1 : 60),
        awareness: fixture.receipt === "structured"
          ? { contextString: "UNTRUSTED public live observations", source: "fixture-feed" }
          : "UNTRUSTED public live observations",
      });
    }
    if (["/api/generate/content", "/api/platform/social/generate", "/api/generate/image",
      "/api/generate/audio", "/api/generate/video", "/api/generate-video",
      "/api/video/generate-ai", "/api/platform/daw/generate"].includes(req.path)) {
      return res.status(fixture.upstreamStatus).json(fixture.upstreamStatus === 503
        ? { detail: "no_operationally_capable_certified_public_live_candidate" }
        : { caption: "Isolated upstream contract fixture" });
    }
    return res.sendStatus(404);
  });
  fixture.origin = await listen(upstream);
  client = (await import("../../server/services/maxcoreClient.js")).MaxCoreAIClient;
  const app = express(); app.use(express.json(), proxy);
  publicOrigin = await listen(app);
});
beforeEach(() => {
  requests.length = 0; fixture.receipt = "fresh"; fixture.upstreamStatus = 200;
  // Reproduce the real cached model-info state: awareness is independently up.
  Object.assign(client, { _remoteAvailable: false, _cbFailures: 0,
    _cbOpenUntil: 0, _cbProbing: false, _endpointSuppressed: new Map() });
});
afterAll(async () => {
  for (const server of servers) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});

describe("main generation's canonical awareness HTTP boundary", () => {
  it.each(["infer", "generate"] as const)("%s fetches fresh canonical context despite model-info not ready", async method => {
    const body = { platform: "instagram", topic: "my release", instruction: "  exact instruction\n",
      awareness: { snapshot_id: "caller-spoof", custom: "caller context" } };
    await expect(client[method]("/api/generate/content", body, "background-owner"))
      .resolves.toEqual({ caption: "Isolated upstream contract fixture" });
    expect(requests.map(r => r.path)).toEqual(["/api/awareness/unified/context", "/api/generate/content"]);
    expect(requests[0].body).toEqual({ modality: "content", platform: "instagram" });
    expect(requests[1]).toMatchObject({ owner: "background-owner", authorization: "Bearer fixture-channel",
      body: { instruction: body.instruction, awareness: { snapshot_id: "canonical-live-snapshot",
        awareness: "UNTRUSTED public live observations", caller_context: body.awareness } } });
    expect(body.awareness.snapshot_id).toBe("caller-spoof");
  });
  it("preserves structured live context for the direct social generation path", async () => {
    fixture.receipt = "structured";
    await client.generate("/api/platform/social/generate", { platform: "tiktok", topic: "music" });
    expect(requests[0].body).toEqual({ modality: "social", platform: "tiktok" });
    expect(requests[1].body.awareness).toMatchObject({ snapshot_id: "canonical-live-snapshot",
      awareness: { contextString: "UNTRUSTED public live observations", source: "fixture-feed" } });
  });
  it.each([
    ["/api/generate/image", "image"], ["/api/generate/audio", "audio"],
    ["/api/generate/video", "video"], ["/api/generate-video", "video"],
    ["/api/video/generate-ai", "video"], ["/api/platform/daw/generate", "music"],
  ])("attaches canonical %s context for every media transport alias", async (endpoint, modality) => {
    await client.generate(endpoint, { platform: "instagram", prompt: "Exact caller prompt" }, "background-owner");
    expect(requests.map(r => r.path)).toEqual(["/api/awareness/unified/context", endpoint]);
    expect(requests[0].body).toEqual({ modality, platform: "instagram" });
    expect(requests[1]).toMatchObject({ owner: "background-owner", body: {
      prompt: "Exact caller prompt", awareness: { snapshot_id: "canonical-live-snapshot" },
    } });
  });
  it.each(["warming", "stale", "unavailable"])("blocks generation with %s context instead of making up conditioning", async receipt => {
    fixture.receipt = receipt;
    await expect(client.infer("/api/generate/content", { topic: "music" })).rejects.toMatchObject({ status: 503 });
    expect(requests.map(r => r.path)).toEqual(["/api/awareness/unified/context"]);
  });
  it("keeps the real generation capability failure after attaching fresh awareness", async () => {
    fixture.upstreamStatus = 503;
    await expect(client.infer("/api/generate/content", { topic: "music" })).rejects.toMatchObject({ status: 503 });
    expect(requests[1].body.awareness).toMatchObject({ snapshot_id: "canonical-live-snapshot" });
  });
  it("enriches the authenticated direct proxy and preserves upstream503 plus session ownership", async () => {
    fixture.upstreamStatus = 503;
    const r = await fetch(`${publicOrigin}/api/generate/content`, { method: "POST",
      headers: { "Content-Type": "application/json", "x-fixture-session": "authenticated" },
      body: JSON.stringify({ platform: "instagram", topic: "music", owner_id: "victim", user_id: "victim" }) });
    expect(r.status).toBe(503);
    expect(await r.json()).toEqual({ detail: "no_operationally_capable_certified_public_live_candidate" });
    expect(requests[1]).toMatchObject({ owner: "session-owner", body: { user_id: "session-owner",
      awareness: { snapshot_id: "canonical-live-snapshot" } } });
    expect(requests[1].body).not.toHaveProperty("owner_id");
  });
  it("rejects anonymous requests before accessing awareness or generation", async () => {
    const r = await fetch(`${publicOrigin}/api/generate/content`, { method: "POST",
      headers: { "Content-Type": "application/json" }, body: "{}" });
    expect(r.status).toBe(401); expect(requests).toHaveLength(0);
  });
  it("returns a redacted awareness503 from the direct proxy without dispatching generation", async () => {
    fixture.receipt = "unavailable";
    const r = await fetch(`${publicOrigin}/api/generate/content`, { method: "POST",
      headers: { "Content-Type": "application/json", "x-fixture-session": "authenticated" }, body: "{}" });
    expect(r.status).toBe(503); expect(await r.text()).not.toContain("private upstream detail");
    expect(requests.map(r => r.path)).toEqual(["/api/awareness/unified/context"]);
  });
});
