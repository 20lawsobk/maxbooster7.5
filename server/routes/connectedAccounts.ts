import { Router, Request, Response, RequestHandler } from 'express';
import { logger } from '../logger.js';
import crypto from 'crypto';

const router = Router();

const requireAuth: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

router.use(requireAuth);

interface ConnectedAccount {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  username?: string;
  displayName?: string;
  email?: string;
  avatarUrl?: string;
  connectedAt: Date;
  lastSyncedAt?: Date;
  expiresAt?: Date;
  status: 'connected' | 'expired' | 'error';
  scopes: string[];
  permissions: {
    id: string;
    label: string;
    description: string;
    enabled: boolean;
    required: boolean;
  }[];
}

const userConnectedAccounts: Map<string, ConnectedAccount[]> = new Map();

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

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const accounts = userConnectedAccounts.get(userId) || [];
    
    const safeAccounts = accounts.map(account => ({
      id: account.id,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      username: account.username,
      displayName: account.displayName,
      email: account.email,
      avatarUrl: account.avatarUrl,
      connectedAt: account.connectedAt.toISOString(),
      lastSyncedAt: account.lastSyncedAt?.toISOString(),
      expiresAt: account.expiresAt?.toISOString(),
      status: account.status,
      scopes: account.scopes,
      permissions: account.permissions,
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
    
    const accounts = userConnectedAccounts.get(userId) || [];
    const filteredAccounts = accounts.filter(a => a.id !== accountId);
    
    if (accounts.length === filteredAccounts.length) {
      return res.status(404).json({ error: 'Connected account not found' });
    }
    
    userConnectedAccounts.set(userId, filteredAccounts);
    
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
    
    const accounts = userConnectedAccounts.get(userId) || [];
    const accountIndex = accounts.findIndex(a => a.id === accountId);
    
    if (accountIndex === -1) {
      return res.status(404).json({ error: 'Connected account not found' });
    }
    
    accounts[accountIndex].status = 'connected';
    accounts[accountIndex].lastSyncedAt = new Date();
    accounts[accountIndex].expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    
    userConnectedAccounts.set(userId, accounts);
    
    res.json({ 
      message: 'Connection refreshed successfully',
      account: {
        id: accounts[accountIndex].id,
        status: accounts[accountIndex].status,
        lastSyncedAt: accounts[accountIndex].lastSyncedAt?.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Error refreshing account connection:', error);
    res.status(500).json({ error: 'Failed to refresh account connection' });
  }
});

router.put('/:accountId/permissions', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { accountId } = req.params;
    const permissionUpdates = req.body;
    
    const accounts = userConnectedAccounts.get(userId) || [];
    const accountIndex = accounts.findIndex(a => a.id === accountId);
    
    if (accountIndex === -1) {
      return res.status(404).json({ error: 'Connected account not found' });
    }
    
    const account = accounts[accountIndex];
    
    for (const [permId, enabled] of Object.entries(permissionUpdates)) {
      const permission = account.permissions.find(p => p.id === permId);
      if (permission && !permission.required) {
        permission.enabled = !!enabled;
      }
    }
    
    userConnectedAccounts.set(userId, accounts);
    
    res.json({ 
      message: 'Permissions updated successfully',
      permissions: account.permissions,
    });
  } catch (error) {
    logger.error('Error updating account permissions:', error);
    res.status(500).json({ error: 'Failed to update account permissions' });
  }
});

router.get('/connect/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;
    const userId = req.user.id;
    
    const mockAccount: ConnectedAccount = {
      id: crypto.randomUUID(),
      userId,
      provider,
      providerAccountId: `${provider}_${crypto.randomBytes(8).toString('hex')}`,
      username: `user_${provider}`,
      displayName: `${provider.charAt(0).toUpperCase() + provider.slice(1)} User`,
      connectedAt: new Date(),
      lastSyncedAt: new Date(),
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      status: 'connected',
      scopes: ['read', 'profile'],
      permissions: getDefaultPermissions(provider),
    };
    
    const accounts = userConnectedAccounts.get(userId) || [];
    accounts.push(mockAccount);
    userConnectedAccounts.set(userId, accounts);
    
    res.redirect('/settings?tab=security&connected=' + provider);
  } catch (error) {
    logger.error('Error connecting account:', error);
    res.redirect('/settings?tab=security&error=connection_failed');
  }
});

export default router;
