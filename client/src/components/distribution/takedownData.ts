/**
 * The rights-manager endpoints return database rows wrapped in a named
 * collection. They do not return the richer, provider-specific objects that
 * the old UI assumed.
 */

export interface DmcaStrikeRow {
  id: string;
  userId?: string;
  noticeId?: string | null;
  contentType: string;
  contentId: string;
  reason?: string | null;
  expiresAt?: string | null;
  createdAt?: string | null;
}

export interface RoyaltyDisputeRow {
  id: string;
  userId?: string;
  type: string;
  status?: string | null;
  subject: string;
  description: string;
  amount?: string | null;
  period?: string | null;
  resolution?: string | null;
  outcome?: string | null;
  evidenceCount?: number | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

/**
 * Extract a collection from a distribution list response without silently
 * treating a malformed response as an empty successful result.
 */
export function extractDistributionRows<T>(
  payload: unknown,
  collection: string,
): T[] {
  if (!payload || typeof payload !== "object") {
    throw new Error(`Invalid distribution response for ${collection}`);
  }

  const rows = (payload as Record<string, unknown>)[collection];
  if (!Array.isArray(rows)) {
    throw new Error(`Invalid distribution response: ${collection} is not an array`);
  }

  if (
    rows.some(
      (row) => row === null || typeof row !== "object" || Array.isArray(row),
    )
  ) {
    throw new Error(`Invalid distribution response: ${collection} contains an invalid row`);
  }

  return rows as T[];
}

export function displayDate(
  value: string | null | undefined,
  fallback = "Not recorded",
): string {
  if (!value) return fallback;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleString();
}

export function displayValue(
  value: string | number | null | undefined,
  fallback = "Not recorded",
): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}