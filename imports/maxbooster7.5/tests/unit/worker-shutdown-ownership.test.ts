import { describe, expect, it } from "vitest";
import fs from "node:fs";
import ts from "typescript";

describe("embedded worker shutdown ownership", () => {
  it("the imported drain cannot terminate the application", () => {
    const source = fs.readFileSync("server/workers/index.ts", "utf8");
    const ast = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
    const drain = ast.statements.find(node =>
      ts.isFunctionDeclaration(node) && node.name?.text === "gracefulShutdown");
    expect(drain).toBeDefined();
    expect(drain!.getText(ast)).not.toContain("process.exit");
    expect(drain!.getText(ast)).toContain("throw error");
    const guarded = ast.statements.find(node =>
      ts.isIfStatement(node) &&
      node.expression.getText(ast).includes('includes("workers/index")') &&
      node.getText(ast).includes('process.on(signal'));
    expect(guarded).toBeDefined();
  });
});
