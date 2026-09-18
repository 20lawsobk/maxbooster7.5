export interface ActiveSession {
  id: string;
  device: string;
  location: string;
  time: string;
  current: boolean;
  ipAddress?: string;
  browser?: string;
}

interface SessionRecord {
  id?: unknown;
  device?: unknown;
  userAgent?: unknown;
  location?: unknown;
  time?: unknown;
  lastActivity?: unknown;
  createdAt?: unknown;
  current?: unknown;
  ipAddress?: unknown;
  browser?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeSession(value: unknown): ActiveSession {
  if (!isRecord(value)) {
    throw new Error("Unexpected active sessions response");
  }

  const session = value as SessionRecord;
  if (typeof session.id !== "string" || !session.id) {
    throw new Error("Unexpected active sessions response: missing session id");
  }

  const device =
    typeof session.device === "string"
      ? session.device
      : typeof session.userAgent === "string"
        ? session.userAgent
        : "Unknown Device";
  const activity = [session.time, session.lastActivity, session.createdAt].find(
    (candidate) => typeof candidate === "string" && candidate,
  );

  return {
    id: session.id,
    device,
    location:
      typeof session.location === "string" ? session.location : "Unknown",
    time: typeof activity === "string" ? activity : "Unknown",
    current: session.current === true,
    ...(typeof session.ipAddress === "string"
      ? { ipAddress: session.ipAddress }
      : {}),
    ...(typeof session.browser === "string"
      ? { browser: session.browser }
      : {}),
  };
}

/**
 * The mounted auth sessions endpoint returns an envelope:
 * { sessions, totalCount, currentSessionId }.
 *
 * Keep this normalization strict so an API error or a changed response shape
 * remains a visible query error instead of being rendered as fake empty data.
 */
export function normalizeActiveSessions(response: unknown): ActiveSession[] {
  const records = Array.isArray(response)
    ? response
    : isRecord(response) && Array.isArray(response.sessions)
      ? response.sessions
      : null;

  if (!records) {
    throw new Error("Unexpected active sessions response");
  }

  return records.map(normalizeSession);
}