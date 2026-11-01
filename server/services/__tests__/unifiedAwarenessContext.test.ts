import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => vi.fn());
vi.mock("../maxcoreControlTransport.js", () => ({
  maxCoreControlTransport: { request },
  MaxCoreControlError: class extends Error {
    constructor(message: string, readonly status: number, readonly details?: unknown) {
      super(message);
    }
  },
}));
import { buildMaxCoreAwarenessPayload, getAwarenessContext, getUnifiedAwarenessStatus } from "../awarenessContext.js";

describe("MaxCore unified awareness facade", () => {
  beforeEach(() => { request.mockReset(); });
  it("preserves caller direction and full snapshot receipt without local planning", async () => {
    const receipt = { snapshot_id: "core-123", awareness: { contextString: "core", provenance: ["rss"] }, receipt: "opaque" };
    request.mockResolvedValue(receipt);
    const direction = "  user\n context  ";
    expect(await buildMaxCoreAwarenessPayload("social", "TikTok", direction))
      .toEqual({ ...receipt, extraContext: direction });
    expect(request).toHaveBeenCalledWith("/api/awareness/unified/context", {
      method: "POST", authScope: "generation", body: { platform: "TikTok", modality: "social" },
    });
  });
  it("fails closed on an unavailable required snapshot", async () => {
    request.mockRejectedValue(new Error("offline"));
    const failure = await getAwarenessContext("music").catch(error => error);
    expect(failure.status).toBe(503);
  });
  it("rejects absent snapshot receipts rather than returning empty context", async () => {
    request.mockResolvedValue({ awareness: {} });
    await expect(getAwarenessContext("music")).rejects.toMatchObject({ status: 503 });
  });
  it("maps the actual Python conditioning-string schema without inventing confidence", async () => {
    const receipt = { snapshot_id: "core-string", awareness: "UNTRUSTED observations", context: "UNTRUSTED observations", expires_at: 12345 };
    request.mockResolvedValue(receipt);
    expect(await getAwarenessContext("music")).toEqual({
      ...receipt, contextString: receipt.awareness,
    });
    expect(await buildMaxCoreAwarenessPayload("music")).toEqual({ ...receipt, extraContext: "" });
  });
  it("omits optional conditioning while MaxCore is warming", async () => {
    request.mockResolvedValue({ ready: false, snapshot_id: null, awareness: "", context: "" });
    expect(await buildMaxCoreAwarenessPayload("music")).toEqual({ extraContext: "" });
    expect(await getAwarenessContext("music")).toEqual({});
  });
  it("forwards authoritative status without inferring provider availability", async () => {
    const status = { ready: false, snapshot_id: "core-123" };
    request.mockResolvedValue(status);
    expect(await getUnifiedAwarenessStatus()).toBe(status);
  });
});