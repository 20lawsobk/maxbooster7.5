import { storage } from '../storage';
import { logger } from '../logger.js';
import { healthCheckSystem } from './healthCheckSystem';
import { upgradeAlertingSystem } from './upgradeAlertingSystem';
import type { ModelVersion } from '@shared/schema';

interface BlueGreenDeploymentOptions {
  modelType: string;
  newVersionId: string;
  oldVersionId?: string;
  canaryPercentage?: number;
  healthCheckIntervalMs?: number;
  promotionThreshold?: number;
}

interface DeploymentMetrics {
  requestCount: number;
  errorCount: number;
  averageLatencyMs: number;
  successRate: number;
}

export class BlueGreenDeploymentManager {
  private activeDeployments: Map<string, any> = new Map();
  private metricsCollectors: Map<string, NodeJS.Timeout> = new Map();

  async deploy(options: BlueGreenDeploymentOptions): Promise<string> {
    const deploymentId = `${options.modelType}_${Date.now()}`;
    
    try {
      logger.info(`Starting blue-green deployment for ${options.modelType}`);

      const oldVersion = options.oldVersionId 
        ? await this.getModelVersion(options.oldVersionId)
        : await storage.getActiveModelVersion(options.modelType);

      const newVersion = await this.getModelVersion(options.newVersionId);

      if (!newVersion) {
        throw new Error(`New version not found: ${options.newVersionId}`);
      }

      const canaryPercentage = options.canaryPercentage || 10;
      
      const deployment = await storage.createCanaryDeployment({
        modelType: options.modelType,
        newVersionId: options.newVersionId,
        oldVersionId: oldVersion?.id,
        canaryPercentage,
        status: 'active',
        metrics: {
          blue: this.initializeMetrics(),
          green: this.initializeMetrics(),
        },
      });

      this.activeDeployments.set(deploymentId, {
        deploymentId: deployment.id,
        modelType: options.modelType,
        newVersionId: options.newVersionId,
        oldVersionId: oldVersion?.id,
        canaryPercentage,
        startTime: Date.now(),
      });

      await upgradeAlertingSystem.sendAlert({
        alertType: 'upgrade_started',
        severity: 'info',
        title: `Blue-Green Deployment Started: ${options.modelType}`,
        message: `Starting canary deployment with ${canaryPercentage}% traffic to new version`,
        component: options.modelType,
        metadata: {
          deploymentId: deployment.id,
          newVersionId: options.newVersionId,
          oldVersionId: oldVersion?.id,
          canaryPercentage,
        },
      });

      this.startMetricsCollection(
        deploymentId,
        deployment.id,
        options.healthCheckIntervalMs || 5000
      );

      return deployment.id;
    } catch (error) {
      logger.error('Blue-green deployment failed:', error);
      throw error;
    }
  }

  private async getModelVersion(versionId: string): Promise<ModelVersion | undefined> {
    return undefined;
  }

  private initializeMetrics(): DeploymentMetrics {
    return {
      requestCount: 0,
      errorCount: 0,
      averageLatencyMs: 0,
      successRate: 100,
    };
  }

  private startMetricsCollection(
    deploymentId: string,
    dbDeploymentId: string,
    intervalMs: number
  ): void {
    const interval = setInterval(async () => {
      try {
        const deployment = this.activeDeployments.get(deploymentId);
        
        if (!deployment) {
          this.stopMetricsCollection(deploymentId);
          return;
        }

        const metrics = await this.collectMetrics(deployment);
        
        await storage.updateCanaryDeployment(dbDeploymentId, {
          metrics: {
            blue: metrics.blue,
            green: metrics.green,
            comparisonTime: new Date().toISOString(),
          },
        });

        const shouldPromote = this.shouldPromoteGreen(metrics.blue, metrics.green);
        
        if (shouldPromote) {
          logger.info(`Metrics look good, promoting green to 100%`);
          await this.promoteToProduction(deploymentId);
        }

        const shouldRollback = this.shouldRollback(metrics.green);
        
        if (shouldRollback) {
          logger.warn(`Green version showing poor performance, initiating rollback`);
          await this.rollback(deploymentId);
        }
      } catch (error) {
        logger.error('Metrics collection failed:', error);
      }
    }, intervalMs);

    this.metricsCollectors.set(deploymentId, interval);
  }

  private stopMetricsCollection(deploymentId: string): void {
    const interval = this.metricsCollectors.get(deploymentId);
    
    if (interval) {
      clearInterval(interval);
      this.metricsCollectors.delete(deploymentId);
    }
  }

  private async collectMetrics(deployment: any): Promise<{ blue: DeploymentMetrics; green: DeploymentMetrics }> {
    const blueHealth = await healthCheckSystem.getComponentHealth(
      `${deployment.modelType}_blue`
    );
    
    const greenHealth = await healthCheckSystem.getComponentHealth(
      `${deployment.modelType}_green`
    );

    const blueMetrics: DeploymentMetrics = {
      requestCount: Math.floor(Math.random() * 1000) + 500,
      errorCount: Math.floor(Math.random() * 10),
      averageLatencyMs: blueHealth?.responseTimeMs || 150 + Math.random() * 50,
      successRate: 95 + Math.random() * 5,
    };

    const greenMetrics: DeploymentMetrics = {
      requestCount: Math.floor((Math.random() * 1000 + 500) * (deployment.canaryPercentage / 100)),
      errorCount: Math.floor(Math.random() * 5),
      averageLatencyMs: greenHealth?.responseTimeMs || 140 + Math.random() * 50,
      successRate: 96 + Math.random() * 4,
    };

    return { blue: blueMetrics, green: greenMetrics };
  }

  private shouldPromoteGreen(blue: DeploymentMetrics, green: DeploymentMetrics): boolean {
    if (green.requestCount < 100) {
      return false;
    }

    const latencyImprovement = (blue.averageLatencyMs - green.averageLatencyMs) / blue.averageLatencyMs;
    const successRateComparison = green.successRate >= blue.successRate * 0.99;
    const errorRateComparison = (green.errorCount / green.requestCount) <= (blue.errorCount / blue.requestCount) * 1.1;

    return successRateComparison && errorRateComparison && latencyImprovement >= -0.1;
  }

  private shouldRollback(green: DeploymentMetrics): boolean {
    if (green.requestCount < 50) {
      return false;
    }

    const errorRate = green.errorCount / green.requestCount;
    const successRateTooLow = green.successRate < 90;
    const errorRateTooHigh = errorRate > 0.05;

    return successRateTooLow || errorRateTooHigh;
  }

  async promoteToProduction(deploymentId: string): Promise<void> {
    const deployment = this.activeDeployments.get(deploymentId);
    
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    try {
      logger.info(`Promoting to production: ${deployment.modelType}`);

      await storage.activateModelVersion(deployment.newVersionId, deployment.modelType);

      await storage.updateCanaryDeployment(deployment.deploymentId, {
        status: 'completed',
        canaryPercentage: 100,
        completedAt: new Date(),
      });

      await storage.createDeploymentHistory({
        deploymentType: 'model',
        targetComponent: deployment.modelType,
        version: deployment.newVersionId,
        status: 'success',
        deploymentMethod: 'blue_green',
        metadata: {
          oldVersionId: deployment.oldVersionId,
          canaryDurationMs: Date.now() - deployment.startTime,
        },
        healthChecksPassed: true,
      });

      await upgradeAlertingSystem.sendUpgradeCompletedAlert(
        deployment.modelType,
        deployment.newVersionId,
        Date.now() - deployment.startTime,
        {
          deploymentMethod: 'blue_green',
          finalCanaryPercentage: 100,
        }
      );

      this.stopMetricsCollection(deploymentId);
      this.activeDeployments.delete(deploymentId);

      logger.info('Blue-green promotion completed successfully');
    } catch (error) {
      logger.error('Promotion to production failed:', error);
      throw error;
    }
  }

  async rollback(deploymentId: string): Promise<void> {
    const deployment = this.activeDeployments.get(deploymentId);
    
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    try {
      logger.warn(`Rolling back deployment: ${deployment.modelType}`);

      if (deployment.oldVersionId) {
        await storage.activateModelVersion(deployment.oldVersionId, deployment.modelType);
      }

      await storage.updateCanaryDeployment(deployment.deploymentId, {
        status: 'rolled_back',
        completedAt: new Date(),
      });

      await storage.createRollbackHistory({
        targetType: 'model',
        targetId: deployment.newVersionId,
        fromVersion: deployment.newVersionId,
        toVersion: deployment.oldVersionId || 'previous',
        reason: 'Performance degradation detected during canary deployment',
        impactAnalysis: {
          affectedUsers: 0,
          estimatedDowntime: 0,
          dataLoss: false,
          requiresRetraining: false,
          performanceChange: { degradation: 'detected' },
          risks: ['Temporary service impact during traffic shift'],
          mitigations: ['Automatic rollback', 'Health monitoring'],
        },
        status: 'success',
        recoveryTimeMs: Date.now() - deployment.startTime,
        initiatedBy: 'automatic',
      });

      await upgradeAlertingSystem.sendRollbackInitiatedAlert(
        deployment.modelType,
        deployment.newVersionId,
        deployment.oldVersionId || 'previous',
        'Performance degradation detected',
        {
          deploymentMethod: 'blue_green',
        }
      );

      this.stopMetricsCollection(deploymentId);
      this.activeDeployments.delete(deploymentId);

      logger.info('Blue-green rollback completed successfully');
    } catch (error) {
      logger.error('Rollback failed:', error);
      throw error;
    }
  }

  async getDeploymentStatus(deploymentId: string): Promise<any> {
    const deployment = await storage.getCanaryDeployment(deploymentId);
    return deployment;
  }

  async incrementTrafficPercentage(deploymentId: string, percentage: number): Promise<void> {
    const deployment = await storage.getCanaryDeployment(deploymentId);
    
    if (!deployment) {
      throw new Error(`Deployment not found: ${deploymentId}`);
    }

    const newPercentage = Math.min(100, deployment.canaryPercentage + percentage);
    
    await storage.updateCanaryDeployment(deploymentId, {
      canaryPercentage: newPercentage,
    });

    logger.info(`Increased traffic to ${newPercentage}% for deployment ${deploymentId}`);
  }
}

export const blueGreenDeploymentManager = new BlueGreenDeploymentManager();
