import { spawn } from "child_process";
import { logger } from "../../logger.js";
import cron from "node-cron";
import fsPromises from "fs/promises";
import { storageService } from "../storageService.js";
import { env } from "../../config/env.js";

const BACKUP_PREFIX = "database-backups";
const BACKUP_INDEX_KEY = `${BACKUP_PREFIX}/index.json`;
const MAX_BACKUPS = 7;
const RPO_TARGET = 24;
const RTO_TARGET = 30;

interface BackupEntry {
  name: string;
  key: string;
  date: string;
  size: number;
}

async function loadIndex(): Promise<BackupEntry[]> {
  try {
    const buf = await storageService.downloadFile(BACKUP_INDEX_KEY);
    return JSON.parse(buf.toString("utf-8")) as BackupEntry[];
  } catch {
    return [];
  }
}

async function saveIndex(entries: BackupEntry[]): Promise<void> {
  await storageService.uploadFile(
    Buffer.from(JSON.stringify(entries, null, 2), "utf-8"),
    BACKUP_INDEX_KEY,
    "application/json",
  );
}

export class DatabaseBackupService {
  private backupSchedule: cron.ScheduledTask | null = null;
  private isInitialized = false;

  async initialize() {
    if (!env.DATABASE_URL) {
      logger.warn("⚠️  DATABASE_URL not configured - backup service disabled");
      return;
    }

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
    this.backupSchedule = cron.schedule("0 2 * * *", async () => {
      logger.info("🔄 Starting scheduled database backup...");
      try {
        await this.createBackup();
        await this.cleanOldBackups();
        logger.info("✅ Scheduled backup completed successfully");
      } catch (error: unknown) {
        logger.warn({ err: error }, "❌ Scheduled backup failed:");
      }
    });

    logger.info("📅 Database backups scheduled (daily at 2 AM UTC)");
  }

  async createBackup(): Promise<string> {
    if (!env.DATABASE_URL) {
      throw new Error("DATABASE_URL not configured");
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `backup-${timestamp}.sql`;
    const key = `${BACKUP_PREFIX}/${name}`;

    const tmpPath = `/tmp/${name}`;

    await new Promise<void>((resolve, reject) => {
      const pgDump = spawn("pg_dump", [env.DATABASE_URL!], {
        env: process.env,
      });
      const writeStream = fs.createWriteStream(tmpPath);
      let errorOutput = "";
      let pipelineDone = false;
      let exited = false;
      let exitCode: number | null = null;
      let settled = false;

      // Ensure the write stream is always closed when we reject — otherwise the
      // file descriptor leaks until the next GC cycle.
      function fail(err: Error) {
        if (settled) return;
        settled = true;
        writeStream.destroy();
        reject(err);
      }

      pgDump.stderr.on("data", (d) => {
        errorOutput += d.toString();
      });

      writeStream.on("finish", () => {
        pipelineDone = true;
        check();
      });
      writeStream.on("error", (err) => fail(err));

      // Absorb EPIPE on pgDump stdout in case writeStream closes early
      pgDump.stdout.on("error", (e: NodeJS.ErrnoException) => {
        if (e.code !== "EPIPE" && e.code !== "ECONNRESET") fail(e);
      });

      pgDump.stdout.pipe(writeStream);

      pgDump.on("close", (code) => {
        exited = true;
        exitCode = code;
        check();
      });

      pgDump.on("error", (err) => fail(err));

      function check() {
        if (!pipelineDone || !exited) return;
        if (settled) return;
        settled = true;
        if (exitCode === 0) resolve();
        else
          reject(
            new Error(`pg_dump failed (code ${exitCode}): ${errorOutput}`),
          );
      }
    });

    // Production-grade: stat the file first, refuse if it would OOM the box,
    // and use async readFile so we don't block the event loop. The hard cap
    // protects the process — once dumps approach this size, the upload path
    // must be migrated to multipart/streaming via storageService.uploadStream.
    const stats = await fs.promises.stat(tmpPath);
    const sizeBytes = stats.size;
    const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);

    // Hard guard: anything bigger than 1 GiB will likely OOM Replit
    // containers. Better to fail loudly than silently kill the process.
    const HARD_CAP_BYTES = 1024 * 1024 * 1024;
    if (sizeBytes > HARD_CAP_BYTES) {
      await fs.promises.unlink(tmpPath).catch(() => undefined);
      throw new Error(
        `Backup ${name} is ${sizeMB} MB which exceeds the 1 GiB single-shot cap. ` +
          `Implement multipart streaming in storageService before retrying.`,
      );
    }

    // Heap headroom warning at 256 MB so ops have lead time.
    if (sizeBytes > 256 * 1024 * 1024) {
      logger.warn(
        `⚠️  Backup ${name} is ${sizeMB} MB — approaching memory limit. ` +
          `Plan for streaming upload before the next doubling.`,
      );
    }

    const sqlBuffer = await fs.promises.readFile(tmpPath);
    await fs.promises.unlink(tmpPath).catch(() => undefined);

    await storageService.uploadFile(sqlBuffer, key, "application/sql");

    logger.info(`✅ Backup stored in Pocket Dimension: ${name} (${sizeMB} MB)`);

    const index = await loadIndex();
    index.push({ name, key, date: new Date().toISOString(), size: sizeBytes });
    await saveIndex(index);

    return key;
  }

  private async cleanOldBackups(): Promise<void> {
    try {
      const index = await loadIndex();
      const sorted = [...index].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      );

      if (sorted.length > MAX_BACKUPS) {
        const toDelete = sorted.slice(MAX_BACKUPS);
        for (const entry of toDelete) {
          try {
            await storageService.deleteFile(entry.key);
            logger.info(`🗑️  Deleted old backup: ${entry.name}`);
          } catch {
            logger.warn(`Could not delete backup ${entry.name} from storage`);
          }
        }
        await saveIndex(sorted.slice(0, MAX_BACKUPS));
        logger.info(`✅ Cleaned ${toDelete.length} old backup(s)`);
      }
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error cleaning old backups:");
    }
  }

  async restoreBackup(key: string): Promise<void> {
    const tmpPath = `/tmp/restore-${Date.now()}.sql`;
    try {
      const buf = await storageService.downloadFile(key);
      await fsPromises.writeFile(tmpPath, buf);

      await new Promise<void>((resolve, reject) => {
        const psql = spawn("psql", [env.DATABASE_URL || "", "-f", tmpPath], {
          env: process.env,
        });
        let errorOutput = "";
        psql.stderr.on("data", (d) => {
          errorOutput += d.toString();
        });
        psql.on("close", (code) => {
          if (code === 0) {
            logger.info("✅ Database restored successfully");
            resolve();
          } else {
            reject(new Error(`Restore failed (code ${code}): ${errorOutput}`));
          }
        });
        psql.on("error", reject);
      });
    } finally {
      try {
        await fsPromises.unlink(tmpPath);
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
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
        .map((e) => ({
          name: e.name,
          date: new Date(e.date),
          size: e.size,
          key: e.key,
        }));
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error listing backups:");
      return [];
    }
  }

  getBackupMetrics() {
    return {
      rpo: RPO_TARGET,
      rto: RTO_TARGET,
      retentionDays: MAX_BACKUPS,
      schedule: "Daily at 2 AM UTC",
      storageBackend: "Pocket Dimension",
    };
  }

  stop() {
    if (this.backupSchedule) {
      this.backupSchedule.stop();
      logger.info("🛑 Database backup schedule stopped");
    }
  }
}

export const databaseBackupService = new DatabaseBackupService();
