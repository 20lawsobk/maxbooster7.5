import { isIP } from "node:net";

export const REDACTED = "[REDACTED]";

// Normalize case/separators so provider snake_case and application camelCase
// names receive the same treatment, at every depth (not just one wildcard).
const sensitiveKey = /^(?:.*(?:password|secret|token|apikey|privatekey|authorization|cookie)|.*email(?:address)?|.*username|(?:client|remote|source|user)?ip(?:address)?|.*phone(?:number)?|cardnumber|cvc|cvv|xforwardedfor|xrealip|setcookie)$/i;

export function sanitizeLogText(text: string): string {
  return text
    .replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=~:-]+/gi, REDACTED)
    .replace(/((?:password|secret|access[_-]?token|refresh[_-]?token|api[_-]?key)\s*[=:]\s*)[^\s,;&]+/gi, `$1${REDACTED}`)
    .replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED)
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, value => isIP(value) ? REDACTED : value)
    .replace(/(?<![a-zA-Z0-9])(?:[a-fA-F0-9]*:){2,}[a-fA-F0-9:.]*(?:%[a-zA-Z0-9]+)?/g,
      value => isIP(value) ? REDACTED : value);
}

/** Copy, never mutate request/provider objects. Bounded traversal prevents cycles
 * and hostile payload size from turning diagnostic serialization into a DoS.
 * Free-form text cannot reliably identify arbitrary usernames or opaque secrets;
 * sensitive call sites must use the allowlisted event API, not rely on regexes.
 */
export function sanitizeLogValue(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (typeof value === "string") return sanitizeLogText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= 12) return "[LOG_DEPTH_LIMIT]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  try {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return "[BINARY]";
    if (Array.isArray(value)) {
      const result = value.slice(0, 100).map(item => sanitizeLogValue(item, seen, depth + 1));
      if (value.length > 100) result.push("[LOG_ITEM_LIMIT]");
      return result;
    }
    const result: Record<string, unknown> = Object.create(null);
    if (value instanceof Error) {
      result.type = value.name;
      result.message = sanitizeLogText(value.message);
      result.stack = value.stack ? sanitizeLogText(value.stack) : undefined;
    }
    const keys = Object.getOwnPropertyNames(value).slice(0, 100);
    for (const key of keys) {
      if (["__proto__", "constructor", "prototype", "hasOwnProperty", "toJSON"].includes(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) continue;
      // Never invoke application-controlled getters or toJSON during logging.
      if (!("value" in descriptor)) {
        result[sanitizeLogText(key)] = "[ACCESSOR]";
      } else {
        result[sanitizeLogText(key)] = sensitiveKey.test(key.replace(/[-_]/g, ""))
          ? REDACTED
          : sanitizeLogValue(descriptor.value, seen, depth + 1);
      }
    }
    if (Object.getOwnPropertyNames(value).length > 100) result.logTruncated = true;
    return result;
  } finally {
    seen.delete(value);
  }
}