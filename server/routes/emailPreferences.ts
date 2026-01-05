import { Router, Request, Response } from 'express';
import { weeklyInsightsService } from '../services/weeklyInsightsService.js';
import { logger } from '../logger.js';

const router = Router();

router.get('/api/email-preferences', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const preferences = await weeklyInsightsService.getEmailPreferences(req.user.id);
    return res.json(preferences);
  } catch (error) {
    logger.error('Failed to get email preferences:', error);
    return res.status(500).json({ message: 'Failed to get email preferences' });
  }
});

router.patch('/api/email-preferences', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const { weeklyInsights, weeklyInsightsFrequency, marketingEmails, releaseAlerts, collaborationAlerts, revenueAlerts } = req.body;

    const updates: any = {};
    if (typeof weeklyInsights === 'boolean') updates.weeklyInsights = weeklyInsights;
    if (typeof weeklyInsightsFrequency === 'string') updates.weeklyInsightsFrequency = weeklyInsightsFrequency;
    if (typeof marketingEmails === 'boolean') updates.marketingEmails = marketingEmails;
    if (typeof releaseAlerts === 'boolean') updates.releaseAlerts = releaseAlerts;
    if (typeof collaborationAlerts === 'boolean') updates.collaborationAlerts = collaborationAlerts;
    if (typeof revenueAlerts === 'boolean') updates.revenueAlerts = revenueAlerts;

    const updated = await weeklyInsightsService.updateEmailPreferences(req.user.id, updates);
    return res.json(updated);
  } catch (error) {
    logger.error('Failed to update email preferences:', error);
    return res.status(500).json({ message: 'Failed to update email preferences' });
  }
});

router.get('/api/email-preferences/unsubscribe', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.redirect('/login?message=Please%20log%20in%20to%20manage%20email%20preferences');
    }

    await weeklyInsightsService.unsubscribe(req.user.id);
    return res.redirect('/settings?message=Successfully%20unsubscribed%20from%20emails');
  } catch (error) {
    logger.error('Failed to unsubscribe:', error);
    return res.redirect('/settings?error=Failed%20to%20unsubscribe');
  }
});

router.get('/api/email-preferences/preview', async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    const preview = await weeklyInsightsService.getPreviewData(req.user.id);
    if (!preview) {
      return res.status(404).json({ message: 'Unable to generate preview' });
    }

    return res.json(preview);
  } catch (error) {
    logger.error('Failed to get email preview:', error);
    return res.status(500).json({ message: 'Failed to generate preview' });
  }
});

router.get('/api/emails/track/:id/open', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await weeklyInsightsService.trackEmailOpen(id);
    
    const transparentPixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    return res.send(transparentPixel);
  } catch (error) {
    logger.error('Failed to track email open:', error);
    const transparentPixel = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      'base64'
    );
    res.set('Content-Type', 'image/png');
    return res.send(transparentPixel);
  }
});

router.get('/api/emails/track/:id/click', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { redirect } = req.query;
    
    const redirectUrl = typeof redirect === 'string' ? redirect : 'https://maxbooster.ai/dashboard';
    
    await weeklyInsightsService.trackEmailClick(id, redirectUrl);
    
    return res.redirect(redirectUrl);
  } catch (error) {
    logger.error('Failed to track email click:', error);
    return res.redirect('https://maxbooster.ai/dashboard');
  }
});

router.post('/api/admin/emails/send-weekly-insights', async (req: Request, res: Response) => {
  try {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }

    const result = await weeklyInsightsService.sendWeeklyInsights();
    return res.json({
      message: 'Weekly insights batch completed',
      ...result,
    });
  } catch (error) {
    logger.error('Failed to send weekly insights batch:', error);
    return res.status(500).json({ message: 'Failed to send weekly insights' });
  }
});

export default router;
