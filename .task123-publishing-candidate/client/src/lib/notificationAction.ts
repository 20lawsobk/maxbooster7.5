/** Notification payloads may contain user/provider supplied links. */
export function getNotificationAction(value: unknown): { url: string; external: boolean } | null {
  if (typeof value !== "string" || !value || value !== value.trim() || /[\u0000-\u0020\\]/.test(value)) return null;
  if (value.startsWith("/") && !value.startsWith("//")) return { url: value, external: false };
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    return { url: url.href, external: true };
  } catch {
    return null;
  }
}
