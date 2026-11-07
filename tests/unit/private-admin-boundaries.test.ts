import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Request, Response } from "express";
import { isAdminOnlyMode, shouldBlockNonAdminApp } from "../../shared/adminAccessPolicy.mjs";

const fixtures = vi.hoisted(() => ({
  rows: vi.fn(), getUser: vi.fn(), bypass: vi.fn(),
}));
vi.mock("../../server/db.js", () => ({
  db: { select: () => ({ from: () => ({ where: fixtures.rows }) }) },
}));
vi.mock("../../shared/schema.js", () => ({ systemSettings: { key: "key" } }));
vi.mock("drizzle-orm", () => ({ inArray: vi.fn() }));
vi.mock("../../server/storage", () => ({ storage: { getUser: fixtures.getUser } }));
vi.mock("../../server/services/paymentBypassService", () => ({
  paymentBypassService: { isPaymentBypassed: fixtures.bypass },
}));
vi.mock("../../server/logger.js", () => ({ logger: { warn: vi.fn() } }));
import { assertRegistrationEnabled, enforceMaintenance, readGovernancePolicy } from "../../server/services/governancePolicyService";
import { governanceBoundary } from "../../server/middleware/governanceBoundary";
import { requirePremium } from "../../server/middleware/requirePremium";
import { enforceAssurance } from "../../server/middleware/authAssurance";

function response() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), setHeader: vi.fn() };
}
function request(role?: string, path = "/api/projects") {
  return {
    user: role ? { id: "owned", role, subscriptionStatus: "none" } : undefined,
    method: "GET", path, headers: {},
  } as unknown as Request;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MAXBOOSTER_ADMIN_ONLY_MODE", "");
  vi.stubEnv("MAXBOOSTER_PUBLIC_LAUNCH_ENABLED", "");
  fixtures.rows.mockResolvedValue([]);
  fixtures.bypass.mockResolvedValue(false);
});
afterEach(() => vi.unstubAllEnvs());

describe("private release defaults and authoritative policy", () => {
  it.each([
    {}, { MAXBOOSTER_ADMIN_ONLY_MODE: "false" },
    { MAXBOOSTER_PUBLIC_LAUNCH_ENABLED: "invalid" },
    { MAXBOOSTER_ADMIN_ONLY_MODE: "true", MAXBOOSTER_PUBLIC_LAUNCH_ENABLED: "true" },
    { MAXBOOSTER_ADMIN_ONLY_MODE: "invalid", MAXBOOSTER_PUBLIC_LAUNCH_ENABLED: "true" },
  ])("keeps public access closed for %j", env => {
    expect(isAdminOnlyMode(env)).toBe(true);
  });
  it("requires deliberate public launch and no private override", () => {
    expect(isAdminOnlyMode({ MAXBOOSTER_PUBLIC_LAUNCH_ENABLED: "true" })).toBe(false);
    expect(isAdminOnlyMode({ MAXBOOSTER_ADMIN_ONLY_MODE: "false", MAXBOOSTER_PUBLIC_LAUNCH_ENABLED: "true" })).toBe(false);
  });
  it("keeps registration closed even when a stored setting enables it", async () => {
    fixtures.rows.mockResolvedValue([{ key: "platform.userRegistrationEnabled", value: true }]);
    await expect(assertRegistrationEnabled()).rejects.toThrow("disabled");
    expect(fixtures.rows).not.toHaveBeenCalled();
  });
  it("defaults registration closed after public launch too", async () => {
    vi.stubEnv("MAXBOOSTER_ADMIN_ONLY_MODE", "false");
    vi.stubEnv("MAXBOOSTER_PUBLIC_LAUNCH_ENABLED", "true");
    await expect(assertRegistrationEnabled()).rejects.toThrow("disabled");
  });
  it.each([true, "true"])("accepts stored JSON and serialized JSON when explicitly opened: %j", async value => {
    vi.stubEnv("MAXBOOSTER_ADMIN_ONLY_MODE", "false");
    vi.stubEnv("MAXBOOSTER_PUBLIC_LAUNCH_ENABLED", "true");
    fixtures.rows.mockResolvedValue([{ key: "platform.userRegistrationEnabled", value }]);
    await expect(assertRegistrationEnabled()).resolves.toBeUndefined();
  });
  it("fails closed on malformed persisted policy", async () => {
    fixtures.rows.mockResolvedValue([{ key: "platform.userRegistrationEnabled", value: "broken" }]);
    await expect(readGovernancePolicy()).rejects.toThrow("unavailable");
  });
  it("does not show a non-admin shell while policy is unknown", () => {
    expect(shouldBlockNonAdminApp({ role: "user" }, null)).toBe(true);
    expect(shouldBlockNonAdminApp({ role: "user" }, true)).toBe(true);
    expect(shouldBlockNonAdminApp({ role: "user" }, false)).toBe(false);
    expect(shouldBlockNonAdminApp({ role: "admin" }, true)).toBe(false);
    expect(shouldBlockNonAdminApp(null, true)).toBe(false);
  });
});

describe("shared governance boundary across domain entry paths", () => {
  // These exercise the real shared boundary, not downstream feature success.
  it.each([
    "/api/artists", "/api/fans", "/api/projects", "/api/studio",
    "/api/distribution", "/api/social", "/api/analytics", "/api/ai/insights",
    "/api/collaborations", "/api/marketplace", "/api/billing", "/api/admin",
  ])("rejects non-admin access at %s before dispatch", async path => {
    for (const role of [undefined, "user"]) {
      const res = response(), next = vi.fn();
      await governanceBoundary(request(role, path), res as unknown as Response, next);
      expect(res.status).toHaveBeenCalledWith(403);
      expect(next).not.toHaveBeenCalled();
    }
  });
  it.each(["/login", "/api/auth/me", "/health"])("keeps recovery entry %s available", async path => {
    const next = vi.fn();
    await governanceBoundary(request(undefined, path), response() as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
  });
  it("does not treat a forged role header as administrator authority", async () => {
    const req = request("user");
    req.headers["x-admin"] = "true";
    const res = response(), next = vi.fn();
    await enforceMaintenance(req, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it("allows the admin through maintenance, but not a governance outage", async () => {
    fixtures.rows.mockResolvedValue([{ key: "platform.maintenanceMode", value: true }]);
    const res = response(), next = vi.fn();
    await enforceMaintenance(request("admin"), res as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
    fixtures.rows.mockRejectedValue(new Error("offline"));
    next.mockClear();
    await enforceMaintenance(request("admin"), res as unknown as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(503);
  });
});

describe("stored admin premium entitlement without weakened assurance", () => {
  it("allows a stored admin even if payment-bypass lookup is unavailable", async () => {
    fixtures.getUser.mockResolvedValue({ role: "admin", subscriptionStatus: "none" });
    fixtures.bypass.mockRejectedValue(new Error("offline"));
    const next = vi.fn();
    await requirePremium(request("admin"), response() as unknown as Response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(fixtures.bypass).not.toHaveBeenCalled();
  });
  it("rejects a missing stored account despite enabled global bypass", async () => {
    fixtures.getUser.mockResolvedValue(undefined);
    fixtures.bypass.mockResolvedValue(true);
    const res = response(), next = vi.fn();
    await requirePremium(request("admin"), res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
    expect(fixtures.bypass).not.toHaveBeenCalled();
  });
  it.each(["suspended", "banned"])("rejects a stored %s admin", async subscriptionStatus => {
    fixtures.getUser.mockResolvedValue({ role: "admin", subscriptionStatus });
    fixtures.bypass.mockResolvedValue(true);
    const res = response(), next = vi.fn();
    await requirePremium(request("admin"), res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it("does not trust a stale administrator role", async () => {
    fixtures.getUser.mockResolvedValue({ role: "user", subscriptionStatus: "none" });
    const res = response(), next = vi.fn();
    await requirePremium(request("admin"), res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
  it("still denies an administrator who has not completed MFA", () => {
    const req = request("admin");
    req.user!.twoFactorEnabled = true;
    const res = response();
    expect(enforceAssurance(req, res as unknown as Response)).toBe(false);
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
