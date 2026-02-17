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
    scope: 'user.info.basic,user.info.profile,user.info.stats,video.list',
    clientId: process.env.TIKTOK_CLIENT_KEY,
    clientSecret: process.env.TIKTOK_CLIENT_SECRET,
    usePKCE: true,
    responseType: 'code',
    enabled: !!(process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET),
  },
  tiktok2: {
    name: 'TikTok (App 2)',
    authUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    scope: 'user.info.basic,user.info.profile,user.info.stats,video.list',
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
    tokenUrl: 'https://api.twitter.com/2/oauth2/token',
    scope: 'tweet.read tweet.write users.read follows.read follows.write offline.access',
    clientId: process.env.TWITTER_API_KEY,
    clientSecret: process.env.TWITTER_API_SECRET,
    usePKCE: true,
    responseType: 'code',
    enabled: !!(process.env.TWITTER_API_KEY && process.env.TWITTER_API_SECRET),
  },
};

const oauthStates = new Map<string, { userId: string; platform: string; createdAt: Date; codeVerifier?: string }>();

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
  tiktok2: '/auth/tiktok/callback',
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
    logger.error('Failed to get social connections:', error);
    res.json([]);
  }
});

router.get('/platforms', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const platformList = Object.entries(PLATFORMS)
    .filter(([key]) => key !== 'tiktok2')
    .map(([key, config]) => ({
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
    let platform = req.params.platform.toLowerCase();
    
    if (platform === 'tiktok') {
      const primary = PLATFORMS.tiktok;
      const secondary = PLATFORMS.tiktok2;
      if (!primary.enabled && secondary.enabled) {
        platform = 'tiktok2';
      }
    }
    
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
      
      if (platform === 'twitter') {
        const codeChallenge = generateCodeChallenge(codeVerifier, 'base64url');
        params.set('response_type', 'code');
        params.set('client_id', config.clientId);
        params.set('redirect_uri', redirectUri);
        params.set('scope', config.scope);
        params.set('state', state);
        params.set('code_challenge', codeChallenge);
        params.set('code_challenge_method', 'S256');
      } else if (platform === 'tiktok' || platform === 'tiktok2') {
        const codeChallenge = generateCodeChallenge(codeVerifier, 'hex');
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

    if (platform === 'threads') {
      params.set('force_authentication', '1');
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
      return res.redirect(`/social-media?error=oauth_denied&platform=${platform}`);
    }
    
    if (!state || !oauthStates.has(state as string)) {
      return res.redirect('/social-media?error=invalid_state');
    }
    
    const stateData = oauthStates.get(state as string)!;
    oauthStates.delete(state as string);
    
    if ((platform === 'facebook' || platform === 'instagram') && stateData.platform === 'meta') {
      platform = 'meta';
    }
    
    if (platform === 'tiktok' && stateData.platform === 'tiktok2') {
      platform = 'tiktok2';
    }
    
    if (stateData.platform !== platform) {
      return res.redirect('/social-media?error=platform_mismatch');
    }
    
    const config = PLATFORMS[platform as keyof typeof PLATFORMS];
    if (!config) {
      return res.redirect(`/social-media?error=unsupported_platform`);
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
      } else if (platform === 'tiktok' || platform === 'tiktok2') {
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
        logger.error(`Token exchange failed for ${platform}:`, { status: tokenResponse.status, data: tokenData });
        const errorDetail = tokenData.error_description || tokenData.error || 'unknown';
        return res.redirect(`/social-media?error=token_exchange_failed&platform=${platform}&detail=${encodeURIComponent(errorDetail)}`);
      }
    } catch (err) {
      logger.error(`Token exchange error for ${platform}:`, err);
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
          const userResponse = await fetch(`https://graph.facebook.com/me?fields=id,name,picture&access_token=${tokenData.access_token}`);
          const userData = await userResponse.json();
          facebookUsername = userData.name || 'Facebook User';
          username = facebookUsername;
          facebookPlatformUserId = userData.id || '';
          facebookProfileUrl = `https://www.facebook.com/${userData.id}`;
          facebookMetadata = { picture: userData.picture?.data?.url };
        } catch (fbErr) {
          logger.warn('Failed to fetch Facebook user info:', fbErr);
        }
        
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
              const igUserResponse = await fetch(
                `https://graph.facebook.com/${igAccountData.instagram_business_account.id}?fields=username,followers_count,media_count&access_token=${pageToken}`
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
          logger.warn('Failed to fetch Instagram username:', igErr);
        }
      } else if (platform === 'twitter') {
        try {
          const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics,profile_image_url,description', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          const userData = await userResponse.json();
          username = userData.data?.username || 'Twitter User';
          followerCount = userData.data?.public_metrics?.followers_count || 0;
          platformUserId = userData.data?.id || '';
          profileUrl = `https://x.com/${userData.data?.username}`;
          metadata = { followingCount: userData.data?.public_metrics?.following_count || 0, tweetCount: userData.data?.public_metrics?.tweet_count || 0, listedCount: userData.data?.public_metrics?.listed_count || 0, profileImageUrl: userData.data?.profile_image_url };
        } catch (twitterErr) {
          logger.warn('Failed to fetch Twitter user info:', twitterErr);
        }
      } else if (platform === 'youtube') {
        try {
          const userResponse = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics&mine=true', {
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
          logger.warn('Failed to fetch YouTube channel info:', ytErr);
        }
      } else if (platform === 'tiktok' || platform === 'tiktok2') {
        try {
          const userResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,follower_count,following_count,likes_count,video_count', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
          });
          const userData = await userResponse.json();
          const tiktokData = userData.data?.user;
          username = tiktokData?.display_name || 'TikTok User';
          followerCount = tiktokData?.follower_count || 0;
          profileUrl = tiktokData?.avatar_url || '';
          platformUserId = tiktokData?.open_id || tokenData.open_id || '';
          metadata = { followingCount: tiktokData?.following_count || 0, likesCount: tiktokData?.likes_count || 0, videoCount: tiktokData?.video_count || 0 };
        } catch (tiktokErr) {
          logger.warn('Failed to fetch TikTok user info:', tiktokErr);
          username = 'TikTok User';
        }
      } else if (platform === 'linkedin') {
        try {
          const userResponse = await fetch('https://api.linkedin.com/v2/userinfo', {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` },
          });
          const userData = await userResponse.json();
          username = userData.name || 'LinkedIn User';
          platformUserId = userData.sub || '';
          profileUrl = `https://www.linkedin.com/in/${userData.sub}`;
          metadata = { email: userData.email, picture: userData.picture };
        } catch (linkedinErr) {
          logger.warn('Failed to fetch LinkedIn user info:', linkedinErr);
          username = 'LinkedIn User';
        }
      } else if (platform === 'threads') {
        try {
          const userResponse = await fetch(`https://graph.threads.net/me?fields=id,username,threads_profile_picture_url&access_token=${tokenData.access_token}`);
          const userData = await userResponse.json();
          username = userData.username || 'Threads User';
          platformUserId = userData.id || '';
          profileUrl = `https://www.threads.net/@${userData.username}`;
          metadata = { profilePictureUrl: userData.threads_profile_picture_url };
        } catch (threadsErr) {
          logger.warn('Failed to fetch Threads user info:', threadsErr);
          username = 'Threads User';
        }
      } else if (platform === 'google' || platform === 'googlebusiness') {
        try {
          const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
          });
          const userData = await userResponse.json();
          username = userData.name || 'Google User';
          platformUserId = userData.id || '';
          profileUrl = '';
          metadata = { email: userData.email, picture: userData.picture };
        } catch (googleErr) {
          logger.warn('Failed to fetch Google user info:', googleErr);
          username = 'Google User';
        }
      }
    } catch (err) {
      logger.warn(`Failed to fetch user info for ${platform}:`, err);
    }
    
    const savePlatformName = (platform === 'tiktok2') ? 'tiktok' : platform;
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
      
      logger.info(`[OAuth] Successfully connected ${p.name} for user`, { 
        userId: stateData.userId, 
        platform: p.name,
        username: p.username 
      });
    }
    
    const redirectPlatform = platform === 'meta' ? 'facebook,instagram' : savePlatformName;
    const connectedUsername = platformsToSave[0]?.username || '';
    res.redirect(`/social-media?success=connected&platform=${redirectPlatform}&username=${encodeURIComponent(connectedUsername)}`);
  } catch (error) {
    logger.error('OAuth callback error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.redirect(`/social-media?error=callback_failed&message=${encodeURIComponent(errorMessage)}`);
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
    logger.error('Failed to disconnect platform:', error);
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

    const { syncPlatformData } = await import('../services/socialSyncService');
    const results = await syncPlatformData(userId, platform);

    res.json({ success: true, results });
  } catch (error) {
    logger.error('Failed to sync platform stats:', error);
    res.status(500).json({ message: 'Failed to sync platform stats' });
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
      ));
    
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
    
    const { socialOAuth } = await import('../services/socialOAuthService');
    const result = await socialOAuth.refreshAccessToken(userId, platform);
    
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
    logger.error('Failed to refresh token:', error);
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
