import { describe, expect, it } from "vitest";
import {
  evaluateTypecheckResult,
  isGeoDatabaseRequired,
  selectDatabaseTarget,
} from "../../scripts/pre-launch-check";

describe("pre-launch gate helpers", () => {
  it("uses the application's Neon database instead of the separate managed database", () => {
    expect(
      selectDatabaseTarget({
        NEON_DATABASE_URL: "postgresql://app:secret@neon.example/app",
        DATABASE_URL: "postgresql://managed:secret@managed.example/other",
      }),
    ).toEqual({
      name: "NEON_DATABASE_URL",
      url: "postgresql://app:secret@neon.example/app",
    });
  });

  it("never selects a Neon secret over the disposable CI database", () => {
    expect(
      selectDatabaseTarget({
        CI: "true",
        NODE_ENV: "test",
        NEON_DATABASE_URL: "postgresql://prod:secret@neon.example/production",
        DATABASE_URL: "postgresql://postgres:postgres@localhost/test",
      }),
    ).toEqual({
      name: "DATABASE_URL",
      url: "postgresql://postgres:postgres@localhost/test",
    });
  });

  it("supports DATABASE_URL as the isolated CI database fallback", () => {
    expect(
      selectDatabaseTarget({
        DATABASE_URL: "postgresql://postgres:postgres@localhost/test",
      }),
    ).toEqual({
      name: "DATABASE_URL",
      url: "postgresql://postgres:postgres@localhost/test",
    });
  });

  it("rejects missing or whitespace-only database configuration", () => {
    expect(selectDatabaseTarget({})).toBeNull();
    expect(selectDatabaseTarget({ NEON_DATABASE_URL: "  ", DATABASE_URL: " " })).toBeNull();
  });

  it("requires GeoLite2 data only when GeoDNS is explicitly enabled", () => {
    expect(isGeoDatabaseRequired({ GEODNS_ENABLED: "true" })).toBe(true);
    expect(isGeoDatabaseRequired({ GEODNS_ENABLED: "TRUE" })).toBe(true);
    expect(isGeoDatabaseRequired({ GEODNS_ENABLED: "false" })).toBe(false);
    expect(isGeoDatabaseRequired({})).toBe(false);
  });

  it("fails closed when TypeScript times out without printing a compiler error", () => {
    const result = evaluateTypecheckResult(null, "ETIMEDOUT", "", 600_000);
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("timed out after 600 seconds");
  });

  it("fails closed on process crashes even when there are no TypeScript diagnostics", () => {
    expect(evaluateTypecheckResult(137, undefined, "").ok).toBe(false);
    expect(evaluateTypecheckResult(null, "SIGKILL", "").ok).toBe(false);
  });

  it("fails on compiler errors and only passes an actual zero exit", () => {
    expect(
      evaluateTypecheckResult(2, undefined, "error TS2322: incompatible type").ok,
    ).toBe(false);
    expect(evaluateTypecheckResult(0).ok).toBe(true);
  });
});
