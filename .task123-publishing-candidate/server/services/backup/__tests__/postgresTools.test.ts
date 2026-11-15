import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  dumpedServerMajor,
  parsePostgresClientVersion,
  postgresConnectionEnvironment,
  safePostgresDiagnostic,
  selectPgDumpForServer,
  selectPsqlForRestore,
} from "../postgresTools.js";

function mockSpawn(versions: Record<string, string>, serverVersion = "170011\n") {
  return vi.fn((command: string, args: string[]) => {
    const child = new EventEmitter() as any;
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = vi.fn();
    queueMicrotask(() => {
      if (args.includes("--version")) child.stdout.end(versions[command] ?? "");
      else child.stdout.end(serverVersion);
      child.stderr.end();
      child.emit("close", 0);
    });
    return child;
  });
}

function dependencies(spawn: ReturnType<typeof mockSpawn>) {
  const paths = ["/old", "/new"];
  return {
    spawn: spawn as any,
    env: { PATH: paths.join(":") },
    access: vi.fn(async () => undefined) as any,
    realpath: vi.fn(async (value: string) => value) as any,
  };
}

describe("PostgreSQL backup tool selection", () => {
  it("selects the compatible pg_dump rather than the first PATH client", async () => {
    const spawn = mockSpawn({
      "/old/psql": "psql (PostgreSQL) 16.10\n",
      "/new/psql": "psql (PostgreSQL) 17.5\n",
      "/old/pg_dump": "pg_dump (PostgreSQL) 16.10\n",
      "/new/pg_dump": "pg_dump (PostgreSQL) 17.5\n",
    });
    const selected = await selectPgDumpForServer(
      "postgresql://user:secret@example.invalid/db",
      dependencies(spawn),
    );
    expect(selected.serverMajor).toBe(17);
    expect(selected.tool.path).toBe("/new/pg_dump");
    expect(spawn).toHaveBeenCalledWith(
      "/new/psql",
      expect.arrayContaining(["SHOW server_version_num"]),
      expect.objectContaining({ env: expect.objectContaining({
        PGHOST: "example.invalid",
        PGDATABASE: "db",
        PGUSER: "user",
        PGPASSWORD: "secret",
      }) }),
    );
  });

  it("fails explicitly when only an older dump client exists", async () => {
    const spawn = mockSpawn({
      "/old/psql": "psql (PostgreSQL) 16.10\n",
      "/new/psql": "psql (PostgreSQL) 17.5\n",
      "/old/pg_dump": "pg_dump (PostgreSQL) 16.10\n",
      "/new/pg_dump": "not postgres\n",
    });
    await expect(selectPgDumpForServer(
      "postgresql://user:do-not-print@example.invalid/db",
      dependencies(spawn),
    )).rejects.toThrow("No compatible pg_dump for PostgreSQL server major 17");
  });

  it("validates target and restore client majors", async () => {
    const spawn = mockSpawn({
      "/old/psql": "psql (PostgreSQL) 16.10\n",
      "/new/psql": "psql (PostgreSQL) 17.5\n",
    });
    const selected = await selectPsqlForRestore(
      "postgresql://target.invalid/isolated",
      17,
      dependencies(spawn),
    );
    expect(selected.tool.path).toBe("/new/psql");
  });

  it("rejects downgrade restores and reads source major from a dump", async () => {
    expect(dumpedServerMajor("-- PostgreSQL database dump\n-- Dumped from database version 17.11\n")).toBe(17);
    const spawn = mockSpawn({
      "/old/psql": "psql (PostgreSQL) 16.10\n",
      "/new/psql": "psql (PostgreSQL) 17.5\n",
    }, "160010\n");
    await expect(selectPsqlForRestore(
      "postgresql://target.invalid/isolated",
      17,
      dependencies(spawn),
    )).rejects.toThrow("older than dump source major 17");
  });

  it("parses the installed client versions", () => {
    expect(parsePostgresClientVersion("pg_dump (PostgreSQL) 17.5")).toEqual({
      major: 17,
      version: "17.5",
    });
  });

  it("redacts credentials from bounded diagnostics", () => {
    const diagnostic = safePostgresDiagnostic(
      "failed postgresql://operator:secret@example.invalid/db password=secret",
    );
    expect(diagnostic).not.toContain("operator:secret");
    expect(diagnostic).not.toContain("password=secret");
    expect(diagnostic).toContain("[database-url-redacted]");
  });

  it("maps a URI to discrete libpq environment variables", () => {
    expect(postgresConnectionEnvironment(
      "postgresql://user:secret@db.example.invalid:5433/catalog?sslmode=require&channel_binding=require",
    )).toEqual({
      PGHOST: "db.example.invalid",
      PGPORT: "5433",
      PGUSER: "user",
      PGPASSWORD: "secret",
      PGDATABASE: "catalog",
      PGSSLMODE: "require",
      PGCHANNELBINDING: "require",
    });
  });

  it("preserves percent-encoded libpq identity overrides", () => {
    expect(postgresConnectionEnvironment(
      "postgresql://uri-user:uri-pass@original.invalid:5432/original?" +
      "h%6Fst=override.invalid&hostaddr=192.0.2.10&p%6Frt=6432&db%6Eame=actual&user=query-user",
    )).toEqual({
      PGHOST: "override.invalid",
      PGHOSTADDR: "192.0.2.10",
      PGPORT: "6432",
      PGUSER: "query-user",
      PGPASSWORD: "uri-pass",
      PGDATABASE: "actual",
    });
  });

  it("passes an IPv6 URI host to libpq without URL brackets", () => {
    expect(postgresConnectionEnvironment(
      "postgresql://user:secret@[2001:db8::1]:5433/catalog",
    )).toEqual({
      PGHOST: "2001:db8::1",
      PGPORT: "5433",
      PGUSER: "user",
      PGPASSWORD: "secret",
      PGDATABASE: "catalog",
    });
  });

  it("rejects unsupported URI parameters instead of changing connection semantics", () => {
    expect(() => postgresConnectionEnvironment(
      "postgresql://user:secret@db.example.invalid/catalog?unknown_option=value",
    )).toThrow("Unsupported PostgreSQL connection parameter: unknown_option");
  });

  it("uses fallback_application_name only when application_name is absent", () => {
    expect(postgresConnectionEnvironment(
      "postgresql://user:secret@db.example.invalid/catalog?" +
      "application_name=primary&fallback_application_name=fallback",
    ).PGAPPNAME).toBe("primary");
    expect(postgresConnectionEnvironment(
      "postgresql://user:secret@db.example.invalid/catalog?fallback_application_name=fallback",
    ).PGAPPNAME).toBe("fallback");
  });
});