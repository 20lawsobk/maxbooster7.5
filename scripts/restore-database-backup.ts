import { readFile } from "node:fs/promises";
import { databaseBackupService } from "../server/services/backup/databaseBackupService.js";
import { pool } from "../server/db.js";

// Deliberately operator-only: no restore-over-production HTTP endpoint.
// Target credential comes from env, never command-line arguments or logs.
const [key, invariantFile] = process.argv.slice(2);
try {
  if (!key || !invariantFile || !process.env.DATABASE_RECOVERY_URL) {
    throw new Error("Usage: restore-database-backup <catalog-key> <invariants.sql>; set DATABASE_RECOVERY_URL to an empty isolated target");
  }
  const started = Date.now();
  await databaseBackupService.restoreBackup(
    key, process.env.DATABASE_RECOVERY_URL, await readFile(invariantFile, "utf8"),
  );
  console.log(JSON.stringify({ restored: true, elapsedMs: Date.now() - started, promoted: false }));
} catch {
  console.error("Recovery failed. No promotion performed; inspect isolated target and operator diagnostics.");
  process.exitCode = 1;
} finally {
  await databaseBackupService.stop();
  await pool.end();
}