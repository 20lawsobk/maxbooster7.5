import fs from "node:fs";
import vm from "node:vm";
import type { AddressInfo } from "node:net";
import ts from "typescript";
import express from "express";
import { eq, or } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { marketplaceDisputes } from "../../shared/schema";
import { expect, it } from "vitest";

it("dispatches dispute stats before the ID route and scopes the actual SQL predicate to the owner", async () => {
  const source = fs.readFileSync("server/routes/contracts.ts", "utf8");
  const tree = ts.createSourceFile("contracts.ts", source, ts.ScriptTarget.Latest, true);
  const selected = tree.statements.filter(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(tree) === "router.get" && ts.isStringLiteral(node.expression.arguments[0]) &&
    ["/marketplace-disputes/stats", "/marketplace-disputes/:disputeId"].includes(node.expression.arguments[0].text));
  expect(selected).toHaveLength(2);
  const predicates: unknown[] = [];
  const chain = { where(predicate: unknown) { predicates.push(predicate); return chain; },
    limit: async () => [], then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve([]).then(resolve); } };
  const router = express.Router();
  vm.runInNewContext(ts.transpileModule(selected.map(node => node.getText(tree)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { router, db: { select: () => ({ from: () => chain }) }, marketplaceDisputes, eq, or,
    isAdminUser: () => false, canAccessDispute: () => false, logger: { warn() {} } });
  const app = express();
  app.use((req, _res, next) => {
    const owner = req.get("X-Fixture-Owner"); req.isAuthenticated = (() => Boolean(owner)) as typeof req.isAuthenticated;
    if (owner) req.user = { id: owner, role: "user" } as Express.User;
    next();
  });
  app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/marketplace-disputes`;
    expect((await fetch(`${base}/stats`)).status).toBe(401);
    expect(predicates).toHaveLength(0);
    const response = await fetch(`${base}/stats`, { headers: { "X-Fixture-Owner": "owner-a" } });
    expect(response.status).toBe(200);
    expect((await response.json()).stats.total).toBe(0);
    const query = new PgDialect().sqlToQuery(predicates[0] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.params).toEqual(["owner-a", "owner-a"]);
    expect(query.sql).toContain('"buyer_id"'); expect(query.sql).toContain('"seller_id"');
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
