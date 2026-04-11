import { Router, type RequestHandler } from 'express';
import { db } from '../db.js';
import { systemLogs, insertSystemLogSchema } from '@shared/schema';
import { eq, desc, and, sql, count } from 'drizzle-orm';
import { logger } from '../logger.js';

const router = Router();

const requireAdmin: RequestHandler = (req, res, next) => {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

router.use(requireAdmin);

router.get('/query', async (req, res) => {
  try {
    const { 
      level = 'all', 
      service = 'all', 
      limit = '100',
      offset = '0'
    } = req.query;
    
    const limitNum = Math.min(parseInt(limit as string) || 100, 1000);
    const offsetNum = parseInt(offset as string) || 0;

    const conditions = [];
    
    if (level !== 'all') {
      conditions.push(eq(systemLogs.level, level as string));
    }
    
    if (service !== 'all') {
      conditions.push(eq(systemLogs.service, service as string));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [logs, totalResult] = await Promise.all([
      db.select()
        .from(systemLogs)
        .where(whereClause)
        .orderBy(desc(systemLogs.timestamp))
        .limit(limitNum)
        .offset(offsetNum),
      db.select({ count: count() })
        .from(systemLogs)
        .where(whereClause)
    ]);

    res.json({
      logs,
      total: totalResult[0]?.count || 0,
      query: { level, service, limit: limitNum, offset: offsetNum },
      pagination: {
        limit: limitNum,
        offset: offsetNum,
        hasMore: logs.length === limitNum
      }
    });
  } catch (error) {
    logger.warn({ err: error }, 'Error querying logs:');
    res.status(500).json({ error: 'Failed to query logs' });
  }
});

router.post('/write', async (req, res) => {
  try {
    const validatedData = insertSystemLogSchema.parse(req.body);
    
    const validLevels = ['debug', 'info', 'warn', 'error', 'fatal'];
    const validServices = ['api', 'auth', 'database', 'ai', 'storage', 'queue', 'email', 'social'];
    
    if (!validLevels.includes(validatedData.level)) {
      return res.status(400).json({ 
        error: `Invalid level. Must be one of: ${validLevels.join(', ')}` 
      });
    }
    
    if (!validServices.includes(validatedData.service)) {
      return res.status(400).json({ 
        error: `Invalid service. Must be one of: ${validServices.join(', ')}` 
      });
    }

    const [inserted] = await db.insert(systemLogs).values(validatedData).returning();

    res.status(201).json({ 
      success: true, 
      log: inserted 
    });
  } catch (error) {
    logger.warn({ err: error }, 'Error writing log:');
    if (error instanceof Error && error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid log data', details: error });
    }
    res.status(500).json({ error: 'Failed to write log' });
  }
});

router.get('/services', async (req, res) => {
  try {
    res.json({
      services: ['api', 'auth', 'database', 'ai', 'storage', 'queue', 'email', 'social']
    });
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching services:');
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

router.get('/levels', async (req, res) => {
  try {
    res.json({
      levels: ['debug', 'info', 'warn', 'error', 'fatal']
    });
  } catch (error) {
    logger.warn({ err: error }, 'Error fetching levels:');
    res.status(500).json({ error: 'Failed to fetch levels' });
  }
});

export default router;
