import express from "express";
import type { AddressInfo } from "node:net";
import { afterEach, expect, it, vi } from "vitest";
const remove = vi.hoisted(() => ({ web: vi.fn(), mobile: vi.fn(), allWeb: vi.fn(), allMobile: vi.fn() }));
vi.mock("../../server/services/webPushService.js", () => ({ webPushService: { removeSubscription: remove.web, removeUserSubscriptions: remove.allWeb } }));
vi.mock("../../server/services/mobilePushService.js", () => ({ mobilePushService: { deactivateToken: remove.mobile, removeUserTokens: remove.allMobile } }));
vi.mock("../../server/services/smsNotificationService.js", () => ({ smsStatusCallback: vi.fn(), smsIncomingCallback: vi.fn() }));
vi.mock("../../server/db", () => ({ db: {}, dbRead: {} }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/middleware/auth", () => ({ requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const owner = req.get("X-Fixture-Owner");
  if (!owner) { res.status(401).end(); return; }
  req.user = { id: owner } as Express.User; next();
} }));
import router from "../../server/routes/notifications";
afterEach(() => { Object.values(remove).forEach(mock => mock.mockReset()); });

it.each([["mobile-tokens", "token", "mobile"], ["push-subscriptions", "endpoint", "web"]] as const)("routes %s to the authenticated owner's unsubscribe handler", async (path, field, service) => {
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/${path}`;
    expect((await fetch(url, { method: "DELETE" })).status).toBe(401);
    const headers = { "Content-Type": "application/json", "X-Fixture-Owner": "owner-a" };
    expect((await fetch(url, { method: "DELETE", headers, body: JSON.stringify({ [field]: "another-device" }) })).status).toBe(200);
    expect(remove[service]).toHaveBeenCalledWith("another-device", "owner-a");
    expect((await fetch(url, { method: "DELETE", headers, body: JSON.stringify({ [field]: {} }) })).status).toBe(400);
    expect(remove[service]).toHaveBeenCalledTimes(1);
    remove[service].mockRejectedValueOnce(new Error("database unavailable"));
    expect((await fetch(url, { method: "DELETE", headers, body: JSON.stringify({ [field]: "owned-device" }) })).status).toBe(500);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
