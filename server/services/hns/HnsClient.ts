/**
 * Max Booster — Handshake (HNS) Node Client  (Build 3)
 *
 * JSON-RPC + REST client for hsd (Handshake full node).
 * Supports both mainnet (port 12037) and simnet/regtest (port 14037).
 *
 * hsd API reference: https://hsd-dev.org/api-docs/
 */

import * as http  from 'http';
import * as https from 'https';
import { logger } from '../../logger.js';

export interface HnsConfig {
  host:     string;   // e.g. '127.0.0.1'
  port:     number;   // 12037 (mainnet) | 14037 (simnet)
  apiKey:   string;   // hsd --api-key
  wallet?:  string;   // wallet ID (default: 'primary')
  network?: 'main' | 'testnet' | 'regtest' | 'simnet';
  timeout?: number;   // ms (default: 10000)
}

export interface HnsNameInfo {
  name:       string;
  nameHash:   string;
  state:      'OPENING' | 'BIDDING' | 'REVEAL' | 'CLOSED' | 'LOCKED' | 'REVOKED' | 'EXPIRED';
  registered: boolean;
  expired:    boolean;
  height:     number;
  renewal:    number;
  owner?:     { hash: string; index: number };
  value?:     number;
  highest?:   number;
  data?:      string; // hex encoded DNS resource
  transfer?:  number;
  revoked?:   number;
  claimed?:   number;
  renewals?:  number;
  weak?:      boolean;
  stats?: {
    openPeriodStart:   number;
    openPeriodEnd:     number;
    bidPeriodStart:    number;
    bidPeriodEnd:      number;
    revealPeriodStart: number;
    revealPeriodEnd:   number;
  };
}

export interface HnsBid {
  name:     string;
  lockup:   number; // HNS atoms (1 HNS = 1,000,000 atoms)
  bid:      number;
  own:      boolean;
}

export interface HnsTx {
  hash:    string;
  height:  number;
  block?:  string;
  time?:   number;
  mtime:   number;
  date:    string;
  fee:     number;
  rate:    number;
  outputs: Array<{ value: number; address: string; covenant?: Record<string, unknown> }>;
}

export class HnsClient {
  private readonly cfg: Required<HnsConfig>;
  private readonly auth: string;
  private readonly httpLib: typeof http | typeof https;
  private _nodeInfo: Record<string, unknown> | null = null;

  constructor(cfg: HnsConfig) {
    this.cfg = {
      host:    cfg.host    || '127.0.0.1',
      port:    cfg.port    || 12037,
      apiKey:  cfg.apiKey,
      wallet:  cfg.wallet  || 'primary',
      network: cfg.network || 'main',
      timeout: cfg.timeout || 10_000,
    };
    this.auth    = Buffer.from(`x:${this.cfg.apiKey}`).toString('base64');
    this.httpLib = this.cfg.port === 443 ? https : http;
  }

  // ── Raw request helpers ───────────────────────────────────────────────────

  private request(method: string, path: string, body?: Record<string, unknown>): Promise<any> {
    return new Promise((resolve, reject) => {
      const bodyStr = body ? JSON.stringify(body) : '';
      const opts: http.RequestOptions = {
        hostname: this.cfg.host,
        port:     this.cfg.port,
        path,
        method,
        headers: {
          'Content-Type':   'application/json',
          'Authorization':  `Basic ${this.auth}`,
          'Content-Length': Buffer.byteLength(bodyStr),
        },
        timeout: this.cfg.timeout,
      };

      const req = (this.httpLib as typeof http).request(opts, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString();
          try {
            const json = JSON.parse(text);
            if (json.error) reject(new Error(`hsd: ${json.error.message || json.error}`));
            else resolve(json.result ?? json);
          } catch {
            if (text.trim() === '') resolve(null);
            else reject(new Error(`hsd parse error: ${text.slice(0, 200)}`));
          }
        });
      });

      req.on('error',   reject);
      req.on('timeout', () => req.destroy(new Error('hsd request timeout')));
      if (bodyStr) req.write(bodyStr);
      req.end();
    });
  }

  /** hsd node JSON-RPC */
  private rpc(method: string, params: unknown[] = []): Promise<any> {
    return this.request('POST', '/', { method, params, id: Date.now() });
  }

  /** hsd wallet REST API */
  private walletGet(path: string): Promise<any> {
    return this.request('GET', `/wallet/${this.cfg.wallet}${path}`);
  }

  private walletPost(path: string, body: Record<string, unknown>): Promise<any> {
    return this.request('POST', `/wallet/${this.cfg.wallet}${path}`, body);
  }

  // ── Node info ─────────────────────────────────────────────────────────────

  async getInfo(): Promise<any> {
    if (this._nodeInfo) return this._nodeInfo;
    this._nodeInfo = await this.rpc('getinfo');
    return this._nodeInfo;
  }

  async getBlockCount(): Promise<number> {
    return this.rpc('getblockcount');
  }

  async isReady(): Promise<boolean> {
    try {
      const info = await this.getInfo();
      return info?.version !== undefined;
    } catch {
      return false;
    }
  }

  // ── Name queries ──────────────────────────────────────────────────────────

  async getNameInfo(name: string): Promise<HnsNameInfo> {
    const res = await this.rpc('getnameinfo', [name]);
    return res.info || res;
  }

  async getNameByHash(hash: string): Promise<string | null> {
    try {
      return await this.rpc('getnamebyhash', [hash]);
    } catch {
      return null;
    }
  }

  async getNameResource(name: string): Promise<any> {
    return this.rpc('getnameresource', [name]);
  }

  async checkAvailability(name: string): Promise<{
    available: boolean;
    reason:    string;
    state:     string;
    nameInfo:  HnsNameInfo;
  }> {
    const info = await this.getNameInfo(name);
    const state = info.state || 'UNKNOWN';

    if (state === 'CLOSED' && info.registered) {
      return { available: false, reason: 'Name is registered', state, nameInfo: info };
    }
    if (state === 'BIDDING' || state === 'REVEAL') {
      return { available: false, reason: `Auction in progress (${state})`, state, nameInfo: info };
    }
    if (state === 'OPENING') {
      return { available: false, reason: 'Auction opening', state, nameInfo: info };
    }

    return { available: true, reason: 'Available for auction', state, nameInfo: info };
  }

  // ── Wallet operations ─────────────────────────────────────────────────────

  async getWalletInfo(): Promise<any> {
    return this.walletGet('');
  }

  async getWalletBalance(): Promise<{ confirmed: number; unconfirmed: number }> {
    return this.walletGet('/balance');
  }

  async getReceiveAddress(): Promise<string> {
    const res = await this.walletGet('/key');
    return res?.address || '';
  }

  async getWalletBids(own = true): Promise<HnsBid[]> {
    return this.walletGet(`/bid?own=${own}`);
  }

  async getWalletReveals(): Promise<any[]> {
    return this.walletGet('/reveal');
  }

  async getWalletNames(): Promise<HnsNameInfo[]> {
    return this.walletGet('/name');
  }

  // ── Auction lifecycle ─────────────────────────────────────────────────────

  /**
   * Open auction for a name.
   * Must be called in CLOSED (not yet auctioned) state.
   */
  async openAuction(name: string): Promise<HnsTx> {
    return this.walletPost('/open', { name });
  }

  /**
   * Place a bid. lockup >= bid (excess hides true bid from competitors).
   * Amounts in HNS (not atoms) — will be converted internally.
   */
  async placeBid(name: string, bidHNS: number, lockupHNS: number): Promise<HnsTx> {
    const bid    = Math.floor(bidHNS    * 1_000_000);
    const lockup = Math.floor(lockupHNS * 1_000_000);
    return this.walletPost('/bid', { name, bid, lockup });
  }

  /**
   * Reveal bids for a name (call during REVEAL period).
   */
  async revealBids(name: string): Promise<HnsTx> {
    return this.walletPost('/reveal', { name });
  }

  /**
   * Redeem losing bid (reclaim locked HNS after reveal period).
   */
  async redeemBid(name: string): Promise<HnsTx> {
    return this.walletPost('/redeem', { name });
  }

  /**
   * Register / update DNS records for a won name.
   * records: Handshake resource format (see HNS DNS docs)
   */
  async updateName(name: string, records: HnsResource[]): Promise<HnsTx> {
    const data = encodeHnsResource(records);
    return this.walletPost('/update', { name, data });
  }

  /**
   * Renew a registered name (must be called before expiry).
   */
  async renewName(name: string): Promise<HnsTx> {
    return this.walletPost('/renew', { name });
  }

  /**
   * Transfer name to another address.
   */
  async transferName(name: string, toAddress: string): Promise<HnsTx> {
    return this.walletPost('/transfer', { name, address: toAddress });
  }

  /**
   * Finalize transfer (after transfer lockup period).
   */
  async finalizeName(name: string): Promise<HnsTx> {
    return this.walletPost('/finalize', { name });
  }

  /**
   * Send HNS to an address.
   */
  async sendHNS(toAddress: string, amountHNS: number): Promise<HnsTx> {
    const value = Math.floor(amountHNS * 1_000_000);
    return this.walletPost('/send', { outputs: [{ address: toAddress, value }] });
  }
}

// ── HNS Resource format ───────────────────────────────────────────────────────
export interface HnsResource {
  type: 'GLUE4' | 'GLUE6' | 'NS' | 'TXT' | 'DS' | 'SYNTH4' | 'SYNTH6';
  ns?:      string;
  address?: string;
  txt?:     string[];
  keyTag?:  number;
  algorithm?: number;
  digestType?: number;
  digest?:  string;
}

/**
 * Encode HNS resource records into hex string (Handshake covenant data format).
 * This produces the `data` field for wallet `update` transactions.
 *
 * Simplified encoding — for production, use hsd's built-in resource encoder.
 */
export function encodeHnsResource(records: HnsResource[]): string {
  // hsd accepts a JSON-like resource object
  const resource = {
    records: records.map(r => {
      switch (r.type) {
        case 'NS':     return { type: 'NS', ns: r.ns };
        case 'GLUE4':  return { type: 'GLUE4', ns: r.ns, address: r.address };
        case 'GLUE6':  return { type: 'GLUE6', ns: r.ns, address: r.address };
        case 'TXT':    return { type: 'TXT', txt: r.txt };
        case 'DS':     return { type: 'DS', keyTag: r.keyTag, algorithm: r.algorithm,
                                digestType: r.digestType, digest: r.digest };
        default:       return r;
      }
    }),
  };
  // hsd expects hex-encoded serialized resource
  return Buffer.from(JSON.stringify(resource)).toString('hex');
}

/**
 * Build NS records pointing to Max Booster's nameservers.
 * Used when registering a name and delegating to the platform DNS.
 */
export function buildMaxBoosterNSRecords(
  tld: string,
  ns1IP: string,
  ns2IP: string,
): HnsResource[] {
  return [
    { type: 'GLUE4', ns: `ns1.${tld}.`,  address: ns1IP },
    { type: 'GLUE4', ns: `ns2.${tld}.`,  address: ns2IP },
    { type: 'NS',    ns: `ns1.${tld}.` },
    { type: 'NS',    ns: `ns2.${tld}.` },
  ];
}
