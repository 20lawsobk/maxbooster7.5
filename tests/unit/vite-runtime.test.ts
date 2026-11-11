import { createServer as createHttpServer } from "node:http";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const middleware = vi.fn((req: any, res: any, next: any) => {
    if (req.url === "/src/main.tsx") {
      res.statusCode = 200;
      res.setHeader("content-type", "text/javascript");
      res.end("export default true;");
      return;
    }
    next();
  });

  const transformIndexHtml = vi.fn(async (_url: string, html: string) => html);
  const createServer = vi.fn(async () => ({
    middlewares: middleware,
    transformIndexHtml,
    ssrFixStacktrace: vi.fn(),
  }));

  return { createServer, middleware, transformIndexHtml };
});

vi.mock("vite", () => ({
  createServer: mocks.createServer,
  createLogger: () => ({ error: vi.fn() }),
}));

vi.mock("../../vite.config", () => ({ default: {} }));

describe("Vite development middleware", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.createServer.mockClear();
    mocks.middleware.mockClear();
    mocks.transformIndexHtml.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("serves dev modules before sessions while keeping API and SPA fallback order", async () => {
    const { createViteRuntime } = await import("../../server/vite");
    const runtime = await createViteRuntime(createHttpServer());
    const app = express();
    const sessionMiddleware = vi.fn((_req, _res, next) => next());

    app.use(runtime.middleware);
    app.use(sessionMiddleware);
    app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
    runtime.registerSpaFallback(app);

    const server = createHttpServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });

    try {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("Test server did not open a TCP port.");
      }
      const origin = `http://127.0.0.1:${address.port}`;

      const moduleResponse = await fetch(`${origin}/src/main.tsx`);
      expect(moduleResponse.status).toBe(200);
      expect(await moduleResponse.text()).toContain("export default true");
      expect(sessionMiddleware).not.toHaveBeenCalled();

      const healthResponse = await fetch(`${origin}/api/health`);
      expect(await healthResponse.json()).toEqual({ status: "ok" });
      expect(sessionMiddleware).toHaveBeenCalledTimes(1);

      const spaResponse = await fetch(`${origin}/dashboard`);
      expect(spaResponse.status).toBe(200);
      expect(await spaResponse.text()).toContain(
        "Max Booster - AI Music Career Management Platform",
      );
      expect(sessionMiddleware).toHaveBeenCalledTimes(2);
    } finally {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
