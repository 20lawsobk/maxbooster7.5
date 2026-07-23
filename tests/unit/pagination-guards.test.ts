/**
 * Unit tests for pagination guard patterns.
 *
 * Verifies the offset/limit cap pattern used in all paginated API routes.
 * Pattern: const offset = Math.min(Math.max(parseInt(raw) || 0, 0), 100_000)
 * This prevents unbounded DB scans and negative offset attacks.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

function capOffset(raw: string | undefined): number {
  return Math.min(Math.max(parseInt(raw ?? "") || 0, 0), 100_000);
}

function capLimit(raw: string | undefined, max = 100): number {
  return Math.min(Math.max(parseInt(raw ?? "") || 0, 0), max);
}

/** Recursively collect all .ts files under a directory. */
function collectTs(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectTs(full));
    } else if (entry.endsWith(".ts")) {
      results.push(full);
    }
  }
  return results;
}

describe("Offset cap formula", () => {
  it("clamps negative offsets to 0", () => {
    expect(capOffset("-1")).toBe(0);
    expect(capOffset("-9999")).toBe(0);
  });

  it("accepts zero", () => {
    expect(capOffset("0")).toBe(0);
  });

  it("accepts valid mid-range offset", () => {
    expect(capOffset("500")).toBe(500);
  });

  it("clamps oversized offset to 100_000", () => {
    expect(capOffset("999999")).toBe(100_000);
    expect(capOffset("1000001")).toBe(100_000);
  });

  it("treats NaN/missing input as 0", () => {
    expect(capOffset(undefined)).toBe(0);
    expect(capOffset("")).toBe(0);
    expect(capOffset("abc")).toBe(0);
  });

  it("accepts boundary value 100_000 exactly", () => {
    expect(capOffset("100000")).toBe(100_000);
  });
});

describe("Limit cap formula", () => {
  it("clamps negative limits to 0", () => {
    expect(capLimit("-1")).toBe(0);
  });

  it("clamps oversized limit to max", () => {
    expect(capLimit("9999", 100)).toBe(100);
  });

  it("accepts valid limit within range", () => {
    expect(capLimit("50", 100)).toBe(50);
  });

  it("treats NaN as 0", () => {
    expect(capLimit("", 100)).toBe(0);
  });
});

describe("Pagination cap pattern is consistently applied in route files", () => {
  const routeFiles = collectTs("server/routes");
  const offsetPattern = /Math\.min\(Math\.max\(parseInt\(/;

  it("no route file uses a raw parseInt(offset) without capping", () => {
    const violations: string[] = [];
    for (const file of routeFiles) {
      const src = readFileSync(file, "utf8");
      if (src.includes("req.query.offset") || src.includes("req.query.page")) {
        // Accept any of the known safe capping patterns:
        //  1. Math.min(Math.max(parseInt(...), 0), 100_000)
        //  2. Math.min(Number.isFinite(raw) && raw >= 0 ? raw : 0, 100_000)
        //  3. Explicit 100_000 or 100000 cap constant
        const hasCap =
          offsetPattern.test(src) ||
          src.includes("100_000") ||
          src.includes("100000") ||
          src.includes("Number.isFinite");
        if (!hasCap) {
          violations.push(file);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
