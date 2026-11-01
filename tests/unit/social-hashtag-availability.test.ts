import fs from "node:fs";
import vm from "node:vm";
import express from "express";
import type { AddressInfo } from "node:net";
import ts from "typescript";
import { expect, it } from "vitest";
import { AIUnavailableError, requireMaxCore } from "../../server/lib/aiSource.js";
import { MaxCoreControlError } from "../../server/services/maxcoreControlTransport.js";

it("keeps unavailable hashtag generation retryable, unexpected failures500, and never fabricates trend metrics", async () => {
  const source = fs.readFileSync("server/routes/socialMedia.ts", "utf8");
  const tree = ts.createSourceFile("socialMedia.ts", source, ts.ScriptTarget.Latest, true);
  const routes = tree.statements.filter(node => ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
    node.expression.expression.getText(tree) === "router.get" && ts.isStringLiteral(node.expression.arguments[0]) &&
    node.expression.arguments[0].text === "/hashtags/trending");
  expect(routes).toHaveLength(1);
  let result: unknown = { data: { hashtags: ["#music", "producer"] } };
  let error: Error | undefined;
  const router = express.Router();
  vm.runInNewContext(ts.transpileModule(routes[0].getText(tree), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
    router, requireAuth: (req: express.Request, res: express.Response, next: () => void) => {
      if (!req.get("X-Fixture-Owner")) { res.status(401).end(); return; }
      req.user = { id: "owner" } as Express.User; next();
    }, storage: { getUser: async () => ({ genre: "music" }) },
    getUnifiedAI: async () => ({ generateContent: async () => { if (error) throw error; return result; } }),
    AIUnavailableError, MaxCoreControlError, requireMaxCore,
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay).unref(), logger: { warn() {} },
  });
  const app = express(); app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/hashtags/trending`;
    expect((await fetch(base)).status).toBe(401);
    const request = () => fetch(base, { headers: { "X-Fixture-Owner": "owner" } });
    expect(await (await request()).json()).toEqual([{ hashtag: "#music", category: "general" }, { hashtag: "#producer", category: "production" }]);
    error = new MaxCoreControlError("private model configuration", 503);
    const unavailable = await request();
    expect(unavailable.status).toBe(503);
    expect(await unavailable.json()).toMatchObject({ code: "AI_UNAVAILABLE", success: false });
    error = new Error("private unexpected bug");
    const broken = await request(); expect(broken.status).toBe(500);
    expect(await broken.text()).not.toContain("private unexpected bug");
    error = undefined; result = { data: { hashtags: [] } };
    expect((await request()).status).toBe(503);
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
