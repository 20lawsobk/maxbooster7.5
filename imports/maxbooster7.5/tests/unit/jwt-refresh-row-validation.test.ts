import { beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  row: undefined as unknown,
  validateBearer: vi.fn(),
}));
vi.mock("../../server/storage", () => ({
  storage: {
    getRefreshToken: async () => f.row,
    getUser: async () => ({ id: "fixture-user", twoFactorEnabled: false }),
  },
}));
vi.mock("../../server/config/env.js", () => ({
  env: { SESSION_SECRET: "unit-test-only-not-a-production-secret-12345" },
}));
vi.mock("../../server/services/sessionTrackingService.js", () => ({ sessionTracking: {} }));
vi.mock("../../server/services/refreshTokenConsumption.js", () => ({
  consumeRefreshToken: () => { throw new Error("These tests must never consume a token"); },
}));
vi.mock("../../server/services/sessionAuthority.js", () => ({
  sessionAuthority: async () => ({ validateBearer: f.validateBearer }),
}));
import { jwtAuthService } from "../../server/services/jwtAuthService";

describe("refresh token row validation", () => {
  beforeEach(() => {
    f.validateBearer.mockReset().mockResolvedValue(false);
  });
  it.each([42, "invalid-row", [], null].map(row => [row]))("rejects non-record rows: %j", async row => {
    f.row = row;
    expect(await jwtAuthService.refreshAccessToken("generation.nomfa.nonce")).toBeNull();
    expect(f.validateBearer).not.toHaveBeenCalled();
  });
  it.each([undefined, null, "invalid-date", {}])("rejects invalid legacy issuance times: %j", async createdAt => {
    f.row = { userId: "fixture-user", createdAt, expiresAt: new Date("2099-01-01") };
    expect(await jwtAuthService.refreshAccessToken("generation.nomfa.nonce")).toBeNull();
    expect(f.validateBearer).not.toHaveBeenCalled();
  });
  it.each([new Date("2026-01-01"), "2026-01-01", Date.parse("2026-01-01")])(
    "preserves valid legacy issuance times: %j", async createdAt => {
      f.row = { userId: "fixture-user", createdAt, expiresAt: new Date("2099-01-01") };
      await jwtAuthService.refreshAccessToken("generation.nomfa.nonce");
      expect(f.validateBearer).toHaveBeenCalledWith("fixture-user", Date.parse("2026-01-01"));
    },
  );
  it("preserves the embedded issuance time for current token formats", async () => {
    f.row = { userId: "fixture-user", expiresAt: new Date("2099-01-01") };
    const issuedAt = Date.parse("2026-01-01");
    await jwtAuthService.refreshAccessToken(`generation.nomfa.t${issuedAt}.nonce`);
    expect(f.validateBearer).toHaveBeenCalledWith("fixture-user", issuedAt);
  });
});
