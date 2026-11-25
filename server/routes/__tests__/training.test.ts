import { beforeEach, describe, expect, it, vi } from "vitest";

const transport = vi.hoisted(() => ({
  request: vi.fn(),
}));

vi.mock("../../lib/internalServiceAuth.js", () => ({
  hasBearerSecret: () => true,
}));

vi.mock("../../middleware/auth.js", () => ({
  requireAdmin: (_req: unknown, _res: unknown, next: () => void) => next(),
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

vi.mock("../../logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn() },
}));

vi.mock("../../services/maxcoreSync.js", () => ({
  syncWeightsNow: vi.fn(),
}));

vi.mock("../../services/maxcoreControlTransport.js", () => ({
  MaxCoreControlError: class MaxCoreControlError extends Error {
    constructor(message: string, readonly status = 503) {
      super(message);
    }
  },
  maxCoreControlTransport: transport,
}));

import router from "../training.js";

type RouteLayer = {
  route?: {
    path: string;
    methods: Record<string, boolean>;
    stack: Array<{ handle: (req: unknown, res: unknown) => unknown }>;
  };
};

function getHandler(path: string) {
  const layer = (router as unknown as { stack: RouteLayer[] }).stack.find(
    (candidate) =>
      candidate.route?.path === path && candidate.route.methods.get,
  );
  expect(layer, `GET ${path} should be registered`).toBeDefined();
  return layer!.route!.stack.at(-1)!.handle;
}

function responseDouble() {
  const response = {
    statusCode: 200,
    payload: undefined as unknown,
    status(code: number) {
      response.statusCode = code;
      return response;
    },
    json(value: unknown) {
      response.payload = value;
      return response;
    },
  };
  return response;
}

describe("MaxCore training API paths", () => {
  beforeEach(() => {
    transport.request.mockReset();
    transport.request.mockResolvedValue({ state: "idle" });
  });

  it.each([
    ["/status", "/api/training/status"],
    ["/datasets", "/api/training/datasets"],
  ])("prefixes %s with the MaxCore API mount", async (route, upstream) => {
    const response = responseDouble();
    await getHandler(route)({}, response);

    expect(transport.request).toHaveBeenCalledWith(upstream, {
      method: "GET",
      timeoutMs: 60_000,
    });
    expect(response.statusCode).toBe(200);
  });

  it("prefixes every upstream request made by the training schedule route", async () => {
    const response = responseDouble();
    await getHandler("/schedule")({}, response);

    expect(transport.request.mock.calls.map(([endpoint]) => endpoint)).toEqual([
      "/api/training/status",
      "/api/training/continuous/status",
      "/api/training/datasets",
    ]);
    expect(response.statusCode).toBe(200);
  });
});
