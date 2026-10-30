import { describe, expect, it, vi } from "vitest";
import {
  MaxCoreControlError,
  createMaxCoreControlTransport,
} from "../maxcoreControlTransport.js";

describe("MaxCore control transport", () => {
  it("serializes an authenticated MaxCore training request", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ success: true, job_id: "mc-1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const transport = createMaxCoreControlTransport(
      fetchMock as unknown as typeof fetch,
    );

    await expect(
      transport.request("/training/start-from-storage", {
        method: "POST",
        body: { epochs: 2, batch_size: 64, save_checkpoint: true },
      }),
    ).resolves.toEqual({ success: true, job_id: "mc-1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/training\/start-from-storage$/);
    expect(init.method).toBe("POST");
    expect(init.headers["X-Admin-Key"]).toBeTruthy();
    expect(JSON.parse(String(init.body))).toEqual({
      epochs: 2,
      batch_size: 64,
      save_checkpoint: true,
    });
  });

  it("surfaces upstream failures instead of returning a local fallback", async () => {
    const transport = createMaxCoreControlTransport(
      vi.fn(async () =>
        new Response(JSON.stringify({ detail: "model is unavailable" }), {
          status: 503,
          headers: { "content-type": "application/json" },
        }),
      ) as unknown as typeof fetch,
    );

    await expect(transport.request("/training/status")).rejects.toMatchObject<
      Partial<MaxCoreControlError>
    >({
      name: "MaxCoreControlError",
      status: 503,
      message:
        "MaxCore rejected /training/status: model is unavailable",
    });
  });

  it("rejects non-JSON success responses as a contract violation", async () => {
    const transport = createMaxCoreControlTransport(
      vi.fn(async () => new Response("ok", { status: 200 })) as unknown as typeof fetch,
    );

    await expect(transport.request("/training/status")).rejects.toMatchObject({
      status: 502,
    });
  });
});