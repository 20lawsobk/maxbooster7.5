import express from "express";
import type { AddressInfo } from "node:net";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ queries: [] as Array<Record<string, unknown>>, rows: [] as unknown[] }));
vi.mock("../../server/db", () => ({ db: {
  select: () => {
    const query: Record<string, unknown> = {};
    fixture.queries.push(query);
    const chain = {
      from(table: unknown) { query.table = table; return chain; },
      where(predicate: unknown) { query.predicate = predicate; return chain; },
      orderBy() { return chain; },
      limit(limit: number) { query.limit = limit; return chain; },
      offset(offset: number) { query.offset = offset; return chain; },
      then(resolve: (rows: unknown[]) => unknown) { return Promise.resolve(fixture.rows).then(resolve); },
    };
    return chain;
  },
} }));
vi.mock("../../server/middleware/auth", () => ({ requireAuth: (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const owner = req.get("X-Fixture-Owner");
  if (!owner) { res.status(401).json({ error: "Authentication required" }); return; }
  req.user = { id: owner } as Express.User; next();
} }));
import router from "../../server/routes/syncLicensing";
import { syncLicenseInquiries, syncSubmissions } from "../../shared/schema";

afterEach(() => { fixture.queries.length = 0; fixture.rows = []; });

async function get(path: string, owner?: string) {
  const app = express(); app.use("/api/sync-licensing", router);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/sync-licensing${path}`, {
      headers: owner ? { "X-Fixture-Owner": owner } : {},
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}

it("routes the inquiry inbox before listing IDs and scopes its query to the authenticated owner", async () => {
  expect((await get("/inquiries")).status).toBe(401);
  expect(fixture.queries).toHaveLength(0);
  expect(await get("/inquiries?page=0&limit=999", "owner-fixture")).toEqual({ status: 200, body: [] });
  expect(fixture.queries).toHaveLength(1);
  expect(fixture.queries[0]).toMatchObject({ table: syncLicenseInquiries, limit: 100, offset: 0 });
  const sql = new PgDialect().sqlToQuery(fixture.queries[0].predicate as Parameters<PgDialect["sqlToQuery"]>[0]);
  expect(sql.params).toEqual(["owner-fixture"]);
  expect(sql.sql).toContain('"sync_license_inquiries"."user_id"');
});

it("retains the owner-scoped listing handler for an actual listing ID", async () => {
  const id = "00000000-0000-4000-8000-000000000001";
  expect((await get(`/${id}`, "owner-fixture")).status).toBe(404);
  expect(fixture.queries[0].table).toBe(syncSubmissions);
  const sql = new PgDialect().sqlToQuery(fixture.queries[0].predicate as Parameters<PgDialect["sqlToQuery"]>[0]);
  expect(sql.params).toEqual([id, "owner-fixture"]);
});
