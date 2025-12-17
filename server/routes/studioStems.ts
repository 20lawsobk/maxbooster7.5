/**
 * Studio Stems Routes - API endpoints for stem bounce/export system
 * 
 * Routes:
 * - POST /api/studio/projects/:projectId/stems/export - Start stem export
 * - GET /api/studio/projects/:projectId/stems/status/:exportId - Check progress
 * - GET /api/studio/projects/:projectId/stems/download/:exportId - Download result
 * - GET /api/studio/projects/:projectId/stems/list - List completed exports
 * - DELETE /api/studio/projects/:projectId/stems/:exportId - Delete export
 */

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { z } from 'zod';
import { logger } from '../logger.js';
import { stemExportService } from '../services/stemExportService.js';
import { db } from '../db.js';
import { projects } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import { SAMPLE_RATES, BIT_DEPTHS } from '../../shared/audioConstants.js';

const router = Router();

const startExportSchema = z.object({
  trackIds: z.array(z.string()).default([]),
  exportName: z.string().max(255).optional(),
  format: z.enum(['wav', 'flac', 'mp3', 'aac']).default('wav'),
  sampleRate: z.number()
    .refine(val => [44100, 48000, 96000, 192000].includes(val), {
      message: 'Sample rate must be 44100, 48000, 96000, or 192000'
    })
    .default(48000),
  bitDepth: z.number()
    .refine(val => [16, 24, 32].includes(val), {
      message: 'Bit depth must be 16, 24, or 32'
    })
    .default(24),
  bitrate: z.enum(['128k', '192k', '256k', '320k']).default('320k'),
  normalize: z.boolean().default(false),
  normalizationType: z.enum(['peak', 'rms', 'lufs', 'none']).default('none'),
  normalizeTargetLevel: z.number().min(-60).max(0).default(-14),
  includeEffects: z.boolean().default(true),
  includeMasterBus: z.boolean().default(false),
});

const listExportsSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

async function verifyProjectOwnership(
  projectId: string,
  userId: string
): Promise<boolean> {
  const project = await db.query.projects.findFirst({
    where: and(eq(projects.id, projectId), eq(projects.userId, userId)),
  });
  return !!project;
}

router.post('/projects/:projectId/stems/export', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const data = startExportSchema.parse(req.body);

    const result = await stemExportService.startStemExport({
      projectId,
      userId,
      trackIds: data.trackIds,
      exportName: data.exportName,
      format: data.format,
      sampleRate: data.sampleRate as any,
      bitDepth: data.bitDepth as any,
      bitrate: data.bitrate,
      normalize: data.normalize,
      normalizationType: data.normalizationType,
      normalizeTargetLevel: data.normalizeTargetLevel,
      includeEffects: data.includeEffects,
      includeMasterBus: data.includeMasterBus,
    });

    res.status(202).json({
      success: true,
      message: 'Stem export started',
      ...result,
    });
  } catch (error: any) {
    logger.error('Error starting stem export:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid export options', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: error.message || 'Failed to start stem export' });
  }
});

router.get('/projects/:projectId/stems/status/:exportId', requireAuth, async (req, res) => {
  try {
    const { projectId, exportId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const status = await stemExportService.getExportStatus(exportId, userId);

    res.json({
      success: true,
      ...status,
    });
  } catch (error: any) {
    logger.error('Error fetching export status:', error);
    if (error.message === 'Export not found') {
      return res.status(404).json({ error: 'Export not found' });
    }
    res.status(500).json({ error: 'Failed to fetch export status' });
  }
});

router.get('/projects/:projectId/stems/download/:exportId', requireAuth, async (req, res) => {
  try {
    const { projectId, exportId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const download = await stemExportService.getExportDownload(exportId, userId);

    if (download.downloadUrl.startsWith('/') || download.downloadUrl.startsWith('./')) {
      return res.download(download.downloadUrl, download.fileName);
    }

    res.json({
      success: true,
      downloadUrl: download.downloadUrl,
      fileName: download.fileName,
      fileSize: download.fileSize,
    });
  } catch (error: any) {
    logger.error('Error getting export download:', error);
    if (error.message === 'Export not found') {
      return res.status(404).json({ error: 'Export not found' });
    }
    if (error.message === 'Export is not ready for download') {
      return res.status(400).json({ error: 'Export is not ready for download' });
    }
    res.status(500).json({ error: 'Failed to get export download' });
  }
});

router.get('/projects/:projectId/stems/list', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const queryParams = listExportsSchema.parse(req.query);

    const result = await stemExportService.listExports(projectId, userId, {
      limit: queryParams.limit,
      offset: queryParams.offset,
    });

    res.json({
      success: true,
      exports: result.exports,
      total: result.total,
      limit: queryParams.limit,
      offset: queryParams.offset,
    });
  } catch (error: any) {
    logger.error('Error listing exports:', error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ 
        error: 'Invalid query parameters', 
        details: error.errors 
      });
    }
    res.status(500).json({ error: 'Failed to list exports' });
  }
});

router.delete('/projects/:projectId/stems/:exportId', requireAuth, async (req, res) => {
  try {
    const { projectId, exportId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await stemExportService.deleteExport(exportId, userId);

    res.json({
      success: true,
      message: 'Export deleted successfully',
    });
  } catch (error: any) {
    logger.error('Error deleting export:', error);
    if (error.message === 'Export not found') {
      return res.status(404).json({ error: 'Export not found' });
    }
    res.status(500).json({ error: 'Failed to delete export' });
  }
});

router.post('/projects/:projectId/stems/:exportId/cancel', requireAuth, async (req, res) => {
  try {
    const { projectId, exportId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await stemExportService.cancelExport(exportId, userId);

    res.json({
      success: true,
      message: 'Export cancelled',
    });
  } catch (error: any) {
    logger.error('Error cancelling export:', error);
    if (error.message === 'Export not found') {
      return res.status(404).json({ error: 'Export not found' });
    }
    if (error.message.includes('Cannot cancel')) {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: 'Failed to cancel export' });
  }
});

router.get('/projects/:projectId/stems/formats', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = (req as any).user.id;

    if (!await verifyProjectOwnership(projectId, userId)) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.json({
      success: true,
      formats: [
        {
          id: 'wav',
          name: 'WAV',
          description: 'Uncompressed lossless audio',
          extension: '.wav',
          supportsbitDepth: true,
          supportsBitrate: false,
          defaultBitDepth: 24,
          availableBitDepths: [16, 24, 32],
        },
        {
          id: 'flac',
          name: 'FLAC',
          description: 'Compressed lossless audio',
          extension: '.flac',
          supportsBitDepth: true,
          supportsBitrate: false,
          defaultBitDepth: 24,
          availableBitDepths: [16, 24],
        },
        {
          id: 'mp3',
          name: 'MP3',
          description: 'Compressed lossy audio (most compatible)',
          extension: '.mp3',
          supportsBitDepth: false,
          supportsBitrate: true,
          defaultBitrate: '320k',
          availableBitrates: ['128k', '192k', '256k', '320k'],
        },
        {
          id: 'aac',
          name: 'AAC',
          description: 'Compressed lossy audio (Apple compatible)',
          extension: '.m4a',
          supportsBitDepth: false,
          supportsBitrate: true,
          defaultBitrate: '256k',
          availableBitrates: ['128k', '192k', '256k', '320k'],
        },
      ],
      sampleRates: [
        { value: 44100, label: '44.1 kHz (CD Quality)' },
        { value: 48000, label: '48 kHz (Standard)' },
        { value: 96000, label: '96 kHz (High Resolution)' },
        { value: 192000, label: '192 kHz (Studio Reference)' },
      ],
      normalizationTypes: [
        { 
          id: 'none', 
          name: 'None', 
          description: 'No normalization applied' 
        },
        { 
          id: 'peak', 
          name: 'Peak', 
          description: 'Normalize to peak level',
          defaultLevel: -1,
          unit: 'dB',
        },
        { 
          id: 'rms', 
          name: 'RMS', 
          description: 'Normalize to RMS level',
          defaultLevel: -14,
          unit: 'dB',
        },
        { 
          id: 'lufs', 
          name: 'LUFS', 
          description: 'Loudness normalization (broadcast standard)',
          defaultLevel: -14,
          unit: 'LUFS',
        },
      ],
    });
  } catch (error: any) {
    logger.error('Error fetching export formats:', error);
    res.status(500).json({ error: 'Failed to fetch export formats' });
  }
});

export default router;
