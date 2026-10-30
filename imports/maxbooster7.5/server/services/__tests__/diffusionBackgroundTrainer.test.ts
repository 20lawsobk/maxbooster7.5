import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../maxcoreConnector.js", () => ({
  getMaxcoreOrigin: () => "https://maxcore.example",
  getMaxcoreGenerationKey: () => "test-key",
}));

describe("diffusion background trainer MaxCore contract", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("starts only the MaxCore continuous trainer with its current contract", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ running: true, cycle: 4 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const service = await import("../diffusionBackgroundTrainer.js");
    await service.startBackgroundTraining();

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://maxcore.example/training/continuous/start",
    );
    expect(init).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer test-key",
        "Content-Type": "application/json",
      },
    });
    expect(JSON.parse(String(init.body))).toEqual({
      interval_minutes: 60,
      phases: [],
      epochs_per_phase: 1,
      pull_every_n_cycles: 2,
    });
    expect(service.getBackgroundStatus()).toMatchObject({
      running: true,
      session: 4,
      currentTier: "maxcore",
      pid: null,
      eta: "managed by MaxCore",
    });
  });

  it("fails explicitly instead of starting local training", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const { startBackgroundTraining } = await import(
      "../diffusionBackgroundTrainer.js"
    );

    await expect(startBackgroundTraining()).rejects.toMatchObject({
      code: "AI_UNAVAILABLE",
      statusCode: 503,
    });
  });

  it("rejects non-JSON success responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response("<html>not the API</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
    );
    const { startBackgroundTraining } = await import(
      "../diffusionBackgroundTrainer.js"
    );

    await expect(startBackgroundTraining()).rejects.toThrow(
      "non-JSON response",
    );
  });
});