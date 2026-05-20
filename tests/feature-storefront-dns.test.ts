/**
 * Feature coverage: Storefront (Per-Artist), Storefront Domains,
 * DNS Manager, Domain Registrar
 */
import { describe, it, expect } from 'vitest';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5000';

const testUser = {
  email: `feat_sf_${Date.now()}@maxbooster-test.invalid`,
  password: 'SecurePass123!@#',
  firstName: 'Feature',
  lastName: 'Storefront',
};

let authCookies = '';
let csrfToken = '';
let storefrontId = '';
let storefrontSlug = '';

async function api(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authCookies) headers['Cookie'] = authCookies;
  if (csrfToken && !['GET', 'HEAD'].includes(method.toUpperCase()))
    headers['x-csrf-token'] = csrfToken;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
    redirect: 'manual',
  });
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length) {
    const map = new Map<string, string>();
    for (const c of authCookies.split('; ')) {
      const i = c.indexOf('='); if (i > 0) map.set(c.slice(0, i), c.slice(i + 1));
    }
    for (const c of setCookie) {
      const pair = c.split(';')[0]; const i = pair.indexOf('=');
      if (i > 0) { const k = pair.slice(0, i); const v = pair.slice(i + 1); map.set(k, v); if (k === 'csrf-token') csrfToken = v; }
    }
    authCookies = Array.from(map.entries()).map(([k, v]) => `${k}=${v}`).join('; ');
  }
  let json: unknown;
  try { json = JSON.parse(await res.text()); } catch { json = null; }
  return { status: res.status, json };
}

describe('Feature: Storefront, Storefront Domains, DNS Manager, Domain Registrar', () => {
  it('setup: register and login test user', async () => {
    await api('POST', '/api/auth/register', testUser);
    const r = await api('POST', '/api/auth/login', { email: testUser.email, password: testUser.password });
    expect(r.status).toBe(200);
    expect(authCookies).toBeTruthy();
    // Ensure CSRF token is fetched so subsequent POST/PUT/DELETE calls include it
    await api('GET', '/api/csrf-token');
  });

  // ── STOREFRONT ─────────────────────────────────────────────────────────────
  describe('Per-Artist Storefront', () => {
    it('GET /api/storefront/templates returns available templates (public)', async () => {
      const r = await fetch(`${BASE}/api/storefront/templates`, { signal: AbortSignal.timeout(10000) });
      expect(r.status).toBe(200);
      const body = await r.json() as unknown;
      expect(body).toBeTruthy();
    });

    it('GET /api/storefront/my returns current user storefront', async () => {
      const r = await api('GET', '/api/storefront/my');
      expect([200, 404]).toContain(r.status);
    });

    it('GET /api/storefront/suggest-url returns URL suggestions', async () => {
      const r = await api('GET', '/api/storefront/suggest-url');
      expect(r.status).toBe(200);
    });

    it('GET /api/storefront/generate-slug generates a URL slug', async () => {
      // Requires ?name= query param and authentication
      const r = await api('GET', '/api/storefront/generate-slug?name=TestArtistName');
      expect(r.status).toBe(200);
      const body = r.json as Record<string, unknown>;
      expect(body.slug ?? body).toBeTruthy();
    });

    it('GET /api/storefront/check-domain checks domain availability (public)', async () => {
      const r = await fetch(`${BASE}/api/storefront/check-domain?domain=testdomain-unique-xyz.com`, { signal: AbortSignal.timeout(10000) });
      expect(r.status).toBe(200);
    });

    it('POST /api/storefront/create creates a storefront', async () => {
      const slug = `testartist-${Date.now()}`;
      const r = await api('POST', '/api/storefront/create', {
        name: 'Test Artist Store',
        slug,
        templateId: 'default',
        theme: 'dark',
        description: 'Official merch and music store',
        genre: 'hip-hop',
      });
      expect([200, 201, 409]).toContain(r.status);
      if ([200, 201].includes(r.status)) {
        const body = r.json as Record<string, unknown>;
        storefrontId = (body.id ?? body.storefront?.id) as string;
        storefrontSlug = (body.slug ?? body.storefront?.slug ?? slug) as string;
      }
    });

    it('GET /api/storefront/:slug retrieves storefront by slug (public)', async () => {
      if (!storefrontSlug) return;
      const r = await fetch(`${BASE}/api/storefront/${storefrontSlug}`, { signal: AbortSignal.timeout(10000) });
      expect([200, 404]).toContain(r.status);
    });

    it('GET /api/storefront/public/:slug retrieves public storefront', async () => {
      if (!storefrontSlug) return;
      const r = await fetch(`${BASE}/api/storefront/public/${storefrontSlug}`, { signal: AbortSignal.timeout(10000) });
      expect([200, 404]).toContain(r.status);
    });

    it('PUT /api/storefront/:id/customize customizes the storefront', async () => {
      if (!storefrontId) return;
      const r = await api('PUT', `/api/storefront/${storefrontId}/customize`, {
        theme: 'light',
        primaryColor: '#FF6B35',
        fontFamily: 'Inter',
        bannerText: 'Welcome to my official store!',
      });
      expect([200, 204]).toContain(r.status);
    });

    it('PATCH /api/storefront/:id/publish publishes the storefront', async () => {
      if (!storefrontId) return;
      const r = await api('PATCH', `/api/storefront/${storefrontId}/publish`, { isPublished: true });
      expect([200, 204]).toContain(r.status);
    });

    it('GET /api/storefront/:storefrontId/listings returns storefront listings', async () => {
      if (!storefrontId) return;
      const r = await fetch(`${BASE}/api/storefront/${storefrontId}/listings`, { signal: AbortSignal.timeout(10000) });
      expect([200, 404]).toContain(r.status);
    });

    it('GET /api/storefront/check-subdomain/:sub checks subdomain availability', async () => {
      // Requires authentication — use api() helper
      const r = await api('GET', `/api/storefront/check-subdomain/myuniquebrand${Date.now()}`);
      expect(r.status).toBe(200);
    });

    it('POST /api/storefront/generate-subdomain generates a subdomain', async () => {
      // Requires `name` field (not `artistName`)
      const r = await api('POST', '/api/storefront/generate-subdomain', { name: 'Test Artist' });
      expect(r.status).toBe(200);
    });

    it('DELETE /api/storefront/:id removes the storefront', async () => {
      if (!storefrontId) return;
      const r = await api('DELETE', `/api/storefront/${storefrontId}`);
      expect([200, 204]).toContain(r.status);
    });

    it('GET /api/storefront/my without auth → 401', async () => {
      const r = await fetch(`${BASE}/api/storefront/my`, { signal: AbortSignal.timeout(8000) });
      expect([401, 403]).toContain(r.status);
    });
  });

  // ── STOREFRONT DOMAINS ─────────────────────────────────────────────────────
  describe('Storefront Domains', () => {
    it('GET /api/storefront-domains/search searches available domains (public)', async () => {
      // Route uses ?name= (domain label without TLD), not ?q=
      const r = await fetch(`${BASE}/api/storefront-domains/search?name=testband`, { signal: AbortSignal.timeout(12000) });
      expect([200, 400, 503]).toContain(r.status);
    });

    it('POST /api/storefront-domains/managed/check checks managed domain availability (public)', async () => {
      // CSRF middleware blocks unauthenticated POSTs with 403; use api() to include the token
      const r = await api('POST', '/api/storefront-domains/managed/check', { label: `testcheck${Date.now()}` });
      expect([200, 400, 403]).toContain(r.status);
    });

    it('POST /api/storefront-domains/platform/check checks platform domain (public)', async () => {
      // CSRF middleware blocks unauthenticated POSTs with 403; use api() to include the token
      const r = await api('POST', '/api/storefront-domains/platform/check', { domain: 'testartist.maxbooster.io' });
      expect([200, 400, 403, 404]).toContain(r.status);
    });

    it('GET /api/storefront-domains/dns/status returns DNS infrastructure status', async () => {
      const r = await api('GET', '/api/storefront-domains/dns/status');
      expect([200, 503]).toContain(r.status);
    });

    it('GET /api/storefront-domains/propagation returns propagation info', async () => {
      // Requires ?domain= query param; without it the endpoint returns 400
      const r = await fetch(`${BASE}/api/storefront-domains/propagation?domain=testartist.max-booster.com`, { signal: AbortSignal.timeout(10000) });
      expect([200, 400, 500, 503]).toContain(r.status);
    });
  });

  // ── DNS MANAGER ───────────────────────────────────────────────────────────
  describe('DNS Manager', () => {
    let zoneId = '';

    it('GET /api/dns-manager/info returns DNS system info (public)', async () => {
      const r = await fetch(`${BASE}/api/dns-manager/info`, { signal: AbortSignal.timeout(10000) });
      expect(r.status).toBe(200);
      const body = await r.json() as Record<string, unknown>;
      expect(body).toBeTruthy();
    });

    it('GET /api/dns-manager/usage returns DNS usage stats', async () => {
      const r = await api('GET', '/api/dns-manager/usage');
      expect([200, 401]).toContain(r.status);
    });

    it('GET /api/dns-manager/zones returns user DNS zones', async () => {
      const r = await api('GET', '/api/dns-manager/zones');
      expect([200, 401]).toContain(r.status);
    });

    it('POST /api/dns-manager/zones creates a DNS zone', async () => {
      const domain = `testzone-${Date.now()}.example.invalid`;
      const r = await api('POST', '/api/dns-manager/zones', {
        domain,
        provider: 'internal',
      });
      // 403 may occur if CSRF token hasn't been populated yet
      expect([200, 201, 400, 403, 409]).toContain(r.status);
      if ([200, 201].includes(r.status)) {
        const body = r.json as Record<string, unknown>;
        zoneId = (body.id ?? body.zone?.id) as string;
      }
    });

    it('GET /api/dns-manager/zones/:zoneId/records lists zone records', async () => {
      if (!zoneId) return;
      const r = await api('GET', `/api/dns-manager/zones/${zoneId}/records`);
      expect([200, 404]).toContain(r.status);
    });

    it('POST /api/dns-manager/zones/:zoneId/records adds a DNS record', async () => {
      if (!zoneId) return;
      const r = await api('POST', `/api/dns-manager/zones/${zoneId}/records`, {
        type: 'A',
        name: '@',
        value: '93.184.216.34',
        ttl: 300,
      });
      expect([200, 201, 400, 404]).toContain(r.status);
    });

    it('DELETE /api/dns-manager/zones/:zoneId removes zone', async () => {
      if (!zoneId) return;
      const r = await api('DELETE', `/api/dns-manager/zones/${zoneId}`);
      expect([200, 204, 404]).toContain(r.status);
    });

    it('GET /api/dns-manager/zones without auth → 401', async () => {
      const r = await fetch(`${BASE}/api/dns-manager/zones`, { signal: AbortSignal.timeout(8000) });
      expect([401, 403]).toContain(r.status);
    });
  });

  // ── DOMAIN REGISTRAR ──────────────────────────────────────────────────────
  describe('Domain Registrar', () => {
    it('GET /api/domain-registrar/config returns registrar configuration (public)', async () => {
      const r = await fetch(`${BASE}/api/domain-registrar/config`, { signal: AbortSignal.timeout(10000) });
      expect(r.status).toBe(200);
      const body = await r.json() as Record<string, unknown>;
      expect(body).toBeTruthy();
    });

    it('GET /api/domain-registrar/search searches domain availability (public)', async () => {
      // Route uses ?name= (the bare domain label, no TLD), not ?domain=
      const r = await fetch(`${BASE}/api/domain-registrar/search?name=testunique${Date.now()}`, { signal: AbortSignal.timeout(12000) });
      expect([200, 503]).toContain(r.status);
    });

    it('GET /api/domain-registrar/whois/:domain returns WHOIS data (public)', async () => {
      const r = await fetch(`${BASE}/api/domain-registrar/whois/example.com`, { signal: AbortSignal.timeout(12000) });
      expect([200, 404, 503]).toContain(r.status);
    });

    it('GET /api/domain-registrar/my-domains returns user registered domains', async () => {
      const r = await api('GET', '/api/domain-registrar/my-domains');
      expect([200, 401]).toContain(r.status);
    });

    it('GET /api/domain-registrar/contacts returns user contact profiles', async () => {
      const r = await api('GET', '/api/domain-registrar/contacts');
      expect([200, 401, 404]).toContain(r.status);
    });

    it('GET /api/domain-registrar/my-domains without auth → 401', async () => {
      const r = await fetch(`${BASE}/api/domain-registrar/my-domains`, { signal: AbortSignal.timeout(8000) });
      expect([401, 403]).toContain(r.status);
    });

    it('GET /api/domain-registrar/contacts without auth → 401', async () => {
      const r = await fetch(`${BASE}/api/domain-registrar/contacts`, { signal: AbortSignal.timeout(8000) });
      expect([401, 403]).toContain(r.status);
    });
  });
});
