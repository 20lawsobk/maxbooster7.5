import { nanoid } from 'nanoid';
import { logger } from '../logger';

export interface ContentRecommendation {
  id: string;
  type: 'post' | 'story' | 'reel' | 'video' | 'carousel' | 'thread' | 'live';
  platform: string;
  title: string;
  description: string;
  suggestedContent: string;
  hashtags: string[];
  bestTime: Date;
  expectedEngagement: number;
  priority: 'high' | 'medium' | 'low';
  reasoning: string;
  trendAlignment?: string;
  contentPillars: string[];
}

export interface CampaignRecommendation {
  id: string;
  name: string;
  objective: 'awareness' | 'engagement' | 'traffic' | 'conversions' | 'followers';
  duration: {
    start: Date;
    end: Date;
  };
  platforms: string[];
  budget?: {
    recommended: number;
    min: number;
    max: number;
  };
  contentMix: Array<{
    type: string;
    percentage: number;
    count: number;
  }>;
  keyMessages: string[];
  targetAudience: {
    demographics: string[];
    interests: string[];
    behaviors: string[];
  };
  kpis: Array<{
    metric: string;
    target: number;
    current?: number;
  }>;
  timeline: Array<{
    date: Date;
    action: string;
    platform: string;
  }>;
  expectedResults: {
    reach: number;
    engagement: number;
    followers: number;
    conversions?: number;
  };
  reasoning: string;
}

export interface ContentStrategy {
  id: string;
  period: 'weekly' | 'monthly' | 'quarterly';
  pillars: Array<{
    name: string;
    percentage: number;
    description: string;
    examples: string[];
  }>;
  platformStrategies: Array<{
    platform: string;
    focus: string;
    postFrequency: number;
    contentTypes: string[];
    bestTimes: string[];
    tone: string;
    hashtags: string[];
  }>;
  themes: Array<{
    week: number;
    theme: string;
    contentIdeas: string[];
  }>;
  goals: Array<{
    metric: string;
    current: number;
    target: number;
    timeframe: string;
  }>;
}

export interface PostingTimeRecommendation {
  platform: string;
  dayOfWeek: string;
  times: Array<{
    hour: number;
    score: number;
    audienceActivity: number;
    competitorActivity: number;
    reasoning: string;
  }>;
  overallBest: {
    day: string;
    hour: number;
    expectedEngagement: number;
  };
}

export interface GrowthPrediction {
  platform: string;
  currentFollowers: number;
  predictions: Array<{
    date: Date;
    followers: number;
    confidence: number;
  }>;
  growthDrivers: string[];
  risks: string[];
  recommendations: string[];
  scenarios: {
    conservative: number;
    moderate: number;
    optimistic: number;
  };
}

export interface EngagementTip {
  id: string;
  category: 'content' | 'timing' | 'hashtags' | 'engagement' | 'growth' | 'analytics';
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'high' | 'medium' | 'low';
  platforms: string[];
  actionItems: string[];
  examples?: string[];
  expectedImprovement: number;
}

export interface ContentPlan {
  id: string;
  name: string;
  period: {
    start: Date;
    end: Date;
  };
  posts: Array<{
    id: string;
    date: Date;
    time: string;
    platform: string;
    type: string;
    content: string;
    hashtags: string[];
    mediaDescription?: string;
    status: 'draft' | 'scheduled' | 'published';
    pillar: string;
  }>;
  stats: {
    totalPosts: number;
    byPlatform: Record<string, number>;
    byType: Record<string, number>;
    byPillar: Record<string, number>;
  };
}

export interface AIInsight {
  id: string;
  type: 'opportunity' | 'warning' | 'trend' | 'recommendation';
  title: string;
  description: string;
  data?: Record<string, any>;
  actionRequired: boolean;
  priority: 'high' | 'medium' | 'low';
  createdAt: Date;
}

class SocialStrategyAIService {
  private contentPillars = [
    'Educational',
    'Entertainment',
    'Behind the Scenes',
    'User Generated Content',
    'Promotional',
    'Community Engagement',
    'Trending/Viral',
    'Personal/Authentic',
  ];

  private platformOptimalTimes: Record<string, Record<string, number[]>> = {
    instagram: {
      monday: [11, 14, 19],
      tuesday: [10, 14, 21],
      wednesday: [11, 15, 20],
      thursday: [12, 15, 21],
      friday: [10, 14, 17],
      saturday: [10, 13],
      sunday: [10, 14, 19],
    },
    twitter: {
      monday: [8, 12, 17],
      tuesday: [9, 12, 18],
      wednesday: [9, 12, 17],
      thursday: [8, 11, 16],
      friday: [9, 11, 15],
      saturday: [9, 12],
      sunday: [9, 15],
    },
    facebook: {
      monday: [9, 13, 16],
      tuesday: [9, 12, 15],
      wednesday: [9, 12, 18],
      thursday: [8, 12, 17],
      friday: [9, 11, 14],
      saturday: [12, 13],
      sunday: [13, 15, 18],
    },
    tiktok: {
      monday: [6, 10, 22],
      tuesday: [9, 12, 19],
      wednesday: [7, 11, 22],
      thursday: [12, 15, 21],
      friday: [5, 13, 15],
      saturday: [11, 19, 21],
      sunday: [7, 8, 16],
    },
    linkedin: {
      monday: [7, 10, 12],
      tuesday: [8, 10, 12],
      wednesday: [9, 10, 12],
      thursday: [8, 10, 14],
      friday: [9, 11, 12],
      saturday: [],
      sunday: [],
    },
  };

  async getContentRecommendations(
    userId: string,
    options: {
      platforms?: string[];
      count?: number;
      timeframe?: 'today' | 'week' | 'month';
    } = {}
  ): Promise<ContentRecommendation[]> {
    const { platforms = ['instagram', 'twitter', 'tiktok'], count = 10 } = options;
    const recommendations: ContentRecommendation[] = [];

    const contentIdeas = [
      { title: 'Studio Session Behind the Scenes', type: 'reel', pillar: 'Behind the Scenes', trend: 'Studio aesthetics' },
      { title: 'New Track Teaser', type: 'video', pillar: 'Promotional', trend: 'Music teasers' },
      { title: 'Fan Q&A Session', type: 'story', pillar: 'Community Engagement', trend: 'Interactive content' },
      { title: 'Production Tips & Tricks', type: 'carousel', pillar: 'Educational', trend: 'Tutorial content' },
      { title: 'Day in the Life', type: 'reel', pillar: 'Personal/Authentic', trend: 'Artist lifestyle' },
      { title: 'Throwback to First Performance', type: 'post', pillar: 'Personal/Authentic', trend: 'Throwback Thursday' },
      { title: 'Cover Song Challenge', type: 'reel', pillar: 'Entertainment', trend: 'Music challenges' },
      { title: 'Equipment Breakdown', type: 'carousel', pillar: 'Educational', trend: 'Gear reviews' },
      { title: 'Collaboration Announcement', type: 'post', pillar: 'Promotional', trend: 'Artist collaborations' },
      { title: 'Fan Art Feature', type: 'story', pillar: 'User Generated Content', trend: 'Community spotlight' },
    ];

    for (let i = 0; i < Math.min(count, contentIdeas.length); i++) {
      const idea = contentIdeas[i];
      const platform = platforms[i % platforms.length];
      const nextDate = new Date();
      nextDate.setDate(nextDate.getDate() + Math.floor(i / platforms.length));
      const optimalHours = this.platformOptimalTimes[platform]?.[this.getDayName(nextDate)] || [12];
      nextDate.setHours(optimalHours[0] || 12, 0, 0, 0);

      recommendations.push({
        id: nanoid(),
        type: idea.type as any,
        platform,
        title: idea.title,
        description: `Create a ${idea.type} about ${idea.title.toLowerCase()} to engage your audience.`,
        suggestedContent: this.generateSuggestedContent(idea.title, platform),
        hashtags: this.generateHashtags(idea.pillar, platform),
        bestTime: nextDate,
        expectedEngagement: Math.floor(Math.random() * 5000) + 1000,
        priority: i < 3 ? 'high' : i < 6 ? 'medium' : 'low',
        reasoning: `This content aligns with the "${idea.trend}" trend and your "${idea.pillar}" content pillar.`,
        trendAlignment: idea.trend,
        contentPillars: [idea.pillar],
      });
    }

    return recommendations;
  }

  private getDayName(date: Date): string {
    return ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][date.getDay()];
  }

  private generateSuggestedContent(title: string, platform: string): string {
    const templates: Record<string, string> = {
      instagram: `✨ ${title}\n\nShare your journey with your fans. Be authentic and engaging!\n\n#music #artist #creative`,
      twitter: `🎵 ${title}\n\nQuick and engaging content for your followers.\n\nWhat do you think? 👇`,
      tiktok: `${title} 🎬\n\nHook viewers in the first 3 seconds. Keep it dynamic and fun!`,
      facebook: `${title}\n\nShare the full story with your community. Encourage comments and shares!`,
      linkedin: `${title}\n\nShare professional insights and industry knowledge with your network.`,
    };
    return templates[platform] || templates.instagram;
  }

  private generateHashtags(pillar: string, platform: string): string[] {
    const baseHashtags = ['music', 'artist', 'newmusic', 'musicproducer'];
    const pillarHashtags: Record<string, string[]> = {
      'Educational': ['tutorial', 'tips', 'howto', 'learn'],
      'Entertainment': ['fun', 'viral', 'trending', 'entertainment'],
      'Behind the Scenes': ['bts', 'behindthescenes', 'studiolife', 'makingof'],
      'User Generated Content': ['fanart', 'community', 'fans', 'ugc'],
      'Promotional': ['newrelease', 'outnow', 'linkinbio', 'streaming'],
      'Community Engagement': ['qanda', 'askme', 'community', 'connect'],
      'Trending/Viral': ['trending', 'fyp', 'viral', 'explore'],
      'Personal/Authentic': ['authentic', 'real', 'journey', 'story'],
    };
    return [...baseHashtags, ...(pillarHashtags[pillar] || [])].map(h => `#${h}`);
  }

  async getCampaignRecommendations(
    userId: string,
    options: {
      objective?: string;
      budget?: number;
      duration?: number;
    } = {}
  ): Promise<CampaignRecommendation[]> {
    const { objective = 'engagement', budget = 500, duration = 14 } = options;

    const startDate = new Date();
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + duration);

    const recommendations: CampaignRecommendation[] = [
      {
        id: nanoid(),
        name: 'New Release Launch Campaign',
        objective: 'awareness',
        duration: { start: startDate, end: endDate },
        platforms: ['instagram', 'tiktok', 'twitter'],
        budget: { recommended: budget, min: budget * 0.5, max: budget * 2 },
        contentMix: [
          { type: 'reel', percentage: 40, count: 8 },
          { type: 'story', percentage: 30, count: 15 },
          { type: 'post', percentage: 20, count: 4 },
          { type: 'live', percentage: 10, count: 1 },
        ],
        keyMessages: [
          'Exciting new release announcement',
          'Behind the scenes of creation',
          'Pre-save for exclusive access',
          'Fan appreciation and engagement',
        ],
        targetAudience: {
          demographics: ['18-34', 'music enthusiasts', 'urban'],
          interests: ['indie music', 'new artists', 'music discovery'],
          behaviors: ['frequent streamers', 'playlist creators', 'concert goers'],
        },
        kpis: [
          { metric: 'Reach', target: 100000 },
          { metric: 'Engagement Rate', target: 5 },
          { metric: 'Pre-saves', target: 1000 },
          { metric: 'New Followers', target: 500 },
        ],
        timeline: this.generateCampaignTimeline(startDate, duration),
        expectedResults: {
          reach: 100000,
          engagement: 15000,
          followers: 500,
          conversions: 1000,
        },
        reasoning: 'This campaign leverages the excitement around new releases with a multi-platform approach to maximize reach and engagement.',
      },
      {
        id: nanoid(),
        name: 'Community Growth Campaign',
        objective: 'followers',
        duration: { start: startDate, end: endDate },
        platforms: ['instagram', 'tiktok'],
        budget: { recommended: budget * 0.8, min: budget * 0.4, max: budget * 1.5 },
        contentMix: [
          { type: 'reel', percentage: 50, count: 10 },
          { type: 'story', percentage: 35, count: 18 },
          { type: 'carousel', percentage: 15, count: 3 },
        ],
        keyMessages: [
          'Join our community',
          'Exclusive content for followers',
          'Interactive challenges',
          'Fan spotlight features',
        ],
        targetAudience: {
          demographics: ['16-28', 'content creators', 'music fans'],
          interests: ['viral trends', 'music challenges', 'creator community'],
          behaviors: ['high engagement', 'content sharers', 'trend participants'],
        },
        kpis: [
          { metric: 'New Followers', target: 1000 },
          { metric: 'Engagement Rate', target: 7 },
          { metric: 'Story Views', target: 5000 },
        ],
        timeline: this.generateCampaignTimeline(startDate, duration),
        expectedResults: {
          reach: 80000,
          engagement: 12000,
          followers: 1000,
        },
        reasoning: 'Focus on viral-worthy content and community building to attract and retain new followers.',
      },
    ];

    return recommendations;
  }

  private generateCampaignTimeline(startDate: Date, duration: number): Array<{ date: Date; action: string; platform: string }> {
    const timeline: Array<{ date: Date; action: string; platform: string }> = [];
    const actions = [
      { day: 0, action: 'Teaser post announcement', platform: 'instagram' },
      { day: 1, action: 'Behind the scenes story', platform: 'instagram' },
      { day: 2, action: 'Countdown begins', platform: 'twitter' },
      { day: 3, action: 'Exclusive preview', platform: 'tiktok' },
      { day: 5, action: 'Fan engagement post', platform: 'instagram' },
      { day: 7, action: 'Mid-campaign push', platform: 'tiktok' },
      { day: 10, action: 'User generated content feature', platform: 'instagram' },
      { day: duration - 2, action: 'Final countdown', platform: 'twitter' },
      { day: duration - 1, action: 'Launch celebration', platform: 'instagram' },
    ];

    for (const item of actions) {
      if (item.day <= duration) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + item.day);
        timeline.push({ date, action: item.action, platform: item.platform });
      }
    }

    return timeline;
  }

  async getContentStrategy(
    userId: string,
    period: 'weekly' | 'monthly' | 'quarterly' = 'monthly'
  ): Promise<ContentStrategy> {
    return {
      id: nanoid(),
      period,
      pillars: [
        { name: 'Educational', percentage: 25, description: 'Teach your audience something valuable', examples: ['Production tips', 'Industry insights', 'How-to guides'] },
        { name: 'Behind the Scenes', percentage: 25, description: 'Show the authentic creative process', examples: ['Studio sessions', 'Songwriting process', 'Day in the life'] },
        { name: 'Promotional', percentage: 20, description: 'Share your music and achievements', examples: ['New releases', 'Streaming milestones', 'Announcements'] },
        { name: 'Community', percentage: 20, description: 'Engage with your fans', examples: ['Q&A sessions', 'Fan features', 'Challenges'] },
        { name: 'Entertainment', percentage: 10, description: 'Fun and viral content', examples: ['Trends', 'Memes', 'Collaborations'] },
      ],
      platformStrategies: [
        {
          platform: 'instagram',
          focus: 'Visual storytelling and community building',
          postFrequency: 7,
          contentTypes: ['reels', 'carousels', 'stories'],
          bestTimes: ['11am', '2pm', '7pm'],
          tone: 'Authentic and engaging',
          hashtags: ['#music', '#artist', '#newmusic', '#indieartist'],
        },
        {
          platform: 'tiktok',
          focus: 'Viral content and trend participation',
          postFrequency: 5,
          contentTypes: ['short videos', 'duets', 'trends'],
          bestTimes: ['12pm', '7pm', '10pm'],
          tone: 'Fun and relatable',
          hashtags: ['#fyp', '#music', '#viral', '#newartist'],
        },
        {
          platform: 'twitter',
          focus: 'Real-time engagement and announcements',
          postFrequency: 14,
          contentTypes: ['tweets', 'threads', 'polls'],
          bestTimes: ['9am', '12pm', '5pm'],
          tone: 'Conversational and witty',
          hashtags: ['#NewMusic', '#NowPlaying', '#MusicTwitter'],
        },
      ],
      themes: this.generateMonthlyThemes(period),
      goals: [
        { metric: 'Followers', current: 10000, target: 15000, timeframe: period },
        { metric: 'Engagement Rate', current: 3.5, target: 5, timeframe: period },
        { metric: 'Monthly Reach', current: 50000, target: 100000, timeframe: period },
        { metric: 'Website Clicks', current: 500, target: 1000, timeframe: period },
      ],
    };
  }

  private generateMonthlyThemes(period: string): Array<{ week: number; theme: string; contentIdeas: string[] }> {
    const themes = [
      { week: 1, theme: 'Artist Journey', contentIdeas: ['Origin story', 'First performance throwback', 'Goals for the year'] },
      { week: 2, theme: 'Creative Process', contentIdeas: ['Studio tour', 'Songwriting session', 'Gear breakdown'] },
      { week: 3, theme: 'Community Focus', contentIdeas: ['Fan Q&A', 'Cover requests', 'Collaboration shoutouts'] },
      { week: 4, theme: 'Growth & Gratitude', contentIdeas: ['Milestone celebration', 'Thank you post', 'Upcoming teasers'] },
    ];
    return themes;
  }

  async getBestPostingTimes(
    userId: string,
    platforms: string[] = ['instagram', 'twitter', 'tiktok']
  ): Promise<PostingTimeRecommendation[]> {
    const recommendations: PostingTimeRecommendation[] = [];
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];

    for (const platform of platforms) {
      const platformTimes = this.platformOptimalTimes[platform] || this.platformOptimalTimes.instagram;
      let bestDay = 'wednesday';
      let bestHour = 12;
      let maxScore = 0;

      const dayRecommendations: PostingTimeRecommendation['times'][] = [];

      for (const day of days) {
        const hours = platformTimes[day] || [];
        const times = hours.map(hour => {
          const score = Math.random() * 30 + 70;
          if (score > maxScore) {
            maxScore = score;
            bestDay = day;
            bestHour = hour;
          }
          return {
            hour,
            score: Math.round(score),
            audienceActivity: Math.round(Math.random() * 30 + 60),
            competitorActivity: Math.round(Math.random() * 40 + 30),
            reasoning: `${Math.round(score)}% of your audience is typically active at this time`,
          };
        });
      }

      recommendations.push({
        platform,
        dayOfWeek: 'all',
        times: Object.entries(platformTimes).flatMap(([day, hours]) =>
          hours.map(hour => ({
            hour,
            score: Math.round(Math.random() * 30 + 70),
            audienceActivity: Math.round(Math.random() * 30 + 60),
            competitorActivity: Math.round(Math.random() * 40 + 30),
            reasoning: `High engagement potential on ${day} at ${hour}:00`,
          }))
        ),
        overallBest: {
          day: bestDay,
          hour: bestHour,
          expectedEngagement: Math.floor(Math.random() * 2000) + 1000,
        },
      });
    }

    return recommendations;
  }

  async getGrowthPredictions(
    userId: string,
    platforms: string[] = ['instagram', 'twitter', 'tiktok']
  ): Promise<GrowthPrediction[]> {
    const predictions: GrowthPrediction[] = [];

    for (const platform of platforms) {
      const currentFollowers = Math.floor(Math.random() * 50000) + 5000;
      const monthlyGrowth = Math.random() * 0.15 + 0.02;

      const futurePredictions: GrowthPrediction['predictions'] = [];
      let followers = currentFollowers;

      for (let month = 1; month <= 12; month++) {
        const date = new Date();
        date.setMonth(date.getMonth() + month);
        followers = Math.floor(followers * (1 + monthlyGrowth));
        futurePredictions.push({
          date,
          followers,
          confidence: Math.max(0.5, 0.95 - month * 0.03),
        });
      }

      predictions.push({
        platform,
        currentFollowers,
        predictions: futurePredictions,
        growthDrivers: [
          'Consistent posting schedule',
          'High-quality video content',
          'Community engagement',
          'Trend participation',
        ],
        risks: [
          'Algorithm changes',
          'Content saturation',
          'Competitor activity',
        ],
        recommendations: [
          'Increase video content by 30%',
          'Post during optimal hours',
          'Engage with comments within 1 hour',
          'Collaborate with similar creators',
        ],
        scenarios: {
          conservative: Math.floor(currentFollowers * (1 + monthlyGrowth * 0.5) ** 12),
          moderate: Math.floor(currentFollowers * (1 + monthlyGrowth) ** 12),
          optimistic: Math.floor(currentFollowers * (1 + monthlyGrowth * 1.5) ** 12),
        },
      });
    }

    return predictions;
  }

  async getEngagementTips(
    userId: string,
    options: {
      category?: string;
      platforms?: string[];
      limit?: number;
    } = {}
  ): Promise<EngagementTip[]> {
    const { limit = 10 } = options;

    const allTips: EngagementTip[] = [
      {
        id: nanoid(),
        category: 'content',
        title: 'Use Vertical Video Format',
        description: 'Vertical videos (9:16) get 40% more engagement on mobile-first platforms.',
        impact: 'high',
        effort: 'low',
        platforms: ['instagram', 'tiktok', 'youtube'],
        actionItems: ['Convert horizontal content to vertical', 'Film in portrait mode', 'Optimize thumbnails'],
        expectedImprovement: 40,
      },
      {
        id: nanoid(),
        category: 'timing',
        title: 'Post During Peak Hours',
        description: 'Posting when your audience is most active increases visibility by up to 25%.',
        impact: 'high',
        effort: 'low',
        platforms: ['instagram', 'twitter', 'tiktok', 'facebook'],
        actionItems: ['Check your analytics for peak times', 'Schedule posts accordingly', 'Test different times'],
        expectedImprovement: 25,
      },
      {
        id: nanoid(),
        category: 'engagement',
        title: 'Reply Within the First Hour',
        description: 'Responding to comments quickly boosts algorithm visibility.',
        impact: 'high',
        effort: 'medium',
        platforms: ['instagram', 'twitter', 'youtube', 'tiktok'],
        actionItems: ['Set notification alerts', 'Prepare response templates', 'Block time for engagement'],
        expectedImprovement: 30,
      },
      {
        id: nanoid(),
        category: 'hashtags',
        title: 'Use a Mix of Hashtag Sizes',
        description: 'Combine high-reach and niche hashtags for optimal discovery.',
        impact: 'medium',
        effort: 'low',
        platforms: ['instagram', 'twitter', 'tiktok'],
        actionItems: ['Use 3-5 high-reach hashtags', 'Add 5-7 niche hashtags', 'Research trending tags'],
        expectedImprovement: 20,
      },
      {
        id: nanoid(),
        category: 'content',
        title: 'Hook Viewers in 3 Seconds',
        description: 'The first 3 seconds determine if viewers will keep watching.',
        impact: 'high',
        effort: 'medium',
        platforms: ['tiktok', 'instagram', 'youtube'],
        actionItems: ['Start with action', 'Use compelling text overlay', 'Create curiosity'],
        expectedImprovement: 50,
      },
      {
        id: nanoid(),
        category: 'growth',
        title: 'Cross-Promote Content',
        description: 'Share your content across platforms to maximize reach.',
        impact: 'medium',
        effort: 'low',
        platforms: ['instagram', 'twitter', 'tiktok', 'youtube', 'facebook'],
        actionItems: ['Adapt content for each platform', 'Tease content on other platforms', 'Link between profiles'],
        expectedImprovement: 35,
      },
      {
        id: nanoid(),
        category: 'analytics',
        title: 'Track Your Top Performing Content',
        description: 'Analyze what works and create more of it.',
        impact: 'high',
        effort: 'medium',
        platforms: ['instagram', 'twitter', 'tiktok', 'youtube'],
        actionItems: ['Review weekly analytics', 'Identify patterns', 'Double down on winners'],
        expectedImprovement: 25,
      },
    ];

    return allTips.slice(0, limit);
  }

  async generateContentPlan(
    userId: string,
    options: {
      startDate?: Date;
      endDate?: Date;
      platforms?: string[];
      postsPerWeek?: number;
    } = {}
  ): Promise<ContentPlan> {
    const {
      startDate = new Date(),
      endDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      platforms = ['instagram', 'twitter', 'tiktok'],
      postsPerWeek = 7,
    } = options;

    const posts: ContentPlan['posts'] = [];
    const pillars = ['Educational', 'Behind the Scenes', 'Promotional', 'Community', 'Entertainment'];
    const types: Record<string, string[]> = {
      instagram: ['reel', 'carousel', 'post', 'story'],
      twitter: ['tweet', 'thread', 'poll'],
      tiktok: ['video', 'duet', 'trend'],
    };

    const daysBetween = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000));
    const totalPosts = Math.ceil(daysBetween / 7 * postsPerWeek);

    for (let i = 0; i < totalPosts; i++) {
      const platform = platforms[i % platforms.length];
      const postDate = new Date(startDate);
      postDate.setDate(postDate.getDate() + Math.floor(i / platforms.length));
      const dayName = this.getDayName(postDate);
      const optimalHours = this.platformOptimalTimes[platform]?.[dayName] || [12];
      const hour = optimalHours[i % optimalHours.length] || 12;
      postDate.setHours(hour, 0, 0, 0);

      const pillar = pillars[i % pillars.length];
      const platformTypes = types[platform] || types.instagram;
      const type = platformTypes[i % platformTypes.length];

      posts.push({
        id: nanoid(),
        date: postDate,
        time: `${hour}:00`,
        platform,
        type,
        content: this.generateSuggestedContent(pillar, platform),
        hashtags: this.generateHashtags(pillar, platform),
        mediaDescription: type === 'reel' || type === 'video' ? 'Short-form video content' : undefined,
        status: 'draft',
        pillar,
      });
    }

    const byPlatform: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byPillar: Record<string, number> = {};

    posts.forEach(post => {
      byPlatform[post.platform] = (byPlatform[post.platform] || 0) + 1;
      byType[post.type] = (byType[post.type] || 0) + 1;
      byPillar[post.pillar] = (byPillar[post.pillar] || 0) + 1;
    });

    return {
      id: nanoid(),
      name: `Content Plan ${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`,
      period: { start: startDate, end: endDate },
      posts,
      stats: {
        totalPosts: posts.length,
        byPlatform,
        byType,
        byPillar,
      },
    };
  }

  async getAIInsights(userId: string): Promise<AIInsight[]> {
    return [
      {
        id: nanoid(),
        type: 'opportunity',
        title: 'Trending Sound Opportunity',
        description: 'A sound related to your genre is trending on TikTok. Creating content with this sound could boost visibility.',
        data: { sound: 'Trending Audio #12345', potentialReach: 500000 },
        actionRequired: true,
        priority: 'high',
        createdAt: new Date(),
      },
      {
        id: nanoid(),
        type: 'recommendation',
        title: 'Increase Video Content',
        description: 'Your video posts get 3x more engagement than images. Consider shifting your content mix.',
        data: { currentVideoPercentage: 25, recommendedPercentage: 50 },
        actionRequired: true,
        priority: 'high',
        createdAt: new Date(),
      },
      {
        id: nanoid(),
        type: 'warning',
        title: 'Engagement Rate Declining',
        description: 'Your engagement rate dropped 15% this week. Review recent content performance.',
        data: { previousRate: 4.5, currentRate: 3.8 },
        actionRequired: true,
        priority: 'high',
        createdAt: new Date(),
      },
      {
        id: nanoid(),
        type: 'trend',
        title: 'Behind-the-Scenes Content Rising',
        description: 'BTS content is performing 40% better in your niche this month.',
        data: { avgEngagementIncrease: 40 },
        actionRequired: false,
        priority: 'medium',
        createdAt: new Date(),
      },
    ];
  }
}

export const socialStrategyAIService = new SocialStrategyAIService();
