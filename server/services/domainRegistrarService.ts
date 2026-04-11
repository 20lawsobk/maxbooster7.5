/**
 * Domain Registrar Service — Namecheap API integration
 *
 * Max Booster acts as a domain registrar interface backed by Namecheap's
 * reseller API.  Every domain registered through this service is automatically
 * configured to use Max Booster's authoritative nameservers
 * (ns1.maxboostermusic.com / ns2.maxboostermusic.com).
 *
 * Required environment variables:
 *   NAMECHEAP_API_USER  — Namecheap account username
 *   NAMECHEAP_API_KEY   — Namecheap API key (from Profile > Tools > API Access)
 *   NAMECHEAP_CLIENT_IP — IP address whitelisted in Namecheap API settings
 *   NAMECHEAP_SANDBOX   — "true" to use sandbox (omit or "false" for production)
 */

import { XMLParser } from 'fast-xml-parser';
import { logger } from '../logger.js';

const NC_API_USER   = process.env.NAMECHEAP_API_USER  || '';
const NC_API_KEY    = process.env.NAMECHEAP_API_KEY   || '';
const NC_CLIENT_IP  = process.env.NAMECHEAP_CLIENT_IP || '';
const NC_SANDBOX    = process.env.NAMECHEAP_SANDBOX   === 'true';

const NC_BASE_URL = NC_SANDBOX
  ? 'https://api.sandbox.namecheap.com/xml.response'
  : 'https://api.namecheap.com/xml.response';

export const NS1 = 'ns1.maxboostermusic.com';
export const NS2 = 'ns2.maxboostermusic.com';

// ── Domain pricing (USD cents) ────────────────────────────────────────────────
// Representative prices for 1-year registration.  Update as needed.
export const DOMAIN_PRICES: Record<string, { registrationCents: number; renewalCents: number; label: string }> = {
  '.com':         { registrationCents:  998, renewalCents: 1398, label: '.com' },
  '.net':         { registrationCents: 1106, renewalCents: 1498, label: '.net' },
  '.org':         { registrationCents:  998, renewalCents: 1398, label: '.org' },
  '.io':          { registrationCents: 3598, renewalCents: 3998, label: '.io'  },
  '.co':          { registrationCents:  798, renewalCents:  998, label: '.co'  },
  '.me':          { registrationCents:  798, renewalCents: 1798, label: '.me'  },
  '.app':         { registrationCents: 1498, renewalCents: 1998, label: '.app' },
  '.music':       { registrationCents:  398, renewalCents: 2498, label: '.music' },
  '.band':        { registrationCents:  398, renewalCents: 1998, label: '.band' },
  '.studio':      { registrationCents:  398, renewalCents: 1998, label: '.studio' },
  '.productions': { registrationCents: 2498, renewalCents: 2998, label: '.productions' },
  '.beats':       { registrationCents: 2498, renewalCents: 2998, label: '.beats' },
  '.online':      { registrationCents:  498, renewalCents: 1998, label: '.online' },
  '.site':        { registrationCents:  298, renewalCents: 1998, label: '.site' },
  '.info':        { registrationCents:  298, renewalCents: 1498, label: '.info' },
};

export const SEARCH_TLDS = Object.keys(DOMAIN_PRICES);

// ── Helpers ───────────────────────────────────────────────────────────────────

export function isConfigured(): boolean {
  return Boolean(NC_API_USER && NC_API_KEY && NC_CLIENT_IP);
}

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '' });

async function callNamecheap(command: string, params: Record<string, string>): Promise<any> {
  const url = new URL(NC_BASE_URL);
  url.searchParams.set('ApiUser',   NC_API_USER);
  url.searchParams.set('ApiKey',    NC_API_KEY);
  url.searchParams.set('UserName',  NC_API_USER);
  url.searchParams.set('ClientIp',  NC_CLIENT_IP);
  url.searchParams.set('Command',   command);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }

  const res = await fetch(url.toString());
  const xml  = await res.text();
  const json = parser.parse(xml);
  const root = json?.ApiResponse;

  if (!root) throw new Error('Namecheap API returned an unparseable response.');
  if (root.Status === 'ERROR') {
    const errs = root.Errors?.Error;
    const msg  = Array.isArray(errs) ? errs.map((e: any) => e?.['#text'] ?? e).join('; ') : (errs?.['#text'] ?? JSON.stringify(errs));
    throw new Error(`Namecheap error: ${msg}`);
  }

  return root.CommandResponse;
}

// ── Domain availability check ─────────────────────────────────────────────────

export interface DomainAvailability {
  domain:     string;
  tld:        string;
  available:  boolean;
  isPremium:  boolean;
  priceCents: number | null;
  renewalCents: number | null;
}

export async function checkDomainAvailability(name: string, tlds: string[]): Promise<DomainAvailability[]> {
  const domains = tlds.map(t => `${name}${t}`);
  const cmd = await callNamecheap('namecheap.domains.check', {
    DomainList: domains.join(','),
  });

  const rawList = cmd?.DomainCheckResult;
  const items: any[] = Array.isArray(rawList) ? rawList : (rawList ? [rawList] : []);

  return items.map((item: any) => {
    const domain    = item.Domain || item.domain || '';
    const tld       = tlds.find(t => domain.endsWith(t)) ?? '';
    const available = item.Available === 'true' || item.Available === true;
    const isPremium = item.IsPremiumName === 'true';
    const price     = DOMAIN_PRICES[tld];
    return {
      domain,
      tld,
      available,
      isPremium,
      priceCents:   available ? (price?.registrationCents ?? null) : null,
      renewalCents: available ? (price?.renewalCents ?? null)       : null,
    };
  });
}

// ── Domain registration ───────────────────────────────────────────────────────

export interface RegistrantContact {
  firstName:    string;
  lastName:     string;
  address1:     string;
  city:         string;
  state:        string;
  postalCode:   string;
  country:      string;   // 2-letter ISO (US, GB, CA …)
  phone:        string;   // +1.5551234567
  email:        string;
}

export interface RegisterDomainResult {
  orderId:    string;
  domain:     string;
  registered: boolean;
  expiresAt:  Date;
}

export async function registerDomain(
  domain: string,
  years: number,
  contact: RegistrantContact,
): Promise<RegisterDomainResult> {
  const parts    = domain.split('.');
  const tld      = '.' + parts.slice(1).join('.');
  const contactParams: Record<string, string> = {
    RegistrantFirstName:     contact.firstName,
    RegistrantLastName:      contact.lastName,
    RegistrantAddress1:      contact.address1,
    RegistrantCity:          contact.city,
    RegistrantStateProvince: contact.state,
    RegistrantPostalCode:    contact.postalCode,
    RegistrantCountry:       contact.country,
    RegistrantPhone:         contact.phone,
    RegistrantEmailAddress:  contact.email,
    TechFirstName:           contact.firstName,
    TechLastName:            contact.lastName,
    TechAddress1:            contact.address1,
    TechCity:                contact.city,
    TechStateProvince:       contact.state,
    TechPostalCode:          contact.postalCode,
    TechCountry:             contact.country,
    TechPhone:               contact.phone,
    TechEmailAddress:        contact.email,
    AdminFirstName:          contact.firstName,
    AdminLastName:           contact.lastName,
    AdminAddress1:           contact.address1,
    AdminCity:               contact.city,
    AdminStateProvince:      contact.state,
    AdminPostalCode:         contact.postalCode,
    AdminCountry:            contact.country,
    AdminPhone:              contact.phone,
    AdminEmailAddress:       contact.email,
    AuxBillingFirstName:     contact.firstName,
    AuxBillingLastName:      contact.lastName,
    AuxBillingAddress1:      contact.address1,
    AuxBillingCity:          contact.city,
    AuxBillingStateProvince: contact.state,
    AuxBillingPostalCode:    contact.postalCode,
    AuxBillingCountry:       contact.country,
    AuxBillingPhone:         contact.phone,
    AuxBillingEmailAddress:  contact.email,
  };

  const cmd = await callNamecheap('namecheap.domains.create', {
    DomainName:          domain,
    Years:               String(years),
    Nameservers:         `${NS1},${NS2}`,
    AddFreeWhoisguard:   'yes',
    WGEnabled:           'yes',
    ...contactParams,
  });

  const result = cmd?.DomainCreateResult;
  if (!result) throw new Error('Unexpected response from Namecheap during domain registration.');

  const registered = result.Registered === 'true' || result.Registered === true;
  const orderId    = String(result.OrderID || result.ChargedAmount || Date.now());
  const expiresAt  = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + years);

  logger.info({ domain, orderId, years }, '[domainRegistrar] Domain registered via Namecheap');
  return { orderId, domain, registered, expiresAt };
}

// ── List domains for an API user ─────────────────────────────────────────────

export async function listRegistrarDomains(): Promise<Array<{ domain: string; expires: string; autoRenew: boolean }>> {
  const cmd = await callNamecheap('namecheap.domains.getList', { PageSize: '100' });
  const rawList = cmd?.DomainGetListResult?.Domain;
  const items: any[] = Array.isArray(rawList) ? rawList : (rawList ? [rawList] : []);
  return items.map((d: any) => ({
    domain:    d.Name || '',
    expires:   d.Expires || '',
    autoRenew: d.AutoRenew === 'true',
  }));
}

// ── DNS host setup (set NS to Max Booster) ────────────────────────────────────

export async function setMaxBoosterNameservers(domain: string): Promise<void> {
  const parts = domain.split('.');
  const sld   = parts[0];
  const tld   = parts.slice(1).join('.');
  await callNamecheap('namecheap.domains.dns.setCustom', {
    SLD:         sld,
    TLD:         tld,
    Nameservers: `${NS1},${NS2}`,
  });
  logger.info({ domain }, '[domainRegistrar] Nameservers updated to Max Booster');
}
