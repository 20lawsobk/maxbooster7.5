import express from "express";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";

const maxcoreConfig = vi.hoisted(() => ({ origin: "" }));
vi.mock("../../external/maxcore/artifacts/api-server/src/config/maxcore.js", () => ({
  MAXCORE_URL: maxcoreConfig.origin,
  MAXCORE_API_KEY: "pipeline-private-token",
}));

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); maxcoreConfig.origin = ""; });

it("carries endpoint receipts through actual HTTP analysis, planning and worker dispatch", async () => {
  vi.stubEnv("PDIM_LOCAL_CHANNEL_TOKEN", "pipeline-private-token");
  const nativeFetch = globalThis.fetch;
  const receipt = { snapshot_id: "public-snapshot", awareness: "UNTRUSTED current public signals", expires_at: Date.now() / 1000 + 60 };
  const contextFetch = vi.fn().mockImplementation(async () => new Response(JSON.stringify(receipt)));
  vi.stubGlobal("fetch", contextFetch);
  const upstreamCalls: Array<{ path: string; authorization: string | undefined; body: Record<string, unknown> }> = [];
  const modelServer = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const rawBody = Buffer.concat(chunks).toString("utf8");
    const body = rawBody ? JSON.parse(rawBody) as Record<string, unknown> : {};
    upstreamCalls.push({
      path: request.url || "",
      authorization: request.headers.authorization,
      body,
    });
    if (request.headers.authorization !== "Bearer pipeline-private-token") {
      response.writeHead(401, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ detail: "Invalid or inactive API key" }));
      return;
    }
    const result = (request.url || "").endsWith("/analyze")
      ? { normalized: "fixture" }
      : body.mode === "planner"
        ? { requestId: "request", steps: [{ id: "text", type: "generate", worker: "text", inputFrom: "normalizedInput" }] }
        : { outputs: [{ text: "fixture worker output" }] };
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify(result));
  });
  modelServer.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => modelServer.once("listening", resolve));
  maxcoreConfig.origin = `http://127.0.0.1:${(modelServer.address() as AddressInfo).port}`;
  vi.resetModules();
  const { default: router } = await import("../../external/maxcore/artifacts/api-server/src/routes/multimodal.js");
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
    expect(upstreamCalls).toHaveLength(3);
    for (const call of upstreamCalls) {
      expect(call.authorization).toBe("Bearer pipeline-private-token");
      expect(call.body).toMatchObject({ snapshot_id: receipt.snapshot_id, expires_at: receipt.expires_at,
        awareness: receipt.awareness + "\n  exact caller context  ", extra_context: "Keep this direction" });
    }
    expect(contextFetch).toHaveBeenCalledTimes(5);
    expect(upstreamCalls.some(({ path }) => path.includes("feedback"))).toBe(false);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    modelServer.closeAllConnections();
    await new Promise<void>(resolve => modelServer.close(() => resolve()));
  }
});
