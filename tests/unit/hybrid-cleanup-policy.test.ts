import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { normalizeHybridCleanupDays } from "../../server/services/hybridCleanupPolicy.js";

describe("hybrid storage destructive cleanup retention age", () => {
  it("uses a safe 90-day default only when absent", () => {
    expect(normalizeHybridCleanupDays(undefined)).toBe(90);
  });

  it("accepts explicitly requested positive whole-day retention", () => {
    for (const value of [1, 30, 90, 36500, "1", "30", "36500"]) {
      expect(normalizeHybridCleanupDays(value)).toBe(Number(value));
    }
  });

  it("rejects negative, zero and fractional ages", () => {
    for (const value of [-999, -1, 0, 0.1, 1.5, "-999", "-1", "0", "1.5"]) {
      expect(() => normalizeHybridCleanupDays(value)).toThrow(RangeError);
    }
  });

  it("rejects malformed, ambiguous and unsafe values", () => {
    for (const value of ["", " ", "1day", "01", " 1", "1 ", "NaN", null, true, false, [], {}, Infinity, -Infinity, NaN, 36501, "36501", Number.MAX_SAFE_INTEGER + 1]) {
      expect(() => normalizeHybridCleanupDays(value)).toThrow(RangeError);
    }
  });

  it("validates both HTTP input and direct service invocations", () => {
    const route = readFileSync(new URL("../../server/routes/hybridStorage.ts", import.meta.url), "utf8");
    const service = readFileSync(new URL("../../server/services/hybridStorageService.ts", import.meta.url), "utf8");
    const handler = route.split('router.post("/cleanup"')[1]?.split('router.get(\n  "/download-url')[0];
    expect(handler).toBeTruthy();
    expect(handler).toContain("normalizeHybridCleanupDays(req.body?.olderThanDays)");
    expect(handler).toContain("res.status(400)");
    expect(service).toContain("normalizeHybridCleanupDays(options?.olderThanDays)");
    expect(service).not.toContain("options?.olderThanDays || 90");
  });
});
