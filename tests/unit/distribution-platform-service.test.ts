import { describe, expect, it, vi } from "vitest";

vi.mock("../../server/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { submitToProvider } from "../../server/services/distributionPlatformService.js";

describe("legacy generic distribution adapter", () => {
  it("fails closed instead of creating a fake queued/processing dispatch", async () => {
    await expect(
      submitToProvider("release-1", "spotify", "user-1"),
    ).rejects.toThrow(
      "Distribution dispatch unavailable. No dispatch was created and no provider request was sent; use the verified Too Lost submission route.",
    );
  });
});
