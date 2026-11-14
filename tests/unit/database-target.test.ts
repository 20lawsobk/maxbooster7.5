import { describe, expect, it } from "vitest";
import { selectApplicationDatabaseUrl } from "../../server/config/databaseTarget.js";
import { databaseUrlFromEnvironment } from "../../scripts/migrate-dns-api-schema.mjs";

describe("application database target selection", () => {
  it("prefers the app's NEON_DATABASE_URL", () => {
    expect(
      selectApplicationDatabaseUrl({
        NEON_DATABASE_URL: "postgresql://app-neon/database",
        DATABASE_URL: "postgresql://managed/database",
      }),
    ).toBe("postgresql://app-neon/database");
  });

  it("uses DATABASE_URL only when NEON_DATABASE_URL is absent", () => {
    expect(
      selectApplicationDatabaseUrl({
        DATABASE_URL: "postgresql://managed/database",
      }),
    ).toBe("postgresql://managed/database");
  });

  it("ignores the separate legacy primary alias", () => {
    const environment = {
      NEON_PRIMARY_URL: "postgresql://other-neon/database",
      DATABASE_URL: "postgresql://managed/database",
    };
    expect(selectApplicationDatabaseUrl(environment)).toBe(
      "postgresql://managed/database",
    );
    expect(databaseUrlFromEnvironment(environment)).toBe(
      "postgresql://managed/database",
    );
  });

  it("uses NEON_DATABASE_URL for schema migration operations", () => {
    expect(
      databaseUrlFromEnvironment({
        NEON_DATABASE_URL: "postgresql://app-neon/database",
        NEON_PRIMARY_URL: "postgresql://other-neon/database",
        DATABASE_URL: "postgresql://managed/database",
      }),
    ).toBe("postgresql://app-neon/database");
  });

  it("returns an empty string when neither supported target is configured", () => {
    expect(selectApplicationDatabaseUrl({})).toBe("");
  });
});
