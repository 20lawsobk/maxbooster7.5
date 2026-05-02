import pino from 'pino';

// Production-grade redaction — never let secrets/PII reach stdout/log sinks.
// Paths use Pino's redaction syntax (https://getpino.io/#/docs/redaction).
const REDACT_PATHS = [
  // Headers
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'req.headers["x-csrf-token"]',
  'headers.authorization',
  'headers.cookie',
  'headers["x-api-key"]',
  'headers["x-csrf-token"]',
  // Auth payloads
  '*.password',
  '*.passwordHash',
  '*.currentPassword',
  '*.newPassword',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.idToken',
  '*.apiKey',
  '*.secret',
  '*.clientSecret',
  '*.privateKey',
  '*.twoFactorSecret',
  '*.totpSecret',
  // Stripe / payments
  '*.stripeSecretKey',
  '*.stripeWebhookSecret',
  '*.cardNumber',
  '*.cvc',
  '*.cvv',
  // Generic sensitive containers
  'body.password',
  'body.token',
  'body.secret',
  'body.apiKey',
];

const transport = (process.env.NODE_ENV !== 'production' && !process.env.REPLIT_DEPLOYMENT)
  ? { target: 'pino-pretty', options: { colorize: true } }
  : undefined;

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  redact: {
    paths: REDACT_PATHS,
    censor: '[REDACTED]',
    remove: false,
  },
  transport,
});
