import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { startDisposablePostgres } from "./payment-processing/helpers-database-postgres.mjs";

test("collaboration room migration creates constrained, durable room messages", {
  timeout: 60_000,
}, async (t) => {
  const postgres = await startDisposablePostgres();
  t.after(() => postgres.stop());

  await postgres.pool.query("CREATE TABLE users (id varchar PRIMARY KEY)");
  await postgres.pool.query(
    await readFile("migrations/0101_collaboration_rooms.sql", "utf8"),
  );
  await postgres.pool.query(
    "INSERT INTO users (id) VALUES ('owner-a'), ('owner-b')",
  );

  const room = await postgres.pool.query(
    `INSERT INTO collaboration_rooms (project_id, created_by)
     VALUES ('project-a', 'owner-a') RETURNING id, state, generation, media_state`,
  );
  const roomId = room.rows[0].id;
  assert.match(roomId, /^[0-9a-f-]{36}$/i);
  assert.deepEqual(room.rows[0], {
    id: roomId,
    state: "active",
    generation: 1,
    media_state: "unavailable",
  });

  await assert.rejects(
    postgres.pool.query(
      "INSERT INTO collaboration_rooms (project_id) VALUES ('project-a')",
    ),
    (error) => error.code === "23505",
  );
  await assert.rejects(
    postgres.pool.query(
      "INSERT INTO collaboration_rooms (project_id, state) VALUES ('project-b', 'unknown')",
    ),
    (error) => error.code === "23514",
  );

  const message = await postgres.pool.query(
    `INSERT INTO collaboration_room_messages
       (room_id, sender_id, client_message_id, content)
     VALUES ($1, 'owner-a', 'client-message-1', 'Shared notes')
     RETURNING id, content`,
    [roomId],
  );
  assert.equal(message.rows[0].content, "Shared notes");

  await assert.rejects(
    postgres.pool.query(
      `INSERT INTO collaboration_room_messages
         (room_id, sender_id, client_message_id, content)
       VALUES ($1, 'owner-a', 'client-message-1', 'Duplicate')`,
      [roomId],
    ),
    (error) => error.code === "23505",
  );
  await assert.rejects(
    postgres.pool.query(
      `INSERT INTO collaboration_room_messages
         (room_id, sender_id, client_message_id, content)
       VALUES ($1, 'owner-a', 'client-message-2', '   ')`,
      [roomId],
    ),
    (error) => error.code === "23514",
  );

  await postgres.pool.query(
    "DELETE FROM collaboration_rooms WHERE id = $1",
    [roomId],
  );
  const remaining = await postgres.pool.query(
    "SELECT count(*)::int AS count FROM collaboration_room_messages WHERE room_id = $1",
    [roomId],
  );
  assert.equal(remaining.rows[0].count, 0);
});
