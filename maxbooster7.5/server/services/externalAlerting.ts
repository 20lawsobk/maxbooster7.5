/**
 * External Alerting Service
 * 
 * Sends alerts to external monitoring and notification services:
 * - Slack
 * - PagerDuty
 * - Email (via SendGrid)
 * - Generic Webhooks
 */

import { logger } from '../logger.js';
import { getConfig } from '../config/selfHealingConfig.js';

export interface Alert {
  id: string;
  timestamp: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  details?: Record<string, any>;
  source: string;
  tags?: string[];
}

export class ExternalAlertingService {
  private config = getConfig();

  /**
   * Send alert to all configured channels
   */
  async sendAlert(alert: Alert): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.config.alerting.channels.slack && this.config.alerting.slackWebhookUrl) {
      promises.push(this.sendToSlack(alert));
    }

    if (this.config.alerting.channels.pagerduty && this.config.alerting.pagerdutyKey) {
      promises.push(this.sendToPagerDuty(alert));
    }

    if (this.config.alerting.channels.webhook && this.config.alerting.webhookUrl) {
      promises.push(this.sendToWebhook(alert));
    }

    if (this.config.alerting.channels.email && this.config.alerting.emailRecipients) {
      promises.push(this.sendEmail(alert));
    }

    if (this.config.alerting.channels.console) {
      this.logToConsole(alert);
    }

    await Promise.allSettled(promises);
  }

  /**
   * Send alert to Slack via webhook
   */
  private async sendToSlack(alert: Alert): Promise<void> {
    try {
      const color = this.getSeverityColor(alert.severity);
      const emoji = this.getSeverityEmoji(alert.severity);

      const payload = {
        text: `${emoji} *${alert.title}*`,
        attachments: [
          {
            color,
            fields: [
              {
                title: 'Severity',
                value: alert.severity.toUpperCase(),
                short: true,
              },
              {
                title: 'Source',
                value: alert.source,
                short: true,
              },
              {
                title: 'Message',
                value: alert.message,
                short: false,
              },
            ],
            footer: 'Max Booster Self-Healing',
            ts: Math.floor(alert.timestamp / 1000),
          },
        ],
      };

      const response = await fetch(this.config.alerting.slackWebhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Slack webhook failed: ${response.statusText}`);
      }

      logger.info(`Alert sent to Slack: ${alert.id}`);
    } catch (error) {
      logger.error('Failed to send Slack alert:', error);
    }
  }

  /**
   * Send alert to PagerDuty
   */
  private async sendToPagerDuty(alert: Alert): Promise<void> {
    try {
      // Only send high and critical alerts to PagerDuty
      if (alert.severity !== 'high' && alert.severity !== 'critical') {
        return;
      }

      const payload = {
        routing_key: this.config.alerting.pagerdutyKey,
        event_action: 'trigger',
        payload: {
          summary: alert.title,
          severity: alert.severity === 'critical' ? 'critical' : 'error',
          source: alert.source,
          timestamp: new Date(alert.timestamp).toISOString(),
          custom_details: {
            message: alert.message,
            ...alert.details,
          },
        },
      };

      const response = await fetch('https://events.pagerduty.com/v2/enqueue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`PagerDuty API failed: ${response.statusText}`);
      }

      logger.info(`Alert sent to PagerDuty: ${alert.id}`);
    } catch (error) {
      logger.error('Failed to send PagerDuty alert:', error);
    }
  }

  /**
   * Send alert to generic webhook
   */
  private async sendToWebhook(alert: Alert): Promise<void> {
    try {
      const response = await fetch(this.config.alerting.webhookUrl!, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed: ${response.statusText}`);
      }

      logger.info(`Alert sent to webhook: ${alert.id}`);
    } catch (error) {
      logger.error('Failed to send webhook alert:', error);
    }
  }

  /**
   * Send email alert (placeholder - integrate with SendGrid)
   */
  private async sendEmail(alert: Alert): Promise<void> {
    try {
      // TODO: Integrate with SendGrid when API key is configured
      logger.info(`Email alert would be sent to: ${this.config.alerting.emailRecipients?.join(', ')}`);
      logger.info(`Alert: ${alert.title} - ${alert.message}`);

      // Example SendGrid integration:
      // const sgMail = require('@sendgrid/mail');
      // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      // await sgMail.send({
      //   to: this.config.alerting.emailRecipients,
      //   from: 'alerts@maxbooster.com',
      //   subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      //   text: alert.message,
      //   html: this.formatEmailHtml(alert),
      // });
    } catch (error) {
      logger.error('Failed to send email alert:', error);
    }
  }

  /**
   * Log alert to console
   */
  private logToConsole(alert: Alert): void {
    const prefix = this.getSeverityEmoji(alert.severity);
    logger.warn(`${prefix} [${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`, {
      alertId: alert.id,
      source: alert.source,
      details: alert.details,
    });
  }

  /**
   * Get color for alert severity
   */
  private getSeverityColor(severity: string): string {
    switch (severity) {
      case 'critical':
        return '#ff0000';
      case 'high':
        return '#ff6600';
      case 'medium':
        return '#ffaa00';
      case 'low':
        return '#ffff00';
      default:
        return '#cccccc';
    }
  }

  /**
   * Get emoji for alert severity
   */
  private getSeverityEmoji(severity: string): string {
    switch (severity) {
      case 'critical':
        return '🚨';
      case 'high':
        return '⚠️';
      case 'medium':
        return '⚡';
      case 'low':
        return 'ℹ️';
      default:
        return '📢';
    }
  }
}

// Singleton instance
export const externalAlertingService = new ExternalAlertingService();
