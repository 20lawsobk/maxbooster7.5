import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";

const minimalEnvironment = (home) => ({
  PATH: process.env.PATH || "/usr/bin:/bin",
  HOME: home,
  TMPDIR: home,
  LANG: "C",
});

function run(binary, args, env) {
  const result = spawnSync(binary, args, { encoding: "utf8", env, timeout: 30_000 });
  if (result.error || result.status !== 0) {
    // PostgreSQL diagnostics are intentionally not forwarded: subprocess
    // environments contain no application/database credentials.
    throw new Error(`Disposable PostgreSQL ${path.basename(binary)} ${result.error ? "could not run" : "failed"}`);
  }
}

export async function startDisposablePostgres() {
  const root = await mkdtemp(path.join(tmpdir(), "commerce-db-integration-"));
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const log = path.join(root, "postgres.log");
  const env = minimalEnvironment(root);
  await mkdir(socket, { mode: 0o700 });
  await chmod(root, 0o700);
  const user = process.getuid?.() === 0 ? "postgres" : userInfo().username;
  let started = false;
  try {
    run("initdb", [
      "-D", data,
      "-U", user,
      "--no-locale",
      "--encoding=UTF8",
      "--auth-local=trust",
      "--auth-host=reject",
    ], env);
    const shellQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    run("pg_ctl", [
      "-D", data,
      "-l", log,
      "-o", `-c listen_addresses='' -c unix_socket_directories=${shellQuote(socket)} -c unix_socket_permissions=0700`,
      "-w",
      "start",
    ], env);
    started = true;
    const { Pool } = await import("pg");
    const pool = new Pool({
      host: socket,
      port: 5432,
      user,
      database: "postgres",
      max: 12,
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 5_000,
    });
    const settings = await pool.query("SELECT current_user, current_database(), current_setting('listen_addresses') AS listen_addresses, current_setting('unix_socket_directories') AS socket_directories");
    if (
      settings.rows[0]?.current_user !== user ||
      settings.rows[0]?.current_database !== "postgres" ||
      settings.rows[0]?.listen_addresses !== "" ||
      settings.rows[0]?.socket_directories !== socket
    ) {
      await pool.end();
      throw new Error("Disposable PostgreSQL isolation settings did not match");
    }
    return {
      pool,
      async stop() {
        await pool.end();
        try {
          run("pg_ctl", ["-D", data, "-m", "fast", "-w", "stop"], env);
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      },
    };
  } catch (error) {
    if (started) {
      try { run("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"], env); } catch {}
    }
    await rm(root, { recursive: true, force: true });
    throw error instanceof Error && error.message.startsWith("Disposable PostgreSQL")
      ? error
      : new Error("Disposable PostgreSQL could not be initialized");
  }
}

export async function applyCommerceMigrations(pool) {
  for (const file of [
    "migrations/0022_commerce_webhook_receipts.sql",
    "migrations/0023_commerce_settlement.sql",
  ]) {
    const sql = await readFile(path.resolve(file), "utf8");
    await pool.query(sql);
  }
  const schema = await pool.query(`SELECT
    to_regclass('public.commerce_webhook_receipts') IS NOT NULL AS webhook_receipts,
    to_regclass('public.commerce_webhook_inbox') IS NOT NULL AS webhook_inbox,
    to_regclass('public.commerce_sources') IS NOT NULL AS commerce_sources,
    to_regclass('public.commerce_entries') IS NOT NULL AS commerce_entries`);
  if (Object.values(schema.rows[0] || {}).some((present) => present !== true)) {
    throw new Error("Commerce migrations were not completely applied");
  }
}

export async function createCommerceFixtureSchema(pool) {
  await pool.query(`
    CREATE TABLE users (
      id text PRIMARY KEY,
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE orders (
      id text PRIMARY KEY,
      user_id text NOT NULL,
      seller_id text NOT NULL,
      listing_id text NOT NULL,
      license_type text NOT NULL DEFAULT 'basic',
      amount real NOT NULL,
      currency text NOT NULL DEFAULT 'usd',
      status text NOT NULL DEFAULT 'pending',
      stripe_payment_intent_id text,
      license_document_url text,
      license_snapshot jsonb,
      metadata jsonb NOT NULL DEFAULT '{}',
      created_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE listings (
      id text PRIMARY KEY,
      metadata jsonb NOT NULL DEFAULT '{}'
    );
    CREATE TABLE royalty_splits (
      id text PRIMARY KEY,
      release_id text NOT NULL,
      user_id text NOT NULL,
      percentage numeric NOT NULL
    );
    CREATE TABLE revenue_events (
      id bigserial PRIMARY KEY,
      user_id text NOT NULL,
      source text NOT NULL,
      source_type text NOT NULL,
      amount numeric NOT NULL,
      currency text NOT NULL,
      listing_id text,
      order_id text UNIQUE
    );
    CREATE TABLE refunds (
      id text PRIMARY KEY,
      stripe_refund_id text,
      status text
    );
  `);
}

export async function loadDatabaseSubject(entryPoint, boundaries = {}, defines = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "commerce-subject-"));
  const outfile = path.join(directory, "subject.mjs");
  try {
    await build({
      entryPoints: [path.resolve(entryPoint)],
      outfile,
      bundle: true,
      packages: "bundle",
      platform: "node",
      format: "esm",
      target: "node22",
      define: defines,
      logLevel: "silent",
      plugins: [{
        name: "isolated-commerce-database-boundaries",
        setup(buildContext) {
          buildContext.onResolve({ filter: /.*/ }, (args) => {
            if (!Object.hasOwn(boundaries, args.path)) return undefined;
            return { path: args.path, namespace: "isolated-commerce-database" };
          });
          buildContext.onLoad({ filter: /.*/, namespace: "isolated-commerce-database" }, (args) => ({
            contents: boundaries[args.path],
            loader: "js",
          }));
        },
      }],
    });
    return await import(pathToFileURL(outfile).href);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}