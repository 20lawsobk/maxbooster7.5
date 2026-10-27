/** Actual local pg_dump/psql recovery. No provider, private Neon, storage or global SLO claim. */
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, fstatSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Pool } from "pg";
import { loadDatabaseSubject, startDisposablePostgres } from "./payment-processing/helpers-database-postgres.mjs";

test("owned PostgreSQL: real dump bytes restore schema, data, sequence and a pinned snapshot", { timeout: 90_000 }, async t => {
  let cluster;
  const connections = [];
  const scratch = await mkdtemp(path.join(tmpdir(), "database-restore-contract-"));
  t.after(async () => {
    try {
      await Promise.all(connections.map(connection => connection.end()));
    } finally {
      try { if (cluster) await cluster.stop(); }
      finally { await rm(scratch, { recursive: true, force: true }); }
    }
  });

  cluster = await startDisposablePostgres();
  const socket = cluster.pool.options.host;
  const user = cluster.pool.options.user;
  assert.ok(path.isAbsolute(socket));
  assert.equal((await cluster.pool.query("SHOW listen_addresses")).rows[0].listen_addresses, "");
  const names = ["source_fixture", "restored_fixture", "snapshot_fixture", "rollback_fixture"];
  const databases = {};
  for (const name of names) {
    await cluster.pool.query(`CREATE DATABASE ${name}`);
    databases[name] = new Pool({ host: socket, port: 5432, user, database: name, max: 3, connectionTimeoutMillis: 5000 });
    connections.push(databases[name]);
  }
  const urlFor = database => {
    // Query host selects this fixture's private UDS; no TCP listener exists.
    // This exercises the low-level restore runner, not the service's HTTP URL
    // admission policy or its separate durable backup catalog.
    const url = new URL(`postgresql://${encodeURIComponent(user)}@localhost/${database}`);
    url.searchParams.set("host", socket);
    return url.toString();
  };
  const source = databases.source_fixture;
  await source.query(`
    CREATE SCHEMA recovery_fixture;
    CREATE TYPE recovery_fixture.payment_state AS ENUM ('draft', 'paid');
    CREATE TABLE recovery_fixture.owners (
      id bigserial PRIMARY KEY,
      email text NOT NULL UNIQUE CHECK (position('@' in email) > 0)
    );
    CREATE TABLE recovery_fixture.entries (
      id bigserial PRIMARY KEY,
      owner_id bigint NOT NULL REFERENCES recovery_fixture.owners(id),
      amount numeric(28,8) NOT NULL CHECK (amount >= 0),
      metadata jsonb NOT NULL DEFAULT '{}',
      memo text,
      state recovery_fixture.payment_state NOT NULL DEFAULT 'draft',
      created_at timestamptz NOT NULL DEFAULT now(),
      raw_bytes bytea
    );
    CREATE INDEX entries_owner_idx ON recovery_fixture.entries(owner_id);
  `);
  const owner = (await source.query("INSERT INTO recovery_fixture.owners(email) VALUES($1) RETURNING id", ["艺人@example.invalid"])).rows[0].id;
  await source.query(`INSERT INTO recovery_fixture.entries(owner_id,amount,metadata,memo,state,created_at,raw_bytes)
    VALUES($1,$2,$3,$4,'paid','2026-01-02T03:04:05.123456Z',$5),
          ($1,$6,'{"nullable":null}',NULL,'draft','2026-01-03T03:04:05Z',NULL)`,
  [owner, "12345678901234567890.12345678", JSON.stringify({ title: "夜の音楽 🎹", nested: { tags: ["é", "quote\"", null] } }),
    "Unicode 🎵, apostrophe ' and a newline\nnext line", Buffer.from([0, 1, 127, 128, 255]), "0.00000001"]);

  const dumpSubject = await loadDatabaseSubject("server/services/backup/databaseDump.ts");
  const tools = await loadDatabaseSubject("server/services/backup/postgresTools.ts");
  const restoreSubject = await loadDatabaseSubject("server/services/backup/databaseRestore.ts");
  const privateModes = [];
  const commands = [];
  const toolEnvironment = { PATH: process.env.PATH || "/usr/bin:/bin", HOME: scratch, TMPDIR: scratch, LANG: "C" };
  const ownedSpawn = (command, args, options) => {
    assert.ok(["pg_dump", "psql"].includes(path.basename(command)));
    for (const key of ["DATABASE_URL", "NEON_DATABASE_URL", "SESSION_SECRET", "STRIPE_SECRET_KEY"]) {
      assert.equal(options.env?.[key], undefined, `${key} must not enter backup subprocesses`);
    }
    if (!args.includes("--version")) {
      assert.equal(options.env.PGHOST, socket);
      assert.ok(names.includes(options.env.PGDATABASE));
      assert.ok(args.every(argument => !/postgres(?:ql)?:\/\//.test(argument)), "connection URLs stay outside argv");
    }
    commands.push({ binary: path.basename(command), args });
    return spawn(command, args, { ...options, timeout: Math.min(options.timeout ?? 20_000, 20_000) });
  };
  const toolDependencies = { env: toolEnvironment, spawn: ownedSpawn };
  const dependencies = {
    tmpDirectory: scratch,
    spawn: ownedSpawn,
    selectTool: url => tools.selectPgDumpForServer(url, toolDependencies),
    createWriteStream(file, options) {
      const stream = createWriteStream(file, options);
      stream.on("open", descriptor => privateModes.push(fstatSync(descriptor).mode & 0o777));
      return stream;
    },
  };
  const fingerprint = async database => (await database.query(`
    SELECT e.id::text, o.email, e.amount::text, e.metadata, e.memo, e.state::text,
           e.created_at::text, encode(e.raw_bytes,'hex') AS raw_bytes
    FROM recovery_fixture.entries e JOIN recovery_fixture.owners o ON o.id=e.owner_id ORDER BY e.id
  `)).rows;

  const dump = await dumpSubject.generateUncommittedDatabaseDump(urlFor("source_fixture"), dependencies);
  assert.equal(dump.durability, "uncommitted");
  assert.ok(Buffer.isBuffer(dump.bytes));
  assert.equal(dump.size, dump.bytes.length);
  assert.equal(dump.checksum, createHash("sha256").update(dump.bytes).digest("hex"));
  assert.equal(dump.sourceMajor, Math.floor(Number((await source.query("SHOW server_version_num")).rows[0].server_version_num) / 10_000));
  assert.deepEqual(privateModes, [0o600]);
  assert.deepEqual(await readdir(scratch), [], "temporary production dump is removed before returning bytes");

  const restore = async (bytes, database, validationSql) => {
    const sql = path.join(scratch, `${database}.sql`);
    const validation = path.join(scratch, `${database}.validation.sql`);
    await writeFile(sql, bytes, { mode: 0o600, flag: "wx" });
    await writeFile(validation, validationSql, { mode: 0o600, flag: "wx" });
    try {
      const selection = await tools.selectPsqlForRestore(urlFor(database), dump.sourceMajor, toolDependencies);
      await restoreSubject.runDatabaseRestore(selection.tool.path,
        ["-X", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-f", sql, "-f", validation],
        urlFor(database), { spawn: ownedSpawn, timeoutMs: 20_000 });
    } finally {
      await rm(sql, { force: true });
      await rm(validation, { force: true });
    }
  };
  await restore(dump.bytes, "restored_fixture", `DO $$ BEGIN
    IF (SELECT count(*) FROM recovery_fixture.entries) <> 2 THEN RAISE EXCEPTION 'recovery row invariant failed'; END IF;
  END $$;`);
  await t.test("schema constraints, exact Unicode/JSON/null/numeric/bytea values and identity sequence survive actual restore", async () => {
    assert.deepEqual(await fingerprint(databases.restored_fixture), await fingerprint(source));
    const restored = databases.restored_fixture;
    const constraints = await restored.query("SELECT contype FROM pg_constraint WHERE conrelid='recovery_fixture.entries'::regclass ORDER BY contype");
    assert.deepEqual(constraints.rows.map(row => row.contype), ["c", "f", "p"]);
    assert.equal((await restored.query("SELECT to_regclass('recovery_fixture.entries_owner_idx')::text AS name")).rows[0].name, "recovery_fixture.entries_owner_idx");
    await assert.rejects(restored.query("INSERT INTO recovery_fixture.entries(owner_id,amount) VALUES($1,-1)", [owner]), error => error.code === "23514");
    await assert.rejects(restored.query("INSERT INTO recovery_fixture.entries(owner_id,amount) VALUES(99999999,1)"), error => error.code === "23503");
    const next = (await restored.query("INSERT INTO recovery_fixture.entries(owner_id,amount) VALUES($1,2) RETURNING id::text,metadata,state::text,created_at", [owner])).rows[0];
    // Failed constrained inserts consume serial values, too: three inserts
    // after the original id=2 must advance to id=5 rather than reusing a key.
    assert.equal(next.id, "5");
    assert.deepEqual(next.metadata, {});
    assert.equal(next.state, "draft");
    assert.ok(next.created_at instanceof Date);
  });

  await t.test("exported snapshot excludes a concurrent commit without changing source data", async () => {
    const snapshotConnection = await source.connect();
    try {
      await snapshotConnection.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const snapshotId = (await snapshotConnection.query("SELECT pg_export_snapshot() AS id")).rows[0].id;
      await source.query("INSERT INTO recovery_fixture.entries(owner_id,amount,memo) VALUES($1,3,'committed after snapshot')", [owner]);
      const pinned = await dumpSubject.generateUncommittedDatabaseDump(urlFor("source_fixture"), { ...dependencies, snapshotId });
      await restore(pinned.bytes, "snapshot_fixture", "SELECT 1;");
      assert.equal((await databases.snapshot_fixture.query("SELECT count(*)::int AS count FROM recovery_fixture.entries")).rows[0].count, 2);
      assert.equal((await source.query("SELECT count(*)::int AS count FROM recovery_fixture.entries")).rows[0].count, 3);
      assert.ok(commands.some(command => command.binary === "pg_dump" && command.args.includes(`--snapshot=${snapshotId}`)));
    } finally {
      await snapshotConnection.query("ROLLBACK");
      snapshotConnection.release();
    }
  });

  await t.test("a failing operator recovery invariant rolls back the entire actual restore transaction", async () => {
    await assert.rejects(restore(dump.bytes, "rollback_fixture", "DO $$ BEGIN RAISE EXCEPTION 'synthetic rejected recovery invariant'; END $$;"), /Restore failed/);
    assert.equal((await databases.rollback_fixture.query("SELECT to_regclass('recovery_fixture.entries') AS table_name")).rows[0].table_name, null);
    assert.equal((await databases.rollback_fixture.query("SELECT count(*)::int AS count FROM pg_namespace WHERE nspname='recovery_fixture'")).rows[0].count, 0);
  });

  await t.test("real pg_dump output over the byte budget fails and removes partial private files", async () => {
    await assert.rejects(dumpSubject.generateUncommittedDatabaseDump(urlFor("source_fixture"), { ...dependencies, maxBytes: 128 }), /exceeds.*(?:byte|generation)/);
    assert.deepEqual(await readdir(scratch), []);
    assert.ok(privateModes.every(mode => mode === 0o600));
  });
  assert.ok(commands.some(command => command.binary === "pg_dump"));
  assert.ok(commands.some(command => command.binary === "psql" && command.args.includes("--single-transaction")));
});
