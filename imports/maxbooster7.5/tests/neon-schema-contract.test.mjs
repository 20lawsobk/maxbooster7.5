import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSchema, checkNeonSchema } from "../scripts/check-neon-schema.mjs";
import fs from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import { loadDatabaseSubject } from "./payment-processing/helpers-database-postgres.mjs";

const expected = [{ schema: "public", name: "orders", columns: ["id", "status"] }];
test("schema gate distinguishes a missing table from missing columns", () => {
  assert.equal(compareSchema(expected, [])[0].missingTable, true);
  assert.deepEqual(compareSchema(expected, [
    { table_schema: "public", table_name: "orders", column_name: "id" },
  ])[0].missingColumns, ["status"]);
});
test("same-named tables in another schema cannot satisfy the contract", () => {
  assert.equal(compareSchema(expected, [
    { table_schema: "other", table_name: "orders", column_name: "id" },
    { table_schema: "other", table_name: "orders", column_name: "status" },
  ])[0].missingTable, true);
});
test("additional historical columns are preserved, not reported as removals", () => {
  assert.deepEqual(compareSchema(expected, ["id", "status", "historical_provider_id"].map(column_name => ({
    table_schema: "public", table_name: "orders", column_name,
  }))), []);
});
test("missing Neon configuration fails instead of targeting the managed DB", async () => {
  await assert.rejects(checkNeonSchema(undefined), /NEON_DATABASE_URL is required/);
});
test("prelaunch checks the selected app database schema, not just SELECT 1", () => {
  const source = fs.readFileSync("scripts/pre-launch-check.ts", "utf8");
  assert.match(source, /checkNeonSchema\(database.url\)/);
  assert.match(source, /report.drift.length === 0/);
  assert.doesNotMatch(source, /SELECT 1 AS ok/);
});

test("the required schema includes the complete durable replica-migration journal", async () => {
  const { fabricMigrationJobs } = await loadDatabaseSubject("shared/schema.ts");
  const config = getTableConfig(fabricMigrationJobs);
  const expectedJournal = [{ schema: config.schema ?? "public", name: config.name,
    columns: config.columns.map(column => column.name) }];
  assert.equal(config.name, "fabric_migration_jobs");
  assert.deepEqual(new Set(expectedJournal[0].columns), new Set([
    "id", "chunk_id", "from_node", "to_node", "source_key", "target_key",
    "size_bytes", "checksum", "state", "created_at",
  ]));
  assert.equal(compareSchema(expectedJournal, [])[0].missingTable, true);
  const actual = expectedJournal[0].columns.map(column_name => ({
    table_schema: "public", table_name: "fabric_migration_jobs", column_name,
  }));
  assert.deepEqual(compareSchema(expectedJournal, actual), []);
  assert.deepEqual(compareSchema(expectedJournal, actual.filter(row => row.column_name !== "source_key"))[0].missingColumns,
    ["source_key"], "A missing recovery key must fail prelaunch, not merely log a background error");
});
