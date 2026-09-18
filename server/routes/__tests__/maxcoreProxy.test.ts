import { beforeEach, describe, expect, it, vi } from "vitest";

const connector = vi.hoisted(() => ({
  origin: "http://maxcore.internal",
}));

vi.mock("../../services/maxcoreConnector.js", () => ({
  absolutizeMaxcoreMediaUrls: (value: unknown) => value,
  getMaxcoreAdminHeaders: () => ({ "X-Admin-Key": "admin" }),
  getMaxcoreGenerationHeaders: () => ({ Authorization: "Bearer service" }),
  getMaxcoreOrigin: () => connector.origin,
  isAllowedMaxcoreMediaPath: () => true,
}));

vi.mock("../../middleware/auth.js", () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuthOnly: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../../logger.js", () => ({
  logger: { warn: vi.fn(), debug: vi.fn() },
}));

import router from "../maxcoreProxy.js";

type Layer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: unknown, res: unknown) => unknown }>;
  };
};

function routeHandler(method: string, path: string) {
  const layer = (router as unknown as { stack: Layer[] }).stack.find(
    (candidate) =>
      candidate.route?.path === path &&
      candidate.route.methods[method.toLowerCase()],
  );
  expect(layer, `${method} ${path} should be registered`).toBeDefined();
  return layer!.route!.stack.at(-1)!.handle;
}

function responseDouble() {
  const response = {
    statusCode: 200,
    payload: undefined as unknown,
    headers: {} as Record<string, string>,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    setHeader(name: string, value: string) {
      response.headers[name] = value;
      return response;
    },
    json(value: unknown) {
      response.payload = value;
      return response;
    },
    send(value: unknown) {
      response.payload = value;
      return response;
    },
    end: vi.fn(),
  };
  return response;
}

describe("MaxCore public proxy contract", () => {
  beforeEach(() => {
    connector.origin = "http://maxcore.internal";
    vi.restoreAllMocks();
  });

  it.each([
    ["post", "/api/generate/campaign"],
    ["post", "/api/video/extend"],
    ["post", "/api/optimize/ad"],
    ["post", "/api/audio/mastering-recommendation"],
    ["post", "/api/audio/mixing-recommendation"],
    ["get", "/api/models/social/state"],
    ["post", "/api/train/feedback"],
    ["get", "/api/training/status"],
    ["get", "/api/audio/:jobId/stems"],
    ["post", "/api/audio/upload"],
  ])("registers %s %s", (method, path) => {
    routeHandler(method, path);
  });

  it("forwards authenticated identity and preserves the MaxCore response", async () => {
    const transport = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ score: 91, reasoning: ["model"] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const req = {
      method: "POST",
      originalUrl: "/api/optimize/ad",
      path: "/api/optimize/ad",
      params: {},
      body: { platform: "meta", campaign: { ctr: 0.02 } },
      user: { id: "user-7", role: "artist" },
    };
    const res = responseDouble();

    await routeHandler("post", "/api/optimize/ad")(req, res);

    expect(transport).toHaveBeenCalledWith(
      "http://maxcore.internal/api/optimize/ad",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-MaxCore-User-Id": "user-7",
        }),
        body: JSON.stringify({
          platform: "meta",
          campaign: { ctr: 0.02 },
          user_id: "user-7",
          userId: "user-7",
        }),
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ score: 91, reasoning: ["model"] });
  });

  it("returns an explicit error when MaxCore is unavailable", async () => {
    connector.origin = "";
    const res = responseDouble();
    await routeHandler("post", "/api/predict/engagement")(
      {
        method: "POST",
        originalUrl: "/api/predict/engagement",
        path: "/api/predict/engagement",
        params: {},
        body: {},
        user: { id: "user-7", role: "artist" },
      },
      res,
    );
    expect(res.statusCode).toBe(503);
    expect(res.payload).toEqual(
      expect.objectContaining({ error: "MaxCore not configured" }),
    );
  });
});