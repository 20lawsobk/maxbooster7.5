/**
 * Max Booster — EPP Session  (T005)
 *
 * High-level session manager that wraps EppClient.
 * Handles: connect → greeting → login → commands → auto-reconnect → logout.
 *
 * Usage:
 *   const sess = new EppSession(config);
 *   await sess.ensureConnected();
 *   const avail = await sess.checkAvailability('example.com');
 *   await sess.close();
 */

import { EppClient }   from './EppClient.js';
import { EppCommands } from './EppCommands.js';
import { EppParser }   from './EppParser.js';
import type { EppConfig, EppResponse } from './types.js';
import { logger }      from '../../logger.js';

export { EppClient }   from './EppClient.js';
export { EppCommands } from './EppCommands.js';
export { EppParser }   from './EppParser.js';
export type { EppConfig, EppResponse, EppSessionState } from './types.js';

export class EppSession {
  private client:   EppClient;
  private loggedIn: boolean = false;

  constructor(private readonly config: EppConfig) {
    this.client = new EppClient(config);
  }

  // ── TRID ────────────────────────────────────────────────────────────────────

  private trid(): string {
    return `MB-${Date.now()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;
  }

  // ── Connection management ───────────────────────────────────────────────────

  /**
   * Ensure a logged-in EPP session is available.
   * Idempotent — safe to call before every command.
   */
  async ensureConnected(): Promise<void> {
    if (this.client.isConnected && this.loggedIn) return;

    if (!this.client.isConnected) {
      const greetingXml = await this.client.connect();
      if (greetingXml) {
        const g = EppParser.parseResponse(greetingXml);
        logger.info({ svTRID: g.trid.svTRID }, '[EPP] Greeting received');
      }
    }

    if (!this.loggedIn) {
      const resp = await this._send(EppCommands.login(this.config.user, this.config.pass, this.trid()));
      if (resp.code !== 1000) {
        throw new Error(`[EPP] Login failed: ${resp.msg} (code ${resp.code})`);
      }
      this.loggedIn = true;
      logger.info('[EPP] Logged in successfully');
    }
  }

  /** Close the EPP session gracefully. */
  async close(): Promise<void> {
    if (this.loggedIn) {
      try {
        await this._send(EppCommands.logout(this.trid()));
      } catch { /* ignore logout errors */ }
      this.loggedIn = false;
    }
    this.client.disconnect();
  }

  // ── Internal send ───────────────────────────────────────────────────────────

  private async _send(xml: string): Promise<EppResponse> {
    const responseXml = await this.client.send(xml);
    return EppParser.parseResponse(responseXml);
  }

  /**
   * Execute a command with auto-reconnect on session loss.
   */
  private async execute(xml: string): Promise<EppResponse> {
    try {
      await this.ensureConnected();
      return await this._send(xml);
    } catch (err: any) {
      // Mark session as dead so next call reconnects
      this.loggedIn = false;
      throw err;
    }
  }

  // ── Domain operations ───────────────────────────────────────────────────────

  async checkAvailability(fqdn: string): Promise<boolean> {
    const xml  = EppCommands.domainCheck([fqdn], this.trid());
    const resp = await this.execute(xml);
    if (resp.code !== 1000) return false;

    const avail = resp.resData?.chkData;
    if (!avail) return false;
    const cds: any[] = Array.isArray(avail.cd) ? avail.cd : [avail.cd];
    const match = cds.find((cd: any) => {
      const n = cd?.name;
      return (typeof n === 'string' ? n : n?.['#text'] ?? n?.['$text'] ?? '') === fqdn;
    });
    if (!match) return false;
    const a = match.name?.['@_avail'];
    return a === 1 || a === '1' || a === true || a === 'true';
  }

  async getDomainInfo(fqdn: string): Promise<EppResponse> {
    return this.execute(EppCommands.domainInfo(fqdn, this.trid()));
  }

  async createContact(id: string, contact: any): Promise<EppResponse> {
    return this.execute(EppCommands.contactCreate(id, contact, this.trid()));
  }

  async registerDomain(params: any): Promise<EppResponse> {
    return this.execute(EppCommands.domainCreate(params, this.trid()));
  }

  async renewDomain(fqdn: string, curExpDate: string, years: number): Promise<EppResponse> {
    return this.execute(EppCommands.domainRenew(fqdn, curExpDate, years, this.trid()));
  }

  async updateNameservers(fqdn: string, addNs: string[], remNs: string[]): Promise<EppResponse> {
    return this.execute(EppCommands.domainUpdate(fqdn, addNs, remNs, this.trid()));
  }

  async transferDomain(fqdn: string, authCode: string): Promise<EppResponse> {
    return this.execute(EppCommands.domainTransfer(fqdn, authCode, 'request', this.trid()));
  }

  async deleteDomain(fqdn: string): Promise<EppResponse> {
    return this.execute(EppCommands.domainDelete(fqdn, this.trid()));
  }

  // ── Deprecated alias (used by EppRegistrarProvider) ────────────────────────

  /** @deprecated Use ensureConnected() + per-command methods instead. */
  async connectAndLogin(): Promise<void> {
    return this.ensureConnected();
  }
}
