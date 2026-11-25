import { describe, expect, it } from "vitest";
import { selectApplicationDatabaseUrl } from "../../server/config/databaseTarget.js";
import { databaseUrlFromEnvironment } from "../../scripts/migrate-dns-api-schema.mjs";

describe("application database target selection", () => {
  it("prefers the primary Neon database", () => {
    expect(
      selectApplicationDatabaseUrl({
        NEON_PRIMARY_URL: "postgresql://primary-neon/database",
        NEON_DATABASE_URL: "postgresql://app-neon/database",
        DATABASE_URL: "postgresql://managed/database",
      }),
    ).toBe("postgresql://primary-neon/database");
  });

  it("uses NEON_DATABASE_URL when the primary Neon URL is absent", () => {
    expect(
      selectApplicationDatabaseUrl({
        NEON_DATABASE_URL: "postgresql://app-neon/database",
        DATABASE_URL: "postgresql://managed/database",
      }),
    ).toBe("postgresql://app-neon/database");
  });

  it("uses DATABASE_URL only when both Neon URLs are absent", () => {
    expect(
      selectApplicationDatabaseUrl({
        DATABASE_URL: "postgresql://managed/database",
      }),
    ).toBe("postgresql://managed/database");
  });

  it("uses the primary Neon URL for schema migrations", () => {
    const environment = {
      NEON_PRIMARY_URL: "postgresql://other-neon/database",
      NEON_DATABASE_URL: "postgresql://app-neon/database",
      DATABASE_URL: "postgresql://managed/database",
    };
    expect(selectApplicationDatabaseUrl(environment)).toBe(
      "postgresql://other-neon/database",
    );
    expect(databaseUrlFromEnvironment(environment)).toBe(
      "postgresql://other-neon/database",
    );
  });

  it("uses the primary Neon URL for schema migration operations", () => {
    expect(
      databaseUrlFromEnvironment({
        NEON_DATABASE_URL: "postgresql://app-neon/database",
        NEON_PRIMARY_URL: "postgresql://other-neon/database",
        DATABASE_URL: "postgresql://managed/database",
      }),
    ).toBe("postgresql://other-neon/database");
  });

  it("returns an empty string when neither supported target is configured", () => {
    expect(selectApplicationDatabaseUrl({})).toBe("");
  });
});
