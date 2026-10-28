import { sendSendGridAlert } from "../lib/sendgridAlertTransport.js";
import { logger } from "../logger.js";
import { env } from "../config/env.js";

const escapeHtml = (value: string): string => value.replace(
  /[&<>"']/g,
  char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
);

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
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface AlertDispatchResult {
  status: "accepted" | "failed" | "suppressed";
  acceptedChannels: ("email" | "webhook")[];
  failedChannels: ("email" | "webhook")[];
  reason?: "unconfigured" | "in_flight" | "cooldown";
}

export class AlertingService {
  private config: AlertConfig;
  private recentAlerts: Map<string, Date> = new Map();
  private inFlightAlerts = new Set<string>();
  private alertCooldownMinutes = 15;

  constructor() {
    this.config = {
      emailEnabled: env.SENDGRID_API_KEY ? true : false,
      webhookEnabled: process.env.ALERT_WEBHOOK_URL ? true : false,
      emailRecipients: [...new Set((process.env.ALERT_EMAIL_RECIPIENTS || "").split(",").map(value => value.trim()).filter(Boolean))],
      webhookUrl: process.env.ALERT_WEBHOOK_URL,
      thresholds: {
        queueMaxWaiting: parseInt(
          process.env.ALERT_QUEUE_MAX_WAITING || "100",
          10,
        ),
        queueMaxFailed: parseInt(
          process.env.ALERT_QUEUE_MAX_FAILED || "50",
          10,
        ),
        queueMaxLatency: parseInt(
          process.env.ALERT_QUEUE_MAX_LATENCY || "100",
          10,
        ),
        aiCacheMaxUtilization: parseInt(
          process.env.ALERT_AI_CACHE_MAX_UTIL || "90",
          10,
        ),
        memoryMaxMB: parseInt(process.env.ALERT_MEMORY_MAX_MB || "2048", 10),
        errorRateMaxPercent: parseInt(
          process.env.ALERT_ERROR_RATE_MAX || "5",
          10,
        ),
      },
    };
  }

  private shouldSendAlert(alertKey: string): boolean {
    const lastSent = this.recentAlerts.get(alertKey);
    if (!lastSent) return true;

    const cooldownMs = this.alertCooldownMinutes * 60 * 1000;
    const timeSinceLastAlert = Date?.now() - lastSent?.getTime();

    return timeSinceLastAlert > cooldownMs;
  }

  private markAlertSent(alertKey: string): void {
    this.recentAlerts.set(alertKey, new Date());
  }

  async sendAlert(alert: Alert): Promise<AlertDispatchResult> {
    const alertKey = `${alert?.title}-${alert?.severity}`;

    const webhookKey = `${alertKey}:webhook`;
    const emailKey = `${alertKey}:email`;
    const webhookConfigured = this.config.webhookEnabled && Boolean(this.config.webhookUrl);
    const emailConfigured = this.config.emailEnabled && this.config.emailRecipients.length > 0;
    const sendWebhook = webhookConfigured && this.shouldSendAlert(webhookKey);
    const sendEmail = emailConfigured && this.shouldSendAlert(emailKey);
    if (this.inFlightAlerts.has(alertKey) || (!sendWebhook && !sendEmail)) {
      logger.debug(`Alert suppressed (unconfigured, in flight or cooldown): ${alert?.title}`);
      return {
        status: "suppressed", acceptedChannels: [], failedChannels: [],
        reason: this.inFlightAlerts.has(alertKey) ? "in_flight" : webhookConfigured || emailConfigured ? "cooldown" : "unconfigured",
      };
    }

    logger.warn(`🚨 ALERT [${alert?.severity.toUpperCase()}]: ${alert?.title}`);
    logger.warn(`   ${alert?.message}`);

    const dispatches: { channel: "email" | "webhook"; key: string; promise: Promise<boolean> }[] = [];
    this.inFlightAlerts.add(alertKey);

    if (sendWebhook) {
      dispatches.push({ channel: "webhook", key: webhookKey, promise: this.sendWebhookAlert(alert) });
    }

    if (sendEmail) {
      dispatches.push({ channel: "email", key: emailKey, promise: this.sendEmailAlert(alert) });
    }

    try {
      const results = await Promise.allSettled(dispatches.map(value => value.promise));
      const result: AlertDispatchResult = { status: "failed", acceptedChannels: [], failedChannels: [] };
      results.forEach((value, index) => {
        const dispatch = dispatches[index];
        if (value.status === "fulfilled" && value.value) {
          this.markAlertSent(dispatch.key);
          result.acceptedChannels.push(dispatch.channel);
        } else result.failedChannels.push(dispatch.channel);
      });
      if (result.acceptedChannels.length) result.status = "accepted";
      return result;
    } finally {
      this.inFlightAlerts.delete(alertKey);
    }
  }

  private async sendWebhookAlert(alert: Alert): Promise<boolean> {
    if (!this.config.webhookUrl) return false;

    try {
      const payload = {
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        timestamp: alert.timestamp.toISOString(),
        metadata: alert.metadata || {},
        source: "Max Booster Platform",
      };

      const response = await fetch(this.config.webhookUrl, {
        method: "POST",
        signal: AbortSignal.timeout(10_000), // 10 s — alert delivery must not block monitoring loop
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response?.ok) {
        throw new Error(`Webhook returned ${response?.status}`);
      }

      logger.info(`✅ Webhook alert accepted: ${alert?.title}`);
      return true;
    } catch (error) {
      logger.warn({ err: error }, "Failed to send webhook alert:");
      return false;
    }
  }

  private async sendEmailAlert(alert: Alert): Promise<boolean> {
    try {
      if (!env.SENDGRID_API_KEY) {
        logger.warn("Email alert skipped: SENDGRID_API_KEY not configured");
        return false;
      }

      const severityEmoji = {
        info: "ℹ️",
        warning: "⚠️",
        critical: "🚨",
      };

      const titleHtml = escapeHtml(alert.title);
      const messageHtml = escapeHtml(alert.message);
      const metadataHtml = alert.metadata ? escapeHtml(JSON.stringify(alert.metadata, null, 2)) : "";
      const msg = {
        to: this.config.emailRecipients,
        from: env.SENDGRID_FROM_EMAIL || "alerts@maxbooster.ai",
        subject: `${severityEmoji[alert?.severity]} Max Booster Alert: ${alert?.title}`,
        text: `
${alert?.title}
${"=".repeat(alert?.title.length)}

Severity: ${alert?.severity.toUpperCase()}
Time: ${alert?.timestamp.toISOString()}

${alert?.message}

${alert?.metadata ? `\nAdditional Details:\n${JSON.stringify(alert?.metadata, null, 2)}` : ""}

---
This is an automated alert from Max Booster Platform Monitoring System.
        `,
        html: `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .header { background: ${alert?.severity === "critical" ? "#dc2626" : alert?.severity === "warning" ? "#f59e0b" : "#3b82f6"}; color: white; padding: 20px; }
    .content { padding: 20px; }
    .metadata { background: #f3f4f6; padding: 15px; border-radius: 5px; margin-top: 15px; }
    .footer { padding: 20px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${severityEmoji[alert?.severity]} ${titleHtml}</h1>
    <p style="margin: 0;">Severity: ${alert?.severity.toUpperCase()}</p>
  </div>
  <div class="content">
    <p><strong>Time:</strong> ${alert?.timestamp.toISOString()}</p>
    <p>${messageHtml}</p>
    ${
      alert?.metadata
        ? `
      <div class="metadata">
        <strong>Additional Details:</strong>
        <pre>${metadataHtml}</pre>
      </div>
    `
        : ""
    }
  </div>
  <div class="footer">
    This is an automated alert from Max Booster Platform Monitoring System.
  </div>
</body>
</html>
        `,
      };

      await sendSendGridAlert(msg, env.SENDGRID_API_KEY);
      logger.info(
        `✅ Email alert accepted by SendGrid for ${this.config.emailRecipients.length} recipient(s)`,
      );
      return true;
    } catch (error) {
      logger.warn({ err: error }, "Failed to send email alert:");
      return false;
    }
  }

  async checkQueueMetrics(metrics: Record<string, unknown>): Promise<void> {
    const queueMetrics = metrics as {
      queueName?: string;
      waiting?: number;
      failed?: number;
      redisLatency?: number;
    };
    if ((queueMetrics.waiting ?? 0) > this.config.thresholds?.queueMaxWaiting) {
      await this.sendAlert({
        severity: "warning",
        title: "High Queue Backlog",
        message: `Queue has ${queueMetrics.waiting ?? 0} waiting jobs (threshold: ${this.config.thresholds?.queueMaxWaiting})`,
        timestamp: new Date(),
        metadata: {
          queueName: queueMetrics.queueName,
          waiting: queueMetrics.waiting,
        },
      });
    }

    if ((queueMetrics.failed ?? 0) > this.config.thresholds?.queueMaxFailed) {
      await this.sendAlert({
        severity: "critical",
        title: "High Failed Job Count",
        message: `Queue has ${queueMetrics.failed ?? 0} failed jobs (threshold: ${this.config.thresholds?.queueMaxFailed})`,
        timestamp: new Date(),
        metadata: { queueName: queueMetrics.queueName, failed: queueMetrics.failed },
      });
    }

    if (
      (queueMetrics.redisLatency ?? 0) > this.config.thresholds?.queueMaxLatency
    ) {
      await this.sendAlert({
        severity: "warning",
        title: "High Redis Latency",
        message: `Redis latency is ${queueMetrics.redisLatency ?? 0}ms (threshold: ${this.config.thresholds?.queueMaxLatency}ms)`,
        timestamp: new Date(),
        metadata: {
          queueName: queueMetrics.queueName,
          latency: queueMetrics.redisLatency,
        },
      });
    }
  }

  async checkAICacheMetrics(metrics: Record<string, unknown>): Promise<void> {
    const aiMetrics = metrics as {
      social?: { utilizationPercent?: string | number };
      advertising?: { utilizationPercent?: string | number };
    };
    const socialUtil = parseFloat(
      String(aiMetrics.social?.utilizationPercent ?? "0"),
    );
    const adUtil = parseFloat(
      String(aiMetrics.advertising?.utilizationPercent ?? "0"),
    );

    if (socialUtil > this.config.thresholds?.aiCacheMaxUtilization) {
      await this.sendAlert({
        severity: "warning",
        title: "High AI Cache Utilization - Social",
        message: `Social Media AI cache at ${socialUtil?.toFixed(1)}% utilization (threshold: ${this.config.thresholds?.aiCacheMaxUtilization}%)`,
        timestamp: new Date(),
        metadata: { type: "social", utilization: socialUtil },
      });
    }

    if (adUtil > this.config.thresholds?.aiCacheMaxUtilization) {
      await this.sendAlert({
        severity: "warning",
        title: "High AI Cache Utilization - Advertising",
        message: `Advertising AI cache at ${adUtil?.toFixed(1)}% utilization (threshold: ${this.config.thresholds?.aiCacheMaxUtilization}%)`,
        timestamp: new Date(),
        metadata: { type: "advertising", utilization: adUtil },
      });
    }
  }

  async checkMemoryUsage(memoryMB: number): Promise<void> {
    if (memoryMB > this.config.thresholds?.memoryMaxMB) {
      await this.sendAlert({
        severity: "critical",
        title: "High Memory Usage",
        message: `Server memory usage is ${memoryMB?.toFixed(0)}MB (threshold: ${this.config.thresholds?.memoryMaxMB}MB)`,
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
