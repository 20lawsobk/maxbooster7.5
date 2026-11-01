/**
 * The platform-status endpoint reports OAuth providers, while the Social Media
 * page displays the individual cards users can act on. Keep the translation in
 * one place so aliases cannot make a card appear disconnected (or post a
 * request to an unsupported connect route).
 */

export const SOCIAL_PLATFORM_CARD_IDS = [
  "facebook",
  "instagram",
  "x",
  "youtube",
  "tiktok",
  "linkedin",
  "threads",
  "google_business",
] as const;

export type SocialPlatformCardId = (typeof SOCIAL_PLATFORM_CARD_IDS)[number];

export interface SocialPlatformStatus {
  id?: string;
  name?: string;
  isConnected?: boolean;
  followers?: number;
  engagement?: number;
  lastSync?: string;
  status?: string;
  [key: string]: unknown;
}

const CARD_ID_ALIASES: Record<string, string> = {
  facebook: "facebook",
  instagram: "instagram",
  x: "x",
  twitter: "x",
  youtube: "youtube",
  tiktok: "tiktok",
  linkedin: "linkedin",
  threads: "threads",
  google_business: "google_business",
  googlebusiness: "google_business",
};

const CALLBACK_PLATFORM_ALIASES: Record<string, string> = {
  ...CARD_ID_ALIASES,
  meta: "meta",
};

const CONNECT_PLATFORM_ALIASES: Record<string, string> = {
  facebook: "meta",
  instagram: "meta",
  x: "twitter",
  google_business: "googlebusiness",
};

const DISPLAY_NAMES: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  x: "X",
  twitter: "X",
  youtube: "YouTube",
  tiktok: "TikTok",
  linkedin: "LinkedIn",
  threads: "Threads",
  google_business: "Google Business",
  googlebusiness: "Google Business",
  meta: "Facebook & Instagram",
};

const CONNECTED_STATUSES = new Set(["active", "connected", "ok"]);
const DISCONNECTED_STATUSES = new Set([
  "inactive",
  "disconnected",
  "not_connected",
]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/**
 * Return the card id for a status/callback provider. `meta` intentionally
 * remains an aggregate id: it cannot identify Facebook versus Instagram
 * without per-account evidence in its metadata.
 */
export function canonicalSocialPlatformId(id: unknown): string | null {
  if (typeof id !== "string") return null;
  return CALLBACK_PLATFORM_ALIASES[id.trim().toLowerCase()] || null;
}

export function socialPlatformConnectId(id: string): string {
  const canonicalId = canonicalSocialPlatformId(id) || id;
  return CONNECT_PLATFORM_ALIASES[canonicalId] || canonicalId;
}

export function socialPlatformDisplayName(id: unknown): string {
  if (typeof id !== "string" || !id.trim()) return "Platform";
  const normalized = id.trim().toLowerCase();
  return DISPLAY_NAMES[normalized] || DISPLAY_NAMES[canonicalSocialPlatformId(normalized) || ""] || id;
}

export function formatSocialPlatformCallbackNames(value: string): string {
  return value
    .split(",")
    .map((platform) => socialPlatformDisplayName(platform))
    .join(" & ");
}

function hasPositiveNumber(record: Record<string, unknown>, key: string): boolean {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * A Meta aggregate includes placeholder facebook/instagram objects even when
 * neither account is present. Only identity, an explicit connected flag/status,
 * or real account metrics count as evidence for an individual card.
 */
export function hasPlatformConnectionEvidence(value: unknown): boolean {
  if (value === true) return true;
  if (value === false || value == null) return false;

  const record = asRecord(value);
  if (!record) return false;

  if (typeof record.isConnected === "boolean") return record.isConnected;
  if (typeof record.connected === "boolean") return record.connected;

  if (typeof record.status === "string") {
    const status = record.status.toLowerCase();
    if (CONNECTED_STATUSES.has(status)) return true;
    if (DISCONNECTED_STATUSES.has(status)) return false;
  }

  for (const key of [
    "username",
    "profileUrl",
    "platformUserId",
    "accountId",
    "id",
  ]) {
    if (typeof record[key] === "string" && record[key].trim()) return true;
  }

  return ["followers", "followerCount", "engagementRate"].some((key) =>
    hasPositiveNumber(record, key),
  );
}

function metaAccountEvidence(
  aggregate: SocialPlatformStatus,
  cardId: "facebook" | "instagram",
): unknown {
  const metadata = asRecord(aggregate.metadata);
  return metadata?.[cardId];
}

function asStatusList(value: unknown): SocialPlatformStatus[] {
  if (Array.isArray(value)) return value.filter(Boolean) as SocialPlatformStatus[];
  const record = asRecord(value);
  return Array.isArray(record?.platforms)
    ? (record.platforms.filter(Boolean) as SocialPlatformStatus[])
    : [];
}

function mergeStatus(
  previous: SocialPlatformStatus | undefined,
  next: SocialPlatformStatus,
): SocialPlatformStatus {
  if (!previous) return next;

  const preferred =
    next.isConnected && !previous.isConnected
      ? next
      : previous.isConnected && !next.isConnected
        ? previous
        : next;

  return {
    ...previous,
    ...next,
    ...preferred,
    id: preferred.id,
    isConnected: Boolean(previous.isConnected || next.isConnected),
    followers: Math.max(previous.followers || 0, next.followers || 0),
    engagement:
      typeof preferred.engagement === "number"
        ? preferred.engagement
        : previous.engagement || next.engagement || 0,
    metadata: {
      ...(asRecord(previous.metadata) || {}),
      ...(asRecord(next.metadata) || {}),
    },
  };
}

/**
 * Convert the aggregate/provider response into the eight supported card ids.
 * Spotify and unknown providers are deliberately discarded here; missing
 * statuses are filled by the page's disconnected card defaults.
 */
export function normalizeSocialPlatformStatuses(
  value: unknown,
): SocialPlatformStatus[] {
  const normalized = new Map<string, SocialPlatformStatus>();

  const add = (cardId: string, status: SocialPlatformStatus) => {
    if (!(SOCIAL_PLATFORM_CARD_IDS as readonly string[]).includes(cardId)) return;
    normalized.set(cardId, mergeStatus(normalized.get(cardId), {
      ...status,
      id: cardId,
    }));
  };

  for (const status of asStatusList(value)) {
    const providerId = typeof status.id === "string" ? status.id.toLowerCase() : "";

    if (providerId === "meta") {
      for (const cardId of ["facebook", "instagram"] as const) {
        const evidence = metaAccountEvidence(status, cardId);
        if (!hasPlatformConnectionEvidence(evidence)) continue;

        const evidenceRecord = asRecord(evidence) || {};
        add(cardId, {
          ...status,
          ...evidenceRecord,
          id: cardId,
          isConnected: true,
          metadata: evidenceRecord,
        });
      }
      continue;
    }

    const cardId = CARD_ID_ALIASES[providerId];
    if (cardId) add(cardId, status);
  }

  return SOCIAL_PLATFORM_CARD_IDS
    .filter((cardId) => normalized.has(cardId))
    .map((cardId) => normalized.get(cardId)!);
}