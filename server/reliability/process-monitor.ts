import { EventEmitter } from 'events';
import { logger } from '../logger.js';

interface ProcessHealth {
  pid: number;
  uptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
  activeConnections: number;
  restartCount: number;
  lastRestart?: Date;
  status: 'healthy' | 'warning' | 'critical';
}

interface ProcessAlert {
  type: 'memory' | 'cpu' | 'connections' | 'uptime' | 'restart';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  metrics?: any;
}

class ProcessMonitor extends EventEmitter {
  private health: ProcessHealth;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private alerts: ProcessAlert[] = [];
  private maxAlerts = 1000;

  // Thresholds for alerting
  private readonly thresholds = {
    memory: {
      warning: 512 * 1024 * 1024, // 512MB
      critical: 1024 * 1024 * 1024, // 1GB
    },
    cpu: {
      warning: 80, // 80% average over time
      critical: 95, // 95% average over time
    },
    connections: {
      warning: 1000,
      critical: 2000,
    },
    uptime: {
      minimumHealthy: 60000, // 1 minute minimum uptime to be considered healthy
    },
  };

  constructor() {
    super();
    this.health = {
      pid: process.pid,
      uptime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      activeConnections: 0,
      restartCount: 0,
      status: 'healthy',
    };

    this.setupProcessHandlers();
  }

  start(intervalMs: number = 30000): void {
    logger.info('🔍 Starting 24/7 Process Monitor...');

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }

    this.monitoringInterval = setInterval(() => {
      this.collectMetrics();
      this.analyzeHealth();
      this.emitHealthStatus();
    }, intervalMs);

    // Initial health check
    this.collectMetrics();
    logger.info('✅ Process monitoring started - 24/7 reliability enabled');
  }

  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
    logger.info('🛑 Process monitoring stopped');
  }

  private setupProcessHandlers(): void {
    // Track process restarts
    process.on('SIGTERM', () => {
      this.health.restartCount++;
      this.health.lastRestart = new Date();
      this.addAlert({
        type: 'restart',
        severity: 'medium',
        message: 'Process received SIGTERM - graceful shutdown initiated',
        timestamp: new Date(),
      });
    });

    process.on('SIGINT', () => {
      this.health.restartCount++;
      this.health.lastRestart = new Date();
      this.addAlert({
        type: 'restart',
        severity: 'medium',
        message: 'Process received SIGINT - manual restart initiated',
        timestamp: new Date(),
      });
    });

    // Track uncaught exceptions (should be rare with our error handling)
    process.on('uncaughtException', (error) => {
      this.addAlert({
        type: 'restart',
        severity: 'critical',
        message: `Uncaught exception: ${error.message}`,
        timestamp: new Date(),
        metrics: { stack: error.stack },
      });
    });

    process.on('unhandledRejection', (reason) => {
      this.addAlert({
        type: 'restart',
        severity: 'critical',
        message: `Unhandled rejection: ${reason}`,
        timestamp: new Date(),
      });
    });
  }

  private collectMetrics(): void {
    const now = Date.now();

    this.health = {
      ...this.health,
      uptime: now - (process.uptime() * 1000 - now),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(this.health.cpuUsage),
    };

    // Update connection count from active sockets (if available)
    if ((global as any).activeConnections !== undefined) {
      this.health.activeConnections = (global as any).activeConnections;
    }
  }

  private analyzeHealth(): void {
    const issues: string[] = [];
    let severity: 'healthy' | 'warning' | 'critical' = 'healthy';

    // Memory analysis
    const memUsage = this.health.memoryUsage.heapUsed;
    if (memUsage > this.thresholds.memory.critical) {
      issues.push(`Critical memory usage: ${Math.round(memUsage / 1024 / 1024)}MB`);
      severity = 'critical';
      this.addAlert({
        type: 'memory',
        severity: 'critical',
        message: `Critical memory usage: ${Math.round(memUsage / 1024 / 1024)}MB`,
        timestamp: new Date(),
        metrics: this.health.memoryUsage,
      });
    } else if (memUsage > this.thresholds.memory.warning) {
      issues.push(`High memory usage: ${Math.round(memUsage / 1024 / 1024)}MB`);
      if (severity === 'healthy') severity = 'warning';
      this.addAlert({
        type: 'memory',
        severity: 'medium',
        message: `High memory usage: ${Math.round(memUsage / 1024 / 1024)}MB`,
        timestamp: new Date(),
        metrics: this.health.memoryUsage,
      });
    }

    // Connection analysis
    if (this.health.activeConnections > this.thresholds.connections.critical) {
      issues.push(`Critical connection count: ${this.health.activeConnections}`);
      severity = 'critical';
      this.addAlert({
        type: 'connections',
        severity: 'critical',
        message: `Critical connection count: ${this.health.activeConnections}`,
        timestamp: new Date(),
      });
    } else if (this.health.activeConnections > this.thresholds.connections.warning) {
      issues.push(`High connection count: ${this.health.activeConnections}`);
      if (severity === 'healthy') severity = 'warning';
    }

    // Uptime analysis (recent restart detection)
    if (this.health.uptime < this.thresholds.uptime.minimumHealthy) {
      issues.push(`Recent restart detected: ${this.health.uptime}ms uptime`);
      if (severity === 'healthy') severity = 'warning';
    }

    this.health.status = severity;

    // Log health status periodically
    if (issues.length > 0) {
      logger.warn(`⚠️  Process Health Issues: ${issues.join(', ')}`);
    } else {
      logger.info(
        `✅ Process Health: OK (${Math.round(this.health.uptime / 1000)}s uptime, ${Math.round(memUsage / 1024 / 1024)}MB memory)`
      );
    }
  }

  private emitHealthStatus(): void {
    this.emit('health-update', this.health);

    if (this.health.status === 'critical') {
      this.emit('critical-alert', this.health);
    }
  }

  private addAlert(alert: ProcessAlert): void {
    this.alerts.unshift(alert);

    // Limit alerts array size
    if (this.alerts.length > this.maxAlerts) {
      this.alerts = this.alerts.slice(0, this.maxAlerts);
    }

    // Emit alert event
    this.emit('alert', alert);

    // Log critical alerts immediately
    if (alert.severity === 'critical') {
      logger.error(`🚨 CRITICAL ALERT [${alert.type}]: ${alert.message}`);
    }
  }

  // Public API methods
  getHealth(): ProcessHealth {
    return { ...this.health };
  }

  getAlerts(limit: number = 100): ProcessAlert[] {
    return this.alerts.slice(0, limit);
  }

  getCriticalAlerts(): ProcessAlert[] {
    return this.alerts.filter((alert) => alert.severity === 'critical');
  }

  getHealthSummary(): any {
    const recentAlerts = this.alerts.filter(
      (alert) => Date.now() - alert.timestamp.getTime() < 24 * 60 * 60 * 1000 // Last 24 hours
    );

    return {
      status: this.health.status,
      uptime: this.health.uptime,
      uptimeHours: Math.round((this.health.uptime / (1000 * 60 * 60)) * 100) / 100,
      memoryUsageMB: Math.round(this.health.memoryUsage.heapUsed / 1024 / 1024),
      activeConnections: this.health.activeConnections,
      restartCount: this.health.restartCount,
      lastRestart: this.health.lastRestart,
      recentAlerts: recentAlerts.length,
      criticalAlerts: recentAlerts.filter((a) => a.severity === 'critical').length,
    };
  }

  // Cleanup method for graceful shutdown
  async gracefulShutdown(): Promise<void> {
    logger.info('🔄 Process monitor initiating graceful shutdown...');

    this.addAlert({
      type: 'restart',
      severity: 'low',
      message: 'Graceful shutdown initiated',
      timestamp: new Date(),
    });

    this.stop();

    // Emit final health status
    this.emit('shutdown', this.getHealthSummary());

    logger.info('✅ Process monitor shutdown complete');
  }
}

// Global process monitor instance
export const processMonitor = new ProcessMonitor();

export default ProcessMonitor;
