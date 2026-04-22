import { logger } from '../../logger.js';
import { EppSession } from '../epp/index.js';
import { createHash } from 'crypto';
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

// ── Config check ──────────────────────────────────────────────────────────────

function getEppConfig() {
  return {
    host: process.env.EPP_HOST || '',
    port: parseInt(process.env.EPP_PORT || '700'),
    user: process.env.EPP_USERNAME || '',
    pass: process.env.EPP_PASSWORD || '',
    tlsCert: process.env.EPP_TLS_CERT,
    tlsKey: process.env.EPP_TLS_KEY,
  };
}

function isConfigured(): boolean {
  const config = getEppConfig();
  return !!(config.host && config.user && config.pass);
}

function notConfigured(method: string): never {
  const msg = `EPP_NOT_CONFIGURED: ${method}() called but no EPP credentials are set. ` +
    `Set EPP_HOST + EPP_USERNAME + EPP_PASSWORD and set REGISTRAR_PROVIDER=epp.`;
  logger.warn(msg);
  throw Object.assign(new Error(msg), { code: 'EPP_NOT_CONFIGURED' });
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class EppRegistrarProvider implements RegistrarProvider {
  readonly name = 'EPP-External';
  private session: EppSession | null = null;

  private async getSession(): Promise<EppSession> {
    if (!this.session) {
      this.session = new EppSession(getEppConfig());
    }
    return this.session;
  }

  private generateContactId(userId: string, fqdn: string): string {
    const hash = createHash('sha256').update(`${userId}:${fqdn}`).digest('hex');
    return `MB-${hash.slice(0, 13)}`.toUpperCase();
  }

  // ── Health check ────────────────────────────────────────────────────────────

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    if (!isConfigured()) {
      return {
        ok:      false,
        message: 'EPP provider not configured. Set EPP_HOST credentials.',
      };
    }
    try {
      const session = await this.getSession();
      await session.connectAndLogin();
      return { ok: true };
    } catch (err: any) {
      return { ok: false, message: err.message };
    }
  }

  // ── Availability ────────────────────────────────────────────────────────────

  async checkAvailability(fqdn: string): Promise<AvailabilityResult> {
    if (!isConfigured()) notConfigured('checkAvailability');

    const session = await this.getSession();
    const available = await session.checkAvailability(fqdn);

    return {
      fqdn,
      available,
    };
  }

  // ── Registration ─────────────────────────────────────────────────────────────

  async registerDomain(params: RegisterParams): Promise<RegisterResult> {
    if (!isConfigured()) notConfigured('registerDomain');

    const session = await this.getSession();
    const contactId = this.generateContactId(params.userId, params.fqdn);

    // 1. Create contact
    await session.createContact(contactId, params.contact);

    // 2. Create domain
    const resp = await session.registerDomain({
      fqdn: params.fqdn,
      years: params.years,
      nameservers: params.nameservers,
      registrantId: contactId,
      adminId: contactId,
      techId: contactId,
    });

    if (resp.code !== 1000 && resp.code !== 1001) {
        throw new Error(`Domain registration failed: ${resp.msg} (code ${resp.code})`);
    }

    const creData = resp.resData?.creData;

    return {
      ok: true,
      registryId: resp.trid.svTRID,
      expiresAt: creData?.exDate ? new Date(creData.exDate) : new Date(Date.now() + params.years * 365 * 24 * 60 * 60 * 1000),
      nameservers: params.nameservers,
      status: resp.code === 1000 ? 'active' : 'pendingCreate',
    };
  }

  // ── Renew ─────────────────────────────────────────────────────────────────────

  async renewDomain(fqdn: string, years: number): Promise<RenewResult> {
    if (!isConfigured()) notConfigured('renewDomain');

    const session = await this.getSession();
    const info = await session.getDomainInfo(fqdn);
    const curExpDate = info.resData.infData.exDate;

    const resp = await session.renewDomain(fqdn, curExpDate, years);
    if (resp.code !== 1000) {
        throw new Error(`Domain renewal failed: ${resp.msg} (code ${resp.code})`);
    }

    const renData = resp.resData.renData;

    return {
      ok: true,
      expiresAt: new Date(renData.exDate),
      years,
    };
  }

  // ── Nameservers ───────────────────────────────────────────────────────────────

  async setNameservers(fqdn: string, nameservers: string[]): Promise<void> {
    if (!isConfigured()) notConfigured('setNameservers');

    const session = await this.getSession();
    const info = await session.getDomainInfo(fqdn);
    const currentNs = info.resData.infData.ns?.hostObj || [];
    const currentNsArray = Array.isArray(currentNs) ? currentNs : [currentNs];

    const toAdd = nameservers.filter(ns => !currentNsArray.includes(ns));
    const toRem = currentNsArray.filter((ns: string) => !nameservers.includes(ns));

    if (toAdd.length === 0 && toRem.length === 0) return;

    const resp = await session.updateNameservers(fqdn, toAdd, toRem);
    if (resp.code !== 1000) {
        throw new Error(`Updating nameservers failed: ${resp.msg} (code ${resp.code})`);
    }
  }

  // ── Domain info ───────────────────────────────────────────────────────────────

  async getDomainInfo(fqdn: string): Promise<DomainInfo> {
    if (!isConfigured()) notConfigured('getDomainInfo');

    const session = await this.getSession();
    const resp = await session.getDomainInfo(fqdn);
    if (resp.code !== 1000) {
        throw new Error(`Getting domain info failed: ${resp.msg} (code ${resp.code})`);
    }

    const infData = resp.resData.infData;
    const ns = infData.ns?.hostObj || [];

    return {
      fqdn,
      status: Array.isArray(infData.status) ? infData.status[0]['@_s'] : infData.status?.['@_s'] || 'active',
      expiresAt: infData.exDate ? new Date(infData.exDate) : undefined,
      nameservers: Array.isArray(ns) ? ns : [ns],
      registryId: infData.roid,
      autoRenew: true, // EPP doesn't always expose this directly in info
      locked: !!infData.status?.find?.((s: any) => s['@_s']?.includes('Prohibited')),
    };
  }

  // ── Soft release ──────────────────────────────────────────────────────────────

  async releaseDomain(fqdn: string): Promise<void> {
    if (!isConfigured()) notConfigured('releaseDomain');
    // EPP soft release is usually just letting it expire or disabling auto-renew if supported by extension
    logger.info(`Soft releasing domain ${fqdn} - will expire naturally`);
  }

  // ── Transfer in ───────────────────────────────────────────────────────────────

  async initiateTransferIn(params: TransferParams): Promise<TransferResult> {
    if (!isConfigured()) notConfigured('initiateTransferIn');

    const session = await this.getSession();
    const resp = await session.transferDomain(params.fqdn, params.authCode);

    if (resp.code !== 1000 && resp.code !== 1001) {
        throw new Error(`Transfer request failed: ${resp.msg} (code ${resp.code})`);
    }

    return {
      ok: true,
      status: resp.code === 1001 ? 'pendingTransfer' : 'active',
      message: resp.msg,
    };
  }
}
