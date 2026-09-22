import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import {
  dumpedServerMajor,
  parsePostgresClientVersion,
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
      expect.objectContaining({ env: expect.objectContaining({ PGDATABASE: expect.any(String) }) }),
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
});