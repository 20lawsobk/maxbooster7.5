import express from "express";
import type { AddressInfo } from "node:net";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const render = vi.fn();
const findProject = vi.fn();

vi.mock("../../server/middleware/auth.js", () => ({
  requireAuth: (req: any, _res: any, next: any) => { req.user = { id: "user-1" }; next(); },
}));
vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../../server/services/pluginHostService", () => ({ pluginHostService: {}, PluginCategory: {} }));
vi.mock("../../server/services/modulationRoutingRepository", () => ({ modulationRouting: {} }));
vi.mock("../../server/db", () => ({ db: { query: { projects: { findFirst: findProject } } } }));
vi.mock("../../server/services/studioRenderService.js", () => ({ renderProjectMixdown: render }));

const { default: router } = await import("../../server/routes/studioPlugins");
const app = express().use(express.json()).use("/api/studio/plugins", router);
const server = app.listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
afterAll(() => new Promise((resolve) => server.close(resolve)));
const post = async (payload: unknown) => {
  const r = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/studio/plugins/bounce`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  return { status: r.status, body: await r.json() };
};
const body = { projectId: "p1", sourceTrackIds: ["t1", "t2"], startTime: 2, endTime: 6, normalize: true };

describe("plugin bounce renders real audio", () => {
  beforeEach(() => { render.mockReset(); findProject.mockReset(); });

  it("reports completion only with the rendered file and passes the exact bounce contract", async () => {
    findProject.mockResolvedValue({ id: "p1", userId: "user-1" });
    render.mockResolvedValue({ renderId: "render_1", downloadPath: "/api/storage/file/k", fileSize: 1234, durationSec: 4 });
    const res = await post(body);
    expect(res.status).toBe(201);
    expect(res.body.bounce).toMatchObject({ id: "render_1", filePath: "/api/storage/file/k", fileSize: 1234, duration: 4, status: "completed" });
    expect(render).toHaveBeenCalledWith("p1", expect.objectContaining({
      trackIds: ["t1", "t2"], rangeSec: { start: 2, end: 6 }, normalizePeak: true,
      includeTrackEffects: true, storageCategory: "studio-bounces/p1",
    }));
  });

  it("surfaces render failure instead of fabricating a completed bounce", async () => {
    findProject.mockResolvedValue({ id: "p1", userId: "user-1" });
    render.mockRejectedValue(new Error("Cannot render: 1 audible clip(s) have no retrievable audio"));
    const res = await post(body);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/no retrievable audio/);
    expect(res.body.bounce).toBeUndefined();
  });

  it("rejects an empty range and an unowned project without rendering", async () => {
    findProject.mockResolvedValue(null);
    expect((await post({ ...body, endTime: 2 })).status).toBe(400);
    expect((await post(body)).status).toBe(404);
    expect(render).not.toHaveBeenCalled();
  });
});
