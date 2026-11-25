import { beforeEach, describe, expect, it, vi } from "vitest";
const doubles = vi.hoisted(() => ({
  own: vi.fn(), admin: vi.fn(), forUser: vi.fn(),
}));
vi.mock("../../server/storage.js", () => ({
  storage: { getToolostConnection: doubles.own, getAdminToolostConnection: doubles.admin },
}));
vi.mock("../../server/services/toolost-service.js", () => ({
  toolostService: { forUser: doubles.forUser },
}));
import { getOwnedToolostService } from "../../server/services/toolostRuntimeConfig";

describe("account-wide Too Lost financial isolation", () => {
  beforeEach(() => vi.resetAllMocks());
  it("never substitutes the admin connection for an unconnected user", async () => {
    doubles.own.mockResolvedValue(null);
    doubles.admin.mockResolvedValue({ connectedByUserId: "admin" });
    expect(await getOwnedToolostService("user-a")).toBeNull();
    expect(doubles.admin).not.toHaveBeenCalled();
    expect(doubles.forUser).not.toHaveBeenCalled();
  });
  it("rejects a connection owned by another user", async () => {
    doubles.own.mockResolvedValue({ connectedByUserId: "user-b" });
    expect(await getOwnedToolostService("user-a")).toBeNull();
    expect(doubles.forUser).not.toHaveBeenCalled();
  });
  it("uses the authenticated user's own connection", async () => {
    const service = { getRoyaltySummary: vi.fn() };
    doubles.own.mockResolvedValue({ connectedByUserId: "user-a" });
    doubles.forUser.mockReturnValue(service);
    expect(await getOwnedToolostService("user-a")).toBe(service);
    expect(doubles.forUser).toHaveBeenCalledWith("user-a");
  });
  it("propagates storage errors instead of substituting credentials", async () => {
    doubles.own.mockRejectedValue(new Error("connection lookup failed"));
    await expect(getOwnedToolostService("user-a")).rejects.toThrow("connection lookup failed");
    expect(doubles.admin).not.toHaveBeenCalled();
  });
});
