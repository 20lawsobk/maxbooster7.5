import { Router, raw } from 'express';
import { emailTrackingService } from '../../services/emailTrackingService.js';
import { logger } from '../../logger.js';

const router = Router();

/**
 * SendGrid Event Webhook
 * Handles delivery events: delivered, bounce, spam, unsubscribe, open, click
 * SECURED with signature verification
 */
router.post('/sendgrid', raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-twilio-email-event-webhook-signature'] as string;
    const timestamp = req.headers['x-twilio-email-event-webhook-timestamp'] as string;
    const rawBody = req.body?.toString('utf-8') || '';

    if (process.env.NODE_ENV === 'production' && !process.env.SENDGRID_WEBHOOK_PUBLIC_KEY) {
      logger.error('❌ CRITICAL: SendGrid webhook public key not configured in production');
      return res.status(500).json({ error: 'Webhook verification not configured' });
    }

    if (process.env.NODE_ENV === 'production' || process.env.SENDGRID_WEBHOOK_PUBLIC_KEY) {
      if (!signature || !timestamp) {
        logger.warn('⚠️  SendGrid webhook missing required signature headers');
        return res.status(401).json({ error: 'Missing signature headers' });
      }

      const isValid = emailTrackingService.verifySendGridSignature(rawBody, signature, timestamp);

      if (!isValid) {
        logger.warn('⚠️  SendGrid webhook signature verification failed');
        return res.status(401).json({ error: 'Signature verification failed' });
      }
    }

    const payload = JSON.parse(rawBody);
    const events = Array.isArray(payload) ? payload : [payload];

    for (const event of events) {
      const {
        sg_message_id,
        email,
        event: eventType,
        timestamp: eventTimestamp,
        reason,
        smtp_response,
      } = event;

      if (!sg_message_id || !eventType) {
        continue;
      }

      await emailTrackingService.recordEmailEvent({
        messageId: sg_message_id,
        eventType: mapSendGridEventType(eventType),
        eventAt: new Date(eventTimestamp * 1000),
        smtpResponse: smtp_response,
        reason,
        metadata: event,
      });
    }

    res.status(200).json({ received: true });
  } catch (error: unknown) {
    logger.error('SendGrid webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

/**
 * Map SendGrid event types to our enum
 */
/**
 * TODO: Add function documentation
 */
function mapSendGridEventType(
  eventType: string
): 'delivered' | 'bounce' | 'spam' | 'unsubscribe' | 'open' | 'click' | 'deferred' | 'dropped' {
  const typeMap: Record<string, any> = {
    delivered: 'delivered',
    bounce: 'bounce',
    dropped: 'dropped',
    spamreport: 'spam',
    unsubscribe: 'unsubscribe',
    open: 'open',
    click: 'click',
    deferred: 'deferred',
  };

  return typeMap[eventType] || 'delivered';
}

export default router;
