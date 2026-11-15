import { isIP } from "node:net";
import { CHECKOUT_CURRENCY, CHECKOUT_PRICING } from "./checkoutPricing.js";

export interface FirstPartySocialSource {
  title: string;
  description: string;
  topic: string;
  contentType: string;
  extraContext: string;
  provenance: "server_checkout_catalog";
}

const DEFAULT_APP_ORIGIN = "https://maxbooster.replit.app";
const PRICING_PATHS = new Set(["/pricing", "/pricing/"]);

function isNonPublicHostname(hostname: string): boolean {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return (
    isIP(normalized) !== 0 ||
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    normalized.endsWith(".internal")
  );
}

function normalizeConfiguredOrigin(value: string | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;

  try {
    const withScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
      ? raw
      : `https://${raw}`;
    const parsed = new URL(withScheme);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      isNonPublicHostname(parsed.hostname)
    ) {
      return null;
    }
    return parsed.origin;
  } catch {
    return null;
  }
}

export function getConfiguredFirstPartyOrigins(): Set<string> {
  const deploymentOrigin = process.env.REPLIT_DEPLOYMENT_URL
    ? `https://${process.env.REPLIT_DEPLOYMENT_URL}`
    : undefined;
  const workspaceOrigin = process.env.REPLIT_DEV_DOMAIN
    ? `https://${process.env.REPLIT_DEV_DOMAIN}`
    : undefined;
  const candidates = [
    DEFAULT_APP_ORIGIN,
    process.env.APP_URL,
    process.env.BASE_URL,
    process.env.DOMAIN,
    process.env.BASE_DOMAIN,
    deploymentOrigin,
    workspaceOrigin,
  ];
  return new Set(
    candidates
      .map(normalizeConfiguredOrigin)
      .filter((origin): origin is string => origin !== null),
  );
}

function formatUsd(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: CHECKOUT_CURRENCY.toUpperCase(),
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amountCents / 100);
}

export function buildCheckoutPricingContext(): string {
  const monthly = CHECKOUT_PRICING.monthly;
  const yearly = CHECKOUT_PRICING.yearly;
  const lifetime = CHECKOUT_PRICING.lifetime;
  const yearlyMonthlyEquivalent = yearly.amountCents / 12;

  return [
    "Verified facts from the active Max Booster checkout catalog:",
    `- Monthly plan: ${formatUsd(monthly.amountCents)} billed monthly.`,
    `- Yearly plan: ${formatUsd(yearly.amountCents)} billed annually (${formatUsd(yearlyMonthlyEquivalent)} per month equivalent).`,
    `- Lifetime plan: ${formatUsd(lifetime.amountCents)} as a one-time payment.`,
    "Use only these verified plan names, amounts, and billing periods. Do not infer included features, discounts, refund terms, or other policy claims.",
  ].join("\n");
}

/**
 * Resolves only the app's exact pricing route from an exact configured origin.
 * It supplies internal checkout data and never fetches the submitted URL.
 */
export function resolveFirstPartySocialSource(
  rawUrl: string,
  trustedOrigins: ReadonlySet<string> = getConfiguredFirstPartyOrigins(),
): FirstPartySocialSource | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return null;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    isNonPublicHostname(parsed.hostname) ||
    !trustedOrigins.has(parsed.origin) ||
    !PRICING_PATHS.has(parsed.pathname)
  ) {
    return null;
  }

  const extraContext = buildCheckoutPricingContext();
  return {
    title: "Max Booster pricing",
    description: "Plan names, amounts, and billing periods verified from the server checkout catalog.",
    topic: "Max Booster pricing plans",
    contentType: "pricing",
    extraContext,
    provenance: "server_checkout_catalog",
  };
}