/**
 * Public storefront URL policy.
 *
 * The Replit deployment is the only platform origin that is guaranteed to be
 * reachable.  BASE_DOMAIN is intentionally not used here: it is also used by
 * the DNS/custom-domain services and may still point at a customer-managed
 * zone.  In particular, never manufacture `{slug}.BASE_DOMAIN` URLs for a
 * storefront link.
 */
export const STOREFRONT_APP_ORIGIN = "https://maxbooster.replit.app";
export const STOREFRONT_URL_FORMAT = "slug" as const;

export function getStorefrontPathUrl(slug: string): string {
  return `${STOREFRONT_APP_ORIGIN}/storefront/${encodeURIComponent(slug)}`;
}