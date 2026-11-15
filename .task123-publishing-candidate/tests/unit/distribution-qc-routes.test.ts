import { beforeEach, describe, expect, it, vi } from "vitest";

const { limitMock, dbMock } = vi.hoisted(() => {
  const limitMock = vi.fn();
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.limit = limitMock;
  chain.orderBy = vi.fn(() => chain);
  chain.set = vi.fn(() => chain);
  chain.returning = vi.fn();
  const dbMock = {
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
  };
  return { limitMock, dbMock };
});

vi.mock("../../server/db", () => ({ db: dbMock }));
vi.mock("../../server/storage", () => ({ storage: {} }));
vi.mock("../../server/middleware/auth.js", () => ({
  requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import distributionRouter from "../../server/routes/distribution.js";

function qcReadHandler() {
  const layer = (distributionRouter as any).stack.find(
    (candidate: any) => candidate.route?.path === "/qc/:releaseId",
  );
  if (!layer) throw new Error("Per-release QC route is not registered");
  return layer.route.stack.at(-1).handle;
}

function responseMock() {
  const response: any = {
    statusCode: 200,
    body: undefined,
    status: vi.fn((status: number) => {
      response.statusCode = status;
      return response;
    }),
    json: vi.fn((body: unknown) => {
      response.body = body;
      return response;
    }),
  };
  return response;
}

beforeEach(() => {
  dbMock.select.mockClear();
  limitMock.mockReset();
});

describe("GET /api/distribution/qc/:releaseId", () => {
  it("returns the owned release's persisted report in the UI envelope", async () => {
    const report = { id: "qc-1", releaseId: "release-1", status: "incomplete" };
    limitMock.mockResolvedValueOnce([
      { id: "release-1", metadata: { qcReport: report } },
    ]);
    const response = responseMock();

    await qcReadHandler()(
      { user: { id: "artist-1" }, params: { releaseId: "release-1" } },
      response,
    );

    expect(response.statusCode).toBe(200);
    expect(response.body).toEqual({ status: "complete", report });
    expect(dbMock.select).toHaveBeenCalledOnce();
  });

  it("uses an explicit not_run status instead of fabricating a pass", async () => {
    limitMock.mockResolvedValueOnce([{ id: "release-1", metadata: {} }]);
    const response = responseMock();

    await qcReadHandler()(
      { user: { id: "artist-1" }, params: { releaseId: "release-1" } },
      response,
    );

    expect(response.body).toEqual({ status: "not_run", report: null });
  });

  it("does not disclose missing or unowned releases", async () => {
    limitMock.mockResolvedValueOnce([]);
    const response = responseMock();

    await qcReadHandler()(
      { user: { id: "artist-1" }, params: { releaseId: "someone-elses" } },
      response,
    );

    expect(response.statusCode).toBe(404);
    expect(response.body).toEqual({ error: "Release not found" });
  });
});