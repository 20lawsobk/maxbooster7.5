import { Router, Request, Response } from 'express';
import { apiKeyService } from '../services/apiKeyService';
import { z } from 'zod';
import { logger } from '../logger.js';

const router = Router();

// Schema for API key creation
const createApiKeySchema = z.object({
  keyName: z.string().min(1).max(255),
  tier: z.enum(['free', 'pro', 'enterprise']).optional().default('free'),
});

// Schema for query parameters
const usageQuerySchema = z.object({
  days: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val) : 30)),
});

/**
 * POST /api/developer/keys/create
 * Generate a new API key for the authenticated user
 */
router.post('/keys/create', async (req: Request, res: Response) => {
  try {
    // Check if user is authenticated
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'You must be logged in to create API keys',
      });
    }

    // Validate request body
    const validation = createApiKeySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid request body',
        details: validation.error.errors,
      });
    }

    const { keyName, tier } = validation.data;
    const userId = req.user.id;

    // Check subscription tier for premium API keys
    if (
      tier === 'pro' &&
      req.user.subscriptionTier !== 'premium' &&
      req.user.subscriptionTier !== 'pro'
    ) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Pro API keys require a Premium or Pro subscription',
      });
    }

    if (tier === 'enterprise' && req.user.subscriptionTier !== 'enterprise') {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Enterprise API keys require an Enterprise subscription',
      });
    }

    // Generate API key
    const apiKey = await apiKeyService.generateApiKey(userId, keyName, tier);

    return res.status(201).json({
      success: true,
      message: 'API key created successfully',
      apiKey: {
        id: apiKey.id,
        keyName: apiKey.keyName,
        apiKey: apiKey.apiKey, // Full key shown only once
        tier: apiKey.tier,
        rateLimit: apiKey.rateLimit,
        createdAt: apiKey.createdAt,
      },
      warning: 'Save this API key securely. You will not be able to view it again.',
    });
  } catch (error: unknown) {
    logger.error('Error creating API key:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create API key',
    });
  }
});

/**
 * GET /api/developer/keys
 * List all API keys for the authenticated user
 */
router.get('/keys', async (req: Request, res: Response) => {
  try {
    // Check if user is authenticated
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'You must be logged in to view API keys',
      });
    }

    const userId = req.user.id;

    // Get user's API keys
    const apiKeys = await apiKeyService.listApiKeys(userId);

    return res.json({
      success: true,
      total: apiKeys.length,
      apiKeys: apiKeys.map((key) => ({
        id: key.id,
        keyName: key.keyName,
        apiKeyPreview: key.apiKeyPreview,
        tier: key.tier,
        rateLimit: key.rateLimit,
        isActive: key.isActive,
        lastUsedAt: key.lastUsedAt,
        createdAt: key.createdAt,
        expiresAt: key.expiresAt,
      })),
    });
  } catch (error: unknown) {
    logger.error('Error listing API keys:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to list API keys',
    });
  }
});

/**
 * DELETE /api/developer/keys/:keyId
 * Revoke an API key
 */
router.delete('/keys/:keyId', async (req: Request, res: Response) => {
  try {
    // Check if user is authenticated
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'You must be logged in to revoke API keys',
      });
    }

    const userId = req.user.id;
    const keyId = req.params.keyId;

    if (!keyId) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'API key ID is required',
      });
    }

    // Revoke the API key
    await apiKeyService.revokeApiKey(keyId, userId);

    return res.json({
      success: true,
      message: 'API key revoked successfully',
    });
  } catch (error: unknown) {
    logger.error('Error revoking API key:', error);

    if (error.message === 'API key not found or unauthorized') {
      return res.status(404).json({
        error: 'Not Found',
        message: 'API key not found or you do not have permission to revoke it',
      });
    }

    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to revoke API key',
    });
  }
});

/**
 * GET /api/developer/usage
 * Get usage statistics for all user's API keys
 */
router.get('/usage', async (req: Request, res: Response) => {
  try {
    // Check if user is authenticated
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'You must be logged in to view API usage',
      });
    }

    const userId = req.user.id;

    // Validate query parameters
    const validation = usageQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
    }

    const { days } = validation.data;

    // Get usage statistics
    const usageStats = await apiKeyService.getUserApiUsageStats(userId, days);

    // Calculate total usage across all keys
    const totalUsage = usageStats.reduce(
      (acc, key) => ({
        totalRequests: acc.totalRequests + (key.totalRequests || 0),
      }),
      { totalRequests: 0 }
    );

    return res.json({
      success: true,
      timeRange: {
        days,
        start: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
      },
      totalUsage,
      byApiKey: usageStats,
    });
  } catch (error: unknown) {
    logger.error('Error fetching API usage:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch API usage statistics',
    });
  }
});

/**
 * GET /api/developer/usage/:keyId
 * Get detailed usage statistics for a specific API key
 */
router.get('/usage/:keyId', async (req: Request, res: Response) => {
  try {
    // Check if user is authenticated
    if (!req.user?.id) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'You must be logged in to view API usage',
      });
    }

    const userId = req.user.id;
    const keyId = req.params.keyId;

    // Validate query parameters
    const validation = usageQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid query parameters',
        details: validation.error.errors,
      });
    }

    const { days } = validation.data;

    // Verify the API key belongs to the user
    const apiKey = await apiKeyService.getApiKeyById(keyId);
    if (!apiKey || apiKey.userId !== userId) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'API key not found or you do not have permission to view it',
      });
    }

    // Get usage statistics
    const usageStats = await apiKeyService.getApiKeyUsageStats(keyId, days);

    return res.json({
      success: true,
      apiKey: {
        id: apiKey.id,
        keyName: apiKey.keyName,
        tier: apiKey.tier,
        rateLimit: apiKey.rateLimit,
      },
      timeRange: {
        days,
        start: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString(),
      },
      usage: usageStats,
    });
  } catch (error: unknown) {
    logger.error('Error fetching API key usage:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to fetch API key usage statistics',
    });
  }
});

/**
 * GET /api/developer/docs
 * Get API documentation metadata
 */
router.get('/docs', async (req: Request, res: Response) => {
  return res.json({
    success: true,
    version: '1.0.0',
    baseUrl: '/api/v1',
    authentication: {
      type: 'Bearer Token',
      header: 'Authorization',
      format: 'Bearer <api_key>',
    },
    rateLimits: {
      free: {
        limit: 100,
        per: 'second',
      },
      pro: {
        limit: 1000,
        per: 'second',
      },
      enterprise: {
        limit: 5000,
        per: 'second',
      },
    },
    endpoints: [
      {
        path: '/analytics/platforms',
        method: 'GET',
        description: 'List connected platforms',
      },
      {
        path: '/analytics/streams/:artistId?',
        method: 'GET',
        description: 'Get streaming statistics',
        params: {
          artistId: 'Optional - Artist/User ID (defaults to authenticated user)',
        },
        query: {
          startDate: 'Optional - Start date (ISO 8601)',
          endDate: 'Optional - End date (ISO 8601)',
          platform: 'Optional - Filter by platform',
          timeRange: 'Optional - Time range (e.g., 30d, 7d)',
        },
      },
      {
        path: '/analytics/engagement/:artistId?',
        method: 'GET',
        description: 'Get engagement metrics',
      },
      {
        path: '/analytics/demographics/:artistId?',
        method: 'GET',
        description: 'Get audience demographics',
      },
      {
        path: '/analytics/playlists/:artistId?',
        method: 'GET',
        description: 'Get playlist placements',
      },
      {
        path: '/analytics/tracks/:artistId?',
        method: 'GET',
        description: 'Get track performance data',
        query: {
          limit: 'Optional - Number of tracks to return (default: 50)',
          sortBy: 'Optional - Sort by streams or revenue (default: streams)',
        },
      },
      {
        path: '/analytics/summary/:artistId?',
        method: 'GET',
        description: 'Get complete analytics summary',
      },
    ],
    examples: {
      curl: `curl -H "Authorization: Bearer mb_live_..." https://your-domain.com/api/v1/analytics/streams`,
      javascript: `
fetch('https://your-domain.com/api/v1/analytics/streams', {
  headers: {
    'Authorization': 'Bearer mb_live_...'
  }
})
.then(response => response.json())
.then(data => logger.info(data));
      `.trim(),
      python: `
import requests
import { logger } from '../logger.js';

headers = {
    'Authorization': 'Bearer mb_live_...'
}

response = requests.get('https://your-domain.com/api/v1/analytics/streams', headers=headers)
data = response.json()
print(data)
      `.trim(),
    },
  });
});

export default router;
