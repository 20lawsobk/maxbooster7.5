import type { MailDataRequired } from '@sendgrid/mail';
import { logger } from '../logger.js';

interface EmailLog {
  timestamp: Date;
  to: string;
  templateId?: string;
  subject?: string;
  status: 'sent' | 'failed' | 'queued';
  error?: string;
  deliveryTime?: number;
}

class EmailMonitor {
  private logs: EmailLog[] = [];
  private deliveryRates = {
    sent: 0,
    failed: 0,
    total: 0,
  };

  logEmail(
    email: MailDataRequired,
    status: 'sent' | 'failed',
    error?: string,
    deliveryTime?: number
  ) {
    const log: EmailLog = {
      timestamp: new Date(),
      to: Array.isArray(email.to) ? email.to[0].toString() : email.to.toString(),
      templateId: (email as any).templateId,
      subject: email.subject as string,
      status,
      error,
      deliveryTime,
    };

    this.logs.push(log);
    this.updateMetrics(status);

    logger.info(`[EmailMonitor] ${status.toUpperCase()}: ${log.to} ${error ? `(${error})` : ''}`);
  }

  private updateMetrics(status: 'sent' | 'failed') {
    this.deliveryRates.total++;
    if (status === 'sent') this.deliveryRates.sent++;
    if (status === 'failed') this.deliveryRates.failed++;
  }

  getDeliveryRate(): number {
    return this.deliveryRates.total === 0
      ? 100
      : (this.deliveryRates.sent / this.deliveryRates.total) * 100;
  }

  getStats() {
    return {
      deliveryRate: this.getDeliveryRate(),
      ...this.deliveryRates,
      recentLogs: this.logs.slice(-10),
    };
  }

  getRecentFailures() {
    return this.logs.filter((log) => log.status === 'failed').slice(-10);
  }
}

export const emailMonitor = new EmailMonitor();
