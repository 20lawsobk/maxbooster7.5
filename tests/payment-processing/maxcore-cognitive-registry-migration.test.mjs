import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { startDisposablePostgres } from "./helpers-database-postgres.mjs";

test("MaxCore cognitive registry migration installs owner-isolated graph constraints", {
  timeout: 60_000,
}, async (t) => {
  const pg = await startDisposablePostgres();
  t.after(() => pg.stop());

  await pg.pool.query("CREATE TABLE users (id varchar PRIMARY KEY)");
  await pg.pool.query(
    await readFile("migrations/0100_maxcore_cognitive_registry.sql", "utf8"),
  );
  await pg.pool.query(
    "INSERT INTO users (id) VALUES ('owner-a'), ('owner-b')",
  );

  const entities = await pg.pool.query(
    `INSERT INTO maxcore_cognitive_entities
       (owner_id, entity_type, payload, search_text)
     VALUES ('owner-a', 'project', '{"name":"Demo"}', 'Demo')
     RETURNING id`,
  );
  const related = await pg.pool.query(
    `INSERT INTO maxcore_cognitive_entities
       (owner_id, entity_type, payload)
     VALUES ('owner-a', 'task', '{"title":"Mix"}')
     RETURNING id`,
  );
  const foreignOwner = await pg.pool.query(
    `INSERT INTO maxcore_cognitive_entities
       (owner_id, entity_type, payload)
     VALUES ('owner-b', 'task', '{"title":"Private"}')
     RETURNING id`,
  );
  const [source, target, foreignTarget] = [
    entities.rows[0].id,
    related.rows[0].id,
    foreignOwner.rows[0].id,
  ];

  await pg.pool.query(
    `INSERT INTO maxcore_cognitive_relationships
       (owner_id, source_id, target_id, relation_type)
     VALUES ('owner-a', $1, $2, 'contains')`,
    [source, target],
  );

  const graph = await pg.pool.query(
    `SELECT e.owner_id, e.entity_type, e.payload, r.relation_type
       FROM maxcore_cognitive_entities e
       JOIN maxcore_cognitive_relationships r ON r.source_id = e.id
      WHERE e.id = $1`,
    [source],
  );
  assert.deepEqual(graph.rows[0], {
    owner_id: "owner-a",
    entity_type: "project",
    payload: { name: "Demo" },
    relation_type: "contains",
  });

  await assert.rejects(
    pg.pool.query(
      `INSERT INTO maxcore_cognitive_relationships
         (owner_id, source_id, target_id, relation_type)
       VALUES ('owner-a', $1, $2, 'contains')`,
      [source, foreignTarget],
    ),
    (error) => error.code === "23503",
  );
  await assert.rejects(
    pg.pool.query(
      `INSERT INTO maxcore_cognitive_relationships
         (owner_id, source_id, target_id, relation_type)
       VALUES ('owner-a', $1, $1, 'related_to')`,
      [source],
    ),
    (error) => error.code === "23514",
  );
  await assert.rejects(
    pg.pool.query(
      `INSERT INTO maxcore_cognitive_relationships
         (owner_id, source_id, target_id, relation_type)
       VALUES ('owner-a', $1, $2, 'invented_relation')`,
      [source, target],
    ),
    (error) => error.code === "23514",
  );
});
