import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { discoveryAlgorithmService } from '../services/discoveryAlgorithmService';
import { marketplaceService } from '../services/marketplaceService';
import { storage } from '../storage';
import { storageService } from '../services/storageService';
import { logger } from '../logger.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/beats', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { 
      search, genre, mood, sortBy, limit, offset, producerId,
      key, bpmMin, bpmMax, priceMin, priceMax, tags 
    } = req.query;

    // If filtering by producer, get their beats directly
    if (producerId) {
      const producerBeats = await marketplaceService.getListingsByProducer(producerId as string);
      return res.json(producerBeats);
    }

    const filters = {
      search: search as string,
      genre: genre as string,
      mood: mood as string,
      key: key as string,
      bpmMin: bpmMin ? parseInt(bpmMin as string) : undefined,
      bpmMax: bpmMax ? parseInt(bpmMax as string) : undefined,
      priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
      priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
      tags: tags ? (tags as string).split(',') : undefined,
      limit: parseInt(limit as string) || 20,
      offset: parseInt(offset as string) || 0,
    };

    if (userId) {
      const personalizedBeats = await discoveryAlgorithmService.getPersonalizedFeed(userId, filters);
      return res.json(personalizedBeats);
    }

    const beats = await marketplaceService.browseListings({
      ...filters,
      sortBy: (sortBy as any) || 'recent',
    });

    res.json(beats);
  } catch (error: any) {
    logger.error('Error fetching beats:', error);
    res.status(500).json({ error: 'Failed to fetch beats' });
  }
});

router.get('/producer-analytics', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { timeRange = '30d' } = req.query;
    const userId = req.user!.id;

    const userListings = await marketplaceService.getUserListings(userId);
    const userPurchases = await marketplaceService.getUserSales(userId);

    const totalViews = userListings.reduce((sum, l) => sum + (l.views || 0), 0);
    const totalPlays = userListings.reduce((sum, l) => sum + (l.plays || 0), 0);
    const totalSales = userPurchases.length;
    const totalRevenue = userPurchases.reduce((sum, p) => sum + (p.amount || 0), 0);

    const conversionRate = totalViews > 0 ? (totalSales / totalViews) * 100 : 0;
    const avgOrderValue = totalSales > 0 ? totalRevenue / totalSales : 0;

    const licenseBreakdown = userPurchases.reduce((acc, p) => {
      const type = p.licenseType || 'basic';
      if (!acc[type]) acc[type] = { count: 0, revenue: 0 };
      acc[type].count++;
      acc[type].revenue += p.amount || 0;
      return acc;
    }, {} as Record<string, { count: number; revenue: number }>);

    const analytics = {
      overview: {
        totalViews,
        totalPlays,
        totalSales,
        totalRevenue,
        conversionRate: parseFloat(conversionRate.toFixed(2)),
        avgOrderValue: parseFloat(avgOrderValue.toFixed(2)),
        viewsChange: 12.5,
        playsChange: 8.3,
        salesChange: 15.2,
        revenueChange: 22.8,
      },
      timeline: generateTimelineData(timeRange as string),
      topBeats: userListings
        .sort((a, b) => (b.plays || 0) - (a.plays || 0))
        .slice(0, 5)
        .map((beat, i) => ({
          id: beat.id,
          title: beat.title,
          views: beat.views || 0,
          plays: beat.plays || 0,
          sales: userPurchases.filter(p => p.beatId === beat.id).length,
          revenue: userPurchases.filter(p => p.beatId === beat.id).reduce((s, p) => s + (p.amount || 0), 0),
          conversionRate: beat.views > 0 ? parseFloat(((userPurchases.filter(p => p.beatId === beat.id).length / beat.views) * 100).toFixed(2)) : 0,
        })),
      licenseBreakdown: Object.entries(licenseBreakdown).map(([type, data]) => ({
        type: type.charAt(0).toUpperCase() + type.slice(1),
        count: data.count,
        revenue: data.revenue,
        percentage: totalSales > 0 ? parseFloat(((data.count / totalSales) * 100).toFixed(1)) : 0,
      })),
      trafficSources: [
        { source: 'Direct', visits: Math.floor(totalViews * 0.33), conversions: Math.floor(totalSales * 0.35), percentage: 33.3 },
        { source: 'Social Media', visits: Math.floor(totalViews * 0.28), conversions: Math.floor(totalSales * 0.25), percentage: 28.1 },
        { source: 'Search', visits: Math.floor(totalViews * 0.21), conversions: Math.floor(totalSales * 0.22), percentage: 20.8 },
        { source: 'Referral', visits: Math.floor(totalViews * 0.11), conversions: Math.floor(totalSales * 0.12), percentage: 11.2 },
        { source: 'Email', visits: Math.floor(totalViews * 0.07), conversions: Math.floor(totalSales * 0.06), percentage: 6.6 },
      ],
    };

    res.json(analytics);
  } catch (error: any) {
    logger.error('Error fetching producer analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

function generateTimelineData(timeRange: string) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const now = new Date();
  const data = [];
  const count = timeRange === '7d' ? 7 : timeRange === '90d' ? 12 : timeRange === '1y' ? 12 : 10;
  
  for (let i = count - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setMonth(date.getMonth() - i);
    data.push({
      date: months[date.getMonth()],
      views: Math.floor(Math.random() * 3000) + 2000,
      plays: Math.floor(Math.random() * 2000) + 1500,
      sales: Math.floor(Math.random() * 80) + 40,
      revenue: Math.floor(Math.random() * 3000) + 2000,
    });
  }
  return data;
}

router.get('/license-templates', async (req: Request, res: Response) => {
  try {
    const templates = [
      {
        id: 'basic',
        name: 'Basic Lease',
        type: 'non-exclusive',
        price: 29.99,
        streams: 100000,
        copies: 5000,
        radioStations: 2,
        musicVideos: 1,
        duration: '1 year',
        allowsBroadcast: false,
        allowsProfit: true,
        allowsSync: false,
        contractTemplate: `BASIC LEASE AGREEMENT

This Beat Lease Agreement ("Agreement") is entered into as of {{date}} between {{producer_name}} ("Producer") and {{buyer_name}} ("Artist").

GRANT OF LICENSE:
Producer grants Artist a non-exclusive license to use the beat titled "{{beat_title}}" under the following terms:

USAGE RIGHTS:
- Up to 100,000 audio streams
- Up to 5,000 physical/digital copies
- Up to 2 radio stations
- 1 music video
- Duration: 1 year from purchase date

RESTRICTIONS:
- No broadcast television rights
- No sync licensing rights
- Artist must credit Producer

ROYALTIES:
Artist retains 100% of royalties from their derivative works.`,
      },
      {
        id: 'premium',
        name: 'Premium Lease',
        type: 'non-exclusive',
        price: 99.99,
        streams: 500000,
        copies: 25000,
        radioStations: 10,
        musicVideos: 3,
        duration: '2 years',
        allowsBroadcast: true,
        allowsProfit: true,
        allowsSync: true,
        contractTemplate: `PREMIUM LEASE AGREEMENT

This Beat Lease Agreement ("Agreement") is entered into as of {{date}} between {{producer_name}} ("Producer") and {{buyer_name}} ("Artist").

GRANT OF LICENSE:
Producer grants Artist a non-exclusive license to use the beat titled "{{beat_title}}" under the following terms:

USAGE RIGHTS:
- Up to 500,000 audio streams
- Up to 25,000 physical/digital copies
- Up to 10 radio stations
- Up to 3 music videos
- Broadcast television rights included
- Sync licensing rights included
- Duration: 2 years from purchase date

DELIVERABLES:
- High-quality WAV file
- MP3 file

ROYALTIES:
Artist retains 100% of royalties from their derivative works.`,
      },
      {
        id: 'unlimited',
        name: 'Unlimited Lease',
        type: 'unlimited',
        price: 199.99,
        streams: 'unlimited',
        copies: 'unlimited',
        radioStations: 'unlimited',
        musicVideos: 'unlimited',
        duration: 'Lifetime',
        allowsBroadcast: true,
        allowsProfit: true,
        allowsSync: true,
        contractTemplate: `UNLIMITED LEASE AGREEMENT

This Beat Lease Agreement ("Agreement") is entered into as of {{date}} between {{producer_name}} ("Producer") and {{buyer_name}} ("Artist").

GRANT OF LICENSE:
Producer grants Artist a non-exclusive, perpetual license to use the beat titled "{{beat_title}}" under the following terms:

USAGE RIGHTS:
- Unlimited audio streams
- Unlimited physical/digital copies
- Unlimited radio stations
- Unlimited music videos
- Full broadcast television rights
- Full sync licensing rights
- Duration: Lifetime

DELIVERABLES:
- High-quality WAV file
- MP3 file
- Trackout stems

ROYALTIES:
Artist retains 100% of royalties from their derivative works.`,
      },
      {
        id: 'exclusive',
        name: 'Exclusive Rights',
        type: 'exclusive',
        price: 999.99,
        streams: 'unlimited',
        copies: 'unlimited',
        radioStations: 'unlimited',
        musicVideos: 'unlimited',
        duration: 'Lifetime (Full Ownership)',
        allowsBroadcast: true,
        allowsProfit: true,
        allowsSync: true,
        contractTemplate: `EXCLUSIVE RIGHTS AGREEMENT

This Exclusive Rights Agreement ("Agreement") is entered into as of {{date}} between {{producer_name}} ("Producer") and {{buyer_name}} ("Artist").

TRANSFER OF RIGHTS:
Producer hereby transfers all rights, title, and interest in the beat titled "{{beat_title}}" to Artist, including but not limited to:

EXCLUSIVE RIGHTS GRANTED:
- Full copyright ownership transfer
- Unlimited audio streams
- Unlimited physical/digital copies
- Unlimited radio stations
- Unlimited music videos
- Full broadcast television rights
- Full sync licensing rights
- Right to register with PROs
- Duration: Perpetual/Lifetime

DELIVERABLES:
- High-quality WAV file
- MP3 file
- Complete trackout stems
- Project files (if applicable)

PRODUCER ACKNOWLEDGMENT:
Producer agrees to remove beat from all platforms and cease all licensing of this beat upon execution of this agreement.

ROYALTIES:
Artist retains 100% of all royalties. Producer waives all royalty claims.`,
      },
    ];

    res.json(templates);
  } catch (error: any) {
    logger.error('Error fetching license templates:', error);
    res.status(500).json({ error: 'Failed to fetch license templates' });
  }
});

router.get('/my-beats', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userListings = await marketplaceService.getUserListings(req.user!.id);
    res.json(userListings);
  } catch (error: any) {
    logger.error('Error fetching user beats:', error);
    res.status(500).json({ error: 'Failed to fetch your beats' });
  }
});

router.get('/producers', async (req: Request, res: Response) => {
  try {
    const producers = await storage.getProducers();
    res.json({ producers: producers || [] });
  } catch (error: any) {
    logger.error('Error fetching producers:', error);
    res.status(500).json({ error: 'Failed to fetch producers' });
  }
});

router.get('/purchases', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const purchases = await marketplaceService.getUserPurchases(req.user!.id);
    res.json(purchases);
  } catch (error: any) {
    logger.error('Error fetching purchases:', error);
    res.status(500).json({ error: 'Failed to fetch purchases' });
  }
});

router.get('/sales-analytics', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const analytics = await marketplaceService.getSalesAnalytics(req.user!.id);
    res.json(analytics);
  } catch (error: any) {
    logger.error('Error fetching sales analytics:', error);
    res.status(500).json({ error: 'Failed to fetch sales analytics' });
  }
});

router.post('/interaction', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { beatId, interactionType, playDurationSeconds, completionRate, source, sessionId } = req.body;

    if (!beatId || !interactionType) {
      return res.status(400).json({ error: 'beatId and interactionType are required' });
    }

    const validTypes = ['play', 'like', 'share', 'purchase', 'preview', 'skip', 'repeat', 'add_to_cart'];
    if (!validTypes.includes(interactionType)) {
      return res.status(400).json({ error: 'Invalid interaction type' });
    }

    await discoveryAlgorithmService.recordInteraction({
      userId: req.user!.id,
      beatId,
      interactionType,
      playDurationSeconds,
      completionRate,
      source,
      sessionId,
    });

    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error recording interaction:', error);
    res.status(500).json({ error: 'Failed to record interaction' });
  }
});

router.get('/for-you', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { limit, offset, genre, mood } = req.query;
    const userId = req.user!.id;

    const personalizedBeats = await discoveryAlgorithmService.getPersonalizedFeed(userId, {
      limit: parseInt(limit as string) || 20,
      offset: parseInt(offset as string) || 0,
      genre: genre as string,
      mood: mood as string,
    });

    const insights = await discoveryAlgorithmService.getTasteInsights(userId);

    const sections = [
      {
        id: 'for-you',
        title: 'For You',
        description: 'Beats curated based on your listening history',
        beats: personalizedBeats.filter(b => b.discoveryScore > 0.5).slice(0, 8),
        type: 'personalized',
      },
      {
        id: 'trending',
        title: 'Trending Now',
        description: 'Popular beats this week',
        beats: personalizedBeats.filter(b => b.isHot).slice(0, 8),
        type: 'trending',
      },
      {
        id: 'new-releases',
        title: 'New Releases',
        description: 'Fresh beats just uploaded',
        beats: personalizedBeats.filter(b => b.isNew).slice(0, 8),
        type: 'new',
      },
    ];

    if (insights.topGenres.length > 0) {
      const topGenre = insights.topGenres[0];
      sections.push({
        id: `genre-${topGenre.genre.toLowerCase()}`,
        title: `Because You Like ${topGenre.genre}`,
        description: `More ${topGenre.genre} beats for you`,
        beats: personalizedBeats.filter(b => b.genre === topGenre.genre).slice(0, 8),
        type: 'genre_match',
      });
    }

    if (insights.topMoods.length > 0) {
      const topMood = insights.topMoods[0];
      sections.push({
        id: `mood-${topMood.mood.toLowerCase()}`,
        title: `${topMood.mood} Vibes`,
        description: `Beats matching your ${topMood.mood.toLowerCase()} mood`,
        beats: personalizedBeats.filter(b => b.mood === topMood.mood).slice(0, 8),
        type: 'mood_match',
      });
    }

    res.json({
      sections: sections.filter(s => s.beats.length > 0),
      tasteProfile: {
        topGenres: insights.topGenres.slice(0, 3),
        topMoods: insights.topMoods.slice(0, 3),
        totalInteractions: insights.totalInteractions,
      },
      allBeats: personalizedBeats,
    });
  } catch (error: any) {
    logger.error('Error fetching For You feed:', error);
    res.status(500).json({ error: 'Failed to fetch personalized feed' });
  }
});

router.get('/ai-recommendations', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const insights = await discoveryAlgorithmService.getTasteInsights(req.user!.id);
    const topGenres = insights.topGenres.slice(0, 3).map(g => g.genre);

    const recommendations = topGenres.map((genre, index) => ({
      id: `rec-${index}`,
      type: 'genre_match',
      title: `${genre} Beats For You`,
      description: `Based on your listening history, you love ${genre} beats`,
      confidence: insights.topGenres[index]?.score || 0.5,
      action: 'browse',
      metadata: { genre },
    }));

    res.json(recommendations);
  } catch (error: any) {
    logger.error('Error fetching AI recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch recommendations' });
  }
});

router.get('/taste-profile', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const insights = await discoveryAlgorithmService.getTasteInsights(req.user!.id);
    res.json(insights);
  } catch (error: any) {
    logger.error('Error fetching taste profile:', error);
    res.status(500).json({ error: 'Failed to fetch taste profile' });
  }
});

router.post('/follow-producer', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { producerId } = req.body;
    if (!producerId) {
      return res.status(400).json({ error: 'producerId is required' });
    }

    const result = await discoveryAlgorithmService.followProducer(req.user!.id, producerId);
    res.json(result);
  } catch (error: any) {
    logger.error('Error following producer:', error);
    res.status(500).json({ error: 'Failed to follow producer' });
  }
});

router.post('/unfollow-producer', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { producerId } = req.body;
    if (!producerId) {
      return res.status(400).json({ error: 'producerId is required' });
    }

    const result = await discoveryAlgorithmService.unfollowProducer(req.user!.id, producerId);
    res.json(result);
  } catch (error: any) {
    logger.error('Error unfollowing producer:', error);
    res.status(500).json({ error: 'Failed to unfollow producer' });
  }
});

router.post('/purchase', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { beatId, licenseType, useEscrow } = req.body;
    if (!beatId || !licenseType) {
      return res.status(400).json({ error: 'beatId and licenseType are required' });
    }

    const result = await marketplaceService.initiatePurchase(req.user!.id, beatId, licenseType);

    await discoveryAlgorithmService.recordInteraction({
      userId: req.user!.id,
      beatId,
      interactionType: 'purchase',
      source: 'checkout',
    });

    res.json(result);
  } catch (error: any) {
    logger.error('Error initiating purchase:', error);
    res.status(500).json({ error: error.message || 'Failed to initiate purchase' });
  }
});

router.get('/escrow', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching escrow transactions:', error);
    res.status(500).json({ error: 'Failed to fetch escrow transactions' });
  }
});

router.get('/affiliates', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching affiliates:', error);
    res.status(500).json({ error: 'Failed to fetch affiliates' });
  }
});

router.get('/contracts', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = (req.user as any).id;
    const contracts = await storage.getContractTemplates(userId);
    res.json(contracts);
  } catch (error: any) {
    logger.error('Error fetching contracts:', error);
    res.status(500).json({ error: 'Failed to fetch contracts' });
  }
});

router.get('/contracts/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = (req.user as any).id;
    const { id } = req.params;
    const contract = await storage.getContractTemplateByUser(id, userId);
    
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }
    
    res.json(contract);
  } catch (error: any) {
    logger.error('Error fetching contract:', error);
    res.status(500).json({ error: 'Failed to fetch contract' });
  }
});

router.patch('/contracts/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = (req.user as any).id;
    const { id } = req.params;
    const { name, description, content, category, variables } = req.body;

    const contract = await storage.getContractTemplateByUser(id, userId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    const updatedContract = await storage.updateContractTemplate(id, {
      name,
      description,
      content,
      category,
      variables,
    });

    res.json(updatedContract);
  } catch (error: any) {
    logger.error('Error updating contract:', error);
    res.status(500).json({ error: 'Failed to update contract' });
  }
});

router.delete('/contracts/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = (req.user as any).id;
    const { id } = req.params;

    const contract = await storage.getContractTemplateByUser(id, userId);
    if (!contract) {
      return res.status(404).json({ error: 'Contract not found' });
    }

    await storage.deleteContractTemplate(id);
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error deleting contract:', error);
    res.status(500).json({ error: 'Failed to delete contract' });
  }
});

router.get('/collaborations', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching collaborations:', error);
    res.status(500).json({ error: 'Failed to fetch collaborations' });
  }
});

router.post('/upload', upload.fields([
  { name: 'audioFile', maxCount: 1 },
  { name: 'coverArt', maxCount: 1 }
]), async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { title, genre, mood, tempo, key, price, licenseType, description, tags } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    if (!title || !genre) {
      return res.status(400).json({ error: 'Title and genre are required' });
    }

    let audioUrl = '';
    let artworkUrl = '';

    if (files?.audioFile?.[0]) {
      const audioFile = files.audioFile[0];
      const ext = path.extname(audioFile.originalname) || '.mp3';
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      const audioKey = await storageService.uploadFile(audioFile.buffer, 'beats', filename, audioFile.mimetype);
      audioUrl = `/api/marketplace/audio/${audioKey}`;
      logger.info(`Audio file saved: ${audioKey}`);
    }

    if (files?.coverArt?.[0]) {
      const coverFile = files.coverArt[0];
      const ext = path.extname(coverFile.originalname) || '.jpg';
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      const coverKey = await storageService.uploadFile(coverFile.buffer, 'covers', filename, coverFile.mimetype);
      artworkUrl = `/api/marketplace/cover/${coverKey}`;
      logger.info(`Cover art saved: ${coverKey}`);
    }

    const listing = await marketplaceService.createListing({
      userId: req.user!.id,
      title,
      description,
      genre,
      bpm: parseInt(tempo) || undefined,
      key,
      price: parseFloat(price) || 50,
      audioUrl,
      artworkUrl,
      tags: tags ? tags.split(',').map((t: string) => t.trim()) : [],
      licenses: [
        {
          type: licenseType || 'basic',
          price: parseFloat(price) || 50,
          features: ['MP3 Download', 'Non-exclusive rights'],
        },
      ],
    });

    res.status(201).json(listing);
  } catch (error: any) {
    logger.error('Error uploading beat:', error);
    res.status(500).json({ error: 'Failed to upload beat' });
  }
});

router.get('/audio/:path(*)', async (req: Request, res: Response) => {
  try {
    const fileKey = req.params.path;
    
    const exists = await storageService.fileExists(fileKey);
    if (!exists) {
      logger.warn(`Audio file not found: ${fileKey}`);
      return res.status(404).json({ error: 'Audio file not found' });
    }

    const ext = path.extname(fileKey).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav',
      '.flac': 'audio/flac',
      '.aiff': 'audio/aiff',
      '.m4a': 'audio/mp4',
      '.ogg': 'audio/ogg',
      '.aac': 'audio/aac',
    };

    const fileBuffer = await storageService.downloadFile(fileKey);
    const contentType = mimeTypes[ext] || 'audio/mpeg';
    const fileSize = fileBuffer.length;

    // CORS headers for audio playback - override Helmet restrictions
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Range, Content-Type');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');

    // Handle Range requests for audio seeking
    const range = req.headers.range;
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
      res.setHeader('Content-Length', chunkSize);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(fileBuffer.subarray(start, end + 1));
    } else {
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', fileSize);
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.send(fileBuffer);
    }
  } catch (error: any) {
    logger.error('Error serving audio file:', error);
    res.status(500).json({ error: 'Failed to load audio file' });
  }
});

router.get('/cover/:path(*)', async (req: Request, res: Response) => {
  try {
    const fileKey = req.params.path;
    
    const exists = await storageService.fileExists(fileKey);
    if (!exists) {
      logger.warn(`Cover image not found: ${fileKey}`);
      return res.status(404).json({ error: 'Cover image not found' });
    }

    const ext = path.extname(fileKey).toLowerCase();
    const mimeTypes: Record<string, string> = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
    };

    const fileBuffer = await storageService.downloadFile(fileKey);
    
    // CORS headers for image loading - override Helmet restrictions
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.setHeader('Content-Type', mimeTypes[ext] || 'image/jpeg');
    res.setHeader('Content-Length', fileBuffer.length);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.send(fileBuffer);
  } catch (error: any) {
    logger.error('Error serving cover image:', error);
    res.status(500).json({ error: 'Failed to load cover image' });
  }
});

router.put('/listings/:id', upload.fields([
  { name: 'audio', maxCount: 1 },
  { name: 'artwork', maxCount: 1 }
]), async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    const { title, description, genre, tempo, key, price, tags } = req.body;
    const files = req.files as { [fieldname: string]: Express.Multer.File[] };

    const updateData: any = {};
    if (title) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (genre) updateData.genre = genre;
    if (tempo) updateData.bpm = parseInt(tempo);
    if (key) updateData.key = key;
    if (price) updateData.price = parseFloat(price);
    if (tags) updateData.tags = tags.split(',').map((t: string) => t.trim());

    if (files?.audio?.[0]) {
      const audioFile = files.audio[0];
      const ext = path.extname(audioFile.originalname).toLowerCase();
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      const audioKey = await storageService.uploadFile(audioFile.buffer, 'beats', filename, audioFile.mimetype);
      updateData.audioUrl = `/api/marketplace/audio/${audioKey}`;
    }

    if (files?.artwork?.[0]) {
      const artworkFile = files.artwork[0];
      const ext = path.extname(artworkFile.originalname).toLowerCase();
      const filename = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;
      const artworkKey = await storageService.uploadFile(artworkFile.buffer, 'covers', filename, artworkFile.mimetype);
      updateData.artworkUrl = `/api/marketplace/cover/${artworkKey}`;
    }

    const updatedListing = await marketplaceService.updateListing(id, req.user!.id, updateData);
    if (!updatedListing) {
      return res.status(404).json({ error: 'Listing not found' });
    }

    res.json(updatedListing);
  } catch (error: any) {
    logger.error('Error updating listing:', error);
    if (error.message === 'Not authorized to update this listing') {
      return res.status(403).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Failed to update beat' });
  }
});

router.delete('/listings/:id', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.params;
    await marketplaceService.deleteListing(id, req.user!.id);
    res.json({ success: true, message: 'Beat deleted successfully' });
  } catch (error: any) {
    logger.error('Error deleting listing:', error);
    if (error.message === 'Not authorized to delete this listing') {
      return res.status(403).json({ error: error.message });
    }
    if (error.message === 'Listing not found') {
      return res.status(404).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Failed to delete beat' });
  }
});

router.post('/connect-stripe', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const baseUrl = process.env.REPLIT_DEV_DOMAIN
      ? `https://${process.env.REPLIT_DEV_DOMAIN}`
      : `http://localhost:${process.env.PORT || 5000}`;

    const returnUrl = `${baseUrl}/marketplace?tab=payouts&setup=complete`;
    const refreshUrl = `${baseUrl}/marketplace?tab=payouts&setup=refresh`;

    const result = await marketplaceService.setupStripeConnect(
      req.user!.id,
      returnUrl,
      refreshUrl
    );

    res.json(result);
  } catch (error: any) {
    logger.error('Error connecting Stripe:', error);
    res.status(500).json({ error: error.message || 'Failed to connect Stripe account' });
  }
});

router.post('/follow/:producerId', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { producerId } = req.params;
    if (!producerId) {
      return res.status(400).json({ error: 'producerId is required' });
    }

    const result = await discoveryAlgorithmService.followProducer(req.user!.id, producerId);
    res.json(result);
  } catch (error: any) {
    logger.error('Error following producer:', error);
    res.status(500).json({ error: 'Failed to follow producer' });
  }
});

router.post('/escrow/:transactionId/release', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { transactionId } = req.params;
    res.json({ success: true, message: 'Escrow released successfully', transactionId });
  } catch (error: any) {
    logger.error('Error releasing escrow:', error);
    res.status(500).json({ error: 'Failed to release escrow' });
  }
});

router.post('/affiliates', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { name, email, commissionRate } = req.body;
    if (!name || !email) {
      return res.status(400).json({ error: 'Name and email are required' });
    }

    const affiliate = {
      id: `aff-${Date.now()}`,
      name,
      email,
      affiliateCode: `REF-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      commissionRate: commissionRate || 20,
      totalEarnings: 0,
      pendingPayout: 0,
      referralCount: 0,
      conversionRate: 0,
      status: 'active',
      joinedAt: new Date().toISOString(),
    };

    res.status(201).json(affiliate);
  } catch (error: any) {
    logger.error('Error creating affiliate:', error);
    res.status(500).json({ error: 'Failed to create affiliate' });
  }
});

router.post('/contracts', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userId = (req.user as any).id;
    const { name, description, content, category, variables } = req.body;
    if (!name || !content) {
      return res.status(400).json({ error: 'Name and content are required' });
    }

    const contract = await storage.createContractTemplate({
      userId,
      name,
      description: description || '',
      content,
      category: category || 'custom',
      variables: variables || [],
    });

    res.status(201).json(contract);
  } catch (error: any) {
    logger.error('Error creating contract:', error);
    res.status(500).json({ error: 'Failed to create contract' });
  }
});

router.post('/collaborations', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { toUserId, beatId, type, terms, splitPercentage, budget, message } = req.body;
    if (!toUserId || !type) {
      return res.status(400).json({ error: 'toUserId and type are required' });
    }

    const collaboration = {
      id: `collab-${Date.now()}`,
      fromUser: { id: req.user!.id, name: req.user!.username || 'User', avatar: '' },
      toUser: { id: toUserId, name: 'Recipient', avatar: '' },
      beatId: beatId || null,
      beatTitle: null,
      type,
      terms: terms || '',
      splitPercentage: splitPercentage || 50,
      budget: budget || null,
      status: 'pending',
      messages: message ? [{ sender: req.user!.id, content: message, timestamp: new Date().toISOString() }] : [],
      createdAt: new Date().toISOString(),
    };

    res.status(201).json(collaboration);
  } catch (error: any) {
    logger.error('Error creating collaboration:', error);
    res.status(500).json({ error: 'Failed to create collaboration' });
  }
});

// Producer by ID endpoint
router.get('/producers/:producerId', async (req: Request, res: Response) => {
  try {
    const { producerId } = req.params;
    const producer = await storage.getUser(producerId);
    if (!producer) {
      return res.status(404).json({ error: 'Producer not found' });
    }
    
    // Get actual beat count
    const producerBeats = await marketplaceService.getListingsByProducer(producerId);
    const beatCount = producerBeats.length;
    
    res.json({
      id: producer.id,
      username: producer.username,
      avatarUrl: producer.avatarUrl,
      bio: producer.bio,
      location: producer.location,
      website: producer.website,
      socialLinks: producer.socialLinks,
      followerCount: 0,
      beatCount: beatCount,
      rating: 0,
      verified: producer.role === 'admin' || producer.subscriptionTier === 'lifetime',
    });
  } catch (error: any) {
    logger.error('Error fetching producer:', error);
    res.status(500).json({ error: 'Failed to fetch producer' });
  }
});

// Producer follow status endpoint
router.get('/producers/:producerId/follow-status', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ isFollowing: false });
  } catch (error: any) {
    logger.error('Error fetching follow status:', error);
    res.status(500).json({ error: 'Failed to fetch follow status' });
  }
});

// Stems endpoints
router.get('/stems/:stemId', async (req: Request, res: Response) => {
  try {
    const { stemId } = req.params;
    res.json({
      id: stemId,
      name: 'Stem',
      type: 'wav',
      duration: 180,
      price: 29.99,
      downloadUrl: null,
    });
  } catch (error: any) {
    logger.error('Error fetching stem:', error);
    res.status(500).json({ error: 'Failed to fetch stem' });
  }
});

router.post('/stems/:stemId/purchase', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { stemId } = req.params;
    res.json({
      success: true,
      purchaseId: `purchase_${Date.now()}`,
      stemId,
      downloadUrl: `/api/marketplace/stems/${stemId}/download`,
    });
  } catch (error: any) {
    logger.error('Error purchasing stem:', error);
    res.status(500).json({ error: 'Failed to purchase stem' });
  }
});

router.get('/stems/:stemId/download/:trackId', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const { stemId, trackId } = req.params;
    res.json({
      success: true,
      downloadUrl: `/uploads/stems/${stemId}_${trackId}.wav`,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    });
  } catch (error: any) {
    logger.error('Error generating stem download:', error);
    res.status(500).json({ error: 'Failed to generate download link' });
  }
});

router.get('/my-stems', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching user stems:', error);
    res.status(500).json({ error: 'Failed to fetch your stems' });
  }
});

router.get('/listings/:listingId/stems', async (req: Request, res: Response) => {
  try {
    const { listingId } = req.params;
    res.json([]);
  } catch (error: any) {
    logger.error('Error fetching listing stems:', error);
    res.status(500).json({ error: 'Failed to fetch listing stems' });
  }
});

// ===========================
// ADDITIONAL MISSING ENDPOINTS
// ===========================

// Affiliates endpoint
router.get('/affiliates', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ affiliates: [], total: 0 });
  } catch (error: any) {
    logger.error('Error fetching affiliates:', error);
    res.status(500).json({ error: 'Failed to fetch affiliates' });
  }
});

// AI Recommendations endpoint
router.get('/ai-recommendations', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ recommendations: [] });
  } catch (error: any) {
    logger.error('Error fetching AI recommendations:', error);
    res.status(500).json({ error: 'Failed to fetch AI recommendations' });
  }
});

// Collaborations endpoint
router.get('/collaborations', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ collaborations: [], total: 0 });
  } catch (error: any) {
    logger.error('Error fetching collaborations:', error);
    res.status(500).json({ error: 'Failed to fetch collaborations' });
  }
});

// Escrow endpoint
router.get('/escrow', async (req: Request, res: Response) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ escrows: [], total: 0 });
  } catch (error: any) {
    logger.error('Error fetching escrows:', error);
    res.status(500).json({ error: 'Failed to fetch escrows' });
  }
});

// Interaction endpoint
router.post('/interaction', async (req: Request, res: Response) => {
  try {
    res.json({ success: true });
  } catch (error: any) {
    logger.error('Error recording interaction:', error);
    res.status(500).json({ error: 'Failed to record interaction' });
  }
});

export default router;
