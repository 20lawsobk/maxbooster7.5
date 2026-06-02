/**
 * Domain validation — RFC 1035 + RFC 1123 + professional provider rules
 *
 * Two validators:
 *  • validatePlatformHandle — for the free automatic subdomain (*.maxboostermusic.com)
 *  • validateCustomDomain   — for user-owned domains connected via "Bring Your Own Domain"
 */

export const PLATFORM_DOMAIN = "maxboostermusic.com";
export const PLATFORM_NS1 = "maxbooster.replit.app";
export const PLATFORM_NS2 = "maxbooster.replit.app";

// ─── Shared label-level rules (RFC 1123) ─────────────────────────────────────
function validateLabel(label: string): string | null {
  if (!label) return "Cannot be empty.";
  if (label.length > 63)
    return "Cannot exceed 63 characters (DNS label limit).";
  if (!/^[a-z0-9-]+$/.test(label))
    return "Only letters (a–z), digits (0–9), and hyphens are allowed.";
  if (label.startsWith("-") || label.endsWith("-"))
    return "Cannot start or end with a hyphen.";
  if (label.includes("--"))
    return 'Consecutive hyphens ("--") are not allowed.';
  if (/^\d+$/.test(label)) return "Cannot be all digits.";
  return null;
}

// ─── Reserved platform handles ───────────────────────────────────────────────
const RESERVED_HANDLES = new Set([
  "ns",
  "ns1",
  "ns2",
  "ns3",
  "ns4",
  "ns5",
  "ns6",
  "dns",
  "mx",
  "mx1",
  "mx2",
  "www",
  "ftp",
  "smtp",
  "pop",
  "pop3",
  "imap",
  "mail",
  "email",
  "webmail",
  "admin",
  "administrator",
  "root",
  "system",
  "server",
  "cpanel",
  "whm",
  "host",
  "hostmaster",
  "postmaster",
  "abuse",
  "noc",
  "api",
  "app",
  "auth",
  "login",
  "signin",
  "signup",
  "register",
  "account",
  "dashboard",
  "portal",
  "panel",
  "control",
  "manage",
  "support",
  "help",
  "docs",
  "status",
  "health",
  "blog",
  "news",
  "press",
  "media",
  "assets",
  "cdn",
  "static",
  "dev",
  "staging",
  "test",
  "beta",
  "alpha",
  "demo",
  "sandbox",
  "localhost",
  "maxbooster",
  "maxboostermusic",
  "max",
  "booster",
  "store",
  "shop",
  "market",
  "marketplace",
]);

// ─── Reserved SLDs for custom/BYOD domains ───────────────────────────────────
const RESERVED_SLDS = new Set([
  "localhost",
  "example",
  "test",
  "invalid",
  "local",
  "ns",
  "ns1",
  "ns2",
  "dns",
  "mx",
  "mail",
  "ftp",
  "smtp",
  "pop",
  "imap",
  "admin",
  "administrator",
  "root",
  "cpanel",
  "hostmaster",
  "postmaster",
  "abuse",
  "google",
  "youtube",
  "facebook",
  "instagram",
  "twitter",
  "tiktok",
  "linkedin",
  "spotify",
  "apple",
  "microsoft",
  "amazon",
  "netflix",
  "soundcloud",
  "beatstars",
  "airbit",
  "maxbooster",
  "maxboostermusic",
  "blawz",
  "blawzmusic",
]);

// ─── Shared result type ───────────────────────────────────────────────────────
export interface DomainValidationResult {
  valid: boolean;
  error?: string;
  /** Normalised value (handle or SLD) when valid. */
  value?: string;
  /** Full domain string when valid. */
  domain?: string;
}

// ─── 1. Platform handle (automatic, *.maxboostermusic.com) ───────────────────
/**
 * Validates the subdomain handle for the free automatic domain.
 * E.g. "b-lawzmusic" → b-lawzmusic.maxboostermusic.com (live immediately).
 */
export function validatePlatformHandle(raw: string): DomainValidationResult {
  if (!raw || typeof raw !== "string") {
    return { valid: false, error: "A name is required." };
  }
  const handle = raw.toLowerCase().trim();

  if (handle.length < 3)
    return { valid: false, error: "Must be at least 3 characters." };

  const err = validateLabel(handle);
  if (err) return { valid: false, error: err };

  if (RESERVED_HANDLES.has(handle)) {
    return {
      valid: false,
      error: `"${handle}" is reserved and cannot be used.`,
    };
  }

  return { valid: true, value: handle, domain: `${handle}.${PLATFORM_DOMAIN}` };
}

/** Full FQDN for a validated platform handle. */
export function toPlatformFQDN(handle: string): string {
  return `${handle}.${PLATFORM_DOMAIN}`;
}

// ─── Supported TLDs for the free domain feature ───────────────────────────────
export const SUPPORTED_TLDS = [
  ".com",
  ".net",
  ".org",
  ".info",
  ".biz",
  ".co",
  ".music",
  ".band",
  ".studio",
  ".productions",
  ".beats",
  ".app",
  ".io",
  ".me",
  ".online",
  ".site",
  ".store",
];

/**
 * Validates a free domain consisting of a user-supplied SLD and a TLD from
 * the SUPPORTED_TLDS list (e.g. "mybeats" + ".com" → mybeats.com).
 */
export function validateFreeDomain(
  sld: string,
  tld: string,
): DomainValidationResult {
  if (!sld || typeof sld !== "string") {
    return { valid: false, error: "A domain name is required." };
  }

  const normalised = sld.toLowerCase().trim();

  if (normalised.length < 2) {
    return { valid: false, error: "Must be at least 2 characters." };
  }

  const err = validateLabel(normalised);
  if (err) return { valid: false, error: err };

  if (RESERVED_SLDS.has(normalised)) {
    return {
      valid: false,
      error: `"${normalised}" is a reserved name and cannot be used.`,
    };
  }

  const normalisedTld = (tld || ".com").toLowerCase().trim();
  if (!SUPPORTED_TLDS.includes(normalisedTld)) {
    return {
      valid: false,
      error: `"${normalisedTld}" is not a supported domain extension.`,
    };
  }

  const domain = `${normalised}${normalisedTld}`;
  if (domain.length > 253) {
    return {
      valid: false,
      error: "The full domain cannot exceed 253 characters.",
    };
  }

  return { valid: true, value: normalised, domain };
}

// ─── 2. Custom / BYOD domain (requires user-side DNS config) ─────────────────
/**
 * Validates a user-owned full domain (e.g. "mybeats.com") for the
 * "Bring Your Own Domain" feature. The user must point their domain's
 * NS records to PLATFORM_NS1 / PLATFORM_NS2 themselves.
 */
export function validateCustomDomain(raw: string): DomainValidationResult {
  if (!raw || typeof raw !== "string") {
    return { valid: false, error: "A domain name is required." };
  }

  const domain = raw.toLowerCase().trim().replace(/\.$/, "");
  const parts = domain.split(".");

  if (parts.length < 2) {
    return {
      valid: false,
      error: "Must include a name and an extension (e.g. mybeats.com).",
    };
  }

  const tld = parts[parts.length - 1];
  const sld = parts[parts.length - 2];

  // Validate every label
  for (const part of parts) {
    const err = validateLabel(part);
    if (err) return { valid: false, error: err };
  }

  // TLD must be letters only (e.g. "com", "music") — no all-digit TLDs
  if (/^\d+$/.test(tld)) {
    return {
      valid: false,
      error: "The domain extension cannot be all digits.",
    };
  }

  if (tld.length < 2) {
    return {
      valid: false,
      error: "The domain extension must be at least 2 characters.",
    };
  }

  if (RESERVED_SLDS.has(sld)) {
    return {
      valid: false,
      error: `"${sld}" is a reserved name and cannot be used.`,
    };
  }

  if (domain.length > 253) {
    return {
      valid: false,
      error: "The full domain cannot exceed 253 characters.",
    };
  }

  return { valid: true, value: sld, domain };
}
