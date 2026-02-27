import { Router } from 'express';
import { db } from '../db';
import { pressKits, insertPressKitSchema } from '../../shared/schema';
import { eq } from 'drizzle-orm';
import { requireAuth } from '../middleware/auth';
import { storageService } from '../services/storageService';
import { randomUUID } from 'crypto';

const router = Router();

// GET /api/press-kit - get user's press kit
router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const [pressKit] = await db.select().from(pressKits).where(eq(pressKits.userId, userId)).limit(1);
    
    if (!pressKit) {
      return res.json(null);
    }
    
    res.json(pressKit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch press kit' });
  }
});

// PUT /api/press-kit - create/update press kit (upsert)
router.put('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const validatedData = insertPressKitSchema.parse({ ...req.body, userId });
    
    const [existing] = await db.select().from(pressKits).where(eq(pressKits.userId, userId)).limit(1);
    
    let result;
    if (existing) {
      [result] = await db.update(pressKits)
        .set({ ...validatedData, updatedAt: new Date() })
        .where(eq(pressKits.id, existing.id))
        .returning();
    } else {
      [result] = await db.insert(pressKits).values(validatedData).returning();
    }
    
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid data' });
  }
});

// POST /api/press-kit/photo - upload photo
router.post('/photo', requireAuth, async (req, res) => {
  // Note: Actual file handling usually done via multer in a separate middleware or route like /api/storage/upload
  // This endpoint might just be for updating the photos array in the press kit
  res.status(501).json({ error: 'Use /api/storage/upload for direct uploads' });
});

// DELETE /api/press-kit/photo/:index - remove photo
router.delete('/photo/:index', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const index = parseInt(req.params.index);
    
    const [pressKit] = await db.select().from(pressKits).where(eq(pressKits.userId, userId)).limit(1);
    if (!pressKit) return res.status(404).json({ error: 'Press kit not found' });
    
    const photos = (pressKit.photos as any[]) || [];
    if (index < 0 || index >= photos.length) return res.status(400).json({ error: 'Invalid index' });
    
    const newPhotos = [...photos];
    newPhotos.splice(index, 1);
    
    const [updated] = await db.update(pressKits)
      .set({ photos: newPhotos, updatedAt: new Date() })
      .where(eq(pressKits.id, pressKit.id))
      .returning();
      
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

// GET /api/press-kit/public/:slug - public EPK view (no auth)
router.get('/public/:slug', async (req, res) => {
  try {
    const [pressKit] = await db.select().from(pressKits).where(eq(pressKits.slug, req.params.slug)).limit(1);
    
    if (!pressKit || !pressKit.isPublic) {
      return res.status(404).json({ error: 'Press kit not found or private' });
    }
    
    res.json(pressKit);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch public press kit' });
  }
});

// POST /api/press-kit/publish - generate public link with slug
router.post('/publish', requireAuth, async (req, res) => {
  try {
    const userId = req.session.userId!;
    const { slug, isPublic } = req.body;
    
    const [existing] = await db.select().from(pressKits).where(eq(pressKits.userId, userId)).limit(1);
    if (!existing) return res.status(404).json({ error: 'Press kit not found' });
    
    const [updated] = await db.update(pressKits)
      .set({ slug, isPublic, updatedAt: new Date() })
      .where(eq(pressKits.id, existing.id))
      .returning();
      
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: 'Failed to publish press kit' });
  }
});

export default router;
