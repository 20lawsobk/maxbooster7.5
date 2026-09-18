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
  afterEach(() => vi.unstubAllGlobals());

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
});