import { Router, Request, Response } from 'express';
import { socialChatbotService, ChatbotMessage } from '../services/socialChatbotService';
import { socialListeningService } from '../services/socialListeningService';
import { socialStrategyAIService } from '../services/socialStrategyAIService';
import { logger } from '../logger';

const router = Router();

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

const requireAuth = (req: AuthenticatedRequest, res: Response, next: any) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Not authenticated' });
  }
  next();
};

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
    res.json({ variants: [] });
  } catch (error) {
    logger.error('Get AB variants error:', error);
    res.status(500).json({ message: 'Failed to get AB variants' });
  }
});

router.post('/ai-content/analyze-brand-voice', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ brandVoice: { tone: 'professional', style: 'friendly' }, score: 0.85 });
  } catch (error) {
    logger.error('Analyze brand voice error:', error);
    res.status(500).json({ message: 'Failed to analyze brand voice' });
  }
});

router.post('/ai-content/multilingual', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ translations: [] });
  } catch (error) {
    logger.error('Multilingual content error:', error);
    res.status(500).json({ message: 'Failed to generate multilingual content' });
  }
});

router.post('/ai-content/optimize-hashtags', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ hashtags: [], optimized: true });
  } catch (error) {
    logger.error('Optimize hashtags error:', error);
    res.status(500).json({ message: 'Failed to optimize hashtags' });
  }
});

router.get('/ai-content/posting-times', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ times: [], timezone: 'UTC' });
  } catch (error) {
    logger.error('Get posting times error:', error);
    res.status(500).json({ message: 'Failed to get posting times' });
  }
});

router.get('/ai-content/trending-topics', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ topics: [] });
  } catch (error) {
    logger.error('Get trending topics error:', error);
    res.status(500).json({ message: 'Failed to get trending topics' });
  }
});

export default router;
