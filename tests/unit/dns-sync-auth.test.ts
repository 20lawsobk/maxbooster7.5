import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enforceMaintenance: vi.fn((_req: unknown, res: any) =>
    res.status(403).json({ code: "ADMIN_ONLY_MODE" }),
  ),
  enforceAssurance: vi.fn(() => true),
}));

vi.mock("../../server/services/governancePolicyService.js", () => ({
  enforceMaintenance: mocks.enforceMaintenance,
}));
vi.mock("../../server/middleware/authAssurance.js", () => ({
  enforceAssurance: mocks.enforceAssurance,
}));

import { governanceBoundary } from "../../server/middleware/governanceBoundary.js";
import {
  ensureDnsSyncSecret,
  hasValidDnsSyncSecret,
  isDnsZoneSyncRequest,
} from "../../server/lib/dnsSyncAuth.js";

const originalLocal = process.env.DNS_NODE_LOCAL;
const originalSecret = process.env.DNS_SYNC_SECRET;

function invokeBoundary(path: string, method: string, secret?: string) {
  const status = vi.fn(function (this: any) {
    return this;
  });
  const json = vi.fn(function (this: any) {
    return this;
  });
  const req = {
    path,
    method,
    headers: {},
    get: (name: string) =>
      name.toLowerCase() === "x-dns-sync-secret" ? secret : undefined,
  };
  const res = { status, json };
  const next = vi.fn();
  return { req, res, next, run: () => governanceBoundary(req as any, res as any, next) };
}

describe("DNS service-to-service zone sync authentication", () => {
  beforeEach(() => {
    delete process.env.DNS_SYNC_SECRET;
    process.env.DNS_NODE_LOCAL = "1";
    mocks.enforceMaintenance.mockClear();
    mocks.enforceAssurance.mockClear();
  });

  afterEach(() => {
    if (originalLocal === undefined) delete process.env.DNS_NODE_LOCAL;
    else process.env.DNS_NODE_LOCAL = originalLocal;
    if (originalSecret === undefined) delete process.env.DNS_SYNC_SECRET;
    else process.env.DNS_SYNC_SECRET = originalSecret;
  });

  it("creates one high-entropy secret only when local DNS is enabled", () => {
    const secret = ensureDnsSyncSecret();
    expect(secret).toBeTruthy();
    expect(secret).toHaveLength(43);
    expect(process.env.DNS_SYNC_SECRET).toBe(secret);
    expect(ensureDnsSyncSecret()).toBe(secret);
  });

  it("does not generate a secret when local DNS is disabled", () => {
    process.env.DNS_NODE_LOCAL = "0";
    expect(ensureDnsSyncSecret()).toBeUndefined();
    expect(process.env.DNS_SYNC_SECRET).toBeUndefined();
  });

  it("compares service credentials safely and rejects missing or unequal values", () => {
    expect(hasValidDnsSyncSecret("same", "same")).toBe(true);
    expect(hasValidDnsSyncSecret("different", "same")).toBe(false);
    expect(hasValidDnsSyncSecret(undefined, "same")).toBe(false);
    expect(hasValidDnsSyncSecret("same", undefined)).toBe(false);
  });

  it("matches only the GET zone-sync route", () => {
    expect(isDnsZoneSyncRequest("GET", "/api/dns/zone/max-booster.com")).toBe(true);
    expect(isDnsZoneSyncRequest("POST", "/api/dns/zone/max-booster.com")).toBe(false);
    expect(isDnsZoneSyncRequest("GET", "/api/dns/zone/../admin")).toBe(false);
  });

  it("admits a valid private sync credential through admin-only mode", async () => {
    const secret = ensureDnsSyncSecret()!;
    const result = invokeBoundary("/api/dns/zone/max-booster.com", "GET", secret);

    await result.run();

    expect(result.next).toHaveBeenCalledOnce();
    expect(result.res.status).not.toHaveBeenCalled();
    expect(mocks.enforceMaintenance).not.toHaveBeenCalled();
  });

  it("rejects missing or invalid sync credentials without entering the admin bypass", async () => {
    const result = invokeBoundary("/api/dns/zone/max-booster.com", "GET");

    await result.run();

    expect(result.res.status).toHaveBeenCalledWith(401);
    expect(result.next).not.toHaveBeenCalled();
    expect(mocks.enforceMaintenance).not.toHaveBeenCalled();
  });

  it("keeps unrelated routes behind the ordinary governance policy", async () => {
    const result = invokeBoundary("/api/admin/status", "GET");

    await result.run();

    expect(mocks.enforceMaintenance).toHaveBeenCalledOnce();
  });
});
