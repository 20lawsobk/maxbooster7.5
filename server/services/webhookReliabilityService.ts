import crypto from 'crypto';
import axios from 'axios';
import { storage } from '../storage';
import type { InsertWebhookAttempt, InsertWebhookDeadLetterQueue } from '@shared/schema';

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || crypto.randomBytes(32).toString('hex');
const MAX_RETRIES = 5;
const RETRY_DELAYS = [1000, 5000, 25000, 125000, 625000]; // Exponential backoff with jitter

interface WebhookDispatchResult {
  success: boolean;
  attemptId: string;
  statusCode?: number;
  error?: string;
}

export class WebhookReliabilityService {
  private generateSignature(payload: unknown): string {
    const payloadString = JSON.stringify(payload);
    return crypto.createHmac('sha256', WEBHOOK_SECRET).update(payloadString).digest('hex');
  }

  private calculateNextRetry(attemptNumber: number): Date | null {
    if (attemptNumber >= MAX_RETRIES) {
      return null;
    }

    const baseDelay = RETRY_DELAYS[attemptNumber] || RETRY_DELAYS[RETRY_DELAYS.length - 1];
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;

    return new Date(Date.now() + delay);
  }

  async dispatchWebhook(
    eventId: number,
    url: string,
    payload: unknown,
    attemptNumber: number = 1
  ): Promise<WebhookDispatchResult> {
    const signature = this.generateSignature(payload);

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event-Id': eventId.toString(),
        },
        timeout: 30000,
        validateStatus: () => true,
      });

      const attemptData: InsertWebhookAttempt = {
        webhookEventId: eventId,
        attempt: attemptNumber,
        status: response.status >= 200 && response.status < 300 ? 'success' : 'failed',
        responseCode: response.status,
        responseBody: JSON.stringify(response.data).substring(0, 5000),
        error: response.status >= 200 && response.status < 300 ? null : `HTTP ${response.status}`,
        url,
        payload,
        nextRetryAt:
          response.status >= 200 && response.status < 300
            ? null
            : this.calculateNextRetry(attemptNumber),
      };

      const attempt = await storage.createWebhookAttempt(attemptData);

      if (response.status >= 200 && response.status < 300) {
        return {
          success: true,
          attemptId: attempt.id,
          statusCode: response.status,
        };
      }

      if (attemptNumber >= MAX_RETRIES) {
        await this.moveToDeadLetterQueue(
          eventId,
          attemptNumber,
          `Max retries exceeded. Last status: ${response.status}`,
          payload
        );
      }

      return {
        success: false,
        attemptId: attempt.id,
        statusCode: response.status,
        error: `HTTP ${response.status}`,
      };
    } catch (error: unknown) {
      const errorMessage = error.message || 'Unknown error';

      const attemptData: InsertWebhookAttempt = {
        webhookEventId: eventId,
        attempt: attemptNumber,
        status: 'failed',
        responseCode: error.response?.status || null,
        responseBody: null,
        error: errorMessage.substring(0, 1000),
        url,
        payload,
        nextRetryAt: this.calculateNextRetry(attemptNumber),
      };

      const attempt = await storage.createWebhookAttempt(attemptData);

      if (attemptNumber >= MAX_RETRIES) {
        await this.moveToDeadLetterQueue(eventId, attemptNumber, errorMessage, payload);
      }

      return {
        success: false,
        attemptId: attempt.id,
        error: errorMessage,
      };
    }
  }

  async retryWebhook(attemptId: string): Promise<WebhookDispatchResult> {
    const attempt = await storage.getWebhookAttempt(attemptId);
    if (!attempt) {
      throw new Error('Webhook attempt not found');
    }

    const nextAttemptNumber = attempt.attempt + 1;

    return this.dispatchWebhook(
      attempt.webhookEventId,
      attempt.url,
      attempt.payload,
      nextAttemptNumber
    );
  }

  private async moveToDeadLetterQueue(
    eventId: number,
    attempts: number,
    lastError: string,
    payload: unknown
  ): Promise<void> {
    const dlqData: InsertWebhookDeadLetterQueue = {
      webhookEventId: eventId,
      attempts,
      lastError: lastError.substring(0, 5000),
      payload,
      status: 'queued',
      processedAt: null,
    };

    await storage.addToDeadLetterQueue(dlqData);
  }

  async reprocessDeadLetter(dlqId: string): Promise<void> {
    const item = await storage.getDeadLetterQueueItem(dlqId);
    if (!item) {
      throw new Error('Dead letter queue item not found');
    }

    const webhookEvent = await storage.getWebhookEvent(item.webhookEventId);
    if (!webhookEvent) {
      throw new Error('Webhook event not found');
    }

    await storage.reprocessDeadLetter(dlqId);

    const url = webhookEvent.raw?.url || webhookEvent.raw?.webhook_url || '';
    if (!url) {
      throw new Error('Webhook URL not found in event data');
    }

    await this.dispatchWebhook(item.webhookEventId, url, item.payload, 1);
  }

  async scheduleRetries(): Promise<void> {
    // This method would be called by a background job to process pending retries
    // Implementation would query for attempts with nextRetryAt <= now and dispatch them
  }
}

export const webhookReliabilityService = new WebhookReliabilityService();
