import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const isApiConfigured = vi.fn();
const getReleaseAnalytics = vi.fn();
const dbSelect = vi.fn();

vi.mock("../../server/db", () => ({
  db: {
    select: dbSelect,
    transaction: vi.fn(),
  },
}));

vi.mock("../../server/services/labelgrid-service.js", () => ({
  labelGridService: {
    isApiConfigured,
    getReleaseAnalytics,
  },
}));

vi.mock("../../server/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
  },
}));

describe("legacy LabelGrid royalty reconciliation", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not schedule retired-provider reads or ledger writes", async () => {
    const { labelGridRoyaltySync } = await import(
      "../../server/services/labelGridRoyaltySync"
    );

    labelGridRoyaltySync.start();
    await vi.advanceTimersByTimeAsync(48 * 60 * 60 * 1000);

    expect(isApiConfigured).not.toHaveBeenCalled();
    expect(getReleaseAnalytics).not.toHaveBeenCalled();
    expect(dbSelect).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});