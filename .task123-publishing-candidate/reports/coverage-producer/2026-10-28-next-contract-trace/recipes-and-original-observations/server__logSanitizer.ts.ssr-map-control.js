__vite_ssr_exportName__("REDACTED", () => { try { return REDACTED } catch {} });
__vite_ssr_exportName__("sanitizeLogText", () => { try { return sanitizeLogText } catch {} });
__vite_ssr_exportName__("sanitizeLogValue", () => { try { return sanitizeLogValue } catch {} });
const __vite_ssr_import_0__ = await __vite_ssr_import__("node:net", {"importedNames":["isIP"]});

const REDACTED = "[REDACTED]";
const sensitiveKey = /^(?:.*(?:password|secret|token|apikey|privatekey|authorization|cookie)|.*email(?:address)?|.*username|(?:client|remote|source|user)?ip(?:address)?|.*phone(?:number)?|cardnumber|cvc|cvv|xforwardedfor|xrealip|setcookie)$/i;
function sanitizeLogText(text) {
  return text.replace(/\b(?:Bearer|Basic)\s+[A-Za-z0-9+/_.=~:-]+/gi, REDACTED).replace(/((?:password|secret|access[_-]?token|refresh[_-]?token|api[_-]?key)\s*[=:]\s*)[^\s,;&]+/gi, `$1${REDACTED}`).replace(/[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, REDACTED).replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, (value) => (0,__vite_ssr_import_0__.isIP)(value) ? REDACTED : value).replace(
    /(?<![a-zA-Z0-9])(?:[a-fA-F0-9]*:){2,}[a-fA-F0-9:.]*(?:%[a-zA-Z0-9]+)?/g,
    (value) => (0,__vite_ssr_import_0__.isIP)(value) ? REDACTED : value
  );
}
function sanitizeLogValue(value, seen = /* @__PURE__ */ new WeakSet(), depth = 0) {
  if (typeof value === "string") return sanitizeLogText(value);
  if (value === null || typeof value !== "object") return value;
  if (depth >= 12) return "[LOG_DEPTH_LIMIT]";
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  try {
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? "Invalid Date" : value.toISOString();
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return "[BINARY]";
    if (Array.isArray(value)) {
      const result2 = value.slice(0, 100).map((item) => sanitizeLogValue(item, seen, depth + 1));
      if (value.length > 100) result2.push("[LOG_ITEM_LIMIT]");
      return result2;
    };
    const result = /* @__PURE__ */ Object.create(null);
    if (value instanceof Error) {
      result.type = value.name;
      result.message = sanitizeLogText(value.message);
      result.stack = value.stack ? sanitizeLogText(value.stack) : void 0;
    };
    const keys = Object.getOwnPropertyNames(value).slice(0, 100);
    for (const key of keys) {
      if (["__proto__", "constructor", "prototype", "hasOwnProperty", "toJSON"].includes(key)) continue;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor) continue;
      if (!("value" in descriptor)) {
        result[sanitizeLogText(key)] = "[ACCESSOR]";
      } else {
        result[sanitizeLogText(key)] = sensitiveKey.test(key.replace(/[-_]/g, "")) ? REDACTED : sanitizeLogValue(descriptor.value, seen, depth + 1);
      }
    };
    if (Object.getOwnPropertyNames(value).length > 100) result.logTruncated = true;
    return result;
  } finally {
    seen.delete(value);
  }
}

