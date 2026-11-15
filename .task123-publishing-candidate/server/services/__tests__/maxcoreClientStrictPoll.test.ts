import { describe, expect, it, vi } from "vitest";

vi.mock("../../config/index.js", () => ({
  config: {
    maxcoreUrl: "http://stub-maxcore",
    maxcoreGenerationKey: "stub-key",
  },
}));

import { MaxCoreControlError } from "../maxcoreControlTransport.js";
import { MaxCoreAIClient } from "../maxcoreClient.js";

describe("MaxCoreAIClient strict job polling", () => {
  it("returns null for transient HTTP failures in the default mode", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("upstream failed", { status: 502 }));

    try {
      await expect(
        MaxCoreAIClient.poll("/video-job/job-1", "owner-1"),
      ).resolves.toBeNull();
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("throws on HTTP failures in strict mode and keeps the trusted owner header", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("upstream failed", { status: 502 }));

    try {
      await expect(
        MaxCoreAIClient.poll("/video-job/job-1", "owner-1", 1_000, true),
      ).rejects.toMatchObject<Partial<MaxCoreControlError>>({ status: 502 });

      expect(fetchMock).toHaveBeenCalledWith(
        "http://stub-maxcore/api/video-job/job-1",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer stub-key",
            "X-MaxCore-User-Id": "owner-1",
          }),
        }),
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it("turns strict-mode network failures into a retryable upstream error", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("network unavailable"));

    try {
      await expect(
        MaxCoreAIClient.poll("/video-job/job-1", "owner-1", 1_000, true),
      ).rejects.toMatchObject<Partial<MaxCoreControlError>>({ status: 503 });
    } finally {
      fetchMock.mockRestore();
    }
  });
});