/**
 * Regression tests for Task #110: releaseScheduler.processScheduledActions
 * must only mark a scheduled action "completed" once real work actually
 * happened and succeeded.
 *
 * - A "publish" action must be marked "failed" (not "completed") when the
 *   workflow service's publish() call reports success:false — previously
 *   the scheduler awaited publish() and unconditionally marked the action
 *   completed regardless of what it returned.
 * - A "platform_publish" action has no real distribution call wired up yet
 *   (see distributionService.submitToProvider, which is a separate,
 *   manually-triggered flow). It must be marked "unsupported" instead of
 *   "completed" after only a log line.
 * - An unrecognized action type must be marked "failed", not "completed".
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const limitMock = vi.fn();
const returningMock = vi.fn();

const chain: any = {
  from: vi.fn(() => chain),
  where: vi.fn(() => chain),
  orderBy: vi.fn(() => chain),
  set: vi.fn(() => chain),
  values: vi.fn(() => chain),
  limit: limitMock,
  returning: returningMock,
};

vi.mock("../../server/db", () => ({
  db: {
    select: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    update: vi.fn(() => chain),
  },
}));

vi.mock("../../server/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../server/services/releaseWorkflowService.js", () => ({
  releaseWorkflowService: {
    publish: vi.fn(),
  },
}));

import { releaseScheduler } from "../../server/services/releaseScheduler.js";
import { releaseWorkflowService } from "../../server/services/releaseWorkflowService.js";

function makeAction(overrides: Record<string, unknown> = {}) {
  return {
    id: "action-1",
    releaseId: "release-1",
    actionType: "publish",
    scheduledFor: new Date(Date.now() - 1000),
    status: "pending",
    metadata: null,
    executedAt: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("releaseScheduler.processScheduledActions honesty", () => {
  beforeEach(() => {
    limitMock.mockReset();
    chain.set.mockClear();
    (releaseWorkflowService.publish as any).mockReset();
  });

  it("marks a publish action completed only when publish() reports success", async () => {
    limitMock.mockResolvedValueOnce([makeAction()]);
    (releaseWorkflowService.publish as any).mockResolvedValueOnce({
      success: true,
      previousStatus: "processing",
      newStatus: "live",
    });

    const result = await releaseScheduler.processScheduledActions();

    expect(result).toEqual({ processed: 1, errors: 0, unsupported: 0 });
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
  });

  it("marks a publish action failed (not completed) when publish() reports success:false", async () => {
    limitMock.mockResolvedValueOnce([makeAction()]);
    (releaseWorkflowService.publish as any).mockResolvedValueOnce({
      success: false,
      previousStatus: "draft",
      newStatus: "draft",
      error: "Cannot transition from draft to processing",
    });

    const result = await releaseScheduler.processScheduledActions();

    expect(result).toEqual({ processed: 0, errors: 1, unsupported: 0 });
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        metadata: expect.objectContaining({
          error: "Cannot transition from draft to processing",
        }),
      }),
    );
    expect(chain.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
  });

  it("marks a publish action failed when publish() throws directly", async () => {
    limitMock.mockResolvedValueOnce([makeAction({ id: "action-throw" })]);
    (releaseWorkflowService.publish as any).mockRejectedValueOnce(
      new Error("connection terminated"),
    );

    const result = await releaseScheduler.processScheduledActions();

    expect(result).toEqual({ processed: 0, errors: 1, unsupported: 0 });
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        metadata: expect.objectContaining({
          error: "connection terminated",
        }),
      }),
    );
  });

  it("marks a platform_publish action unsupported instead of completed", async () => {
    limitMock.mockResolvedValueOnce([
      makeAction({ id: "action-2", actionType: "platform_publish" }),
    ]);

    const result = await releaseScheduler.processScheduledActions();

    expect(result).toEqual({ processed: 0, errors: 0, unsupported: 1 });
    expect(releaseWorkflowService.publish).not.toHaveBeenCalled();
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({ status: "unsupported" }),
    );
    expect(chain.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ status: "completed" }),
    );
  });

  it("marks an unrecognized action type failed instead of completed", async () => {
    limitMock.mockResolvedValueOnce([
      makeAction({ id: "action-3", actionType: "mystery_action" }),
    ]);

    const result = await releaseScheduler.processScheduledActions();

    expect(result).toEqual({ processed: 0, errors: 1, unsupported: 0 });
    expect(chain.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        metadata: expect.objectContaining({
          error: "Unknown action type: mystery_action",
        }),
      }),
    );
  });

  it("processes nothing and reports zeros when there are no pending actions", async () => {
    limitMock.mockResolvedValueOnce([]);

    const result = await releaseScheduler.processScheduledActions();

    expect(result).toEqual({ processed: 0, errors: 0, unsupported: 0 });
    expect(chain.set).not.toHaveBeenCalled();
  });
});
