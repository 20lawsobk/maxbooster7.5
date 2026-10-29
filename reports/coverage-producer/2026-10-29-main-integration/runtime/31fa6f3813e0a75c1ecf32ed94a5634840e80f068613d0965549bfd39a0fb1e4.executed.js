'use strict';async (__vite_ssr_exports__,__vite_ssr_import_meta__,__vite_ssr_import__,__vite_ssr_dynamic_import__,__vite_ssr_exportAll__,__vite_ssr_exportName__,__filename,__dirname,module,exports,require)=>{{__vite_ssr_exportName__("REDACTED", () => { try { return REDACTED } catch {} });
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
};
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
//# sourceURL=/workspace/maxbooster7.5/server/logSanitizer.ts
//# sourceMappingSource=vite-generated
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJtYXBwaW5ncyI6Ijs7O0FBQUE7O0FBRU8sTUFBTSxXQUFXO0FBSXhCLE1BQU0sZUFBZTtBQUVkLFNBQVMsZ0JBQWdCLE1BQXNCO0FBQ3BELFNBQU8sS0FDSixRQUFRLCtDQUErQyxRQUFRLEVBQy9ELFFBQVEsNkZBQTZGLEtBQUssUUFBUSxFQUFFLEVBQ3BILFFBQVEsMERBQTBELFFBQVEsRUFDMUUsUUFBUSxnQ0FBZ0MsY0FBUyw0QkFBSyxLQUFLLElBQUksV0FBVyxLQUFLLEVBQy9FO0FBQUEsSUFBUTtBQUFBLElBQ1AsY0FBUyw0QkFBSyxLQUFLLElBQUksV0FBVztBQUFBLEVBQUs7QUFDN0M7QUFPTyxTQUFTLGlCQUFpQixPQUFnQixPQUFPLG9CQUFJLFFBQWdCLEdBQUcsUUFBUSxHQUFZO0FBQ2pHLE1BQUksT0FBTyxVQUFVLFNBQVUsUUFBTyxnQkFBZ0IsS0FBSztBQUMzRCxNQUFJLFVBQVUsUUFBUSxPQUFPLFVBQVUsU0FBVSxRQUFPO0FBQ3hELE1BQUksU0FBUyxHQUFJLFFBQU87QUFDeEIsTUFBSSxLQUFLLElBQUksS0FBSyxFQUFHLFFBQU87QUFDNUIsT0FBSyxJQUFJLEtBQUs7QUFDZCxNQUFJO0FBQ0YsUUFBSSxpQkFBaUIsS0FBTSxRQUFPLE9BQU8sTUFBTSxNQUFNLFFBQVEsQ0FBQyxJQUFJLGlCQUFpQixNQUFNLFlBQVk7QUFDckcsUUFBSSxZQUFZLE9BQU8sS0FBSyxLQUFLLGlCQUFpQixZQUFhLFFBQU87QUFDdEUsUUFBSSxNQUFNLFFBQVEsS0FBSyxHQUFHO0FBQ3hCLFlBQU1BLFVBQVMsTUFBTSxNQUFNLEdBQUcsR0FBRyxFQUFFLElBQUksVUFBUSxpQkFBaUIsTUFBTSxNQUFNLFFBQVEsQ0FBQyxDQUFDO0FBQ3RGLFVBQUksTUFBTSxTQUFTLElBQUssQ0FBQUEsUUFBTyxLQUFLLGtCQUFrQjtBQUN0RCxhQUFPQTtBQUFBLElBQ1Q7QUFDQSxVQUFNLFNBQWtDLHVCQUFPLE9BQU8sSUFBSTtBQUMxRCxRQUFJLGlCQUFpQixPQUFPO0FBQzFCLGFBQU8sT0FBTyxNQUFNO0FBQ3BCLGFBQU8sVUFBVSxnQkFBZ0IsTUFBTSxPQUFPO0FBQzlDLGFBQU8sUUFBUSxNQUFNLFFBQVEsZ0JBQWdCLE1BQU0sS0FBSyxJQUFJO0FBQUEsSUFDOUQ7QUFDQSxVQUFNLE9BQU8sT0FBTyxvQkFBb0IsS0FBSyxFQUFFLE1BQU0sR0FBRyxHQUFHO0FBQzNELGVBQVcsT0FBTyxNQUFNO0FBQ3RCLFVBQUksQ0FBQyxhQUFhLGVBQWUsYUFBYSxrQkFBa0IsUUFBUSxFQUFFLFNBQVMsR0FBRyxFQUFHO0FBQ3pGLFlBQU0sYUFBYSxPQUFPLHlCQUF5QixPQUFPLEdBQUc7QUFDN0QsVUFBSSxDQUFDLFdBQVk7QUFFakIsVUFBSSxFQUFFLFdBQVcsYUFBYTtBQUM1QixlQUFPLGdCQUFnQixHQUFHLENBQUMsSUFBSTtBQUFBLE1BQ2pDLE9BQU87QUFDTCxlQUFPLGdCQUFnQixHQUFHLENBQUMsSUFBSSxhQUFhLEtBQUssSUFBSSxRQUFRLFNBQVMsRUFBRSxDQUFDLElBQ3JFLFdBQ0EsaUJBQWlCLFdBQVcsT0FBTyxNQUFNLFFBQVEsQ0FBQztBQUFBLE1BQ3hEO0FBQUEsSUFDRjtBQUNBLFFBQUksT0FBTyxvQkFBb0IsS0FBSyxFQUFFLFNBQVMsSUFBSyxRQUFPLGVBQWU7QUFDMUUsV0FBTztBQUFBLEVBQ1QsVUFBRTtBQUNBLFNBQUssT0FBTyxLQUFLO0FBQUEsRUFDbkI7QUFDRiIsIm5hbWVzIjpbInJlc3VsdCJdLCJpZ25vcmVMaXN0IjpbXSwic291cmNlcyI6WyJsb2dTYW5pdGl6ZXIudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgaXNJUCB9IGZyb20gXCJub2RlOm5ldFwiO1xuXG5leHBvcnQgY29uc3QgUkVEQUNURUQgPSBcIltSRURBQ1RFRF1cIjtcblxuLy8gTm9ybWFsaXplIGNhc2Uvc2VwYXJhdG9ycyBzbyBwcm92aWRlciBzbmFrZV9jYXNlIGFuZCBhcHBsaWNhdGlvbiBjYW1lbENhc2Vcbi8vIG5hbWVzIHJlY2VpdmUgdGhlIHNhbWUgdHJlYXRtZW50LCBhdCBldmVyeSBkZXB0aCAobm90IGp1c3Qgb25lIHdpbGRjYXJkKS5cbmNvbnN0IHNlbnNpdGl2ZUtleSA9IC9eKD86LiooPzpwYXNzd29yZHxzZWNyZXR8dG9rZW58YXBpa2V5fHByaXZhdGVrZXl8YXV0aG9yaXphdGlvbnxjb29raWUpfC4qZW1haWwoPzphZGRyZXNzKT98Lip1c2VybmFtZXwoPzpjbGllbnR8cmVtb3RlfHNvdXJjZXx1c2VyKT9pcCg/OmFkZHJlc3MpP3wuKnBob25lKD86bnVtYmVyKT98Y2FyZG51bWJlcnxjdmN8Y3Z2fHhmb3J3YXJkZWRmb3J8eHJlYWxpcHxzZXRjb29raWUpJC9pO1xuXG5leHBvcnQgZnVuY3Rpb24gc2FuaXRpemVMb2dUZXh0KHRleHQ6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiB0ZXh0XG4gICAgLnJlcGxhY2UoL1xcYig/OkJlYXJlcnxCYXNpYylcXHMrW0EtWmEtejAtOSsvXy49fjotXSsvZ2ksIFJFREFDVEVEKVxuICAgIC5yZXBsYWNlKC8oKD86cGFzc3dvcmR8c2VjcmV0fGFjY2Vzc1tfLV0/dG9rZW58cmVmcmVzaFtfLV0/dG9rZW58YXBpW18tXT9rZXkpXFxzKls9Ol1cXHMqKVteXFxzLDsmXSsvZ2ksIGAkMSR7UkVEQUNURUR9YClcbiAgICAucmVwbGFjZSgvW0EtWjAtOS4hIyQlJicqKy89P15fYHt8fX4tXStAW0EtWjAtOS4tXStcXC5bQS1aXXsyLH0vZ2ksIFJFREFDVEVEKVxuICAgIC5yZXBsYWNlKC9cXGIoPzpcXGR7MSwzfVxcLil7M31cXGR7MSwzfVxcYi9nLCB2YWx1ZSA9PiBpc0lQKHZhbHVlKSA/IFJFREFDVEVEIDogdmFsdWUpXG4gICAgLnJlcGxhY2UoLyg/PCFbYS16QS1aMC05XSkoPzpbYS1mQS1GMC05XSo6KXsyLH1bYS1mQS1GMC05Oi5dKig/OiVbYS16QS1aMC05XSspPy9nLFxuICAgICAgdmFsdWUgPT4gaXNJUCh2YWx1ZSkgPyBSRURBQ1RFRCA6IHZhbHVlKTtcbn1cblxuLyoqIENvcHksIG5ldmVyIG11dGF0ZSByZXF1ZXN0L3Byb3ZpZGVyIG9iamVjdHMuIEJvdW5kZWQgdHJhdmVyc2FsIHByZXZlbnRzIGN5Y2xlc1xuICogYW5kIGhvc3RpbGUgcGF5bG9hZCBzaXplIGZyb20gdHVybmluZyBkaWFnbm9zdGljIHNlcmlhbGl6YXRpb24gaW50byBhIERvUy5cbiAqIEZyZWUtZm9ybSB0ZXh0IGNhbm5vdCByZWxpYWJseSBpZGVudGlmeSBhcmJpdHJhcnkgdXNlcm5hbWVzIG9yIG9wYXF1ZSBzZWNyZXRzO1xuICogc2Vuc2l0aXZlIGNhbGwgc2l0ZXMgbXVzdCB1c2UgdGhlIGFsbG93bGlzdGVkIGV2ZW50IEFQSSwgbm90IHJlbHkgb24gcmVnZXhlcy5cbiAqL1xuZXhwb3J0IGZ1bmN0aW9uIHNhbml0aXplTG9nVmFsdWUodmFsdWU6IHVua25vd24sIHNlZW4gPSBuZXcgV2Vha1NldDxvYmplY3Q+KCksIGRlcHRoID0gMCk6IHVua25vd24ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSBcInN0cmluZ1wiKSByZXR1cm4gc2FuaXRpemVMb2dUZXh0KHZhbHVlKTtcbiAgaWYgKHZhbHVlID09PSBudWxsIHx8IHR5cGVvZiB2YWx1ZSAhPT0gXCJvYmplY3RcIikgcmV0dXJuIHZhbHVlO1xuICBpZiAoZGVwdGggPj0gMTIpIHJldHVybiBcIltMT0dfREVQVEhfTElNSVRdXCI7XG4gIGlmIChzZWVuLmhhcyh2YWx1ZSkpIHJldHVybiBcIltDaXJjdWxhcl1cIjtcbiAgc2Vlbi5hZGQodmFsdWUpO1xuICB0cnkge1xuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHJldHVybiBOdW1iZXIuaXNOYU4odmFsdWUuZ2V0VGltZSgpKSA/IFwiSW52YWxpZCBEYXRlXCIgOiB2YWx1ZS50b0lTT1N0cmluZygpO1xuICAgIGlmIChBcnJheUJ1ZmZlci5pc1ZpZXcodmFsdWUpIHx8IHZhbHVlIGluc3RhbmNlb2YgQXJyYXlCdWZmZXIpIHJldHVybiBcIltCSU5BUlldXCI7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWUpKSB7XG4gICAgICBjb25zdCByZXN1bHQgPSB2YWx1ZS5zbGljZSgwLCAxMDApLm1hcChpdGVtID0+IHNhbml0aXplTG9nVmFsdWUoaXRlbSwgc2VlbiwgZGVwdGggKyAxKSk7XG4gICAgICBpZiAodmFsdWUubGVuZ3RoID4gMTAwKSByZXN1bHQucHVzaChcIltMT0dfSVRFTV9MSU1JVF1cIik7XG4gICAgICByZXR1cm4gcmVzdWx0O1xuICAgIH1cbiAgICBjb25zdCByZXN1bHQ6IFJlY29yZDxzdHJpbmcsIHVua25vd24+ID0gT2JqZWN0LmNyZWF0ZShudWxsKTtcbiAgICBpZiAodmFsdWUgaW5zdGFuY2VvZiBFcnJvcikge1xuICAgICAgcmVzdWx0LnR5cGUgPSB2YWx1ZS5uYW1lO1xuICAgICAgcmVzdWx0Lm1lc3NhZ2UgPSBzYW5pdGl6ZUxvZ1RleHQodmFsdWUubWVzc2FnZSk7XG4gICAgICByZXN1bHQuc3RhY2sgPSB2YWx1ZS5zdGFjayA/IHNhbml0aXplTG9nVGV4dCh2YWx1ZS5zdGFjaykgOiB1bmRlZmluZWQ7XG4gICAgfVxuICAgIGNvbnN0IGtleXMgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh2YWx1ZSkuc2xpY2UoMCwgMTAwKTtcbiAgICBmb3IgKGNvbnN0IGtleSBvZiBrZXlzKSB7XG4gICAgICBpZiAoW1wiX19wcm90b19fXCIsIFwiY29uc3RydWN0b3JcIiwgXCJwcm90b3R5cGVcIiwgXCJoYXNPd25Qcm9wZXJ0eVwiLCBcInRvSlNPTlwiXS5pbmNsdWRlcyhrZXkpKSBjb250aW51ZTtcbiAgICAgIGNvbnN0IGRlc2NyaXB0b3IgPSBPYmplY3QuZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yKHZhbHVlLCBrZXkpO1xuICAgICAgaWYgKCFkZXNjcmlwdG9yKSBjb250aW51ZTtcbiAgICAgIC8vIE5ldmVyIGludm9rZSBhcHBsaWNhdGlvbi1jb250cm9sbGVkIGdldHRlcnMgb3IgdG9KU09OIGR1cmluZyBsb2dnaW5nLlxuICAgICAgaWYgKCEoXCJ2YWx1ZVwiIGluIGRlc2NyaXB0b3IpKSB7XG4gICAgICAgIHJlc3VsdFtzYW5pdGl6ZUxvZ1RleHQoa2V5KV0gPSBcIltBQ0NFU1NPUl1cIjtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJlc3VsdFtzYW5pdGl6ZUxvZ1RleHQoa2V5KV0gPSBzZW5zaXRpdmVLZXkudGVzdChrZXkucmVwbGFjZSgvWy1fXS9nLCBcIlwiKSlcbiAgICAgICAgICA/IFJFREFDVEVEXG4gICAgICAgICAgOiBzYW5pdGl6ZUxvZ1ZhbHVlKGRlc2NyaXB0b3IudmFsdWUsIHNlZW4sIGRlcHRoICsgMSk7XG4gICAgICB9XG4gICAgfVxuICAgIGlmIChPYmplY3QuZ2V0T3duUHJvcGVydHlOYW1lcyh2YWx1ZSkubGVuZ3RoID4gMTAwKSByZXN1bHQubG9nVHJ1bmNhdGVkID0gdHJ1ZTtcbiAgICByZXR1cm4gcmVzdWx0O1xuICB9IGZpbmFsbHkge1xuICAgIHNlZW4uZGVsZXRlKHZhbHVlKTtcbiAgfVxufSJdLCJmaWxlIjoiL3NlcnZlci9sb2dTYW5pdGl6ZXIudHMifQ==

}}