import pino from "pino";
import { format } from "node:util";
import { sanitizeLogText, sanitizeLogValue } from "./logSanitizer.js";
const REDACT_PATHS = [
  // Headers
  "req.headers.authorization",
  "req.headers.cookie",
  'req.headers["x-api-key"]',
  'req.headers["x-csrf-token"]',
  "headers.authorization",
  "headers.cookie",
  'headers["x-api-key"]',
  'headers["x-csrf-token"]',
  // Auth payloads
  "*.password",
  "*.passwordHash",
  "*.currentPassword",
  "*.newPassword",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.idToken",
  "*.apiKey",
  "*.secret",
  "*.clientSecret",
  "*.privateKey",
  "*.twoFactorSecret",
  "*.totpSecret",
  // Stripe / payments
  "*.stripeSecretKey",
  "*.stripeWebhookSecret",
  "*.cardNumber",
  "*.cvc",
  "*.cvv",
  // Generic sensitive containers
  "body.password",
  "body.token",
  "body.secret",
  "body.apiKey"
];
const transport = process.env.NODE_ENV !== "production" && !process.env.REPLIT_DEPLOYMENT ? { target: "pino-pretty", options: { colorize: true } } : void 0;
function createAppLogger(destination) {
  const options = {
    level: process.env.LOG_LEVEL || "info",
    hooks: {
      logMethod(args, method) {
        const clean = args.map((value) => sanitizeLogValue(value));
        const messageIndex = typeof clean[0] === "string" ? 0 : 1;
        if (typeof clean[messageIndex] === "string") {
          const message = sanitizeLogText(format(...clean.slice(messageIndex)));
          clean.splice(messageIndex, clean.length - messageIndex, message);
        }
        method.apply(this, clean);
      }
    },
    formatters: {
      bindings: (bindings) => ({ ...sanitizeLogValue(bindings) }),
      log: (object) => ({ ...sanitizeLogValue(object) })
    },
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
      remove: false
    },
    transport: destination ? void 0 : transport
  };
  const instance = destination ? pino(options, destination) : pino(options);
  const child = instance.child;
  instance.child = function(bindings, childOptions) {
    return child.call(this, { ...sanitizeLogValue(bindings) }, childOptions);
  };
  const setBindings = instance.setBindings;
  instance.setBindings = function(bindings) {
    setBindings.call(this, { ...sanitizeLogValue(bindings) });
  };
  return instance;
}
const logger = createAppLogger();
export {
  createAppLogger,
  logger
};
