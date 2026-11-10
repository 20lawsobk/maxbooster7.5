import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cognitiveContextMocks = vi.hoisted(() => ({
  prepare: vi.fn(async (body: Record<string, unknown>) => ({
    ...body,
    maxbooster_cognitive_context: { status: "available", evidence: [] },
  })),
}));

vi.mock("../../server/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../server/config/index.js", () => ({
  config: { maxcoreGenerationKey: "test-generation-key" },
}));
vi.mock("../../server/services/maxcoreConnector.js", () => ({
  getMaxcoreOrigin: () => "https://maxcore.example.test",
  getMaxcoreGenerationHeaders: () => ({ Authorization: "Bearer test-generation-key" }),
}));
vi.mock("../../server/services/awarenessContext.js", () => {
  throw new Error("The HTTP transport must not initialize application AI context");
});
vi.mock("../../server/services/cognitiveGenerationContext.js", () => ({
  prepareCognitiveGenerationRequest: cognitiveContextMocks.prepare,
}));

describe("MaxCore client is transport, not another AI processing layer", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it.each(["generate", "infer"] as const)(
    "%s fetches canonical context without local planning and returns the unmodified MaxCore output",
    async (method) => {
      const output = { text: "MaxCore output", score: 0.417, variants: ["A", "B"], snapshot_id: "core-receipt" };
      const receipt = { snapshot_id: "canonical-live", awareness: "Public live observations",
        expires_at: Date.now() / 1000 + 60 };
      const fetchMock = vi.fn().mockImplementation(async url =>
        new Response(JSON.stringify(String(url).endsWith("/api/awareness/unified/context") ? receipt : output), {
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
      const result = await MaxCoreAIClient[method]("/platform/social/generate", input, "authenticated-caller");
      expect(result).toEqual(output);
      expect(input).toEqual(original);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toBe("https://maxcore.example.test/api/awareness/unified/context");
      const [url, request] = fetchMock.mock.calls[1];
      expect(url).toBe("https://maxcore.example.test/api/platform/social/generate");
      expect(JSON.parse(request.body)).toEqual({
        ...original, owner_id: "authenticated-caller", userId: "authenticated-caller",
        awareness: { ...receipt, caller_context: original.awareness },
        maxbooster_cognitive_context: { status: "available", evidence: [] },
      });
      expect(cognitiveContextMocks.prepare).toHaveBeenCalledWith(
        expect.objectContaining({ topic: "Artist supplied brief" }),
        "authenticated-caller",
      );
      expect(request.headers.Authorization).toBe("Bearer test-generation-key");
      expect(request.headers["X-MaxCore-User-Id"]).toBe("authenticated-caller");
    },
  );

  it("does not infer generation readiness from model liveness or awareness alone", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ready: false,
        model_loaded: false,
        awareness: { ready: true },
        live_awareness: { available: true },
      }), { status: 503, headers: { "content-type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ready: true,
        model_loaded: true,
        awareness: { ready: true },
      }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { MaxCoreAIClient } = await import("../../server/services/maxcoreClient.js");

    expect(await MaxCoreAIClient.isAvailable()).toBe(false);
    expect(await MaxCoreAIClient.isAvailable()).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const { logger } = await import("../../server/logger.js");
    expect(logger.info).toHaveBeenCalledWith(
      "[MaxCoreAI] Live awareness is available; generation readiness is not confirmed",
    );

    expect((MaxCoreAIClient as any)._remoteAvailable).toBe(true);
    (MaxCoreAIClient as any)._lastReadinessCheck = Date.now() - 31_000;
    expect(await MaxCoreAIClient.isAvailable()).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      "https://maxcore.example.test/api/ready",
      "https://maxcore.example.test/api/ready",
    ]);
  });

  it("accepts explicit fresh live-awareness generation readiness without claiming trained weights", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ready: true,
      model_loaded: false,
      generation_ready: true,
      generation_mode: "live_awareness",
      awareness: { ready: true },
      live_awareness: {
        available: true,
        live_awareness_serving: true,
        trained_model_loaded: false,
      },
    }), { headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const { MaxCoreAIClient } = await import("../../server/services/maxcoreClient.js");

    expect(await MaxCoreAIClient.isAvailable()).toBe(true);
    expect((MaxCoreAIClient as any)._remoteAvailable).toBe(true);
    const { logger } = await import("../../server/logger.js");
    expect(logger.info).toHaveBeenCalledWith(
      "[MaxCoreAI] Live-awareness generation and fresh awareness readiness confirmed",
    );
  });

  it("does not treat a successful generation response as proof of model readiness", async () => {
    const receipt = {
      ready: true,
      snapshot_id: "live-awareness-receipt",
      awareness: "Current public industry context",
      expires_at: Date.now() / 1000 + 60,
    };
    const fetchMock = vi.fn().mockImplementation(async url => {
      const path = String(url);
      if (path.endsWith("/api/awareness/unified/context")) {
        return new Response(JSON.stringify(receipt), {
          headers: { "content-type": "application/json" },
        });
      }
      if (path.endsWith("/api/ready")) {
        return new Response(JSON.stringify({
          ready: false,
          model_loaded: false,
          awareness: { ready: true },
        }), { status: 503, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ output: "generation response" }), {
        headers: { "content-type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const { MaxCoreAIClient } = await import("../../server/services/maxcoreClient.js");

    await expect(MaxCoreAIClient.generate(
      "/generate/content",
      { topic: "Owned brief" },
      "owner-a",
    )).resolves.toEqual({ output: "generation response" });
    expect((MaxCoreAIClient as any)._remoteAvailable).toBe(true);
    expect((MaxCoreAIClient as any)._modelReady).toBeNull();
    expect(await MaxCoreAIClient.isAvailable()).toBe(false);
    expect((MaxCoreAIClient as any)._modelReady).toBe(false);
    expect(fetchMock.mock.calls.map(([url]) => String(url).split(".test")[1])).toEqual([
      "/api/awareness/unified/context",
      "/api/generate/content",
      "/api/ready",
    ]);
  });

  it.each([
    "/generate/content",
    "/generate/text",
    "/generate/image",
    "/generate/audio",
    "/generate-video",
  ])("adds owner-scoped persisted context to %s requests", async endpoint => {
    const receipt = {
      ready: true,
      snapshot_id: "live-awareness-receipt",
      awareness: "Current public industry context",
      expires_at: Date.now() / 1000 + 60,
    };
    const fetchMock = vi.fn().mockImplementation(async url =>
      new Response(JSON.stringify(String(url).endsWith("/api/awareness/unified/context")
        ? receipt
        : { job_id: "maxcore-job", status: "processing" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const { MaxCoreAIClient } = await import("../../server/services/maxcoreClient.js");

    await MaxCoreAIClient.generate(endpoint, { topic: "Owner's new single" }, "owner-a");

    expect(cognitiveContextMocks.prepare).toHaveBeenCalledTimes(1);
    expect(cognitiveContextMocks.prepare).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: "Owner's new single",
        awareness: expect.objectContaining({ snapshot_id: "live-awareness-receipt" }),
      }),
      "owner-a",
    );
  });

  async function openCircuit(MaxCoreAIClient: typeof import(
    "../../server/services/maxcoreClient.js"
  ).MaxCoreAIClient, fetchMock: ReturnType<typeof vi.fn>) {
    fetchMock.mockRejectedValue(new Error("ECONNREFUSED"));
    for (let i = 0; i < 3; i++) {
      await expect(MaxCoreAIClient.infer("/content/score", {})).rejects.toMatchObject({ status: 503 });
    }
    expect(MaxCoreAIClient.getCircuitBreakerState().open).toBe(true);
  }

  it.each(["generate", "infer"] as const)(
    "%s propagates required awareness 503 without tripping connectivity breaker",
    async (method) => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(
        JSON.stringify({ detail: "awareness_snapshot_unavailable" }),
        { status: 503, headers: { "content-type": "application/json" } },
      ));
      vi.stubGlobal("fetch", fetchMock);
      const { MaxCoreAIClient } = await import("../../server/services/maxcoreClient.js");
      await expect(MaxCoreAIClient[method]("/platform/social/generate", {}))
        .rejects.toMatchObject({ status: 503 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(MaxCoreAIClient.getCircuitBreakerState().consecutiveFailures).toBe(0);
    },
  );

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
    await expect(MaxCoreAIClient.infer("/content/score", {})).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();

    // Once health recovers, the next request must still own a probe slot.
    (MaxCoreAIClient as any)._remoteAvailable = true;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ text: "recovered" }), {
        headers: { "content-type": "application/json" },
      }),
    );
    await expect(
      MaxCoreAIClient.infer("/content/score", {}),
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
