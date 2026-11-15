export interface ActiveSession {
  id: string;
  device: string;
  location: string;
  current: boolean;
  lastActivity?: string;
  ipAddress?: string;
  browser?: string;
}

export interface LoginEvent {
  id: string;
  timestamp: string;
  ipAddress: string;
  location?: string;
  device: string;
  browser?: string;
  success: boolean;
  suspicious: boolean;
  reason?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function parseActiveSessions(value: unknown): ActiveSession[] {
  if (
    !record(value) ||
    !Array.isArray(value.sessions) ||
    !value.sessions.every(
      (session) =>
        record(session) &&
        typeof session.id === "string" &&
        typeof session.device === "string" &&
        typeof session.location === "string" &&
        typeof session.current === "boolean" &&
        (session.ipAddress === undefined || typeof session.ipAddress === "string") &&
        (session.browser === undefined || typeof session.browser === "string") &&
        (session.lastActivity === undefined ||
          (typeof session.lastActivity === "string" &&
            Number.isFinite(Date.parse(session.lastActivity)))),
    )
  ) {
    throw new Error("The active sessions response was invalid.");
  }
  return value.sessions as ActiveSession[];
}

export function parseLoginHistory(value: unknown): LoginEvent[] {
  if (
    !Array.isArray(value) ||
    !value.every(
      (event) =>
        record(event) &&
        typeof event.id === "string" &&
        typeof event.timestamp === "string" &&
        Number.isFinite(Date.parse(event.timestamp)) &&
        typeof event.device === "string" &&
        typeof event.success === "boolean" &&
        typeof event.suspicious === "boolean" &&
        typeof event.ipAddress === "string" &&
        ["location", "browser", "reason"].every(
          (field) => event[field] === undefined || typeof event[field] === "string",
        ),
    )
  ) {
    throw new Error("The login history response was invalid.");
  }
  return value as LoginEvent[];
}