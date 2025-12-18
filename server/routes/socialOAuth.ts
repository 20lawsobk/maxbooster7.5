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
  twitter: {
    name: 'Twitter/X',
    authUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scope: 'tweet.read tweet.write users.read offline.access',
    clientId: process.env.TWITTER_API_KEY,
    clientSecret: process.env.TWITTER_API_SECRET,
  },
  facebook: {
    name: 'Facebook',
    authUrl: 'https://www.facebook.com/v18.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v18.0/oauth/access_token',
    scope: 'pages_manage_posts,pages_read_engagement,public_profile',
    clientId: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
  },
  instagram: {
    name: 'Instagram',
    authUrl: 'https://api.instagram.com/oauth/authorize',
    tokenUrl: 'https://api.instagram.com/oauth/access_token',
    scope: 'instagram_basic,instagram_content_publish',
    clientId: process.env.INSTAGRAM_APP_ID,
    clientSecret: process.env.INSTAGRAM_APP_SECRET,
  },
  tiktok: {
    name: 'TikTok',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scope: 'user.info.basic,video.publish',
    clientId: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
  },
  youtube: {
    name: 'YouTube',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'https://www.googleapis.com/auth/youtube https://www.googleapis.com/auth/youtube.upload',
    clientId: process.env.YOUTUBE_CLIENT_ID,
    clientSecret: process.env.YOUTUBE_CLIENT_SECRET,
  },
  linkedin: {
    name: 'LinkedIn',
    authUrl: 'https://www.linkedin.com/oauth/v2/authorization',
    tokenUrl: 'https://www.linkedin.com/oauth/v2/accessToken',
    scope: 'r_liteprofile w_member_social',
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
  },
};

const oauthStates = new Map<string, { userId: string; platform: string; createdAt: Date }>();

setInterval(() => {
  const now = Date.now();
  for (const [state, data] of oauthStates.entries()) {
    if (now - data.createdAt.getTime() > 10 * 60 * 1000) {
      oauthStates.delete(state);
    }
  }
}, 60000);

function getBaseUrl(): string {
  if (process.env.REPL_SLUG && process.env.REPL_OWNER) {
    return `https://${process.env.REPL_SLUG}.${process.env.REPL_OWNER}.repl.co`;
  }
  if (process.env.REPLIT_DEV_DOMAIN) {
    return `https://${process.env.REPLIT_DEV_DOMAIN}`;
  }
  return process.env.APP_URL || 'https://maxbooster.replit.app';
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

router.post('/connect/:platform', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const platform = req.params.platform.toLowerCase();
    
    const config = PLATFORMS[platform as keyof typeof PLATFORMS];
    if (!config) {
      return res.status(400).json({ message: `Platform ${platform} is not supported` });
    }
    
    if (!config.clientId || !config.clientSecret) {
      logger.warn(`OAuth not configured for ${platform}`);
      return res.status(503).json({ 
        message: `${config.name} connection is being set up. Please try again later.`,
        needsConfiguration: true 
      });
    }
    
    const state = crypto.randomBytes(32).toString('hex');
    oauthStates.set(state, { userId, platform, createdAt: new Date() });
    
    const baseUrl = getBaseUrl();
    const redirectUri = `${baseUrl}/api/social/callback/${platform}`;
    
    const params = new URLSearchParams();
    
    if (platform === 'twitter') {
      params.set('response_type', 'code');
      params.set('client_id', config.clientId);
      params.set('redirect_uri', redirectUri);
      params.set('scope', config.scope);
      params.set('state', state);
      params.set('code_challenge', 'challenge');
      params.set('code_challenge_method', 'plain');
    } else if (platform === 'tiktok') {
      params.set('client_key', config.clientId);
      params.set('scope', config.scope);
      params.set('response_type', 'code');
      params.set('redirect_uri', redirectUri);
      params.set('state', state);
    } else if (platform === 'youtube') {
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
    
    const authUrl = `${config.authUrl}?${params.toString()}`;
    
    logger.info(`[OAuth] Generated auth URL for ${platform}`, { userId, platform });
    
    res.json({ authUrl });
  } catch (error) {
    logger.error('Failed to initiate OAuth:', error);
    res.status(500).json({ message: 'Failed to connect platform' });
  }
});

router.get('/callback/:platform', async (req: Request, res: Response) => {
  try {
    const platform = req.params.platform.toLowerCase();
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
    
    if (stateData.platform !== platform) {
      return res.redirect('/settings?error=platform_mismatch');
    }
    
    const config = PLATFORMS[platform as keyof typeof PLATFORMS];
    if (!config) {
      return res.redirect(`/settings?error=unsupported_platform`);
    }
    
    const baseUrl = getBaseUrl();
    const redirectUri = `${baseUrl}/api/social/callback/${platform}`;
    
    let tokenData: any;
    
    try {
      const tokenParams = new URLSearchParams();
      tokenParams.set('grant_type', 'authorization_code');
      tokenParams.set('code', code as string);
      tokenParams.set('redirect_uri', redirectUri);
      
      if (platform === 'twitter') {
        tokenParams.set('client_id', config.clientId!);
        tokenParams.set('code_verifier', 'challenge');
      } else if (platform === 'tiktok') {
        tokenParams.set('client_key', config.clientId!);
        tokenParams.set('client_secret', config.clientSecret!);
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
    
    let username = 'Connected User';
    try {
      if (platform === 'twitter') {
        const userResponse = await fetch('https://api.twitter.com/2/users/me', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();
        username = userData.data?.username || 'Twitter User';
      } else if (platform === 'facebook') {
        const userResponse = await fetch(`https://graph.facebook.com/me?access_token=${tokenData.access_token}`);
        const userData = await userResponse.json();
        username = userData.name || 'Facebook User';
      } else if (platform === 'youtube') {
        const userResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const userData = await userResponse.json();
        username = userData.items?.[0]?.snippet?.title || 'YouTube Channel';
      } else if (platform === 'instagram') {
        const userResponse = await fetch(`https://graph.instagram.com/me?fields=username&access_token=${tokenData.access_token}`);
        const userData = await userResponse.json();
        username = userData.username || 'Instagram User';
      } else if (platform === 'tiktok') {
        username = 'TikTok User';
      } else if (platform === 'linkedin') {
        username = 'LinkedIn User';
      }
    } catch (err) {
      logger.warn(`Failed to fetch user info for ${platform}:`, err);
    }
    
    const existingConnection = await db
      .select()
      .from(socialAccounts)
      .where(and(
        eq(socialAccounts.userId, stateData.userId),
        eq(socialAccounts.platform, platform)
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
          username,
          isActive: true,
        })
        .where(eq(socialAccounts.id, existingConnection[0].id));
    } else {
      await db.insert(socialAccounts).values({
        userId: stateData.userId,
        platform,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        tokenExpiresAt: tokenData.expires_in 
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        username,
        platformUserId: tokenData.user_id || null,
        isActive: true,
      });
    }
    
    logger.info(`[OAuth] Successfully connected ${platform} for user`, { 
      userId: stateData.userId, 
      platform,
      username 
    });
    
    res.redirect(`/settings?success=connected&platform=${platform}`);
  } catch (error) {
    logger.error('OAuth callback error:', error);
    res.redirect('/settings?error=callback_failed');
  }
});

router.post('/disconnect/:platform', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const platform = req.params.platform.toLowerCase();
    
    await db
      .update(socialAccounts)
      .set({ isActive: false, accessToken: null, refreshToken: null })
      .where(and(
        eq(socialAccounts.userId, userId),
        eq(socialAccounts.platform, platform)
      ));
    
    logger.info(`[OAuth] Disconnected ${platform} for user`, { userId, platform });
    
    res.json({ success: true, message: `Disconnected from ${platform}` });
  } catch (error) {
    logger.error('Failed to disconnect platform:', error);
    res.status(500).json({ message: 'Failed to disconnect platform' });
  }
});

export default router;
