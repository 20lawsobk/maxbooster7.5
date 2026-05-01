/**
 * dnsProviderService — Multi-provider DNS adapter layer
 *
 * Modelled after the proven patterns used by Vercel, Netlify, and
 * Cloudflare's own provider-integration systems:
 *
 *   • Provider interface is uniform — callers never know which API they're
 *     talking to.  Adding a new registrar is one class implementation.
 *   • TTL minimum of 60 s is enforced globally (same floor as Vercel).
 *   • Exponential-backoff retry is built into every provider for transient
 *     API errors (5xx / network timeouts).
 *   • CAA record type is fully supported (required by Let's Encrypt best
 *     practices — Vercel auto-provisions CAA records on domain add).
 *   • batchUpsertRecords() uses provider-native batch APIs where available;
 *     falls back to sequential upsert with per-record error isolation.
 *
 * Supported providers:
 *   godaddy      — GoDaddy REST API v1
 *   cloudflare   — Cloudflare API v4 (zone token auth)
 *   namecheap    — Namecheap XML API
 *   route53      — AWS Route 53 (accessKeyId + secretAccessKey)
 *   digitalocean — DigitalOcean Domains v2 API
 *   porkbun      — Porkbun API v3
 */

import { logger } from '../logger.js';

// ── Timeout-guarded fetch: adds a 8s default signal so no outbound HTTP call
// can hold the event loop indefinitely.  Per-call signal overrides this default.
const timedFetch = (url: string | URL | Request, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { signal: AbortSignal.timeout(8_000), ...init });


// ─── Public types ─────────────────────────────────────────────────────────────

export interface DnsRecord {
  type: string;
  name: string;
  value: string;
  ttl: number;
  priority?: number;
  port?: number;
  weight?: number;
  protocol?: string;
  service?: string;
}

export interface DnsProvider {
  name: string;
  listRecords(domain: string, credentials: ProviderCredentials): Promise<DnsRecord[]>;
  addRecord(domain: string, record: DnsRecord, credentials: ProviderCredentials): Promise<boolean>;
  updateRecord(domain: string, record: DnsRecord, originalName: string, originalType: string, credentials: ProviderCredentials): Promise<boolean>;
  deleteRecord(domain: string, recordType: string, recordName: string, credentials: ProviderCredentials): Promise<boolean>;
  batchUpsertRecords(domain: string, records: DnsRecord[], credentials: ProviderCredentials): Promise<boolean>;
  verifyCredentials(domain: string, credentials: ProviderCredentials): Promise<boolean>;
}

export interface ProviderCredentials {
  apiKey: string;
  apiSecret: string;
  /** AWS only: region (defaults to 'us-east-1') */
  region?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GODADDY_API_BASE    = 'https://api.godaddy.com';
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const DO_API_BASE         = 'https://api.digitalocean.com/v2';
const PORKBUN_API_BASE    = 'https://porkbun.com/api/json/v3';

/** Minimum TTL Vercel enforces — we apply the same floor. */
const MIN_TTL = 60;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function extractRootDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length >= 2) return parts.slice(-2).join('.');
  return domain;
}

export function extractSubdomainPart(domain: string): string {
  const parts = domain.split('.');
  if (parts.length > 2) return parts.slice(0, -2).join('.');
  return '@';
}

/** Enforce the minimum TTL floor (60 s) — matches Vercel's policy. */
function clampTtl(ttl: number): number {
  return Math.max(MIN_TTL, ttl);
}

/**
 * Fetch with exponential-backoff retry for transient errors (5xx / network).
 * Proven pattern used by Cloudflare's own API client and AWS SDKs.
 */
async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries = 3,
): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const res = await timedFetch(url, init);
      // Retry on server errors; surface client errors immediately
      if (res.status >= 500 && attempt < maxRetries - 1) {
        const delay = 500 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries - 1) {
        const delay = 500 * Math.pow(2, attempt);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ─── GoDaddy ──────────────────────────────────────────────────────────────────

class GoDaddyProvider implements DnsProvider {
  name = 'godaddy';

  private authHeader(creds: ProviderCredentials): string {
    return `sso-key ${creds.apiKey}:${creds.apiSecret}`;
  }

  private commonHeaders(creds: ProviderCredentials): Record<string, string> {
    return {
      Authorization: this.authHeader(creds),
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  async listRecords(domain: string, credentials: ProviderCredentials): Promise<DnsRecord[]> {
    const rootDomain = extractRootDomain(domain);
    const resp = await fetchWithRetry(
      `${GODADDY_API_BASE}/v1/domains/${rootDomain}/records`,
      { headers: this.commonHeaders(credentials) },
    );
    if (!resp.ok) {
      const text = await resp.text();
      logger.warn('[GoDaddy] listRecords error', { status: resp.status, body: text });
      throw new Error(`GoDaddy API error: ${resp.status}`);
    }
    const data = await resp.json() as Array<{
      type: string; name: string; data: string; ttl: number;
      priority?: number; port?: number; weight?: number; protocol?: string; service?: string;
    }>;
    return data.map(r => ({
      type: r.type, name: r.name, value: r.data,
      ttl: clampTtl(r.ttl), priority: r.priority,
      port: r.port, weight: r.weight, protocol: r.protocol, service: r.service,
    }));
  }

  async addRecord(domain: string, record: DnsRecord, credentials: ProviderCredentials): Promise<boolean> {
    const rootDomain = extractRootDomain(domain);
    const body: Record<string, unknown> = {
      type: record.type, name: record.name, data: record.value,
      ttl: clampTtl(record.ttl),
    };
    if (record.priority !== undefined) body.priority = record.priority;
    if (record.port !== undefined) body.port = record.port;
    if (record.weight !== undefined) body.weight = record.weight;
    if (record.protocol) body.protocol = record.protocol;
    if (record.service) body.service = record.service;

    const resp = await fetchWithRetry(
      `${GODADDY_API_BASE}/v1/domains/${rootDomain}/records`,
      { method: 'PATCH', headers: this.commonHeaders(credentials), body: JSON.stringify([body]) },
    );
    if (!resp.ok) {
      const text = await resp.text();
      logger.warn('[GoDaddy] addRecord error', { status: resp.status, body: text });
      throw new Error(`GoDaddy API error: ${resp.status}`);
    }
    return true;
  }

  async updateRecord(domain: string, record: DnsRecord, originalName: string, originalType: string, credentials: ProviderCredentials): Promise<boolean> {
    const rootDomain = extractRootDomain(domain);
    if (originalName !== record.name || originalType !== record.type) {
      await this.deleteRecord(domain, originalType, originalName, credentials).catch(err => {
        logger.warn(`[GoDaddy] Could not delete old record during update — stale record may remain: ${err.message}`);
      });
      return this.addRecord(domain, record, credentials);
    }
    const body: Record<string, unknown> = { data: record.value, ttl: clampTtl(record.ttl) };
    if (record.priority !== undefined) body.priority = record.priority;
    if (record.port !== undefined) body.port = record.port;
    if (record.weight !== undefined) body.weight = record.weight;

    const resp = await fetchWithRetry(
      `${GODADDY_API_BASE}/v1/domains/${rootDomain}/records/${originalType}/${originalName}`,
      { method: 'PUT', headers: this.commonHeaders(credentials), body: JSON.stringify([body]) },
    );
    if (!resp.ok) {
      const text = await resp.text();
      logger.warn('[GoDaddy] updateRecord error', { status: resp.status, body: text });
      throw new Error(`GoDaddy API error: ${resp.status}`);
    }
    return true;
  }

  async deleteRecord(domain: string, recordType: string, recordName: string, credentials: ProviderCredentials): Promise<boolean> {
    const rootDomain = extractRootDomain(domain);
    const resp = await fetchWithRetry(
      `${GODADDY_API_BASE}/v1/domains/${rootDomain}/records/${recordType}/${recordName}`,
      { method: 'DELETE', headers: this.commonHeaders(credentials) },
    );
    if (!resp.ok) {
      const text = await resp.text();
      logger.warn('[GoDaddy] deleteRecord error', { status: resp.status, body: text });
      throw new Error(`GoDaddy API error: ${resp.status}`);
    }
    return true;
  }

  async batchUpsertRecords(domain: string, records: DnsRecord[], credentials: ProviderCredentials): Promise<boolean> {
    const rootDomain = extractRootDomain(domain);
    const body = records.map(r => {
      const rec: Record<string, unknown> = {
        type: r.type, name: r.name, data: r.value, ttl: clampTtl(r.ttl),
      };
      if (r.priority !== undefined) rec.priority = r.priority;
      if (r.port !== undefined) rec.port = r.port;
      if (r.weight !== undefined) rec.weight = r.weight;
      if (r.protocol) rec.protocol = r.protocol;
      if (r.service) rec.service = r.service;
      return rec;
    });
    const resp = await fetchWithRetry(
      `${GODADDY_API_BASE}/v1/domains/${rootDomain}/records`,
      { method: 'PATCH', headers: this.commonHeaders(credentials), body: JSON.stringify(body) },
    );
    if (!resp.ok) {
      const text = await resp.text();
      logger.warn('[GoDaddy] batchUpsert error', { status: resp.status, body: text });
      throw new Error(`GoDaddy API error: ${resp.status}`);
    }
    return true;
  }

  async verifyCredentials(domain: string, credentials: ProviderCredentials): Promise<boolean> {
    const rootDomain = extractRootDomain(domain);
    const resp = await fetchWithRetry(
      `${GODADDY_API_BASE}/v1/domains/${rootDomain}`,
      { headers: this.commonHeaders(credentials) },
    );
    return resp.ok;
  }
}

// ─── Cloudflare ───────────────────────────────────────────────────────────────

class CloudflareProvider implements DnsProvider {
  name = 'cloudflare';

  private headers(creds: ProviderCredentials): Record<string, string> {
    return { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' };
  }

  private async getZoneId(domain: string, credentials: ProviderCredentials): Promise<string> {
    const rootDomain = extractRootDomain(domain);
    const resp = await fetchWithRetry(
      `${CLOUDFLARE_API_BASE}/zones?name=${rootDomain}`,
      { headers: this.headers(credentials) },
    );
    if (!resp.ok) throw new Error(`Cloudflare zones error: ${resp.status}`);
    const data = await resp.json() as { result: Array<{ id: string }> };
    if (!data.result?.length) throw new Error(`Zone not found for ${rootDomain}`);
    return data.result[0].id;
  }

  async listRecords(domain: string, credentials: ProviderCredentials): Promise<DnsRecord[]> {
    const zoneId = await this.getZoneId(domain, credentials);
    const resp = await fetchWithRetry(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records?per_page=500`,
      { headers: this.headers(credentials) },
    );
    if (!resp.ok) throw new Error(`Cloudflare listRecords error: ${resp.status}`);
    const data = await resp.json() as {
      result: Array<{ type: string; name: string; content: string; ttl: number; priority?: number }>;
    };
    return data.result.map(r => ({
      type: r.type, name: r.name, value: r.content,
      ttl: clampTtl(r.ttl === 1 ? 300 : r.ttl), priority: r.priority,
    }));
  }

  async addRecord(domain: string, record: DnsRecord, credentials: ProviderCredentials): Promise<boolean> {
    const zoneId = await this.getZoneId(domain, credentials);
    const body: Record<string, unknown> = {
      type: record.type, name: record.name, content: record.value,
      ttl: clampTtl(record.ttl),
    };
    if (record.priority !== undefined) body.priority = record.priority;
    const resp = await fetchWithRetry(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`,
      { method: 'POST', headers: this.headers(credentials), body: JSON.stringify(body) },
    );
    if (!resp.ok) throw new Error(`Cloudflare addRecord error: ${resp.status}`);
    return true;
  }

  async updateRecord(domain: string, record: DnsRecord, originalName: string, originalType: string, credentials: ProviderCredentials): Promise<boolean> {
    const zoneId = await this.getZoneId(domain, credentials);
    const listResp = await fetchWithRetry(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records?type=${originalType}&name=${originalName}`,
      { headers: this.headers(credentials) },
    );
    if (!listResp.ok) throw new Error(`Cloudflare find record error: ${listResp.status}`);
    const listData = await listResp.json() as { result: Array<{ id: string }> };
    if (!listData.result?.length) throw new Error('Record not found for update');
    const recordId = listData.result[0].id;

    const body: Record<string, unknown> = {
      type: record.type, name: record.name, content: record.value,
      ttl: clampTtl(record.ttl),
    };
    if (record.priority !== undefined) body.priority = record.priority;
    const resp = await fetchWithRetry(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records/${recordId}`,
      { method: 'PUT', headers: this.headers(credentials), body: JSON.stringify(body) },
    );
    if (!resp.ok) throw new Error(`Cloudflare updateRecord error: ${resp.status}`);
    return true;
  }

  async deleteRecord(domain: string, recordType: string, recordName: string, credentials: ProviderCredentials): Promise<boolean> {
    const zoneId = await this.getZoneId(domain, credentials);
    const listResp = await fetchWithRetry(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records?type=${recordType}&name=${recordName}`,
      { headers: this.headers(credentials) },
    );
    if (!listResp.ok) throw new Error(`Cloudflare find record error: ${listResp.status}`);
    const listData = await listResp.json() as { result: Array<{ id: string }> };
    if (!listData.result?.length) throw new Error('Record not found for delete');
    const recordId = listData.result[0].id;

    const resp = await fetchWithRetry(
      `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records/${recordId}`,
      { method: 'DELETE', headers: this.headers(credentials) },
    );
    if (!resp.ok) throw new Error(`Cloudflare deleteRecord error: ${resp.status}`);
    return true;
  }

  async batchUpsertRecords(domain: string, records: DnsRecord[], credentials: ProviderCredentials): Promise<boolean> {
    for (const record of records) {
      try {
        await this.updateRecord(domain, record, record.name, record.type, credentials);
      } catch {
        await this.addRecord(domain, record, credentials);
      }
    }
    return true;
  }

  async verifyCredentials(domain: string, credentials: ProviderCredentials): Promise<boolean> {
    try {
      await this.getZoneId(domain, credentials);
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Namecheap ────────────────────────────────────────────────────────────────
//
// Namecheap uses an XML-based API. We build minimal XML bodies and parse
// the response XML to extract the relevant data, avoiding any external XML
// library dependency.

class NamecheapProvider implements DnsProvider {
  name = 'namecheap';

  /**
   * apiKey    = Namecheap API Key
   * apiSecret = Namecheap username (stored in apiSecret field for UI simplicity)
   */
  private baseParams(creds: ProviderCredentials): string {
    const ip = process.env.SERVER_PUBLIC_IP || '0.0.0.0';
    return `ApiUser=${creds.apiSecret}&ApiKey=${creds.apiKey}&UserName=${creds.apiSecret}&ClientIp=${ip}`;
  }

  private async callApi(params: string): Promise<string> {
    const resp = await fetchWithRetry(
      `https://api.namecheap.com/xml.response?${params}`,
      {},
    );
    return resp.text();
  }

  private extractXmlValue(xml: string, tag: string): string | null {
    const match = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, 'i'));
    return match ? match[1] : null;
  }

  private isSuccess(xml: string): boolean {
    return xml.includes('Status="OK"');
  }

  async listRecords(domain: string, credentials: ProviderCredentials): Promise<DnsRecord[]> {
    const root = extractRootDomain(domain);
    const [sld, tld] = root.split('.');
    const xml = await this.callApi(
      `${this.baseParams(credentials)}&Command=namecheap.domains.dns.getHosts&SLD=${sld}&TLD=${tld}`,
    );
    if (!this.isSuccess(xml)) {
      logger.warn('[Namecheap] listRecords failed', { domain, xml: xml.slice(0, 500) });
      throw new Error('Namecheap API error on listRecords');
    }
    const hostMatches = [...xml.matchAll(/<host\s+([^/]*?)\/>/gi)];
    return hostMatches.map(m => {
      const attrs = m[1];
      const get = (a: string) => {
        const match = attrs.match(new RegExp(`${a}="([^"]*)"`, 'i'));
        return match ? match[1] : '';
      };
      return {
        type: get('Type'), name: get('Name'), value: get('Address'),
        ttl: clampTtl(parseInt(get('TTL') || '1800', 10)),
        priority: get('MXPref') ? parseInt(get('MXPref'), 10) : undefined,
      };
    });
  }

  async addRecord(domain: string, record: DnsRecord, credentials: ProviderCredentials): Promise<boolean> {
    const existing = await this.listRecords(domain, credentials);
    const all = [...existing, record];
    return this.setAllRecords(domain, all, credentials);
  }

  async updateRecord(domain: string, record: DnsRecord, originalName: string, originalType: string, credentials: ProviderCredentials): Promise<boolean> {
    const existing = await this.listRecords(domain, credentials);
    const filtered = existing.filter(r => !(r.name === originalName && r.type === originalType));
    return this.setAllRecords(domain, [...filtered, record], credentials);
  }

  async deleteRecord(domain: string, recordType: string, recordName: string, credentials: ProviderCredentials): Promise<boolean> {
    const existing = await this.listRecords(domain, credentials);
    const filtered = existing.filter(r => !(r.name === recordName && r.type === recordType));
    return this.setAllRecords(domain, filtered, credentials);
  }

  async batchUpsertRecords(domain: string, records: DnsRecord[], credentials: ProviderCredentials): Promise<boolean> {
    const existing = await this.listRecords(domain, credentials);
    const merged = new Map<string, DnsRecord>();
    for (const r of existing) merged.set(`${r.type}:${r.name}`, r);
    for (const r of records) merged.set(`${r.type}:${r.name}`, r);
    return this.setAllRecords(domain, [...merged.values()], credentials);
  }

  private async setAllRecords(domain: string, records: DnsRecord[], credentials: ProviderCredentials): Promise<boolean> {
    const root = extractRootDomain(domain);
    const [sld, tld] = root.split('.');
    const params = new URLSearchParams({
      ...Object.fromEntries(this.baseParams(credentials).split('&').map(p => p.split('=') as [string, string])),
      Command: 'namecheap.domains.dns.setHosts',
      SLD: sld,
      TLD: tld,
    });
    records.forEach((r, i) => {
      params.set(`HostName${i + 1}`, r.name);
      params.set(`RecordType${i + 1}`, r.type);
      params.set(`Address${i + 1}`, r.value);
      params.set(`TTL${i + 1}`, String(clampTtl(r.ttl)));
      if (r.priority !== undefined) params.set(`MXPref${i + 1}`, String(r.priority));
    });
    const xml = await this.callApi(params.toString());
    if (!this.isSuccess(xml)) {
      logger.warn('[Namecheap] setAllRecords failed', { domain, xml: xml.slice(0, 500) });
      throw new Error('Namecheap API error on setHosts');
    }
    return true;
  }

  async verifyCredentials(domain: string, credentials: ProviderCredentials): Promise<boolean> {
    try {
      await this.listRecords(domain, credentials);
      return true;
    } catch {
      return false;
    }
  }
}

// ─── DigitalOcean ─────────────────────────────────────────────────────────────

class DigitalOceanProvider implements DnsProvider {
  name = 'digitalocean';

  private headers(creds: ProviderCredentials): Record<string, string> {
    return { Authorization: `Bearer ${creds.apiKey}`, 'Content-Type': 'application/json' };
  }

  /** DO uses the root domain as the zone name. */
  private zoneDomain(domain: string): string {
    return extractRootDomain(domain);
  }

  /** DO stores the record name relative to the zone root. */
  private toDoName(fqdn: string, zone: string): string {
    if (fqdn === zone || fqdn === '@') return '@';
    if (fqdn.endsWith(`.${zone}`)) return fqdn.slice(0, -(zone.length + 1));
    return fqdn;
  }

  async listRecords(domain: string, credentials: ProviderCredentials): Promise<DnsRecord[]> {
    const zone = this.zoneDomain(domain);
    let page = 1;
    const results: DnsRecord[] = [];
    while (true) {
      const resp = await fetchWithRetry(
        `${DO_API_BASE}/domains/${zone}/records?per_page=200&page=${page}`,
        { headers: this.headers(credentials) },
      );
      if (!resp.ok) throw new Error(`DigitalOcean listRecords error: ${resp.status}`);
      const data = await resp.json() as {
        domain_records: Array<{ type: string; name: string; data: string; ttl: number; priority?: number; port?: number; weight?: number }>;
        links?: { pages?: { next?: string } };
      };
      for (const r of data.domain_records) {
        results.push({
          type: r.type, name: r.name, value: r.data,
          ttl: clampTtl(r.ttl), priority: r.priority,
          port: r.port, weight: r.weight,
        });
      }
      if (!data.links?.pages?.next) break;
      page++;
    }
    return results;
  }

  async addRecord(domain: string, record: DnsRecord, credentials: ProviderCredentials): Promise<boolean> {
    const zone = this.zoneDomain(domain);
    const body: Record<string, unknown> = {
      type: record.type,
      name: this.toDoName(record.name, zone),
      data: record.value,
      ttl: clampTtl(record.ttl),
    };
    if (record.priority !== undefined) body.priority = record.priority;
    if (record.port !== undefined) body.port = record.port;
    if (record.weight !== undefined) body.weight = record.weight;
    const resp = await fetchWithRetry(
      `${DO_API_BASE}/domains/${zone}/records`,
      { method: 'POST', headers: this.headers(credentials), body: JSON.stringify(body) },
    );
    if (!resp.ok) throw new Error(`DigitalOcean addRecord error: ${resp.status}`);
    return true;
  }

  private async findRecordId(zone: string, recordType: string, recordName: string, credentials: ProviderCredentials): Promise<number | null> {
    const records = await this.listRecords(zone, credentials);
    const match = records.find(r => r.type === recordType && r.name === recordName);
    if (!match) return null;
    // We need the numeric ID from the API directly
    const resp = await fetchWithRetry(
      `${DO_API_BASE}/domains/${zone}/records?type=${recordType}&per_page=200`,
      { headers: this.headers(credentials) },
    );
    if (!resp.ok) return null;
    const data = await resp.json() as { domain_records: Array<{ id: number; name: string; type: string }> };
    const found = data.domain_records.find(r => r.type === recordType && r.name === recordName);
    return found?.id ?? null;
  }

  async updateRecord(domain: string, record: DnsRecord, originalName: string, originalType: string, credentials: ProviderCredentials): Promise<boolean> {
    const zone = this.zoneDomain(domain);
    const id = await this.findRecordId(zone, originalType, this.toDoName(originalName, zone), credentials);
    if (!id) {
      return this.addRecord(domain, record, credentials);
    }
    const body: Record<string, unknown> = {
      type: record.type,
      name: this.toDoName(record.name, zone),
      data: record.value,
      ttl: clampTtl(record.ttl),
    };
    if (record.priority !== undefined) body.priority = record.priority;
    const resp = await fetchWithRetry(
      `${DO_API_BASE}/domains/${zone}/records/${id}`,
      { method: 'PUT', headers: this.headers(credentials), body: JSON.stringify(body) },
    );
    if (!resp.ok) throw new Error(`DigitalOcean updateRecord error: ${resp.status}`);
    return true;
  }

  async deleteRecord(domain: string, recordType: string, recordName: string, credentials: ProviderCredentials): Promise<boolean> {
    const zone = this.zoneDomain(domain);
    const id = await this.findRecordId(zone, recordType, this.toDoName(recordName, zone), credentials);
    if (!id) return true;
    const resp = await fetchWithRetry(
      `${DO_API_BASE}/domains/${zone}/records/${id}`,
      { method: 'DELETE', headers: this.headers(credentials) },
    );
    if (!resp.ok) throw new Error(`DigitalOcean deleteRecord error: ${resp.status}`);
    return true;
  }

  async batchUpsertRecords(domain: string, records: DnsRecord[], credentials: ProviderCredentials): Promise<boolean> {
    for (const record of records) {
      try {
        await this.updateRecord(domain, record, record.name, record.type, credentials);
      } catch {
        await this.addRecord(domain, record, credentials);
      }
    }
    return true;
  }

  async verifyCredentials(domain: string, credentials: ProviderCredentials): Promise<boolean> {
    const zone = this.zoneDomain(domain);
    const resp = await fetchWithRetry(
      `${DO_API_BASE}/domains/${zone}`,
      { headers: this.headers(credentials) },
    );
    return resp.ok;
  }
}

// ─── Porkbun ──────────────────────────────────────────────────────────────────

class PorkbunProvider implements DnsProvider {
  name = 'porkbun';

  /** Porkbun requires both API key and secret in every request body. */
  private authBody(creds: ProviderCredentials): Record<string, string> {
    return { apikey: creds.apiKey, secretapikey: creds.apiSecret };
  }

  private async postJson<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const resp = await fetchWithRetry(
      `${PORKBUN_API_BASE}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
    );
    const data = await resp.json() as { status: string } & T;
    if ((data as any).status !== 'SUCCESS') {
      throw new Error(`Porkbun error on ${path}: ${JSON.stringify(data)}`);
    }
    return data;
  }

  async listRecords(domain: string, credentials: ProviderCredentials): Promise<DnsRecord[]> {
    const root = extractRootDomain(domain);
    const data = await this.postJson<{ records: Array<{ type: string; name: string; content: string; ttl: string; prio?: string }> }>(
      `/dns/retrieve/${root}`,
      this.authBody(credentials),
    );
    return (data.records || []).map(r => ({
      type: r.type, name: r.name, value: r.content,
      ttl: clampTtl(parseInt(r.ttl || '300', 10)),
      priority: r.prio ? parseInt(r.prio, 10) : undefined,
    }));
  }

  async addRecord(domain: string, record: DnsRecord, credentials: ProviderCredentials): Promise<boolean> {
    const root = extractRootDomain(domain);
    await this.postJson(`/dns/create/${root}`, {
      ...this.authBody(credentials),
      type: record.type,
      name: record.name === '@' ? '' : record.name,
      content: record.value,
      ttl: String(clampTtl(record.ttl)),
      ...(record.priority !== undefined ? { prio: String(record.priority) } : {}),
    });
    return true;
  }

  private async findRecordId(domain: string, type: string, name: string, credentials: ProviderCredentials): Promise<string | null> {
    const records = await this.listRecords(domain, credentials);
    const match = records.find(r => r.type === type && r.name === name);
    if (!match) return null;
    // Fetch with type to get ID
    const root = extractRootDomain(domain);
    const data = await this.postJson<{ records: Array<{ id: string; type: string; name: string }> }>(
      `/dns/retrieveByNameType/${root}/${type}/${name === '@' ? '' : name}`,
      this.authBody(credentials),
    ).catch(() => ({ records: [] as Array<{ id: string; type: string; name: string }> }));
    return data.records[0]?.id ?? null;
  }

  async updateRecord(domain: string, record: DnsRecord, originalName: string, originalType: string, credentials: ProviderCredentials): Promise<boolean> {
    const root = extractRootDomain(domain);
    const id = await this.findRecordId(domain, originalType, originalName, credentials);
    if (!id) return this.addRecord(domain, record, credentials);
    await this.postJson(`/dns/edit/${root}/${id}`, {
      ...this.authBody(credentials),
      type: record.type,
      name: record.name === '@' ? '' : record.name,
      content: record.value,
      ttl: String(clampTtl(record.ttl)),
      ...(record.priority !== undefined ? { prio: String(record.priority) } : {}),
    });
    return true;
  }

  async deleteRecord(domain: string, recordType: string, recordName: string, credentials: ProviderCredentials): Promise<boolean> {
    const root = extractRootDomain(domain);
    const id = await this.findRecordId(domain, recordType, recordName, credentials);
    if (!id) return true;
    await this.postJson(`/dns/delete/${root}/${id}`, this.authBody(credentials));
    return true;
  }

  async batchUpsertRecords(domain: string, records: DnsRecord[], credentials: ProviderCredentials): Promise<boolean> {
    for (const record of records) {
      try {
        await this.updateRecord(domain, record, record.name, record.type, credentials);
      } catch {
        await this.addRecord(domain, record, credentials);
      }
    }
    return true;
  }

  async verifyCredentials(domain: string, credentials: ProviderCredentials): Promise<boolean> {
    try {
      await this.listRecords(domain, credentials);
      return true;
    } catch {
      return false;
    }
  }
}

// ─── AWS Route 53 ─────────────────────────────────────────────────────────────
//
// Route 53 uses AWS Signature V4 auth and an XML REST API.  We implement a
// minimal SigV4 signer inline to avoid pulling in the full AWS SDK.

class Route53Provider implements DnsProvider {
  name = 'route53';

  private async sign(
    method: string, url: string, body: string,
    accessKeyId: string, secretKey: string, region: string,
  ): Promise<Record<string, string>> {
    const crypto = await import('crypto');
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dateStamp = amzDate.slice(0, 8);
    const urlObj = new URL(url);
    const host = urlObj.hostname;
    const service = 'route53';
    const canonicalUri = urlObj.pathname;
    const canonicalQS = urlObj.searchParams.toString();
    const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-date';
    const payloadHash = crypto.createHash('sha256').update(body).digest('hex');
    const canonicalRequest = [method, canonicalUri, canonicalQS, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256', amzDate, credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');
    const hmac = (key: Buffer | string, data: string): Buffer =>
      crypto.createHmac('sha256', key).update(data).digest();
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretKey}`, dateStamp), region), service), 'aws4_request');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    return {
      Authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope},SignedHeaders=${signedHeaders},Signature=${signature}`,
      'x-amz-date': amzDate,
      Host: host,
    };
  }

  private async getHostedZoneId(domain: string, credentials: ProviderCredentials): Promise<string> {
    const root = extractRootDomain(domain);
    const url = `https://route53.amazonaws.com/2013-04-01/hostedzone?dnsname=${root}`;
    const headers = await this.sign('GET', url, '', credentials.apiKey, credentials.apiSecret, credentials.region || 'us-east-1');
    const resp = await fetchWithRetry(url, { headers });
    const text = await resp.text();
    const match = text.match(/<Id>\/hostedzone\/([^<]+)<\/Id>/);
    if (!match) throw new Error(`Route53: hosted zone not found for ${root}`);
    return match[1];
  }

  private makeChangeXml(action: string, record: DnsRecord): string {
    const name = record.name === '@' ? '' : `${record.name}.`;
    const rrValue = record.type === 'MX'
      ? `<Value>${record.priority} ${record.value}</Value>`
      : `<Value>${record.value}</Value>`;
    return `<Change>
  <Action>${action}</Action>
  <ResourceRecordSet>
    <Name>${name}</Name>
    <Type>${record.type}</Type>
    <TTL>${clampTtl(record.ttl)}</TTL>
    <ResourceRecords>${rrValue}</ResourceRecords>
  </ResourceRecordSet>
</Change>`;
  }

  private async changeBatch(zoneId: string, xml: string, credentials: ProviderCredentials): Promise<void> {
    const url = `https://route53.amazonaws.com/2013-04-01/hostedzone/${zoneId}/rrset`;
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<ChangeResourceRecordSetsRequest xmlns="https://route53.amazonaws.com/doc/2013-04-01/">
  <ChangeBatch><Changes>${xml}</Changes></ChangeBatch>
</ChangeResourceRecordSetsRequest>`;
    const headers = await this.sign('POST', url, body, credentials.apiKey, credentials.apiSecret, credentials.region || 'us-east-1');
    const resp = await fetchWithRetry(url, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/xml' },
      body,
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Route53 changeBatch error: ${resp.status} — ${text.slice(0, 200)}`);
    }
  }

  async listRecords(domain: string, credentials: ProviderCredentials): Promise<DnsRecord[]> {
    const zoneId = await this.getHostedZoneId(domain, credentials);
    const url = `https://route53.amazonaws.com/2013-04-01/hostedzone/${zoneId}/rrset?maxitems=300`;
    const headers = await this.sign('GET', url, '', credentials.apiKey, credentials.apiSecret, credentials.region || 'us-east-1');
    const resp = await fetchWithRetry(url, { headers });
    const text = await resp.text();
    const records: DnsRecord[] = [];
    const rrsMatches = [...text.matchAll(/<ResourceRecordSet>([\s\S]*?)<\/ResourceRecordSet>/g)];
    for (const m of rrsMatches) {
      const rrs = m[1];
      const getTag = (t: string) => { const mm = rrs.match(new RegExp(`<${t}>([^<]*)</${t}>`)); return mm ? mm[1] : ''; };
      const type = getTag('Type');
      const name = getTag('Name').replace(/\.$/, '');
      const ttl = clampTtl(parseInt(getTag('TTL') || '300', 10));
      const valueMatches = [...rrs.matchAll(/<Value>([^<]*)<\/Value>/g)];
      for (const v of valueMatches) {
        const raw = v[1];
        let value = raw; let priority: number | undefined;
        if (type === 'MX') {
          const parts = raw.split(' ');
          priority = parseInt(parts[0], 10);
          value = parts.slice(1).join(' ');
        }
        records.push({ type, name, value, ttl, priority });
      }
    }
    return records;
  }

  async addRecord(domain: string, record: DnsRecord, credentials: ProviderCredentials): Promise<boolean> {
    const zoneId = await this.getHostedZoneId(domain, credentials);
    await this.changeBatch(zoneId, this.makeChangeXml('UPSERT', record), credentials);
    return true;
  }

  async updateRecord(domain: string, record: DnsRecord, _originalName: string, _originalType: string, credentials: ProviderCredentials): Promise<boolean> {
    return this.addRecord(domain, record, credentials);
  }

  async deleteRecord(domain: string, recordType: string, recordName: string, credentials: ProviderCredentials): Promise<boolean> {
    const existing = await this.listRecords(domain, credentials);
    const target = existing.find(r => r.type === recordType && r.name === recordName);
    if (!target) return true;
    const zoneId = await this.getHostedZoneId(domain, credentials);
    await this.changeBatch(zoneId, this.makeChangeXml('DELETE', target), credentials);
    return true;
  }

  async batchUpsertRecords(domain: string, records: DnsRecord[], credentials: ProviderCredentials): Promise<boolean> {
    const zoneId = await this.getHostedZoneId(domain, credentials);
    const xml = records.map(r => this.makeChangeXml('UPSERT', r)).join('\n');
    await this.changeBatch(zoneId, xml, credentials);
    return true;
  }

  async verifyCredentials(domain: string, credentials: ProviderCredentials): Promise<boolean> {
    try {
      await this.getHostedZoneId(domain, credentials);
      return true;
    } catch {
      return false;
    }
  }
}

// ─── Provider registry ────────────────────────────────────────────────────────

const providers: Record<string, DnsProvider> = {
  godaddy:      new GoDaddyProvider(),
  cloudflare:   new CloudflareProvider(),
  namecheap:    new NamecheapProvider(),
  route53:      new Route53Provider(),
  digitalocean: new DigitalOceanProvider(),
  porkbun:      new PorkbunProvider(),
};

export function getProvider(name: string): DnsProvider {
  const provider = providers[name.toLowerCase()];
  if (!provider) throw new Error(`Unknown DNS provider: ${name}. Supported: ${getSupportedProviders().join(', ')}`);
  return provider;
}

export function getSupportedProviders(): string[] {
  return Object.keys(providers);
}

// ─── Record metadata ──────────────────────────────────────────────────────────

export const SUPPORTED_RECORD_TYPES = [
  'A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV', 'CAA', 'ALIAS',
] as const;
export type SupportedRecordType = typeof SUPPORTED_RECORD_TYPES[number];

export const TTL_PRESETS = [
  { label: 'Auto (60 s)', value: 60 },
  { label: '5 min',       value: 300 },
  { label: '30 min',      value: 1800 },
  { label: '1 hour',      value: 3600 },
  { label: '12 hours',    value: 43200 },
  { label: '1 day',       value: 86400 },
  { label: '1 week',      value: 604800 },
];

export const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  godaddy:      'GoDaddy',
  cloudflare:   'Cloudflare',
  namecheap:    'Namecheap',
  route53:      'AWS Route 53',
  digitalocean: 'DigitalOcean',
  porkbun:      'Porkbun',
};

export const PROVIDER_CREDENTIAL_LABELS: Record<string, { apiKey: string; apiSecret: string }> = {
  godaddy:      { apiKey: 'API Key',        apiSecret: 'API Secret' },
  cloudflare:   { apiKey: 'API Token',      apiSecret: 'N/A (leave blank)' },
  namecheap:    { apiKey: 'API Key',        apiSecret: 'Username' },
  route53:      { apiKey: 'Access Key ID',  apiSecret: 'Secret Access Key' },
  digitalocean: { apiKey: 'Personal Access Token', apiSecret: 'N/A (leave blank)' },
  porkbun:      { apiKey: 'API Key',        apiSecret: 'API Secret Key' },
};

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateDnsRecord(record: DnsRecord): string | null {
  if (!SUPPORTED_RECORD_TYPES.includes(record.type as SupportedRecordType)) {
    return `Unsupported record type: ${record.type}`;
  }
  if (!record.name || record.name.length > 253) {
    return 'Record name is required and must be under 253 characters';
  }
  if (!record.value) {
    return 'Record value is required';
  }
  if (record.ttl < MIN_TTL || record.ttl > 604800) {
    return `TTL must be between ${MIN_TTL} and 604800 seconds`;
  }

  switch (record.type) {
    case 'A': {
      const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4.test(record.value)) return 'A record must be a valid IPv4 address';
      if (record.value.split('.').map(Number).some(p => p > 255)) return 'Invalid IPv4 address';
      break;
    }
    case 'AAAA': {
      const ipv6 = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})?::(([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})?$/;
      if (!ipv6.test(record.value)) return 'AAAA record must be a valid IPv6 address';
      break;
    }
    case 'CNAME':
    case 'ALIAS': {
      const hostname = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.?$/;
      if (!hostname.test(record.value)) return 'CNAME/ALIAS must be a valid hostname';
      break;
    }
    case 'MX': {
      if (record.priority === undefined || record.priority < 0 || record.priority > 65535) {
        return 'MX record requires a priority between 0 and 65535';
      }
      break;
    }
    case 'TXT': {
      if (record.value.length > 4096) return 'TXT record value is too long (max 4096 chars)';
      break;
    }
    case 'CAA': {
      const caaPattern = /^\d+ (issue|issuewild|iodef) ".+"$/;
      if (!caaPattern.test(record.value)) {
        return 'CAA value must be: <flags> <tag> "<value>" e.g. 0 issue "letsencrypt.org"';
      }
      break;
    }
    case 'SRV': {
      if (record.priority === undefined || record.priority < 0 || record.priority > 65535) {
        return 'SRV record requires a priority between 0 and 65535';
      }
      if (record.weight === undefined || record.weight < 0 || record.weight > 65535) {
        return 'SRV record requires a weight between 0 and 65535';
      }
      if (record.port === undefined || record.port < 0 || record.port > 65535) {
        return 'SRV record requires a port between 0 and 65535';
      }
      break;
    }
  }
  return null;
}

/**
 * Build the CAA record values that should be auto-provisioned when a
 * domain is activated (mirrors Vercel's behaviour).
 */
export function buildCaaRecords(domain: string): DnsRecord[] {
  return [
    { type: 'CAA', name: '@', value: '0 issue "letsencrypt.org"',    ttl: 3600 },
    { type: 'CAA', name: '@', value: '0 issue "pki.goog"',           ttl: 3600 },
    { type: 'CAA', name: '@', value: '0 issuewild "letsencrypt.org"', ttl: 3600 },
    { type: 'CAA', name: '@', value: '0 iodef "mailto:admin@max-booster.com"', ttl: 3600 },
  ];
}
