__vite_ssr_exportName__("createAppLogger", () => { try { return createAppLogger } catch {} });
__vite_ssr_exportName__("logger", () => { try { return logger } catch {} });
const __vite_ssr_import_0__ = await __vite_ssr_import__("pino", {"importedNames":["default"]});
const __vite_ssr_import_1__ = await __vite_ssr_import__("node:util", {"importedNames":["format"]});
const __vite_ssr_import_2__ = await __vite_ssr_import__("./logSanitizer.js", {"importedNames":["sanitizeLogText","sanitizeLogValue"]});



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
        const clean = args.map((value) => (0,__vite_ssr_import_2__.sanitizeLogValue)(value));
        const messageIndex = typeof clean[0] === "string" ? 0 : 1;
        if (typeof clean[messageIndex] === "string") {
          const message = (0,__vite_ssr_import_2__.sanitizeLogText)((0,__vite_ssr_import_1__.format)(...clean.slice(messageIndex)));
          clean.splice(messageIndex, clean.length - messageIndex, message);
        };
        method.apply(this, clean);
      }
    },
    formatters: {
      bindings: (bindings) => ({ ...(0,__vite_ssr_import_2__.sanitizeLogValue)(bindings) }),
      log: (object) => ({ ...(0,__vite_ssr_import_2__.sanitizeLogValue)(object) })
    },
    redact: {
      paths: REDACT_PATHS,
      censor: "[REDACTED]",
      remove: false
    },
    transport: destination ? void 0 : transport
  };
  const instance = destination ? (0,__vite_ssr_import_0__.default)(options, destination) : (0,__vite_ssr_import_0__.default)(options);
  const child = instance.child;
  instance.child = function(bindings, childOptions) {
    return child.call(this, { ...(0,__vite_ssr_import_2__.sanitizeLogValue)(bindings) }, childOptions);
  };
  const setBindings = instance.setBindings;
  instance.setBindings = function(bindings) {
    setBindings.call(this, { ...(0,__vite_ssr_import_2__.sanitizeLogValue)(bindings) });
  };
  return instance;
}
const logger = createAppLogger();

