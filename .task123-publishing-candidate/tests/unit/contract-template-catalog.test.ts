import fs from "node:fs";
import vm from "node:vm";
import express from "express";
import type { AddressInfo } from "node:net";
import ts from "typescript";
import { expect, it } from "vitest";

it("lists the real built-in catalog on a fresh database, preserves stored overrides and category filters", async () => {
  const source = fs.readFileSync("server/routes/contracts.ts", "utf8");
  const tree = ts.createSourceFile("contracts.ts", source, ts.ScriptTarget.Latest, true);
  const selected = tree.statements.filter(node =>
    (ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => declaration.name.getText(tree) === "toTemplateResponse")) ||
    (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) && node.expression.expression.getText(tree) === "router.get" &&
     ts.isStringLiteral(node.expression.arguments[0]) && node.expression.arguments[0].text === "/templates"));
  expect(selected).toHaveLength(2);
  const definitions = fs.readFileSync("server/services/contractTemplateService.ts", "utf8");
  const definitionTree = ts.createSourceFile("templates.ts", definitions, ts.ScriptTarget.Latest, true);
  const declaration = definitionTree.statements.find(node => ts.isVariableStatement(node) &&
    node.declarationList.declarations.some(value => value.name.getText(definitionTree) === "contractTemplates"));
  expect(declaration).toBeDefined();
  const compile = (text: string) => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const builtins = vm.runInNewContext(compile(`${declaration!.getText(definitionTree)}\ncontractTemplates;`)) as { id: string; category: string }[];
  expect(builtins.length).toBeGreaterThan(0);
  let rows: unknown[] = [];
  let failure = false;
  const router = express.Router();
  vm.runInNewContext(compile(selected.map(node => node.getText(tree)).join("\n")), {
    router, requireAuth: (_req: unknown, _res: unknown, next: () => void) => next(),
    db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => {
      if (failure) throw new Error("private database failure");
      return rows;
    } }) }) }) }, contractTemplates: { isDefault: "is_default" }, eq: () => true,
    contractTemplateService: { getTemplates: () => builtins }, logger: { warn() {} },
  });
  const app = express(); app.use(router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/templates`;
    const fresh = await fetch(base);
    expect(fresh.status).toBe(200);
    const catalog = await fresh.json();
    expect(catalog.templates.map((item: { id: string }) => item.id)).toEqual(builtins.map(item => item.id));
    expect(catalog.categories).toEqual([...new Set(builtins.map(item => item.category))]);
    rows = [{ id: builtins[0].id, name: "Stored override", content: "nda", category: "Stored", variables: [] }];
    const override = await (await fetch(base)).json();
    expect(override.templates).toHaveLength(builtins.length);
    expect(override.templates[0]).toMatchObject({ id: builtins[0].id, name: "Stored override", type: "nda" });
    const filtered = await (await fetch(`${base}?category=Stored`)).json();
    expect(filtered.templates).toHaveLength(1);
    expect(filtered.templates[0].name).toBe("Stored override");
    failure = true;
    const unavailable = await fetch(base);
    expect(unavailable.status).toBe(500);
    expect(await unavailable.text()).not.toContain("private database failure");
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
