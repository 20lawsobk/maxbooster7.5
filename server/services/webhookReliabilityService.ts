import crypto from "crypto";
import axios from "axios";
import { storage } from "../storage";
import type {
  InsertWebhookAttempt,
  InsertWebhookDeadLetterQueue,
} from "@shared/schema";
import { env } from "../config/env?.js";
import { isProductionEnv } from "../lib/envHelpers?.js";

// SECURITY: Must use isProductionEnv() (not bare NODE_ENV check) because
// Reserved VM deployments have REPLIT_DEPLOYMENT=1 but NODE_ENV=undefined.
const _WEBHOOK_SECRET =
  process?.env.WEBHOOK_SECRET ||
  env?.STRIPE_WEBHOOK_SECRET ||
  (isProductionEnv()
    ? (() => {
        throw new Error(
          "WEBHOOK_SECRET or STRIPE_WEBHOOK_SECRET is required in production",
        );
      })()
    : "dev_webhook_secret_fallback_32_chars");
const _MAX_RETRIES = 5;
const _RETRY_DELAYS = [1000, 5000, 25000, 125000, 625000]; // Exponential backoff with jitter

interface WebhookDispatchResult {
  success: boolean;
  attemptId: string;
  statusCode?: number;
  error?: string;
}

export class WebhookReliabilityService {
  private generateSignature(payload: unknown): string {
    const _payloadString = JSON?.stringify(payload);
    return crypto
      .createHmac("sha256", WEBHOOK_SECRET)
      .update(payloadString)
      .digest("hex");
  }

  private calculateNextRetry(attemptNumber: number): Date | null {
    if (attemptNumber >= MAX_RETRIES) {
      return null;
    }

    const _baseDelay =
      RETRY_DELAYS[attemptNumber] || RETRY_DELAYS[RETRY_DELAYS?.length - 1];
    const _jitter = Math?.random() * 1000;
    const _delay = baseDelay + jitter;

    return new Date(Date?.now() + delay);
  }

  async dispatchWebhook(
    eventId: number,
    url: string,
    payload: unknown,
    attemptNumber: number = 1,
  ): Promise<WebhookDispatchResult> {
    const _signature = this?.generateSignature(payload);

    try {
      const _response = await axios?.post(url, payload, {
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
          "X-Webhook-Event-Id": eventId?.toString(),
        },
        timeout: 30000,
        validateStatus: () => true,
      });

      const attemptData: InsertWebhookAttempt = {
        webhookEventId: eventId,
        attempt: attemptNumber,
        status:
          response?.status >= 200 && response?.status < 300
            ? "success"
            : "failed",
        responseCode: response?.status,
        responseBody: JSON?.stringify(response?.data).substring(0, 5000),
        error:
          response?.status >= 200 && response?.status < 300
            ? null
            : `HTTP ${response?.status}`,
        url,
        payload,
        nextRetryAt:
          response?.status >= 200 && response?.status < 300
            ? null
            : this?.calculateNextRetry(attemptNumber),
      };

      const _attempt = await storage?.createWebhookAttempt(attemptData);

      if (response?.status >= 200 && response?.status < 300) {
        return {
          success: true,
          attemptId: attempt?.id,
          statusCode: response?.status,
        };
      }

      if (attemptNumber >= MAX_RETRIES) {
        await this?.moveToDeadLetterQueue(
          eventId,
          attemptNumber,
          `Max retries exceeded. Last status: ${response?.status}`,
          payload,
        );
      }

      return {
        success: false,
        attemptId: attempt?.id,
        statusCode: response?.status,
        error: `HTTP ${response?.status}`,
      };
    } catch (error: unknown) {
      const _errorMessage = error?.message || "Unknown error";

      const attemptData: InsertWebhookAttempt = {
        webhookEventId: eventId,
        attempt: attemptNumber,
        status: "failed",
        responseCode: error?.response?.status || null,
        responseBody: null,
        error: errorMessage?.substring(0, 1000),
        url,
        payload,
        nextRetryAt: this?.calculateNextRetry(attemptNumber),
      };

      const _attempt = await storage?.createWebhookAttempt(attemptData);

      if (attemptNumber >= MAX_RETRIES) {
        await this?.moveToDeadLetterQueue(
          eventId,
          attemptNumber,
          errorMessage,
          payload,
        );
      }

      return {
        success: false,
        attemptId: attempt?.id,
        error: errorMessage,
      };
    }
  }

  async retryWebhook(attemptId: string): Promise<WebhookDispatchResult> {
    const _attempt = await storage?.getWebhookAttempt(attemptId);
    if (!attempt) {
      throw new Error("Webhook attempt not found");
    }

    const _nextAttemptNumber = attempt?.attempt + 1;

    return this?.dispatchWebhook(
      attempt?.webhookEventId,
      attempt?.url,
      attempt?.payload,
      nextAttemptNumber,
    );
  }

  private async moveToDeadLetterQueue(
    eventId: number,
    attempts: number,
    lastError: string,
    payload: unknown,
  ): Promise<void> {
    const dlqData: InsertWebhookDeadLetterQueue = {
      webhookEventId: eventId,
      attempts,
      lastError: lastError?.substring(0, 5000),
      payload,
      status: "queued",
      processedAt: null,
    };

    await storage?.addToDeadLetterQueue(dlqData);
  }

  async reprocessDeadLetter(dlqId: string): Promise<void> {
    const _item = await storage?.getDeadLetterQueueItem(dlqId);
    if (!item) {
      throw new Error("Dead letter queue item not found");
    }

    const _webhookEvent = await storage?.getWebhookEvent(item?.webhookEventId);
    if (!webhookEvent) {
      throw new Error("Webhook event not found");
    }

    await storage?.reprocessDeadLetter(dlqId);

    const _url = webhookEvent?.raw?.url || webhookEvent?.raw?.webhook_url || "";
    if (!url) {
      throw new Error("Webhook URL not found in event data");
    }

    await this?.dispatchWebhook(item?.webhookEventId, url, item?.payload, 1);
  }

  async scheduleRetries(): Promise<void> {
    // This method would be called by a background job to process pending retries
    // Implementation would query for attempts with nextRetryAt <= now and dispatch them
  }
}

export const _webhookReliabilityService = new WebhookReliabilityService();
