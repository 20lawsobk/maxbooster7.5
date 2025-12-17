import { logger } from '../logger.js';

interface AlertConfig {
  emailEnabled: boolean;
  webhookEnabled: boolean;
  emailRecipients: string[];
  webhookUrl?: string;
  thresholds: {
    queueMaxWaiting: number;
    queueMaxFailed: number;
    queueMaxLatency: number;
    aiCacheMaxUtilization: number;
    memoryMaxMB: number;
    errorRateMaxPercent: number;
  };
}

interface Alert {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class AlertingService {
  private config: AlertConfig;
  private recentAlerts: Map<string, Date> = new Map();
  private alertCooldownMinutes = 15;

  constructor() {
    this.config = {
      emailEnabled: process.env.SENDGRID_API_KEY ? true : false,
      webhookEnabled: process.env.ALERT_WEBHOOK_URL ? true : false,
      emailRecipients: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
      webhookUrl: process.env.ALERT_WEBHOOK_URL,
      thresholds: {
        queueMaxWaiting: parseInt(process.env.ALERT_QUEUE_MAX_WAITING || '100', 10),
        queueMaxFailed: parseInt(process.env.ALERT_QUEUE_MAX_FAILED || '50', 10),
        queueMaxLatency: parseInt(process.env.ALERT_QUEUE_MAX_LATENCY || '100', 10),
        aiCacheMaxUtilization: parseInt(process.env.ALERT_AI_CACHE_MAX_UTIL || '90', 10),
        memoryMaxMB: parseInt(process.env.ALERT_MEMORY_MAX_MB || '2048', 10),
        errorRateMaxPercent: parseInt(process.env.ALERT_ERROR_RATE_MAX || '5', 10),
      },
    };
  }

  private shouldSendAlert(alertKey: string): boolean {
    const lastSent = this.recentAlerts.get(alertKey);
    if (!lastSent) return true;

    const cooldownMs = this.alertCooldownMinutes * 60 * 1000;
    const timeSinceLastAlert = Date.now() - lastSent.getTime();
    
    return timeSinceLastAlert > cooldownMs;
  }

  private markAlertSent(alertKey: string): void {
    this.recentAlerts.set(alertKey, new Date());
  }

  async sendAlert(alert: Alert): Promise<void> {
    const alertKey = `${alert.title}-${alert.severity}`;
    
    if (!this.shouldSendAlert(alertKey)) {
      logger.debug(`Alert suppressed (cooldown): ${alert.title}`);
      return;
    }

    logger.warn(`🚨 ALERT [${alert.severity.toUpperCase()}]: ${alert.title}`);
    logger.warn(`   ${alert.message}`);

    const promises: Promise<void>[] = [];

    if (this.config.webhookEnabled && this.config.webhookUrl) {
      promises.push(this.sendWebhookAlert(alert));
    }

    if (this.config.emailEnabled && this.config.emailRecipients.length > 0) {
      promises.push(this.sendEmailAlert(alert));
    }

    await Promise.allSettled(promises);
    this.markAlertSent(alertKey);
  }

  private async sendWebhookAlert(alert: Alert): Promise<void> {
    if (!this.config.webhookUrl) return;

    try {
      const payload = {
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        timestamp: alert.timestamp.toISOString(),
        metadata: alert.metadata || {},
        source: 'Max Booster Platform',
      };

      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook returned ${response.status}`);
      }

      logger.info(`✅ Webhook alert sent: ${alert.title}`);
    } catch (error) {
      logger.error('Failed to send webhook alert:', error);
    }
  }

  private async sendEmailAlert(alert: Alert): Promise<void> {
    try {
      const sgMail = await import('@sendgrid/mail');
      sgMail.default.setApiKey(process.env.SENDGRID_API_KEY!);

      const severityEmoji = {
        info: 'ℹ️',
        warning: '⚠️',
        critical: '🚨',
      };

      const msg = {
        to: this.config.emailRecipients,
        from: process.env.SENDGRID_FROM_EMAIL || 'alerts@maxbooster.com',
        subject: `${severityEmoji[alert.severity]} Max Booster Alert: ${alert.title}`,
        text: `
${alert.title}
${'='.repeat(alert.title.length)}

Severity: ${alert.severity.toUpperCase()}
Time: ${alert.timestamp.toISOString()}

${alert.message}

${alert.metadata ? `\nAdditional Details:\n${JSON.stringify(alert.metadata, null, 2)}` : ''}

---
This is an automated alert from Max Booster Platform Monitoring System.
        `,
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background: ${alert.severity === 'critical' ? '#dc2626' : alert.severity === 'warning' ? '#f59e0b' : '#3b82f6'}; color: white; padding: 20px; }
    .content { padding: 20px; }
    .metadata { background: #f3f4f6; padding: 15px; border-radius: 5px; margin-top: 15px; }
    .footer { padding: 20px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${severityEmoji[alert.severity]} ${alert.title}</h1>
    <p style="margin: 0;">Severity: ${alert.severity.toUpperCase()}</p>
  </div>
  <div class="content">
    <p><strong>Time:</strong> ${alert.timestamp.toISOString()}</p>
    <p>${alert.message}</p>
    ${alert.metadata ? `
      <div class="metadata">
        <strong>Additional Details:</strong>
        <pre>${JSON.stringify(alert.metadata, null, 2)}</pre>
      </div>
    ` : ''}
  </div>
  <div class="footer">
    This is an automated alert from Max Booster Platform Monitoring System.
  </div>
</body>
</html>
        `,
      };

      await sgMail.default.send(msg);
      logger.info(`✅ Email alert sent to ${this.config.emailRecipients.length} recipient(s)`);
    } catch (error) {
      logger.error('Failed to send email alert:', error);
    }
  }

  async checkQueueMetrics(metrics: any): Promise<void> {
    if (metrics.waiting > this.config.thresholds.queueMaxWaiting) {
      await this.sendAlert({
        severity: 'warning',
        title: 'High Queue Backlog',
        message: `Queue has ${metrics.waiting} waiting jobs (threshold: ${this.config.thresholds.queueMaxWaiting})`,
        timestamp: new Date(),
        metadata: { queueName: metrics.queueName, waiting: metrics.waiting },
      });
    }

    if (metrics.failed > this.config.thresholds.queueMaxFailed) {
      await this.sendAlert({
        severity: 'critical',
        title: 'High Failed Job Count',
        message: `Queue has ${metrics.failed} failed jobs (threshold: ${this.config.thresholds.queueMaxFailed})`,
        timestamp: new Date(),
        metadata: { queueName: metrics.queueName, failed: metrics.failed },
      });
    }

    if (metrics.redisLatency > this.config.thresholds.queueMaxLatency) {
      await this.sendAlert({
        severity: 'warning',
        title: 'High Redis Latency',
        message: `Redis latency is ${metrics.redisLatency}ms (threshold: ${this.config.thresholds.queueMaxLatency}ms)`,
        timestamp: new Date(),
        metadata: { queueName: metrics.queueName, latency: metrics.redisLatency },
      });
    }
  }

  async checkAICacheMetrics(metrics: any): Promise<void> {
    const socialUtil = parseFloat(metrics.social.utilizationPercent);
    const adUtil = parseFloat(metrics.advertising.utilizationPercent);

    if (socialUtil > this.config.thresholds.aiCacheMaxUtilization) {
      await this.sendAlert({
        severity: 'warning',
        title: 'High AI Cache Utilization - Social',
        message: `Social Media AI cache at ${socialUtil.toFixed(1)}% utilization (threshold: ${this.config.thresholds.aiCacheMaxUtilization}%)`,
        timestamp: new Date(),
        metadata: { type: 'social', utilization: socialUtil },
      });
    }

    if (adUtil > this.config.thresholds.aiCacheMaxUtilization) {
      await this.sendAlert({
        severity: 'warning',
        title: 'High AI Cache Utilization - Advertising',
        message: `Advertising AI cache at ${adUtil.toFixed(1)}% utilization (threshold: ${this.config.thresholds.aiCacheMaxUtilization}%)`,
        timestamp: new Date(),
        metadata: { type: 'advertising', utilization: adUtil },
      });
    }
  }

  async checkMemoryUsage(memoryMB: number): Promise<void> {
    if (memoryMB > this.config.thresholds.memoryMaxMB) {
      await this.sendAlert({
        severity: 'critical',
        title: 'High Memory Usage',
        message: `Server memory usage is ${memoryMB.toFixed(0)}MB (threshold: ${this.config.thresholds.memoryMaxMB}MB)`,
        timestamp: new Date(),
        metadata: { memoryMB },
      });
    }
  }

  getConfig(): AlertConfig {
    return { ...this.config };
  }
}

export const alertingService = new AlertingService();
