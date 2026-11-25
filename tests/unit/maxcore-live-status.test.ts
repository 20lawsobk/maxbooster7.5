import { afterAll, beforeAll, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import express from "express";

let upstream: Server;
let gateway: Server;
let url: string;
const previousPort = process.env.MODEL_API_PORT;

beforeAll(async () => {
  upstream = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/health" &&
        req.headers.authorization === "Bearer fixture-generation") {
      res.end(JSON.stringify({ status: "healthy", model_loaded: true }));
    } else if (req.url === "/api/awareness/unified/status" &&
        req.headers.authorization === "Bearer fixture-generation") {
      res.end(JSON.stringify({ ready: true, snapshot_id: "fixture-snapshot" }));
    } else if (req.url === "/api/awareness/unified/profile-discover" &&
        req.headers.authorization === "Bearer fixture-generation") {
      res.end(JSON.stringify({ mode: "native_local_profile_observatory", observations: [] }));
    } else if (req.url !== "/api/training/live/status") {
      res.statusCode = 404;
      res.end("{}");
    } else if (req.headers["x-admin-key"] !== "fixture-admin") {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: "admin required" }));
    } else {
      res.end(JSON.stringify({ mode: "live-awareness", learning: { training: "waiting_for_observations" } }));
    }
  });
  await new Promise<void>((resolve) => upstream.listen(0, "127.0.0.1", resolve));
  process.env.MODEL_API_PORT = String((upstream.address() as { port: number }).port);
  const { setPythonRestarting } = await import("../../external/maxcore/artifacts/api-server/src/server-state.js");
  setPythonRestarting(true);
  const { default: router } = await import("../../external/maxcore/artifacts/api-server/src/routes/model-proxy.js");
  const app = express();
  app.use("/api", router);
  gateway = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => gateway.listening ? resolve() : gateway.once("listening", resolve));
  url = `http://127.0.0.1:${(gateway.address() as { port: number }).port}/api/training/live/status`;
});

afterAll(async () => {
  if (previousPort === undefined) delete process.env.MODEL_API_PORT;
  else process.env.MODEL_API_PORT = previousPort;
  await Promise.all([gateway, upstream].map((server) => new Promise<void>((resolve) => {
    server.closeAllConnections();
    server.close(() => resolve());
  })));
});

it("exposes admin status while Python is waiting for its first reviewed model", async () => {
  const response = await fetch(url, { headers: { "X-Admin-Key": "fixture-admin" }, signal: AbortSignal.timeout(3000) });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ mode: "live-awareness", learning: { training: "waiting_for_observations" } });
});

it("preserves Python admin validation and never substitutes a server credential", async () => {
  const anonymous = await fetch(url, { signal: AbortSignal.timeout(3000) });
  expect(anonymous.status).toBe(401);
  const generation = await fetch(url, { headers: { "X-Api-Key": "fixture-generation" }, signal: AbortSignal.timeout(3000) });
  expect(generation.status).toBe(403);
});

it("exposes detailed health at /api/health and retains the generation authorization boundary", async () => {
  const publicUrl = `http://127.0.0.1:${(gateway.address() as { port: number }).port}`;
  expect((await fetch(`${publicUrl}/api/health`)).status).toBe(401);
  const response = await fetch(`${publicUrl}/api/health`, {
    headers: { Authorization: "Bearer fixture-generation" },
    signal: AbortSignal.timeout(3000),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "healthy", model_loaded: true });
});

it("exposes awareness status at /api/awareness/unified/status with generation authorization", async () => {
  const publicUrl = `http://127.0.0.1:${(gateway.address() as { port: number }).port}`;
  expect((await fetch(`${publicUrl}/api/awareness/unified/status`)).status).toBe(401);
  const response = await fetch(`${publicUrl}/api/awareness/unified/status`, {
    headers: { Authorization: "Bearer fixture-generation" },
    signal: AbortSignal.timeout(3000),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ready: true, snapshot_id: "fixture-snapshot" });
});

it("exposes local profile discovery through the model proxy with generation authorization", async () => {
  const publicUrl = `http://127.0.0.1:${(gateway.address() as { port: number }).port}`;
  expect((await fetch(`${publicUrl}/api/awareness/unified/profile-discover`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
  })).status).toBe(401);
  const response = await fetch(`${publicUrl}/api/awareness/unified/profile-discover`, {
    method: "POST",
    headers: { Authorization: "Bearer fixture-generation", "Content-Type": "application/json" },
    body: JSON.stringify({ platforms: ["youtube"] }),
    signal: AbortSignal.timeout(3000),
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    mode: "native_local_profile_observatory", observations: [],
  });
});
