import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import express from "express";

// Isolated loopback fixture: no MaxCore process or application workflow starts.
describe("MaxCore Node route contracts", () => {
  let upstream: Server;
  let gateway: Server;
  let base: string;
  let nextReady = true;
  let audioMode: "missing" | "drop" | "hang" = "missing";
  let lastPlannerUser: string | undefined;
  const oldPort = process.env.MODEL_API_PORT;
  const oldToken = process.env.PDIM_LOCAL_CHANNEL_TOKEN;
  const oldKeepalive = process.env.MAXCORE_KEEPALIVE;

  beforeAll(async () => {
    upstream = createServer(async (req, res) => {
      const url = req.url ?? "";
      if (url === "/health") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ model_loaded: true, model_blocked: false,
          warm_start: { state: "disabled" }, serving_release: { candidate_quality: "not_selected" } }));
      } else if (url === "/api/warm/status") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ deep_warm: { state: "partial" } }));
      } else if (url === "/ready") {
        res.setHeader("Content-Type", "application/json");
        res.statusCode = nextReady ? 200 : 503;
        res.end(JSON.stringify({ ready: nextReady }));
      } else if (url === "/analyze") {
        res.setHeader("Content-Type", "application/json");
        res.end("{}");
      } else if (url === "/generate/text") {
        let body = "";
        for await (const chunk of req) body += chunk.toString();
        lastPlannerUser = JSON.parse(body).input.request.userId;
        res.statusCode = 503;
        res.end(JSON.stringify({ error: "model unavailable" }));
      } else if (url.startsWith("/api/audio-job/")) {
        if (audioMode === "drop") req.socket.destroy();
        else if (audioMode !== "hang") { res.statusCode = 404; res.end("{}"); }
      } else if (url.startsWith("/api/video-job/")) {
        res.statusCode = 404;
        res.end("{}");
      } else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
    await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
    process.env.MODEL_API_PORT = String((upstream.address() as { port: number }).port);
    process.env.PDIM_LOCAL_CHANNEL_TOKEN = "test-private-channel";
    process.env.MAXCORE_KEEPALIVE = "0";
    const [{ default: modelRouter }, { default: multimodalRouter }] = await Promise.all([
      import("../../external/maxcore/artifacts/api-server/src/routes/model-proxy.js"),
      import("../../external/maxcore/artifacts/api-server/src/routes/multimodal.js"),
    ]);
    const app = express();
    app.use(express.json());
    app.use("/api", multimodalRouter, modelRouter);
    gateway = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => gateway.listening ? resolve() : gateway.once("listening", resolve));
    base = `http://127.0.0.1:${(gateway.address() as { port: number }).port}`;
  });

  afterAll(async () => {
    await Promise.all([gateway, upstream].map((server) =>
      new Promise<void>((resolve) => server.close(() => resolve()))));
    if (oldPort === undefined) delete process.env.MODEL_API_PORT;
    else process.env.MODEL_API_PORT = oldPort;
    if (oldToken === undefined) delete process.env.PDIM_LOCAL_CHANNEL_TOKEN;
    else process.env.PDIM_LOCAL_CHANNEL_TOKEN = oldToken;
    if (oldKeepalive === undefined) delete process.env.MAXCORE_KEEPALIVE;
    else process.env.MAXCORE_KEEPALIVE = oldKeepalive;
  });

  const auth = { Authorization: "Bearer test-private-channel", "X-MaxCore-User-Id": "creator" };

  it("drains three probes with two pooled sockets and honors /ready even with warm disabled", async () => {
    const response = await fetch(`${base}/api/system/readiness`, { signal: AbortSignal.timeout(2500) });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.ready).toBe(true);
    expect(result.python.deep_warm_state).toBe("partial");
    expect(result.python.serving_release.candidate_quality).toBe("not_selected");
    nextReady = false;
    const unavailable = await fetch(`${base}/api/system/readiness`, { signal: AbortSignal.timeout(2500) });
    expect(unavailable.status).toBe(503);
    nextReady = true;
  });

  async function firstEvent(url: string) {
    const response = await fetch(url, { headers: auth, signal: AbortSignal.timeout(7000) });
    const reader = response.body!.getReader();
    const chunk = await reader.read();
    await reader.cancel();
    return { status: response.status, text: new TextDecoder().decode(chunk.value) };
  }

  it("authenticates SSE before headers, distinguishes 404 and transport failures", async () => {
    expect((await fetch(`${base}/api/jobs/j/progress`)).status).toBe(401);
    expect((await fetch(`${base}/api/jobs/j/cancel`, { method: "POST" })).status).toBe(401);
    audioMode = "missing";
    expect((await firstEvent(`${base}/api/jobs/j/progress`)).text).toContain("Job not found");
    expect((await fetch(`${base}/api/jobs/j/cancel`,
      { method: "POST", headers: auth })).status).toBe(404);
    audioMode = "drop";
    const failed = await firstEvent(`${base}/api/jobs/j/progress`);
    expect(failed.text).toContain("polling_error");
    expect(failed.text).not.toContain("Job not found");
  });

  it("bounds cancellation against an unresponsive upstream", async () => {
    audioMode = "hang";
    const started = Date.now();
    const event = await firstEvent(`${base}/api/jobs/j/progress`);
    expect(event.text).toContain("polling_error");
    expect(Date.now() - started).toBeLessThan(7000);
    const cancelStarted = Date.now();
    const response = await fetch(`${base}/api/jobs/j/cancel`,
      { method: "POST", headers: auth, signal: AbortSignal.timeout(7000) });
    expect(response.status).toBe(504);
    expect(Date.now() - cancelStarted).toBeLessThan(7000);
    audioMode = "missing";
  }, 13000);

  it("rejects mismatched owner and propagates the trusted owner to generation", async () => {
    const body = { id: "r", userId: "victim", input: { modality: "text", payload: "topic" },
      platforms: ["instagram"] };
    expect((await fetch(`${base}/api/multimodal/generate`,
      { method: "POST", headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify(body) })).status).toBe(403);
    expect(lastPlannerUser).toBeUndefined();
    const response = await fetch(`${base}/api/multimodal/generate`,
      { method: "POST", headers: { ...auth, "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, userId: "creator" }), signal: AbortSignal.timeout(7000) });
    expect(response.status).toBe(503);
    expect(lastPlannerUser).toBe("creator");
  });
});