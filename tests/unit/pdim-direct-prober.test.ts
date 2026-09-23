import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;
const forceClose = vi.fn();

describe("PDIM direct recovery prober", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    forceClose.mockReset();
    process.env = { ...originalEnv, LOCAL_PDIM_PORT: "15557" };
    delete process.env.PDIM_EXEC_URL;
    delete process.env.PDIM_HTTP_EXEC_URL;
    delete process.env.PDIM_EXEC_TOKEN;
    delete process.env.PDIM_BEARER_TOKEN;
    vi.doMock("../../server/lib/pdimCircuitBreaker.js", () => ({
      cbAllowRequest: () => true,
      cbRecordFailure: vi.fn(),
      cbRecordSuccess: vi.fn(),
      cbHalfOpenFailed: vi.fn(),
      cbForceClose: forceClose,
      cbGetState: () => "OPEN",
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    process.env = originalEnv;
  });

  it("probes the exact owned local origin without bearer auth and requires PONG", async () => {
    process.env.PDIM_EXEC_URL =
      "http://127.0.0.1:15557/api/redis/instances/local/exec";
    // The explicit current exec authority wins over a stale legacy remote URL.
    process.env.PDIM_HTTP_EXEC_URL = "https://stale-pdim.example/api/redis/exec";
    delete process.env.PDIM_BEARER_TOKEN;
    delete process.env.PDIM_EXEC_TOKEN;
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify("PONG"), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { startPdimDirectProber } = await import(
      "../../server/lib/pdimClient.js"
    );
    startPdimDirectProber();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(process.env.PDIM_EXEC_URL);
    expect(fetchMock.mock.calls[0][1].headers).not.toHaveProperty("Authorization");
    expect(forceClose).toHaveBeenCalledTimes(1);
  });

  it("does not close the circuit for an unrelated HTTP 200 response", async () => {
    process.env.PDIM_HTTP_EXEC_URL =
      "http://127.0.0.1:15557/api/redis/instances/local/exec";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { startPdimDirectProber } = await import(
      "../../server/lib/pdimClient.js"
    );
    startPdimDirectProber();
    await vi.advanceTimersByTimeAsync(15_000);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(forceClose).not.toHaveBeenCalled();
  });

  it("does not probe a remote authority without its bearer token", async () => {
    process.env.PDIM_HTTP_EXEC_URL = "https://pdim.example/api/redis/exec";
    delete process.env.PDIM_BEARER_TOKEN;
    delete process.env.PDIM_EXEC_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { startPdimDirectProber } = await import(
      "../../server/lib/pdimClient.js"
    );
    startPdimDirectProber();
    await vi.advanceTimersByTimeAsync(30_000);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});