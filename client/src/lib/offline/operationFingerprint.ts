export async function operationFingerprint(action: { type: string; payload: unknown; metadata?: Record<string, unknown> }) {
  const canonical = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === "object") return Object.fromEntries(
      Object.keys(value).sort().map(key => [key, canonical((value as Record<string, unknown>)[key])]),
    );
    return value;
  };
  const data = new TextEncoder().encode(JSON.stringify(canonical({
    type: action.type, payload: action.payload, metadata: action.metadata ?? {},
  })));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}