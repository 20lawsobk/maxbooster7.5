import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
const awareness = vi.hoisted(() => vi.fn());
vi.mock("../../server/services/awarenessContext.js", () => ({ getAwarenessContext: awareness }));
vi.mock("../../server/db.js", () => ({ db: { select: () => ({ from: () => ({ where: async () => [
  { genre: "Ambient", bpm: 90, key: "C", tags: [], plays: 0, downloads: 0 },
] }) }) } }));
vi.mock("../../server/middleware/auth.js", () => ({ requireAuth: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
  req.user = { id: "fixture-owner" } as Express.User; next();
} }));
vi.mock("../../server/middleware/requirePremium.js", () => ({ requirePremium: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next() }));
import router from "../../server/routes/arIntelligence";

afterEach(() => awareness.mockReset());
async function get(path = "/catalog-gap") {
  const app = express(); app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}${path}`);
    return { status: response.status, body: await response.json() };
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}
it("uses canonical typed observations and retains snapshot provenance without made-up scores", async () => {
  awareness.mockResolvedValue({ snapshot_id: "canonical-snapshot", expires_at: 12345, trendingGenres: ["House", "Ambient", "House"] });
  const result = await get();
  expect(awareness).toHaveBeenCalledWith("music");
  expect(result.status).toBe(200);
  expect(result.body).toMatchObject({ snapshot_id: "canonical-snapshot", expires_at: 12345, gaps: [{ genre: "house", catalogCount: 0 }] });
  expect(result.body.gaps[0]).not.toHaveProperty("demand");
});
it("does not invent typed genres from an arbitrary live conditioning string", async () => {
  awareness.mockResolvedValue({ snapshot_id: "canonical-snapshot", contextString: "House trends observed in public posts" });
  expect((await get()).status).toBe(503);
});
it("retains unavailable awareness as 503", async () => {
  awareness.mockRejectedValue(Object.assign(new Error("offline"), { status: 503 }));
  expect((await get()).status).toBe(503);
});
it.each(["/trend-forecast", "/release-timing"])("does not fake an unsupported feature: %s", async path => {
  expect((await get(path)).status).toBe(501);
  expect(awareness).not.toHaveBeenCalled();
});
