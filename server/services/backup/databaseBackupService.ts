import { spawn } from 'child_process';
import { logger } from '../../logger.js';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { pipeline } from 'stream/promises';

const BACKUP_DIR = '/tmp/database-backups';
const MAX_BACKUPS = 7; // Keep last 7 days of backups
const RPO_TARGET = 24; // Recovery Point Objective: 24 hours (daily backups)
const RTO_TARGET = 30; // Recovery Time Objective: 30 minutes

export class DatabaseBackupService {
  private backupSchedule: cron.ScheduledTask | null = null;
  private isInitialized = false;

  async initialize() {
    // Validate DATABASE_URL before initializing
    if (!process.env.DATABASE_URL) {
      logger.warn('⚠️  DATABASE_URL not configured - backup service disabled');
      return;
    }

    // Only initialize in production or when explicitly enabled
    if (process.env.NODE_ENV !== 'production' && process.env.ENABLE_BACKUPS !== 'true') {
      logger.info('ℹ️  Database backups disabled (not in production)');
      logger.info('   Set ENABLE_BACKUPS=true to enable in development');
      return;
    }

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      logger.info(`Created backup directory: ${BACKUP_DIR}`);
    }

    // Schedule daily backups at 2 AM UTC
    this.scheduleBackups();
    this.isInitialized = true;
    
    logger.info('✅ Database Backup Service initialized');
    logger.info(`   RPO Target: ${RPO_TARGET} hours`);
    logger.info(`   RTO Target: ${RTO_TARGET} minutes`);
    logger.info(`   Backup Schedule: Daily at 2 AM UTC`);
    logger.info(`   Retention: ${MAX_BACKUPS} days`);
  }

  private scheduleBackups() {
    // Schedule backups daily at 2 AM UTC
    this.backupSchedule = cron.schedule('0 2 * * *', async () => {
      logger.info('🔄 Starting scheduled database backup...');
      try {
        await this.createBackup();
        await this.cleanOldBackups();
        logger.info('✅ Scheduled backup completed successfully');
      } catch (error: unknown) {
        logger.error('❌ Scheduled backup failed:', error);
      }
    });

    logger.info('📅 Database backups scheduled (daily at 2 AM UTC)');
  }

  async createBackup(): Promise<string> {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL not configured');
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.sql`);

    return new Promise((resolve, reject) => {
      const pgDump = spawn('pg_dump', [process.env.DATABASE_URL!], {
        env: process.env,
      });

      const writeStream = fs.createWriteStream(backupFile);

      let errorOutput = '';
      let pipelineComplete = false;
      let pgDumpExited = false;
      let pgDumpCode: number | null = null;

      pgDump.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      // Use pipeline for proper stream cleanup and error handling
      pipeline(pgDump.stdout, writeStream)
        .then(() => {
          pipelineComplete = true;
          checkCompletion();
        })
        .catch((err) => {
          logger.error('❌ Backup stream error:', err.message);
          reject(new Error(`Backup stream failed: ${err.message}`));
        });

      pgDump.on('close', (code) => {
        pgDumpExited = true;
        pgDumpCode = code;
        checkCompletion();
      });

      pgDump.on('error', (error) => {
        logger.error('❌ pg_dump process error:', error);
        reject(error);
      });

      // Only resolve/reject after both pipeline completes AND pgDump exits
      function checkCompletion() {
        if (!pipelineComplete || !pgDumpExited) return;
        
        if (pgDumpCode === 0) {
          const stats = fs.statSync(backupFile);
          logger.info(`✅ Backup created successfully: ${backupFile}`);
          logger.info(`   Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
          resolve(backupFile);
        } else {
          logger.error(`❌ Backup failed with code ${pgDumpCode}:`, errorOutput);
          reject(new Error(`Backup failed: ${errorOutput}`));
        }
      }
    });
  }

  private async cleanOldBackups() {
    try {
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('backup-') && f.endsWith('.sql'))
        .map(f => ({
          name: f,
          path: path.join(BACKUP_DIR, f),
          time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime(),
        }))
        .sort((a, b) => b.time - a.time);

      // Keep only the most recent MAX_BACKUPS
      if (files.length > MAX_BACKUPS) {
        const filesToDelete = files.slice(MAX_BACKUPS);
        for (const file of filesToDelete) {
          fs.unlinkSync(file.path);
          logger.info(`🗑️  Deleted old backup: ${file.name}`);
        }
        logger.info(`✅ Cleaned ${filesToDelete.length} old backup(s)`);
      }
    } catch (error: unknown) {
      logger.error('Error cleaning old backups:', error);
    }
  }

  async restoreBackup(backupFile: string): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info(`🔄 Starting database restore from: ${backupFile}`);

      const psql = spawn('psql', [process.env.DATABASE_URL || '', '-f', backupFile], {
        env: process.env,
      });

      let errorOutput = '';
      psql.stderr.on('data', (data) => {
        errorOutput += data.toString();
      });

      psql.on('close', (code) => {
        if (code === 0) {
          logger.info('✅ Database restored successfully');
          resolve();
        } else {
          logger.error(`❌ Restore failed with code ${code}:`, errorOutput);
          reject(new Error(`Restore failed: ${errorOutput}`));
        }
      });

      psql.on('error', (error) => {
        logger.error('❌ psql process error:', error);
        reject(error);
      });
    });
  }

  async listBackups() {
    try {
      const files = fs.readdirSync(BACKUP_DIR)
        .filter(f => f.startsWith('backup-') && f.endsWith('.sql'))
        .map(f => {
          const stats = fs.statSync(path.join(BACKUP_DIR, f));
          return {
            name: f,
            date: stats.mtime,
            size: stats.size,
            path: path.join(BACKUP_DIR, f),
          };
        })
        .sort((a, b) => b.date.getTime() - a.date.getTime());

      return files;
    } catch (error: unknown) {
      logger.error('Error listing backups:', error);
      return [];
    }
  }

  getBackupMetrics() {
    return {
      rpo: RPO_TARGET,
      rto: RTO_TARGET,
      retentionDays: MAX_BACKUPS,
      schedule: 'Daily at 2 AM UTC',
      backupDirectory: BACKUP_DIR,
    };
  }

  stop() {
    if (this.backupSchedule) {
      this.backupSchedule.stop();
      logger.info('🛑 Database backup schedule stopped');
    }
  }
}

export const databaseBackupService = new DatabaseBackupService();
