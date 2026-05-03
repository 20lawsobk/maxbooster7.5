import { Router, Request, Response } from 'express';
import { db } from '../db';
import { socialAccounts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logger';
import crypto from 'crypto';
import { requireAuth } from '../middleware/auth.js';
import { syncPlatformData } from '../services/socialSyncService';
import { socialOAuth as socialOAuthService } from '../services/socialOAuthService';
import { env } from '../config/env.js';

// ── Timeout-guarded fetch: adds a 15s default signal so no outbound HTTP call
// can hold the event loop indefinitely.  Per-call signal overrides this default.
const timedFetch = (url: string | URL | Request, init: RequestInit = {}): Promise<Response> =>
  fetch(url, { signal: AbortSignal.timeout(15_000), ...init });


const router = Router();

// ── Secret-scrubbing helpers for OAuth error logs.
// OAuth providers commonly accept `client_secret` and `access_token` as URL
// query parameters, so any error log that echoes a URL or upstream JSON body
// can leak credentials. These helpers normalise that risk in one place.
const OAUTH_SECRET_FIELDS = ['access_token', 'refresh_token', 'id_token', 'client_secret'] as const;

function redactOAuthFields(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value;
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const k of OAUTH_SECRET_FIELDS) {
    if (k in out && out[k] != null && out[k] !== '') out[k] = '<redacted>';
  }
  return out;
}

function scrubSecretsFromText(text: string): string {
  if (!text) return text;
  let out = text;
  for (const k of OAUTH_SECRET_FIELDS) {
    // Match `key=<value>` in any URL/query-string form (stops at &, whitespace, quote, or end).
    out = out.replace(new RegExp(`(${k}=)[^&\\s"']+`, 'gi'), `$1<redacted>`);
  }
  return out;
}

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

const PLATFORMS = {
  meta: {
    name: 'Meta (Facebook + Instagram)',
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scope: 'public_profile,email,pages_show_list,pages_read_engagement,business_management,instagram_basic,instagram_content_publish,instagram_manage_comments',
    clientId: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    usePKCE: false,
    responseType: 'code',
    enabled: true,
    multiPlatform: ['facebook', 'instagram'],
  },
  threads: {
    name: 'Threads',
    authUrl: 'https://threads.net/oauth/authorize',
    tokenUrl: 'https://graph.threads.net/oauth/access_token',
    scope: 'threads_basic,threads_content_publish,threads_delete,threads_keyword_search,threads_location_tagging,threads_manage_insights,threads_profile_discovery',
    clientId: process.env.THREADS_APP_ID,
    clientSecret: process.env.THREADS_APP_SECRET,
    // redirectUri must be set explicitly and match exactly what is registered
    // in the Meta developer console under Threads → Valid OAuth Redirect URIs.
    redirectUri: process.env.THREADS_REDIRECT_URI || `${process.env.DOMAIN || process.env.APP_URL || 'https://max-booster.com'}/auth/threads/callback`,
    usePKCE: false,
    responseType: 'code',
    enabled: !!(process.env.THREADS_APP_ID && process.env.THREADS_APP_SECRET),
  },
  tiktok: (() => {
    const env = process.env.TIKTOK_ENV;
    const isSandbox = env === 'sandbox';
    const clientKey = isSandbox
      ? (process.env.TIKTOK_SANDBOX_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY)
      : (process.env.TIKTOK_PROD_CLIENT_KEY || process.env.TIKTOK_CLIENT_KEY);
    const clientSecret = isSandbox
      ? (process.env.TIKTOK_SANDBOX_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET)
      : (process.env.TIKTOK_PROD_CLIENT_SECRET || process.env.TIKTOK_CLIENT_SECRET);
    const scopes = isSandbox
      ? (process.env.TIKTOK_SANDBOX_SCOPES || 'user.info.basic,video.list,video.upload,video.publish')
      : (process.env.TIKTOK_PROD_SCOPES || 'user.info.basic');
    const redirectUri = isSandbox
      ? process.env.TIKTOK_SANDBOX_REDIRECT_URI
      : process.env.TIKTOK_PROD_REDIRECT_URI;
    return {
      name: isSandbox ? 'TikTok (Sandbox)' : 'TikTok',
      authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
      tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
      scope: scopes,
      clientId: clientKey,
      clientSecret: clientSecret,
      clientIdParam: 'client_key',
      usePKCE: false,
      responseType: 'code',
      enabled: !!(clientKey && clientSecret),
      isSandbox,
      redirectUri,
    };
  })(),
  google: {
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    usePKCE: false,
    responseType: 'code',
    accessType: 'offline',
    prompt: 'consent',
    enabled: true,
  },
  youtube: {
    name: 'YouTube',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/yt-analytics.readonly',
    clientId: env.YOUTUBE_CLIENT_ID || env.GOOGLE_CLIENT_ID,
    clientSecret: env.YOUTUBE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET,
    usePKCE: false,
    responseType: 'code',
    accessType: 'offline',
    prompt: 'consent',
    enabled: true,
  },
  googlebusiness: {
    name: 'Google Business Profile',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/business.manage https://www.googleapis.com/auth/plus.business.manage',
    clientId: env.GOOGLE_BUSINESS_CLIENT_ID || env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_BUSINESS_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET,
    usePKCE: false,
    responseType: 'code',
    accessType: 'offline',
    prompt: 'consent',
    enabled: true,
  },
  linkedin: {
    name: 'LinkedIn',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scope: 'openid profile email w_member_social',
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    usePKCE: false,
    responseType: 'code',
    enabled: true,
  },
  twitter: {
    name: 'Twitter/X',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    scope: 'tweet.read tweet.write users.read follows.read follows.write offline.access',
    clientId: process.env.TWITTER_CLIENT_ID || process.env.TWITTER_API_KEY,
    clientSecret: process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_API_SECRET,
    usePKCE: true,
    responseType: 'code',
    enabled: !!(process.env.TWITTER_CLIENT_ID || process.env.TWITTER_API_KEY),
  },
  spotify: {
    name: 'Spotify',
    authUrl: 'https://accounts.spotify.com/authorize',
    tokenUrl: 'https://accounts.spotify.com/api/token',
    scope: 'user-read-private user-read-email user-top-read user-read-recently-played user-library-read playlist-read-private user-read-playback-state user-read-currently-playing',
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    usePKCE: false,
    responseType: 'code',
    enabled: !!(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET),
  },
};

function generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const bytes = crypto.randomBytes(64);
  for (let i = 0; i < 64; i++) {
    result += chars.charAt(bytes[i] % chars.length);
  }
  return result;
}

function generateCodeChallenge(verifier: string, encoding: 'hex' | 'base64url' = 'base64url'): string {
  return crypto.createHash('sha256').update(verifier).digest(encoding);
}

const _rawOAuthSecret = env.SESSION_SECRET || process.env.SECRET_KEY;
if (!_rawOAuthSecret && (process.env.NODE_ENV === 'production' || process.env.REPLIT_DEPLOYMENT)) {
  throw new Error('SESSION_SECRET or SECRET_KEY must be set in production (required for OAuth state HMAC)');
}
const OAUTH_STATE_SECRET = _rawOAuthSecret || 'max-booster-oauth-state-secret-dev-only';
const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function createOAuthState(userId: string, platform: string, codeVerifier?: string): string {
  const payload = {
    u: userId,
    p: platform,
    cv: codeVerifier,
    exp: Date.now() + OAUTH_STATE_TTL_MS,
    n: crypto.randomBytes(8).toString('hex'),
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(encoded).digest('base64url');
  return `${encoded}~${sig}`;
}

function verifyOAuthState(rawState: string): { userId: string; platform: string; codeVerifier?: string } | null {
  try {
    const tilde = rawState.lastIndexOf('~');
    if (tilde < 0) return null;
    const encoded = rawState.slice(0, tilde);
    const sig = rawState.slice(tilde + 1);
    const expectedSig = crypto.createHmac('sha256', OAUTH_STATE_SECRET).update(encoded).digest('base64url');
    if (sig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) return null;
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8'));
    if (!payload.u || !payload.p || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;
    return { userId: payload.u, platform: payload.p, codeVerifier: payload.cv };
  } catch {
    return null;
  }
}

function getBaseUrl(): string {
  return process.env.DOMAIN || process.env.APP_URL || 'https://max-booster.com';
}

function buildOAuthUrl(baseUrl: string, params: URLSearchParams, scope: string): string {
  const encodedScope = encodeURIComponent(scope).replace(/%2C/g, ',');
  return `${baseUrl}?${params.toString()}&scope=${encodedScope}`;
}

const CALLBACK_PATHS: Record<string, string> = {
  meta: '/auth/facebook/callback',
  facebook: '/auth/facebook/callback',
  instagram: '/auth/instagram/callback',
  threads: '/auth/threads/callback',
  tiktok: process.env.TIKTOK_ENV === 'sandbox' ? '/tiktok/sandbox/callback' : '/auth/tiktok/callback',
  google: '/auth/google/callback',
  youtube: '/auth/youtube/callback',
  googlebusiness: '/auth/google-business/callback',
  linkedin: '/auth/linkedin/callback',
  twitter: '/auth/twitter/callback',
  spotify: '/auth/spotify/callback',
};

function getCallbackUrl(platform: string): string {
  const baseUrl = getBaseUrl();
  const path = CALLBACK_PATHS[platform] || `/auth/${platform}/callback`;
  return `${baseUrl}${path}`;
}

router.get('/connections', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const connections = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, userId))
      .limit(50);
    
    const enrichedConnections = connections.map(c => {
      const isTokenExpired = c.tokenExpiresAt ? new Date(c.tokenExpiresAt) < new Date() : false;
      const tokenExpiresIn = c.tokenExpiresAt 
        ? Math.max(0, Math.floor((new Date(c.tokenExpiresAt).getTime() - Date.now()) / 1000))
        : null;
      
      let status: 'connected' | 'disconnected' | 'expired' | 'error' = 'connected';
      if (!c.isActive) status = 'disconnected';
      else if (isTokenExpired) status = 'expired';
      
      return {
        platform: c.platform,
        username: c.username,
        connected: c.isActive && !isTokenExpired,
        connectedAt: c.createdAt,
        status,
        tokenExpiresAt: c.tokenExpiresAt,
        tokenExpiresIn,
        followers: c.followerCount || 0,
        followerCount: c.followerCount || 0,
        profileUrl: c.profileUrl || '',
        platformUserId: c.platformUserId || '',
        metadata: c.metadata || {},
        lastSync: c.createdAt,
        requiresReauth: isTokenExpired,
      };
    });
    
    res.json(enrichedConnections);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get social connections:');
    res.status(500).json({ error: 'Failed to get social connections' });
  }
});

router.get('/platforms', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const platformList = Object.entries(PLATFORMS)
    .map(([key, config]) => ({
      id: key,
      name: config.name,
      enabled: config.enabled,
    }));
  res.json(platformList);
});

router.post('/connect/:platform', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    let platform = req.params.platform.toLowerCase();
    
    const config = PLATFORMS[platform as keyof typeof PLATFORMS];
    if (!config) {
      return res.status(400).json({ error: `Platform ${platform} is not supported` });
    }

    if (!config.enabled) {
      return res.status(503).json({ 
        error: `${config.name} is not yet configured. Please contact support to enable this platform.`,
        needsConfiguration: true
      });
    }
    
    if (!config.clientId || !config.clientSecret) {
      logger.warn(`OAuth not configured for ${platform}`);
      return res.status(503).json({ 
        message: `${config.name} connection is being set up. Please try again later.`,
        needsConfiguration: true 
      });
    }
    
    const platformConfig = config as Record<string, unknown>;
    const redirectUri = platformConfig.redirectUri || getCallbackUrl(platform);
    
    const params = new URLSearchParams();
    let state: string;

    if (platformConfig.usePKCE) {
      const codeVerifier = crypto.randomBytes(32).toString('base64url');
      const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
      state = createOAuthState(userId, platform, codeVerifier);
      params.set('response_type', 'code');
      params.set(platformConfig.clientIdParam || 'client_id', config.clientId!);
      params.set('redirect_uri', redirectUri);
      params.set('state', state);
      params.set('code_challenge', codeChallenge);
      params.set('code_challenge_method', 'S256');
    } else {
      state = createOAuthState(userId, platform);
      params.set(platformConfig.clientIdParam || 'client_id', config.clientId!);
      params.set('redirect_uri', redirectUri);
      params.set('response_type', 'code');
      params.set('state', state);
      if (platformConfig.accessType) params.set('access_type', platformConfig.accessType);
      if (platformConfig.prompt) params.set('prompt', platformConfig.prompt);
    }

    const authUrl = buildOAuthUrl(config.authUrl, params, config.scope);
    logger.info({ userId, platform, redirectUri }, `[OAuth] Generated auth URL for ${platform}`);
    res.json({ authUrl });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to initiate OAuth:');
    res.status(500).json({ error: 'Failed to connect platform' });
  }
});

router.get('/callback/:platform', async (req: Request, res: Response) => {
  try {
    let platform = req.params.platform.toLowerCase();
    const { code, state, error, error_description } = req.query;
    
    if (error) {
      logger.warn({ error, error_description }, `OAuth error for ${platform}`);
      return res.redirect(`/social-media?error=oauth_denied&platform=${platform}`);
    }
    
    const stateData = state ? verifyOAuthState(decodeURIComponent(state as string)) : null;
    if (!stateData) {
      logger.warn({ hasState: !!state }, `[OAuth] Invalid or expired state for ${platform}`);
      return res.redirect(`/social-media?error=invalid_state&platform=${platform}`);
    }
    
    if ((platform === 'facebook' || platform === 'instagram') && stateData.platform === 'meta') {
      platform = 'meta';
    }
    
    if (stateData.platform !== platform) {
      return res.redirect(`/social-media?error=platform_mismatch`);
    }
    
    const config = PLATFORMS[platform as keyof typeof PLATFORMS];
    if (!config) {
      return res.redirect(`/social-media?error=unsupported_platform`);
    }
    
    const platformConfig = config as Record<string, unknown>;
    const redirectUri = platformConfig.redirectUri || getCallbackUrl(platform);

    let authCode = code as string;
    if (authCode) {
      authCode = authCode.replace(/#_$/, '');
    }
    
    let tokenData: Record<string, unknown>;
    
    try {
      const tokenParams = new URLSearchParams();
      tokenParams.set('grant_type', 'authorization_code');
      tokenParams.set('code', authCode);
      tokenParams.set('redirect_uri', redirectUri);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };

      if (platform === 'twitter') {
        try {
          const twitterClientId = process.env.TWITTER_CLIENT_ID || process.env.TWITTER_API_KEY || '';
          const twitterClientSecret = process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_API_SECRET || '';
          logger.info({ 
            hasCode: !!authCode, 
            hasVerifier: !!stateData.codeVerifier,
            redirectUri,
          }, `[OAuth] Twitter token exchange (direct fetch)`);
          const twitterTokenBody = new URLSearchParams({
            grant_type: 'authorization_code',
            code: authCode,
            redirect_uri: redirectUri,
            code_verifier: stateData.codeVerifier!,
          });
          const twitterBasicAuth = Buffer.from(`${twitterClientId}:${twitterClientSecret}`).toString('base64');
          const twitterTokenRes = await timedFetch('https://api.x.com/2/oauth2/token', {
            method: 'POST',
            signal: AbortSignal.timeout(15_000), // 15 s — X/Twitter token exchange
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'Authorization': `Basic ${twitterBasicAuth}`,
            },
            body: twitterTokenBody.toString(),
          });
          const twitterTokenJson = await twitterTokenRes.json() as Record<string, unknown>;
          if (!twitterTokenRes.ok || !twitterTokenJson.access_token) {
            throw new Error(twitterTokenJson.error_description || twitterTokenJson.error || `Token request failed with status ${twitterTokenRes.status}`);
          }
          tokenData = {
            access_token: twitterTokenJson.access_token,
            refresh_token: twitterTokenJson.refresh_token,
            expires_in: twitterTokenJson.expires_in,
            token_type: twitterTokenJson.token_type || 'bearer',
          };
          // SAFE: only logs presence booleans + numeric expiry — no token material.
          logger.info({ hasAccessToken: !!tokenData.access_token, hasRefreshToken: !!tokenData.refresh_token, expiresIn: tokenData.expires_in }, `[OAuth] Twitter token exchange SUCCESS`);
        } catch (twitterErr: unknown) {
          const e = twitterErr as { message?: string; data?: unknown };
          logger.warn({
            error: e?.message ?? String(twitterErr),
            // INTENTIONAL: e.data may contain the upstream provider error body
            // (which can include access tokens on partial-success responses) —
            // do NOT log it. Only the error message is safe.
          }, `[OAuth] Twitter token exchange ERROR`);
          return res.redirect(`/social-media?error=token_exchange_failed&platform=twitter&detail=${encodeURIComponent(e?.message ?? 'Twitter authentication failed')}`);
        }
      } else if (platform === 'spotify') {
        const basicAuth = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
        headers['Authorization'] = `Basic ${basicAuth}`;
      } else if (platform === 'tiktok') {
        tokenParams.set('client_key', config.clientId!);
        tokenParams.set('client_secret', config.clientSecret!);
        headers['Cache-Control'] = 'no-cache';
      } else if (platform === 'threads') {
        tokenParams.set('client_id', config.clientId!);
        tokenParams.set('client_secret', config.clientSecret!);
        if (stateData.codeVerifier) {
          tokenParams.set('code_verifier', stateData.codeVerifier);
        }
      } else {
        tokenParams.set('client_id', config.clientId!);
        tokenParams.set('client_secret', config.clientSecret!);
      }

      logger.info({ redirectUri, hasCode: !!authCode, hasVerifier: !!stateData.codeVerifier }, `[OAuth] Token exchange for ${platform}`);
      
      let tokenResponse: globalThis.Response | undefined;
      let responseText: string | undefined;
      
      if (platform !== 'twitter') {
        try {
          tokenResponse = await timedFetch(config.tokenUrl, {
            method: 'POST',
            headers,
            body: tokenParams.toString(),
            signal: AbortSignal.timeout(15000),
          });
          responseText = await tokenResponse.text();
        } catch (fetchErr: unknown) {
          const fe = fetchErr as { message?: string };
          logger.warn({ error: fe?.message ?? String(fetchErr), tokenUrl: config.tokenUrl }, `[OAuth] Token exchange network error for ${platform}`);
          return res.redirect(`/social-media?error=token_exchange_failed&platform=${platform}&detail=${encodeURIComponent(fe?.message ?? 'Network error')}`);
        }
        
        try {
          tokenData = JSON.parse(responseText!);
        } catch {
          const parsed = new URLSearchParams(responseText!);
          tokenData = Object.fromEntries(parsed.entries());
        }
        
        // SAFE: only logs status, presence boolean, and the upstream error code
        // (e.g. "invalid_grant") — never the access_token or refresh_token.
        logger.warn({ status: tokenResponse!.status, ok: tokenResponse!.ok, hasAccessToken: !!tokenData?.access_token, error: tokenData?.error || 'none' }, `[OAuth] Token exchange response for ${platform}`);
      }

      if (tokenResponse && (!tokenResponse.ok || tokenData?.error)) {
        // INTENTIONAL: Build a redacted copy of tokenData for the failure log.
        // Even on a non-2xx response some providers echo a token field; never log it.
        const safeTokenData = (() => {
          if (!tokenData || typeof tokenData !== 'object') return tokenData;
          const { access_token, refresh_token, id_token, ...rest } = tokenData as Record<string, unknown>;
          return {
            ...rest,
            access_token: access_token ? '<redacted>' : undefined,
            refresh_token: refresh_token ? '<redacted>' : undefined,
            id_token: id_token ? '<redacted>' : undefined,
          };
        })();
        logger.warn({ status: tokenResponse!.status, data: safeTokenData, tokenUrl: config.tokenUrl }, `[OAuth] Token exchange failed for ${platform}`);
        const errorDetail = tokenData.error_description || tokenData.error || 'unknown';
        return res.redirect(`/social-media?error=token_exchange_failed&platform=${platform}&detail=${encodeURIComponent(errorDetail)}`);
      }

      if (platform === 'threads' && tokenData.access_token && config.clientSecret) {
        // Threads long-lived token exchange: build URL, then log a SCRUBBED form
        // (client_secret + access_token are query params and MUST never reach logs).
        const threadsLongLivedUrl = `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${encodeURIComponent(config.clientSecret)}&access_token=${encodeURIComponent(tokenData.access_token)}`;
        try {
          const longLivedResponse = await timedFetch(
            threadsLongLivedUrl,
            { signal: AbortSignal.timeout(15_000) } // 15 s — Threads token exchange
          );
          const longLivedData = await longLivedResponse.json();
          if (longLivedResponse.ok && longLivedData.access_token) {
            tokenData.access_token = longLivedData.access_token;
            tokenData.expires_in = longLivedData.expires_in || 5184000;
            logger.info(`[OAuth] Threads: exchanged for long-lived token (${tokenData.expires_in}s)`);
          } else {
            logger.warn({ data: redactOAuthFields(longLivedData) }, '[OAuth] Threads: long-lived token exchange returned error, using short-lived token');
          }
        } catch (llErr: unknown) {
          // INTENTIONAL: never log llErr directly — fetch errors can include the
          // request URL (which contains client_secret + access_token query params).
          // Only log a sanitized message string.
          const msg = llErr instanceof Error ? llErr.message : String(llErr);
          logger.warn({ error: scrubSecretsFromText(msg) }, '[OAuth] Threads: failed to get long-lived token, using short-lived');
        }
      }
    } catch (err: unknown) {
      // INTENTIONAL: pass only sanitized message + name. Raw error objects can
      // serialize the request URL (which may contain access_token / client_secret).
      const e = err instanceof Error ? err : null;
      logger.warn(
        { errMessage: scrubSecretsFromText(e?.message ?? String(err)), errName: e?.name },
        `Token exchange error for ${platform}`,
      );
      return res.redirect(`/social-media?error=token_exchange_failed&platform=${platform}`);
    }
    
    let facebookUsername = 'Facebook User';
    let instagramUsername = 'Instagram User';
    let username = 'Connected User';
    let followerCount = 0;
    let profileUrl = '';
    let platformUserId = '';
    let metadata: Record<string, any> = {};
    let facebookFollowers = 0;
    let instagramFollowers = 0;
    let facebookMetadata: Record<string, any> = {};
    let instagramMetadata: Record<string, any> = {};
    let facebookProfileUrl = '';
    let instagramProfileUrl = '';
    let facebookPlatformUserId = '';
    let instagramPlatformUserId = '';
    
    try {
      if (platform === 'meta') {
        try {
          const userResponse = await timedFetch(`https://graph.facebook.com/me?fields=id,name,picture&access_token=${tokenData.access_token}`, { signal: AbortSignal.timeout(10_000) });
          const userData = await userResponse.json();
          facebookUsername = userData.name || 'Facebook User';
          username = facebookUsername;
          facebookPlatformUserId = userData.id || '';
          facebookProfileUrl = `https://www.facebook.com/${userData.id}`;
          facebookMetadata = { picture: userData.picture?.data?.url };
        } catch (fbErr) {
          logger.warn({ err: fbErr }, 'Failed to fetch Facebook user info');
        }
        
        try {
          const igResponse = await timedFetch(`https://graph.facebook.com/me/accounts?access_token=${tokenData.access_token}`, { signal: AbortSignal.timeout(10_000) });
          const igData = await igResponse.json();
          if (igData.data && igData.data.length > 0) {
            const pageId = igData.data[0].id;
            const pageToken = igData.data[0].access_token;
            const igAccountResponse = await timedFetch(
              `https://graph.facebook.com/${pageId}?fields=instagram_business_account&access_token=${pageToken}`,
              { signal: AbortSignal.timeout(10_000) }
            );
            const igAccountData = await igAccountResponse.json();
            if (igAccountData.instagram_business_account) {
              const igUserResponse = await timedFetch(
                `https://graph.facebook.com/${igAccountData.instagram_business_account.id}?fields=username,followers_count,media_count&access_token=${pageToken}`,
                { signal: AbortSignal.timeout(10_000) }
              );
              const igUserData = await igUserResponse.json();
              instagramUsername = igUserData.username || 'Instagram User';
              instagramFollowers = igUserData.followers_count || 0;
              instagramPlatformUserId = igAccountData.instagram_business_account.id || '';
              instagramProfileUrl = `https://www.instagram.com/${igUserData.username}`;
              instagramMetadata = { mediaCount: igUserData.media_count || 0 };
            }
          }
        } catch (igErr) {
          logger.warn({ err: igErr }, 'Failed to fetch Instagram username');
        }
      } else if (platform === 'twitter') {
        try {
          const userResponse = await timedFetch('https://api.x.com/2/users/me?user.fields=public_metrics,profile_image_url,description', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          const userData = await userResponse.json();
          username = userData.data?.username || 'Twitter User';
          followerCount = userData.data?.public_metrics?.followers_count || 0;
          platformUserId = userData.data?.id || '';
          profileUrl = `https://x.com/${userData.data?.username}`;
          metadata = { followingCount: userData.data?.public_metrics?.following_count || 0, tweetCount: userData.data?.public_metrics?.tweet_count || 0, listedCount: userData.data?.public_metrics?.listed_count || 0, profileImageUrl: userData.data?.profile_image_url };
        } catch (twitterErr) {
          logger.warn({ err: twitterErr }, 'Failed to fetch Twitter user info');
        }
      } else if (platform === 'youtube') {
        try {
          const userResponse = await timedFetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          const userData = await userResponse.json();
          const channel = userData.items?.[0];
          username = channel?.snippet?.title || 'YouTube Channel';
          followerCount = parseInt(channel?.statistics?.subscriberCount || '0');
          platformUserId = channel?.id || '';
          profileUrl = `https://www.youtube.com/channel/${channel?.id}`;
          metadata = { viewCount: parseInt(channel?.statistics?.viewCount || '0'), videoCount: parseInt(channel?.statistics?.videoCount || '0'), customUrl: channel?.snippet?.customUrl, thumbnailUrl: channel?.snippet?.thumbnails?.default?.url };
        } catch (ytErr) {
          logger.warn({ err: ytErr }, 'Failed to fetch YouTube channel info');
        }
      } else if (platform === 'tiktok') {
        try {
          const userResponse = await timedFetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username,bio_description,profile_deep_link,is_verified', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
          });
          const userData = await userResponse.json();
          const tiktokData = userData.data?.user;
          username = tiktokData?.display_name || tiktokData?.username || 'TikTok User';
          followerCount = 0;
          platformUserId = tiktokData?.open_id || tokenData.open_id || '';
          profileUrl = tiktokData?.profile_deep_link || (tiktokData?.username ? `https://www.tiktok.com/@${tiktokData.username}` : '');
          metadata = { avatarUrl: tiktokData?.avatar_url || '', bio: tiktokData?.bio_description || '', isVerified: tiktokData?.is_verified || false, tiktokUsername: tiktokData?.username || '' };
        } catch (tiktokErr) {
          logger.warn({ err: tiktokErr }, 'Failed to fetch TikTok user info');
          username = 'TikTok User';
        }
      } else if (platform === 'linkedin') {
        try {
          const userResponse = await timedFetch('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
          });
          const userData = await userResponse.json();
          username = userData.name || 'LinkedIn User';
          platformUserId = userData.sub || '';
          profileUrl = `https://www.linkedin.com/in/${userData.sub}`;
          metadata = { email: userData.email, picture: userData.picture };
        } catch (linkedinErr) {
          logger.warn({ err: linkedinErr }, 'Failed to fetch LinkedIn user info');
          username = 'LinkedIn User';
        }
      } else if (platform === 'threads') {
        try {
          const userResponse = await timedFetch(`https://graph.threads.net/me?fields=id,username,threads_profile_picture_url&access_token=${tokenData.access_token}`);
          const userData = await userResponse.json();
          username = userData.username || 'Threads User';
          platformUserId = userData.id || '';
          profileUrl = `https://www.threads.net/@${userData.username}`;
          metadata = { profilePictureUrl: userData.threads_profile_picture_url };
        } catch (threadsErr) {
          logger.warn({ err: threadsErr }, 'Failed to fetch Threads user info');
          username = 'Threads User';
        }
      } else if (platform === 'spotify') {
        try {
          const userResponse = await timedFetch('https://api.spotify.com/v1/me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          const userData = await userResponse.json();
          username = userData.display_name || 'Spotify User';
          platformUserId = userData.id || '';
          profileUrl = userData.external_urls?.spotify || `https://open.spotify.com/user/${userData.id}`;
          followerCount = userData.followers?.total || 0;
          metadata = { email: userData.email, product: userData.product, country: userData.country, imageUrl: userData.images?.[0]?.url };
        } catch (spotifyErr) {
          logger.warn({ err: spotifyErr }, 'Failed to fetch Spotify user info');
          username = 'Spotify User';
        }
      } else if (platform === 'google' || platform === 'googlebusiness') {
        try {
          const userResponse = await timedFetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          const userData = await userResponse.json();
          username = userData.name || 'Google User';
          platformUserId = userData.id || '';
          profileUrl = '';
          metadata = { email: userData.email, picture: userData.picture };
        } catch (googleErr) {
          logger.warn({ err: googleErr }, 'Failed to fetch Google user info');
          username = 'Google User';
        }
      }
    } catch (err) {
      logger.warn({ err: err }, `Failed to fetch user info for ${platform}:`);
    }
    
    const savePlatformName = platform;
    const platformsToSave = platform === 'meta' 
      ? [
          { name: 'facebook', username: facebookUsername, followerCount: facebookFollowers, profileUrl: facebookProfileUrl, platformUserId: facebookPlatformUserId, metadata: facebookMetadata },
          { name: 'instagram', username: instagramUsername, followerCount: instagramFollowers, profileUrl: instagramProfileUrl, platformUserId: instagramPlatformUserId, metadata: instagramMetadata },
        ]
      : [{ name: savePlatformName, username, followerCount, profileUrl, platformUserId, metadata }];
    
    for (const p of platformsToSave) {
      const existingConnection = await db
        .select()
        .from(socialAccounts)
        .where(and(
          eq(socialAccounts.userId, stateData.userId),
          eq(socialAccounts.platform, p.name)
        ))
        .limit(1);
      
      if (existingConnection.length > 0) {
        await db
          .update(socialAccounts)
          .set({
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            tokenExpiresAt: tokenData.expires_in 
              ? new Date(Date.now() + tokenData.expires_in * 1000)
              : null,
            username: p.username,
            followerCount: p.followerCount,
            profileUrl: p.profileUrl,
            platformUserId: p.platformUserId,
            metadata: p.metadata,
            isActive: true,
          })
          .where(eq(socialAccounts.id, existingConnection[0].id));
      } else {
        await db.insert(socialAccounts).values({
          userId: stateData.userId,
          platform: p.name,
          accessToken: tokenData.access_token,
          refreshToken: tokenData.refresh_token,
          tokenExpiresAt: tokenData.expires_in 
            ? new Date(Date.now() + tokenData.expires_in * 1000)
            : null,
          username: p.username,
          followerCount: p.followerCount,
          profileUrl: p.profileUrl,
          platformUserId: p.platformUserId,
          metadata: p.metadata,
          isActive: true,
        });
      }
      
      logger.info({ 
        userId: stateData.userId, 
        platform: p.name,
        username: p.username 
      }, `[OAuth] Successfully connected ${p.name} for user`);
    }
    
    const redirectPlatform = platform === 'meta' ? 'facebook,instagram' : savePlatformName;
    const connectedUsername = platformsToSave[0]?.username || '';
    const successUrl = `/social-media?success=connected&platform=${redirectPlatform}&username=${encodeURIComponent(connectedUsername)}`;
    logger.info({ successUrl, platform: redirectPlatform }, `[OAuth] Redirecting to success URL`);
    res.redirect(successUrl);
  } catch (error) {
    logger.warn({ err: error }, 'OAuth callback error:');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorUrl = `/social-media?error=callback_failed&message=${encodeURIComponent(errorMessage)}`;
    logger.warn({ errorUrl }, `[OAuth] Redirecting to error URL`);
    res.redirect(errorUrl);
  }
});

router.post('/disconnect/:platform', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const platform = req.params.platform.toLowerCase();
    
    const platformsToDisconnect = platform === 'meta' ? ['facebook', 'instagram'] : [platform];
    
    for (const p of platformsToDisconnect) {
      await db
        .update(socialAccounts)
        .set({ isActive: false, accessToken: null, refreshToken: null })
        .where(and(
          eq(socialAccounts.userId, userId),
          eq(socialAccounts.platform, p)
        ));
      
      logger.info({ userId, platform: p }, `[OAuth] Disconnected ${p} for user`);
    }
    
    res.json({ 
      success: true, 
      message: `Disconnected from ${platform === 'meta' ? 'Facebook & Instagram' : platform}`,
      outcome: {
        status: 'success',
        category: 'oauth',
        title: 'Platform Disconnected',
        platforms: platformsToDisconnect,
      }
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to disconnect platform:');
    res.status(500).json({ 
      message: 'Failed to disconnect platform',
      outcome: {
        status: 'error',
        category: 'oauth',
        title: 'Disconnection Failed',
        retryable: true,
      }
    });
  }
});

router.post('/sync/:platform', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const platform = req.params.platform.toLowerCase();

    const results = await syncPlatformData(userId, platform);

    res.json({
      success: true,
      message: `${platform} stats synced successfully`,
      results,
      outcome: {
        status: 'success',
        category: 'oauth',
        title: 'Platform Synced',
        platforms: [platform],
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to sync platform stats:');
    res.status(500).json({
      success: false,
      message: 'Failed to sync platform stats',
      outcome: {
        status: 'error',
        category: 'oauth',
        title: 'Sync Failed',
        retryable: true,
      },
    });
  }
});

router.post('/refresh/:platform', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const platform = req.params.platform.toLowerCase();
    
    const [connection] = await db
      .select()
      .from(socialAccounts)
      .where(and(
        eq(socialAccounts.userId, userId),
        eq(socialAccounts.platform, platform)
      ))
      .limit(1);
    
    if (!connection) {
      return res.status(404).json({ 
        message: 'Platform not connected',
        outcome: {
          status: 'error',
          category: 'oauth',
          title: 'Platform Not Found',
        }
      });
    }
    
    if (!connection.refreshToken) {
      return res.status(400).json({ 
        message: 'No refresh token available. Please reconnect.',
        outcome: {
          status: 'auth_required',
          category: 'oauth',
          title: 'Reconnection Required',
          actionLabel: 'Reconnect',
        }
      });
    }
    
    const result = await socialOAuthService.refreshAccessToken(userId, platform);
    
    res.json({ 
      success: true,
      message: 'Token refreshed successfully',
      accessToken: result.accessToken,
      expiresIn: result.expiresIn,
      outcome: {
        status: 'success',
        category: 'oauth',
        title: 'Token Refreshed',
      }
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to refresh token:');
    res.status(500).json({ 
      message: 'Failed to refresh token',
      outcome: {
        status: 'error',
        category: 'oauth',
        title: 'Refresh Failed',
        retryable: true,
      }
    });
  }
});

export default router;
