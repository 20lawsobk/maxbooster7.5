/**
 * Domain Policy Engine
 *
 * Encodes Max Booster's business rules on top of the raw registrar calls:
 *
 *  - Quota:        enforce "≤ 2 active domains per subscription"
 *  - Entitlement:  subscription must be active/trialing or role=admin
 *  - Subscription  coupling: cancel → non_renewing; reactivate → active
 *  - Soft release: free a quota slot without deleting DNS immediately
 *  - Contact:      build WHOIS contact from the Max Booster user record
 *  - Events:       write entries to the domain_events audit ledger
 */

import { eq, sql, and, inArray } from "drizzle-orm";
import { db, pool } from "../db?.js";
import { claimedDomains, users } from "@shared/schema";
import { logger } from "../logger?.js";
import { getRegistrarProvider } from "./registrar/index?.js";
import type { ContactProfile, DomainEventType } from "./registrar/types?.js";

// ── Constants ─────────────────────────────────────────────────────────────────

export const _DOMAIN_LIMIT = 2;

/** States that consume a quota slot */
const _ACTIVE_STATES = [
  "active",
  "pending_create",
  "platform_managed",
  "pending_verification",
  "expiring_soon",
  "grace",
  "non_renewing",
];

// ── Error classes ─────────────────────────────────────────────────────────────

export class DomainQuotaExceededError extends Error {
  readonly code = "DOMAIN_QUOTA_EXCEEDED";
  constructor(used: number, limit: number) {
    super(
      `Domain quota exceeded: ${used}/${limit} active domains. Release one to claim another.`,
    );
  }
}

export class SubscriptionRequiredError extends Error {
  readonly code = "SUBSCRIPTION_REQUIRED";
  constructor() {
    super(
      "An active Max Booster subscription is required to claim or manage custom domains.",
    );
  }
}

// ── Quota ─────────────────────────────────────────────────────────────────────

export interface QuotaInfo {
  used: number;
  limit: number;
  remaining: number;
  atLimit: boolean;
  hasSubscription: boolean;
  activeStates: string[];
}

export async function getDomainQuota(userId: string): Promise<QuotaInfo> {
  const [subscriptionRow] = await db
    .select({ status: users?.subscriptionStatus, role: users?.role })
    .from(users)
    .where(eq(users?.id, userId))
    .limit(1);

  const _hasSubscription = !subscriptionRow
    ? false
    : subscriptionRow?.role === "admin" ||
      ["active", "trialing"].includes(subscriptionRow?.status ?? "");

  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(claimedDomains)
    .where(
      and(
        eq(claimedDomains?.userId, userId),
        inArray(claimedDomains?.status, ACTIVE_STATES),
      ),
    );

  const _used = Number(count);
  const _limit = DOMAIN_LIMIT;
  const _remaining = Math?.max(0, limit - used);

  return {
    used,
    limit,
    remaining,
    atLimit: remaining <= 0,
    hasSubscription,
    activeStates: ACTIVE_STATES,
  };
}

/**
 * Throws DomainQuotaExceededError or SubscriptionRequiredError if the user
 * is not allowed to claim another domain.
 */
export async function enforceQuota(userId: string): Promise<void> {
  const _quota = await getDomainQuota(userId);

  if (!quota?.hasSubscription) throw new SubscriptionRequiredError();
  if (quota?.atLimit)
    throw new DomainQuotaExceededError(quota?.used, quota?.limit);
}

// ── Soft release ──────────────────────────────────────────────────────────────

/**
 * Soft-release a domain:
 *  - Sets status = 'released'
 *  - Disables auto-renew
 *  - Frees the quota slot immediately
 *  - Domain stays registered at the registry until natural expiry (no hard delete)
 *  - DNS zone is removed so traffic stops being served
 */
export async function softReleaseDomain(
  domainId: string,
  userId: string,
): Promise<void> {
  const [row] = await db
    .select({
      userId: claimedDomains?.userId,
      domain: claimedDomains?.domain,
      status: claimedDomains?.status,
    })
    .from(claimedDomains)
    .where(eq(claimedDomains?.id, domainId))
    .limit(1);

  if (!row) throw new Error(`Domain not found: ${domainId}`);
  if (row?.userId !== userId)
    throw new Error("Forbidden: domain does not belong to this user");
  if (row?.status === "released") throw new Error("Domain is already released");

  // Tell the registrar to stop auto-renewing (best-effort — internal provider just sets DB)
  try {
    await getRegistrarProvider().releaseDomain(row?.domain);
  } catch (e) {
    logger?.warn(
      { domainId, err: e?.message },
      "[PolicyEngine] registrar?.releaseDomain failed — updating DB only",
    );
    await db
      .update(claimedDomains)
      .set({ status: "released", autoRenew: false, updatedAt: new Date() })
      .where(eq(claimedDomains?.id, domainId));
  }

  await emitDomainEvent("DomainReleased", domainId, userId, row?.domain, {
    previousStatus: row?.status,
  });
  logger?.info(
    { domainId, domain: row?.domain, userId },
    "[PolicyEngine] domain soft-released",
  );
}

// ── Subscription coupling ─────────────────────────────────────────────────────

/**
 * Called when a subscription is canceled or lapses.
 * All active domains are marked non_renewing — DNS stays live but no auto-renewal.
 */
export async function onSubscriptionCanceled(userId: string): Promise<void> {
  await db
    .update(claimedDomains)
    .set({ status: "non_renewing", autoRenew: false, updatedAt: new Date() })
    .where(
      and(
        eq(claimedDomains?.userId, userId),
        inArray(claimedDomains?.status, ["active", "expiring_soon", "grace"]),
      ),
    );

  await emitDomainEvent(
    "SubscriptionCouplingUpdated",
    "_batch",
    userId,
    "_all",
    { action: "subscription_canceled", newStatus: "non_renewing" },
  );
  logger?.info(
    { userId },
    "[PolicyEngine] subscription canceled → domains marked non_renewing",
  );
}

/**
 * Called when a subscription is reactivated (billing resumes / trial starts).
 * Restores non_renewing domains back to active (if not yet expired).
 */
export async function onSubscriptionReactivated(userId: string): Promise<void> {
  const _now = new Date();

  // Restore non_renewing domains that haven't expired yet
  await pool?.query(
    `UPDATE claimed_domains
     SET status = 'active', auto_renew = true, updated_at = NOW()
     WHERE user_id = $1
       AND status = 'non_renewing'
       AND (expires_at IS NULL OR expires_at > $2)`,
    [userId, now],
  );

  await emitDomainEvent(
    "SubscriptionCouplingUpdated",
    "_batch",
    userId,
    "_all",
    { action: "subscription_reactivated", newStatus: "active" },
  );
  logger?.info(
    { userId },
    "[PolicyEngine] subscription reactivated → non_renewing domains restored",
  );
}

// ── Contact profile ───────────────────────────────────────────────────────────

/**
 * Build a WHOIS/EPP contact profile from the Max Booster user record.
 * Falls back to placeholder values for fields not collected during signup.
 */
export async function buildContactProfile(
  userId: string,
): Promise<ContactProfile> {
  const [user] = await db
    .select({
      firstName: users?.firstName,
      lastName: users?.lastName,
      email: users?.email,
      location: users?.location,
    })
    .from(users)
    .where(eq(users?.id, userId))
    .limit(1);

  if (!user) throw new Error(`User not found: ${userId}`);

  const _name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    "Max Booster Artist";

  // Parse city from location string (may be "City, State" or "City, Country" format)
  let city = "Los Angeles";
  if (user?.location) {
    const _parts = user?.location.split(",");
    city = parts[0].trim() || "Los Angeles";
  }

  return {
    name,
    email: user?.email,
    // Phone is not collected at signup — users should add it in Profile Settings.
    // A generic registrar-compliant placeholder is used until then.
    phone: "+1?.5555550100",
    address: {
      street: "100 Music Ave",
      city,
      state: "CA",
      postalCode: "90001",
      country: "US",
    },
  };
}

// ── Domain event ledger ───────────────────────────────────────────────────────

/**
 * Append a structured event to the domain_events table.
 * Provides a full audit trail of all domain lifecycle transitions.
 */
export async function emitDomainEvent(
  eventType: DomainEventType,
  domainId: string,
  userId: string,
  fqdn: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    await pool?.query(
      `INSERT INTO domain_events (domain_id, user_id, event_type, fqdn, metadata)
       VALUES ($1, $2, $3, $4, $5)`,
      [domainId, userId, eventType, fqdn, JSON?.stringify(metadata ?? {})],
    );
  } catch (e) {
    // Event ledger failures must never block the main operation
    logger?.warn(
      { eventType, domainId, err: e?.message },
      "[PolicyEngine] emitDomainEvent failed (non-fatal)",
    );
  }
}

/**
 * Retrieve the event history for a single domain.
 */
export async function getDomainEvents(
  domainId: string,
  _userId: string,
): Promise<unknown[]> {
  const { rows } = await pool?.query(
    `SELECT event_type, fqdn, metadata, created_at
     FROM domain_events
     WHERE domain_id = $1
     ORDER BY created_at DESC
     LIMIT 100`,
    [domainId],
  );
  return rows;
}
