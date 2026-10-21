import express from "express";
import type { AddressInfo } from "node:net";
import { expect, it, vi } from "vitest";
const generate = vi.hoisted(() => vi.fn());
vi.mock("../../server/services/careerCoachService", () => ({ careerCoachService: {
  getActiveRecommendations: async () => [], generateDailyRecommendations: generate,
} }));
vi.mock("../../server/db", () => ({ db: {} }));
vi.mock("../../server/middleware/auth", () => ({ requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (!req.get("X-Fixture-Owner")) { res.status(401).end(); return; }
  req.user = { id: "owner" } as Express.User; next();
} }));
import router from "../../server/routes/careerCoach";
import { MaxCoreControlError } from "../../server/services/maxcoreControlTransport.js";

it("reports unavailable model transport as a retryable503 without exposing upstream details", async () => {
  generate.mockRejectedValue(new MaxCoreControlError("private upstream configuration", 503));
  const app = express(); app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/recommendations`;
    expect((await fetch(url)).status).toBe(401);
    const response = await fetch(url, { headers: { "X-Fixture-Owner": "owner" } });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private upstream configuration");
    expect(generate).toHaveBeenCalledWith("owner");
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
