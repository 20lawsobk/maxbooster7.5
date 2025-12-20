import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { promotionalToolsService } from '../services/promotionalToolsService';
import { logger } from '../logger';

const router = Router();

const requireAuth = (req: Request, res: Response, next: Function) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
};

const preSavePageSchema = z.object({
  releaseId: z.string(),
  slug: z.string().optional(),
  description: z.string().optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  buttonColor: z.string().optional(),
  spotifyPreSaveUrl: z.string().optional(),
  appleMusicPreAddUrl: z.string().optional(),
  deezerPreSaveUrl: z.string().optional(),
  amazonMusicUrl: z.string().optional(),
  youtubeUrl: z.string().optional(),
  tidalUrl: z.string().optional(),
  socialLinks: z.object({
    instagram: z.string().optional(),
    twitter: z.string().optional(),
    tiktok: z.string().optional(),
    youtube: z.string().optional(),
    facebook: z.string().optional(),
    website: z.string().optional(),
  }).optional(),
  customLinks: z.array(z.object({
    label: z.string(),
    url: z.string(),
  })).optional(),
  emailCapture: z.boolean().optional(),
});

router.post('/presave', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const data = preSavePageSchema.parse(req.body);
    const page = await promotionalToolsService.createPreSavePage(userId, data.releaseId, data);
    res.json(page);
  } catch (error) {
    logger.error('Error creating pre-save page:', error);
    res.status(500).json({ error: 'Failed to create pre-save page' });
  }
});

router.get('/presave', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const pages = await promotionalToolsService.getUserPreSavePages(userId);
    res.json(pages);
  } catch (error) {
    logger.error('Error fetching pre-save pages:', error);
    res.status(500).json({ error: 'Failed to fetch pre-save pages' });
  }
});

router.get('/presave/:id', async (req: Request, res: Response) => {
  try {
    const page = await promotionalToolsService.getPreSavePage(req.params.id);
    if (!page) {
      return res.status(404).json({ error: 'Pre-save page not found' });
    }
    await promotionalToolsService.recordPreSaveAnalytics(page.id, 'view');
    res.json(page);
  } catch (error) {
    logger.error('Error fetching pre-save page:', error);
    res.status(500).json({ error: 'Failed to fetch pre-save page' });
  }
});

router.get('/presave/slug/:slug', async (req: Request, res: Response) => {
  try {
    const page = await promotionalToolsService.getPreSavePageBySlug(req.params.slug);
    if (!page) {
      return res.status(404).json({ error: 'Pre-save page not found' });
    }
    await promotionalToolsService.recordPreSaveAnalytics(page.id, 'view');
    res.json(page);
  } catch (error) {
    logger.error('Error fetching pre-save page:', error);
    res.status(500).json({ error: 'Failed to fetch pre-save page' });
  }
});

router.put('/presave/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const page = await promotionalToolsService.updatePreSavePage(req.params.id, req.body);
    res.json(page);
  } catch (error) {
    logger.error('Error updating pre-save page:', error);
    res.status(500).json({ error: 'Failed to update pre-save page' });
  }
});

router.post('/presave/:id/analytics', async (req: Request, res: Response) => {
  try {
    const { event, platform } = req.body;
    await promotionalToolsService.recordPreSaveAnalytics(req.params.id, event, platform);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error recording analytics:', error);
    res.status(500).json({ error: 'Failed to record analytics' });
  }
});

router.post('/presave/:id/email', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    const success = await promotionalToolsService.captureEmail(req.params.id, email);
    if (success) {
      await promotionalToolsService.recordPreSaveAnalytics(req.params.id, 'email');
    }
    res.json({ success });
  } catch (error) {
    logger.error('Error capturing email:', error);
    res.status(500).json({ error: 'Failed to capture email' });
  }
});

router.delete('/presave/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await promotionalToolsService.deletePreSavePage(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting pre-save page:', error);
    res.status(500).json({ error: 'Failed to delete pre-save page' });
  }
});

const promoCardSchema = z.object({
  releaseId: z.string(),
  type: z.enum(['square', 'story', 'banner', 'twitter']),
  template: z.string().optional(),
  customText: z.string().optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  accentColor: z.string().optional(),
  fontFamily: z.string().optional(),
});

router.post('/promo-cards', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const data = promoCardSchema.parse(req.body);
    const card = await promotionalToolsService.createPromoCard(userId, data.releaseId, data);
    res.json(card);
  } catch (error) {
    logger.error('Error creating promo card:', error);
    res.status(500).json({ error: 'Failed to create promo card' });
  }
});

router.get('/promo-cards', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const releaseId = req.query.releaseId as string | undefined;
    const cards = await promotionalToolsService.getPromoCards(userId, releaseId);
    res.json(cards);
  } catch (error) {
    logger.error('Error fetching promo cards:', error);
    res.status(500).json({ error: 'Failed to fetch promo cards' });
  }
});

router.get('/promo-cards/templates', async (req: Request, res: Response) => {
  res.json(promotionalToolsService.getPromoCardTemplates());
});

router.delete('/promo-cards/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await promotionalToolsService.deletePromoCard(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting promo card:', error);
    res.status(500).json({ error: 'Failed to delete promo card' });
  }
});

const miniVideoSchema = z.object({
  releaseId: z.string(),
  type: z.enum(['waveform', 'visualizer', 'lyrics', 'countdown', 'slideshow']),
  aspectRatio: z.enum(['1:1', '9:16', '16:9']),
  audioPreviewUrl: z.string().optional(),
  audioStartTime: z.number().optional(),
  textOverlay: z.string().optional(),
  animationStyle: z.enum(['pulse', 'wave', 'bounce', 'glow', 'particles']).optional(),
  backgroundColor: z.string().optional(),
  accentColor: z.string().optional(),
});

router.post('/mini-videos', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const data = miniVideoSchema.parse(req.body);
    const video = await promotionalToolsService.createMiniVideo(userId, data.releaseId, data);
    res.json(video);
  } catch (error) {
    logger.error('Error creating mini video:', error);
    res.status(500).json({ error: 'Failed to create mini video' });
  }
});

router.get('/mini-videos', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const releaseId = req.query.releaseId as string | undefined;
    const videos = await promotionalToolsService.getMiniVideos(userId, releaseId);
    res.json(videos);
  } catch (error) {
    logger.error('Error fetching mini videos:', error);
    res.status(500).json({ error: 'Failed to fetch mini videos' });
  }
});

router.delete('/mini-videos/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await promotionalToolsService.deleteMiniVideo(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting mini video:', error);
    res.status(500).json({ error: 'Failed to delete mini video' });
  }
});

const spotifyCanvasSchema = z.object({
  releaseId: z.string(),
  trackId: z.string(),
  type: z.enum(['video', 'animation', 'static']),
  sourceUrl: z.string(),
  loopPoint: z.number().optional(),
});

router.post('/spotify-canvas', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const data = spotifyCanvasSchema.parse(req.body);
    const canvas = await promotionalToolsService.createSpotifyCanvas(
      userId, data.releaseId, data.trackId, data
    );
    res.json(canvas);
  } catch (error) {
    logger.error('Error creating Spotify Canvas:', error);
    res.status(500).json({ error: 'Failed to create Spotify Canvas' });
  }
});

router.get('/spotify-canvas', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const releaseId = req.query.releaseId as string | undefined;
    const canvases = await promotionalToolsService.getSpotifyCanvases(userId, releaseId);
    res.json(canvases);
  } catch (error) {
    logger.error('Error fetching Spotify Canvases:', error);
    res.status(500).json({ error: 'Failed to fetch Spotify Canvases' });
  }
});

router.post('/spotify-canvas/:id/process', requireAuth, async (req: Request, res: Response) => {
  try {
    const canvas = await promotionalToolsService.processSpotifyCanvas(req.params.id);
    res.json(canvas);
  } catch (error) {
    logger.error('Error processing Spotify Canvas:', error);
    res.status(500).json({ error: 'Failed to process Spotify Canvas' });
  }
});

router.post('/spotify-canvas/:id/submit', requireAuth, async (req: Request, res: Response) => {
  try {
    const canvas = await promotionalToolsService.submitSpotifyCanvas(req.params.id);
    res.json(canvas);
  } catch (error) {
    logger.error('Error submitting Spotify Canvas:', error);
    res.status(500).json({ error: 'Failed to submit Spotify Canvas' });
  }
});

router.delete('/spotify-canvas/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await promotionalToolsService.deleteSpotifyCanvas(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting Spotify Canvas:', error);
    res.status(500).json({ error: 'Failed to delete Spotify Canvas' });
  }
});

const lyricsSyncSchema = z.object({
  releaseId: z.string(),
  trackId: z.string(),
  language: z.string(),
  plainText: z.string(),
  syncMethod: z.enum(['manual', 'auto', 'ai']).optional(),
});

router.post('/lyrics-sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const data = lyricsSyncSchema.parse(req.body);
    const sync = await promotionalToolsService.createLyricsSync(
      userId, data.releaseId, data.trackId, data
    );
    res.json(sync);
  } catch (error) {
    logger.error('Error creating lyrics sync:', error);
    res.status(500).json({ error: 'Failed to create lyrics sync' });
  }
});

router.get('/lyrics-sync', requireAuth, async (req: Request, res: Response) => {
  try {
    const userId = (req.user as any).id;
    const releaseId = req.query.releaseId as string | undefined;
    const syncs = await promotionalToolsService.getLyricsSyncs(userId, releaseId);
    res.json(syncs);
  } catch (error) {
    logger.error('Error fetching lyrics syncs:', error);
    res.status(500).json({ error: 'Failed to fetch lyrics syncs' });
  }
});

router.put('/lyrics-sync/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const { lyrics } = req.body;
    const sync = await promotionalToolsService.updateLyricsSync(req.params.id, lyrics);
    res.json(sync);
  } catch (error) {
    logger.error('Error updating lyrics sync:', error);
    res.status(500).json({ error: 'Failed to update lyrics sync' });
  }
});

router.post('/lyrics-sync/:id/submit', requireAuth, async (req: Request, res: Response) => {
  try {
    const sync = await promotionalToolsService.submitLyricsToplatforms(req.params.id);
    res.json(sync);
  } catch (error) {
    logger.error('Error submitting lyrics:', error);
    res.status(500).json({ error: 'Failed to submit lyrics' });
  }
});

router.get('/lyrics-sync/:id/export/lrc', requireAuth, async (req: Request, res: Response) => {
  try {
    const syncs = await promotionalToolsService.getLyricsSyncs((req.user as any).id);
    const sync = syncs.find(s => s.id === req.params.id);
    if (!sync) {
      return res.status(404).json({ error: 'Lyrics sync not found' });
    }
    const lrc = promotionalToolsService.exportLRC(sync);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="lyrics-${sync.id}.lrc"`);
    res.send(lrc);
  } catch (error) {
    logger.error('Error exporting LRC:', error);
    res.status(500).json({ error: 'Failed to export LRC' });
  }
});

router.get('/lyrics-sync/:id/export/srt', requireAuth, async (req: Request, res: Response) => {
  try {
    const syncs = await promotionalToolsService.getLyricsSyncs((req.user as any).id);
    const sync = syncs.find(s => s.id === req.params.id);
    if (!sync) {
      return res.status(404).json({ error: 'Lyrics sync not found' });
    }
    const srt = promotionalToolsService.exportSRT(sync);
    res.setHeader('Content-Type', 'text/plain');
    res.setHeader('Content-Disposition', `attachment; filename="lyrics-${sync.id}.srt"`);
    res.send(srt);
  } catch (error) {
    logger.error('Error exporting SRT:', error);
    res.status(500).json({ error: 'Failed to export SRT' });
  }
});

router.delete('/lyrics-sync/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    await promotionalToolsService.deleteLyricsSync(req.params.id);
    res.json({ success: true });
  } catch (error) {
    logger.error('Error deleting lyrics sync:', error);
    res.status(500).json({ error: 'Failed to delete lyrics sync' });
  }
});

export default router;
