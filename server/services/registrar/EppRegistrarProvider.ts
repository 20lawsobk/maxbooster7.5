/**
 * EPP Registrar Provider — Stub
 *
 * Implements the RegistrarProvider interface against a real upstream registrar
 * via EPP (Extensible Provisioning Protocol) or a registrar reseller API such
 * as OpenSRS (Tucows), Namecheap, or Enom.
 *
 * ─── To activate this provider ───────────────────────────────────────────────
 * Set these environment variables and set REGISTRAR_PROVIDER=epp:
 *
 *   EPP_HOST=epp.opensrs.net          # EPP server hostname
 *   EPP_PORT=700                      # EPP port (standard: 700)
 *   EPP_USERNAME=your_reseller_id
 *   EPP_PASSWORD=your_epp_password
 *   EPP_TLS_CERT=/path/to/client.crt  # optional mTLS client cert
 *   EPP_TLS_KEY=/path/to/client.key
 *   EPP_RESELLER_IP=1.2.3.4           # your server's outbound IP (whitelisted at registrar)
 *
 *   OR for HTTP-based reseller APIs (OpenSRS XML API, Namecheap API, etc.):
 *   REGISTRAR_API_URL=https://rcp.opensrs.net/RPC2
 *   REGISTRAR_API_KEY=your_api_key
 *   REGISTRAR_USERNAME=your_username
 *
 * ─── Current status ──────────────────────────────────────────────────────────
 * All methods are stubbed and will throw EPP_NOT_CONFIGURED until credentials
 * are provided. The interface is complete and ready to implement.
 *
 * ─── Implementation notes ────────────────────────────────────────────────────
 * Recommended client libraries:
 *   - epp-client (npm) for raw EPP over TCP/TLS
 *   - opensrs-node (npm) for OpenSRS XML API
 *   - namecheap-api (npm) for Namecheap HTTP API
 *
 * Key EPP commands to implement per method:
 *   checkAvailability  → <check> domain:check
 *   registerDomain     → <create> domain:create + contact:create
 *   renewDomain        → <renew> domain:renew
 *   setNameservers     → <update> domain:update ns
 *   getDomainInfo      → <info> domain:info
 *   releaseDomain      → <update> domain:update (clientDeleteProhibited off) + auto_renew off
 *   initiateTransferIn → <transfer> domain:transfer op="request"
 */

import { logger } from '../../logger.js';
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

function isConfigured(): boolean {
  return !!(
    (process.env.EPP_HOST && process.env.EPP_USERNAME && process.env.EPP_PASSWORD) ||
    (process.env.REGISTRAR_API_URL && process.env.REGISTRAR_API_KEY)
  );
}

function notConfigured(method: string): never {
  const msg = `EPP_NOT_CONFIGURED: ${method}() called but no EPP/registrar API credentials are set. ` +
    `Set EPP_HOST + EPP_USERNAME + EPP_PASSWORD (or REGISTRAR_API_URL + REGISTRAR_API_KEY) ` +
    `and set REGISTRAR_PROVIDER=epp to enable real domain registration.`;
  logger.warn(msg);
  throw Object.assign(new Error(msg), { code: 'EPP_NOT_CONFIGURED' });
}

// ── Provider ──────────────────────────────────────────────────────────────────

export class EppRegistrarProvider implements RegistrarProvider {
  readonly name = 'EPP-External';

  // ── Health check ────────────────────────────────────────────────────────────

  async healthCheck(): Promise<{ ok: boolean; message?: string }> {
    if (!isConfigured()) {
      return {
        ok:      false,
        message: 'EPP provider not configured. Set EPP_HOST / REGISTRAR_API_URL credentials.',
      };
    }
    // TODO: open a test EPP session and send <hello> to verify connectivity
    return { ok: false, message: 'EPP health check not yet implemented — add EPP client library' };
  }

  // ── Availability ────────────────────────────────────────────────────────────

  async checkAvailability(fqdn: string): Promise<AvailabilityResult> {
    if (!isConfigured()) notConfigured('checkAvailability');

    /*
     * EPP:
     *   <check>
     *     <domain:check>
     *       <domain:name avail="1">{fqdn}</domain:name>
     *     </domain:check>
     *   </check>
     *
     * OpenSRS XML API:
     *   <OPS_envelope>
     *     <body><data_block><dt_assoc>
     *       <item key="action">LOOKUP</item>
     *       <item key="object">DOMAIN</item>
     *       <item key="attributes"><dt_assoc>
     *         <item key="domain">{fqdn}</item>
     *       </dt_assoc></item>
     *     </dt_assoc></data_block></body>
     *   </OPS_envelope>
     */
    throw new Error('EppRegistrarProvider.checkAvailability: not yet implemented — add EPP client');
  }

  // ── Registration ─────────────────────────────────────────────────────────────

  async registerDomain(params: RegisterParams): Promise<RegisterResult> {
    if (!isConfigured()) notConfigured('registerDomain');

    /*
     * EPP sequence:
     *   1. contact:create (registrant, admin, tech, billing)
     *   2. domain:create with:
     *        <domain:ns> → params.nameservers
     *        <domain:registrant> → registrant contact id
     *        <domain:period unit="y"> → params.years
     *
     * On success:
     *   - Parse exDate from <domain:creData>
     *   - Parse svTRID as registryId
     *   - Return RegisterResult
     *
     * WHOIS privacy:
     *   - If params.privacyEnabled, add domain:extension for ID protection
     *     (OpenSRS: set_whois_privacy; some registries via EPP extension)
     */
    throw new Error('EppRegistrarProvider.registerDomain: not yet implemented — add EPP client');
  }

  // ── Renew ─────────────────────────────────────────────────────────────────────

  async renewDomain(fqdn: string, years: number): Promise<RenewResult> {
    if (!isConfigured()) notConfigured('renewDomain');

    /*
     * EPP:
     *   <renew>
     *     <domain:renew>
     *       <domain:name>{fqdn}</domain:name>
     *       <domain:curExpDate>{currentExpiryDate}</domain:curExpDate>
     *       <domain:period unit="y">{years}</domain:period>
     *     </domain:renew>
     *   </renew>
     */
    throw new Error('EppRegistrarProvider.renewDomain: not yet implemented — add EPP client');
  }

  // ── Nameservers ───────────────────────────────────────────────────────────────

  async setNameservers(fqdn: string, nameservers: string[]): Promise<void> {
    if (!isConfigured()) notConfigured('setNameservers');

    /*
     * EPP:
     *   <update>
     *     <domain:update>
     *       <domain:name>{fqdn}</domain:name>
     *       <domain:chg>
     *         <domain:ns>
     *           <domain:hostObj>ns1.maxbooster.net</domain:hostObj>
     *           <domain:hostObj>ns2.maxbooster.net</domain:hostObj>
     *         </domain:ns>
     *       </domain:chg>
     *     </domain:update>
     *   </update>
     */
    throw new Error('EppRegistrarProvider.setNameservers: not yet implemented — add EPP client');
  }

  // ── Domain info ───────────────────────────────────────────────────────────────

  async getDomainInfo(fqdn: string): Promise<DomainInfo> {
    if (!isConfigured()) notConfigured('getDomainInfo');

    /*
     * EPP:
     *   <info>
     *     <domain:info>
     *       <domain:name hosts="all">{fqdn}</domain:name>
     *     </domain:info>
     *   </info>
     * Returns: status codes, nameservers, expiry, contacts, etc.
     */
    throw new Error('EppRegistrarProvider.getDomainInfo: not yet implemented — add EPP client');
  }

  // ── Soft release ──────────────────────────────────────────────────────────────

  async releaseDomain(fqdn: string): Promise<void> {
    if (!isConfigured()) notConfigured('releaseDomain');

    /*
     * Soft release = disable auto-renew so domain expires naturally.
     * Some registrars also support EPP <update> to remove clientAutoRenewProhibited.
     *
     * OpenSRS: set_auto_renew to false
     * EPP extension: urn:ietf:params:xml:ns:rgp-1.0 for grace period ops
     */
    throw new Error('EppRegistrarProvider.releaseDomain: not yet implemented — add EPP client');
  }

  // ── Transfer in ───────────────────────────────────────────────────────────────

  async initiateTransferIn(params: TransferParams): Promise<TransferResult> {
    if (!isConfigured()) notConfigured('initiateTransferIn');

    /*
     * EPP:
     *   <transfer op="request">
     *     <domain:transfer>
     *       <domain:name>{fqdn}</domain:name>
     *       <domain:authInfo>
     *         <domain:pw>{params.authCode}</domain:pw>
     *       </domain:authInfo>
     *     </domain:transfer>
     *   </transfer>
     *
     * After submission: poll EPP message queue or use registrar webhooks to
     * detect <pendingActionNotification> when the losing registrar approves.
     */
    throw new Error('EppRegistrarProvider.initiateTransferIn: not yet implemented — add EPP client');
  }
}
