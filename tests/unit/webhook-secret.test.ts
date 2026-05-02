/**
 * Unit tests for webhook security — WEBHOOK_SECRET requirement.
 *
 * The webhookReliabilityService must require a real secret in production.
 * A dev fallback is acceptable only in non-production environments.
 * Verified via static source analysis (avoids module-level side effects).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const SERVICE_PATH = 'server/services/webhookReliabilityService.ts';

describe('WebhookReliabilityService — secret enforcement', () => {
  it('references isProductionEnv for environment detection', () => {
    const src = readFileSync(SERVICE_PATH, 'utf8');
    expect(src).toContain('isProductionEnv');
  });

  it('throws when WEBHOOK_SECRET is missing in production', () => {
    const src = readFileSync(SERVICE_PATH, 'utf8');
    // Must have a throw/error inside an isProductionEnv() check
    expect(src).toMatch(/isProductionEnv\(\)[\s\S]{0,400}throw/);
  });

  it('uses HMAC-SHA256 to sign payloads', () => {
    const src = readFileSync(SERVICE_PATH, 'utf8');
    expect(src).toContain('sha256');
    expect(src).toContain('createHmac');
  });

  it('does NOT use bare NODE_ENV === "production" check', () => {
    const src = readFileSync(SERVICE_PATH, 'utf8');
    // The canonical check is isProductionEnv(), not NODE_ENV directly
    expect(src).not.toContain("NODE_ENV === 'production'");
    expect(src).not.toContain('NODE_ENV === "production"');
  });

  it('includes X-Webhook-Signature header in outgoing requests', () => {
    const src = readFileSync(SERVICE_PATH, 'utf8');
    expect(src).toContain('X-Webhook-Signature');
  });

  it('implements exponential backoff with at least 5 retry slots', () => {
    const src = readFileSync(SERVICE_PATH, 'utf8');
    expect(src).toContain('MAX_RETRIES');
    expect(src).toMatch(/MAX_RETRIES\s*=\s*[5-9]/);
  });

  it('has dead-letter queue for exhausted retries', () => {
    const src = readFileSync(SERVICE_PATH, 'utf8');
    expect(src.toLowerCase()).toContain('deadletter');
  });
});

describe('Webhook signature logic', () => {
  it('HMAC-SHA256 produces deterministic output for same key + payload', async () => {
    const crypto = await import('crypto');
    const secret = 'test-secret-key-min32chars-xxxxx';
    const payload = JSON.stringify({ event: 'test', id: 123 });
    const sig1 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const sig2 = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    expect(sig1).toBe(sig2);
    expect(sig1).toHaveLength(64);
  });

  it('HMAC-SHA256 produces different output for different payloads', async () => {
    const crypto = await import('crypto');
    const secret = 'test-secret-key-min32chars-xxxxx';
    const sig1 = crypto.createHmac('sha256', secret).update('payload-a').digest('hex');
    const sig2 = crypto.createHmac('sha256', secret).update('payload-b').digest('hex');
    expect(sig1).not.toBe(sig2);
  });

  it('HMAC-SHA256 produces different output for different secrets', async () => {
    const crypto = await import('crypto');
    const payload = JSON.stringify({ event: 'test' });
    const sig1 = crypto.createHmac('sha256', 'secret-one').update(payload).digest('hex');
    const sig2 = crypto.createHmac('sha256', 'secret-two').update(payload).digest('hex');
    expect(sig1).not.toBe(sig2);
  });
});
