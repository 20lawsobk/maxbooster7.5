/** Redact credentials before a response is flattened into a log message. */
export function serializeResponseForLog(body: unknown): string | undefined {
  return JSON.stringify(body, (key, value) => {
    const sensitive =
      /(?:token|password|secret|credential|authorization|cookie|api[_-]?key|private[_-]?key)/i.test(key);
    // Keep numeric usage counters; never flatten credential strings/objects.
    return sensitive && value !== null && typeof value !== "number" && typeof value !== "boolean"
      ? "[REDACTED]"
      : value;
  });
}