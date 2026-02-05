import { Router, Request, Response, RequestHandler } from 'express';
import { db } from '../db.js';
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

interface RecoveryCodeRecord {
  userId: string;
  codes: { code: string; used: boolean; usedAt?: Date }[];
  generatedAt: Date;
  lastUsedAt?: Date;
}

const userRecoveryCodes: Map<string, RecoveryCodeRecord> = new Map();

const generateRecoveryCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

const generateRecoveryCodes = (count: number = 10): string[] => {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    codes.push(generateRecoveryCode());
  }
  return codes;
};

router.get('/status', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const record = userRecoveryCodes.get(userId);
    
    if (!record) {
      return res.json({
        enabled: false,
        codesRemaining: 0,
        totalCodes: 0,
      });
    }
    
    const unusedCodes = record.codes.filter(c => !c.used);
    
    res.json({
      enabled: true,
      codesRemaining: unusedCodes.length,
      totalCodes: record.codes.length,
      lastGeneratedAt: record.generatedAt.toISOString(),
      lastUsedAt: record.lastUsedAt?.toISOString(),
    });
  } catch (error) {
    logger.error('Error fetching recovery codes status:', error);
    res.status(500).json({ error: 'Failed to fetch recovery codes status' });
  }
});

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const codes = generateRecoveryCodes(10);
    
    const record: RecoveryCodeRecord = {
      userId,
      codes: codes.map(code => ({
        code: crypto.createHash('sha256').update(code).digest('hex'),
        used: false,
      })),
      generatedAt: new Date(),
    };
    
    userRecoveryCodes.set(userId, record);
    
    res.json({
      codes,
      generatedAt: record.generatedAt.toISOString(),
    });
  } catch (error) {
    logger.error('Error generating recovery codes:', error);
    res.status(500).json({ error: 'Failed to generate recovery codes' });
  }
});

router.post('/verify', async (req: Request, res: Response) => {
  try {
    const userId = req.user.id;
    const { code } = req.body;
    
    if (!code || typeof code !== 'string') {
      return res.status(400).json({ error: 'Recovery code is required' });
    }
    
    const record = userRecoveryCodes.get(userId);
    
    if (!record) {
      return res.status(400).json({ error: 'No recovery codes set up' });
    }
    
    const codeHash = crypto.createHash('sha256').update(code.toUpperCase().replace(/-/g, '')).digest('hex');
    const codeRecord = record.codes.find(c => c.code === codeHash && !c.used);
    
    if (!codeRecord) {
      return res.status(400).json({ error: 'Invalid or already used recovery code' });
    }
    
    codeRecord.used = true;
    codeRecord.usedAt = new Date();
    record.lastUsedAt = new Date();
    userRecoveryCodes.set(userId, record);
    
    const remainingCodes = record.codes.filter(c => !c.used).length;
    
    res.json({
      success: true,
      codesRemaining: remainingCodes,
    });
  } catch (error) {
    logger.error('Error verifying recovery code:', error);
    res.status(500).json({ error: 'Failed to verify recovery code' });
  }
});

export default router;
