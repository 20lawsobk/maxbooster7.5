import express from "express";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Server } from "node:http";
import { securityMiddleware } from "../../server/middleware/security.js";

const isProduction =
  process.env.NODE_ENV === "production" || Boolean(process.env.REPLIT_DEPLOYMENT);

describe("development preview frame policy", () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(securityMiddleware);
    app.get("/", (_req, res) => res.type("html").send("<!doctype html><title>test</title>"));
    app.get("/api/health", (_req, res) => res.json({ status: "ok" }));

    server = await new Promise<Server>((resolve, reject) => {
      const listeningServer = app.listen(0, "127.0.0.1", () => resolve(listeningServer));
      listeningServer.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Test server did not bind to a TCP port");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (server?.listening) {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });

  it("permits Replit preview ancestors only on development HTML", async () => {
    const page = await fetch(baseUrl, {
      headers: { accept: "text/html" },
      signal: AbortSignal.timeout(5000),
    });
    expect(page.status).toBe(200);

    const pagePolicy = page.headers.get("content-security-policy") ?? "";
    if (isProduction) {
      expect(pagePolicy).toContain("frame-ancestors 'none'");
      expect(page.headers.get("x-frame-options")).toBe("SAMEORIGIN");
    } else {
      expect(pagePolicy).toContain(
        "frame-ancestors 'self' https://replit.com https://*.replit.com https://*.replit.dev",
      );
      expect(page.headers.get("x-frame-options")).toBeNull();
    }

    const api = await fetch(`${baseUrl}/api/health`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    expect(api.status).toBe(200);
    expect(api.headers.get("content-security-policy")).toContain(
      "frame-ancestors 'none'",
    );
    expect(api.headers.get("x-frame-options")).toBe("SAMEORIGIN");
  });
});
