import type { Request, Response } from "express";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/services/jwtAuthService.js", () => ({
  jwtAuthService: { verifyAccessToken: vi.fn() },
}));
vi.mock("../../server/storage.js", () => ({ storage: { getUser: vi.fn() } }));
vi.mock("../../server/logger.js", () => ({ logger: { warn: vi.fn() } }));

import { requireAuth } from "../../server/middleware/auth";

const past = new Date("2000-01-01T00:00:00Z");
const future = new Date("2100-01-01T00:00:00Z");

async function authorize(overrides: Record<string, unknown>, options: {
  authenticated?: boolean;
  verifiedMfa?: boolean;
} = {}) {
  const request = {
    originalUrl: "/api/studio/projects", url: "/api/studio/projects", headers: {},
    isAuthenticated: () => options.authenticated !== false,
    user: {
      id: "regular-account", role: "user", email: "artist@example.test",
      subscriptionTier: "monthly", subscriptionStatus: "active",
      subscriptionEndsAt: future, trialEndsAt: past, twoFactorEnabled: false,
      ...overrides,
    },
    session: { userId: "regular-account", twoFactorVerified: options.verifiedMfa === true },
  } as unknown as Request;
  const response = { status: vi.fn(), json: vi.fn() };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  const next = vi.fn();
  await requireAuth(request, response as unknown as Response, next);
  return { response, next };
}

describe("paid access after a trial conversion", () => {
  it.each(["monthly", "yearly", "pro", "lifetime"])(
    "an active %s subscriber is not locked out by the old trial end", async subscriptionTier => {
      const { response, next } = await authorize({ subscriptionTier });
      expect(next).toHaveBeenCalledExactlyOnceWith();
      expect(response.status).not.toHaveBeenCalled();
    },
  );

  it.each([
    { subscriptionStatus: "trialing" },
    { subscriptionStatus: "inactive" },
    { subscriptionTier: "free" },
    { subscriptionTier: "trial" },
    { subscriptionTier: null },
  ])("an unconverted expired trial remains denied: %j", async policy => {
    const { response, next } = await authorize(policy);
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ trialExpired: true }));
  });

  it("a paid period ending still blocks access even if status has not reconciled", async () => {
    const { response, next } = await authorize({ subscriptionEndsAt: past });
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ subscriptionExpired: true }));
  });

  it.each(["user", "admin"])("unverified MFA still blocks the %s role", async role => {
    const { response, next } = await authorize({ role, twoFactorEnabled: true });
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ requiresTwoFactor: true }));
  });

  it("verified MFA permits the converted paid account", async () => {
    const { response, next } = await authorize({ twoFactorEnabled: true }, { verifiedMfa: true });
    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(response.status).not.toHaveBeenCalled();
  });

  it.each(["suspended", "banned"])("an admin account marked %s remains denied", async subscriptionStatus => {
    const { response, next } = await authorize({ role: "admin", subscriptionStatus });
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({ error: "Account access disabled" });
  });

  it("the authenticated admin keeps intended subscription-independent access", async () => {
    const { response, next } = await authorize({
      role: "admin", subscriptionTier: "free", subscriptionStatus: "inactive", subscriptionEndsAt: past,
    });
    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(response.status).not.toHaveBeenCalled();
  });

  it("an unauthenticated account is still denied", async () => {
    const { response, next } = await authorize({}, { authenticated: false });
    expect(next).not.toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(401);
  });
});
