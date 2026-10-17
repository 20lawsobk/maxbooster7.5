import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { transformSync } from "esbuild";
import { expect, it } from "vitest";

it("performs concurrent dispatch creates and status changes inside the locked transaction", async () => {
  // Exercise the actual storage methods without importing the app's startup or
  // connecting to its shared Neon database. This models transaction ordering;
  // it is not a PostgreSQL integration test.
  const source = readFileSync("server/storage.ts", "utf8");
  const methods = source.slice(source.indexOf("  private _dispatchSettingKey("),
    source.indexOf("  async createAuditLog("));
  const compiled = transformSync(`class Subject { ${methods} }`, { loader: "ts" }).code;
  let row: any;
  let tail = Promise.resolve();
  let transactions = 0;
  const db = {
    transaction(callback: (tx: any) => Promise<unknown>) {
      const job = tail.then(async () => {
        transactions++;
        let locked = false;
        const tx = {
          execute: async (query: string) => {
            expect(query).toContain("pg_advisory_xact_lock");
            locked = true;
          },
          select: () => ({
            from: () => ({ where: () => ({ limit: async () => {
              expect(locked).toBe(true);
              return row ? [structuredClone(row)] : [];
            } }) }),
          }),
          insert: () => ({ values: async (data: any) => { row = structuredClone(data); } }),
          update: () => ({ set: (data: any) => ({ where: async () => {
            row = { ...row, ...structuredClone(data) };
          } }) }),
        };
        return callback(tx);
      });
      tail = job.then(() => undefined, () => undefined);
      return job;
    },
  };
  const sql = (chunks: TemplateStringsArray) => chunks.join("?");
  const Subject = new Function("db", "sql", "systemSettings", "eq", "and", "randomBytes",
    `${compiled}; return Subject;`)(db, sql, { key: "key", id: "id" }, () => null, () => null, randomBytes);
  const storage = new Subject();
  await Promise.all(Array.from({ length: 20 }, (_, i) =>
    storage.createDistroDispatch({ releaseId: "release-a", platform: `platform-${i}`, status: "submitted" })));
  expect(row.value).toHaveLength(20);
  await Promise.all(Array.from({ length: 20 }, (_, i) =>
    storage.updateDistroDispatchStatus("release-a", { platform: `platform-${i}`, status: "live" })));
  expect(transactions).toBe(40);
  expect(row.value).toHaveLength(20);
  expect(row.value.every((entry: any) => entry.status === "live")).toBe(true);
});
