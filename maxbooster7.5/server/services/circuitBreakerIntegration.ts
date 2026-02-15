import { logger } from '../logger.js';
import { upgradeAlertingSystem } from './upgradeAlertingSystem';
import { blueGreenDeploymentManager } from './blueGreenDeploymentManager';
import { atomicUpgradeTransaction } from './atomicUpgradeTransaction';
import { healthCheckSystem } from './healthCheckSystem';
import { storage } from '../storage';

interface CircuitBreakerConfig {
  component: string;
  failureThreshold: number;
  resetTimeoutMs: number;
  monitoringIntervalMs: number;
}

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitMetrics {
  failureCount: number;
  successCount: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
  state: CircuitState;
}

export class CircuitBreakerIntegration {
  private circuits: Map<string, CircuitMetrics> = new Map();
  private monitors: Map<string, NodeJS.Timeout> = new Map();
  private config: Map<string, CircuitBreakerConfig> = new Map();

  registerComponent(config: CircuitBreakerConfig): void {
    this.config.set(config.component, config);
    
    this.circuits.set(config.component, {
      failureCount: 0,
      successCount: 0,
      state: 'CLOSED',
    });

    this.startMonitoring(config);
    logger.info(`Circuit breaker registered for ${config.component}`);
  }

  private startMonitoring(config: CircuitBreakerConfig): void {
    if (this.monitors.has(config.component)) {
      return;
    }

    const monitor = setInterval(async () => {
      try {
        await this.checkComponentHealth(config.component);
      } catch (error) {
        logger.error(`Circuit breaker monitoring failed for ${config.component}:`, error);
      }
    }, config.monitoringIntervalMs);

    this.monitors.set(config.component, monitor);
  }

  private async checkComponentHealth(component: string): Promise<void> {
    const circuit = this.circuits.get(component);
    const config = this.config.get(component);
    
    if (!circuit || !config) {
      return;
    }

    const health = await healthCheckSystem.getComponentHealth(component);
    
    if (!health) {
      return;
    }

    if (health.status === 'unhealthy') {
      await this.recordFailure(component);
    } else if (health.status === 'healthy') {
      await this.recordSuccess(component);
    }
  }

  private async recordFailure(component: string): Promise<void> {
    const circuit = this.circuits.get(component);
    const config = this.config.get(component);
    
    if (!circuit || !config) {
      return;
    }

    circuit.failureCount++;
    circuit.lastFailureTime = Date.now();

    logger.warn(
      `Circuit breaker failure recorded for ${component}: ${circuit.failureCount}/${config.failureThreshold}`
    );

    if (circuit.failureCount >= config.failureThreshold && circuit.state !== 'OPEN') {
      await this.openCircuit(component);
    }
  }

  private async recordSuccess(component: string): Promise<void> {
    const circuit = this.circuits.get(component);
    
    if (!circuit) {
      return;
    }

    circuit.successCount++;
    circuit.lastSuccessTime = Date.now();

    if (circuit.state === 'HALF_OPEN' && circuit.successCount >= 3) {
      await this.closeCircuit(component);
    }
  }

  private async openCircuit(component: string): Promise<void> {
    const circuit = this.circuits.get(component);
    const config = this.config.get(component);
    
    if (!circuit || !config) {
      return;
    }

    circuit.state = 'OPEN';
    
    logger.error(`Circuit breaker OPENED for ${component} - initiating automatic rollback`);

    await upgradeAlertingSystem.sendAlert({
      alertType: 'rollback_initiated',
      severity: 'critical',
      title: `Circuit Breaker Opened: ${component}`,
      message: `Component ${component} exceeded failure threshold (${circuit.failureCount}/${config.failureThreshold}). Automatic rollback initiated.`,
      component,
      metadata: {
        failureCount: circuit.failureCount,
        threshold: config.failureThreshold,
        state: 'OPEN',
      },
    });

    await this.initiateAutomaticRollback(component);

    setTimeout(() => {
      this.halfOpenCircuit(component);
    }, config.resetTimeoutMs);
  }

  private halfOpenCircuit(component: string): void {
    const circuit = this.circuits.get(component);
    
    if (!circuit) {
      return;
    }

    circuit.state = 'HALF_OPEN';
    circuit.failureCount = 0;
    circuit.successCount = 0;
    
    logger.info(`Circuit breaker HALF_OPEN for ${component} - testing recovery`);
  }

  private async closeCircuit(component: string): Promise<void> {
    const circuit = this.circuits.get(component);
    
    if (!circuit) {
      return;
    }

    circuit.state = 'CLOSED';
    circuit.failureCount = 0;
    circuit.successCount = 0;
    
    logger.info(`Circuit breaker CLOSED for ${component} - normal operation restored`);

    await upgradeAlertingSystem.sendAlert({
      alertType: 'upgrade_completed',
      severity: 'info',
      title: `Circuit Breaker Closed: ${component}`,
      message: `Component ${component} has recovered. Circuit breaker returned to normal state.`,
      component,
      metadata: {
        state: 'CLOSED',
      },
    });
  }

  private async initiateAutomaticRollback(component: string): Promise<void> {
    try {
      const recentDeployments = await storage.getDeploymentHistory(10);
      const latestDeployment = recentDeployments.find(
        d => d.targetComponent === component && d.status === 'success'
      );

      if (!latestDeployment) {
        logger.error(`No previous successful deployment found for ${component}`);
        return;
      }

      const previousVersion = latestDeployment.metadata?.fromVersion;
      
      if (!previousVersion) {
        logger.error(`Cannot determine previous version for ${component}`);
        return;
      }

      logger.info(`Initiating rollback for ${component} to version ${previousVersion}`);

      await storage.createRollbackHistory({
        targetType: 'deployment',
        targetId: component,
        fromVersion: latestDeployment.version,
        toVersion: previousVersion,
        reason: 'Circuit breaker triggered due to repeated failures',
        impactAnalysis: {
          affectedUsers: 0,
          estimatedDowntime: 0,
          dataLoss: false,
          requiresRetraining: false,
          performanceChange: { rollback: 'automatic' },
          risks: ['Service degradation during rollback'],
          mitigations: ['Circuit breaker protection', 'Automatic monitoring'],
        },
        status: 'success',
        recoveryTimeMs: 0,
        initiatedBy: 'circuit_breaker',
      });

      logger.info(`Automatic rollback completed for ${component}`);
    } catch (error) {
      logger.error(`Automatic rollback failed for ${component}:`, error);
    }
  }

  getCircuitState(component: string): CircuitState | undefined {
    const circuit = this.circuits.get(component);
    return circuit?.state;
  }

  getCircuitMetrics(component: string): CircuitMetrics | undefined {
    return this.circuits.get(component);
  }

  resetCircuit(component: string): void {
    const circuit = this.circuits.get(component);
    
    if (!circuit) {
      return;
    }

    circuit.failureCount = 0;
    circuit.successCount = 0;
    circuit.state = 'CLOSED';
    
    logger.info(`Circuit breaker manually reset for ${component}`);
  }

  stopMonitoring(component: string): void {
    const monitor = this.monitors.get(component);
    
    if (monitor) {
      clearInterval(monitor);
      this.monitors.delete(component);
      logger.info(`Stopped circuit breaker monitoring for ${component}`);
    }
  }

  stopAllMonitoring(): void {
    this.monitors.forEach((monitor, component) => {
      clearInterval(monitor);
      logger.info(`Stopped circuit breaker monitoring for ${component}`);
    });
    
    this.monitors.clear();
  }

  registerUpgradeComponents(): void {
    const components = [
      'content_generation',
      'music_analysis',
      'social_posting',
      'api_server',
      'postgresql',
      'node_process',
    ];

    for (const component of components) {
      this.registerComponent({
        component,
        failureThreshold: 5,
        resetTimeoutMs: 60000,
        monitoringIntervalMs: 10000,
      });
    }

    logger.info(`Registered ${components.length} components with circuit breaker`);
  }
}

export const circuitBreakerIntegration = new CircuitBreakerIntegration();
