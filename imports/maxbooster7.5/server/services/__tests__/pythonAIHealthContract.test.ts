import { beforeEach, describe, expect, it, vi } from "vitest";
import { maxcoreOwnerContext } from "../../lib/maxcoreOwnerContext.js";

const mocks = vi.hoisted(() => ({ probe: vi.fn(), generate: vi.fn(), oldAvailability: vi.fn(), transfer: vi.fn() }));
vi.mock("../maxcoreClient.js", () => ({ MaxCoreAIClient: {
  generate: mocks.generate, isAvailable: mocks.oldAvailability,
} }));
vi.mock("../maxcoreAssetTransport.js", () => ({ ensureMaxCoreAudioAsset: mocks.transfer }));
vi.mock("../maxcoreConnector.js", () => ({ getMaxcoreOrigin: () => "http://127.0.0.1:8090" }));
vi.mock("../maxcoreControlTransport.js", () => ({
  maxCoreControlTransport: { request: mocks.probe },
  MaxCoreControlError: class extends Error {
    constructor(message: string, readonly status: number, readonly details?: unknown) { super(message); }
  },
}));
import { MaxCoreControlError } from "../maxcoreControlTransport.js";
import { pythonAIService } from "../pythonAIService.js";

const observed = (reachable = true, model = false, ready = false) => ({
  ready, python: { reachable, model_loaded: model, generation_ready: ready },
});
beforeEach(() => { for (const mock of Object.values(mocks)) mock.mockReset(); });

describe("Python compatibility service uses observed runtime health", () => {
  it("retains live audio analysis when the actual readiness503 reports no generation model", async () => {
    mocks.probe.mockRejectedValue(new MaxCoreControlError("generation unavailable", 503, observed()));
    expect(await pythonAIService.checkHealth()).toEqual({ success: true, data: {
      status: "degraded", reachable: true, model_loaded: false, generation_ready: false,
    } });
    expect(await pythonAIService.isAvailable()).toBe(true);
    expect(mocks.oldAvailability).not.toHaveBeenCalled();
    expect(mocks.probe).toHaveBeenCalledWith("/api/system/readiness", {
      authScope: "generation", timeoutMs: 7000,
    });
  });

  it("reports model-loaded only from the real complete receipt", async () => {
    mocks.probe.mockResolvedValue(observed(true, true, true));
    const result = await pythonAIService.checkHealth();
    expect(result).toEqual({ success: true, data: {
      status: "ready", reachable: true, model_loaded: true, generation_ready: true,
    } });
    expect(result.data).not.toHaveProperty("vocab_size");
    expect(result.data).not.toHaveProperty("device");
    expect(result.data).not.toHaveProperty("version");
  });

  it("does not advertise audio runtime availability when Python is unreachable", async () => {
    mocks.probe.mockRejectedValue(new MaxCoreControlError("offline", 503, observed(false)));
    expect(await pythonAIService.isAvailable()).toBe(false);
    expect(await pythonAIService.getAudioFeatureInfo()).toEqual({
      success: false, error: "MaxCore Python process is unreachable",
    });
  });

  it.each([{}, { ready: false }, { ready: false, python: { reachable: true } }])(
    "rejects incomplete startup/health metadata: %j", async receipt => {
      mocks.probe.mockResolvedValue(receipt);
      expect(await pythonAIService.isAvailable()).toBe(false);
    },
  );

  it("redacts transport details instead of manufacturing health metadata", async () => {
    mocks.probe.mockRejectedValue(new Error("private-key-in-upstream-error"));
    expect(await pythonAIService.checkHealth()).toEqual({
      success: false, error: "MaxCore health probe unavailable",
    });
  });

  it("labels audio feature availability as process liveness, independently of generation quality", async () => {
    mocks.probe.mockRejectedValue(new MaxCoreControlError("generation unavailable", 503, observed()));
    expect(await pythonAIService.getAudioFeatureInfo()).toMatchObject({ success: true, data: {
      available: true, availability_scope: "python_process_reachable", generation_ready: false,
      source: "maxcore_audio_conductor", features: expect.arrayContaining(["bpm", "key"]),
    } });
  });

  it("preserves the authenticated request owner through owned transfer and background-compatible generation", async () => {
    mocks.transfer.mockResolvedValue("/uploads/audio-inputs/owned/asset.wav");
    mocks.generate.mockResolvedValue({ source: "maxcore_audio_conductor", bpm: 120 });
    const result = await new Promise(resolve => {
      maxcoreOwnerContext({ user: { id: "session-owner" } } as never, {} as never, () => {
        void pythonAIService.analyzeAudio("/api/storage/file/owned-track", false, "forged-owner").then(resolve);
      });
    });
    expect(result).toMatchObject({ success: true });
    expect(mocks.transfer).toHaveBeenCalledWith("/api/storage/file/owned-track", "session-owner");
    expect(mocks.generate).toHaveBeenCalledWith("/api/audio/analyze", {
      user_id: "session-owner", audio_url: "/uploads/audio-inputs/owned/asset.wav", context: { detailed: false },
    }, "session-owner");
  });

  it("keeps an unverified legacy generation contract explicitly disabled", async () => {
    expect(await pythonAIService.generateImage({ topic: "a subject", platform: "instagram" }))
      .toMatchObject({ success: false });
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
