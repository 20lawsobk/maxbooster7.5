import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const service = vi.hoisted(() => ({
  generateApiKey: vi.fn(), getUserApiUsageStats: vi.fn(), listApiKeys: vi.fn(),
}));
vi.mock("../../server/services/apiKeyService", () => ({ apiKeyService: service }));
import developerApi from "../../server/routes/developerApi";

describe("Developer API page backend (real loopback HTTP, isolated service)", () => {
  let server: Server;
  let base: string;
  let user: any;
  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = user; next(); });
    app.use("/api/developer", developerApi);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/developer`;
  });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  beforeEach(() => {
    vi.clearAllMocks();
    user = { id: "owner", subscriptionTier: "pro", subscriptionStatus: "active" };
    service.getUserApiUsageStats.mockResolvedValue([]);
    service.generateApiKey.mockResolvedValue({ id: "key-1", apiKey: "fixture-only", tier: "pro", rateLimit: 1000 });
  });
  const create = (body: unknown) => fetch(`${base}/keys/create`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });

  it("rejects unauthenticated access before invoking the service", async () => {
    user = undefined;
    expect((await create({ keyName: "test", tier: "free" })).status).toBe(401);
    expect(service.generateApiKey).not.toHaveBeenCalled();
  });
  it.each(["canceled", "past_due", "unpaid", null, "suspended", "banned"])("does not grant paid API capacity for status %s", async status => {
    user.subscriptionStatus = status;
    expect((await create({ keyName: "test", tier: "pro" })).status).toBe(403);
    expect(service.generateApiKey).not.toHaveBeenCalled();
  });
  it.each(["suspended", "banned"])("does not issue even free keys for a %s account", async status => {
    user.subscriptionStatus = status;
    expect((await create({ keyName: "test", tier: "free" })).status).toBe(403);
    expect(service.generateApiKey).not.toHaveBeenCalled();
  });
  it.each(["active", "trialing"])("issues the permitted key for %s accounts with a normalized name", async status => {
    user.subscriptionStatus = status;
    expect((await create({ keyName: "  automation  ", tier: "pro" })).status).toBe(201);
    expect(service.generateApiKey).toHaveBeenCalledExactlyOnceWith("owner", "automation", "pro");
  });
  it("rejects blank key names and unavailable tier escalation", async () => {
    expect((await create({ keyName: "   ", tier: "free" })).status).toBe(400);
    expect((await create({ keyName: "test", tier: "enterprise" })).status).toBe(403);
    expect(service.generateApiKey).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "366", "NaN", "Infinity", "1e3", "30garbage", "1.5", ""])("rejects unbounded or malformed usage days %j", async days => {
    expect((await fetch(`${base}/usage?days=${encodeURIComponent(days)}`)).status).toBe(400);
    expect(service.getUserApiUsageStats).not.toHaveBeenCalled();
  });
  it("uses a numeric default and accepts the documented upper boundary", async () => {
    expect((await fetch(`${base}/usage`)).status).toBe(200);
    expect(service.getUserApiUsageStats).toHaveBeenLastCalledWith("owner", 30);
    expect((await fetch(`${base}/usage?days=365`)).status).toBe(200);
    expect(service.getUserApiUsageStats).toHaveBeenLastCalledWith("owner", 365);
  });
});
