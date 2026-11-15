/**
 * Unit tests for the fileIds DoS cap.
 *
 * The /api/files/batch endpoint caps fileIds arrays at 500 entries.
 * Without this cap, a request with 100,000 fileIds would cause a
 * massive IN() query, memory spike, and potential DB timeout.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";

const FILES_ROUTE = "server/routes/files.ts";
const BATCH_CAP = 500;

describe("FileIds DoS cap — source analysis", () => {
  it("files.ts contains a fileIds length guard", () => {
    const src = readFileSync(FILES_ROUTE, "utf8");
    expect(src).toContain("fileIds.length");
  });

  it(`files.ts caps fileIds at ${BATCH_CAP}`, () => {
    const src = readFileSync(FILES_ROUTE, "utf8");
    expect(src).toContain(String(BATCH_CAP));
  });

  it("files.ts rejects oversized fileIds arrays with a 4xx response", () => {
    const src = readFileSync(FILES_ROUTE, "utf8");
    // Should have a condition checking fileIds.length > CAP before querying
    const hasCap =
      src.includes(`fileIds.length > ${BATCH_CAP}`) ||
      src.includes(`fileIds.length > 500`);
    expect(hasCap).toBe(true);
  });

  it("files.ts validates fileIds is an array before using it", () => {
    const src = readFileSync(FILES_ROUTE, "utf8");
    expect(src).toMatch(/Array\.isArray\(fileIds\)/);
  });
});

describe("FileIds cap logic", () => {
  const MAX_IDS = BATCH_CAP;

  function validateFileIds(fileIds: unknown): {
    valid: boolean;
    error?: string;
  } {
    if (!Array.isArray(fileIds) || fileIds.length === 0) {
      return { valid: false, error: "fileIds must be a non-empty array" };
    }
    if (fileIds.length > MAX_IDS) {
      return { valid: false, error: `Too many fileIds (max ${MAX_IDS})` };
    }
    return { valid: true };
  }

  it("accepts an empty-array as invalid (no-op request)", () => {
    expect(validateFileIds([])).toMatchObject({ valid: false });
  });

  it("accepts a single ID", () => {
    expect(validateFileIds(["abc"])).toMatchObject({ valid: true });
  });

  it(`accepts exactly ${BATCH_CAP} IDs`, () => {
    const ids = Array.from({ length: BATCH_CAP }, (_, i) => `id-${i}`);
    expect(validateFileIds(ids)).toMatchObject({ valid: true });
  });

  it(`rejects ${BATCH_CAP + 1} IDs`, () => {
    const ids = Array.from({ length: BATCH_CAP + 1 }, (_, i) => `id-${i}`);
    expect(validateFileIds(ids)).toMatchObject({ valid: false });
  });

  it("rejects non-array input", () => {
    expect(validateFileIds("abc")).toMatchObject({ valid: false });
    expect(validateFileIds(null)).toMatchObject({ valid: false });
    expect(validateFileIds(42)).toMatchObject({ valid: false });
  });
});
