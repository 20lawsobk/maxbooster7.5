import { afterEach, describe, expect, it, vi } from "vitest";
import { buildGenerationEnrichment, generationAwarenessPayload } from "../../external/maxcore/artifacts/api-server/src/services/autoPostGenerator.js";
import { contentAwarenessService } from "../../external/maxcore/artifacts/api-server/src/services/contentAwarenessService.js";

const receipt = () => ({ snapshot_id: "public-live", awareness: "UNTRUSTED live signals", expires_at: Date.now() / 1000 + 60 });
describe("live awareness in generation", () => {
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it("preserves canonical provenance and appends caller direction", () => {
    const live = receipt();
    expect(generationAwarenessPayload(live, "  caller direction  ", "exact instruction"))
      .toEqual({ ...live, awareness: live.awareness + "\n  caller direction  ", extra_context: "exact instruction" });
    expect(live.awareness).toBe("UNTRUSTED live signals");
  });
  it("retains structured caller context without replacing live signals", () => {
    const live = receipt();
    expect(generationAwarenessPayload(live, { avoid: ["hype"] }).awareness)
      .toBe(live.awareness + '\n{"avoid":["hype"]}');
  });
  it("does not duplicate an identical live block", () => {
    const live = receipt();
    expect(generationAwarenessPayload(live, live.awareness).awareness).toBe(live.awareness);
  });
  it("revalidates expiry before a delayed worker uses the receipt", () => {
    const live = receipt();
    vi.spyOn(Date, "now").mockReturnValue((live.expires_at + 1) * 1000);
    expect(() => generationAwarenessPayload(live)).toThrow("expired");
  });
  it("propagates unavailable live context without synthetic enrichment", async () => {
    vi.spyOn(contentAwarenessService, "getContextForMode").mockRejectedValue(new Error("unavailable"));
    await expect(buildGenerationEnrichment({ userId: "u", platforms: [] })).rejects.toThrow("unavailable");
  });
  it.each([0, Number.NaN, undefined])("rejects an invalid endpoint expiry (%s)", async expires_at => {
    vi.stubEnv("PDIM_LOCAL_CHANNEL_TOKEN", "test-private-channel");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...receipt(), expires_at }))));
    await expect(contentAwarenessService.getContextForMode("content")).rejects.toMatchObject({ status: 503 });
  });
});
