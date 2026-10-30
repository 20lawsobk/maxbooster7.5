import pg from "pg";
import path from "node:path";
import { fileURLToPath } from "node:url";

export function compareSchema(expected, actual) {
  const available = new Map();
  for (const row of actual) {
    const key = JSON.stringify([row.table_schema, row.table_name]);
    if (!available.has(key)) available.set(key, new Set());
    available.get(key).add(row.column_name);
  }
  return expected.flatMap(table => {
    const columns = available.get(JSON.stringify([table.schema, table.name]));
    const missingColumns = table.columns.filter(column => !columns?.has(column));
    return missingColumns.length || !columns
      ? [{ schema: table.schema, table: table.name, missingTable: !columns, missingColumns }]
      : [];
  });
}

export async function checkNeonSchema(connectionString) {
  if (!connectionString) throw new Error("NEON_DATABASE_URL is required; no alternate database will be used.");
  const [{ is }, { PgTable, getTableConfig }, schema] = await Promise.all([
    import("drizzle-orm"), import("drizzle-orm/pg-core"), import("../shared/schema.ts"),
  ]);
  const expected = Object.values(schema).filter(value => is(value, PgTable)).map(table => {
    const config = getTableConfig(table);
    return { schema: config.schema ?? "public", name: config.name, columns: config.columns.map(column => column.name) };
  });
  const pool = new pg.Pool({ connectionString, max: 1, connectionTimeoutMillis: 10000 });
  try {
    const client = await pool.connect();
    try {
      // Neon pooled connections may reject startup options: enforce read-only
      // in the transaction before querying any application metadata.
      await client.query("BEGIN READ ONLY");
      await client.query("SET LOCAL statement_timeout = '10s'");
      const mode = await client.query("SHOW transaction_read_only");
      if (mode.rows[0]?.transaction_read_only !== "on") throw new Error("Read-only transaction not established");
      const result = await client.query(
        "SELECT table_schema, table_name, column_name FROM information_schema.columns WHERE table_schema NOT IN ('pg_catalog', 'information_schema')",
      );
      return { checkedTables: expected.length, readOnly: true, drift: compareSchema(expected, result.rows) };
    } finally {
      try { await client.query("ROLLBACK"); } finally { client.release(); }
    }
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const report = await checkNeonSchema(process.env.NEON_DATABASE_URL);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.drift.length ? 1 : 0;
  } catch (error) {
    // Connection errors can contain sensitive connection details; never print
    // their message, stack, URL, or credentials.
    console.error(JSON.stringify({ check: "neon-schema", status: "failed", code: error.code ?? "CHECK_FAILED" }));
    process.exitCode = 1;
  }
}
