import { readFileSync } from "node:fs";
import ts from "typescript";
import { and, desc, eq, sql } from "drizzle-orm";
import { pgTable, text, boolean } from "drizzle-orm/pg-core";
import { describe, expect, it, vi } from "vitest";

const notifications = pgTable("notifications", { userId: text("user_id"), metadata: text("metadata"), type: text("type"), isRead: boolean("is_read"), createdAt: text("created_at") });
const source = readFileSync("server/routes/notifications.ts", "utf8");
const start = source.indexOf('router.get("/",');
const end = source.indexOf('\nrouter.put(', start);
const routeSource = source.slice(start, end);

function fixture() {
  let handler: (req: any, res: any) => Promise<any>;
  const reader: any = {};
  for (const method of ["select", "from", "where", "orderBy", "limit"]) reader[method] = vi.fn(() => reader);
  reader.offset = vi.fn(async () => []);
  const javascript = ts.transpile(routeSource, { target: ts.ScriptTarget.ES2022 });
  // eslint-disable-next-line no-new-func -- Execute repository-owned callback source with isolated test dependencies, never user input.
  new Function("router", "db", "dbRead", "notifications", "eq", "and", "desc", "sql", "logger", "getCategory", javascript)(
    {get: (_: string, fn: typeof handler) => { handler = fn; }}, reader, null, notifications, eq, and, desc, sql, {warn: vi.fn()}, () => "system",
  );
  const res: any = {status: vi.fn(function () { return res; }), json: vi.fn(function () { return res; })};
  return {run: (query: any, user: any = {id: "owner"}) => handler({query, user}, res), reader, res};
}

describe("notification list HTTP handler", () => {
  it.each([{limit: "-1"}, {limit: "101"}, {limit: "1junk"}, {page: "1.5"}, {page: "0"}, {page: "Infinity"}, {page: ["1", "2"]}, {page: ["1"]}, {category: ["royalties"]}, {unread: "yes"}])("rejects invalid pagination before querying %j", async (query) => {
    const f = fixture(); await f.run(query);
    expect(f.res.status).toHaveBeenCalledWith(400);
    expect(f.reader.select).not.toHaveBeenCalled();
  });
  it("rejects missing authentication before querying", async () => {
    const f = fixture(); await f.run({}, null);
    expect(f.res.status).toHaveBeenCalledWith(401);
    expect(f.reader.select).not.toHaveBeenCalled();
  });
  it("bounds default and explicit pages", async () => {
    const f = fixture(); await f.run({page: "3", limit: "25"});
    expect(f.reader.limit).toHaveBeenCalledWith(25);
    expect(f.reader.offset).toHaveBeenCalledWith(50);
    expect(f.res.json).toHaveBeenCalledWith([]);
  });
});
