import { test } from "node:test";
import assert from "node:assert/strict";
import { RECOVERY_COLUMN_ORDINAL_SQL } from "../scripts/database-recovery-tools.mjs";
import { startDisposablePostgres } from "./payment-processing/helpers-database-postgres.mjs";

test("restore column fingerprint preserves logical order across a dropped physical column", async () => {
  const cluster = await startDisposablePostgres();
  try {
    await cluster.pool.query(`CREATE TABLE source_columns (id int, removed int, value text);
      ALTER TABLE source_columns DROP COLUMN removed;
      CREATE TABLE restored_columns (id int, value text);
      CREATE TABLE reordered_columns (value text, id int);`);
    const columns = async table => (await cluster.pool.query(`
      SELECT ${RECOVERY_COLUMN_ORDINAL_SQL}, a.attname, format_type(a.atttypid,a.atttypmod) AS data_type
      FROM pg_attribute a WHERE a.attrelid=$1::regclass AND a.attnum>0 AND NOT a.attisdropped
      ORDER BY a.attnum`, [table])).rows;
    assert.deepEqual(await columns("source_columns"), await columns("restored_columns"));
    assert.notDeepEqual(await columns("source_columns"), await columns("reordered_columns"));
    const physical = await cluster.pool.query("SELECT attnum FROM pg_attribute WHERE attrelid='source_columns'::regclass AND attname='value'");
    assert.equal(physical.rows[0].attnum, 3, "fixture retains a real physical gap");
  } finally { await cluster.stop(); }
});
