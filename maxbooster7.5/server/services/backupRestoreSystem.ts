import { storage } from '../storage';
import { logger } from '../logger.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { InsertSystemBackup, SystemBackup } from '@shared/schema';

interface BackupOptions {
  component: string;
  version: string;
  backupType: 'full' | 'incremental' | 'model' | 'configuration';
  data: any;
  metadata?: Record<string, unknown>;
}

interface RestoreOptions {
  backupId: string;
  validateOnly?: boolean;
}

export class BackupRestoreSystem {
  private backupDir: string;
  private maxBackupAge: number = 30 * 24 * 60 * 60 * 1000; // 30 days

  constructor() {
    this.backupDir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
    this.ensureBackupDir();
  }

  private async ensureBackupDir(): Promise<void> {
    try {
      await fs.access(this.backupDir);
    } catch {
      await fs.mkdir(this.backupDir, { recursive: true });
    }
  }

  async createBackup(options: BackupOptions): Promise<SystemBackup> {
    const startTime = Date.now();
    
    try {
      const backupId = crypto.randomUUID();
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `${options.component}-${options.version}-${timestamp}.json`;
      const backupPath = path.join(this.backupDir, fileName);

      const backupData = {
        version: options.version,
        component: options.component,
        backupType: options.backupType,
        timestamp: new Date().toISOString(),
        data: options.data,
        metadata: options.metadata || {},
      };

      const serializedData = JSON.stringify(backupData, null, 2);
      const checksum = crypto.createHash('sha256').update(serializedData).digest('hex');

      await fs.writeFile(backupPath, serializedData, 'utf8');

      const stats = await fs.stat(backupPath);

      const expiresAt = new Date();
      expiresAt.setTime(expiresAt.getTime() + this.maxBackupAge);

      const backup = await storage.createSystemBackup({
        backupType: options.backupType,
        component: options.component,
        version: options.version,
        backupPath,
        sizeBytes: stats.size,
        checksum,
        metadata: options.metadata,
        status: 'completed',
        expiresAt,
      });

      const duration = Date.now() - startTime;
      logger.info(`Backup created: ${options.component} v${options.version} (${stats.size} bytes, ${duration}ms)`);

      return backup;
    } catch (error) {
      logger.error('Backup creation failed:', error);
      
      const backup = await storage.createSystemBackup({
        backupType: options.backupType,
        component: options.component,
        version: options.version,
        backupPath: '',
        sizeBytes: 0,
        checksum: '',
        metadata: { error: (error as Error).message, ...options.metadata },
        status: 'failed',
        expiresAt: new Date(),
      });

      throw error;
    }
  }

  async restoreBackup(options: RestoreOptions): Promise<any> {
    const startTime = Date.now();
    
    try {
      const backup = await storage.getSystemBackup(options.backupId);
      
      if (!backup) {
        throw new Error(`Backup not found: ${options.backupId}`);
      }

      if (backup.status !== 'completed') {
        throw new Error(`Backup status is not completed: ${backup.status}`);
      }

      const backupData = await fs.readFile(backup.backupPath, 'utf8');
      const checksum = crypto.createHash('sha256').update(backupData).digest('hex');

      if (checksum !== backup.checksum) {
        throw new Error('Backup checksum mismatch - data may be corrupted');
      }

      const parsedData = JSON.parse(backupData);

      if (options.validateOnly) {
        logger.info(`Backup validation successful: ${backup.component} v${backup.version}`);
        return { valid: true, data: parsedData };
      }

      await storage.updateSystemBackup(options.backupId, {
        restoredAt: new Date(),
      });

      const duration = Date.now() - startTime;
      logger.info(`Backup restored: ${backup.component} v${backup.version} (${duration}ms)`);

      return parsedData.data;
    } catch (error) {
      logger.error('Backup restore failed:', error);
      throw error;
    }
  }

  async createPreUpgradeBackup(component: string, version: string): Promise<SystemBackup> {
    logger.info(`Creating pre-upgrade backup: ${component} v${version}`);

    const data = await this.captureComponentState(component);

    return await this.createBackup({
      component,
      version,
      backupType: 'full',
      data,
      metadata: {
        purpose: 'pre_upgrade',
        automatic: true,
      },
    });
  }

  private async captureComponentState(component: string): Promise<any> {
    switch (component) {
      case 'model_version':
        const activeModels = await Promise.all([
          storage.getActiveModelVersion('content_generation'),
          storage.getActiveModelVersion('music_analysis'),
          storage.getActiveModelVersion('social_posting'),
        ]);
        return { activeModels };

      case 'configuration':
        return {
          env: process.env,
          timestamp: new Date().toISOString(),
        };

      case 'database':
        return {
          message: 'Database backup requires external tools (pg_dump)',
          timestamp: new Date().toISOString(),
        };

      default:
        return {
          component,
          timestamp: new Date().toISOString(),
        };
    }
  }

  async restoreFromBackup(backupId: string): Promise<boolean> {
    try {
      const data = await this.restoreBackup({ backupId });
      return true;
    } catch (error) {
      logger.error(`Restore failed for backup ${backupId}:`, error);
      return false;
    }
  }

  async cleanupExpiredBackups(): Promise<number> {
    const now = new Date();
    let cleanedCount = 0;

    try {
      const files = await fs.readdir(this.backupDir);
      
      for (const file of files) {
        const filePath = path.join(this.backupDir, file);
        const stats = await fs.stat(filePath);
        const age = now.getTime() - stats.mtime.getTime();

        if (age > this.maxBackupAge) {
          await fs.unlink(filePath);
          cleanedCount++;
          logger.info(`Deleted expired backup: ${file}`);
        }
      }
    } catch (error) {
      logger.error('Backup cleanup failed:', error);
    }

    return cleanedCount;
  }

  async getLatestBackup(component: string, backupType?: string): Promise<SystemBackup | undefined> {
    return await storage.getLatestBackup(component, backupType);
  }

  async validateBackup(backupId: string): Promise<boolean> {
    try {
      await this.restoreBackup({ backupId, validateOnly: true });
      return true;
    } catch (error) {
      logger.error(`Backup validation failed for ${backupId}:`, error);
      return false;
    }
  }
}

export const backupRestoreSystem = new BackupRestoreSystem();
