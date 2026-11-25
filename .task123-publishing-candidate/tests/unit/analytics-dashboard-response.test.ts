import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { expect, it } from "vitest";

it("the registered dashboard handler returns reported per-platform stream counts without inventing missing counts", async () => {
  const path = "server/routes.ts";
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  let handler = "";
  const find = (node: ts.Node) => {
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0]) &&
        node.arguments[0].text === "/api/analytics/dashboard{/:period}") {
      handler = node.arguments.at(-1)!.getText(source);
    }
    ts.forEachChild(node, find);
  };
  find(source);
  expect(handler).not.toBe("");
  const platformRows = [
    { platform: "Spotify", streams: "4000", revenue: "100" },
    { platform: "Measured zero", streams: "0", revenue: "0" },
    { platform: "Unknown", streams: null, revenue: "2" },
    { platform: "Invalid", streams: "invalid", revenue: "0" },
  ];
  const results = [[{ totalStreams: "4000", totalRevenue: "102", totalListeners: "500" }], [], platformRows, [{ total: "102" }], [{ total: "102" }]];
  const projections: Record<string, unknown>[] = [];
  const select = (projection: Record<string, unknown>) => {
    projections.push(projection);
    const rows = results.shift();
    const chain = { from: () => chain, where: () => chain, groupBy: () => chain, orderBy: () => chain,
      then: (resolve: (value: unknown) => void) => resolve(rows) };
    return chain;
  };
  const execute = vm.runInNewContext(ts.transpile(`const handler = ${handler}; handler;`, {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None,
  }), {
    db: { select }, analytics: {}, sql: () => "fixture-query", and: (...items: unknown[]) => items,
    eq: (...items: unknown[]) => items, gte: (...items: unknown[]) => items, lte: (...items: unknown[]) => items,
    desc: (value: unknown) => value, storage: { getProjectsByUserId: async () => [] }, logger: { warn() {} },
  });
  let body: any;
  let status = 200;
  const response = { status(code: number) { status = code; return this; }, json(value: unknown) { body = value; return this; } };
  await execute({ user: { id: "isolated-owner" }, params: {}, query: { range: "30d" } }, response);
  expect(status).toBe(200);
  expect(projections[2]).toHaveProperty("streams");
  expect(body.revenue.revenueByPlatform.map((row: { streams: unknown }) => row.streams)).toEqual([4000, 0, null, null]);
  expect(body.audience.newListeners).toBeNull();
  expect(body.audience.returningListeners).toBeNull();
});
