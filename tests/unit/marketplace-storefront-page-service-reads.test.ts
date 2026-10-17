import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Extract only the real read methods/registered handlers. Do not import the
// service module: its imports initialize provider/payment/database singletons.
const serviceSource = readFileSync("server/services/marketplaceService.ts", "utf8");
const routeSource = readFileSync("server/routes/marketplace.ts", "utf8");
const readMethods = [
  "getListing", "browseListings", "getUserOrders", "getUserSales",
  "getUserListings", "getListingsByProducer", "getUserPurchases", "getSalesAnalytics",
];
const logger = { warn: vi.fn() };
const outage = () => { throw new Error("private provider details"); };

function compile(source: string, globals: Record<string, unknown>) {
  const javascript = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  return vm.runInNewContext(javascript, globals);
}

function readService(overrides: Record<string, unknown> = {}, db = { select: outage }) {
  const file = ts.createSourceFile("service.ts", serviceSource, ts.ScriptTarget.Latest, true);
  const declaration = file.statements.find((node) => ts.isClassDeclaration(node) && node.name?.text === "MarketplaceService") as ts.ClassDeclaration;
  const methods = declaration.members.filter((node) => ts.isMethodDeclaration(node) && readMethods.includes(node.name.getText(file)));
  expect(methods).toHaveLength(readMethods.length);
  return compile(`class ReadService { ${methods.map((method) => method.getText(file)).join("\n")} }\nnew ReadService();`, {
    storage: {
      getBeatListing: async () => null,
      getBeatListings: async () => [],
      getUser: async () => ({ id: "owner", username: "Owner" }),
      getUserOrders: async () => [],
      getSellerOrders: async () => [],
      ...overrides,
    },
    db, logger,
    toServiceOrder: (row: unknown) => row,
    listingLicenseTiers: { listingId: "listingId", sortOrder: "sortOrder" },
    eq: () => ({}),
  });
}

function routeHandler(path: string, service: Record<string, unknown>) {
  const file = ts.createSourceFile("routes.ts", routeSource, ts.ScriptTarget.Latest, true);
  const statement = file.statements.find((node) => {
    if (!ts.isExpressionStatement(node) || !ts.isCallExpression(node.expression)) return false;
    const call = node.expression;
    return call.expression.getText(file) === "router.get" &&
      ts.isStringLiteral(call.arguments[0]) && call.arguments[0].text === path;
  }) as ts.ExpressionStatement;
  if (!statement) throw new Error(`Missing registered GET ${path}`);
  const call = statement.expression as ts.CallExpression;
  const handler = call.arguments[call.arguments.length - 1];
  return compile(`(${handler.getText(file)});`, {
    marketplaceService: service,
    storage: { getUser: async () => ({ id: "producer" }) },
    distributedCache: { getOrSet: async (_key: string, load: () => unknown) => load() },
    absolutizeMaxcoreMediaUrls: (data: unknown) => data,
    logger, Math, String, Number,
  });
}

describe("marketplace read failure truthfulness", () => {
  it.each([
    ["getListing", "getBeatListing", "Failed to fetch listing"],
    ["browseListings", "getBeatListings", "Failed to browse listings"],
    ["getUserOrders", "getUserOrders", "Failed to fetch user orders"],
    ["getUserSales", "getSellerOrders", "Failed to fetch user sales"],
    ["getUserListings", "getBeatListings", "Failed to fetch user listings"],
    ["getListingsByProducer", "getBeatListings", "Failed to fetch producer listings"],
    ["getUserPurchases", "getUserOrders", "Failed to fetch user purchases"],
    ["getSalesAnalytics", "getSellerOrders", "Failed to fetch sales analytics"],
  ])("%s rejects storage failures instead of successful empty/zero data", async (method, storageMethod, message) => {
    const service = readService({ [storageMethod]: async () => outage() });
    await expect(service[method]("owner")).rejects.toThrow(message);
  });

  it.each(["getUserListings", "getListingsByProducer"])("%s rejects profile and tier read failures", async (method) => {
    const profile = readService({ getUser: async () => outage() });
    await expect(profile[method]("owner")).rejects.toThrow(/Failed to fetch/);
    const tiers = readService({ getBeatListings: async () => [{ id: "beat", userId: "owner" }] });
    await expect(tiers[method]("owner")).rejects.toThrow(/Failed to fetch/);
  });

  it.each(readMethods.filter((method) => !["getListing", "getSalesAnalytics"].includes(method)))("%s preserves successful empty lists", async (method) => {
    expect(await readService()[method]("owner")).toEqual([]);
  });

  it("preserves real missing records, purchase rows, and successful zero/nonzero analytics", async () => {
    expect(await readService().getListing("missing")).toBeNull();
    const rows = [{ id: "purchase", amount: 12 }, { id: "purchase-2", amount: 8 }];
    expect(await readService({ getUserOrders: async () => rows }).getUserPurchases("owner")).toEqual(rows);
    expect(await readService().getSalesAnalytics("owner")).toEqual({
      totalRevenue: 0, totalSales: 0, averageOrderValue: 0, recentSales: [],
    });
    expect(await readService({ getSellerOrders: async () => rows }).getSalesAnalytics("owner")).toEqual({
      totalRevenue: 20, totalSales: 2, averageOrderValue: 10, recentSales: rows,
    });
  });

  it.each([
    ["/beats", "browseListings", {}, "Failed to fetch beats"],
    ["/beats", "getListingsByProducer", { producerId: "producer" }, "Failed to fetch beats"],
    ["/my-beats", "getUserListings", {}, "Failed to fetch your beats"],
    ["/purchases", "getUserPurchases", {}, "Failed to fetch purchases"],
    ["/sales-analytics", "getSalesAnalytics", {}, "Failed to fetch sales analytics"],
    ["/producer-analytics", "getUserListings", {}, "Failed to fetch analytics"],
    ["/producer-analytics", "getUserSales", {}, "Failed to fetch analytics"],
    ["/producers/:producerId", "getListingsByProducer", {}, "Failed to fetch producer"],
  ])("registered GET %s safely returns 500 when %s rejects", async (path, method, query, message) => {
    const handler = routeHandler(path, { getUserListings: async () => [], [method]: async () => outage() });
    const response = {
      code: 200,
      body: undefined as unknown,
      status(code: number) { this.code = code; return this; },
      json(body: unknown) { this.body = body; return this; },
    };
    await handler({
      query, params: { producerId: "producer" },
      user: { id: "owner" },
      isAuthenticated: () => path !== "/beats",
    }, response);
    expect(response.code).toBe(500);
    expect(response.body).toEqual({ error: message });
    expect(JSON.stringify(response.body)).not.toContain("private provider details");
  });
});
