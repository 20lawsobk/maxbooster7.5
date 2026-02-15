import { Router } from 'express';
import { requireAuth } from '../auth';
import { db } from '../db';
import { projects } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { compingService } from '../services/compingService';
import { logger } from '../logger.js';

const router = Router();

const createTakeGroupSchema = z.object({
  trackId: z.string().min(1),
  name: z.string().min(1).max(255),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  metadata: z.record(z.any()).optional(),
});

const updateTakeGroupSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  startTime: z.number().min(0).optional(),
  endTime: z.number().min(0).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  status: z.enum(['recording', 'editing', 'comped', 'rendered', 'archived']).optional(),
  isExpanded: z.boolean().optional(),
  metadata: z.record(z.any()).optional(),
});

const createTakeLaneSchema = z.object({
  takeGroupId: z.string().min(1),
  audioClipId: z.string().optional(),
  name: z.string().min(1).max(255),
  laneIndex: z.number().int().min(0).optional(),
  volume: z.number().min(0).max(2).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  rating: z.number().int().min(0).max(5).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const updateTakeLaneSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  isMuted: z.boolean().optional(),
  isSolo: z.boolean().optional(),
  isActive: z.boolean().optional(),
  volume: z.number().min(0).max(2).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  rating: z.number().int().min(0).max(5).optional(),
  notes: z.string().optional(),
  audioClipId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const createTakeSegmentSchema = z.object({
  takeGroupId: z.string().min(1),
  takeLaneId: z.string().min(1),
  compVersionId: z.string().optional(),
  startTime: z.number().min(0),
  endTime: z.number().min(0),
  fadeIn: z.number().min(0).optional(),
  fadeOut: z.number().min(0).optional(),
  crossfadeType: z.enum(['linear', 'exponential', 'logarithmic', 'equal_power']).optional(),
  gain: z.number().optional(),
  isSelected: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  metadata: z.record(z.any()).optional(),
});

const updateTakeSegmentSchema = z.object({
  startTime: z.number().min(0).optional(),
  endTime: z.number().min(0).optional(),
  fadeIn: z.number().min(0).optional(),
  fadeOut: z.number().min(0).optional(),
  crossfadeType: z.enum(['linear', 'exponential', 'logarithmic', 'equal_power']).optional(),
  gain: z.number().optional(),
  isSelected: z.boolean().optional(),
  order: z.number().int().min(0).optional(),
  metadata: z.record(z.any()).optional(),
});

const createCompVersionSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

const reorderLanesSchema = z.object({
  laneIds: z.array(z.string().min(1)),
});

async function verifyProjectOwnership(projectId: string, userId: string): Promise<boolean> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });
  return !!project;
}

router.post('/projects/:projectId/comping/groups', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = createTakeGroupSchema.parse(req.body);
    
    const takeGroup = await compingService.createTakeGroup({
      projectId,
      ...data,
    });

    res.status(201).json(takeGroup);
  } catch (error: unknown) {
    logger.error('Error creating take group:', error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: (error as any).errors });
    }
    res.status(500).json({ error: 'Failed to create take group' });
  }
});

router.get('/projects/:projectId/comping/groups', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const takeGroups = await compingService.getProjectTakeGroups(projectId);
    res.json({ takeGroups });
  } catch (error: unknown) {
    logger.error('Error fetching take groups:', error);
    res.status(500).json({ error: 'Failed to fetch take groups' });
  }
});

router.get('/projects/:projectId/comping/groups/:groupId', requireAuth, async (req, res) => {
  try {
    const { projectId, groupId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const takeGroup = await compingService.getTakeGroupWithDetails(groupId);
    if (!takeGroup || takeGroup.projectId !== projectId) {
      return res.status(404).json({ error: 'Take group not found' });
    }

    res.json(takeGroup);
  } catch (error: unknown) {
    logger.error('Error fetching take group:', error);
    res.status(500).json({ error: 'Failed to fetch take group' });
  }
});

router.put('/projects/:projectId/comping/groups/:groupId', requireAuth, async (req, res) => {
  try {
    const { projectId, groupId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updates = updateTakeGroupSchema.parse(req.body);
    const takeGroup = await compingService.updateTakeGroup(groupId, updates);

    res.json(takeGroup);
  } catch (error: unknown) {
    logger.error('Error updating take group:', error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: (error as any).errors });
    }
    res.status(500).json({ error: 'Failed to update take group' });
  }
});

router.delete('/projects/:projectId/comping/groups/:groupId', requireAuth, async (req, res) => {
  try {
    const { projectId, groupId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await compingService.deleteTakeGroup(groupId);
    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting take group:', error);
    res.status(500).json({ error: 'Failed to delete take group' });
  }
});

router.post('/projects/:projectId/comping/groups/:groupId/duplicate', requireAuth, async (req, res) => {
  try {
    const { projectId, groupId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const newGroup = await compingService.duplicateTakeGroup(groupId);
    res.status(201).json(newGroup);
  } catch (error: unknown) {
    logger.error('Error duplicating take group:', error);
    res.status(500).json({ error: 'Failed to duplicate take group' });
  }
});

router.post('/projects/:projectId/comping/lanes', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = createTakeLaneSchema.parse(req.body);
    const takeLane = await compingService.createTakeLane(data);

    res.status(201).json(takeLane);
  } catch (error: unknown) {
    logger.error('Error creating take lane:', error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: (error as any).errors });
    }
    res.status(500).json({ error: 'Failed to create take lane' });
  }
});

router.get('/projects/:projectId/comping/groups/:groupId/lanes', requireAuth, async (req, res) => {
  try {
    const { projectId, groupId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const lanes = await compingService.getGroupLanes(groupId);
    res.json({ lanes });
  } catch (error: unknown) {
    logger.error('Error fetching take lanes:', error);
    res.status(500).json({ error: 'Failed to fetch take lanes' });
  }
});

router.put('/projects/:projectId/comping/lanes/:laneId', requireAuth, async (req, res) => {
  try {
    const { projectId, laneId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updates = updateTakeLaneSchema.parse(req.body);
    const lane = await compingService.updateTakeLane(laneId, updates);

    res.json(lane);
  } catch (error: unknown) {
    logger.error('Error updating take lane:', error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: (error as any).errors });
    }
    res.status(500).json({ error: 'Failed to update take lane' });
  }
});

router.delete('/projects/:projectId/comping/lanes/:laneId', requireAuth, async (req, res) => {
  try {
    const { projectId, laneId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await compingService.deleteTakeLane(laneId);
    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting take lane:', error);
    res.status(500).json({ error: 'Failed to delete take lane' });
  }
});

router.put('/projects/:projectId/comping/groups/:groupId/lanes/reorder', requireAuth, async (req, res) => {
  try {
    const { projectId, groupId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { laneIds } = reorderLanesSchema.parse(req.body);
    await compingService.reorderLanes(groupId, laneIds);

    res.json({ success: true });
  } catch (error: unknown) {
    logger.error('Error reordering lanes:', error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: (error as any).errors });
    }
    res.status(500).json({ error: 'Failed to reorder lanes' });
  }
});

router.post('/projects/:projectId/comping/segments', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = createTakeSegmentSchema.parse(req.body);
    const segment = await compingService.createTakeSegment(data);

    res.status(201).json(segment);
  } catch (error: unknown) {
    logger.error('Error creating take segment:', error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: (error as any).errors });
    }
    res.status(500).json({ error: 'Failed to create take segment' });
  }
});

router.get('/projects/:projectId/comping/groups/:groupId/segments', requireAuth, async (req, res) => {
  try {
    const { projectId, groupId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const segments = await compingService.getGroupSegments(groupId);
    res.json({ segments });
  } catch (error: unknown) {
    logger.error('Error fetching take segments:', error);
    res.status(500).json({ error: 'Failed to fetch take segments' });
  }
});

router.put('/projects/:projectId/comping/segments/:segmentId', requireAuth, async (req, res) => {
  try {
    const { projectId, segmentId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const updates = updateTakeSegmentSchema.parse(req.body);
    const segment = await compingService.updateTakeSegment(segmentId, updates);

    res.json(segment);
  } catch (error: unknown) {
    logger.error('Error updating take segment:', error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: (error as any).errors });
    }
    res.status(500).json({ error: 'Failed to update take segment' });
  }
});

router.delete('/projects/:projectId/comping/segments/:segmentId', requireAuth, async (req, res) => {
  try {
    const { projectId, segmentId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await compingService.deleteTakeSegment(segmentId);
    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting take segment:', error);
    res.status(500).json({ error: 'Failed to delete take segment' });
  }
});

router.post('/projects/:projectId/comping/groups/:groupId/versions', requireAuth, async (req, res) => {
  try {
    const { projectId, groupId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = createCompVersionSchema.parse(req.body);
    const version = await compingService.createCompVersion(groupId, {
      ...data,
      createdBy: userId,
    });

    res.status(201).json(version);
  } catch (error: unknown) {
    logger.error('Error creating comp version:', error);
    if ((error as any).name === 'ZodError') {
      return res.status(400).json({ error: 'Invalid data', details: (error as any).errors });
    }
    res.status(500).json({ error: 'Failed to create comp version' });
  }
});

router.get('/projects/:projectId/comping/groups/:groupId/versions', requireAuth, async (req, res) => {
  try {
    const { projectId, groupId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const history = await compingService.getCompHistory(groupId);
    res.json(history);
  } catch (error: unknown) {
    logger.error('Error fetching comp versions:', error);
    res.status(500).json({ error: 'Failed to fetch comp versions' });
  }
});

router.put('/projects/:projectId/comping/groups/:groupId/versions/:versionId/activate', requireAuth, async (req, res) => {
  try {
    const { projectId, groupId, versionId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await compingService.setActiveCompVersion(groupId, versionId);
    res.json({ success: true });
  } catch (error: unknown) {
    logger.error('Error activating comp version:', error);
    res.status(500).json({ error: 'Failed to activate comp version' });
  }
});

router.delete('/projects/:projectId/comping/versions/:versionId', requireAuth, async (req, res) => {
  try {
    const { projectId, versionId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await compingService.deleteCompVersion(versionId);
    res.status(204).send();
  } catch (error: unknown) {
    logger.error('Error deleting comp version:', error);
    if ((error as any).message === 'Cannot delete active comp version') {
      return res.status(400).json({ error: 'Cannot delete active comp version' });
    }
    res.status(500).json({ error: 'Failed to delete comp version' });
  }
});

router.post('/projects/:projectId/comping/render', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const { groupId } = req.body;
    const userId = (req as any).user.id;

    if (!groupId) {
      return res.status(400).json({ error: 'groupId is required' });
    }

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await compingService.renderComp(groupId, userId);
    res.status(201).json(result);
  } catch (error: unknown) {
    logger.error('Error rendering comp:', error);
    if ((error as any).message === 'No segments selected for rendering') {
      return res.status(400).json({ error: 'No segments selected for rendering' });
    }
    res.status(500).json({ error: 'Failed to render comp' });
  }
});

export default router;
