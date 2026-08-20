/**
 * Regression tests for zero-row release updates. Drizzle resolves an UPDATE
 * that matches no rows without throwing, so the workflow service must inspect
 * RETURNING before recording a successful request/version-history entry.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { limitMock, returningMock, valuesMock, chain, dbMock } = vi.hoisted(
  () => {
    const limitMock = vi.fn();
    const returningMock = vi.fn();
    const valuesMock = vi.fn();
    const chain: any = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      set: vi.fn(() => chain),
      values: valuesMock,
      limit: limitMock,
      returning: returningMock,
    };
    const dbMock = {
      select: vi.fn(() => chain),
      insert: vi.fn(() => chain),
      update: vi.fn(() => chain),
    };
    return { limitMock, returningMock, valuesMock, chain, dbMock };
  },
);

vi.mock("../../server/db", () => ({ db: dbMock }));

vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { releaseWorkflowService } from "../../server/services/releaseWorkflowService.js";

const release = {
  id: "release-1",
  status: "processing",
  title: "Test release",
  artist: "Test artist",
  metadata: { genre: "pop" },
};

beforeEach(() => {
  dbMock.select.mockClear();
  dbMock.insert.mockClear();
  dbMock.update.mockClear();
  chain.set.mockClear();
  chain.values.mockClear();
  limitMock.mockReset();
  returningMock.mockReset();
  valuesMock.mockReset().mockImplementation(() => chain);
});

describe("releaseWorkflowService update honesty", () => {
  it("returns failure and creates no workflow request when transition updates zero rows", async () => {
    limitMock.mockResolvedValueOnce([release]);
    returningMock.mockResolvedValueOnce([]);

    const result = await releaseWorkflowService.transition(
      "release-1",
      "user-1",
      "live",
      "publish",
      {},
    );

    expect(result).toMatchObject({
      success: false,
      previousStatus: "processing",
      newStatus: "processing",
    });
    expect(result.error).toContain("update could be applied");
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("returns success and records the request/version history on a matched transition", async () => {
    limitMock
      .mockResolvedValueOnce([release])
      .mockResolvedValueOnce([]);
    returningMock
      .mockResolvedValueOnce([{ id: "release-1" }])
      .mockResolvedValueOnce([{ id: "request-1" }]);

    const result = await releaseWorkflowService.transition(
      "release-1",
      "user-1",
      "live",
      "publish",
      {},
    );

    expect(result).toMatchObject({
      success: true,
      previousStatus: "processing",
      newStatus: "live",
      requestId: "request-1",
    });
    expect(dbMock.insert).toHaveBeenCalledTimes(2);
  });

  it("returns failure and creates no version history when metadata updates zero rows", async () => {
    limitMock.mockResolvedValueOnce([release]);
    returningMock.mockResolvedValueOnce([]);

    const result = await releaseWorkflowService.updateMetadata(
      "release-1",
      "user-1",
      { title: "Updated title" },
    );

    expect(result).toMatchObject({ success: false, version: 0 });
    expect(result.error).toContain("update could be applied");
    expect(dbMock.insert).not.toHaveBeenCalled();
  });

  it("returns success and records version history on a matched metadata update", async () => {
    limitMock
      .mockResolvedValueOnce([release])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ version: 3 }]);
    returningMock.mockResolvedValueOnce([{ id: "release-1" }]);

    const result = await releaseWorkflowService.updateMetadata(
      "release-1",
      "user-1",
      { title: "Updated title" },
    );

    expect(result).toEqual({ success: true, version: 3 });
    expect(dbMock.insert).toHaveBeenCalledTimes(1);
  });
});