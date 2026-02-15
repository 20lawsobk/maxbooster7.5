import { pocketManager, PocketDimension } from '../pocket-dimension/index';
import { logger } from '../logger.js';
import { storage } from '../storage';
import type { SystemBackup, ModelVersion, DeploymentHistory, HealthCheck } from '@shared/schema';

interface PocketBackupOptions {
  component: string;
  version: string;
  data: any;
  metadata?: Record<string, any>;
  compress?: boolean;
}

export class PocketBackupService {
  private backupPocket: PocketDimension | null = null;
  private modelVersionPocket: PocketDimension | null = null;
  private deploymentPocket: PocketDimension | null = null;
  private healthDataPocket: PocketDimension | null = null;
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    logger.info('[PocketBackup] Initializing pocket dimension storage...');

    try {
      this.backupPocket = await pocketManager.openPocket('auto-upgrade-backups', {
        compressionLevel: 9,
        enableDeduplication: true,
        chunkSize: 512 * 1024,
      });

      this.modelVersionPocket = await pocketManager.openPocket('model-versions', {
        compressionLevel: 9,
        enableDeduplication: true,
        chunkSize: 1024 * 1024,
      });

      this.deploymentPocket = await pocketManager.openPocket('deployment-history', {
        compressionLevel: 6,
        enableDeduplication: true,
        chunkSize: 256 * 1024,
      });

      this.healthDataPocket = await pocketManager.openPocket('health-check-data', {
        compressionLevel: 9,
        enableDeduplication: true,
        chunkSize: 128 * 1024,
      });

      this.isInitialized = true;
      logger.info('[PocketBackup] All pocket dimensions initialized successfully');
    } catch (error) {
      logger.error('[PocketBackup] Failed to initialize pocket dimensions:', error);
      throw error;
    }
  }

  async createBackup(options: PocketBackupOptions): Promise<string> {
    if (!this.isInitialized) await this.initialize();
    if (!this.backupPocket) throw new Error('Backup pocket not initialized');

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = `${options.component}-${options.version}-${timestamp}`;
    const backupPath = `backups/${options.component}/${backupId}.json`;

    const backupData = {
      id: backupId,
      component: options.component,
      version: options.version,
      timestamp: new Date().toISOString(),
      data: options.data,
      metadata: options.metadata || {},
    };

    const serialized = JSON.stringify(backupData, null, 2);
    
    await this.backupPocket.write(backupPath, serialized);

    const stats = this.backupPocket.getStats();
    logger.info(
      `[PocketBackup] Created backup ${backupId} (compression: ${stats.compressionRatio.toFixed(2)}x)`
    );

    const backupRecord = await storage.createSystemBackup({
      backupType: 'full',
      component: options.component,
      version: options.version,
      backupPath,
      sizeBytes: serialized.length,
      checksum: '',
      metadata: {
        pocketStorage: true,
        compressionRatio: stats.compressionRatio,
        ...options.metadata,
      },
      status: 'completed',
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    return backupRecord.id;
  }

  async restoreBackup(backupId: string): Promise<any> {
    if (!this.isInitialized) await this.initialize();
    if (!this.backupPocket) throw new Error('Backup pocket not initialized');

    const backupRecord = await storage.getSystemBackup(backupId);
    
    if (!backupRecord) {
      throw new Error(`Backup not found: ${backupId}`);
    }

    const data = await this.backupPocket.read(backupRecord.backupPath);
    const parsed = JSON.parse(data.toString());

    logger.info(`[PocketBackup] Restored backup ${backupId}`);

    return parsed.data;
  }

  async storeModelVersion(modelVersion: ModelVersion, modelData: any): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.modelVersionPocket) throw new Error('Model version pocket not initialized');

    const modelPath = `models/${modelVersion.modelType}/${modelVersion.version}.json`;

    const versionData = {
      ...modelVersion,
      modelData,
      storedAt: new Date().toISOString(),
    };

    await this.modelVersionPocket.write(modelPath, JSON.stringify(versionData, null, 2));

    const stats = this.modelVersionPocket.getStats();
    logger.info(
      `[PocketBackup] Stored model version ${modelVersion.modelType}/${modelVersion.version} ` +
      `(dedup savings: ${stats.deduplicationSavings.toFixed(1)}%)`
    );
  }

  async loadModelVersion(modelType: string, version: string): Promise<any> {
    if (!this.isInitialized) await this.initialize();
    if (!this.modelVersionPocket) throw new Error('Model version pocket not initialized');

    const modelPath = `models/${modelType}/${version}.json`;

    try {
      const data = await this.modelVersionPocket.read(modelPath);
      return JSON.parse(data.toString());
    } catch (error) {
      logger.warn(`[PocketBackup] Failed to load model version ${modelType}/${version}:`, error);
      return null;
    }
  }

  async archiveDeployment(deployment: DeploymentHistory, additionalData?: any): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.deploymentPocket) throw new Error('Deployment pocket not initialized');

    const deploymentPath = `deployments/${deployment.targetComponent}/${deployment.id}.json`;

    const archiveData = {
      ...deployment,
      additionalData,
      archivedAt: new Date().toISOString(),
    };

    await this.deploymentPocket.write(deploymentPath, JSON.stringify(archiveData, null, 2));
  }

  async batchArchiveHealthChecks(component: string, healthChecks: HealthCheck[]): Promise<void> {
    if (!this.isInitialized) await this.initialize();
    if (!this.healthDataPocket) throw new Error('Health data pocket not initialized');

    const dateStr = new Date().toISOString().split('T')[0];
    const healthPath = `health/${component}/${dateStr}.json`;

    const existingData: HealthCheck[] = [];
    
    try {
      const existing = await this.healthDataPocket.read(healthPath);
      existingData.push(...JSON.parse(existing.toString()));
    } catch {
      // No existing data
    }

    existingData.push(...healthChecks);

    await this.healthDataPocket.write(healthPath, JSON.stringify(existingData, null, 2));

    logger.info(`[PocketBackup] Archived ${healthChecks.length} health checks for ${component}`);
  }

  async getHealthHistory(component: string, days: number): Promise<HealthCheck[]> {
    if (!this.isInitialized) await this.initialize();
    if (!this.healthDataPocket) throw new Error('Health data pocket not initialized');

    const allChecks: HealthCheck[] = [];
    const entries = await this.healthDataPocket.list(`health/${component}/`);

    for (const entry of entries.slice(-days)) {
      try {
        const data = await this.healthDataPocket.read(entry.path);
        const checks = JSON.parse(data.toString());
        allChecks.push(...checks);
      } catch (error) {
        logger.warn(`[PocketBackup] Failed to read health history from ${entry.path}:`, error);
      }
    }

    return allChecks;
  }

  async getStorageStats(): Promise<{
    backups: { totalSize: number; compressedSize: number; ratio: number; count: number };
    models: { totalSize: number; compressedSize: number; ratio: number; dedupSavings: number };
    deployments: { totalSize: number; compressedSize: number; ratio: number };
    health: { totalSize: number; compressedSize: number; ratio: number };
    global: { totalSize: number; compressedSize: number; overallRatio: number };
  }> {
    if (!this.isInitialized) await this.initialize();

    const backupStats = this.backupPocket?.getStats() || { totalSize: 0, compressedSize: 0, compressionRatio: 1, deduplicationSavings: 0, totalEntries: 0 };
    const modelStats = this.modelVersionPocket?.getStats() || { totalSize: 0, compressedSize: 0, compressionRatio: 1, deduplicationSavings: 0, totalEntries: 0 };
    const deploymentStats = this.deploymentPocket?.getStats() || { totalSize: 0, compressedSize: 0, compressionRatio: 1, deduplicationSavings: 0, totalEntries: 0 };
    const healthStats = this.healthDataPocket?.getStats() || { totalSize: 0, compressedSize: 0, compressionRatio: 1, deduplicationSavings: 0, totalEntries: 0 };

    const totalSize = backupStats.totalSize + modelStats.totalSize + deploymentStats.totalSize + healthStats.totalSize;
    const totalCompressed = backupStats.compressedSize + modelStats.compressedSize + deploymentStats.compressedSize + healthStats.compressedSize;

    return {
      backups: {
        totalSize: backupStats.totalSize,
        compressedSize: backupStats.compressedSize,
        ratio: backupStats.compressionRatio,
        count: backupStats.totalEntries,
      },
      models: {
        totalSize: modelStats.totalSize,
        compressedSize: modelStats.compressedSize,
        ratio: modelStats.compressionRatio,
        dedupSavings: modelStats.deduplicationSavings,
      },
      deployments: {
        totalSize: deploymentStats.totalSize,
        compressedSize: deploymentStats.compressedSize,
        ratio: deploymentStats.compressionRatio,
      },
      health: {
        totalSize: healthStats.totalSize,
        compressedSize: healthStats.compressedSize,
        ratio: healthStats.compressionRatio,
      },
      global: {
        totalSize,
        compressedSize: totalCompressed,
        overallRatio: totalSize > 0 ? totalSize / totalCompressed : 1,
      },
    };
  }

  async createNestedDimension(component: string, dimensionName: string): Promise<PocketDimension> {
    if (!this.isInitialized) await this.initialize();
    if (!this.backupPocket) throw new Error('Backup pocket not initialized');

    logger.info(`[PocketBackup] Creating nested dimension: ${component}/${dimensionName}`);

    const nested = await this.backupPocket.createNestedDimension(
      `${component}/${dimensionName}`,
      {
        compressionLevel: 9,
        enableDeduplication: true,
      }
    );

    logger.info(`[PocketBackup] Nested dimension created successfully (dimension within dimension!)`);

    return nested;
  }

  async cleanup(olderThanDays: number): Promise<number> {
    if (!this.isInitialized) await this.initialize();

    let cleaned = 0;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    logger.info(`[PocketBackup] Cleaning up data older than ${olderThanDays} days`);

    return cleaned;
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) return;

    logger.info('[PocketBackup] Shutting down pocket dimension storage...');

    if (this.backupPocket) await pocketManager.closePocket('auto-upgrade-backups');
    if (this.modelVersionPocket) await pocketManager.closePocket('model-versions');
    if (this.deploymentPocket) await pocketManager.closePocket('deployment-history');
    if (this.healthDataPocket) await pocketManager.closePocket('health-check-data');

    this.backupPocket = null;
    this.modelVersionPocket = null;
    this.deploymentPocket = null;
    this.healthDataPocket = null;
    this.isInitialized = false;

    logger.info('[PocketBackup] Shutdown complete');
  }
}

export const pocketBackupService = new PocketBackupService();
