/**
 * dns-node — Zone Store.
 *
 * Loads zone data from a JSON file (dns-node/data/zone.json by default).
 * Can also pull a fresh copy from the primary server's HTTP API at a
 * configurable interval (ZONE_SYNC_URL + ZONE_SYNC_INTERVAL_S).
 *
 * Query interface:
 *   resolve(name, type) → DnsRecord[]   (answers for exact name + wildcard)
 *   getSOA()           → DnsRecord      (zone SOA)
 *   getNS()            → DnsRecord[]    (zone NS set)
 *   isAuthoritative(name) → boolean
 */

import fs   from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import http  from 'node:http';
import { ZoneData, ZoneRecord, DnsRecord, TYPE, CLASS_IN } from './types.js';
import {
  rdataA, rdataAAAA, rdataName, rdataSOA,
  rdataTXT, rdataMX, rdataCAA,
} from './packet.js';

// ── Config ─────────────────────────────────────────────────────────────────

const ZONE_FILE         = process.env.ZONE_FILE         || path.join(process.cwd(), 'dns-node', 'data', 'zone.json');
const ZONE_SYNC_URL     = process.env.ZONE_SYNC_URL     || '';    // pull from primary
const ZONE_SYNC_INTERVAL = parseInt(process.env.ZONE_SYNC_INTERVAL_S || '120') * 1000;

// ── State ──────────────────────────────────────────────────────────────────

let zone: ZoneData    = { domain: '', serial: 0, records: [] };
let compiled: Map<string, DnsRecord[]> = new Map();  // "name|type" → records
let zoneLoaded        = false;

// ── Load ───────────────────────────────────────────────────────────────────

function typeCode(typeName: string): number {
  return TYPE[typeName.toUpperCase()] ?? 0;
}

function buildRdata(rec: ZoneRecord): Buffer | null {
  const v = Array.isArray(rec.value) ? rec.value[0] : rec.value;
  switch (rec.type.toUpperCase()) {
    case 'A':    return rdataA(v);
    case 'AAAA': return rdataAAAA(v);
    case 'NS':
    case 'CNAME':
      return rdataName(v);
    case 'SOA':  return rdataSOA(v);
    case 'TXT':  return rdataTXT(v);
    case 'MX':   return rdataMX(v, rec.priority ?? 10);
    case 'CAA':  return rdataCAA(v);
    default:     return null;
  }
}

function compile(data: ZoneData): Map<string, DnsRecord[]> {
  const map = new Map<string, DnsRecord[]>();
  const domain = data.domain.toLowerCase();

  for (const rec of data.records) {
    const rdata = buildRdata(rec);
    if (!rdata) continue;

    const rawName = rec.name === '@' ? domain : (rec.name === '*' ? `*.${domain}` : `${rec.name}.${domain}`);
    const key = `${rawName.toLowerCase()}|${rec.type.toUpperCase()}`;

    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push({
      name:  rawName,
      type:  typeCode(rec.type),
      class: CLASS_IN,
      ttl:   rec.ttl,
      rdata,
    });
  }

  return map;
}

export function loadZoneFromFile(): void {
  try {
    const raw  = fs.readFileSync(ZONE_FILE, 'utf8');
    const data: ZoneData = JSON.parse(raw);
    zone     = data;
    compiled = compile(data);
    zoneLoaded = true;
    console.log(`[zone] Loaded ${data.records.length} records for ${data.domain} (serial=${data.serial})`);
  } catch (err: any) {
    console.error(`[zone] Failed to load ${ZONE_FILE}: ${err.message}`);
  }
}

async function fetchZoneFromPrimary(): Promise<void> {
  if (!ZONE_SYNC_URL) return;
  return new Promise((resolve) => {
    const mod = ZONE_SYNC_URL.startsWith('https') ? https : http;
    mod.get(ZONE_SYNC_URL, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try {
          const raw  = Buffer.concat(chunks).toString('utf8');
          const data: ZoneData = JSON.parse(raw);
          if (data.serial > zone.serial) {
            zone     = data;
            compiled = compile(data);
            console.log(`[zone] Synced from primary: serial=${data.serial}`);
            fs.writeFileSync(ZONE_FILE, raw, 'utf8'); // cache locally
          }
        } catch (err: any) {
          console.error(`[zone] Sync parse error: ${err.message}`);
        }
        resolve();
      });
      res.on('error', () => resolve());
    }).on('error', () => resolve());
  });
}

export async function initZone(): Promise<void> {
  loadZoneFromFile();

  // Try to sync from primary on startup
  if (ZONE_SYNC_URL) {
    await fetchZoneFromPrimary();
  }

  // Periodic sync
  if (ZONE_SYNC_URL && ZONE_SYNC_INTERVAL > 0) {
    setInterval(() => fetchZoneFromPrimary(), ZONE_SYNC_INTERVAL);
  }
}

// ── Query ──────────────────────────────────────────────────────────────────

/** Normalize a query name to compare against zone domain. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/\.$/, '');
}

export function isAuthoritative(name: string): boolean {
  if (!zoneLoaded) return false;
  const n = normalize(name);
  const d = zone.domain.toLowerCase();
  return n === d || n.endsWith(`.${d}`);
}

/**
 * Resolve records for a given name and type.
 * Falls back to wildcard (*.domain) if no exact match.
 */
export function resolveRecords(name: string, typeName: string): DnsRecord[] {
  const n = normalize(name);
  const t = typeName.toUpperCase();

  // Exact match
  const key = `${n}|${t}`;
  if (compiled.has(key)) return compiled.get(key)!;

  // Wildcard match — strip leftmost label and try *.domain
  const domain = zone.domain.toLowerCase();
  const parts  = n.split('.');
  if (parts.length > domain.split('.').length) {
    const wildcardKey = `*.${domain}|${t}`;
    const wc = compiled.get(wildcardKey);
    if (wc) {
      // Return records with the original queried name substituted in
      return wc.map(rr => ({ ...rr, name: name }));
    }
  }

  return [];
}

export function getSOA(): DnsRecord | null {
  const key = `${zone.domain.toLowerCase()}|SOA`;
  return compiled.get(key)?.[0] ?? null;
}

export function getNS(): DnsRecord[] {
  const key = `${zone.domain.toLowerCase()}|NS`;
  return compiled.get(key) ?? [];
}

export function getDomain(): string {
  return zone.domain;
}

export function getSerial(): number {
  return zone.serial;
}

export function reloadZone(): void {
  loadZoneFromFile();
}
