import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { db } from '../db';
import { projects, markers } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { logger } from '../logger.js';

const router = Router();

// Validation schema
const markerSchema = z.object({
  name: z.string().min(1).max(100),
  time: z.number().min(0),
  position: z.number().min(0),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  type: z.string().optional().default('marker'),
});

// Get all markers for a project
router.get('/projects/:projectId/markers', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Verify project ownership
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const projectMarkers = await db.query.markers.findMany({
      where: eq(markers.projectId, projectId),
      orderBy: (markers, { asc }) => [asc(markers.time)],
    });

    res.json({ markers: projectMarkers });
  } catch (error: unknown) {
    logger.error('Error fetching markers:', error);
    res.status(500).json({ error: 'Failed to fetch markers' });
  }
});

// Create a marker
router.post('/projects/:projectId/markers', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    // Validate input
    const markerData = markerSchema.parse(req.body);

    // Verify project ownership
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [newMarker] = await db
      .insert(markers)
      .values({
        projectId,
        ...markerData,
      })
      .returning();

    res.status(201).json(newMarker);
  } catch (error: unknown) {
    logger.error('Error creating marker:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid marker data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to create marker' });
  }
});

// Update a marker
router.patch('/markers/:markerId', requireAuth, async (req, res) => {
  try {
    const { markerId } = req.params;
    const userId = (req as any).user.id;

    // Partial validation
    const updates = markerSchema.partial().parse(req.body);

    // Get marker and verify ownership
    const marker = await db.query.markers.findFirst({
      where: eq(markers.id, markerId),
    });

    if (!marker) {
      return res.status(404).json({ error: 'Marker not found' });
    }

    // Verify project ownership
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, marker.projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    const [updatedMarker] = await db
      .update(markers)
      .set(updates)
      .where(eq(markers.id, markerId))
      .returning();

    res.json(updatedMarker);
  } catch (error: unknown) {
    logger.error('Error updating marker:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid marker data', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to update marker' });
  }
});

// Delete a marker
router.delete('/markers/:markerId', requireAuth, async (req, res) => {
  try {
    const { markerId } = req.params;
    const userId = (req as any).user.id;

    // Get marker and verify ownership
    const marker = await db.query.markers.findFirst({
      where: eq(markers.id, markerId),
    });

    if (!marker) {
      return res.status(404).json({ error: 'Marker not found' });
    }

    // Verify project ownership
    const project = await db.query.projects.findFirst({
      where: and(eq(projects.id, marker.projectId), eq(projects.userId, userId)),
    });

    if (!project) {
      return res.status(403).json({ error: 'Unauthorized' });
    }

    await db.delete(markers).where(eq(markers.id, markerId));

    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting marker:', error);
    res.status(500).json({ error: 'Failed to delete marker' });
  }
});

export default router;
