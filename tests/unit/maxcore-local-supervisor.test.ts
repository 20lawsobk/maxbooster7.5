import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import path from "node:path";

const env = process.env;

describe("MaxCore local supervisor", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    process.env = {
      ...env,
      MAXCORE_LOCAL: "1",
      SESSION_SECRET: "test-secret-test-secret-test-secret-1234",
    };
  });

  describe("withMaxcoreSchema (URL transformation)", () => {
    it("swaps the pooled Neon host for the unpooled host and appends search_path options", async () => {
      const { withMaxcoreSchema } = await import(
        "../../server/services/maxcoreLocalSupervisor.js"
      );
      const out = withMaxcoreSchema(
        "postgresql://u:p@ep-abc-123-pooler.us-east-2.aws.neon.tech/db?sslmode=require",
      );
      expect(out).toContain("ep-abc-123.us-east-2.aws.neon.tech");
      expect(out).not.toContain("-pooler.");
      expect(out).toContain(`options=${encodeURIComponent("-csearch_path=maxcore")}`);
      // Existing query string preserved with & separator
      expect(out).toContain("sslmode=require&options=");
    });

    it("uses ? separator when the URL has no query string and passes through empty input", async () => {
      const { withMaxcoreSchema } = await import(
        "../../server/services/maxcoreLocalSupervisor.js"
      );
      expect(withMaxcoreSchema("postgresql://u:p@host/db")).toBe(
        `postgresql://u:p@host/db?options=${encodeURIComponent("-csearch_path=maxcore")}`,
      );
      expect(withMaxcoreSchema("")).toBe("");
    });
  });

  describe("ensureMaxcoreSchema (fresh-DB bootstrap)", () => {
    it("creates the schema via an unpooled connection before Python can run DDL", async () => {
      const query = vi.fn().mockResolvedValue({});
      const connect = vi.fn().mockResolvedValue(undefined);
      const end = vi.fn().mockResolvedValue(undefined);
      let usedConnectionString = "";
      vi.doMock("pg", () => ({
        default: {
          Client: class {
            constructor(opts: { connectionString: string }) {
              usedConnectionString = opts.connectionString;
            }
            connect = connect;
            query = query;
            end = end;
          },
        },
      }));
      const { ensureMaxcoreSchema } = await import(
        "../../server/services/maxcoreLocalSupervisor.js"
      );
      const ok = await ensureMaxcoreSchema(
        "postgresql://u:p@ep-abc-pooler.neon.tech/db",
      );
      expect(ok).toBe(true);
      expect(usedConnectionString).not.toContain("-pooler.");
      expect(query).toHaveBeenCalledWith("CREATE SCHEMA IF NOT EXISTS maxcore");
      expect(end).toHaveBeenCalled();
    });

    it("returns false (non-fatal) when the database is unreachable", async () => {
      vi.doMock("pg", () => ({
        default: {
          Client: class {
            connect = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
            query = vi.fn();
            end = vi.fn();
          },
        },
      }));
      const { ensureMaxcoreSchema } = await import(
        "../../server/services/maxcoreLocalSupervisor.js"
      );
      expect(await ensureMaxcoreSchema("postgresql://u:p@host/db")).toBe(false);
    });

    it("skips empty URLs", async () => {
      const { ensureMaxcoreSchema } = await import(
        "../../server/services/maxcoreLocalSupervisor.js"
      );
      expect(await ensureMaxcoreSchema("")).toBe(false);
    });
  });

  describe("checkMaxcoreLocalReady (Python-aware readiness)", () => {
    it("is ready only when the Python-backed /api/health reports healthy", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: "healthy", model_loaded: true }),
      });
      vi.stubGlobal("fetch", fetchMock);
      const { checkMaxcoreLocalReady } = await import(
        "../../server/services/maxcoreLocalSupervisor.js"
      );
      expect(await checkMaxcoreLocalReady()).toBe(true);
      expect(String(fetchMock.mock.calls[0][0])).toContain("/api/health");
    });

    it("is NOT ready when the Node layer answers but Python is down", async () => {
      // /api/health proxies Python; while Python crash-loops it returns non-healthy.
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ status: "starting" }),
        }),
      );
      const { checkMaxcoreLocalReady } = await import(
        "../../server/services/maxcoreLocalSupervisor.js"
      );
      expect(await checkMaxcoreLocalReady()).toBe(false);
    });

    it("is NOT ready when nothing is listening", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("ECONNREFUSED")));
      const { checkMaxcoreLocalReady } = await import(
        "../../server/services/maxcoreLocalSupervisor.js"
      );
      expect(await checkMaxcoreLocalReady()).toBe(false);
    });
  });

  // Regression coverage for the deploy-time race: external/maxcore is
  // stripped from the build image and restored by a detached background
  // process that can still be mid-flight when startMaxcoreLocal() first
  // runs. The old code treated "TSX_BIN missing" as unconditionally "clean
  // checkout, run the one-shot bootstrap script", which fails instantly on
  // a missing directory and permanently latched a fatal error with no retry.
  describe("startMaxcoreLocal (workspace provisioning race)", () => {
    const CWD = process.cwd();
    const TSX_BIN = path.join(
      CWD,
      "external",
      "maxcore",
      "artifacts",
      "api-server",
      "node_modules",
      ".bin",
      "tsx",
    );
    const CAPSULE = path.resolve(CWD, "external_maxcore.pdim");
    const BOOTSTRAP_SCRIPT = path.resolve(CWD, "scripts", "bootstrap-maxcore.sh");

    function fakeProc() {
      const proc = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
        pid?: number;
        kill: (signal?: string) => void;
      };
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();
      proc.kill = vi.fn();
      return proc;
    }

    it("waits and does not run the bootstrap script when the workspace is absent but a restore capsule is present", async () => {
      const existsSyncMock = vi.fn((p) => String(p) === CAPSULE);
      vi.doMock("node:fs", () => ({ default: { existsSync: existsSyncMock } }));
      const spawnMock = vi.fn(() => fakeProc());
      vi.doMock("node:child_process", () => ({ spawn: spawnMock }));

      const { startMaxcoreLocal, getMaxcoreLocalStatus, stopMaxcoreLocal } =
        await import("../../server/services/maxcoreLocalSupervisor.js");

      await startMaxcoreLocal();

      const status = getMaxcoreLocalStatus();
      expect(status.running).toBe(false);
      expect(status.error).toMatch(/background capsule restore still in progress/);
      // Must never attempt the one-shot bootstrap script while a restore is
      // plausibly still landing the workspace — it would just fail instantly.
      expect(spawnMock).not.toHaveBeenCalled();

      stopMaxcoreLocal(); // cancels the scheduled retry so it can't fire after the test ends
    });

    it("keeps a retryable error and re-attempts bootstrap on every call instead of latching a permanent failure", async () => {
      const existsSyncMock = vi.fn((p) => String(p) === BOOTSTRAP_SCRIPT);
      vi.doMock("node:fs", () => ({ default: { existsSync: existsSyncMock } }));
      const spawnMock = vi.fn(() => {
        const proc = fakeProc();
        queueMicrotask(() => proc.emit("exit", 1));
        return proc;
      });
      vi.doMock("node:child_process", () => ({ spawn: spawnMock }));

      const { startMaxcoreLocal, getMaxcoreLocalStatus, stopMaxcoreLocal } =
        await import("../../server/services/maxcoreLocalSupervisor.js");

      await startMaxcoreLocal();
      let status = getMaxcoreLocalStatus();
      expect(status.running).toBe(false);
      expect(status.error).toMatch(/workspace bootstrap failed/);
      expect(spawnMock).toHaveBeenCalledTimes(1);

      // Stands in for the scheduled retry timer firing again later: a fresh
      // call must behave identically, not silently no-op because an earlier
      // attempt already failed once (the old bug's permanent latch).
      await startMaxcoreLocal();
      status = getMaxcoreLocalStatus();
      expect(status.error).toMatch(/workspace bootstrap failed/);
      expect(spawnMock).toHaveBeenCalledTimes(2);

      stopMaxcoreLocal(); // cancels the scheduled retry so it can't fire after the test ends
    });

    it("still spawns immediately and clears prior error state when the workspace is already installed", async () => {
      const existsSyncMock = vi.fn((p) => String(p) === TSX_BIN);
      vi.doMock("node:fs", () => ({ default: { existsSync: existsSyncMock } }));
      vi.doMock("pg", () => ({
        default: {
          Client: class {
            connect = vi.fn().mockResolvedValue(undefined);
            query = vi.fn().mockResolvedValue({});
            end = vi.fn().mockResolvedValue(undefined);
          },
        },
      }));
      const proc = fakeProc();
      proc.pid = 424242;
      const spawnMock = vi.fn(() => proc);
      vi.doMock("node:child_process", () => ({ spawn: spawnMock }));

      const { startMaxcoreLocal, getMaxcoreLocalStatus, stopMaxcoreLocal } =
        await import("../../server/services/maxcoreLocalSupervisor.js");

      await startMaxcoreLocal();

      const status = getMaxcoreLocalStatus();
      expect(status.error).toBeNull();
      expect(status.running).toBe(true);
      expect(status.pid).toBe(424242);
      expect(spawnMock).toHaveBeenCalledTimes(1);

      stopMaxcoreLocal();
    });
  });
});
