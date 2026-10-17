import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";
import { sql, eq, and, desc, asc } from "drizzle-orm";

// Execute real method bodies without initializing the shared application DB.
const source = readFileSync("server/storage.ts", "utf8");
const file = ts.createSourceFile("storage.ts", source, ts.ScriptTarget.Latest, true);
function method(name: string, database?: object) {
  let found: ts.MethodDeclaration | undefined;
  function visit(node: ts.Node) {
    if (ts.isMethodDeclaration(node) && node.name.getText(file) === name) found = node;
    ts.forEachChild(node, visit);
  }
  visit(file);
  if (!found) throw new Error(`Missing storage method: ${name}`);
  const js = ts.transpileModule(`class Subject { ${found.getText(file)} }`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const failure = new Error("isolated database failure");
  const fail = () => { throw failure; };
  const db = database ?? new Proxy({}, { get: () => fail });
  const logger = { warn: vi.fn() };
  const Subject = new Function("db", "dbRead", "logger", "listings", "users", "orders", "sql", "eq", "and", "desc", "asc",
    `${js}; return Subject;`)(db, db, logger, {}, {}, {}, sql, eq, and, desc, asc);
  return { instance: new Subject(), failure, logger };
}

describe("marketplace storage failure visibility", () => {
  it("preserves an authentic empty producer result", async () => {
    const { instance } = method("getProducers", { execute: async () => ({ rows: [] }) });
    await expect(instance.getProducers()).resolves.toEqual([]);
  });
  it("does not disguise a malformed database reply as an empty producer list", async () => {
    const { instance } = method("getProducers", { execute: async () => ({ unexpected: true }) });
    await expect(instance.getProducers()).rejects.toThrow("Invalid producer query result");
  });
  it.each(["getProducers", "getBeatListings", "getUserOrders", "getSellerOrders"])(
    "%s propagates unavailable storage instead of successful empty history", async name => {
      const { instance, failure, logger } = method(name);
      await expect(instance[name]()).rejects.toBe(failure);
      expect(logger.warn).toHaveBeenCalledTimes(1);
      // The original error is retained in structured logging, not API payloads.
      expect(logger.warn.mock.calls[0][0]).toHaveProperty("err");
    },
  );
});
