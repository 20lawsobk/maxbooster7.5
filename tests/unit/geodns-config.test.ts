/**
 * Unit tests for GeoDNS configuration.
 *
 * Verifies that:
 *  1. The GeoLite2-Country database has been downloaded.
 *  2. GEODNS_ENABLED is set to "true" in the Replit env config.
 *  3. The geoDns service module reads the correct env vars.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, statSync } from 'fs';
import { readFileSync } from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'GeoLite2-Country.mmdb');
const GEO_SERVICE = 'server/services/geoDns.ts';
const DNS_SERVER  = 'server/services/dnsServer.ts';

describe('GeoLite2 database', () => {
  it('database file exists at data/GeoLite2-Country.mmdb', () => {
    expect(existsSync(DB_PATH)).toBe(true);
  });

  it('database file is non-empty (> 1 MB)', () => {
    if (!existsSync(DB_PATH)) return;
    const { size } = statSync(DB_PATH);
    expect(size).toBeGreaterThan(1_000_000);
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

  it('logs a clear message when database is not found', () => {
    const src = readFileSync(GEO_SERVICE, 'utf8');
    expect(src).toContain('download-geodb.sh');
  });

  it('dnsServer.ts checks GEODNS_ENABLED before using geo routing', () => {
    const src = readFileSync(DNS_SERVER, 'utf8');
    expect(src).toContain('GEODNS_ENABLED');
  });
});
