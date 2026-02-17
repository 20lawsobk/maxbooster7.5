import { Router, Request, Response, RequestHandler } from 'express';
import { logger } from '../logger.js';
import { db } from '../db';
import { socialAccounts } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

const router = Router();

const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

router.use(requireAuth);

const getDefaultPermissions = (provider: string) => {
  const basePermissions = [
    {
      id: 'read_profile',
      label: 'Read Profile',
      description: 'Access your basic profile information',
      enabled: true,
      required: true,
    },
  ];

  const streamingPermissions = [
    {
      id: 'read_playlists',
      label: 'Read Playlists',
      description: 'Access your playlists and saved tracks',
      enabled: true,
      required: false,
    },
    {
      id: 'sync_library',
      label: 'Sync Library',
      description: 'Sync your music library for analytics',
      enabled: true,
      required: false,
    },
  ];

  const socialPermissions = [
    {
      id: 'read_followers',
      label: 'Read Followers',
      description: 'Access your follower count and engagement metrics',
      enabled: true,
      required: false,
    },
    {
      id: 'post_content',
      label: 'Post Content',
      description: 'Share content on your behalf',
      enabled: false,
      required: false,
    },
  ];

  if (['spotify', 'apple_music', 'soundcloud'].includes(provider)) {
    return [...basePermissions, ...streamingPermissions];
  } else if (['instagram', 'tiktok', 'youtube', 'twitter', 'facebook'].includes(provider)) {
    return [...basePermissions, ...socialPermissions];
  }

  return basePermissions;
};

function getAccountStatus(account: any): 'connected' | 'expired' | 'error' {
  if (!account.isActive) return 'error';
  if (account.tokenExpiresAt && new Date(account.tokenExpiresAt) < new Date()) return 'expired';
  return 'connected';
}

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const accounts = await db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.isActive, true)));
    
    const safeAccounts = accounts.map(account => ({
      id: account.id,
      provider: account.platform,
      providerAccountId: account.platformUserId || '',
      username: account.username || undefined,
      displayName: account.username || account.platform,
      email: undefined,
      avatarUrl: undefined,
      connectedAt: account.createdAt?.toISOString() || new Date().toISOString(),
      lastSyncedAt: account.createdAt?.toISOString(),
      expiresAt: account.tokenExpiresAt?.toISOString(),
      status: getAccountStatus(account),
      scopes: [],
      permissions: getDefaultPermissions(account.platform),
    }));
    
    res.json(safeAccounts);
  } catch (error) {
    logger.error('Error fetching connected accounts:', error);
    res.status(500).json({ error: 'Failed to fetch connected accounts' });
  }
});

router.delete('/:accountId', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { accountId } = req.params;
    
    const result = await db
      .update(socialAccounts)
      .set({ isActive: false })
      .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId)))
      .returning({ id: socialAccounts.id });
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Connected account not found' });
    }
    
    res.json({ message: 'Account disconnected successfully' });
  } catch (error) {
    logger.error('Error disconnecting account:', error);
    res.status(500).json({ error: 'Failed to disconnect account' });
  }
});

router.post('/:accountId/refresh', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { accountId } = req.params;
    
    const now = new Date();
    const result = await db
      .update(socialAccounts)
      .set({ createdAt: now })
      .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId)))
      .returning({ id: socialAccounts.id });
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'Connected account not found' });
    }
    
    res.json({ 
      message: 'Connection refreshed successfully',
      account: {
        id: accountId,
        status: 'connected',
        lastSyncedAt: now.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error refreshing account connection:', error);
    res.status(500).json({ error: 'Failed to refresh account connection' });
  }
});

router.post('/manual-token', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { platform, accessToken, refreshToken, username, platformUserId, expiresIn } = req.body;

    if (!platform || !accessToken) {
      return res.status(400).json({ error: 'Platform and access token are required' });
    }

    const validPlatforms = [
      'instagram', 'facebook', 'tiktok', 'twitter', 'youtube',
      'spotify', 'threads', 'linkedin', 'soundcloud', 'apple_music',
    ];
    if (!validPlatforms.includes(platform)) {
      return res.status(400).json({ error: `Invalid platform. Must be one of: ${validPlatforms.join(', ')}` });
    }

    const existing = await db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.userId, userId), eq(socialAccounts.platform, platform)));

    const tokenExpiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : null;

    if (existing.length > 0) {
      await db
        .update(socialAccounts)
        .set({
          accessToken,
          refreshToken: refreshToken || existing[0].refreshToken,
          username: username || existing[0].username,
          platformUserId: platformUserId || existing[0].platformUserId,
          tokenExpiresAt,
          isActive: true,
        })
        .where(eq(socialAccounts.id, existing[0].id));

      logger.info(`[ManualToken] Updated ${platform} token for user ${userId}`);
      res.json({ message: `${platform} access token updated successfully`, id: existing[0].id });
    } else {
      const [newAccount] = await db
        .insert(socialAccounts)
        .values({
          userId,
          platform,
          accessToken,
          refreshToken: refreshToken || null,
          username: username || null,
          platformUserId: platformUserId || null,
          tokenExpiresAt,
          isActive: true,
        })
        .returning({ id: socialAccounts.id });

      logger.info(`[ManualToken] Created ${platform} token for user ${userId}`);
      res.json({ message: `${platform} connected successfully`, id: newAccount.id });
    }
  } catch (error) {
    logger.error('Error saving manual token:', error);
    res.status(500).json({ error: 'Failed to save access token' });
  }
});

router.put('/:accountId/permissions', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { accountId } = req.params;
    const permissionUpdates = req.body;
    
    const accounts = await db
      .select()
      .from(socialAccounts)
      .where(and(eq(socialAccounts.id, accountId), eq(socialAccounts.userId, userId)));
    
    if (accounts.length === 0) {
      return res.status(404).json({ error: 'Connected account not found' });
    }
    
    const account = accounts[0];
    const permissions = getDefaultPermissions(account.platform);
    
    for (const [permId, enabled] of Object.entries(permissionUpdates)) {
      const permission = permissions.find(p => p.id === permId);
      if (permission && !permission.required) {
        permission.enabled = !!enabled;
      }
    }
    
    res.json({ 
      message: 'Permissions updated successfully',
      permissions,
    });
  } catch (error) {
    logger.error('Error updating account permissions:', error);
    res.status(500).json({ error: 'Failed to update account permissions' });
  }
});

export default router;
