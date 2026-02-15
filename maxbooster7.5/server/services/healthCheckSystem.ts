import { storage } from '../storage';
import { logger } from '../logger.js';
import { db } from '../db';
import type { InsertHealthCheck, HealthCheck } from '@shared/schema';
import axios from 'axios';

interface HealthCheckConfig {
  component: string;
  checkType: 'database' | 'api' | 'model' | 'infrastructure';
  timeout?: number;
  retries?: number;
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTimeMs: number;
  metrics?: Record<string, any>;
  errorMessage?: string;
}

export class HealthCheckSystem {
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly defaultTimeout = 5000;
  private readonly defaultRetries = 3;

  async runHealthCheck(config: HealthCheckConfig): Promise<HealthCheck> {
    const startTime = Date.now();
    let result: HealthCheckResult;

    try {
      switch (config.checkType) {
        case 'database':
          result = await this.checkDatabase(config);
          break;
        case 'api':
          result = await this.checkAPI(config);
          break;
        case 'model':
          result = await this.checkModel(config);
          break;
        case 'infrastructure':
          result = await this.checkInfrastructure(config);
          break;
        default:
          throw new Error(`Unknown check type: ${config.checkType}`);
      }
    } catch (error) {
      result = {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        errorMessage: (error as Error).message,
      };
    }

    const healthCheck = await storage.createHealthCheck({
      checkType: config.checkType,
      component: config.component,
      status: result.status,
      responseTimeMs: result.responseTimeMs,
      metrics: result.metrics,
      errorMessage: result.errorMessage,
    });

    return healthCheck;
  }

  private async checkDatabase(config: HealthCheckConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      await db.execute('SELECT 1');
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: responseTime < 100 ? 'healthy' : responseTime < 500 ? 'degraded' : 'unhealthy',
        responseTimeMs: responseTime,
        metrics: {
          queryTime: responseTime,
          connectionStatus: 'connected',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        errorMessage: (error as Error).message,
        metrics: {
          connectionStatus: 'failed',
        },
      };
    }
  }

  private async checkAPI(config: HealthCheckConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const timeout = config.timeout || this.defaultTimeout;
    
    try {
      const baseUrl = process.env.API_BASE_URL || 'http://localhost:5000';
      const response = await axios.get(`${baseUrl}/api/reliability/health`, {
        timeout,
        validateStatus: () => true,
      });
      
      const responseTime = Date.now() - startTime;
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (response.status === 200 && responseTime < 200) {
        status = 'healthy';
      } else if (response.status === 200 && responseTime < 1000) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }
      
      return {
        status,
        responseTimeMs: responseTime,
        metrics: {
          httpStatus: response.status,
          responseTime,
          endpoint: '/api/reliability/health',
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        errorMessage: (error as Error).message,
        metrics: {
          connectionStatus: 'failed',
        },
      };
    }
  }

  private async checkModel(config: HealthCheckConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const activeVersion = await storage.getActiveModelVersion(config.component);
      
      if (!activeVersion) {
        return {
          status: 'unhealthy',
          responseTimeMs: Date.now() - startTime,
          errorMessage: 'No active model version found',
          metrics: {
            hasActiveVersion: false,
          },
        };
      }
      
      const responseTime = Date.now() - startTime;
      
      return {
        status: 'healthy',
        responseTimeMs: responseTime,
        metrics: {
          hasActiveVersion: true,
          modelVersion: activeVersion.version,
          modelType: activeVersion.modelType,
          activatedAt: activeVersion.activatedAt,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        errorMessage: (error as Error).message,
      };
    }
  }

  private async checkInfrastructure(config: HealthCheckConfig): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      const memoryUsage = process.memoryUsage();
      const heapUsedPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;
      const uptime = process.uptime();
      
      let status: 'healthy' | 'degraded' | 'unhealthy';
      if (heapUsedPercent < 70) {
        status = 'healthy';
      } else if (heapUsedPercent < 85) {
        status = 'degraded';
      } else {
        status = 'unhealthy';
      }
      
      return {
        status,
        responseTimeMs: Date.now() - startTime,
        metrics: {
          heapUsedMB: Math.round(memoryUsage.heapUsed / 1024 / 1024),
          heapTotalMB: Math.round(memoryUsage.heapTotal / 1024 / 1024),
          heapUsedPercent: Math.round(heapUsedPercent),
          uptimeSeconds: Math.round(uptime),
          rss: Math.round(memoryUsage.rss / 1024 / 1024),
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        responseTimeMs: Date.now() - startTime,
        errorMessage: (error as Error).message,
      };
    }
  }

  async runAllHealthChecks(): Promise<HealthCheck[]> {
    const checks: HealthCheckConfig[] = [
      { component: 'postgresql', checkType: 'database' },
      { component: 'api_server', checkType: 'api' },
      { component: 'content_generation', checkType: 'model' },
      { component: 'music_analysis', checkType: 'model' },
      { component: 'social_posting', checkType: 'model' },
      { component: 'node_process', checkType: 'infrastructure' },
    ];

    const results = await Promise.all(
      checks.map(config => this.runHealthCheck(config))
    );

    return results;
  }

  async getComponentHealth(component: string): Promise<HealthCheck | undefined> {
    return await storage.getLatestHealthCheck(component);
  }

  async getRecentHealthChecks(component: string, hours: number = 24): Promise<HealthCheck[]> {
    return await storage.getRecentHealthChecks(component, hours);
  }

  async isSystemHealthy(): Promise<boolean> {
    const criticalComponents = ['postgresql', 'api_server', 'node_process'];
    
    for (const component of criticalComponents) {
      const health = await this.getComponentHealth(component);
      
      if (!health || health.status === 'unhealthy') {
        return false;
      }
    }
    
    return true;
  }

  startPeriodicHealthChecks(intervalMs: number = 60000): void {
    if (this.checkInterval) {
      logger.warn('Periodic health checks already running');
      return;
    }

    logger.info(`Starting periodic health checks (interval: ${intervalMs}ms)`);
    
    this.checkInterval = setInterval(async () => {
      try {
        await this.runAllHealthChecks();
      } catch (error) {
        logger.error('Periodic health check failed:', error);
      }
    }, intervalMs);

    this.runAllHealthChecks().catch(err => 
      logger.error('Initial health check failed:', err)
    );
  }

  stopPeriodicHealthChecks(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      logger.info('Stopped periodic health checks');
    }
  }

  async waitForHealthy(component: string, timeoutMs: number = 30000): Promise<boolean> {
    const startTime = Date.now();
    const checkInterval = 1000;
    
    while (Date.now() - startTime < timeoutMs) {
      const health = await this.getComponentHealth(component);
      
      if (health && health.status === 'healthy') {
        return true;
      }
      
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      
      await this.runHealthCheck({
        component,
        checkType: this.inferCheckType(component),
      });
    }
    
    return false;
  }

  private inferCheckType(component: string): 'database' | 'api' | 'model' | 'infrastructure' {
    if (component.includes('postgres') || component.includes('database')) {
      return 'database';
    } else if (component.includes('api') || component.includes('server')) {
      return 'api';
    } else if (component.includes('node') || component.includes('process')) {
      return 'infrastructure';
    } else {
      return 'model';
    }
  }
}

export const healthCheckSystem = new HealthCheckSystem();
