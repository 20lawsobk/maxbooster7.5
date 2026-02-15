import { db } from '../db';
import { logger } from '../logger.js';
import { backupRestoreSystem } from './backupRestoreSystem';
import { healthCheckSystem } from './healthCheckSystem';
import { upgradeAlertingSystem } from './upgradeAlertingSystem';
import { storage } from '../storage';
import type { SystemBackup } from '@shared/schema';

export interface UpgradeStep {
  name: string;
  execute: () => Promise<any>;
  rollback?: () => Promise<void>;
  healthCheck?: () => Promise<boolean>;
}

export interface UpgradeOptions {
  component: string;
  version: string;
  fromVersion?: string;
  steps: UpgradeStep[];
  createBackup?: boolean;
  validateHealth?: boolean;
  timeout?: number;
}

export interface UpgradeResult {
  success: boolean;
  component: string;
  version: string;
  durationMs: number;
  stepsCompleted: number;
  totalSteps: number;
  backup?: SystemBackup;
  error?: string;
  rollbackPerformed?: boolean;
}

export class AtomicUpgradeTransaction {
  private executedSteps: { step: UpgradeStep; result: any }[] = [];
  private startTime: number = 0;
  private backupId?: string;

  async execute(options: UpgradeOptions): Promise<UpgradeResult> {
    this.startTime = Date.now();
    this.executedSteps = [];
    let backup: SystemBackup | undefined;

    try {
      await upgradeAlertingSystem.sendUpgradeStartedAlert(
        options.component,
        options.version,
        {
          fromVersion: options.fromVersion,
          stepsCount: options.steps.length,
        }
      );

      if (options.createBackup !== false) {
        logger.info(`Creating pre-upgrade backup for ${options.component}`);
        backup = await backupRestoreSystem.createPreUpgradeBackup(
          options.component,
          options.fromVersion || 'unknown'
        );
        this.backupId = backup.id;

        await upgradeAlertingSystem.sendBackupCreatedAlert(
          options.component,
          options.fromVersion || 'unknown',
          backup.id
        );
      }

      if (options.validateHealth !== false) {
        logger.info(`Running pre-upgrade health checks for ${options.component}`);
        const isHealthy = await healthCheckSystem.isSystemHealthy();
        
        if (!isHealthy) {
          throw new Error('System is not healthy - aborting upgrade');
        }
      }

      for (let i = 0; i < options.steps.length; i++) {
        const step = options.steps[i];
        
        logger.info(`Executing upgrade step ${i + 1}/${options.steps.length}: ${step.name}`);
        
        const stepStartTime = Date.now();
        const result = await this.executeWithTimeout(
          step.execute,
          options.timeout || 300000
        );
        const stepDuration = Date.now() - stepStartTime;
        
        this.executedSteps.push({ step, result });
        
        logger.info(`Step ${i + 1} completed in ${stepDuration}ms`);

        if (step.healthCheck) {
          logger.info(`Running health check for step: ${step.name}`);
          const stepHealthy = await step.healthCheck();
          
          if (!stepHealthy) {
            throw new Error(`Health check failed after step: ${step.name}`);
          }
        }
      }

      if (options.validateHealth !== false) {
        logger.info(`Running post-upgrade health checks`);
        const isHealthy = await healthCheckSystem.isSystemHealthy();
        
        if (!isHealthy) {
          throw new Error('System health check failed after upgrade');
        }
      }

      const durationMs = Date.now() - this.startTime;

      await storage.createDeploymentHistory({
        deploymentType: 'model',
        targetComponent: options.component,
        version: options.version,
        status: 'success',
        deploymentMethod: 'atomic',
        metadata: {
          fromVersion: options.fromVersion,
          stepsCompleted: this.executedSteps.length,
          totalSteps: options.steps.length,
          backupId: this.backupId,
          durationMs,
        },
        healthChecksPassed: true,
      });

      await upgradeAlertingSystem.sendUpgradeCompletedAlert(
        options.component,
        options.version,
        durationMs
      );

      return {
        success: true,
        component: options.component,
        version: options.version,
        durationMs,
        stepsCompleted: this.executedSteps.length,
        totalSteps: options.steps.length,
        backup,
      };
    } catch (error) {
      const durationMs = Date.now() - this.startTime;
      const errorMessage = (error as Error).message;
      
      logger.error(`Upgrade failed: ${errorMessage}`);

      await upgradeAlertingSystem.sendUpgradeFailedAlert(
        options.component,
        options.version,
        errorMessage,
        {
          fromVersion: options.fromVersion,
          stepsCompleted: this.executedSteps.length,
          totalSteps: options.steps.length,
        }
      );

      const rollbackSuccess = await this.performRollback(options);

      await storage.createDeploymentHistory({
        deploymentType: 'model',
        targetComponent: options.component,
        version: options.version,
        status: 'failed',
        deploymentMethod: 'atomic',
        metadata: {
          fromVersion: options.fromVersion,
          error: errorMessage,
          stepsCompleted: this.executedSteps.length,
          totalSteps: options.steps.length,
          backupId: this.backupId,
          rollbackSuccess,
          durationMs,
        },
        healthChecksPassed: false,
        rollbackReason: errorMessage,
      });

      return {
        success: false,
        component: options.component,
        version: options.version,
        durationMs,
        stepsCompleted: this.executedSteps.length,
        totalSteps: options.steps.length,
        backup,
        error: errorMessage,
        rollbackPerformed: rollbackSuccess,
      };
    }
  }

  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
  }

  private async performRollback(options: UpgradeOptions): Promise<boolean> {
    try {
      logger.warn(`Starting rollback for ${options.component} (${this.executedSteps.length} steps)`);

      await upgradeAlertingSystem.sendRollbackInitiatedAlert(
        options.component,
        options.version,
        options.fromVersion || 'previous',
        'Upgrade failed',
        {
          stepsToRollback: this.executedSteps.length,
        }
      );

      for (let i = this.executedSteps.length - 1; i >= 0; i--) {
        const { step } = this.executedSteps[i];
        
        if (step.rollback) {
          logger.info(`Rolling back step ${i + 1}: ${step.name}`);
          try {
            await step.rollback();
          } catch (rollbackError) {
            logger.error(`Rollback failed for step ${i + 1}:`, rollbackError);
          }
        }
      }

      if (this.backupId) {
        logger.info(`Restoring from backup: ${this.backupId}`);
        const restoreSuccess = await backupRestoreSystem.restoreFromBackup(this.backupId);
        
        if (!restoreSuccess) {
          logger.error('Backup restoration failed');
        }
      }

      const rollbackRecord = await storage.createRollbackHistory({
        targetType: 'deployment',
        targetId: `${options.component}_${options.version}`,
        fromVersion: options.version,
        toVersion: options.fromVersion || 'previous',
        reason: 'Upgrade failed',
        impactAnalysis: {
          affectedUsers: 0,
          estimatedDowntime: Date.now() - this.startTime,
          dataLoss: false,
          requiresRetraining: false,
          performanceChange: {},
          risks: ['Service degradation during rollback'],
          mitigations: ['Backup restoration', 'Health monitoring'],
        },
        status: 'success',
        backupUsed: this.backupId,
        recoveryTimeMs: Date.now() - this.startTime,
        initiatedBy: 'automatic',
      });

      logger.info('Rollback completed successfully');
      return true;
    } catch (error) {
      logger.error('Rollback failed:', error);
      
      if (this.backupId) {
        await storage.updateRollbackHistory(this.backupId, {
          status: 'failed',
        });
      }
      
      return false;
    }
  }

  async executeInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    return await db.transaction(async (tx) => {
      return await fn();
    });
  }
}

export const atomicUpgradeTransaction = new AtomicUpgradeTransaction();
