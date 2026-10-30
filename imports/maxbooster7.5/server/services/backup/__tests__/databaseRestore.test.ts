import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { runDatabaseRestore } from "../databaseRestore.js";

const target = "postgresql://operator:fixture-secret@127.0.0.1:6543/recovery";
function realProcess(script: string) {
  let child: ChildProcess;
  let closed = false;
  const spawnImpl = vi.fn((_command: string, _args: readonly string[], options: SpawnOptions) => {
    child = spawn(process.execPath, ["-e", script], options);
    child.once("close", () => { closed = true; });
    return child;
  });
  return { spawnImpl, isClosed: () => closed, child: () => child! };
}

describe("bounded database restore process", () => {
  it("accepts a completed process and passes credentials only in discrete libpq environment", async () => {
    const fixture = realProcess("process.exit(0)");
    await runDatabaseRestore("psql-fixture", ["-X", "-f", "/tmp/private.sql"], target,
      { spawn: fixture.spawnImpl as typeof spawn });
    expect(fixture.isClosed()).toBe(true);
    expect(fixture.spawnImpl).toHaveBeenCalledWith("psql-fixture", ["-X", "-f", "/tmp/private.sql"],
      expect.objectContaining({ shell: false, env: expect.objectContaining({
        PGHOST: "127.0.0.1", PGPORT: "6543", PGDATABASE: "recovery", PGPASSWORD: "fixture-secret",
      }) }));
  });

  it("bounds a real hung process and confirms close before rejecting", async () => {
    const fixture = realProcess("setInterval(()=>{},1000)");
    await expect(runDatabaseRestore("psql-fixture", [], target, {
      spawn: fixture.spawnImpl as typeof spawn, timeoutMs: 250, terminationGraceMs: 100,
    })).rejects.toThrow("timed out");
    expect(fixture.isClosed()).toBe(true);
  });

  it("kills a real diagnostic flood without retaining unlimited output", async () => {
    const fixture = realProcess("process.stderr.write('x'.repeat(32768));setInterval(()=>{},1000)");
    await expect(runDatabaseRestore("psql-fixture", [], target, {
      spawn: fixture.spawnImpl as typeof spawn, timeoutMs: 2000, terminationGraceMs: 100,
    })).rejects.toThrow("diagnostic output limit");
    expect(fixture.isClosed()).toBe(true);
  });

  it("redacts a failing process diagnostic", async () => {
    const fixture = realProcess("process.stderr.write('postgresql://operator:fixture-secret@db/recovery password=another-secret');process.exit(1)");
    const failure = await runDatabaseRestore("psql-fixture", [], target,
      { spawn: fixture.spawnImpl as typeof spawn }).catch(error => error as Error);
    expect(failure).toBeInstanceOf(Error);
    expect(String(failure)).toContain("code 1");
    expect(String(failure)).not.toMatch(/fixture-secret|another-secret/);
  });

  it("fails promptly when psql cannot start", async () => {
    await expect(runDatabaseRestore("/nonexistent/max-booster-psql-fixture", [], target))
      .rejects.toThrow("Database restore process failed");
  });

  it("escalates TERM-resistant children to KILL", async () => {
    const fixture = realProcess("process.on('SIGTERM',()=>{});setInterval(()=>{},1000)");
    await expect(runDatabaseRestore("psql-fixture", [], target, {
      spawn: fixture.spawnImpl as typeof spawn, timeoutMs: 500, terminationGraceMs: 100,
    })).rejects.toThrow("timed out");
    expect(fixture.isClosed()).toBe(true);
    expect(fixture.child().signalCode).toBe("SIGKILL");
  });

  it("reports unconfirmed teardown with bounded failure instead of hanging forever", async () => {
    const child = new EventEmitter() as ChildProcess;
    child.stderr = new PassThrough();
    child.kill = vi.fn(() => false);
    await expect(runDatabaseRestore("psql-fixture", [], target, {
      spawn: (() => child) as typeof spawn, timeoutMs: 10, terminationGraceMs: 10,
    })).rejects.toThrow("termination was not confirmed");
    expect(child.kill).toHaveBeenNthCalledWith(1, "SIGTERM");
    expect(child.kill).toHaveBeenNthCalledWith(2, "SIGKILL");
  });
});
