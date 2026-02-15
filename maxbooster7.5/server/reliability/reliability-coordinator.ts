import { EventEmitter } from 'events';
import { processMonitor } from './process-monitor';
import { databaseResilience } from './database-resilience';
import { memoryManager } from './memory-manager';
import { healthCheck } from '../middleware/healthCheck';
import { logger } from '../logger.js';

interface SystemHealth {
  status: 'healthy' | 'degraded' | 'critical';
  uptime: number;
  components: {
    process: any;
    database: any;
    memory: any;
    server: any;
  };
  alerts: unknown[];
  lastHealthCheck: Date;
  reliability: {
    uptimePercentage: number;
    avgResponseTime: number;
    errorRate: number;
  };
}

interface ReliabilityConfig {
  monitoring: {
    healthCheckInterval: number;
    processMonitorInterval: number;
    memoryMonitorInterval: number;
  };
  thresholds: {
    criticalAlertThreshold: number;
    degradedServiceThreshold: number;
  };
  recovery: {
    autoRestartEnabled: boolean;
    maxRestartAttempts: number;
    restartDelay: number;
  };
}

class ReliabilityCoordinator extends EventEmitter {
  private isActive = false;
  private systemHealth: SystemHealth;
  private config: ReliabilityConfig;
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private startTime: number;
  private totalRequests = 0;
  private failedRequests = 0;
  private responseTimes: number[] = [];

  constructor() {
    super();

    this.startTime = Date.now();

    this.config = {
      monitoring: {
        healthCheckInterval: 30000, // 30 seconds
        processMonitorInterval: 60000, // 1 minute
        memoryMonitorInterval: 60000, // 1 minute
      },
      thresholds: {
        criticalAlertThreshold: 3, // 3 critical alerts = system critical
        degradedServiceThreshold: 5, // 5+ warnings = degraded
      },
      recovery: {
        autoRestartEnabled: true,
        maxRestartAttempts: 3,
        restartDelay: 5000, // 5 seconds
      },
    };

    this.systemHealth = {
      status: 'healthy',
      uptime: 0,
      components: {
        process: {},
        database: {},
        memory: {},
        server: {},
      },
      alerts: [],
      lastHealthCheck: new Date(),
      reliability: {
        uptimePercentage: 100,
        avgResponseTime: 0,
        errorRate: 0,
      },
    };

    this.setupEventListeners();
  }

  async start(): Promise<void> {
    if (this.isActive) {
      logger.info('⚠️  Reliability coordinator already active');
      return;
    }

    logger.info('🚀 Starting 24/7/365 Reliability System...');

    this.isActive = true;

    // Start all monitoring components
    processMonitor.start(this.config.monitoring.processMonitorInterval);
    memoryManager.start(this.config.monitoring.memoryMonitorInterval);

    // Start central health monitoring
    this.startHealthMonitoring();

    // Track global connection count
    (global as any).activeConnections = 0;

    logger.info('✅ 24/7/365 Reliability System ACTIVE');
    logger.info('📊 Monitoring: Process, Memory, Database, Health Checks');
    logger.info('🔄 Auto-recovery: Enabled');
    logger.info('⚡ High-availability: Ready');

    this.emit('system-started');
  }

  async stop(): Promise<void> {
    if (!this.isActive) return;

    logger.info('🔄 Stopping reliability system...');

    this.isActive = false;

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Gracefully stop all components
    await processMonitor.gracefulShutdown();
    await databaseResilience.gracefulShutdown();
    await memoryManager.gracefulShutdown();

    logger.info('✅ Reliability system stopped');
    this.emit('system-stopped');
  }

  private setupEventListeners(): void {
    // Process monitoring events
    processMonitor.on('critical-alert', (data) => {
      this.handleCriticalAlert('process', data);
    });

    processMonitor.on('health-update', (health) => {
      this.systemHealth.components.process = health;
    });

    // Database events
    databaseResilience.on('circuit-breaker-open', (data) => {
      this.handleCriticalAlert('database', data);
    });

    databaseResilience.on('connection-failure', (data) => {
      this.handleServiceDegradation('database', data);
    });

    // Memory events
    memoryManager.on('memory-critical', (data) => {
      this.handleCriticalAlert('memory', data);
    });

    memoryManager.on('memory-leak-detected', (data) => {
      this.handleCriticalAlert('memory-leak', data);
    });

    memoryManager.on('memory-warning', (data) => {
      this.handleServiceDegradation('memory', data);
    });
  }

  private startHealthMonitoring(): void {
    this.healthCheckInterval = setInterval(async () => {
      await this.performSystemHealthCheck();
    }, this.config.monitoring.healthCheckInterval);
  }

  private async performSystemHealthCheck(): Promise<void> {
    try {
      // Collect health from all components
      const processHealth = processMonitor.getHealth();
      const memoryHealth = memoryManager.getMemorySummary();
      const databaseHealth = databaseResilience.getHealthMetrics();

      // Update system health
      this.systemHealth.uptime = Date.now() - this.startTime;
      this.systemHealth.components = {
        process: processHealth,
        database: databaseHealth,
        memory: memoryHealth,
        server: {
          activeConnections: (global as any).activeConnections || 0,
          totalRequests: this.totalRequests,
          failedRequests: this.failedRequests,
        },
      };

      // Calculate reliability metrics
      this.updateReliabilityMetrics();

      // Determine overall system status
      this.determineSystemStatus();

      this.systemHealth.lastHealthCheck = new Date();

      // Emit health update
      this.emit('health-update', this.systemHealth);

      // Log status every 10 minutes
      if (Date.now() % (10 * 60 * 1000) < this.config.monitoring.healthCheckInterval) {
        this.logSystemStatus();
      }
    } catch (error: unknown) {
      logger.error('❌ System health check failed:', error);
      this.handleCriticalAlert('health-check', { error: (error as Error).message });
    }
  }

  private updateReliabilityMetrics(): void {
    const uptimeHours = this.systemHealth.uptime / (1000 * 60 * 60);

    // Calculate uptime percentage (assume target is 99.9%)
    this.systemHealth.reliability.uptimePercentage = Math.min(
      99.99,
      100 - (this.failedRequests / Math.max(this.totalRequests, 1)) * 100
    );

    // Average response time
    if (this.responseTimes.length > 0) {
      this.systemHealth.reliability.avgResponseTime =
        this.responseTimes.reduce((sum, time) => sum + time, 0) / this.responseTimes.length;

      // Keep only last 1000 response times
      if (this.responseTimes.length > 1000) {
        this.responseTimes = this.responseTimes.slice(-1000);
      }
    }

    // Error rate
    this.systemHealth.reliability.errorRate =
      this.totalRequests > 0 ? (this.failedRequests / this.totalRequests) * 100 : 0;
  }

  private determineSystemStatus(): void {
    const { process: proc, database, memory } = this.systemHealth.components;

    // Count critical issues
    let criticalIssues = 0;
    let degradedIssues = 0;

    if (proc?.status === 'critical') criticalIssues++;
    if (proc?.status === 'warning') degradedIssues++;

    if (database?.circuitBreakerState === 'open') criticalIssues++;
    if (database?.successRate < 95) degradedIssues++;

    if (memory?.current?.heapUsedMB > 1024) criticalIssues++;
    if (memory?.current?.heapUsedMB > 512) degradedIssues++;

    // Determine overall status
    if (criticalIssues >= this.config.thresholds.criticalAlertThreshold) {
      this.systemHealth.status = 'critical';
    } else if (
      criticalIssues > 0 ||
      degradedIssues >= this.config.thresholds.degradedServiceThreshold
    ) {
      this.systemHealth.status = 'degraded';
    } else {
      this.systemHealth.status = 'healthy';
    }
  }

  private handleCriticalAlert(component: string, data: unknown): void {
    const alert = {
      id: `${Date.now()}-${component}`,
      component,
      severity: 'critical',
      message: data.message || `Critical alert in ${component}`,
      timestamp: new Date(),
      data,
    };

    this.systemHealth.alerts.unshift(alert);

    // Limit alerts array
    if (this.systemHealth.alerts.length > 100) {
      this.systemHealth.alerts = this.systemHealth.alerts.slice(0, 100);
    }

    logger.error(`🚨 CRITICAL SYSTEM ALERT [${component}]: ${alert.message}`);

    this.emit('critical-alert', alert);

    // Trigger recovery if enabled
    if (this.config.recovery.autoRestartEnabled) {
      this.attemptAutoRecovery(component, data);
    }
  }

  private handleServiceDegradation(component: string, data: unknown): void {
    const alert = {
      id: `${Date.now()}-${component}`,
      component,
      severity: 'warning',
      message: data.message || `Service degradation in ${component}`,
      timestamp: new Date(),
      data,
    };

    this.systemHealth.alerts.unshift(alert);

    logger.warn(`⚠️  SERVICE DEGRADATION [${component}]: ${alert.message}`);

    this.emit('service-degradation', alert);
  }

  private async attemptAutoRecovery(component: string, data: unknown): Promise<void> {
    logger.info(`🔄 Attempting auto-recovery for ${component}...`);

    try {
      switch (component) {
        case 'database':
          databaseResilience.resetCircuitBreaker();
          break;

        case 'memory':
          memoryManager.scheduleGarbageCollection();
          break;

        case 'process':
          // Let the process monitor handle restart logic
          break;
      }

      logger.info(`✅ Auto-recovery initiated for ${component}`);
    } catch (error: unknown) {
      logger.error(`❌ Auto-recovery failed for ${component}:`, error);
    }
  }

  private logSystemStatus(): void {
    const { status, uptime, reliability } = this.systemHealth;
    const uptimeHours = Math.round((uptime / (1000 * 60 * 60)) * 100) / 100;

    logger.info('📊 24/7 System Status Report:');
    logger.info(
      `   Status: ${status} | Uptime: ${uptimeHours}h | Reliability: ${reliability.uptimePercentage.toFixed(2)}%`
    );
    logger.info(
      `   Avg Response: ${Math.round(reliability.avgResponseTime)}ms | Error Rate: ${reliability.errorRate.toFixed(2)}%`
    );
    logger.info(
      `   Memory: ${this.systemHealth.components.memory?.current?.heapUsedMB || 0}MB | DB: ${this.systemHealth.components.database?.circuitBreakerState || 'unknown'}`
    );
  }

  // Public API methods
  getSystemHealth(): SystemHealth {
    return { ...this.systemHealth };
  }

  getUptimeStats(): any {
    const uptimeMs = this.systemHealth.uptime;
    const uptimeHours = uptimeMs / (1000 * 60 * 60);
    const uptimeDays = uptimeHours / 24;

    return {
      uptimeMs,
      uptimeHours: Math.round(uptimeHours * 100) / 100,
      uptimeDays: Math.round(uptimeDays * 100) / 100,
      uptimePercentage: this.systemHealth.reliability.uptimePercentage,
      startTime: new Date(this.startTime),
      isHealthy: this.systemHealth.status === 'healthy',
    };
  }

  // Request tracking for metrics
  trackRequest(responseTime?: number): void {
    this.totalRequests++;
    if (responseTime) {
      this.responseTimes.push(responseTime);
    }
  }

  trackFailedRequest(): void {
    this.failedRequests++;
    this.totalRequests++;
  }

  // Configuration updates
  updateConfig(config: Partial<ReliabilityConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('🔧 Reliability configuration updated');
  }
}

// Global reliability coordinator instance
export const reliabilityCoordinator = new ReliabilityCoordinator();

export default ReliabilityCoordinator;
