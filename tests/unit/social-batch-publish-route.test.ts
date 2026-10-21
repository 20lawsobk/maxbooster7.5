import fs from "node:fs";
import vm from "node:vm";
import type { AddressInfo } from "node:net";
import ts from "typescript";
import express from "express";
import { eq, and, inArray } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { posts } from "../../shared/schema";
import { expect, it } from "vitest";

it("routes batch publishing before post IDs, retains ownership and never claims unverified delivery", async () => {
  const source = fs.readFileSync("server/routes/socialMedia.ts", "utf8");
  const tree = ts.createSourceFile("socialMedia.ts", source, ts.ScriptTarget.Latest, true);
  const selected = tree.statements.filter(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(tree) === "router.post" && ts.isStringLiteral(node.expression.arguments[0]) &&
    ["/calendar/batch/publish", "/calendar/:postId/publish"].includes(node.expression.arguments[0].text));
  expect(selected).toHaveLength(2);
  const predicates: unknown[] = [];
  const chain = { where(predicate: unknown) { predicates.push(predicate); return chain; },
    limit: async () => [{ id: "fixture-post" }],
    then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve([{ id: "fixture-post" }]).then(resolve); } };
  const router = express.Router();
  const requireAuth = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const owner = req.get("X-Fixture-Owner");
    if (!owner) { res.status(401).json({ error: "Authentication required" }); return; }
    req.user = { id: owner } as Express.User; next();
  };
  vm.runInNewContext(ts.transpileModule(selected.map(node => node.getText(tree)).join("\n"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, { router, requireAuth, db: { select: () => ({ from: () => chain }) }, posts, eq, and, inArray, logger: { warn() {} } });
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/calendar`;
    const send = (path: string, body: unknown, owner?: string) => fetch(`${base}/${path}/publish`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(owner ? { "X-Fixture-Owner": owner } : {}) }, body: JSON.stringify(body),
    });
    expect((await send("batch", { postIds: ["fixture-post"] })).status).toBe(401);
    expect((await send("batch", {}, "owner-fixture")).status).toBe(400);
    expect(predicates).toHaveLength(0);
    const batch = await send("batch", { postIds: ["fixture-post"] }, "owner-fixture");
    expect(batch.status).toBe(409);
    expect(await batch.json()).toMatchObject({ postIds: ["fixture-post"] });
    const query = new PgDialect().sqlToQuery(predicates[0] as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.params).toEqual(["fixture-post", "owner-fixture"]);
    const single = await send("fixture-post", {}, "owner-fixture");
    expect(single.status).toBe(409);
    expect(await single.json()).toMatchObject({ postId: "fixture-post" });
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
