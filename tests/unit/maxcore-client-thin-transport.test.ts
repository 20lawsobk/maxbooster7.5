import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../server/config/index.js", () => ({
  config: { maxcoreGenerationKey: "test-generation-key" },
}));
vi.mock("../../server/services/maxcoreConnector.js", () => ({
  getMaxcoreOrigin: () => "https://maxcore.example.test",
}));
vi.mock("../../server/services/awarenessContext.js", () => {
  throw new Error("The HTTP transport must not initialize application AI context");
});

describe("MaxCore client is transport, not another AI processing layer", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(["generate", "infer"] as const)(
    "%s forwards explicit context and returns the unmodified MaxCore output",
    async (method) => {
      const output = { text: "MaxCore output", score: 0.417, variants: ["A", "B"] };
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(output), {
          headers: { "content-type": "application/json" },
        }),
      );
      vi.stubGlobal("fetch", fetchMock);
      const { MaxCoreAIClient } = await import("../../server/services/maxcoreClient.js");
      const input = {
        user_id: "authenticated-caller",
        topic: "Artist supplied brief",
        awareness: { provided: "explicit caller data" },
        extra_context: "Keep this exact context",
      };
      const original = structuredClone(input);
      const result = await MaxCoreAIClient[method]("/platform/social/generate", input);
      expect(result).toEqual(output);
      expect(input).toEqual(original);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, request] = fetchMock.mock.calls[0];
      expect(url).toBe("https://maxcore.example.test/api/platform/social/generate");
      expect(JSON.parse(request.body)).toEqual(original);
      expect(request.headers.Authorization).toBe("Bearer test-generation-key");
      expect(request.headers["X-MaxCore-User-Id"]).toBe("authenticated-caller");
    },
  );

  async function openCircuit(MaxCoreAIClient: typeof import(
    "../../server/services/maxcoreClient.js"
  ).MaxCoreAIClient, fetchMock: ReturnType<typeof vi.fn>) {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    await MaxCoreAIClient.infer("/platform/social/generate", {});
    await MaxCoreAIClient.infer("/platform/social/generate", {});
    await MaxCoreAIClient.infer("/platform/social/generate", {});
    expect(MaxCoreAIClient.getCircuitBreakerState().open).toBe(true);
  }

  it("closes a half-open circuit after authenticated model info proves the local model is ready", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { MaxCoreAIClient, startMaxCoreLLMWarmth } = await import(
      "../../server/services/maxcoreClient.js"
    );
    await openCircuit(MaxCoreAIClient, fetchMock);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(MaxCoreAIClient.getCircuitBreakerState().halfOpen).toBe(true);

    fetchMock.mockReset().mockResolvedValue(
      new Response(
        JSON.stringify({
          model_ready: true,
          model_config: { architecture: "maxcore" },
          platform_endpoints: ["POST /platform/social/generate"],
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );
    startMaxCoreLLMWarmth();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(MaxCoreAIClient.getCircuitBreakerState()).toMatchObject({
      open: false,
      halfOpen: false,
      consecutiveFailures: 0,
      openUntil: null,
    });
  });

  it("releases the half-open probe reservation when cached health fast-fails before fetch", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { MaxCoreAIClient } = await import(
      "../../server/services/maxcoreClient.js"
    );
    await openCircuit(MaxCoreAIClient, fetchMock);
    await vi.advanceTimersByTimeAsync(60_000);

    // Reproduce the production ordering: cbBlocked reserves the half-open
    // probe, then cached health rejects the call before it reaches fetch.
    (MaxCoreAIClient as any)._remoteAvailable = false;
    fetchMock.mockReset();
    await MaxCoreAIClient.infer("/platform/social/generate", {});
    expect(fetchMock).not.toHaveBeenCalled();

    // Once health recovers, the next request must still own a probe slot.
    (MaxCoreAIClient as any)._remoteAvailable = true;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "recovered" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      MaxCoreAIClient.infer("/platform/social/generate", {}),
    ).resolves.toEqual({ text: "recovered" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      name: "boot JSON",
      response: () =>
        new Response(JSON.stringify({ status: "starting" }), {
          headers: { "content-type": "application/json" },
        }),
    },
    {
      name: "model-not-ready JSON",
      response: () =>
        new Response(
          JSON.stringify({
            model_ready: false,
            model_config: {},
            platform_endpoints: [],
          }),
          { headers: { "content-type": "application/json" } },
        ),
    },
    {
      name: "generic HTML",
      response: () =>
        new Response("<html>MaxCore</html>", {
          headers: { "content-type": "text/html" },
        }),
    },
  ])("does not close a half-open circuit on $name", async ({ response }) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { MaxCoreAIClient, startMaxCoreLLMWarmth } = await import(
      "../../server/services/maxcoreClient.js"
    );
    await openCircuit(MaxCoreAIClient, fetchMock);
    await vi.advanceTimersByTimeAsync(60_000);

    fetchMock.mockReset().mockResolvedValue(response());
    startMaxCoreLLMWarmth();
    await vi.advanceTimersByTimeAsync(5_000);

    expect(MaxCoreAIClient.getCircuitBreakerState().halfOpen).toBe(true);
  });
});