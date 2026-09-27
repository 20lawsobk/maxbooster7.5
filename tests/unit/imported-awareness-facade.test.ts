import { afterEach, describe, expect, it, vi } from "vitest";
import { contentAwarenessService } from "../../external/maxcore/artifacts/api-server/src/services/contentAwarenessService.js";
import { buildGenerationEnrichment } from "../../external/maxcore/artifacts/api-server/src/services/autoPostGenerator.js";
import { getTrendingContext } from "../../external/maxcore/artifacts/api-server/src/services/trendingContextService.js";

describe("imported application awareness integration", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
  it("passes Python's full receipt and string awareness through both facades", async () => {
    vi.stubEnv("PDIM_LOCAL_CHANNEL_TOKEN", "test-private-channel");
    const receipt = { snapshot_id: "sha-snapshot", awareness: "UNTRUSTED observations", expires_at: 99999 };
    const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify(receipt)));
    vi.stubGlobal("fetch", fetcher);
    const result = await getTrendingContext("instagram");
    expect(result).toEqual({ ...receipt, contextString: receipt.awareness });
    expect(result).not.toHaveProperty("confidence");
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ modality: "social", platform: "instagram" });
  });
  it("never turns a Core 503 into empty enrichment or synthetic trends", async () => {
    vi.stubEnv("PDIM_LOCAL_CHANNEL_TOKEN", "test-private-channel");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    const failure = await contentAwarenessService.getContextForMode("music").catch(error => error);
    expect(failure.status).toBe(503);
    await expect(getTrendingContext()).rejects.toThrow("snapshot unavailable");
  });
  it("preserves supplied context without fetching profiles, curriculum or local trends", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const context = "  user supplied\nexact context ";
    expect(await buildGenerationEnrichment({ userId: "u", platforms: ["instagram"], context }))
      .toEqual({ awarenessBlock: context, hasData: true });
    expect(fetcher).not.toHaveBeenCalled();
  });
});