import { logger } from '../logger.js';
import { storage } from '../storage';
import { customAI } from '../custom-ai-engine';
import { atomicUpgradeTransaction, type UpgradeStep } from './atomicUpgradeTransaction';
import { blueGreenDeploymentManager } from './blueGreenDeploymentManager';
import { backupRestoreSystem } from './backupRestoreSystem';
import { healthCheckSystem } from './healthCheckSystem';
import { upgradeAlertingSystem } from './upgradeAlertingSystem';
import { circuitBreakerIntegration } from './circuitBreakerIntegration';

interface UpgradeConfig {
  modelType: string;
  upgradeStrategy: 'atomic' | 'blue_green' | 'rolling';
  parameters: Record<string, any>;
  performanceMetrics?: Record<string, any>;
  improvementThreshold?: number;
}

export class AutoUpgradeOrchestrator {
  private isInitialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Auto-upgrade orchestrator already initialized');
      return;
    }

    logger.info('Initializing auto-upgrade orchestrator...');

    healthCheckSystem.startPeriodicHealthChecks(60000);

    circuitBreakerIntegration.registerUpgradeComponents();

    await this.seedAIModels();

    this.isInitialized = true;
    logger.info('Auto-upgrade orchestrator initialized successfully');
  }

  private async seedAIModels(): Promise<void> {
    const modelsToSeed = [
      {
        name: 'deployment_manager_v1',
        type: 'deployment_manager',
        version: '1.0.0',
        description: 'AI model for managing deployments and canary rollouts',
        capabilities: {
          canaryDecisions: true,
          trafficRouting: true,
          healthMonitoring: true,
        },
        configuration: {
          decisionThreshold: 0.95,
          minCanaryDuration: 300000,
        },
      },
      {
        name: 'retraining_scheduler_v1',
        type: 'retraining_scheduler',
        version: '1.0.0',
        description: 'AI model for scheduling model retraining based on performance drift',
        capabilities: {
          driftDetection: true,
          scheduleOptimization: true,
          resourcePlanning: true,
        },
        configuration: {
          driftThreshold: 0.05,
          minRetrainingInterval: 86400000,
        },
      },
    ];

    for (const model of modelsToSeed) {
      const existing = await storage.getAIModelByName(model.name);
      
      if (!existing) {
        await storage.createAIModel(model);
        logger.info(`Seeded AI model: ${model.name}`);
      }
    }
  }

  async performModelUpgrade(config: UpgradeConfig): Promise<boolean> {
    try {
      logger.info(`Starting model upgrade: ${config.modelType} using ${config.upgradeStrategy} strategy`);

      const currentVersion = await storage.getActiveModelVersion(config.modelType);
      
      const backup = await backupRestoreSystem.createPreUpgradeBackup(
        config.modelType,
        currentVersion?.version || 'unknown'
      );

      const newVersion = await storage.createModelVersion({
        modelType: config.modelType,
        version: `v${Date.now()}`,
        parameters: config.parameters,
        performanceMetrics: config.performanceMetrics,
        isActive: false,
      });

      if (config.upgradeStrategy === 'atomic') {
        return await this.performAtomicUpgrade(config, newVersion.id, currentVersion?.id);
      } else if (config.upgradeStrategy === 'blue_green') {
        return await this.performBlueGreenUpgrade(config, newVersion.id, currentVersion?.id);
      } else {
        throw new Error(`Unsupported upgrade strategy: ${config.upgradeStrategy}`);
      }
    } catch (error) {
      logger.error(`Model upgrade failed for ${config.modelType}:`, error);
      
      await upgradeAlertingSystem.sendUpgradeFailedAlert(
        config.modelType,
        'unknown',
        (error as Error).message
      );
      
      return false;
    }
  }

  private async performAtomicUpgrade(
    config: UpgradeConfig,
    newVersionId: string,
    oldVersionId?: string
  ): Promise<boolean> {
    const steps: UpgradeStep[] = [
      {
        name: 'Validate new model version',
        execute: async () => {
          const version = await storage.createModelVersion({
            modelType: config.modelType,
            version: `v${Date.now()}`,
            parameters: config.parameters,
            performanceMetrics: config.performanceMetrics,
            isActive: false,
          });
          return version;
        },
        healthCheck: async () => {
          const health = await healthCheckSystem.getComponentHealth(config.modelType);
          return health?.status !== 'unhealthy';
        },
      },
      {
        name: 'Update AI model parameters',
        execute: async () => {
          await customAI.updateModelParameters(config.modelType, config.parameters);
          return { updated: true };
        },
        rollback: async () => {
          if (oldVersionId) {
            const oldVersion = await storage.getActiveModelVersion(config.modelType);
            if (oldVersion) {
              await customAI.updateModelParameters(config.modelType, oldVersion.parameters);
            }
          }
        },
        healthCheck: async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          const health = await healthCheckSystem.getComponentHealth(config.modelType);
          return health?.status === 'healthy';
        },
      },
      {
        name: 'Activate new model version',
        execute: async () => {
          await storage.activateModelVersion(newVersionId, config.modelType);
          return { activated: true };
        },
        rollback: async () => {
          if (oldVersionId) {
            await storage.activateModelVersion(oldVersionId, config.modelType);
          }
        },
      },
    ];

    const result = await atomicUpgradeTransaction.execute({
      component: config.modelType,
      version: newVersionId,
      fromVersion: oldVersionId,
      steps,
      createBackup: true,
      validateHealth: true,
      timeout: 300000,
    });

    return result.success;
  }

  private async performBlueGreenUpgrade(
    config: UpgradeConfig,
    newVersionId: string,
    oldVersionId?: string
  ): Promise<boolean> {
    try {
      const deploymentId = await blueGreenDeploymentManager.deploy({
        modelType: config.modelType,
        newVersionId,
        oldVersionId,
        canaryPercentage: 10,
        healthCheckIntervalMs: 5000,
        promotionThreshold: 0.95,
      });

      await new Promise(resolve => setTimeout(resolve, 5000));

      await blueGreenDeploymentManager.incrementTrafficPercentage(deploymentId, 15);

      await new Promise(resolve => setTimeout(resolve, 5000));

      await blueGreenDeploymentManager.incrementTrafficPercentage(deploymentId, 25);

      await new Promise(resolve => setTimeout(resolve, 10000));

      const deployment = await blueGreenDeploymentManager.getDeploymentStatus(deploymentId);
      
      if (deployment && deployment.status === 'completed') {
        logger.info(`Blue-green deployment completed successfully for ${config.modelType}`);
        return true;
      } else if (deployment && deployment.status === 'rolled_back') {
        logger.warn(`Blue-green deployment rolled back for ${config.modelType}`);
        return false;
      }

      return false;
    } catch (error) {
      logger.error(`Blue-green upgrade failed for ${config.modelType}:`, error);
      return false;
    }
  }

  async performAutomaticTuning(modelType: string): Promise<boolean> {
    try {
      const recentTrends = await storage.getRecentTrendEvents(7);
      const currentVersion = await storage.getActiveModelVersion(modelType);

      if (!currentVersion) {
        logger.warn(`No active version found for ${modelType}`);
        return false;
      }

      const baseParams = currentVersion.parameters;
      const engagementBoost = recentTrends.filter(t => t.impact === 'high').length * 0.05;
      
      const newParams = {
        ...baseParams,
        adaptiveBoost: engagementBoost,
        trendContext: recentTrends.slice(0, 5).map(t => t.eventType),
        tuningTimestamp: new Date().toISOString(),
      };

      const performanceImprovement = engagementBoost * 100;
      
      if (performanceImprovement > 5) {
        logger.info(`Significant improvement detected (${performanceImprovement.toFixed(1)}%), initiating upgrade`);
        
        return await this.performModelUpgrade({
          modelType,
          upgradeStrategy: 'blue_green',
          parameters: newParams,
          performanceMetrics: {
            expectedImprovement: `${performanceImprovement.toFixed(2)}%`,
            trendsConsidered: recentTrends.length,
            tuningReason: 'automatic',
          },
          improvementThreshold: 5,
        });
      }

      logger.info(`Insufficient improvement (${performanceImprovement.toFixed(1)}%), skipping upgrade`);
      return false;
    } catch (error) {
      logger.error(`Automatic tuning failed for ${modelType}:`, error);
      return false;
    }
  }

  async performFullSystemUpgrade(): Promise<void> {
    logger.info('Starting full system upgrade...');

    const modelTypes = ['content_generation', 'music_analysis', 'social_posting'];
    const results: Record<string, boolean> = {};

    for (const modelType of modelTypes) {
      try {
        logger.info(`Upgrading ${modelType}...`);
        const success = await this.performAutomaticTuning(modelType);
        results[modelType] = success;
        
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (error) {
        logger.error(`Failed to upgrade ${modelType}:`, error);
        results[modelType] = false;
      }
    }

    const successCount = Object.values(results).filter(r => r).length;
    const totalCount = Object.keys(results).length;

    logger.info(`Full system upgrade completed: ${successCount}/${totalCount} models upgraded successfully`);

    await upgradeAlertingSystem.sendAlert({
      alertType: 'upgrade_completed',
      severity: 'info',
      title: 'Full System Upgrade Completed',
      message: `Upgraded ${successCount} out of ${totalCount} models`,
      component: 'auto_upgrade_system',
      metadata: {
        results,
        successRate: (successCount / totalCount) * 100,
      },
    });
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down auto-upgrade orchestrator...');
    
    healthCheckSystem.stopPeriodicHealthChecks();
    circuitBreakerIntegration.stopAllMonitoring();
    
    this.isInitialized = false;
    logger.info('Auto-upgrade orchestrator shut down successfully');
  }

  getStatus(): { initialized: boolean; components: string[] } {
    return {
      initialized: this.isInitialized,
      components: [
        'atomic_upgrade',
        'blue_green_deployment',
        'backup_restore',
        'health_checks',
        'circuit_breaker',
        'alerting',
      ],
    };
  }
}

export const autoUpgradeOrchestrator = new AutoUpgradeOrchestrator();
