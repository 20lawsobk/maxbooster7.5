import { logger } from "./logger.js";

const events = [
  "admin.user.updated", "admin.user.suspended", "admin.user.reactivated",
  "admin.user.deleted", "admin.subscription.granted", "admin.action.completed",
  "support.action.completed", "oauth.connected", "oauth.exchange.failed",
  "account.deletion.progress", "status.subscription.changed", "security.request.blocked",
] as const;
export type PrivacyEvent = typeof events[number];
export type PrivacyEventFields = {
  actorId?: string;
  subjectId?: string;
  requestId?: string;
  outcome: "success" | "failure" | "pending";
  statusCode?: number;
  count?: number;
};

/** No arbitrary message, provider response, email, IP, or username accepted.
 * Unknown keys fail explicitly to catch unsafe JavaScript callers too.
 */
export function logPrivacyEvent(event: PrivacyEvent, fields: PrivacyEventFields): void {
  if (!(events as readonly string[]).includes(event)) throw new TypeError("Unknown privacy log event");
  const allowed = new Set(["actorId", "subjectId", "requestId", "outcome", "statusCode", "count"]);
  for (const [key, value] of Object.entries(fields)) {
    if (!allowed.has(key)) throw new TypeError(`Unsupported privacy log field: ${key}`);
    if (key.endsWith("Id") && (typeof value !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))) {
      throw new TypeError("Privacy log identifiers must be opaque IDs");
    }
    if ((key === "count" || key === "statusCode") &&
        (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) {
      throw new TypeError("Privacy log numeric field must be a nonnegative integer");
    }
  }
  if (!["success", "failure", "pending"].includes(fields.outcome)) throw new TypeError("Invalid privacy log outcome");
  logger[fields.outcome === "failure" ? "warn" : "info"]({ event, ...fields }, event);
}