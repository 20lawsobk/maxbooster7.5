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
    name: 'Meta (Facebook & Instagram)',
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scope: 'public_profile,email,pages_show_list,pages_read_engagement,pages_manage_posts,pages_read_user_content,business_management,instagram_basic,instagram_content_publish,instagram_manage_comments,instagram_manage_insights',
    clientId: process.env.FACEBOOK_APP_ID,
    clientSecret: process.env.FACEBOOK_APP_SECRET,
    usePKCE: false,
    responseType: 'code',
  },
};

const oauthStates = new Map<string, { userId: string; platform: string; createdAt: Date; codeVerifier?: string }>();

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
  meta: '/auth/meta/callback',
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
    const redirectUri = getCallbackUrl(platform);
    
    const params = new URLSearchParams();
    params.set('client_id', config.clientId);
    params.set('redirect_uri', redirectUri);
    params.set('scope', config.scope);
    params.set('state', state);
    params.set('response_type', 'code');
    
    oauthStates.set(state, { userId, platform, createdAt: new Date() });
    
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
    
    const redirectUri = getCallbackUrl(platform);
    
    let tokenData: any;
    
    try {
      const tokenParams = new URLSearchParams();
      tokenParams.set('grant_type', 'authorization_code');
      tokenParams.set('code', code as string);
      tokenParams.set('redirect_uri', redirectUri);
      tokenParams.set('client_id', config.clientId!);
      tokenParams.set('client_secret', config.clientSecret!);
      
      const headers: Record<string, string> = {
        'Content-Type': 'application/x-www-form-urlencoded',
      };
      
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
    
    let username = 'Meta User';
    let facebookName = '';
    let instagramUsername = '';
    
    try {
      const fbResponse = await fetch(`https://graph.facebook.com/me?access_token=${tokenData.access_token}`);
      const fbData = await fbResponse.json();
      facebookName = fbData.name || '';
      
      try {
        const pagesResponse = await fetch(`https://graph.facebook.com/me/accounts?access_token=${tokenData.access_token}`);
        const pagesData = await pagesResponse.json();
        
        if (pagesData.data && pagesData.data.length > 0) {
          const pageId = pagesData.data[0].id;
          const pageToken = pagesData.data[0].access_token;
          
          const igResponse = await fetch(`https://graph.facebook.com/${pageId}?fields=instagram_business_account&access_token=${pageToken}`);
          const igData = await igResponse.json();
          
          if (igData.instagram_business_account) {
            const igAccountResponse = await fetch(`https://graph.facebook.com/${igData.instagram_business_account.id}?fields=username&access_token=${pageToken}`);
            const igAccountData = await igAccountResponse.json();
            instagramUsername = igAccountData.username || '';
          }
        }
      } catch (igErr) {
        logger.warn('Failed to fetch Instagram account:', igErr);
      }
      
      if (facebookName && instagramUsername) {
        username = `${facebookName} / @${instagramUsername}`;
      } else if (facebookName) {
        username = facebookName;
      } else if (instagramUsername) {
        username = `@${instagramUsername}`;
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
