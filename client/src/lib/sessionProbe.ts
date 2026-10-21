export class SessionProbeUnavailable extends Error {
  constructor(readonly retryAfterMs = 2_000) {
    super("Session verification is temporarily unavailable. Please retry.");
    this.name = "SessionProbeUnavailable";
  }
}

/** Only an authoritative anonymous response may clear an established identity. */
export async function probeSession<T extends { id: string }>(request: typeof fetch = fetch): Promise<T | null> {
  let response: Response;
  try {
    response = await request(`/api/auth/me?account-check=${crypto.randomUUID()}`, {
      credentials: "include", cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SessionProbeUnavailable();
  }
  if (response.status === 401) return null;
  if (!response.ok) {
    const retry = response.headers.get("Retry-After");
    const delay = retry && /^\d+$/.test(retry) ? Number(retry) * 1000
      : retry ? Date.parse(retry) - Date.now() : 2_000;
    throw new SessionProbeUnavailable(Number.isFinite(delay) ? Math.max(1_000, Math.min(delay, 3_600_000)) : 2_000);
  }
  let data: unknown;
  try { data = await response.json(); } catch { throw new SessionProbeUnavailable(); }
  if (data === null) return null;
  if (!data || typeof data !== "object" || !("id" in data) || typeof data.id !== "string" || !data.id) {
    throw new SessionProbeUnavailable();
  }
  return data as T;
}
