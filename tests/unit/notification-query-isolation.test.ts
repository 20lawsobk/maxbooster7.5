import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { and, eq, sql } from "drizzle-orm";
import { PgDialect, pgTable, text } from "drizzle-orm/pg-core";

const notifications = pgTable("notifications", { userId: text("user_id"), metadata: text("metadata"), type: text("type") });

describe("notification category query isolation", () => {
  it("groups both category branches under the authenticated owner predicate", () => {
    const source = readFileSync("server/routes/notifications.ts", "utf8");
    const expression = source.match(/sql`[^`]*metadata[^`]*LIKE[^`]*`/)?.[0];
    expect(expression).toBeDefined();
    // eslint-disable-next-line no-new-func -- Execute repository-owned callback source with isolated test dependencies, never user input.
    const filter = new Function("sql", "notifications", "category", `return ${expression}`)(sql, notifications, "royalties");
    const compiled = new PgDialect().sqlToQuery(and(eq(notifications.userId, "account-a"), filter)!);
    expect(compiled.sql).toMatch(/user_id" = \$1 and \(.* OR .*\)\)/);
    expect(compiled.params).toEqual(["account-a", "royalties", "royalties%"]);
    // With no grouping, the fallback OR escapes the owner predicate.
    expect(compiled.sql).not.toMatch(/user_id" = \$1 and "notifications"\."metadata"/);
  });
});
