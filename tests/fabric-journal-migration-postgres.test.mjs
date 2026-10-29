import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { startDisposablePostgres } from "./payment-processing/helpers-database-postgres.mjs";

const migration = fileURLToPath(new URL("../migrations/0096_fabric_deletion_journals.sql", import.meta.url));

test("fabric journal migration preserves in-flight chunk references and protects delta bases", { timeout: 60_000 }, async () => {
  const database = await startDisposablePostgres();
  try {
    const { pool } = database;
    await pool.query(`
      CREATE TABLE fabric_objects (id varchar PRIMARY KEY, chunk_ids jsonb NOT NULL);
      CREATE TABLE fabric_chunks (id varchar PRIMARY KEY);
      INSERT INTO fabric_chunks(id) VALUES ('shared'),('solo'),('unpublished');
      INSERT INTO fabric_objects(id,chunk_ids) VALUES
        ('one','["shared","shared","solo"]'::jsonb),
        ('two','["shared"]'::jsonb);
    `);
    const sql = await readFile(migration, "utf8");
    await pool.query(sql);
    const counts = await pool.query("SELECT id,ref_count FROM fabric_chunks ORDER BY id");
    assert.deepEqual(counts.rows, [
      { id: "shared", ref_count: 3 },
      { id: "solo", ref_count: 1 },
      { id: "unpublished", ref_count: 1 },
    ], "unpublished chunks must not be decremented to zero by an incomplete object snapshot");

    // A live writer can have reserved a reference before its object row exists.
    await pool.query("UPDATE fabric_chunks SET ref_count=5 WHERE id='shared'");
    await pool.query(sql);
    assert.equal((await pool.query("SELECT ref_count FROM fabric_chunks WHERE id='shared'")).rows[0].ref_count, 5,
      "re-running the migration must not overwrite a larger in-flight reference count");

    await pool.query("UPDATE fabric_chunks SET ref_count=3 WHERE id='shared'");
    await pool.query(`INSERT INTO fabric_deletion_chunks(object_id,ordinal,chunk_id,state)
      VALUES ('interrupted-delete',0,'shared','pending')`);
    await pool.query(sql);
    assert.equal((await pool.query("SELECT ref_count FROM fabric_chunks WHERE id='shared'")).rows[0].ref_count, 4,
      "an interrupted deletion still owns its chunk reference");

    await pool.query(`
      INSERT INTO fabric_objects(id,chunk_ids) VALUES
        ('delta-base','[]'::jsonb),('delta-child','[]'::jsonb);
      INSERT INTO fabric_object_dependencies(object_id,base_object_id)
        VALUES ('delta-child','delta-base');
    `);
    await assert.rejects(pool.query("DELETE FROM fabric_objects WHERE id='delta-base'"),
      error => error?.code === "23503",
      "the database must reject deleting a base still referenced by a delta child");
    await pool.query("DELETE FROM fabric_objects WHERE id='delta-child'");
    await pool.query("DELETE FROM fabric_objects WHERE id='delta-base'");
    const fence = await pool.query("SELECT generation FROM fabric_catalog_fence WHERE id='root-catalog'");
    assert.equal(fence.rows.length, 1);
    assert.equal(BigInt(fence.rows[0].generation), 0n);
  } finally {
    await database.stop();
  }
});
