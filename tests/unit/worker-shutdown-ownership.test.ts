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

  it("does not respawn cleanly exited MaxCore workers after primary shutdown", () => {
    const source = fs.readFileSync(
      "external/maxcore/artifacts/api-server/src/index.ts",
      "utf8",
    );
    const ast = ts.createSourceFile("index.ts", source, ts.ScriptTarget.Latest, true);
    let exitHandler: ts.ArrowFunction | undefined;
    let shutdownHandler: ts.ArrowFunction | undefined;
    const visit = (node: ts.Node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
        && node.expression.expression.getText(ast) === "cluster"
        && node.expression.name.text === "on"
        && node.arguments[0]?.getText(ast) === '"exit"'
        && ts.isArrowFunction(node.arguments[1])) {
        exitHandler = node.arguments[1];
      }
      if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "shutdown"
        && node.initializer && ts.isArrowFunction(node.initializer)) {
        const body = node.initializer.body.getText(ast);
        if (body.includes("cluster.workers") && body.includes("stopPythonServer")) {
          shutdownHandler = node.initializer;
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(ast);

    expect(exitHandler).toBeDefined();
    expect(exitHandler!.body.getText(ast)).toContain("shutdownRequested");
    expect(shutdownHandler).toBeDefined();
    const shutdownBody = shutdownHandler!.body.getText(ast);
    expect(shutdownBody.indexOf("shutdownRequested = true")).toBeGreaterThanOrEqual(0);
    expect(shutdownBody.indexOf("cluster.workers")).toBeGreaterThan(
      shutdownBody.indexOf("shutdownRequested = true"),
    );
  });
});
