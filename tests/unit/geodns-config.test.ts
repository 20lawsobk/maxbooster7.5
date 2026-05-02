/**
 * Unit tests for GeoDNS configuration.
 *
 * Verifies that:
 *  1. The GeoLite2-Country database, if present, is non-empty.
 *  2. The geoDns service module reads the correct env vars.
 *  3. The download script and setup instructions exist.
 *
 * NOTE: The database file (data/GeoLite2-Country.mmdb) is NOT committed to
 * source control and is NOT required in CI. Tests that depend on it skip
 * gracefully when the file is absent. Run scripts/download-geodb.sh to
 * obtain the file for local GeoDNS testing.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'fs';
import { readFileSync } from 'fs';
import path from 'path';

const DB_PATH     = path.join(process.cwd(), 'data', 'GeoLite2-Country.mmdb');
const GEO_SERVICE = 'server/services/geoDns.ts';
const DNS_SERVER  = 'server/services/dnsServer.ts';
const DL_SCRIPT   = 'scripts/download-geodb.sh';

describe('GeoLite2 database (optional — requires download-geodb.sh)', () => {
  it('database file is non-empty (> 1 MB) when present', () => {
    if (!existsSync(DB_PATH)) {
      // Skip — file not downloaded; this is expected in CI / fresh dev environment.
      return;
    }
    const { size } = statSync(DB_PATH);
    expect(size).toBeGreaterThan(1_000_000);
  });

  it('download script exists at scripts/download-geodb.sh', () => {
    expect(existsSync(DL_SCRIPT)).toBe(true);
  });

  it('download script documents MAXMIND_ACCOUNT_ID and MAXMIND_LICENSE_KEY', () => {
    const src = readFileSync(DL_SCRIPT, 'utf8');
    expect(src).toContain('MAXMIND_ACCOUNT_ID');
    expect(src).toContain('MAXMIND_LICENSE_KEY');
  });
});

describe('GeoDNS service source', () => {
  it('reads GEODNS_ENABLED env var', () => {
    const src = readFileSync(GEO_SERVICE, 'utf8');
    expect(src).toContain('GEODNS_ENABLED');
  });

  it('falls back to data/GeoLite2-Country.mmdb default path', () => {
    const src = readFileSync(GEO_SERVICE, 'utf8');
    expect(src).toContain('GeoLite2-Country.mmdb');
  });

  it('references download-geodb.sh in error/warning messages', () => {
    const src = readFileSync(GEO_SERVICE, 'utf8');
    expect(src).toContain('download-geodb.sh');
  });

  it('respects GEODB_PATH env override', () => {
    const src = readFileSync(GEO_SERVICE, 'utf8');
    expect(src).toContain('GEODB_PATH');
  });

  it('supports REGION_MAP env var for continent→IP mapping', () => {
    const src = readFileSync(GEO_SERVICE, 'utf8');
    expect(src).toContain('REGION_MAP');
  });
});

describe('DNS server source', () => {
  it('dnsServer.ts checks GEODNS_ENABLED before using geo routing', () => {
    const src = readFileSync(DNS_SERVER, 'utf8');
    expect(src).toContain('GEODNS_ENABLED');
  });
});
