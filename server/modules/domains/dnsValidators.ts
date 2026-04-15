const LABEL_REGEX = /^[a-z0-9-]+$/;
const DOMAIN_LABEL_REGEX = /^[a-z0-9-]+$/;

export function validateDnsLabel(raw: string): { ok: false; error: string } | { ok: true; normalized: string } {
  const label = raw.trim().toLowerCase();

  if (!label) return { ok: false, error: "Label cannot be empty." };
  if (label.length < 1 || label.length > 63)
    return { ok: false, error: "Label must be 1–63 characters." };
  if (!LABEL_REGEX.test(label))
    return { ok: false, error: "Only letters, numbers, and hyphens allowed." };
  if (label.startsWith("-") || label.endsWith("-"))
    return { ok: false, error: "Cannot start or end with hyphen." };

  return { ok: true, normalized: label };
}

/**
 * Strip protocol prefix, trailing slashes, and any path component from a
 * raw domain string so that inputs like "https://example.com/" or
 * "http://www.example.com/path" are accepted and normalised to "example.com".
 */
export function stripDomainInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//i, '')   // strip http:// or https://
    .replace(/\/.*$/, '')           // strip trailing slash and any path
    .replace(/\.$/, '');            // strip trailing dot (FQDN notation)
}

export function validateDomain(raw: string): { ok: false; error: string } | { ok: true; normalized: string } {
  const domain = stripDomainInput(raw);

  if (!domain) return { ok: false, error: "Domain cannot be empty." };
  if (domain.length > 253)
    return { ok: false, error: "Domain too long (max 253 chars)." };

  const labels = domain.split(".");
  if (labels.length < 2)
    return { ok: false, error: "Domain must contain a dot (example.com)." };

  for (const label of labels) {
    if (!label.length || label.length > 63)
      return { ok: false, error: "Each label must be 1–63 chars." };
    if (!DOMAIN_LABEL_REGEX.test(label))
      return { ok: false, error: "Only letters, numbers, and hyphens allowed." };
    if (label.startsWith("-") || label.endsWith("-"))
      return { ok: false, error: "Labels cannot start/end with hyphen." };
  }

  return { ok: true, normalized: domain };
}
