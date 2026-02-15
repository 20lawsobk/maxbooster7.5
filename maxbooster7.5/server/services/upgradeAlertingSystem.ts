import { storage } from '../storage';
import { logger } from '../logger.js';
import { externalAlerting } from './externalAlerting';
import type { InsertUpgradeAlert, UpgradeAlert } from '@shared/schema';

interface UpgradeAlertOptions {
  alertType: 'upgrade_started' | 'upgrade_completed' | 'upgrade_failed' | 'rollback_initiated' | 'health_check_failed' | 'backup_created';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  component?: string;
  metadata?: Record<string, any>;
}

export class UpgradeAlertingSystem {
  async sendAlert(options: UpgradeAlertOptions): Promise<UpgradeAlert> {
    const notificationsSent: Record<string, boolean> = {};

    if (options.severity === 'critical' || options.severity === 'warning') {
      try {
        await externalAlerting.sendAlert({
          severity: options.severity,
          title: options.title,
          message: options.message,
          component: options.component || 'auto-upgrade',
          metadata: options.metadata,
        });
        
        notificationsSent.slack = true;
        notificationsSent.pagerduty = options.severity === 'critical';
        notificationsSent.email = true;
      } catch (error) {
        logger.error('Failed to send external alert:', error);
        notificationsSent.slack = false;
        notificationsSent.pagerduty = false;
        notificationsSent.email = false;
      }
    } else {
      logger.info(`[${options.severity.toUpperCase()}] ${options.title}: ${options.message}`);
      notificationsSent.console = true;
    }

    const alert = await storage.createUpgradeAlert({
      alertType: options.alertType,
      severity: options.severity,
      title: options.title,
      message: options.message,
      component: options.component,
      metadata: options.metadata,
      notificationsSent,
    });

    return alert;
  }

  async sendUpgradeStartedAlert(component: string, version: string, metadata?: Record<string, any>): Promise<UpgradeAlert> {
    return await this.sendAlert({
      alertType: 'upgrade_started',
      severity: 'info',
      title: `Upgrade Started: ${component}`,
      message: `Starting upgrade for ${component} to version ${version}`,
      component,
      metadata: {
        version,
        ...metadata,
      },
    });
  }

  async sendUpgradeCompletedAlert(component: string, version: string, durationMs: number, metadata?: Record<string, any>): Promise<UpgradeAlert> {
    return await this.sendAlert({
      alertType: 'upgrade_completed',
      severity: 'info',
      title: `Upgrade Completed: ${component}`,
      message: `Successfully upgraded ${component} to version ${version} in ${durationMs}ms`,
      component,
      metadata: {
        version,
        durationMs,
        ...metadata,
      },
    });
  }

  async sendUpgradeFailedAlert(component: string, version: string, error: string, metadata?: Record<string, any>): Promise<UpgradeAlert> {
    return await this.sendAlert({
      alertType: 'upgrade_failed',
      severity: 'critical',
      title: `Upgrade Failed: ${component}`,
      message: `Failed to upgrade ${component} to version ${version}: ${error}`,
      component,
      metadata: {
        version,
        error,
        ...metadata,
      },
    });
  }

  async sendRollbackInitiatedAlert(component: string, fromVersion: string, toVersion: string, reason: string, metadata?: Record<string, any>): Promise<UpgradeAlert> {
    return await this.sendAlert({
      alertType: 'rollback_initiated',
      severity: 'critical',
      title: `Rollback Initiated: ${component}`,
      message: `Rolling back ${component} from ${fromVersion} to ${toVersion}. Reason: ${reason}`,
      component,
      metadata: {
        fromVersion,
        toVersion,
        reason,
        ...metadata,
      },
    });
  }

  async sendHealthCheckFailedAlert(component: string, error: string, metadata?: Record<string, any>): Promise<UpgradeAlert> {
    return await this.sendAlert({
      alertType: 'health_check_failed',
      severity: 'warning',
      title: `Health Check Failed: ${component}`,
      message: `Health check failed for ${component}: ${error}`,
      component,
      metadata: {
        error,
        ...metadata,
      },
    });
  }

  async sendBackupCreatedAlert(component: string, version: string, backupId: string, metadata?: Record<string, any>): Promise<UpgradeAlert> {
    return await this.sendAlert({
      alertType: 'backup_created',
      severity: 'info',
      title: `Backup Created: ${component}`,
      message: `Pre-upgrade backup created for ${component} v${version} (ID: ${backupId})`,
      component,
      metadata: {
        version,
        backupId,
        ...metadata,
      },
    });
  }

  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<UpgradeAlert | undefined> {
    return await storage.updateUpgradeAlert(alertId, {
      acknowledgedAt: new Date(),
      acknowledgedBy,
    });
  }

  async resolveAlert(alertId: string): Promise<UpgradeAlert | undefined> {
    return await storage.updateUpgradeAlert(alertId, {
      resolvedAt: new Date(),
    });
  }

  async getUnacknowledgedAlerts(severity?: string): Promise<UpgradeAlert[]> {
    return await storage.getUnacknowledgedAlerts(severity);
  }

  async getCriticalAlerts(): Promise<UpgradeAlert[]> {
    return await this.getUnacknowledgedAlerts('critical');
  }

  async sendBatchAlert(alerts: UpgradeAlertOptions[]): Promise<UpgradeAlert[]> {
    const results = await Promise.all(
      alerts.map(alert => this.sendAlert(alert))
    );
    return results;
  }
}

export const upgradeAlertingSystem = new UpgradeAlertingSystem();
