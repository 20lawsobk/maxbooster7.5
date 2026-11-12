import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generate: vi.fn(),
  poll: vi.fn(),
}));

vi.mock("../maxcoreClient.js", () => ({
  MaxCoreAIClient: {
    generate: mocks.generate,
    poll: mocks.poll,
  },
}));

import { maxCoreStudioJson } from "../studioMaxCoreTransport.js";

describe("studio MaxCore generation transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes studio generation through MaxCore's shared owner-aware generator", async () => {
    mocks.generate.mockResolvedValue({ job_id: "audio-job-1" });
    const body = { prompt: "melody", intent: "songwriting" };
    await expect(maxCoreStudioJson("/api/generate/audio", "POST", "owner-1", body))
      .resolves.toEqual({ job_id: "audio-job-1" });
    expect(mocks.generate).toHaveBeenCalledWith(
      "/api/generate/audio",
      body,
      "owner-1",
      60_000,
    );
  });

  it("uses the owner-aware shared poller for asynchronous job state", async () => {
    mocks.poll.mockResolvedValue({ status: "completed" });
    await expect(maxCoreStudioJson("/api/audio-job/audio-job-1", "GET", "owner-1"))
      .resolves.toEqual({ status: "completed" });
    expect(mocks.poll).toHaveBeenCalledWith(
      "/api/audio-job/audio-job-1",
      "owner-1",
      30_000,
      true,
    );
  });

  it("rejects missing owners and empty MaxCore responses", async () => {
    await expect(maxCoreStudioJson("/api/generate/audio", "POST", ""))
      .rejects.toThrow(/authenticated owner/i);
    mocks.generate.mockResolvedValue(null);
    await expect(maxCoreStudioJson("/api/generate/audio", "POST", "owner-1"))
      .rejects.toThrow(/no response/i);
  });
});
