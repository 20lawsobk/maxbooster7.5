/**
 * Domain Registrar Service — Max Booster Built-In DNS
 *
 * All domain registration and management is handled entirely by Max Booster's
 * built-in DNS system.  No external registrar API is required.
 *
 * Platform domain : max-booster.com
 * Nameservers     : ns1.max-booster.com  /  ns2.max-booster.com
 * Artist stores   : {name}.max-booster.com  (wildcard A/CNAME at registrar)
 */

import { logger } from "../logger.js";
import dns from "dns";

export const PLATFORM_DOMAIN = process.env.BASE_DOMAIN || "max-booster.com";
export const NS = PLATFORM_DOMAIN;
export const NS1 = process.env.NS1 || `ns1.${PLATFORM_DOMAIN}`;
export const NS2 = process.env.NS2 || `ns2.${PLATFORM_DOMAIN}`;
export const NS3 = process.env.NS3 || `ns3.${PLATFORM_DOMAIN}`;

/** All three Max Booster authoritative nameservers. */
export const ALL_NS = [NS1, NS2, NS3];

/** Max Booster registrar identity constants. */
export const REGISTRAR_NAME = "B-Lawz Music LLC";
export const REGISTRAR_BRAND = "Max Booster";
export const REGISTRAR_URL = `https://${PLATFORM_DOMAIN}`;
export const REGISTRAR_EMAIL = `registrar@${PLATFORM_DOMAIN}`;
export const REGISTRAR_ABUSE = `abuse@${PLATFORM_DOMAIN}`;

// ── Domain pricing (internal reference only — domains are FREE to subscribers) ─
// Not shown in the UI; kept for platform cost-tracking purposes.
export const DOMAIN_PRICES: Record<
  string,
  { registrationCents: number; renewalCents: number; label: string }
> = {
  ".com": { registrationCents: 998, renewalCents: 1398, label: ".com" },
  ".net": { registrationCents: 1106, renewalCents: 1498, label: ".net" },
  ".org": { registrationCents: 998, renewalCents: 1398, label: ".org" },
  ".io": { registrationCents: 3598, renewalCents: 3998, label: ".io" },
  ".co": { registrationCents: 798, renewalCents: 998, label: ".co" },
  ".me": { registrationCents: 798, renewalCents: 1798, label: ".me" },
  ".app": { registrationCents: 1498, renewalCents: 1998, label: ".app" },
  ".music": { registrationCents: 398, renewalCents: 2498, label: ".music" },
  ".band": { registrationCents: 398, renewalCents: 1998, label: ".band" },
  ".studio": { registrationCents: 398, renewalCents: 1998, label: ".studio" },
  ".productions": {
    registrationCents: 2498,
    renewalCents: 2998,
    label: ".productions",
  },
  ".beats": { registrationCents: 2498, renewalCents: 2998, label: ".beats" },
  ".online": { registrationCents: 498, renewalCents: 1998, label: ".online" },
  ".site": { registrationCents: 298, renewalCents: 1998, label: ".site" },
  ".info": { registrationCents: 298, renewalCents: 1498, label: ".info" },
};

export const SEARCH_TLDS = Object.keys(DOMAIN_PRICES);

// ── Domain availability check via DNS ─────────────────────────────────────────

export interface DomainAvailability {
  domain: string;
  tld: string;
  available: boolean;
  isPremium: boolean;
}

const dnsResolve = dns.promises.resolve;

async function dnsAvailable(domain: string): Promise<boolean> {
  const timeout = <T>(ms: number, p: Promise<T>): Promise<T> =>
    Promise.race([
      p,
      new Promise<T>((_, r) => setTimeout(() => r(new Error("timeout")), ms)),
    ]);
  for (const type of ["NS", "A"] as const) {
    try {
      const records = await timeout(2500, dnsResolve(domain, type));
      if (records && records.length > 0) return false;
    } catch {
      /* ENOTFOUND / timeout = not registered */
    }
  }
  return true;
}

export async function checkDomainAvailability(
  name: string,
  tlds: string[],
): Promise<DomainAvailability[]> {
  const checks = await Promise.allSettled(
    tlds.map(async (tld) => {
      const domain = `${name}${tld}`;
      const available = await dnsAvailable(domain);
      return { domain, tld, available, isPremium: false };
    }),
  );

  return checks
    .filter(
      (r): r is PromiseFulfilledResult<DomainAvailability> =>
        r.status === "fulfilled",
    )
    .map((r) => r.value);
}

export function logClaim(domain: string, userId: string) {
  logger.info(
    { domain, userId },
    "[domainRegistrar] domain claimed via built-in DNS",
  );
}
