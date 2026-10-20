import { readFileSync } from "node:fs";
import ts from "typescript";
import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { expect, it } from "vitest";
import { normalizeDashboardCountdowns, readDashboardJson } from "../../client/src/components/dashboard/dashboardDataContracts";

it("shares the countdown response cache while selecting an array for Dashboard", () => {
  const source = readFileSync("client/src/pages/Dashboard.tsx", "utf8");
  const ast = ts.createSourceFile("Dashboard.tsx", source, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TSX);
  let options: ts.Node | undefined;
  function visit(node: ts.Node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "UpcomingReleasesSection") {
      function find(child: ts.Node) {
        if (ts.isCallExpression(child) && child.expression.getText(ast) === "useQuery") options = child.arguments[0];
        ts.forEachChild(child, find);
      }
      find(node);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (!options) throw new Error("Dashboard countdown query options missing");
  const code = ts.transpileModule(`return (${options.getText(ast)});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const query = new Function("apiRequest", "readDashboardJson", "normalizeDashboardCountdowns", code)(
    () => { throw new Error("Unexpected network request"); }, readDashboardJson, normalizeDashboardCountdowns,
  );
  const client = new QueryClient();
  const envelope = { success: true, data: [{ id: "release", title: "Upcoming", releaseDate: "2027-01-01T00:00:00.000Z" }] };
  client.setQueryData(["/api/countdowns"], envelope);
  const observer = new QueryObserver(client, query);
  expect(observer.getCurrentResult().data).toEqual(envelope.data);
  expect(client.getQueryData(["/api/countdowns"])).toBe(envelope);
  observer.destroy();
  client.clear();
});
