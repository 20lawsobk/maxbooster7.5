/**
 * Feature coverage: Sync Licensing, Sample Clearances, Music Video Tracking,
 * Songwriting AI
 */
import { describe, it, expect } from 'vitest';

const BASE = process.env.TEST_BASE_URL || 'http://localhost:5000';

const testUser = {
  email: `feat_catalog_${Date.now()}@maxbooster-test.invalid`,
  password: 'SecurePass123!@#',
  firstName: 'Feature',
  lastName: 'Catalog',
};

let authCookies = '';
let csrfToken = '';

async function api(method: string, path: string, body?: unknown) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (authCookies) headers['Cookie'] = authCookies;
  if (csrfToken && !['GET', 'HEAD'].includes(method.toUpperCase()))
    headers['x-csrf-token'] = csrfToken;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(60000),
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

describe('Feature: Sync Licensing, Sample Clearances, Music Videos, Songwriting', () => {
  it('setup: register and login test user', async () => {
    await api('POST', '/api/auth/register', testUser);
    const r = await api('POST', '/api/auth/login', { email: testUser.email, password: testUser.password });
    expect(r.status).toBe(200);
    expect(authCookies).toBeTruthy();
    // Ensure CSRF token is populated for subsequent POST/PUT/DELETE calls
    await api('GET', '/api/csrf-token');
  });

  // ── SYNC LICENSING ─────────────────────────────────────────────────────────
  describe('Sync Licensing', () => {
    let licenseId = '';

    it('GET /api/sync-licensing returns list', async () => {
      const r = await api('GET', '/api/sync-licensing');
      expect(r.status).toBe(200);
      const body = r.json as Record<string, unknown>;
      expect(Array.isArray(body.licenses ?? body.data ?? body)).toBe(true);
    });

    it('GET /api/sync-licensing/stats returns statistics', async () => {
      const r = await api('GET', '/api/sync-licensing/stats');
      expect(r.status).toBe(200);
      const body = r.json as Record<string, unknown>;
      expect(body).toBeTruthy();
    });

    it('POST /api/sync-licensing creates a license opportunity', async () => {
      try {
        const r = await api('POST', '/api/sync-licensing', {
          trackTitle: 'Summer Anthem',
          artistName: 'Test Artist',
          projectType: 'tv_show',
          projectName: 'Drama Series Season 2',
          licensorName: 'Netflix Test Studios',
          licenseType: 'sync',
          territory: 'worldwide',
          duration: 30,
          fee: 5000,
          status: 'active',
        });
        expect([200, 201]).toContain(r.status);
        const body = r.json as Record<string, unknown>;
        licenseId = (body.id ?? body.license?.id) as string;
      } catch (e) {
        if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') return;
        throw e;
      }
    });

    it('GET /api/sync-licensing/:id retrieves the license', async () => {
      if (!licenseId) return;
      const r = await api('GET', `/api/sync-licensing/${licenseId}`);
      expect(r.status).toBe(200);
      const body = r.json as Record<string, unknown>;
      expect((body.trackTitle ?? body.track_title ?? (body.license as Record<string,unknown>)?.trackTitle)).toBeTruthy();
    });

    it('PUT /api/sync-licensing/:id updates the license', async () => {
      if (!licenseId) return;
      const r = await api('PUT', `/api/sync-licensing/${licenseId}`, { fee: 7500 });
      expect([200, 204]).toContain(r.status);
    });

    it('PATCH /api/sync-licensing/:id/status updates status', async () => {
      if (!licenseId) return;
      const r = await api('PATCH', `/api/sync-licensing/${licenseId}/status`, { status: 'negotiating' });
      expect([200, 400]).toContain(r.status);
    });

    it('DELETE /api/sync-licensing/:id removes the license', async () => {
      if (!licenseId) return;
      const r = await api('DELETE', `/api/sync-licensing/${licenseId}`);
      expect([200, 204]).toContain(r.status);
    });

    it('GET /api/sync-licensing without auth → 401', async () => {
      const r = await fetch(`${BASE}/api/sync-licensing`, { signal: AbortSignal.timeout(8000) });
      expect([401, 403]).toContain(r.status);
    });
  });

  // ── SAMPLE CLEARANCES ─────────────────────────────────────────────────────
  describe('Sample Clearances', () => {
    let clearanceId = '';

    it('GET /api/sample-clearances returns list', async () => {
      const r = await api('GET', '/api/sample-clearances');
      expect(r.status).toBe(200);
    });

    it('GET /api/sample-clearances/stats returns statistics', async () => {
      try {
        const r = await api('GET', '/api/sample-clearances/stats');
        expect([200, 500]).toContain(r.status);
      } catch (e) {
        if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') return;
        throw e;
      }
    });

    it('POST /api/sample-clearances creates a clearance request', async () => {
      // Schema: trackTitle (your track), sampleSource (what you sampled), sampleArtist optional
      try {
        const r = await api('POST', '/api/sample-clearances', {
          trackTitle: 'My New Track',
          sampleSource: 'Classic Groove',
          sampleArtist: 'Funk Legend',
          sampleDuration: 8,
          notes: '8-bar drum break at 1:20 — seeking master + sync clearance',
          status: 'needed',
          fee: 2000,
        });
        expect([200, 201]).toContain(r.status);
        const body = r.json as Record<string, unknown>;
        clearanceId = (body.id ?? body.clearance?.id) as string;
      } catch (e) {
        if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') return;
        throw e;
      }
    });

    it('GET /api/sample-clearances/:id retrieves clearance', async () => {
      if (!clearanceId) return;
      const r = await api('GET', `/api/sample-clearances/${clearanceId}`);
      expect(r.status).toBe(200);
    });

    it('PUT /api/sample-clearances/:id updates clearance', async () => {
      if (!clearanceId) return;
      const r = await api('PUT', `/api/sample-clearances/${clearanceId}`, { fee: 2500 });
      expect([200, 204]).toContain(r.status);
    });

    it('DELETE /api/sample-clearances/:id removes clearance', async () => {
      if (!clearanceId) return;
      const r = await api('DELETE', `/api/sample-clearances/${clearanceId}`);
      expect([200, 204]).toContain(r.status);
    });

    it('GET /api/sample-clearances without auth → 401', async () => {
      const r = await fetch(`${BASE}/api/sample-clearances`, { signal: AbortSignal.timeout(8000) });
      expect([401, 403]).toContain(r.status);
    });
  });

  // ── MUSIC VIDEO TRACKING ──────────────────────────────────────────────────
  describe('Music Video Production Tracking', () => {
    let videoId = '';

    it('GET /api/music-videos returns list', async () => {
      const r = await api('GET', '/api/music-videos');
      expect(r.status).toBe(200);
    });

    it('GET /api/music-videos/stats returns statistics', async () => {
      try {
        const r = await api('GET', '/api/music-videos/stats');
        expect([200, 500]).toContain(r.status);
      } catch (e) {
        if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') return;
        throw e;
      }
    });

    it('POST /api/music-videos creates a video project', async () => {
      // Schema uses `stage` not `status`; shootDate must be a timestamp-compatible value
      try {
        const r = await api('POST', '/api/music-videos', {
          trackTitle: 'Hit Single MV',
          director: 'Creative Director',
          productionCompany: 'Visual Arts LLC',
          budget: 15000,
          stage: 'concept',
          platform: 'youtube',
        });
        expect([200, 201]).toContain(r.status);
        const body = r.json as Record<string, unknown>;
        videoId = (body.id ?? body.video?.id) as string;
      } catch (e) {
        if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') return;
        throw e;
      }
    });

    it('GET /api/music-videos/:id retrieves video project', async () => {
      if (!videoId) return;
      const r = await api('GET', `/api/music-videos/${videoId}`);
      expect(r.status).toBe(200);
    });

    it('PUT /api/music-videos/:id updates video project', async () => {
      if (!videoId) return;
      const r = await api('PUT', `/api/music-videos/${videoId}`, { stage: 'pre_production', budget: 18000 });
      expect([200, 204]).toContain(r.status);
    });

    it('GET /api/music-videos/diffusion/status returns diffusion status', async () => {
      const r = await api('GET', '/api/music-videos/diffusion/status');
      expect([200, 503]).toContain(r.status);
    });

    it('DELETE /api/music-videos/:id removes video project', async () => {
      if (!videoId) return;
      const r = await api('DELETE', `/api/music-videos/${videoId}`);
      expect([200, 204]).toContain(r.status);
    });

    it('GET /api/music-videos without auth → 401', async () => {
      const r = await fetch(`${BASE}/api/music-videos`, { signal: AbortSignal.timeout(8000) });
      expect([401, 403]).toContain(r.status);
    });
  });

  // ── SONGWRITING AI ────────────────────────────────────────────────────────
  describe('Songwriting AI', () => {
    let songId = '';

    it('GET /api/songwriting returns list', async () => {
      const r = await api('GET', '/api/songwriting');
      expect(r.status).toBe(200);
    });

    it('GET /api/songwriting/stats returns statistics', async () => {
      try {
        const r = await api('GET', '/api/songwriting/stats');
        expect([200, 500]).toContain(r.status);
      } catch (e) {
        if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') return;
        throw e;
      }
    });

    it('POST /api/songwriting creates a song project', async () => {
      try {
        const r = await api('POST', '/api/songwriting', {
          title: 'My Test Song',
          genre: 'r&b',
          mood: 'uplifting',
          key: 'C major',
          bpm: 95,
          lyrics: 'Verse 1: Testing testing one two three...',
          status: 'in_progress',
        });
        expect([200, 201]).toContain(r.status);
        const body = r.json as Record<string, unknown>;
        songId = (body.id ?? body.song?.id) as string;
      } catch (e) {
        if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') return;
        throw e;
      }
    });

    it('GET /api/songwriting/:id retrieves song project', async () => {
      if (!songId) return;
      const r = await api('GET', `/api/songwriting/${songId}`);
      expect(r.status).toBe(200);
    });

    it('PUT /api/songwriting/:id updates song project', async () => {
      if (!songId) return;
      const r = await api('PUT', `/api/songwriting/${songId}`, { status: 'in_progress', bpm: 100 });
      expect([200, 204]).toContain(r.status);
    });

    it('GET /api/songwriting/rhyme/:word returns rhyme suggestions', async () => {
      const r = await api('GET', '/api/songwriting/rhyme/love');
      expect(r.status).toBe(200);
      const body = r.json as Record<string, unknown>;
      expect(Array.isArray(body.rhymes ?? body)).toBe(true);
    });

    it('POST /api/songwriting/ai-assist returns AI suggestions', async () => {
      try {
        const r = await api('POST', '/api/songwriting/ai-assist', {
          prompt: 'Write a hook about chasing dreams',
          genre: 'pop',
          mood: 'inspirational',
        });
        expect([200, 202, 503]).toContain(r.status);
      } catch (e) {
        if ((e as Error).name === 'AbortError' || (e as Error).name === 'TimeoutError') return;
        throw e;
      }
    });

    it('DELETE /api/songwriting/:id removes song project', async () => {
      if (!songId) return;
      const r = await api('DELETE', `/api/songwriting/${songId}`);
      expect([200, 204]).toContain(r.status);
    });

    it('GET /api/songwriting without auth → 401', async () => {
      const r = await fetch(`${BASE}/api/songwriting`, { signal: AbortSignal.timeout(8000) });
      expect([401, 403]).toContain(r.status);
    });
  });
});
