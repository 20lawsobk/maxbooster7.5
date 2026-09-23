// @ts-nocheck
import { spawn } from "child_process";
import { logger } from "../../logger.js";
import cron, { type ScheduledTask } from "../../lib/cronScheduler.js";
import fsPromises from "fs/promises";
import { storageService } from "../storageService.js";
import { createHash, randomUUID } from "node:crypto";
import { backupCatalog } from "./backupCatalog.js";
import {
  dumpedServerMajor,
  safePostgresDiagnostic,
  selectPsqlForRestore,
} from "./postgresTools.js";
import {
  databaseDumpChecksum,
  generateUncommittedDatabaseDump,
} from "./databaseDump.js";
import {
  assertSafeSpawnArguments,
  isSamePostgresDatabase,
  restrictedChildEnvironment,
  validatePostgresConnectionUrl,
} from "../subprocessSafety.js";

function databaseUrl(): string {
  const url = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Database URL not configured");
  return url;
}
function checksum(buffer: Buffer): string {
  return databaseDumpChecksum(buffer);
}
function targetIdentity(): string {
  const target = new URL(databaseUrl());
  return createHash("sha256").update(`${target.hostname}${target.pathname}`).digest("hex");
}

const BACKUP_PREFIX = "database-backups";
const MAX_BACKUPS = 7;
const RPO_TARGET = 24;
const RTO_TARGET = 30;

interface BackupEntry {
  name: string;
  key: string;
  date: string;
  size: number;
}

interface ScheduledBackupRun {
  promise: Promise<void>;
  heartbeat?: ReturnType<typeof setInterval>;
  renewals: Set<Promise<void>>;
}

async function loadIndex(): Promise<BackupEntry[]> {
  return (await backupCatalog.list()).filter(e => e.state === "verified");
}

export class DatabaseBackupService {
  private backupSchedule: ScheduledTask | null = null;
  private isInitialized = false;
  private stopping = false;
  private readonly activeRuns = new Set<ScheduledBackupRun>();
  private stopPromise: Promise<void> | null = null;

  async initialize() {
    if (this.stopping) throw new Error("Backup service is stopping");
    if (this.isInitialized) return;
    databaseUrl();

    if (
      process.env.NODE_ENV !== "production" &&
      !process.env.REPLIT_DEPLOYMENT &&
      process.env.ENABLE_BACKUPS !== "true"
    ) {
      logger.info("ℹ️  Database backups disabled (not in production)");
      logger.info("   Set ENABLE_BACKUPS=true to enable in development");
      return;
    }

    this.scheduleBackups();
    this.isInitialized = true;

    logger.info(
      "✅ Database Backup Service initialized (Pocket Dimension storage)",
    );
    logger.info(`   RPO Target: ${RPO_TARGET} hours`);
    logger.info(`   RTO Target: ${RTO_TARGET} minutes`);
    logger.info(`   Backup Schedule: Daily at 2 AM UTC`);
    logger.info(`   Retention: ${MAX_BACKUPS} days`);
  }

  private scheduleBackups() {
    const run = async (active: ScheduledBackupRun) => {
      if (new Date().getUTCHours() < 2) return;
      const day = new Date().toISOString().slice(0, 10);
      const owner = randomUUID();
      let leaseError: unknown;
      let claimed = false;
      logger.info("🔄 Starting scheduled database backup...");
      try {
        if (!await backupCatalog.claimDay(day, owner, targetIdentity())) return;
        claimed = true;
        const assertOwnership = async () => {
          if (leaseError) throw leaseError;
          await backupCatalog.renewDay(day, owner);
        };
        active.heartbeat = setInterval(() => {
          const renewal = assertOwnership().catch(err => { leaseError = err; });
          active.renewals.add(renewal);
          void renewal.finally(() => active.renewals.delete(renewal));
        }, 60_000);
        active.heartbeat.unref();
        await this.createBackup({ assertOwnership, lease: { day, owner } });
        await assertOwnership();
        await this.cleanOldBackups();
        await backupCatalog.finishDay(day, owner, "complete");
        logger.info("✅ Scheduled backup completed successfully");
      } catch (error: unknown) {
        if (claimed) {
          await backupCatalog.finishDay(day, owner, "failed").catch(err =>
            logger.error({ err }, "Could not persist backup run failure"));
        }
        logger.warn({ err: error }, "❌ Scheduled backup failed:");
      } finally {
        // Keep renewing while dump/upload/catalog/retention or failure commit
        // still needs ownership. Drain already-dispatched DB renewals as well.
        if (active.heartbeat) clearInterval(active.heartbeat);
        active.heartbeat = undefined;
        await Promise.allSettled([...active.renewals]);
      }
    };
    const dispatch = (): Promise<void> => {
      if (this.stopping || this.activeRuns.size > 0) return Promise.resolve();
      const active: ScheduledBackupRun = { promise: Promise.resolve(), renewals: new Set() };
      this.activeRuns.add(active);
      active.promise = Promise.resolve().then(() => run(active)).finally(() => {
        this.activeRuns.delete(active);
      });
      return active.promise;
    };
    this.backupSchedule = cron.schedule("*/5 * * * *", dispatch, { timezone: "UTC" });
    // Catch up today's missed 02:00 slot after a process restart.
    void dispatch().catch(err => logger.error({ err }, "Backup catch-up failed"));

    logger.info("📅 Database backups scheduled (daily at 2 AM UTC)");
  }

  async createBackup(options?: {
    assertOwnership: () => Promise<void>;
    lease: { day: string; owner: string };
  }): Promise<string> {
    const sourceUrl = databaseUrl();

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `backup-${timestamp}-${randomUUID()}.sql`;
    const key = `${BACKUP_PREFIX}/${name}`;
    const dump = await generateUncommittedDatabaseDump(sourceUrl);
    const sizeBytes = dump.size;
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

    // Heap headroom warning at 256 MB so ops have lead time.
    if (sizeBytes > 256 * 1024 * 1024) {
      logger.warn(
        `⚠️  Backup ${name} is ${sizeMB} MB — approaching memory limit. ` +
          `Plan for streaming upload before the next doubling.`,
      );
    }

    const sqlBuffer = dump.bytes;
    const digest = dump.checksum;
    await options?.assertOwnership();
    await backupCatalog.pending({
      name, key, date: new Date().toISOString(), size: sizeBytes,
      checksum: digest, state: "pending",
    });
    await storageService.uploadFileAtKey(sqlBuffer, key, "application/sql");
    const downloaded = await storageService.downloadFile(key);
    if (checksum(downloaded) !== digest) throw new Error("Backup read-back checksum mismatch");
    await options?.assertOwnership();
    await backupCatalog.verify(key, options?.lease);

    logger.info(`✅ Backup stored in Pocket Dimension: ${name} (${sizeMB} MB)`);

    return key;
  }

  private async cleanOldBackups(): Promise<void> {
    const records = await backupCatalog.list();
    const expired = records.filter(e => e.state === "verified").slice(MAX_BACKUPS);
    for (const entry of [...records.filter(e => e.state === "deleting"), ...expired]) {
      await backupCatalog.state(entry.key, "deleting");
      await storageService.deleteFile(entry.key);
      await backupCatalog.remove(entry.key);
    }
  }

  async restoreBackup(key: string, targetUrl: string, validationSql?: string): Promise<void> {
    const sourceUrl = databaseUrl();
    const safeTargetUrl = validatePostgresConnectionUrl(targetUrl);
    if (isSamePostgresDatabase(sourceUrl, safeTargetUrl)) {
      throw new Error("Restore requires an isolated target database");
    }
    if (!validationSql?.trim()) throw new Error("Restore requires operator-supplied recovery invariants");
    const record = (await backupCatalog.list()).find(e => e.key === key && e.state === "verified");
    if (!record) throw new Error("No verified backup catalog record");
    const tmpPath = `/tmp/restore-${randomUUID()}.sql`;
    const validationPath = `${tmpPath}.validation.sql`;
    try {
      const buf = await storageService?.downloadFile(key);
      if (checksum(buf) !== record.checksum) throw new Error("Backup checksum mismatch");
      const restoreSelection = await selectPsqlForRestore(safeTargetUrl, dumpedServerMajor(buf));
      await fsPromises?.writeFile(tmpPath, buf, { mode: 0o600, flag: "wx" });
      await fsPromises.writeFile(validationPath, validationSql, { mode: 0o600, flag: "wx" });

      await new Promise<void>((resolve, reject) => {
        const args = ["-X", "-v", "ON_ERROR_STOP=1", "--single-transaction",
          "-c", "DO $$ BEGIN IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%' AND c.relkind IN ('r','p','v','m','S','f')) THEN RAISE EXCEPTION 'Restore target is not empty'; END IF; END $$;",
          "-f", tmpPath, "-f", validationPath];
        assertSafeSpawnArguments(args);
        const psql = spawn(restoreSelection.tool.path, args, {
          shell: false,
          stdio: ["ignore", "ignore", "pipe"],
          env: restrictedChildEnvironment({ PGDATABASE: safeTargetUrl }),
        });
        let errorOutput = "";
        psql?.stderr.on("data", (d) => {
          errorOutput += d?.toString();
        });
        psql?.on("close", (code) => {
          if (code === 0) {
            logger.info("✅ Database restored successfully");
            resolve();
          } else {
            reject(new Error(`Restore failed (code ${code}): ${safePostgresDiagnostic(errorOutput)}`));
          }
        });
        psql?.on("error", reject);
      });
    } finally {
      try {
        await fsPromises?.unlink(tmpPath);
        await fsPromises.unlink(validationPath);
      } catch {
        /* ignore */
      }
    }
  }

  async listBackups(): Promise<
    { name: string; date: Date; size: number; key: string }[]
  > {
    try {
      const index = await loadIndex();
      return index
        .sort((a, b) => new Date(b?.date).getTime() - new Date(a?.date).getTime())
        .map((e) => ({
          name: e.name,
          date: new Date(e?.date),
          size: e.size,
          key: e.key,
        }));
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error listing backups:");
      throw error;
    }
  }

  async getBackupMetrics() {
    const records = await backupCatalog.list();
    const last = records.find(record => record.state === "verified");
    const lastVerifiedAt = last ? new Date(last.date).toISOString() : null;
    const ageHours = last ? (Date.now() - new Date(last.date).getTime()) / 3_600_000 : null;
    return {
      rpo: RPO_TARGET,
      rto: RTO_TARGET,
      measuredRpo: null,
      measuredRto: null,
      lastVerifiedAt,
      lastVerifiedAgeHours: ageHours,
      stale: ageHours === null || ageHours > RPO_TARGET,
      scheduledRuns: await backupCatalog.runs(),
      targetIdentity: targetIdentity(),
      retentionDays: MAX_BACKUPS,
      schedule: "Daily at 2 AM UTC",
      storageBackend: "Pocket Dimension",
    };
  }

  stop(drainTimeoutMs = 20_000): Promise<void> {
    if (this.stopPromise) return this.stopPromise;
    if (!Number.isFinite(drainTimeoutMs) || drainTimeoutMs < 0) {
      return Promise.reject(new Error("Invalid backup shutdown drain deadline"));
    }
    // Synchronous barrier prevents both cron callbacks and catch-up dispatch
    // from adding work after we take the drain snapshot.
    this.stopping = true;
    this.backupSchedule?.stop();
    this.backupSchedule = null;
    const drain = Promise.all([...this.activeRuns].map(active => active.promise)).then(() => undefined);
    this.stopPromise = (async () => {
      let deadline: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          drain,
          new Promise<never>((_resolve, reject) => {
            deadline = setTimeout(() => reject(new Error(
              "Backup shutdown drain timed out; active run remains owned until completion or process exit; incomplete lease is recoverable after expiry",
            )), drainTimeoutMs);
          }),
        ]);
        logger.info("🛑 Database backup schedule stopped and active runs drained");
      } finally {
        if (deadline) clearTimeout(deadline);
      }
    })();
    // On timeout do NOT mark live work complete/failed or stop its heartbeat.
    // The tracked promise still performs its normal terminal commit + cleanup.
    // If the process exits first, its uncompleted SQL lease naturally expires.
    return this.stopPromise;
  }
}

export const databaseBackupService = new DatabaseBackupService();
