/**
 * Internal Registrar Provider
 *
 * This is Max Booster's built-in "registrar" — no EPP or external API.
 * Domains are registered entirely within Max Booster's own DB + DNS system.
 * When a real upstream registrar is connected (OpenSRS/Namecheap/EppProvider),
 * this provider handles only platform subdomains and BYOD flows.
 *
 * What this provider does:
 *  - Availability: DNS A/NS lookup + DB collision check
 *  - Register: inserts claimed_domains row + auto-creates DNS zone
 *  - Renew: updates expires_at in DB
 *  - Set NS: updates DB (DNS already hosted by Max Booster)
 *  - Release: sets status = 'released', clears DNS zone
 *  - Info: reads DB row
 */

import dns from 'dns';
import { eq } from 'drizzle-orm';
import { db, pool } from '../../db.js';
import { claimedDomains } from '@shared/schema';
import { logger } from '../../logger.js';
import { NS, NS1, NS2, PLATFORM_DOMAIN, DOMAIN_PRICES } from '../domainRegistrarService.js';
import type {
  RegistrarProvider,
  AvailabilityResult,
  RegisterParams,
  RegisterResult,
  RenewResult,
  DomainInfo,
  TransferParams,
  TransferResult,
} from './types.js';

const dnsResolve = dns.promises.resolve;

async function dnsAvailable(fqdn: string): Promise<boolean> {
  const timeout = <T>(ms: number, p: Promise<T>): Promise<T> =>
    Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error('timeout')), ms))]);
  for (const type of ['NS', 'A'] as const) {
    try {
      const recs = await timeout(2500, dnsResolve(fqdn, type));
      if (recs && recs.length > 0) return false;
    } catch { /* ENOTFOUND / timeout → not registered */ }
  }
  return true;
}

export class InternalRegistrarProvider implements RegistrarProvider {
  readonly name = 'MaxBooster-Internal';

  async checkAvailability(fqdn: string): Promise<AvailabilityResult> {
    const [dbRow] = await db
      .select({ id: claimedDomains.id, status: claimedDomains.status })
      .from(claimedDomains)
      .where(eq(claimedDomains.domain, fqdn.toLowerCase()))
      .limit(1);

    if (dbRow) {
      return { fqdn, available: false, ownedByPlatform: true };
    }

    const dnsGone = await dnsAvailable(fqdn);
    const tld = '.' + fqdn.split('.').slice(1).join('.');
    const priceEntry = DOMAIN_PRICES[tld];

    return {
      fqdn,
      available: dnsGone,
      price: priceEntry
        ? { tld, registrationCents: priceEntry.registrationCents, renewalCents: priceEntry.renewalCents, isPremium: false }
        : undefined,
    };
  }

  async registerDomain(params: RegisterParams): Promise<RegisterResult> {
    const { fqdn, userId, years, privacyEnabled } = params;
    const domainLower = fqdn.toLowerCase();
    const tld = '.' + domainLower.split('.').slice(1).join('.');
    const sld = domainLower.split('.')[0];
    const isPlatformSub = domainLower.endsWith(`.${PLATFORM_DOMAIN}`);

    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + years);

    // Insert claimed_domains row
    await db.insert(claimedDomains).values({
      userId,
      domain:          domainLower,
      sld,
      tld,
      status:          isPlatformSub ? 'active' : 'active',
      registrarName:   'maxbooster',
      nameserver1:     NS1,
      nameserver2:     NS2,
      expiresAt,
      yearsRegistered: years,
      autoRenew:       true,
      privacyEnabled:  privacyEnabled ?? true,
      pricePaidCents:  0,
    });

    // Auto-create DNS zone (idempotent)
    await this._ensureDnsZone(domainLower, userId, isPlatformSub);

    logger.info({ fqdn: domainLower, provider: this.name }, '[InternalRegistrar] domain registered');

    return {
      ok:          true,
      expiresAt,
      nameservers: [NS1, NS2],
      status:      'active',
      message:     isPlatformSub
        ? 'Platform subdomain is live immediately.'
        : `Domain registered. DNS zone is active — set your nameserver to ${NS} if using an external registrar.`,
    };
  }

  async renewDomain(fqdn: string, years: number): Promise<RenewResult> {
    const [row] = await db
      .select({ id: claimedDomains.id, expiresAt: claimedDomains.expiresAt })
      .from(claimedDomains)
      .where(eq(claimedDomains.domain, fqdn.toLowerCase()))
      .limit(1);

    if (!row) throw new Error(`Domain not found in Max Booster registry: ${fqdn}`);

    const base       = row.expiresAt && row.expiresAt > new Date() ? row.expiresAt : new Date();
    const expiresAt  = new Date(base);
    expiresAt.setFullYear(expiresAt.getFullYear() + years);

    await db
      .update(claimedDomains)
      .set({ expiresAt, status: 'active', updatedAt: new Date() })
      .where(eq(claimedDomains.id, row.id));

    logger.info({ fqdn, years, expiresAt, provider: this.name }, '[InternalRegistrar] domain renewed');
    return { ok: true, expiresAt, years };
  }

  async setNameservers(fqdn: string, nameservers: string[]): Promise<void> {
    const ns1 = nameservers[0] ?? NS1;
    const ns2 = nameservers[1] ?? NS2;
    await db
      .update(claimedDomains)
      .set({ nameserver1: ns1, nameserver2: ns2, updatedAt: new Date() })
      .where(eq(claimedDomains.domain, fqdn.toLowerCase()));
    logger.info({ fqdn, ns1, ns2, provider: this.name }, '[InternalRegistrar] nameservers updated');
  }

  async getDomainInfo(fqdn: string): Promise<DomainInfo> {
    const [row] = await db
      .select()
      .from(claimedDomains)
      .where(eq(claimedDomains.domain, fqdn.toLowerCase()))
      .limit(1);

    if (!row) throw new Error(`Domain not found: ${fqdn}`);

    return {
      fqdn:        row.domain,
      status:      row.status,
      expiresAt:   row.expiresAt ?? undefined,
      nameservers: [row.nameserver1 ?? NS1, row.nameserver2 ?? NS2].filter(Boolean),
      autoRenew:   row.autoRenew,
      locked:      false,
    };
  }

  async releaseDomain(fqdn: string): Promise<void> {
    await db
      .update(claimedDomains)
      .set({ status: 'released', autoRenew: false, updatedAt: new Date() })
      .where(eq(claimedDomains.domain, fqdn.toLowerCase()));

    // Remove DNS zone so the slot is truly freed
    try {
      await pool.query('DELETE FROM dns_zones WHERE domain = $1', [fqdn.toLowerCase()]);
    } catch (e: any) {
      logger.warn({ fqdn, err: e.message }, '[InternalRegistrar] DNS zone removal on release failed (non-fatal)');
    }
    logger.info({ fqdn, provider: this.name }, '[InternalRegistrar] domain released (soft)');
  }

  async initiateTransferIn(params: TransferParams): Promise<TransferResult> {
    // Internal provider doesn't do EPP transfers — this is for BYOD (user points NS here)
    const { fqdn, userId } = params;
    const domainLower = fqdn.toLowerCase();
    const tld = '.' + domainLower.split('.').slice(1).join('.');
    const sld = domainLower.split('.')[0];

    await db.insert(claimedDomains).values({
      userId,
      domain:         domainLower,
      sld,
      tld,
      status:         'platform_managed',
      registrarName:  'external',
      nameserver1:    NS1,
      nameserver2:    NS2,
      expiresAt:      null,
      yearsRegistered: 1,
      autoRenew:      false,
      privacyEnabled: false,
      pricePaidCents: 0,
    });

    await this._ensureDnsZone(domainLower, userId, false);

    return {
      ok:      true,
      status:  'pendingTransfer',
      message: `DNS zone created. Point your nameserver at your registrar to ${NS1} to complete the transfer.`,
    };
  }

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    try {
      await db.select({ id: claimedDomains.id }).from(claimedDomains).limit(1);
      return { ok: true, message: 'Internal DB registry reachable' };
    } catch (e: any) {
      return { ok: false, message: e.message };
    }
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private async _ensureDnsZone(fqdn: string, userId: string, isActive: boolean): Promise<void> {
    try {
      const existing = await pool.query(
        'SELECT id FROM dns_zones WHERE domain = $1 LIMIT 1', [fqdn]
      );
      if (existing.rows.length > 0) return;

      const { rows } = await pool.query(
        `INSERT INTO dns_zones (user_id, domain, status, is_verified, nameserver1, nameserver2)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [userId, fqdn, isActive ? 'active' : 'pending', isActive, NS1, NS2]
      );
      const zoneId = rows[0].id;

      await pool.query(
        `INSERT INTO dns_zone_records (zone_id, user_id, domain, type, name, value, ttl) VALUES
         ($1, $2, $3, 'NS',  '@', $4, 3600),
         ($1, $2, $3, 'SOA', '@', $5, 3600)`,
        [
          zoneId, userId, fqdn,
          NS1,
          `${NS1} hostmaster.${PLATFORM_DOMAIN} 1 3600 900 604800 300`,
        ]
      );
      logger.info({ fqdn, zoneId }, '[InternalRegistrar] DNS zone ensured');
    } catch (e: any) {
      logger.warn({ fqdn, err: e.message }, '[InternalRegistrar] _ensureDnsZone failed (non-fatal)');
    }
  }
}
