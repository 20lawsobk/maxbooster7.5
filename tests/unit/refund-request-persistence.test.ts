import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

describe("refund request durability", () => {
  const source = readFileSync("server/routes/billing.ts", "utf8");
  const start = source.indexOf("// Persist the refund request so admins can review it");
  const end = source.indexOf("    } catch (error: unknown)", start);
  const body = source.slice(start, end);
  const execute = new Function("db", "workspaceAuditLog", "logger", "res",
    "userId", "refundRequestId", "refundRequestPayload", "invoiceId", "chargeId", "reason", "refundAmount",
    `return (async () => { ${body} })();`);

  async function run(fail: boolean) {
    let saved = false;
    const values = vi.fn(async () => {
      if (fail) throw new Error("test persistence failure");
      saved = true;
    });
    const logger = { warn: vi.fn(), info: vi.fn() };
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn((payload) => {
        if (payload.success) expect(saved).toBe(true);
        return payload;
      }),
    };
    await execute({ insert: () => ({ values }) }, {}, logger, res,
      "test-user", "test-request", { status: "pending_review" }, "test-invoice",
      null, "test-reason", 4900);
    return { res, logger, values };
  }
  it("returns a failure, without success logging, when persistence fails", async () => {
    const { res, logger } = await run(true);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      success: false, code: "REFUND_REQUEST_FAILED",
    }));
    expect(logger.info).not.toHaveBeenCalled();
  });
  it("reports success only after persistence finishes", async () => {
    const { res, values } = await run(false);
    expect(values).toHaveBeenCalledTimes(1);
    expect(res.json).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      success: true, code: "REFUND_REQUESTED",
    }));
  });
});
