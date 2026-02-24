import { logger } from '../logger.js';

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
}

const GODADDY_API_BASE = 'https://api.godaddy.com';
const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';

function extractRootDomain(domain: string): string {
  const parts = domain.split('.');
  if (parts.length >= 2) return parts.slice(-2).join('.');
  return domain;
}

function extractSubdomainPart(domain: string): string {
  const parts = domain.split('.');
  if (parts.length > 2) return parts.slice(0, -2).join('.');
  return '@';
}

class GoDaddyProvider implements DnsProvider {
  name = 'godaddy';

  private authHeader(creds: ProviderCredentials): string {
    return `sso-key ${creds.apiKey}:${creds.apiSecret}`;
  }

  async listRecords(domain: string, credentials: ProviderCredentials): Promise<DnsRecord[]> {
    const rootDomain = extractRootDomain(domain);
    const url = `${GODADDY_API_BASE}/v1/domains/${rootDomain}/records`;
    const resp = await fetch(url, {
      headers: {
        Authorization: this.authHeader(credentials),
        Accept: 'application/json',
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      logger.error('GoDaddy listRecords error', { status: resp.status, body: text });
      throw new Error(`GoDaddy API error: ${resp.status}`);
    }

    const data = await resp.json() as Array<{ type: string; name: string; data: string; ttl: number; priority?: number; port?: number; weight?: number; protocol?: string; service?: string }>;
    return data.map((r) => ({
      type: r.type,
      name: r.name,
      value: r.data,
      ttl: r.ttl,
      priority: r.priority,
      port: r.port,
      weight: r.weight,
      protocol: r.protocol,
      service: r.service,
    }));
  }

  async addRecord(domain: string, record: DnsRecord, credentials: ProviderCredentials): Promise<boolean> {
    const rootDomain = extractRootDomain(domain);
    const url = `${GODADDY_API_BASE}/v1/domains/${rootDomain}/records`;
    const body: Record<string, unknown> = {
      type: record.type,
      name: record.name,
      data: record.value,
      ttl: record.ttl,
    };
    if (record.priority !== undefined) body.priority = record.priority;
    if (record.port !== undefined) body.port = record.port;
    if (record.weight !== undefined) body.weight = record.weight;
    if (record.protocol) body.protocol = record.protocol;
    if (record.service) body.service = record.service;

    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: this.authHeader(credentials),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify([body]),
    });

    if (!resp.ok) {
      const text = await resp.text();
      logger.error('GoDaddy addRecord error', { status: resp.status, body: text });
      throw new Error(`GoDaddy API error: ${resp.status}`);
    }
    return true;
  }

  async updateRecord(domain: string, record: DnsRecord, originalName: string, originalType: string, credentials: ProviderCredentials): Promise<boolean> {
    const rootDomain = extractRootDomain(domain);
    if (originalName !== record.name || originalType !== record.type) {
      await this.deleteRecord(domain, originalType, originalName, credentials).catch(() => {});
      return this.addRecord(domain, record, credentials);
    }
    const url = `${GODADDY_API_BASE}/v1/domains/${rootDomain}/records/${originalType}/${originalName}`;
    const body: Record<string, unknown> = {
      data: record.value,
      ttl: record.ttl,
    };
    if (record.priority !== undefined) body.priority = record.priority;
    if (record.port !== undefined) body.port = record.port;
    if (record.weight !== undefined) body.weight = record.weight;

    const resp = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: this.authHeader(credentials),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify([body]),
    });

    if (!resp.ok) {
      const text = await resp.text();
      logger.error('GoDaddy updateRecord error', { status: resp.status, body: text });
      throw new Error(`GoDaddy API error: ${resp.status}`);
    }
    return true;
  }

  async deleteRecord(domain: string, recordType: string, recordName: string, credentials: ProviderCredentials): Promise<boolean> {
    const rootDomain = extractRootDomain(domain);
    const url = `${GODADDY_API_BASE}/v1/domains/${rootDomain}/records/${recordType}/${recordName}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: {
        Authorization: this.authHeader(credentials),
        Accept: 'application/json',
      },
    });

    if (!resp.ok) {
      const text = await resp.text();
      logger.error('GoDaddy deleteRecord error', { status: resp.status, body: text });
      throw new Error(`GoDaddy API error: ${resp.status}`);
    }
    return true;
  }

  async batchUpsertRecords(domain: string, records: DnsRecord[], credentials: ProviderCredentials): Promise<boolean> {
    const rootDomain = extractRootDomain(domain);
    const url = `${GODADDY_API_BASE}/v1/domains/${rootDomain}/records`;
    const body = records.map((r) => {
      const rec: Record<string, unknown> = {
        type: r.type,
        name: r.name,
        data: r.value,
        ttl: r.ttl,
      };
      if (r.priority !== undefined) rec.priority = r.priority;
      if (r.port !== undefined) rec.port = r.port;
      if (r.weight !== undefined) rec.weight = r.weight;
      if (r.protocol) rec.protocol = r.protocol;
      if (r.service) rec.service = r.service;
      return rec;
    });

    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: this.authHeader(credentials),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      logger.error('GoDaddy batchUpsert error', { status: resp.status, body: text });
      throw new Error(`GoDaddy API error: ${resp.status}`);
    }
    return true;
  }

  async verifyCredentials(domain: string, credentials: ProviderCredentials): Promise<boolean> {
    const rootDomain = extractRootDomain(domain);
    const url = `${GODADDY_API_BASE}/v1/domains/${rootDomain}`;
    const resp = await fetch(url, {
      headers: {
        Authorization: this.authHeader(credentials),
        Accept: 'application/json',
      },
    });
    return resp.ok;
  }
}

class CloudflareProvider implements DnsProvider {
  name = 'cloudflare';

  private headers(creds: ProviderCredentials): Record<string, string> {
    return {
      Authorization: `Bearer ${creds.apiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async getZoneId(domain: string, credentials: ProviderCredentials): Promise<string> {
    const rootDomain = extractRootDomain(domain);
    const url = `${CLOUDFLARE_API_BASE}/zones?name=${rootDomain}`;
    const resp = await fetch(url, { headers: this.headers(credentials) });
    if (!resp.ok) throw new Error(`Cloudflare zones error: ${resp.status}`);
    const data = await resp.json() as { result: Array<{ id: string }> };
    if (!data.result?.length) throw new Error(`Zone not found for ${rootDomain}`);
    return data.result[0].id;
  }

  async listRecords(domain: string, credentials: ProviderCredentials): Promise<DnsRecord[]> {
    const zoneId = await this.getZoneId(domain, credentials);
    const url = `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records?per_page=500`;
    const resp = await fetch(url, { headers: this.headers(credentials) });
    if (!resp.ok) throw new Error(`Cloudflare listRecords error: ${resp.status}`);
    const data = await resp.json() as { result: Array<{ type: string; name: string; content: string; ttl: number; priority?: number }> };
    return data.result.map((r) => ({
      type: r.type,
      name: r.name,
      value: r.content,
      ttl: r.ttl,
      priority: r.priority,
    }));
  }

  async addRecord(domain: string, record: DnsRecord, credentials: ProviderCredentials): Promise<boolean> {
    const zoneId = await this.getZoneId(domain, credentials);
    const url = `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records`;
    const body: Record<string, unknown> = {
      type: record.type,
      name: record.name,
      content: record.value,
      ttl: record.ttl,
    };
    if (record.priority !== undefined) body.priority = record.priority;
    const resp = await fetch(url, {
      method: 'POST',
      headers: this.headers(credentials),
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Cloudflare addRecord error: ${resp.status}`);
    return true;
  }

  async updateRecord(domain: string, record: DnsRecord, originalName: string, originalType: string, credentials: ProviderCredentials): Promise<boolean> {
    const zoneId = await this.getZoneId(domain, credentials);
    const listUrl = `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records?type=${originalType}&name=${originalName}`;
    const listResp = await fetch(listUrl, { headers: this.headers(credentials) });
    if (!listResp.ok) throw new Error(`Cloudflare find record error: ${listResp.status}`);
    const listData = await listResp.json() as { result: Array<{ id: string }> };
    if (!listData.result?.length) throw new Error('Record not found for update');
    const recordId = listData.result[0].id;

    const url = `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records/${recordId}`;
    const body: Record<string, unknown> = {
      type: record.type,
      name: record.name,
      content: record.value,
      ttl: record.ttl,
    };
    if (record.priority !== undefined) body.priority = record.priority;
    const resp = await fetch(url, {
      method: 'PUT',
      headers: this.headers(credentials),
      body: JSON.stringify(body),
    });
    if (!resp.ok) throw new Error(`Cloudflare updateRecord error: ${resp.status}`);
    return true;
  }

  async deleteRecord(domain: string, recordType: string, recordName: string, credentials: ProviderCredentials): Promise<boolean> {
    const zoneId = await this.getZoneId(domain, credentials);
    const listUrl = `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records?type=${recordType}&name=${recordName}`;
    const listResp = await fetch(listUrl, { headers: this.headers(credentials) });
    if (!listResp.ok) throw new Error(`Cloudflare find record error: ${listResp.status}`);
    const listData = await listResp.json() as { result: Array<{ id: string }> };
    if (!listData.result?.length) throw new Error('Record not found for delete');
    const recordId = listData.result[0].id;

    const url = `${CLOUDFLARE_API_BASE}/zones/${zoneId}/dns_records/${recordId}`;
    const resp = await fetch(url, {
      method: 'DELETE',
      headers: this.headers(credentials),
    });
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

const providers: Record<string, DnsProvider> = {
  godaddy: new GoDaddyProvider(),
  cloudflare: new CloudflareProvider(),
};

export function getProvider(name: string): DnsProvider {
  const provider = providers[name];
  if (!provider) throw new Error(`Unknown DNS provider: ${name}`);
  return provider;
}

export function getSupportedProviders(): string[] {
  return Object.keys(providers);
}

export const SUPPORTED_RECORD_TYPES = ['A', 'AAAA', 'CNAME', 'MX', 'TXT', 'NS', 'SRV'] as const;
export type SupportedRecordType = typeof SUPPORTED_RECORD_TYPES[number];

export const TTL_PRESETS = [
  { label: 'Auto', value: 1 },
  { label: '1 min', value: 60 },
  { label: '5 min', value: 300 },
  { label: '30 min', value: 1800 },
  { label: '1 hour', value: 3600 },
  { label: '12 hours', value: 43200 },
  { label: '1 day', value: 86400 },
  { label: '1 week', value: 604800 },
];

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
  if (record.ttl < 1 || record.ttl > 604800) {
    return 'TTL must be between 1 and 604800 seconds';
  }

  switch (record.type) {
    case 'A': {
      const ipv4 = /^(\d{1,3}\.){3}\d{1,3}$/;
      if (!ipv4.test(record.value)) return 'A record must be a valid IPv4 address';
      const parts = record.value.split('.').map(Number);
      if (parts.some(p => p > 255)) return 'Invalid IPv4 address';
      break;
    }
    case 'AAAA': {
      const ipv6 = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^(([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})?::(([0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4})?$/;
      if (!ipv6.test(record.value)) return 'AAAA record must be a valid IPv6 address';
      break;
    }
    case 'CNAME': {
      const hostname = /^[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.?$/;
      if (!hostname.test(record.value)) return 'CNAME must be a valid hostname';
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
