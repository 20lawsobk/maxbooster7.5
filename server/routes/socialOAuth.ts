import { Router, Request, Response } from 'express';
import { db } from '../db';
import { socialAccounts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { logger } from '../logger';
import crypto from 'crypto';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

const requireAuth = (req: AuthenticatedRequest, res: Response, next: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
};

const PLATFORMS = {
  meta: {
    name: 'Meta (Facebook + Instagram)',
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scope: 'public_profile,email,pages_show_list,pages_read_engagement,pages_manage_posts,pages_read_user_content,business_management,instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_insights',
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
    scope: 'threads_basic,threads_content_publish,threads_manage_insights,threads_manage_replies,threads_read_replies',
    clientId: process.env.THREADS_APP_ID || process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.THREADS_APP_SECRET || process.env.FACEBOOK_APP_SECRET,
    usePKCE: false,
    responseType: 'code',
    enabled: true,
  },
  tiktok: {
    name: 'TikTok',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scope: 'user.info.basic,user.info.profile,user.info.stats,video.list,video.publish,video.upload',
    clientId: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    usePKCE: true,
    responseType: 'code',
    enabled: true,
  },
  tiktok_sandbox: {
    name: 'TikTok (Sandbox)',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scope: 'user.info.basic,user.info.profile,user.info.stats,video.list,video.publish,video.upload',
    clientId: process.env.TIKTOK_CLIENT_KEY1,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET1,
    usePKCE: true,
    responseType: 'code',
    enabled: !!(process.env.TIKTOK_CLIENT_KEY1 && process.env.TIKTOK_CLIENT_SECRET1),
  },
  google: {
    name: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
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
    clientId: process.env.YOUTUBE_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
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
    clientId: process.env.GOOGLE_BUSINESS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_BUSINESS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET,
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
    scope: 'openid profile email w_member_social r_basicprofile r_organization_social rw_organization_admin',
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    usePKCE: false,
    responseType: 'code',
    enabled: true,
  },
  twitter: {
    name: 'Twitter/X',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scope: 'tweet.read tweet.write users.read follows.read follows.write offline.access',
    clientId: process.env.TWITTER_CLIENT_ID || process.env.TWITTER_API_KEY,
    clientSecret: process.env.TWITTER_CLIENT_SECRET || process.env.TWITTER_API_SECRET,
    usePKCE: true,
    responseType: 'code',
    enabled: true,
  },
};

const oauthStates = new Map<string, { userId: string; platform: string; createdAt: Date; codeVerifier?: string }>();

function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.createdAt.getTime() > 10 * 60 * 1000) {
      oauthStates.delete(state);
    }
  }
}, 60000);

function getBaseUrl(): string {
  return process.env.DOMAIN || process.env.APP_URL || 'https://maxbooster.replit.app';
}

const CALLBACK_PATHS: Record<string, string> = {
  meta: '/auth/facebook/callback',
  facebook: '/auth/facebook/callback',
  instagram: '/auth/instagram/callback',
  threads: '/auth/threads/callback',
  tiktok: '/auth/tiktok/callback',
  tiktok_sandbox: '/auth/tiktok-sandbox/callback',
  google: '/auth/google/callback',
  youtube: '/auth/youtube/callback',
  googlebusiness: '/auth/google-business/callback',
  linkedin: '/auth/linkedin/callback',
  twitter: '/auth/twitter/callback',
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
      .where(eq(socialAccounts.userId, userId));
    
    res.json(connections.map(c => ({
      platform: c.platform,
      username: c.username,
      connected: c.isActive,
      connectedAt: c.createdAt,
    })));
  } catch (error) {
    logger.error('Failed to get social connections:', error);
    res.json([]);
  }
});

router.get('/platforms', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const platformList = Object.entries(PLATFORMS).map(([key, config]) => ({
    id: key,
    name: config.name,
    enabled: config.enabled,
    comingSoon: (config as any).comingSoon || null,
  }));
  res.json(platformList);
});

router.post('/connect/:platform', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const platform = req.params.platform.toLowerCase();
    
    const config = PLATFORMS[platform as keyof typeof PLATFORMS];
    if (!config) {
      return res.status(400).json({ message: `Platform ${platform} is not supported` });
    }

    if (!config.enabled) {
      return res.status(503).json({ 
        message: `${config.name} connection is coming soon!`,
        comingSoon: (config as any).comingSoon || 'Coming Soon'
      });
    }
    
    if (!config.clientId || !config.clientSecret) {
      logger.warn(`OAuth not configured for ${platform}`);
      return res.status(503).json({ 
        message: `${config.name} connection is being set up. Please try again later.`,
        needsConfiguration: true 
      });
    }
    
    const state = crypto.randomBytes(32).toString('hex');
    const redirectUri = getCallbackUrl(platform);
    
    const params = new URLSearchParams();
    let codeVerifier: string | undefined;
    
    if (config.usePKCE) {
      codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(codeVerifier);
      
      if (platform === 'twitter') {
        params.set('response_type', 'code');
        params.set('client_id', config.clientId);
        params.set('redirect_uri', redirectUri);
        params.set('scope', config.scope);
        params.set('state', state);
        params.set('code_challenge', codeChallenge);
        params.set('code_challenge_method', 'S256');
      } else if (platform === 'tiktok') {
        params.set('client_key', config.clientId);
        params.set('scope', config.scope);
        params.set('response_type', 'code');
        params.set('redirect_uri', redirectUri);
        params.set('state', state);
        params.set('code_challenge', codeChallenge);
        params.set('code_challenge_method', 'S256');
      }
    } else if (platform === 'youtube' || platform === 'google' || platform === 'googlebusiness') {
      params.set('client_id', config.clientId);
      params.set('redirect_uri', redirectUri);
      params.set('response_type', 'code');
      params.set('scope', config.scope);
      params.set('state', state);
      params.set('access_type', 'offline');
      params.set('prompt', 'consent');
    } else {
      params.set('client_id', config.clientId);
      params.set('redirect_uri', redirectUri);
      params.set('scope', config.scope);
      params.set('state', state);
      params.set('response_type', 'code');
    }
    
    oauthStates.set(state, { userId, platform, createdAt: new Date(), codeVerifier });
    
    const authUrl = `${config.authUrl}?${params.toString()}`;
    
    logger.info(`[OAuth] Generated auth URL for ${platform}`, { userId, platform, redirectUri });
    
    res.json({ authUrl });
  } catch (error) {
    logger.error('Failed to initiate OAuth:', error);
    res.status(500).json({ message: 'Failed to connect platform' });
  }
});

router.get('/callback/:platform', async (req: Request, res: Response) => {
  try {
    let platform = req.params.platform.toLowerCase();
    const { code, state, error, error_description } = req.query;
    
    if (error) {
      logger.error(`OAuth error for ${platform}:`, { error, error_description });
      return res.redirect(`/settings?error=oauth_denied&platform=${platform}`);
    }
    
    if (!state || !oauthStates.has(state as string)) {
      return res.redirect('/settings?error=invalid_state');
    }
    
    const stateData = oauthStates.get(state as string)!;
    oauthStates.delete(state as string);
    
    // Handle legacy callback URLs - facebook/instagram callbacks should work for meta platform
    if ((platform === 'facebook' || platform === 'instagram') && stateData.platform === 'meta') {
      platform = 'meta';
    }
    
    if (stateData.platform !== platform) {
      return res.redirect('/settings?error=platform_mismatch');
    }
    
    const config = PLATFORMS[platform as keyof typeof PLATFORMS];
    if (!config) {
      return res.redirect(`/settings?error=unsupported_platform`);
    }
    
    const redirectUri = getCallbackUrl(platform);
    
    let tokenData: any;
    
    try {
      const tokenParams = new URLSearchParams();
      tokenParams.set('grant_type', 'authorization_code');
      tokenParams.set('code', code as string);
      tokenParams.set('redirect_uri', redirectUri);
      
      if (platform === 'twitter') {
        tokenParams.set('client_id', config.clientId!);
        tokenParams.set('code_verifier', stateData.codeVerifier || '');
      } else if (platform === 'tiktok') {
        tokenParams.set('client_key', config.clientId!);
        tokenParams.set('client_secret', config.clientSecret!);
        tokenParams.set('code_verifier', stateData.codeVerifier || '');
      } else {
        tokenParams.set('client_id', config.clientId!);
        tokenParams.set('client_secret', config.clientSecret!);
      }
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      
      if (platform === 'twitter') {
        const credentials = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64');
        headers['Authorization'] = `Basic ${credentials}`;
      }
      
      const tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers,
        body: tokenParams.toString(),
      });
      
      tokenData = await tokenResponse.json();
      
      if (!tokenResponse.ok || tokenData.error) {
        logger.error(`Token exchange failed for ${platform}:`, tokenData);
        return res.redirect(`/settings?error=token_exchange_failed&platform=${platform}`);
      }
    } catch (err) {
      logger.error(`Token exchange error for ${platform}:`, err);
      return res.redirect(`/settings?error=token_exchange_failed&platform=${platform}`);
    }
    
    let facebookUsername = 'Facebook User';
    let instagramUsername = 'Instagram User';
    let username = 'Connected User';
    
    try {
      if (platform === 'meta') {
        const userResponse = await fetch(`https://graph.facebook.com/me?access_token=${tokenData.access_token}`);
        const userData = await userResponse.json();
        facebookUsername = userData.name || 'Facebook User';
        username = facebookUsername;
        
        try {
          const igResponse = await fetch(`https://graph.facebook.com/me/accounts?access_token=${tokenData.access_token}`);
          const igData = await igResponse.json();
          if (igData.data && igData.data.length > 0) {
            const pageId = igData.data[0].id;
            const pageToken = igData.data[0].access_token;
            const igAccountResponse = await fetch(
              `https://graph.facebook.com/${pageId}?fields=instagram_business_account&access_token=${pageToken}`
            );
            const igAccountData = await igAccountResponse.json();
            if (igAccountData.instagram_business_account) {
              const igUsernameResponse = await fetch(
                `https://graph.facebook.com/${igAccountData.instagram_business_account.id}?fields=username&access_token=${pageToken}`
              );
              const igUsernameData = await igUsernameResponse.json();
              instagramUsername = igUsernameData.username || 'Instagram User';
            }
          }
        } catch (igErr) {
          logger.warn('Failed to fetch Instagram username:', igErr);
        }
      } else if (platform === 'twitter') {
        const userResponse = await fetch('https://api.twitter.com/2/users/me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();
        username = userData.data?.username || 'Twitter User';
      } else if (platform === 'youtube') {
        const userResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();
        username = userData.items?.[0]?.snippet?.title || 'YouTube Channel';
      } else if (platform === 'tiktok') {
        username = 'TikTok User';
      } else if (platform === 'linkedin') {
        username = 'LinkedIn User';
      } else if (platform === 'threads') {
        username = 'Threads User';
      } else if (platform === 'google' || platform === 'googlebusiness') {
        username = 'Google User';
      }
    } catch (err) {
      logger.warn(`Failed to fetch user info for ${platform}:`, err);
    }
    
    const platformsToSave = platform === 'meta' 
      ? [{ name: 'facebook', username: facebookUsername }, { name: 'instagram', username: instagramUsername }]
      : [{ name: platform, username }];
    
    for (const p of platformsToSave) {
      const existingConnection = await db
        .select()
        .from(socialAccounts)
        .where(and(
          eq(socialAccounts.userId, stateData.userId),
          eq(socialAccounts.platform, p.name)
        ));
      
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
          platformUserId: tokenData.user_id || null,
          isActive: true,
        });
      }
      
      logger.info(`[OAuth] Successfully connected ${p.name} for user`, { 
        userId: stateData.userId, 
        platform: p.name,
        username: p.username 
      });
    }
    
    const redirectPlatform = platform === 'meta' ? 'facebook,instagram' : platform;
    res.redirect(`/settings?success=connected&platform=${redirectPlatform}`);
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.redirect('/settings?error=callback_failed');
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
      
      logger.info(`[OAuth] Disconnected ${p} for user`, { userId, platform: p });
    }
    
    res.json({ success: true, message: `Disconnected from ${platform === 'meta' ? 'Facebook & Instagram' : platform}` });
  } catch (error) {
    logger.error('Failed to disconnect platform:', error);
    res.status(500).json({ message: 'Failed to disconnect platform' });
  }
});

export default router;
