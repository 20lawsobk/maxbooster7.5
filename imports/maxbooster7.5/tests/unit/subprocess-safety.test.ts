import { describe, expect, it } from "vitest";
import {
  assertSafeSpawnArguments,
  isSamePostgresDatabase,
  postgresDatabaseIdentity,
  restrictedChildEnvironment,
  validatePostgresConnectionUrl,
} from "../../server/services/subprocessSafety.js";

describe("subprocess safety", () => {
  it("rejects control characters in arguments and environment values", () => {
    expect(() => assertSafeSpawnArguments(["safe", "bad\u0000value"])).toThrow(
      "control character",
    );
    expect(() =>
      restrictedChildEnvironment({ PGDATABASE: "postgresql://db/app\nPGOPTIONS=x" }),
    ).toThrow("control character");
  });

  it("inherits only the environment needed to locate tools and trust stores", () => {
    const environment = restrictedChildEnvironment(
      { PGDATABASE: "postgresql://db/app" },
      {
        PATH: "/usr/bin",
        HOME: "/tmp/home",
        NODE_OPTIONS: "--require=/tmp/untrusted.js",
        PGOPTIONS: "-c search_path=untrusted",
        PGSERVICE: "redirect",
      },
    );
    expect(environment).toEqual({
      PATH: "/usr/bin",
      HOME: "/tmp/home",
      PGDATABASE: "postgresql://db/app",
    });
  });

  it("accepts ordinary PostgreSQL TLS URLs but rejects libpq redirection", () => {
    expect(
      validatePostgresConnectionUrl(
        "postgresql://operator:secret@restore.example/db?sslmode=require",
      ),
    ).toBe(
      "postgresql://operator:secret@restore.example/db?sslmode=require",
    );
    for (const url of [
      "https://restore.example/db",
      "postgresql:///db",
      "postgresql://restore.example/db?host=%2Ftmp",
      "postgresql://restore.example/db?options=-c%20search_path%3Devil",
      "postgresql://restore.example/db?OPTIONS=-c%20search_path%3Devil",
      "postgresql://restore.example/db?service=redirect",
      "postgresql://restore.example/scratch?dbname=production",
      "postgresql://restore.example/scratch?%64bname=production",
      "postgresql://restore.example/db?port=6432",
      "postgresql://restore.example/db?%70ort=6432",
      "postgresql://restore.example/db%0aPGOPTIONS=evil",
    ]) {
      expect(() => validatePostgresConnectionUrl(url)).toThrow();
    }
  });

  it("canonicalizes the actual libpq host, port, and database identity", () => {
    expect(postgresDatabaseIdentity("postgresql://DB.EXAMPLE./production")).toEqual(
      { host: "db.example", port: "5432", database: "production" },
    );
    expect(
      postgresDatabaseIdentity(
        "postgresql://db.example:6432/scratch?%64bname=production&%70ort=5432",
      ),
    ).toEqual({ host: "db.example", port: "5432", database: "production" });
    expect(
      postgresDatabaseIdentity("postgresql://db.example:5432/%70roduction"),
    ).toEqual({ host: "db.example", port: "5432", database: "production" });
    expect(
      postgresDatabaseIdentity("postgresql://db.example:05432/production"),
    ).toEqual(
      postgresDatabaseIdentity("postgresql://DB.EXAMPLE.:5432/production"),
    );
    expect(
      isSamePostgresDatabase(
        "postgresql://DB.EXAMPLE./production",
        "postgresql://db.example:5432/%70roduction",
      ),
    ).toBe(true);
    expect(
      isSamePostgresDatabase(
        "postgresql://db.example/production",
        "postgresql://db.example:6432/production",
      ),
    ).toBe(false);
  });
});