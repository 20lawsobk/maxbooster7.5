import { beforeEach, describe, expect, it, vi } from "vitest";

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
});
