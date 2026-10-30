import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const fixture = vi.hoisted(() => ({db: {} as any, service: {getTicketMessages: vi.fn(), addMessage: vi.fn()}}));
vi.mock("../../server/db.js", () => ({db: fixture.db}));
vi.mock("../../server/services/supportTicketService.js", () => ({supportTicketService: fixture.service}));
vi.mock("../../server/services/notificationService.js", () => ({notificationService: {sendAdminSupportTicketNotification: vi.fn()}}));
import router from "../../server/routes/support";

describe("support page HTTP boundaries", () => {
  let server: Server, base: string, user: any;
  beforeAll(async () => {
    const app = express(); app.use(express.json());
    app.use((req, _res, next) => {req.user = user; req.isAuthenticated = (() => !!user) as any; next();});
    app.use("/api/support", router);
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>(resolve => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as {port: number}).port}/api/support`;
  });
  afterAll(async () => {await new Promise<void>(resolve => server.close(() => resolve()));});
  beforeEach(() => {
    vi.clearAllMocks();
    user = {id: "owner", role: "user"};
    const chain: any = {};
    for (const method of ["from", "where"]) chain[method] = vi.fn(() => chain);
    chain.limit = vi.fn(async () => []);
    fixture.db.select = vi.fn(() => chain);
    fixture.db.insert = vi.fn(); fixture.db.update = vi.fn();
  });
  const post = (path: string, body: unknown) => fetch(base + path, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  it("rejects unauthenticated customer reads", async () => {
    user = undefined;
    expect((await fetch(base + "/my/tickets/ticket-1")).status).toBe(401);
    expect(fixture.db.select).not.toHaveBeenCalled();
  });
  it("returns no conversation or messages when the scoped ticket is absent", async () => {
    expect((await fetch(base + "/my/tickets/foreign-ticket")).status).toBe(404);
    expect(fixture.service.getTicketMessages).not.toHaveBeenCalled();
  });
  it("does not append a reply to an absent scoped ticket", async () => {
    expect((await post("/my/tickets/foreign-ticket/messages", {message: "hello"})).status).toBe(404);
    expect(fixture.service.addMessage).not.toHaveBeenCalled();
  });
  it("rejects malformed creation before a write", async () => {
    expect((await post("/tickets", {subject: {unexpected: true}})).status).toBe(400);
    expect(fixture.db.insert).not.toHaveBeenCalled();
  });
  it("rejects malformed staff writes after admin authentication", async () => {
    user.role = "admin";
    expect((await post("/tickets/ticket-1/messages", {message: "a".repeat(10001)})).status).toBe(400);
    expect((await fetch(base + "/tickets/ticket-1", {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({status: null, satisfactionRating: 99})})).status).toBe(400);
    expect(fixture.service.addMessage).not.toHaveBeenCalled();
    expect(fixture.db.update).not.toHaveBeenCalled();
  });
  it("prevents customer access to staff reply and update routes", async () => {
    expect((await post("/tickets/ticket-1/messages", {message: "staff"})).status).toBe(403);
    expect((await fetch(base + "/tickets/ticket-1", {method: "PATCH", headers: {"Content-Type": "application/json"}, body: JSON.stringify({status: "closed"})})).status).toBe(403);
    expect(fixture.service.addMessage).not.toHaveBeenCalled();
    expect(fixture.db.update).not.toHaveBeenCalled();
  });
});
