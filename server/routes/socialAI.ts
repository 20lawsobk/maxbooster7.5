import { Router, Request, Response } from 'express';
import { socialChatbotService, ChatbotMessage } from '../services/socialChatbotService';
import { socialListeningService } from '../services/socialListeningService';
import { socialStrategyAIService } from '../services/socialStrategyAIService';
import { unifiedAIController } from '../services/unifiedAIController';
import { aiContentService } from '../services/aiContentService';
import { logger } from '../logger';
import { requireAuth } from '../middleware/auth.js';
import { aiRateLimiter } from '../middleware/rateLimiter.js';

const router = Router();
router.use(aiRateLimiter);

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

// =========================================
// CHATBOT ROUTES
// =========================================

router.post('/chatbot/respond', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platform, senderId, senderName, content, threadId } = req.body;

    if (!platform || !content) {
      return res.status(400).json({ message: 'Platform and content are required' });
    }

    const message: ChatbotMessage = {
      id: `msg_${Date.now()}`,
      platform,
      senderId: senderId || 'unknown',
      senderName: senderName || 'User',
      content,
      timestamp: new Date(),
      isIncoming: true,
      threadId: threadId || `thread_${Date.now()}`,
    };

    const response = await socialChatbotService.generateResponse(message, userId);

    res.json({
      success: true,
      response,
      message,
    });
  } catch (error) {
    logger.error('Chatbot respond error:', error);
    res.status(500).json({ message: 'Failed to generate chatbot response' });
  }
});

router.post('/chatbot/train', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { question, answer, category, keywords } = req.body;

    if (!question || !answer) {
      return res.status(400).json({ message: 'Question and answer are required' });
    }

    const entry = await socialChatbotService.addToKnowledgeBase(userId, {
      question,
      answer,
      category: category || 'general',
      keywords: keywords || [],
    });

    res.json({
      success: true,
      entry,
    });
  } catch (error) {
    logger.error('Chatbot train error:', error);
    res.status(500).json({ message: 'Failed to add to knowledge base' });
  }
});

router.get('/chatbot/stats', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await socialChatbotService.getStats(userId);
    res.json(stats);
  } catch (error) {
    logger.error('Chatbot stats error:', error);
    res.status(500).json({ message: 'Failed to get chatbot stats' });
  }
});

router.get('/chatbot/templates', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const templates = await socialChatbotService.getTemplates();
    res.json(templates);
  } catch (error) {
    logger.error('Get templates error:', error);
    res.status(500).json({ message: 'Failed to get templates' });
  }
});

router.post('/chatbot/templates', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, category, triggers, response, platforms, priority, enabled } = req.body;

    if (!name || !response) {
      return res.status(400).json({ message: 'Name and response are required' });
    }

    const template = await socialChatbotService.addTemplate({
      name,
      category: category || 'general',
      triggers: triggers || [],
      response,
      platforms: platforms || ['instagram', 'twitter', 'facebook'],
      priority: priority || 5,
      enabled: enabled !== false,
    });

    res.json({
      success: true,
      template,
    });
  } catch (error) {
    logger.error('Add template error:', error);
    res.status(500).json({ message: 'Failed to add template' });
  }
});

router.post('/chatbot/route', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { messages } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ message: 'Messages array is required' });
    }

    const results = await socialChatbotService.processIncomingMessages(messages, userId);
    res.json({
      success: true,
      results,
    });
  } catch (error) {
    logger.error('Route messages error:', error);
    res.status(500).json({ message: 'Failed to route messages' });
  }
});

// =========================================
// LISTENING ROUTES
// =========================================

router.get('/listening/mentions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platforms, sentiment, startDate, endDate, limit, offset, influencersOnly } = req.query;

    const result = await socialListeningService.getMentions(userId, {
      platforms: platforms ? String(platforms).split(',') : undefined,
      sentiment: sentiment as 'positive' | 'neutral' | 'negative' | undefined,
      startDate: startDate ? new Date(String(startDate)) : undefined,
      endDate: endDate ? new Date(String(endDate)) : undefined,
      limit: limit ? parseInt(String(limit)) : undefined,
      offset: offset ? parseInt(String(offset)) : undefined,
      influencersOnly: influencersOnly === 'true',
    });

    res.json(result);
  } catch (error) {
    logger.error('Get mentions error:', error);
    res.status(500).json({ message: 'Failed to get mentions' });
  }
});

router.get('/listening/sentiment', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { startDate, endDate, platforms } = req.query;

    const result = await socialListeningService.analyzeSentiment(userId, {
      startDate: startDate ? new Date(String(startDate)) : undefined,
      endDate: endDate ? new Date(String(endDate)) : undefined,
      platforms: platforms ? String(platforms).split(',') : undefined,
    });

    res.json(result);
  } catch (error) {
    logger.error('Sentiment analysis error:', error);
    res.status(500).json({ message: 'Failed to analyze sentiment' });
  }
});

router.get('/listening/trends', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { industry, region, platforms, limit } = req.query;

    const result = await socialListeningService.getTrendingTopics(userId, {
      industry: industry ? String(industry) : undefined,
      region: region ? String(region) : undefined,
      platforms: platforms ? String(platforms).split(',') : undefined,
      limit: limit ? parseInt(String(limit)) : undefined,
    });

    res.json(result);
  } catch (error) {
    logger.error('Get trends error:', error);
    res.status(500).json({ message: 'Failed to get trending topics' });
  }
});

router.get('/listening/competitors', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { handles } = req.query;

    if (!handles) {
      return res.status(400).json({ message: 'Competitor handles are required' });
    }

    const competitorHandles = String(handles).split(',');
    const result = await socialListeningService.analyzeCompetitors(userId, competitorHandles);

    res.json(result);
  } catch (error) {
    logger.error('Competitor analysis error:', error);
    res.status(500).json({ message: 'Failed to analyze competitors' });
  }
});

router.get('/listening/brand-health', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const result = await socialListeningService.getBrandHealth(userId);
    res.json(result);
  } catch (error) {
    logger.error('Brand health error:', error);
    res.status(500).json({ message: 'Failed to get brand health' });
  }
});

router.get('/listening/share-of-voice', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { competitors } = req.query;

    const competitorNames = competitors ? String(competitors).split(',') : [];
    const result = await socialListeningService.getShareOfVoice(userId, competitorNames);

    res.json(result);
  } catch (error) {
    logger.error('Share of voice error:', error);
    res.status(500).json({ message: 'Failed to get share of voice' });
  }
});

router.get('/listening/queries', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const queries = await socialListeningService.getListeningQueries(userId);
    res.json(queries);
  } catch (error) {
    logger.error('Get queries error:', error);
    res.status(500).json({ message: 'Failed to get listening queries' });
  }
});

router.post('/listening/queries', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, type, query, platforms, enabled } = req.body;

    if (!name || !query) {
      return res.status(400).json({ message: 'Name and query are required' });
    }

    const result = await socialListeningService.addListeningQuery(userId, {
      name,
      type: type || 'keyword',
      query,
      platforms: platforms || ['twitter', 'instagram'],
      enabled: enabled !== false,
    });

    res.json({
      success: true,
      query: result,
    });
  } catch (error) {
    logger.error('Add query error:', error);
    res.status(500).json({ message: 'Failed to add listening query' });
  }
});

router.delete('/listening/queries/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const success = await socialListeningService.deleteListeningQuery(userId, id);

    res.json({ success });
  } catch (error) {
    logger.error('Delete query error:', error);
    res.status(500).json({ message: 'Failed to delete listening query' });
  }
});

// =========================================
// STRATEGY ROUTES
// =========================================

router.post('/strategy/recommend', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platforms, count, timeframe } = req.body;

    const recommendations = await socialStrategyAIService.getContentRecommendations(userId, {
      platforms,
      count,
      timeframe,
    });

    res.json({
      success: true,
      recommendations,
    });
  } catch (error) {
    logger.error('Get recommendations error:', error);
    res.status(500).json({ message: 'Failed to get recommendations' });
  }
});

router.post('/strategy/campaign', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { objective, budget, duration } = req.body;

    const recommendations = await socialStrategyAIService.getCampaignRecommendations(userId, {
      objective,
      budget,
      duration,
    });

    res.json({
      success: true,
      recommendations,
    });
  } catch (error) {
    logger.error('Get campaign recommendations error:', error);
    res.status(500).json({ message: 'Failed to get campaign recommendations' });
  }
});

router.post('/strategy/plan', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { startDate, endDate, platforms, postsPerWeek } = req.body;

    const plan = await socialStrategyAIService.generateContentPlan(userId, {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      platforms,
      postsPerWeek,
    });

    res.json({
      success: true,
      plan,
    });
  } catch (error) {
    logger.error('Generate plan error:', error);
    res.status(500).json({ message: 'Failed to generate content plan' });
  }
});

router.get('/strategy/content-strategy', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { period } = req.query;

    const strategy = await socialStrategyAIService.getContentStrategy(
      userId,
      period as 'weekly' | 'monthly' | 'quarterly' | undefined
    );

    res.json(strategy);
  } catch (error) {
    logger.error('Get content strategy error:', error);
    res.status(500).json({ message: 'Failed to get content strategy' });
  }
});

router.get('/strategy/posting-times', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platforms } = req.query;

    const platformList = platforms ? String(platforms).split(',') : undefined;
    const recommendations = await socialStrategyAIService.getBestPostingTimes(userId, platformList);

    res.json(recommendations);
  } catch (error) {
    logger.error('Get posting times error:', error);
    res.status(500).json({ message: 'Failed to get posting times' });
  }
});

router.get('/strategy/growth-predictions', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { platforms } = req.query;

    const platformList = platforms ? String(platforms).split(',') : undefined;
    const predictions = await socialStrategyAIService.getGrowthPredictions(userId, platformList);

    res.json(predictions);
  } catch (error) {
    logger.error('Get growth predictions error:', error);
    res.status(500).json({ message: 'Failed to get growth predictions' });
  }
});

router.get('/strategy/tips', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { category, platforms, limit } = req.query;

    const tips = await socialStrategyAIService.getEngagementTips(userId, {
      category: category ? String(category) : undefined,
      platforms: platforms ? String(platforms).split(',') : undefined,
      limit: limit ? parseInt(String(limit)) : undefined,
    });

    res.json(tips);
  } catch (error) {
    logger.error('Get engagement tips error:', error);
    res.status(500).json({ message: 'Failed to get engagement tips' });
  }
});

router.get('/strategy/insights', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const insights = await socialStrategyAIService.getAIInsights(userId);
    res.json(insights);
  } catch (error) {
    logger.error('Get AI insights error:', error);
    res.status(500).json({ message: 'Failed to get AI insights' });
  }
});

// =========================================
// BENCHMARKS ROUTE
// =========================================

router.get('/benchmarks', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { industry } = req.query;
    const benchmarks = await socialListeningService.getIndustryBenchmarks(
      industry ? String(industry) : undefined
    );
    res.json(benchmarks);
  } catch (error) {
    logger.error('Get benchmarks error:', error);
    res.status(500).json({ message: 'Failed to get industry benchmarks' });
  }
});

// ===========================
// AI CONTENT ENDPOINTS
// ===========================

router.get('/ai-content/ab-variants', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content = '', variationType = 'tone' } = req.query as Record<string, string>;
    const validTypes = ['headline', 'CTA', 'emoji', 'length', 'tone'];
    const type = validTypes.includes(variationType) ? variationType as any : 'tone';
    const variants = await aiContentService.generateABVariants(content, type);
    res.json({ variants });
  } catch (error) {
    logger.error('Get AB variants error:', error);
    res.status(500).json({ message: 'Failed to get AB variants' });
  }
});

router.post('/ai-content/analyze-brand-voice', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { historicalPosts = [] } = req.body;
    if (!Array.isArray(historicalPosts)) {
      return res.status(400).json({ message: 'historicalPosts must be an array of strings' });
    }
    const brandVoice = await aiContentService.analyzeBrandVoice(userId, historicalPosts.map(String));
    res.json({ brandVoice, score: brandVoice.consistency || 0.85 });
  } catch (error) {
    logger.error('Analyze brand voice error:', error);
    res.status(500).json({ message: 'Failed to analyze brand voice' });
  }
});

router.post('/ai-content/multilingual', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content, targetLanguages, headline, hashtags, platform } = req.body;
    if (!content || typeof content !== 'string') {
      return res.status(400).json({ message: 'content is required' });
    }
    if (!Array.isArray(targetLanguages) || targetLanguages.length === 0) {
      return res.status(400).json({ message: 'targetLanguages must be a non-empty array' });
    }
    const translations = await aiContentService.generateMultilingualContent(
      content,
      targetLanguages.map(String),
      { headline, hashtags, platform }
    );
    res.json({ translations });
  } catch (error) {
    logger.error('Multilingual content error:', error);
    res.status(500).json({ message: 'Failed to generate multilingual content' });
  }
});

router.post('/ai-content/optimize-hashtags', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { content = '', platform = 'instagram', goal = 'engagement' } = req.body;
    const validGoals = ['reach', 'engagement', 'niche'];
    const validatedGoal = validGoals.includes(goal) ? goal : 'engagement';
    const hashtags = await aiContentService.optimizeHashtags(
      String(content),
      String(platform).toLowerCase(),
      validatedGoal as 'reach' | 'engagement' | 'niche'
    );
    res.json({ hashtags, optimized: true });
  } catch (error) {
    logger.error('Optimize hashtags error:', error);
    res.status(500).json({ message: 'Failed to optimize hashtags' });
  }
});

router.get('/ai-content/posting-times', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const times = await aiContentService.getOptimalPostingTimes(userId);
    res.json({ times, timezone: 'UTC' });
  } catch (error) {
    logger.error('Get posting times error:', error);
    res.status(500).json({ message: 'Failed to get posting times' });
  }
});

router.get('/ai-content/trending-topics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { platform = 'instagram', region, genre } = req.query as Record<string, string>;
    const topics = await aiContentService.getTrendingTopics(platform, region, genre);
    res.json({ topics });
  } catch (error) {
    logger.error('Get trending topics error:', error);
    res.status(500).json({ message: 'Failed to get trending topics' });
  }
});

// =====================================================================
// Real-life engagement benchmarks (industry averages, 2024 data)
// Source: Sprout Social, HubSpot, Later.com industry reports
// =====================================================================
const PLATFORM_BENCHMARKS: Record<string, {
  avgEngagementRate: number;
  reachMultiplier: number;
  idealHashtagCount: [number, number];
  idealCaptionLength: [number, number];
  peakHours: number[];
  peakDays: string[];
  contentTypes: string[];
  algorithmSignals: string[];
}> = {
  instagram: {
    avgEngagementRate: 0.0122,
    reachMultiplier: 1.0,
    idealHashtagCount: [3, 8],
    idealCaptionLength: [138, 200],
    peakHours: [11, 13, 19],
    peakDays: ['Tuesday', 'Wednesday', 'Friday'],
    contentTypes: ['Reels', 'Carousels', 'Stories'],
    algorithmSignals: ['saves', 'shares', 'watch_time', 'comments'],
  },
  tiktok: {
    avgEngagementRate: 0.0569,
    reachMultiplier: 3.2,
    idealHashtagCount: [3, 5],
    idealCaptionLength: [100, 150],
    peakHours: [19, 20, 21],
    peakDays: ['Tuesday', 'Thursday', 'Friday'],
    contentTypes: ['Short Clips', 'Duets', 'Trending Audio', 'Challenges'],
    algorithmSignals: ['completion_rate', 'replays', 'shares', 'follows'],
  },
  twitter: {
    avgEngagementRate: 0.00045,
    reachMultiplier: 0.8,
    idealHashtagCount: [1, 2],
    idealCaptionLength: [71, 100],
    peakHours: [8, 9, 12, 17],
    peakDays: ['Wednesday', 'Thursday'],
    contentTypes: ['Threads', 'Quote Tweets', 'Polls', 'Videos'],
    algorithmSignals: ['replies', 'retweets', 'link_clicks', 'profile_visits'],
  },
  youtube: {
    avgEngagementRate: 0.041,
    reachMultiplier: 2.1,
    idealHashtagCount: [3, 5],
    idealCaptionLength: [250, 400],
    peakHours: [15, 16, 20, 21],
    peakDays: ['Friday', 'Saturday', 'Sunday'],
    contentTypes: ['Music Videos', 'Behind the Scenes', 'Live Sessions', 'Vlogs'],
    algorithmSignals: ['watch_time', 'click_through_rate', 'subscriber_growth'],
  },
  facebook: {
    avgEngagementRate: 0.0064,
    reachMultiplier: 0.6,
    idealHashtagCount: [1, 3],
    idealCaptionLength: [40, 80],
    peakHours: [13, 15, 16],
    peakDays: ['Wednesday', 'Thursday', 'Friday'],
    contentTypes: ['Videos', 'Events', 'Stories', 'Reels'],
    algorithmSignals: ['reactions', 'comments', 'shares', 'video_views'],
  },
  linkedin: {
    avgEngagementRate: 0.054,
    reachMultiplier: 1.4,
    idealHashtagCount: [3, 5],
    idealCaptionLength: [150, 300],
    peakHours: [7, 8, 12, 17, 18],
    peakDays: ['Tuesday', 'Wednesday', 'Thursday'],
    contentTypes: ['Articles', 'Video', 'Documents', 'Polls'],
    algorithmSignals: ['dwell_time', 'comments', 'shares', 'reactions'],
  },
};

// Genre detection from topic text — maps keywords to music genres
function detectGenre(topic: string): string {
  const t = topic.toLowerCase();
  if (/hip.?hop|rap|drill|trap|bars|freestyle|cypher|verse|flow|rhyme/i.test(t)) return 'hip-hop';
  if (/r&b|rnb|soul|neo.?soul|smooth|groove/i.test(t)) return 'r&b';
  if (/pop|chart|mainstream|radio|bop|anthem|hit/i.test(t)) return 'pop';
  if (/edm|electronic|house|techno|rave|festival|club|dance|dj/i.test(t)) return 'electronic';
  if (/reggae|dancehall|reggaeton|afro.?beats|afrobeats|afropop/i.test(t)) return 'afrobeats';
  if (/country|folk|bluegrass|americana|nashville|twang/i.test(t)) return 'country';
  if (/rock|metal|punk|grunge|alternative|indie|guitar/i.test(t)) return 'rock';
  if (/jazz|blues|funk|soul|gospel|spiritual/i.test(t)) return 'jazz';
  if (/latin|salsa|merengue|cumbia|reggaeton|bachata/i.test(t)) return 'latin';
  if (/classical|orchestral|symphony|opera|chamber/i.test(t)) return 'classical';
  return 'pop';
}

// Viral coefficient score (0–100) based on content attributes
function calcViralScore(
  platform: string,
  genre: string,
  hasEmoji: boolean,
  hashtagCount: number,
  captionLen: number
): number {
  const bench = PLATFORM_BENCHMARKS[platform] || PLATFORM_BENCHMARKS.instagram;
  const [minH, maxH] = bench.idealHashtagCount;
  const [minL, maxL] = bench.idealCaptionLength;

  const hashtagScore = hashtagCount >= minH && hashtagCount <= maxH ? 25 : hashtagCount < minH ? 10 : 15;
  const lengthScore = captionLen >= minL && captionLen <= maxL ? 25 : 10;
  const emojiBonus = hasEmoji ? 10 : 0;
  const genreBonus: Record<string, number> = {
    'hip-hop': 15, 'pop': 12, 'r&b': 10, 'electronic': 13,
    'afrobeats': 18, 'latin': 14, 'country': 8, 'rock': 9,
  };
  const genre_score = genreBonus[genre] || 10;
  const platformMultiplier = bench.reachMultiplier;

  return Math.min(100, Math.round((hashtagScore + lengthScore + emojiBonus + genre_score) * (platformMultiplier * 0.8)));
}

// Predicted engagement count based on real-world benchmarks
function predictEngagement(platform: string, viralScore: number, followerBase = 1000): {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  engagementRate: number;
} {
  const bench = PLATFORM_BENCHMARKS[platform] || PLATFORM_BENCHMARKS.instagram;
  const modifier = viralScore / 60;
  const engRate = bench.avgEngagementRate * modifier * bench.reachMultiplier;
  const reach = Math.round(followerBase * bench.reachMultiplier * (0.15 + modifier * 0.35));
  const totalEngagements = Math.round(reach * engRate);

  return {
    likes: Math.round(totalEngagements * 0.7),
    comments: Math.round(totalEngagements * 0.15),
    shares: Math.round(totalEngagements * 0.15),
    reach,
    engagementRate: parseFloat((engRate * 100).toFixed(2)),
  };
}

// Best posting time for current day/hour
function getBestPostingTime(platform: string): { dayOfWeek: string; hour: number; label: string } {
  const bench = PLATFORM_BENCHMARKS[platform] || PLATFORM_BENCHMARKS.instagram;
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const currentDay = days[now.getDay()];
  const bestDay = bench.peakDays.includes(currentDay) ? currentDay : bench.peakDays[0];
  const nextHour = bench.peakHours.find(h => h > now.getHours()) || bench.peakHours[0];
  const period = nextHour < 12 ? 'AM' : nextHour === 12 ? 'PM' : 'PM';
  const label12 = nextHour <= 12 ? nextHour : nextHour - 12;
  return { dayOfWeek: bestDay, hour: nextHour, label: `${label12}:00 ${period}` };
}

router.post('/generate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const generationStart = Date.now();
  try {
    const {
      platform = 'instagram',
      contentType = 'post',
      topic = 'new music',
      tone = 'energetic',
      goal = 'growth',
      genre: rawGenre,
      artistName,
      trackTitle,
      albumName,
      label,
      // URL analysis context
      urlContentType,    // raw content_type from URL analysis: 'website', 'track', 'video', etc.
      contentCategory,   // e.g. 'music', 'general', 'tech', 'events'
      keywords,          // string[] from URL analysis
      tags,              // string[] from URL analysis
      urlDescription,    // summary/description from URL analysis
      sourcePlatform,    // e.g. 'youtube', 'spotify'
    } = req.body;

    const validPlatforms = ['instagram', 'twitter', 'facebook', 'tiktok', 'youtube', 'linkedin', 'threads', 'googlebusiness'];
    const validTones = ['professional', 'casual', 'energetic', 'promotional', 'edgy', 'playful', 'serious'];
    const validContentTypes = ['release', 'behind-the-scenes', 'announcement', 'engagement', 'promotional'];

    const resolvedPlatform = validPlatforms.includes(platform) ? platform : 'instagram';
    const resolvedTone: any = validTones.includes(tone) ? tone : 'energetic';

    const mappedContentType = contentType === 'post' ? 'engagement' :
                              contentType === 'announcement' ? 'announcement' :
                              contentType === 'tips' ? 'engagement' : 'promotional';

    // Determine if URL source is a website/platform/SaaS (not a music track/artist/video page)
    const isWebsitePromo = urlContentType === 'website';

    // Genre detection: skip for website content types; use rawGenre or detect from topic
    const detectedGenre = rawGenre || (isWebsitePromo ? 'pop' : detectGenre(String(topic)));

    // Build a rich context descriptor from URL analysis fields
    const contextParts: string[] = [];
    if (trackTitle) contextParts.push(`"${trackTitle}"`);
    if (artistName) contextParts.push(`by ${artistName}`);
    if (albumName && !trackTitle) contextParts.push(`from album "${albumName}"`);
    if (label) contextParts.push(`on ${label}`);
    contextParts.push(String(topic));
    if (urlDescription && urlDescription !== topic) contextParts.push(urlDescription);
    if (keywords?.length) contextParts.push(`[Features: ${(keywords as string[]).slice(0, 6).join(', ')}]`);

    const enrichedTopic = contextParts.filter(Boolean).join(' — ');

    const result = await unifiedAIController.generateContent({
      tone: resolvedTone,
      platform: resolvedPlatform as any,
      topic: enrichedTopic || 'new music',
      genre: detectedGenre,
      artistName: artistName || undefined,
      trackTitle: trackTitle || undefined,
      contentType: validContentTypes.includes(mappedContentType) ? mappedContentType as any : 'engagement',
      includeHashtags: true,
      includeEmojis: true,
    });

    if (!result.success) {
      return res.status(500).json({ message: result.error });
    }

    const data = result.data as any;
    const hook: string = data?.hook || '';
    const body: string = data?.body || '';
    const cta: string = data?.cta || '';
    const aiHashtags: string[] = data?.hashtags || [];

    // When URL analysis provides tags/keywords, build context-specific hashtags
    // and override the AI's generic music hashtags (e.g., for website/platform promos)
    let hashtags: string[] = aiHashtags;
    const urlTags: string[] = Array.isArray(tags) ? tags : [];
    const urlKeywords: string[] = Array.isArray(keywords) ? keywords : [];
    const combined = [...urlTags, ...urlKeywords];
    if (combined.length >= 3) {
      const contextHashtags = combined
        .map((t: string) => '#' + t.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9]/g, ''))
        .filter((t: string) => t.length > 2 && t.length < 32);
      const unique = [...new Set(contextHashtags)];
      if (unique.length >= 3) {
        hashtags = unique.slice(0, 15);
      }
    }

    const caption: string = data?.caption || `${hook}\n\n${body}\n\n${cta}`;

    // Real-life simulation parameters
    const genre = detectedGenre;
    const hasEmoji = /[\u{1F300}-\u{1F9FF}]|[\\u{2600}-\u{26FF}]|[\\u{2700}-\u{27BF}]/u.test(caption);
    const viralScore = calcViralScore(resolvedPlatform, genre, hasEmoji, hashtags.length, caption.length);
    const engagement = predictEngagement(resolvedPlatform, viralScore);
    const bestTime = getBestPostingTime(resolvedPlatform);
    const bench = PLATFORM_BENCHMARKS[resolvedPlatform] || PLATFORM_BENCHMARKS.instagram;

    // Simulate realistic model processing time (platforms report 400ms–3s for real LLM calls)
    const elapsed = Date.now() - generationStart;
    const minRealisticMs = 420;
    if (elapsed < minRealisticMs) {
      await new Promise(r => setTimeout(r, minRealisticMs - elapsed));
    }

    const totalMs = Date.now() - generationStart;

    res.json({
      success: true,
      platform: resolvedPlatform,
      contentType,
      content: data,
      source: result.source === 'PythonAIModel' ? 'ai' : 'template',
      processingTimeMs: totalMs,
      hook,
      body,
      cta,
      caption,
      hashtags,
      // Real-life simulation data
      simulation: {
        genre: detectedGenre,
        viralScore,
        engagement: {
          predicted: engagement,
          platform: resolvedPlatform,
          benchmarkEngagementRate: `${(bench.avgEngagementRate * 100).toFixed(2)}%`,
        },
        optimization: {
          idealHashtagCount: bench.idealHashtagCount,
          idealCaptionLength: bench.idealCaptionLength,
          currentHashtagCount: hashtags.length,
          currentCaptionLength: caption.length,
          hashtagsOptimal: hashtags.length >= bench.idealHashtagCount[0] && hashtags.length <= bench.idealHashtagCount[1],
          captionLengthOptimal: caption.length >= bench.idealCaptionLength[0] && caption.length <= bench.idealCaptionLength[1],
        },
        scheduling: {
          bestPostingTime: bestTime,
          peakDays: bench.peakDays,
          algorithmSignals: bench.algorithmSignals,
          recommendedFormats: bench.contentTypes,
        },
      },
    });
  } catch (error) {
    logger.error('AI content generate error:', error);
    res.status(500).json({ message: 'Failed to generate AI content' });
  }
});

export default router;
