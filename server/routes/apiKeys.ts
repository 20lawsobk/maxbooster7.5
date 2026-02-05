import { Router, Request, Response, RequestHandler } from 'express';
import { db } from '../db.js';
import { eq, and, desc } from 'drizzle-orm';
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

interface ApiKeyRecord {
  id: string;
  userId: string;
  name: string;
  keyHash: string;
  keyPreview: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt?: Date;
  expiresAt?: Date;
  status: 'active' | 'expired' | 'revoked';
  rateLimit: {
    requests: number;
    period: string;
    used: number;
  };
}

const userApiKeys: Map<string, ApiKeyRecord[]> = new Map();

const generateApiKey = (): string => {
  const prefix = 'mb_';
  const key = crypto.randomBytes(32).toString('base64url');
  return `${prefix}${key}`;
};

const hashApiKey = (key: string): string => {
  return crypto.createHash('sha256').update(key).digest('hex');
};

const getKeyPreview = (key: string): string => {
  return `${key.substring(0, 7)}...${key.substring(key.length - 4)}`;
};

router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const keys = userApiKeys.get(userId) || [];
    
    const safeKeys = keys.map(key => ({
      id: key.id,
      name: key.name,
      keyPreview: key.keyPreview,
      createdAt: key.createdAt.toISOString(),
      lastUsedAt: key.lastUsedAt?.toISOString(),
      expiresAt: key.expiresAt?.toISOString(),
      scopes: key.scopes,
      status: key.status,
      rateLimit: key.rateLimit,
    }));
    
    res.json(safeKeys);
  } catch (error) {
    logger.error('Error fetching API keys:', error);
    res.status(500).json({ error: 'Failed to fetch API keys' });
  }
});

router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { name, scopes = ['read'] } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Key name is required' });
    }
    
    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyPreview = getKeyPreview(rawKey);
    
    const newKey: ApiKeyRecord = {
      id: crypto.randomUUID(),
      userId,
      name: name.trim(),
      keyHash,
      keyPreview,
      scopes: Array.isArray(scopes) ? scopes : ['read'],
      createdAt: new Date(),
      status: 'active',
      rateLimit: {
        requests: 1000,
        period: 'hour',
        used: 0,
      },
    };
    
    const existingKeys = userApiKeys.get(userId) || [];
    existingKeys.push(newKey);
    userApiKeys.set(userId, existingKeys);
    
    res.status(201).json({
      id: newKey.id,
      name: newKey.name,
      key: rawKey,
      keyPreview: newKey.keyPreview,
      createdAt: newKey.createdAt.toISOString(),
      scopes: newKey.scopes,
    });
  } catch (error) {
    logger.error('Error creating API key:', error);
    res.status(500).json({ error: 'Failed to create API key' });
  }
});

router.delete('/:keyId', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;
    
    const keys = userApiKeys.get(userId) || [];
    const keyIndex = keys.findIndex(k => k.id === keyId);
    
    if (keyIndex === -1) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    keys[keyIndex].status = 'revoked';
    userApiKeys.set(userId, keys);
    
    res.json({ message: 'API key revoked successfully' });
  } catch (error) {
    logger.error('Error revoking API key:', error);
    res.status(500).json({ error: 'Failed to revoke API key' });
  }
});

router.post('/:keyId/regenerate', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { keyId } = req.params;
    
    const keys = userApiKeys.get(userId) || [];
    const keyIndex = keys.findIndex(k => k.id === keyId);
    
    if (keyIndex === -1) {
      return res.status(404).json({ error: 'API key not found' });
    }
    
    const existingKey = keys[keyIndex];
    const rawKey = generateApiKey();
    const keyHash = hashApiKey(rawKey);
    const keyPreview = getKeyPreview(rawKey);
    
    keys[keyIndex] = {
      ...existingKey,
      keyHash,
      keyPreview,
      createdAt: new Date(),
      lastUsedAt: undefined,
      rateLimit: {
        ...existingKey.rateLimit,
        used: 0,
      },
    };
    
    userApiKeys.set(userId, keys);
    
    res.json({
      id: keys[keyIndex].id,
      name: keys[keyIndex].name,
      key: rawKey,
      keyPreview: keys[keyIndex].keyPreview,
      createdAt: keys[keyIndex].createdAt.toISOString(),
      scopes: keys[keyIndex].scopes,
    });
  } catch (error) {
    logger.error('Error regenerating API key:', error);
    res.status(500).json({ error: 'Failed to regenerate API key' });
  }
});

export default router;
