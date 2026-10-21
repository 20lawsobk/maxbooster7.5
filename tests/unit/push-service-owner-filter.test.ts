import { PgDialect } from "drizzle-orm/pg-core";
import { afterEach, expect, it, vi } from "vitest";
const predicates = vi.hoisted(() => [] as unknown[]);
vi.mock("../../server/db", () => ({ db: {
  delete: () => ({ where: async (predicate: unknown) => { predicates.push(predicate); } }),
  update: () => ({ set: () => ({ where: async (predicate: unknown) => { predicates.push(predicate); } }) }),
} }));
import { webPushService } from "../../server/services/webPushService.js";
import { mobilePushService } from "../../server/services/mobilePushService.js";
afterEach(() => { predicates.length = 0; });

it("scopes supplied endpoint/token removal to the requesting account at the SQL boundary", async () => {
  await webPushService.removeSubscription("endpoint-b", "owner-a");
  await mobilePushService.deactivateToken("token-b", "owner-a");
  const dialect = new PgDialect();
  for (const predicate of predicates) {
    const query = dialect.sqlToQuery(predicate as Parameters<PgDialect["sqlToQuery"]>[0]);
    expect(query.sql).toContain('"user_id"');
    expect(query.params).toContain("owner-a");
    expect(query.params.some(value => value === "endpoint-b" || value === "token-b")).toBe(true);
  }
  expect(predicates).toHaveLength(2);
});
