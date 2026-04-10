/**
 * Full-domain validation — RFC 1035 + RFC 1123 + professional registrar rules
 *
 * Used by both server (storefrontDomains route) and client (StorefrontBuilder).
 * Rules match GoDaddy / Namecheap / Cloudflare Registrar behaviour for
 * second-level domain names (e.g. "mybeats.com", "johnsmith.music").
 */

// ─── Supported TLDs offered to users ────────────────────────────────────────
export const SUPPORTED_TLDS = [
  ".com", ".net", ".org", ".io", ".co", ".me",
  ".music", ".studio", ".band", ".audio", ".fm",
  ".live", ".pro", ".media", ".tv", ".art", ".store",
  ".online", ".site", ".info", ".biz",
] as const;

export type SupportedTLD = typeof SUPPORTED_TLDS[number];

// ─── Reserved SLD names ──────────────────────────────────────────────────────
// Blocked at the second-level regardless of TLD — mirrors major registrar policy.
const RESERVED_SLDS = new Set([
  // IANA / RFC reserved
  "localhost", "example", "test", "invalid", "local",
  // Infrastructure abuse
  "ns", "ns1", "ns2", "ns3", "ns4", "dns", "mx", "mail",
  "ftp", "smtp", "pop", "pop3", "imap", "webmail",
  // Admin / brand squatting
  "admin", "administrator", "root", "cpanel", "whm",
  "hostmaster", "postmaster", "abuse", "noc", "security",
  // Platform / app names (cannot impersonate major brands)
  "google", "youtube", "facebook", "instagram", "twitter",
  "tiktok", "linkedin", "spotify", "apple", "microsoft",
  "amazon", "netflix", "soundcloud", "beatstars", "airbit",
  // Max Booster reserved
  "maxbooster", "maxboostermusic", "blawz", "blawzmusic",
]);

// ─── Types ───────────────────────────────────────────────────────────────────
export interface DomainValidationResult {
  valid: boolean;
  error?: string;
  /** Normalised SLD (lowercase, trimmed) when valid. */
  sld?: string;
  /** Full domain (sld + tld) when valid. */
  domain?: string;
}

// ─── Label-level rules (RFC 1123) ────────────────────────────────────────────
function validateLabel(label: string): string | null {
  if (label.length === 0) return "Domain parts cannot be empty.";
  if (label.length > 63) return `Each part of the domain cannot exceed 63 characters (DNS limit).`;
  if (!/^[a-z0-9-]+$/.test(label)) return "Only letters (a–z), digits (0–9), and hyphens are allowed.";
  if (label.startsWith("-") || label.endsWith("-")) return "Domain parts cannot start or end with a hyphen.";
  if (label.includes("--")) return 'Consecutive hyphens ("--") are not allowed.';
  if (/^\d+$/.test(label)) return "Domain parts cannot be all digits.";
  return null;
}

// ─── Main export ─────────────────────────────────────────────────────────────
/**
 * Validate a full domain name the user wants to register as their free domain.
 * Accepts the SLD (name part) and TLD (e.g. ".com") separately, which maps
 * naturally to the split input in the UI.
 *
 * @example
 * validateFreeDomain("mybeats", ".com")   // { valid: true, domain: "mybeats.com" }
 * validateFreeDomain("-bad", ".io")        // { valid: false, error: "..." }
 */
export function validateFreeDomain(rawSld: string, tld: string): DomainValidationResult {
  if (!rawSld || typeof rawSld !== "string") {
    return { valid: false, error: "A domain name is required." };
  }

  const sld = rawSld.toLowerCase().trim();

  // SLD length: registrars typically enforce 2–63 characters
  if (sld.length < 2) {
    return { valid: false, error: "Must be at least 2 characters." };
  }

  // Label-level RFC validation
  const labelError = validateLabel(sld);
  if (labelError) return { valid: false, error: labelError };

  // TLD must be one of the supported options
  const normalTld = (tld || "").toLowerCase().trim();
  if (!SUPPORTED_TLDS.includes(normalTld as SupportedTLD)) {
    return { valid: false, error: "Please select a valid domain extension." };
  }

  // Reserved name check
  if (RESERVED_SLDS.has(sld)) {
    return { valid: false, error: `"${sld}" is a reserved name and cannot be registered.` };
  }

  // Total FQDN length (RFC 1035 §2.3.4: ≤253 octets, including the trailing dot)
  const domain = `${sld}${normalTld}`;
  if (domain.length > 253) {
    return { valid: false, error: "The full domain name cannot exceed 253 characters." };
  }

  return { valid: true, sld, domain };
}
