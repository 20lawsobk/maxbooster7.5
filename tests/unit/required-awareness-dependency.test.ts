/** Required internal public-snapshot failure classification, not a generic
 * upstream/public-auth status rewrite. Uses actual client/control transport and
 * generation helper with only its HTTP/config/logger boundaries owned fixtures.
 * npx vitest run --config vitest.config.ts tests/unit/required-awareness-dependency.test.ts
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../server/logger.js", () => ({
  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock("../../server/config/index.js", () => ({ config: { maxcoreGenerationKey: "owned-awareness-key" } }));
vi.mock("../../server/services/maxcoreConnector.js", () => ({
  getMaxcoreOrigin: () => "https://owned-awareness.example.test",
  getMaxcoreGenerationHeaders: () => ({ Authorization: "Bearer owned-awareness-key" }),
  getMaxcoreAdminHeaders: () => ({}),
}));

type ClientState = { _inFlight: number; _cbProbing: boolean; _cbOpenUntil: number };
const methods = ["generate", "infer"] as const;
const statuses = [400, 401, 403, 404, 405, 408, 422, 429, 500, 502, 503, 504];

describe("required generation awareness is a fixed internal dependency", () => {
  beforeEach(() => vi.resetModules());
  afterEach(() => vi.unstubAllGlobals());

  async function client(fetchMock: ReturnType<typeof vi.fn>) {
    vi.stubGlobal("fetch", fetchMock);
    const { MaxCoreAIClient } = await import("../../server/services/maxcoreClient.js");
    const { MaxCoreControlError } = await import("../../server/services/maxcoreControlTransport.js");
    const state = MaxCoreAIClient as unknown as ClientState;
    // An expired circuit reserves exactly one half-open probe in the real
    // client. The failed snapshot must release that reservation and its slot.
    state._cbOpenUntil = Date.now() - 1;
    return { MaxCoreAIClient, MaxCoreControlError, state };
  }

  for (const method of methods) {
    it.each(statuses)(`${method} maps required snapshot HTTP %s to503 and retains the received upstream cause`, async status => {
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: `owned snapshot HTTP ${status}` }),
        { status, headers: { "content-type": "application/json" } }));
      const { MaxCoreAIClient, MaxCoreControlError, state } = await client(fetchMock);
      const error = await MaxCoreAIClient[method]("/platform/social/generate", { topic: "owned brief" }, "owned-user").catch(value => value);
      expect(error).toBeInstanceOf(MaxCoreControlError);
      expect(error.status).toBe(503);
      expect(error.details).toBeInstanceOf(MaxCoreControlError);
      expect(error.details.status).toBe(status);
      expect(error.details.details).toEqual({ detail: `owned snapshot HTTP ${status}` });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock.mock.calls[0][0]).toBe("https://owned-awareness.example.test/api/awareness/unified/context");
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ modality: "social" });
      expect(state._inFlight).toBe(0);
      expect(state._cbProbing).toBe(false);
      expect(MaxCoreAIClient.getCircuitBreakerState().consecutiveFailures).toBe(0);
    });

    it.each(["network", "timeout", "html", "invalid-json"])(`${method} maps required snapshot %s failure to503 without issuing generation`, async failure => {
      const fetchMock = vi.fn();
      if (failure === "network" || failure === "timeout") {
        const error = new Error(`owned snapshot ${failure}`); error.name = failure === "timeout" ? "TimeoutError" : "Error";
        fetchMock.mockRejectedValue(error);
      } else {
        fetchMock.mockResolvedValue(new Response(failure === "html" ? "<h1>Not a receipt</h1>" : "{broken-json",
          { headers: { "content-type": failure === "html" ? "text/html" : "application/json" } }));
      }
      const { MaxCoreAIClient, MaxCoreControlError, state } = await client(fetchMock);
      const error = await MaxCoreAIClient[method]("/generate/content", {}).catch(value => value);
      expect(error).toBeInstanceOf(MaxCoreControlError); expect(error.status).toBe(503);
      expect(error.details).toBeInstanceOf(MaxCoreControlError);
      expect(error.details.status).toBe(failure === "network" || failure === "timeout" ? 503 : 502);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(state._inFlight).toBe(0); expect(state._cbProbing).toBe(false);
      expect(MaxCoreAIClient.getCircuitBreakerState().consecutiveFailures).toBe(0);
    });

    it.each(["warming", "expired", "missing-id", "blank-id", "empty-text", "empty-object"])(`${method} keeps required %s receipt rejection fail-closed`, async failure => {
      const receipt: Record<string, unknown> = { ready: true, snapshot_id: "owned-public-receipt", awareness: "Public observations", expires_at: Date.now() / 1000 + 60 };
      if (failure === "warming") Object.assign(receipt, { ready: false, snapshot_id: null, awareness: "" });
      if (failure === "expired") receipt.expires_at = 1;
      if (failure === "missing-id") delete receipt.snapshot_id;
      if (failure === "blank-id") receipt.snapshot_id = "  ";
      if (failure === "empty-text") receipt.awareness = "  ";
      if (failure === "empty-object") receipt.awareness = {};
      const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(receipt), { headers: { "content-type": "application/json" } }));
      const { MaxCoreAIClient, state } = await client(fetchMock);
      await expect(MaxCoreAIClient[method]("/generate/audio", {})).rejects.toMatchObject({ status: 503 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(state._inFlight).toBe(0); expect(state._cbProbing).toBe(false);
    });

    it.each(["/generate/content", "/generate/image", "/generate/audio"])(`${method} preserves valid required awareness and the caller body for %s`, async endpoint => {
      const receipt = { ready: true, snapshot_id: "owned-canonical-receipt", awareness: { contextString: "Actual public context" }, expires_at: Date.now() / 1000 + 60 };
      const output = { source: "owned transport output", generated: ["unchanged"] };
      const fetchMock = vi.fn().mockImplementation(async url => new Response(JSON.stringify(String(url).endsWith("/api/awareness/unified/context") ? receipt : output),
        { headers: { "content-type": "application/json" } }));
      const { MaxCoreAIClient, state } = await client(fetchMock);
      const body = { topic: "owned brief", awareness: { direction: "caller only" } }, original = structuredClone(body);
      expect(await MaxCoreAIClient[method](endpoint, body, "owned-user")).toEqual(output);
      expect(body).toEqual(original); expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).awareness).toEqual({ ...receipt, caller_context: original.awareness });
      expect(state._inFlight).toBe(0); expect(state._cbProbing).toBe(false);
    });
  }

  it("does not request or replace awareness for unrelated private analytics endpoints", async () => {
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
    const { prepareGenerationAwareness } = await import("../../server/services/generationAwareness.js");
    const body = { points: [{ date: "2026-10-20", value: 10 }] };
    expect(await prepareGenerationAwareness("/api/analytics/insights", body)).toBe(body);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([400, 401, 403, 404])("preserves generic operation HTTP%s; snapshot classification never rewrites public/domain policy", async status => {
    const { createMaxCoreControlTransport } = await import("../../server/services/maxcoreControlTransport.js");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "owned domain response" }),
      { status, headers: { "content-type": "application/json" } }));
    const transport = createMaxCoreControlTransport(fetchMock);
    const error = await transport.request("/api/owned-domain-operation", { method: "POST", authScope: "generation", body: { valid: "caller input" } }).catch(value => value);
    expect(error).toMatchObject({ status, details: { detail: "owned domain response" } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
