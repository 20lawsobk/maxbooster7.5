import pino from "pino";
import { format } from "node:util";
import { sanitizeLogText, sanitizeLogValue } from "./logSanitizer.js";

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

const transport =
  process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT
    ? { target: "pino-pretty", options: { colorize: true } }
    : undefined;

/** Exported for isolated destination-capture tests; production uses the singleton. */
export function createAppLogger(destination?: pino.DestinationStream) {
  const options: pino.LoggerOptions = {
  level: process.env.LOG_LEVEL || "info",
  hooks: {
    logMethod(args, method) {
      const clean = args.map(value => sanitizeLogValue(value));
      // Redact after interpolation as well: "%s@%s" must not reconstruct PII.
      const messageIndex = typeof clean[0] === "string" ? 0 : 1;
      if (typeof clean[messageIndex] === "string") {
        const message = sanitizeLogText(format(...clean.slice(messageIndex)));
        clean.splice(messageIndex, clean.length - messageIndex, message);
      }
      method.apply(this, clean as Parameters<typeof method>);
    },
  },
  formatters: {
    bindings: bindings => ({ ...sanitizeLogValue(bindings) as Record<string, unknown> }),
    log: object => ({ ...sanitizeLogValue(object) as Record<string, unknown> }),
  },
  redact: {
    paths: REDACT_PATHS,
    censor: "[REDACTED]",
    remove: false,
  },
  transport: destination ? undefined : transport,
  };
  const instance = destination ? pino(options, destination) : pino(options);
  const child = instance.child;
  // Pino intentionally resets the bindings formatter for children. Sanitize
  // before child creation too, including grandchildren.
  instance.child = function (this: typeof instance, bindings, childOptions) {
    return child.call(this, { ...sanitizeLogValue(bindings) as Record<string, unknown> }, childOptions);
  } as typeof instance.child;
  const setBindings = instance.setBindings;
  instance.setBindings = function (bindings) {
    setBindings.call(this, { ...sanitizeLogValue(bindings) as Record<string, unknown> });
  };
  return instance;
}

export const logger = createAppLogger();
