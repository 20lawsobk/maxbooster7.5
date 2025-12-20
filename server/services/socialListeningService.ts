import { nanoid } from 'nanoid';
import { logger } from '../logger';

export interface Mention {
  id: string;
  platform: 'twitter' | 'instagram' | 'facebook' | 'linkedin' | 'tiktok' | 'youtube';
  type: 'mention' | 'hashtag' | 'keyword' | 'tag';
  content: string;
  authorId: string;
  authorName: string;
  authorHandle: string;
  authorFollowers: number;
  authorVerified: boolean;
  url: string;
  timestamp: Date;
  sentiment: 'positive' | 'neutral' | 'negative';
  reach: number;
  engagement: {
    likes: number;
    comments: number;
    shares: number;
    saves?: number;
  };
  mediaUrls?: string[];
  location?: string;
  language: string;
  isInfluencer: boolean;
  responded: boolean;
}

export interface SentimentAnalysis {
  overall: 'positive' | 'neutral' | 'negative';
  score: number;
  breakdown: {
    positive: number;
    neutral: number;
    negative: number;
  };
  trend: 'improving' | 'stable' | 'declining';
  topPositiveTopics: string[];
  topNegativeTopics: string[];
  emotionDistribution: Record<string, number>;
}

export interface TrendingTopic {
  id: string;
  topic: string;
  hashtag?: string;
  category: 'music' | 'entertainment' | 'technology' | 'lifestyle' | 'news' | 'sports' | 'business';
  volume: number;
  volumeChange: number;
  sentiment: 'positive' | 'neutral' | 'negative';
  platforms: string[];
  peakTime: Date;
  relatedHashtags: string[];
  isRelevant: boolean;
  relevanceScore: number;
}

export interface CompetitorAnalysis {
  competitorId: string;
  name: string;
  handle: string;
  platforms: Array<{
    platform: string;
    followers: number;
    followersGrowth: number;
    engagementRate: number;
    postsPerWeek: number;
    avgLikes: number;
    avgComments: number;
    avgShares: number;
  }>;
  topContent: Array<{
    platform: string;
    content: string;
    engagement: number;
    type: string;
  }>;
  postingSchedule: Record<string, number[]>;
  contentMix: Record<string, number>;
  hashtagStrategy: string[];
  recentCampaigns: string[];
}

export interface BrandHealth {
  overallScore: number;
  trend: 'improving' | 'stable' | 'declining';
  metrics: {
    awareness: number;
    sentiment: number;
    engagement: number;
    reach: number;
    shareOfVoice: number;
  };
  benchmarks: {
    industry: number;
    competitors: number;
  };
  alerts: Array<{
    type: 'positive' | 'negative' | 'neutral';
    message: string;
    timestamp: Date;
    priority: 'high' | 'medium' | 'low';
  }>;
}

export interface ShareOfVoice {
  yourBrand: {
    mentions: number;
    percentage: number;
    reach: number;
    sentiment: number;
  };
  competitors: Array<{
    name: string;
    mentions: number;
    percentage: number;
    reach: number;
    sentiment: number;
  }>;
  industryTotal: number;
  trend: Array<{
    date: string;
    yourShare: number;
    competitorShares: Record<string, number>;
  }>;
}

export interface ListeningQuery {
  id: string;
  name: string;
  type: 'keyword' | 'hashtag' | 'mention' | 'phrase';
  query: string;
  platforms: string[];
  enabled: boolean;
  createdAt: Date;
}

class SocialListeningService {
  private trackedKeywords: Map<string, ListeningQuery> = new Map();
  private mentionCache: Map<string, Mention[]> = new Map();

  constructor() {
    this.initializeDefaultKeywords();
  }

  private initializeDefaultKeywords() {
    const defaultQueries: Omit<ListeningQuery, 'id' | 'createdAt'>[] = [
      { name: 'Brand Mention', type: 'mention', query: '@brandname', platforms: ['twitter', 'instagram'], enabled: true },
      { name: 'Product Hashtag', type: 'hashtag', query: '#brandname', platforms: ['twitter', 'instagram', 'tiktok'], enabled: true },
      { name: 'Industry Keywords', type: 'keyword', query: 'music distribution', platforms: ['twitter', 'linkedin'], enabled: true },
    ];

    defaultQueries.forEach(query => {
      const id = nanoid();
      this.trackedKeywords.set(id, { ...query, id, createdAt: new Date() });
    });
  }

  async getMentions(
    userId: string,
    options: {
      platforms?: string[];
      sentiment?: 'positive' | 'neutral' | 'negative';
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
      influencersOnly?: boolean;
    } = {}
  ): Promise<{ mentions: Mention[]; total: number; hasMore: boolean }> {
    const { limit = 50, offset = 0 } = options;

    const mentions: Mention[] = this.generateMockMentions(100, options);
    
    const filtered = mentions.slice(offset, offset + limit);

    return {
      mentions: filtered,
      total: mentions.length,
      hasMore: offset + limit < mentions.length,
    };
  }

  private generateMockMentions(count: number, options: any): Mention[] {
    const platforms = ['twitter', 'instagram', 'facebook', 'tiktok', 'youtube', 'linkedin'] as const;
    const sentiments = ['positive', 'neutral', 'negative'] as const;
    const types = ['mention', 'hashtag', 'keyword', 'tag'] as const;
    
    const sampleContent = [
      "Just discovered this amazing music platform! 🎵 Game changer for independent artists.",
      "Anyone else using this for their music distribution? Thoughts?",
      "Finally, a platform that understands what artists need. Highly recommend!",
      "Mixed feelings about the new update. Some features are great, others need work.",
      "The customer support team is incredibly helpful. Had an issue resolved in minutes!",
      "Not sure if the premium tier is worth it. Anyone have experience?",
      "This is exactly what the music industry needed. Revolutionary! 🚀",
      "Having some issues with the upload feature. Hope it gets fixed soon.",
      "Best decision I made for my music career. The analytics are incredible!",
      "Just released my new single through this platform. So easy to use!",
    ];

    const mentions: Mention[] = [];
    for (let i = 0; i < count; i++) {
      const platform = platforms[Math.floor(Math.random() * platforms.length)];
      const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
      const followers = Math.floor(Math.random() * 1000000);
      const isInfluencer = followers > 50000;

      mentions.push({
        id: nanoid(),
        platform,
        type: types[Math.floor(Math.random() * types.length)],
        content: sampleContent[Math.floor(Math.random() * sampleContent.length)],
        authorId: nanoid(),
        authorName: `User ${i + 1}`,
        authorHandle: `@user${i + 1}`,
        authorFollowers: followers,
        authorVerified: Math.random() > 0.9,
        url: `https://${platform}.com/post/${nanoid()}`,
        timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        sentiment,
        reach: followers * (1 + Math.random()),
        engagement: {
          likes: Math.floor(Math.random() * 10000),
          comments: Math.floor(Math.random() * 500),
          shares: Math.floor(Math.random() * 1000),
          saves: Math.floor(Math.random() * 200),
        },
        language: 'en',
        isInfluencer,
        responded: Math.random() > 0.7,
      });
    }

    return mentions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  async analyzeSentiment(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      platforms?: string[];
    } = {}
  ): Promise<SentimentAnalysis> {
    const positive = 450 + Math.floor(Math.random() * 100);
    const neutral = 320 + Math.floor(Math.random() * 80);
    const negative = 80 + Math.floor(Math.random() * 40);
    const total = positive + neutral + negative;

    const score = (positive - negative) / total;

    return {
      overall: score > 0.2 ? 'positive' : score < -0.2 ? 'negative' : 'neutral',
      score: Math.round(score * 100) / 100,
      breakdown: {
        positive: Math.round((positive / total) * 100),
        neutral: Math.round((neutral / total) * 100),
        negative: Math.round((negative / total) * 100),
      },
      trend: score > 0.1 ? 'improving' : score < -0.1 ? 'declining' : 'stable',
      topPositiveTopics: [
        'Customer Service',
        'Ease of Use',
        'Distribution Speed',
        'Analytics Dashboard',
        'Pricing',
      ],
      topNegativeTopics: [
        'Upload Issues',
        'Payment Delays',
        'UI Complexity',
      ],
      emotionDistribution: {
        joy: 35,
        trust: 25,
        anticipation: 15,
        surprise: 8,
        sadness: 7,
        fear: 5,
        anger: 3,
        disgust: 2,
      },
    };
  }

  async getTrendingTopics(
    userId: string,
    options: {
      industry?: string;
      region?: string;
      platforms?: string[];
      limit?: number;
    } = {}
  ): Promise<TrendingTopic[]> {
    const { limit = 20 } = options;

    const categories = ['music', 'entertainment', 'technology', 'lifestyle', 'news'] as const;
    const topics: TrendingTopic[] = [];

    const trendingData = [
      { topic: 'AI in Music Production', hashtag: '#AIMusic', category: 'technology', relevance: 0.95 },
      { topic: 'Independent Artists Rising', hashtag: '#IndieMusic', category: 'music', relevance: 0.92 },
      { topic: 'Music Distribution Tips', hashtag: '#MusicDistribution', category: 'music', relevance: 0.98 },
      { topic: 'Streaming Royalties', hashtag: '#StreamingRoyalties', category: 'music', relevance: 0.88 },
      { topic: 'New Music Friday', hashtag: '#NewMusicFriday', category: 'entertainment', relevance: 0.85 },
      { topic: 'Producer Life', hashtag: '#ProducerLife', category: 'music', relevance: 0.82 },
      { topic: 'Home Studio Setup', hashtag: '#HomeStudio', category: 'technology', relevance: 0.78 },
      { topic: 'Music Marketing', hashtag: '#MusicMarketing', category: 'music', relevance: 0.90 },
      { topic: 'Sync Licensing', hashtag: '#SyncLicensing', category: 'music', relevance: 0.75 },
      { topic: 'Beat Making', hashtag: '#BeatMaking', category: 'music', relevance: 0.80 },
    ];

    for (let i = 0; i < Math.min(limit, trendingData.length); i++) {
      const data = trendingData[i];
      topics.push({
        id: nanoid(),
        topic: data.topic,
        hashtag: data.hashtag,
        category: data.category as any,
        volume: Math.floor(Math.random() * 100000) + 10000,
        volumeChange: Math.floor(Math.random() * 200) - 50,
        sentiment: Math.random() > 0.3 ? 'positive' : 'neutral',
        platforms: ['twitter', 'instagram', 'tiktok'].slice(0, Math.floor(Math.random() * 3) + 1),
        peakTime: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000),
        relatedHashtags: [`${data.hashtag}2024`, `${data.hashtag}Tips`, `${data.hashtag}Community`],
        isRelevant: data.relevance > 0.7,
        relevanceScore: data.relevance,
      });
    }

    return topics.sort((a, b) => b.relevanceScore - a.relevanceScore);
  }

  async analyzeCompetitors(
    userId: string,
    competitorHandles: string[]
  ): Promise<CompetitorAnalysis[]> {
    const analyses: CompetitorAnalysis[] = [];

    for (const handle of competitorHandles) {
      const baseFollowers = Math.floor(Math.random() * 500000) + 50000;
      
      analyses.push({
        competitorId: nanoid(),
        name: handle.replace('@', '').replace('_', ' '),
        handle,
        platforms: [
          {
            platform: 'instagram',
            followers: baseFollowers,
            followersGrowth: Math.random() * 10 - 2,
            engagementRate: Math.random() * 5 + 1,
            postsPerWeek: Math.floor(Math.random() * 10) + 3,
            avgLikes: Math.floor(baseFollowers * (Math.random() * 0.05 + 0.01)),
            avgComments: Math.floor(baseFollowers * (Math.random() * 0.005 + 0.001)),
            avgShares: Math.floor(baseFollowers * (Math.random() * 0.002 + 0.0005)),
          },
          {
            platform: 'twitter',
            followers: Math.floor(baseFollowers * 0.7),
            followersGrowth: Math.random() * 8 - 1,
            engagementRate: Math.random() * 3 + 0.5,
            postsPerWeek: Math.floor(Math.random() * 20) + 5,
            avgLikes: Math.floor(baseFollowers * 0.7 * (Math.random() * 0.02 + 0.005)),
            avgComments: Math.floor(baseFollowers * 0.7 * (Math.random() * 0.003 + 0.001)),
            avgShares: Math.floor(baseFollowers * 0.7 * (Math.random() * 0.005 + 0.001)),
          },
          {
            platform: 'tiktok',
            followers: Math.floor(baseFollowers * 1.5),
            followersGrowth: Math.random() * 20 + 5,
            engagementRate: Math.random() * 8 + 3,
            postsPerWeek: Math.floor(Math.random() * 7) + 2,
            avgLikes: Math.floor(baseFollowers * 1.5 * (Math.random() * 0.1 + 0.02)),
            avgComments: Math.floor(baseFollowers * 1.5 * (Math.random() * 0.01 + 0.002)),
            avgShares: Math.floor(baseFollowers * 1.5 * (Math.random() * 0.02 + 0.005)),
          },
        ],
        topContent: [
          { platform: 'instagram', content: 'Behind the scenes studio session 🎵', engagement: Math.floor(Math.random() * 50000), type: 'video' },
          { platform: 'twitter', content: 'New track dropping this Friday! Stay tuned 🔥', engagement: Math.floor(Math.random() * 20000), type: 'text' },
          { platform: 'tiktok', content: 'Making a beat in 60 seconds challenge', engagement: Math.floor(Math.random() * 200000), type: 'video' },
        ],
        postingSchedule: {
          monday: [9, 12, 18],
          tuesday: [10, 14, 20],
          wednesday: [9, 13, 19],
          thursday: [11, 15, 21],
          friday: [10, 14, 22],
          saturday: [12, 18],
          sunday: [14, 20],
        },
        contentMix: {
          video: 45,
          image: 30,
          carousel: 15,
          text: 10,
        },
        hashtagStrategy: ['#music', '#producer', '#newmusic', '#artist', '#beats'],
        recentCampaigns: ['Album Launch', 'Tour Announcement', 'Merch Drop'],
      });
    }

    return analyses;
  }

  async getBrandHealth(userId: string): Promise<BrandHealth> {
    const awarenessScore = Math.floor(Math.random() * 20) + 70;
    const sentimentScore = Math.floor(Math.random() * 15) + 75;
    const engagementScore = Math.floor(Math.random() * 25) + 65;
    const reachScore = Math.floor(Math.random() * 20) + 70;
    const sovScore = Math.floor(Math.random() * 30) + 40;

    const overallScore = Math.floor((awarenessScore + sentimentScore + engagementScore + reachScore + sovScore) / 5);

    return {
      overallScore,
      trend: overallScore > 75 ? 'improving' : overallScore < 60 ? 'declining' : 'stable',
      metrics: {
        awareness: awarenessScore,
        sentiment: sentimentScore,
        engagement: engagementScore,
        reach: reachScore,
        shareOfVoice: sovScore,
      },
      benchmarks: {
        industry: 68,
        competitors: 72,
      },
      alerts: [
        {
          type: 'positive',
          message: 'Engagement rate increased by 15% this week',
          timestamp: new Date(),
          priority: 'medium',
        },
        {
          type: 'positive',
          message: 'Viral mention from influencer with 500K followers',
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
          priority: 'high',
        },
        {
          type: 'negative',
          message: 'Slight increase in negative mentions about pricing',
          timestamp: new Date(Date.now() - 12 * 60 * 60 * 1000),
          priority: 'medium',
        },
      ],
    };
  }

  async getShareOfVoice(
    userId: string,
    competitorNames: string[]
  ): Promise<ShareOfVoice> {
    const totalMentions = Math.floor(Math.random() * 10000) + 5000;
    const yourMentions = Math.floor(totalMentions * (Math.random() * 0.3 + 0.2));
    
    const competitors = competitorNames.map(name => {
      const mentions = Math.floor((totalMentions - yourMentions) / competitorNames.length * (0.5 + Math.random()));
      return {
        name,
        mentions,
        percentage: Math.round((mentions / totalMentions) * 100),
        reach: mentions * (Math.floor(Math.random() * 500) + 100),
        sentiment: Math.random() * 0.6 + 0.2,
      };
    });

    const trend: Array<{ date: string; yourShare: number; competitorShares: Record<string, number> }> = [];
    for (let i = 30; i >= 0; i--) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const competitorShares: Record<string, number> = {};
      competitorNames.forEach(name => {
        competitorShares[name] = Math.random() * 20 + 10;
      });
      trend.push({
        date: date.toISOString().split('T')[0],
        yourShare: Math.random() * 15 + 25,
        competitorShares,
      });
    }

    return {
      yourBrand: {
        mentions: yourMentions,
        percentage: Math.round((yourMentions / totalMentions) * 100),
        reach: yourMentions * (Math.floor(Math.random() * 500) + 200),
        sentiment: Math.random() * 0.3 + 0.6,
      },
      competitors,
      industryTotal: totalMentions,
      trend,
    };
  }

  async addListeningQuery(
    userId: string,
    query: Omit<ListeningQuery, 'id' | 'createdAt'>
  ): Promise<ListeningQuery> {
    const newQuery: ListeningQuery = {
      id: nanoid(),
      ...query,
      createdAt: new Date(),
    };

    this.trackedKeywords.set(newQuery.id, newQuery);
    
    logger.info(`Listening query added for user ${userId}`, {
      queryId: newQuery.id,
      type: query.type,
    });

    return newQuery;
  }

  async getListeningQueries(userId: string): Promise<ListeningQuery[]> {
    return Array.from(this.trackedKeywords.values());
  }

  async deleteListeningQuery(userId: string, queryId: string): Promise<boolean> {
    return this.trackedKeywords.delete(queryId);
  }

  async getIndustryBenchmarks(
    industry: string = 'music'
  ): Promise<{
    engagementRate: { average: number; top10: number; bottom10: number };
    postFrequency: { average: number; recommended: number };
    responseTime: { average: number; excellent: number };
    followerGrowth: { average: number; top10: number };
    contentTypes: Record<string, number>;
    bestTimes: Record<string, number[]>;
  }> {
    return {
      engagementRate: {
        average: 3.2,
        top10: 8.5,
        bottom10: 0.8,
      },
      postFrequency: {
        average: 7,
        recommended: 14,
      },
      responseTime: {
        average: 4.5,
        excellent: 1,
      },
      followerGrowth: {
        average: 2.5,
        top10: 15,
      },
      contentTypes: {
        video: 40,
        image: 35,
        carousel: 15,
        text: 10,
      },
      bestTimes: {
        monday: [9, 12, 18],
        tuesday: [10, 14, 20],
        wednesday: [9, 13, 19],
        thursday: [11, 15, 21],
        friday: [10, 14, 22],
        saturday: [11, 15, 20],
        sunday: [12, 17, 21],
      },
    };
  }
}

export const socialListeningService = new SocialListeningService();
