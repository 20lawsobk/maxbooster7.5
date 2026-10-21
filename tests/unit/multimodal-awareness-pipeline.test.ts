import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";

const modelFetch = vi.hoisted(() => vi.fn());
vi.mock("../../external/maxcore/artifacts/api-server/node_modules/undici/index.js", () => ({ Agent: class {}, fetch: modelFetch }));
vi.mock("../../external/maxcore/artifacts/api-server/src/config/maxcore.js", () => ({
  MAXCORE_URL: "http://127.0.0.1:9878", MAXCORE_API_KEY: "pipeline-private-token",
}));
import router from "../../external/maxcore/artifacts/api-server/src/routes/multimodal.js";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); modelFetch.mockReset(); });

it("carries endpoint receipts through actual HTTP analysis, planning and worker dispatch", async () => {
  vi.stubEnv("PDIM_LOCAL_CHANNEL_TOKEN", "pipeline-private-token");
  const nativeFetch = globalThis.fetch;
  const receipt = { snapshot_id: "public-snapshot", awareness: "UNTRUSTED current public signals", expires_at: Date.now() / 1000 + 60 };
  const contextFetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(receipt)));
  vi.stubGlobal("fetch", contextFetch);
  modelFetch.mockImplementation(async (url: string, options: { body: string }) => {
    const body = JSON.parse(options.body);
    if (url.endsWith("/analyze")) return new Response(JSON.stringify({ normalized: "fixture" }));
    if (body.mode === "planner") return new Response(JSON.stringify({
      requestId: "request", steps: [{ id: "text", type: "generate", worker: "text", inputFrom: "normalizedInput" }],
    }));
    return new Response(JSON.stringify({ outputs: [{ text: "fixture worker output" }] }));
  });
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const response = await nativeFetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/multimodal/generate`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: "Bearer pipeline-private-token", "X-MaxCore-User-Id": "owner" },
      body: JSON.stringify({ id: "request", userId: "owner", input: { modality: "text", payload: "Announce a release" }, platforms: ["instagram"], awareness: "  exact caller context  ", extra_context: "Keep this direction" }),
    });
    const result = await response.json();
    expect(response.status, JSON.stringify(result)).toBe(200);
    expect(result.assets).toHaveLength(1);
    const calls = modelFetch.mock.calls.map(([url, options]) => ({ url, body: JSON.parse(options.body) }));
    expect(calls).toHaveLength(3);
    for (const { body } of calls) {
      expect(body).toMatchObject({ snapshot_id: receipt.snapshot_id, expires_at: receipt.expires_at,
        awareness: receipt.awareness + "\n  exact caller context  ", extra_context: "Keep this direction" });
    }
    expect(contextFetch).toHaveBeenCalledTimes(5);
    expect(calls.some(({ url }) => url.includes("feedback"))).toBe(false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
