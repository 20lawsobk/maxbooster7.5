/**
 * Shared DNS label validation — RFC 1035 + RFC 1123 + professional provider rules
 *
 * Enforced by both server (storefrontDomains route) and client (StorefrontBuilder).
 * Rules match what GoDaddy / Cloudflare / Namecheap apply to subdomain labels.
 */

export const PLATFORM_DOMAIN = "maxboostermusic.com";

/** Labels blocked regardless of availability (infrastructure / reserved). */
const RESERVED_LABELS = new Set([
  // DNS infrastructure
  "ns", "ns1", "ns2", "ns3", "ns4", "ns5", "ns6", "ns7", "ns8", "ns9",
  "dns", "dns1", "dns2", "mx", "mx1", "mx2",
  // Web / email infrastructure
  "www", "ftp", "smtp", "pop", "pop3", "imap", "mail", "email", "webmail",
  // Admin / system
  "admin", "administrator", "root", "system", "server", "cpanel", "whm",
  "host", "hostmaster", "postmaster", "abuse",
  // Platform reserved
  "api", "app", "auth", "login", "signin", "signup", "register", "account",
  "dashboard", "portal", "panel", "control", "manage", "management",
  "support", "help", "docs", "documentation", "status", "health",
  "blog", "news", "press", "media", "assets", "cdn", "static", "img",
  "images", "files", "upload", "uploads", "download", "downloads",
  // Dev / test
  "dev", "develop", "development", "staging", "stage", "test", "testing",
  "beta", "alpha", "demo", "sandbox", "local", "localhost",
  // Max Booster specific
  "maxbooster", "maxboostermusic", "max", "booster",
  "store", "shop", "market", "marketplace",
  "music", "beats", "audio",
]);

export interface DomainValidationResult {
  valid: boolean;
  error?: string;
  /** Normalized (lowercased, trimmed) handle when valid. */
  handle?: string;
}

/**
 * Validate a subdomain label destined for *.maxboostermusic.com.
 * Returns `{ valid: true, handle }` on success or `{ valid: false, error }` on failure.
 */
export function validatePlatformHandle(raw: string): DomainValidationResult {
  if (!raw || typeof raw !== "string") {
    return { valid: false, error: "A subdomain name is required." };
  }

  const label = raw.toLowerCase().trim();

  // Length: 3–63 per RFC + professional provider minimum
  if (label.length < 3) {
    return { valid: false, error: "Must be at least 3 characters." };
  }
  if (label.length > 63) {
    return { valid: false, error: "Cannot exceed 63 characters (DNS label limit)." };
  }

  // Allowed characters only (RFC 1123: letters, digits, hyphens)
  if (!/^[a-z0-9-]+$/.test(label)) {
    return {
      valid: false,
      error: "Only letters (a–z), digits (0–9), and hyphens are allowed.",
    };
  }

  // Cannot start or end with a hyphen (RFC 952 / RFC 1123)
  if (label.startsWith("-") || label.endsWith("-")) {
    return { valid: false, error: "Cannot start or end with a hyphen." };
  }

  // Cannot contain consecutive hyphens (catches IDN prefix "xn--" abuse etc.)
  if (label.includes("--")) {
    return { valid: false, error: 'Consecutive hyphens ("--") are not allowed.' };
  }

  // Cannot be all digits (ambiguous with IP octets, blocked by most providers)
  if (/^\d+$/.test(label)) {
    return { valid: false, error: "Cannot be all digits." };
  }

  // Reserved labels
  if (RESERVED_LABELS.has(label)) {
    return { valid: false, error: `"${label}" is a reserved name and cannot be used.` };
  }

  return { valid: true, handle: label };
}

/** Full FQDN for a validated handle. */
export function toPlatformFQDN(handle: string): string {
  return `${handle}.${PLATFORM_DOMAIN}`;
}
