import { describe, it, expect, vi, beforeEach } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), selectRows: [] as any[], values: vi.fn() }));
vi.mock("resend", () => ({ Resend: class { emails = { send: mocks.send }; } }));
vi.mock("../../server/db", () => ({
  db: {
    select: () => {
      const query: any = { from: () => query, where: () => query,
        orderBy: () => query, limit: async () => mocks.selectRows,
        then: (resolve: any) => Promise.resolve(mocks.selectRows).then(resolve) };
      return query;
    },
    insert: () => ({ values: mocks.values }),
  },
}));
vi.mock("@shared/schema", () => ({
  analytics: {}, revenueForecasts: {},
}));
vi.mock("../../server/logger.js", () => ({ logger: { info: vi.fn(), warn: vi.fn() } }));
import { validateSplitAllocation } from "../../server/services/splitAgreementValidation";
import { sendTransactionalNoRetry } from "../../server/services/fanMailAdapter";
import { revenueForecastService } from "../../server/services/revenueForecastService";
import { toMerchCents } from "../../server/services/merchCheckoutService";

const participant = (id: string, percentage: number) => ({
  userId: id, name: id, email: `${id}@example.test`, role: "writer", splitPercentage: percentage,
});
describe("growth split allocation boundary", () => {
  it("accepts complete finite allocation", () => {
    expect(validateSplitAllocation([participant("a", 60), participant("b", 40)])).toBeNull();
  });
  it.each([NaN, Infinity, -1, 101, "50", null])("rejects invalid percentage %s", value => {
    expect(validateSplitAllocation([{ ...participant("a", 100), splitPercentage: value }])).not.toBeNull();
  });
  it("rejects duplicates, under/over allocation and empty identity", () => {
    for (const entries of [
      [participant("a", 50), participant("a", 50)],
      [participant("a", 99)], [participant("a", 100), participant("b", 1)],
      [participant("", 100)], [],
    ]) expect(validateSplitAllocation(entries)).not.toBeNull();
  });
});
describe("fan no-retry provider adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_API_KEY = "isolated-not-a-real-key";
    process.env.RESEND_FROM_EMAIL = "artist@example.test";
  });
  const command = { commandKey: "stable-command", to: "fan@example.test", subject: "News", html: "<p>News</p>" };
  it("requires a receipt and forwards stable provider dedup key", async () => {
    mocks.send.mockResolvedValue({ data: { id: "provider-1" }, error: null });
    expect(await sendTransactionalNoRetry(command)).toEqual({
      status: "accepted", provider: "resend", providerMessageId: "provider-1",
    });
    expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({ to: command.to }),
      { idempotencyKey: command.commandKey });
  });
  it.each([{ data: null }, { error: { message: "rejected" } }])("never invents acceptance %j", async value => {
    mocks.send.mockResolvedValue(value);
    expect((await sendTransactionalNoRetry(command)).status).toBe("unknown");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("does not retry ambiguous timeouts", async () => {
    mocks.send.mockRejectedValue(new Error("timeout after submission"));
    expect((await sendTransactionalNoRetry(command)).status).toBe("unknown");
    expect(mocks.send).toHaveBeenCalledTimes(1);
  });
  it("rejects missing configuration before any effect", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendTransactionalNoRetry(command)).rejects.toThrow("requires");
    expect(mocks.send).not.toHaveBeenCalled();
  });
});
describe("empirical forecast evidence", () => {
  beforeEach(() => { mocks.selectRows = []; });
  it("returns unavailable accuracy rather than invented 85%", async () => {
    expect(await revenueForecastService.compareToActual("artist")).toMatchObject({
      overallAccuracy: null, mape: null, meanAbsoluteError: null, sampleCount: 0,
    });
  });
  it("scores zero actuals using MAE and excludes them from MAPE", async () => {
    mocks.selectRows = [{ projectedRevenue: 10, actualRevenue: 0, period: "3 months" }];
    expect(await revenueForecastService.compareToActual("artist")).toMatchObject({
      mape: null, meanAbsoluteError: 10, excludedZeroActuals: 1,
    });
  });
  it("preserves observed zero and outlier rates", async () => {
    mocks.selectRows = [{ totalStreams: 1000, totalRevenue: 0 }];
    expect(await revenueForecastService.calculateStreamToRevenueRate("artist")).toBe(0);
    mocks.selectRows = [{ totalStreams: 1000, totalRevenue: 100 }];
    expect(await revenueForecastService.calculateStreamToRevenueRate("artist")).toBe(0.1);
  });
  it("does not replace a zero prediction with legacy positive prediction", async () => {
    mocks.selectRows = [{ projectedRevenue: 0, predictedRevenue: 100, actualRevenue: 100, period: "3 months" }];
    expect((await revenueForecastService.compareToActual("artist")).mape).toBe(100);
  });
  it("no-data forecast discloses assumptions and has no invented royalty entitlement", async () => {
    const forecast = await revenueForecastService.generateForecast("artist", 3);
    expect(forecast.projectedRoyalties).toBeNull();
    expect(forecast.provenance).toMatchObject({ sampleCount: 0, revenueRate: "assumed", currency: null });
    expect(forecast.provenance.assumptions.join(" ")).toContain("1000 monthly streams");
  });
});
describe("merchandise money boundaries", () => {
  it("converts legitimate prices to exact integer cents", () => {
    expect(toMerchCents(12.34)).toBe(1234);
    expect(toMerchCents(0)).toBe(0);
  });
  it.each([-1, NaN, Infinity, 0.001])("rejects invalid price %s", value => {
    expect(() => toMerchCents(value)).toThrow();
  });
});