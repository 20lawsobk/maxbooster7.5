import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";

const generate = vi.hoisted(() => vi.fn());
vi.mock("../../server/services/unifiedAIController.js", () => ({
  unifiedAIController: { generateContent: generate },
}));
vi.mock("../../server/middleware/auth.js", () => ({
  requireAuth: (req: express.Request, _res: express.Response, next: () => void) => {
    req.user = { id: "session-owner" } as Express.User; next();
  },
}));
vi.mock("../../server/middleware/rateLimiter.js", () => ({
  aiRateLimiter: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../server/db.js", () => ({ db: {} }));
vi.mock("../../server/services/notificationService.js", () => ({ notificationService: {} }));
vi.mock("../../server/logger.js", () => ({ logger: { warn: vi.fn() } }));
import router from "../../server/routes/ai.js";
import { MaxCoreControlError } from "../../server/services/maxcoreControlTransport.js";
afterEach(() => vi.restoreAllMocks());

describe("main content route dependency failures", () => {
  it("keeps awareness/capability503 retryable without leaking upstream details", async () => {
    generate.mockRejectedValue(new MaxCoreControlError("private upstream detail", 503));
    const app = express(); app.use(express.json()); app.use("/api/ai", router);
    const server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    try {
      const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/ai/content/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: "new release", platform: "instagram" }),
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Content generation is temporarily unavailable" });
      expect(generate).toHaveBeenCalledWith(expect.objectContaining({ userId: "session-owner" }));
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
  });
});
