import { test } from "node:test";
import assert from "node:assert/strict";
import { compareSchema, checkNeonSchema } from "../scripts/check-neon-schema.mjs";
import fs from "node:fs";

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
