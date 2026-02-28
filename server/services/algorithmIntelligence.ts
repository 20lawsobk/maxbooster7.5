import { logger } from '../logger.js';
import { getRedisClient, RedisClientType } from '../lib/redisConnectionFactory.js';
import { nanoid } from 'nanoid';

export interface AlgorithmHealth {
  platform: string;
  overallScore: number;
  status: 'healthy' | 'warning' | 'critical' | 'shadowbanned';
  metrics: {
    reachTrend: 'increasing' | 'stable' | 'declining';
    engagementRate: number;
    impressionRatio: number;
    followerGrowth: number;
    hashtagReach: number;
  };
  alerts: AlgorithmAlert[];
  recommendations: string[];
  lastChecked: Date;
}

export interface AlgorithmAlert {
  id: string;
  type: 'shadowban' | 'reach_decline' | 'engagement_drop' | 'algorithm_change' | 'content_warning';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  detectedAt: Date;
  suggestedAction: string;
  resolved: boolean;
}

export interface EngagementPattern {
  platform: string;
  optimalPostFrequency: number;
  engagementDecayRate: number;
  peakEngagementWindow: number;
  recommendedGapBetweenPosts: number;
  contentTypePerformance: Record<string, number>;
}

export interface AlgorithmChange {
  id: string;
  platform: string;
  detectedAt: Date;
  changeType: 'ranking' | 'reach' | 'engagement' | 'hashtag' | 'content_distribution';
  impact: 'positive' | 'negative' | 'neutral';
  description: string;
  adaptations: string[];
}

export interface ShadowBanCheck {
  platform: string;
  isShadowbanned: boolean;
  confidence: number;
  indicators: {
    hashtagVisibility: number;
    explorePageReach: number;
    nonFollowerReach: number;
    engagementFromNew: number;
    searchVisibility: number;
  };
  possibleCauses: string[];
  remediation: string[];
}

export interface PlatformAlgorithmProfile {
  platform: string;
  keyFactors: Array<{ factor: string; weight: number; description: string }>;
  contentPreferences: string[];
  penaltyTriggers: string[];
  boostOpportunities: string[];
  recentChanges: AlgorithmChange[];
}

class AlgorithmIntelligenceService {
  private readonly REDIS_TTL = 1800;
  private readonly CACHE_PREFIX = 'algorithm:';

  // Fine-tuned platform algorithm profiles — updated for 2024-2026 era
  // Based on official platform documentation + creator community research
  private readonly platformAlgorithms: Record<string, PlatformAlgorithmProfile> = {
    tiktok: {
      platform: 'tiktok',
      keyFactors: [
        {
          factor: 'completion_rate',
          weight: 0.32,
          description: 'Watch-through rate — TikTok prioritizes videos people finish or replay',
        },
        {
          factor: 'engagement_velocity',
          weight: 0.24,
          description: 'Speed of likes, comments, and shares in the first 30-60 minutes after posting',
        },
        {
          factor: 'shares_and_reposts',
          weight: 0.18,
          description: 'Shares to DM and reposts — strongest signal of content resonance',
        },
        {
          factor: 'audio_usage',
          weight: 0.14,
          description: 'Using trending sounds boosts placement in the sound discovery graph',
        },
        {
          factor: 'profile_converts',
          weight: 0.08,
          description: 'Viewers who visit profile then follow — indicates strong brand pull',
        },
        {
          factor: 'comment_threads',
          weight: 0.04,
          description: 'Deep comment conversations signal highly engaging content',
        },
      ],
      contentPreferences: [
        'Vertical 9:16 format, filmed natively (not imported with watermarks)',
        'Original music or trending sounds — use sounds within 48 hours of trending',
        'Hook in first 1-2 seconds — TikTok data shows 75% of views are decided in frame 1',
        'Captions/subtitles — 70%+ of TikTok viewed without sound on autoplay',
        'Duets and stitches with trending creators for distribution boost',
        'Behind-the-scenes studio content outperforms polished music promo 2:1',
        'Consistent posting cadence (1-3x/day signals reliability to algorithm)',
      ],
      penaltyTriggers: [
        'Watermarks from Instagram, YouTube, or Snapchat',
        'Low video resolution (below 720p) or blurry footage',
        'Re-uploaded content (TikTok fingerprints previously posted videos)',
        'Banned hashtags (use Hashtag Insights to check)',
        'Excessive CTA links in bio changes (triggers spam classifier)',
        'Rapid follow/unfollow behavior via third-party apps',
        'Posting the exact same audio clip across multiple videos same day',
      ],
      boostOpportunities: [
        'Use a sound BEFORE it peaks — TikTok boosts early adopters of trending audio',
        'Duet with or stitch a video that already has strong early velocity',
        'Reply to comments with a video — replies go into separate For You distribution',
        'Post during platform event days (New Music Friday, Trending Challenges)',
        'Go Live after posting — simultaneous video + live boosts both pieces of content',
        'Use text-on-screen hooks — algorithm reads captions and boosts topic relevance',
        'Pin your best performing video to profile — drives profile CTR up for algorithm',
      ],
      recentChanges: [],
    },
    instagram: {
      platform: 'instagram',
      keyFactors: [
        {
          factor: 'saves',
          weight: 0.30,
          description: 'Saves are the highest-weight signal — content people want to return to',
        },
        {
          factor: 'shares_to_stories_dm',
          weight: 0.26,
          description: 'DM shares and "add to story" reshares — Instagram prioritizes these heavily',
        },
        {
          factor: 'comments_quality',
          weight: 0.18,
          description: 'Meaningful comments (multi-word) weighted over single-emoji responses',
        },
        {
          factor: 'reels_completion',
          weight: 0.14,
          description: 'Reels watch-through rate — Instagram Reels uses same model as TikTok',
        },
        {
          factor: 'profile_actions',
          weight: 0.08,
          description: 'Follows, story taps, link clicks — signals audience investment',
        },
        {
          factor: 'likes_velocity',
          weight: 0.04,
          description: 'Likes in first 30 minutes matter, but less than saves/shares',
        },
      ],
      contentPreferences: [
        'Carousels (2-10 slides) — algorithm shows to non-engagers on swipe, doubling impressions',
        'Reels with trending audio from the Instagram Music library (not third-party)',
        'Story polls, question stickers, and countdowns — drive direct engagement',
        'Aesthetic consistency across grid (matters for profile visit → follow conversion)',
        'Alt-text on images — Instagram uses this for SEO and accessibility scoring',
        'Collab posts (Invite Collaborator) — splits reach between both audiences',
        'Native posting via Instagram app — third-party scheduler posts get ~15% less reach',
      ],
      penaltyTriggers: [
        'Buying followers or engagement from bots — triggers shadow restriction',
        'Repetitive hashtag sets (using same 20-30 hashtags every post)',
        'Posting and deleting repeatedly in short windows',
        'Music copyright violations on Reels (muted audio = 0 distribution)',
        'External link overuse in captions (Instagram suppresses posts with links)',
        'Third-party automation that violates API limits',
        'Aggressive reciprocal follow/unfollow patterns',
      ],
      boostOpportunities: [
        'Collab with accounts in your music niche — reach both audiences simultaneously',
        'Go Live with another artist (up to 4 guests) for 4x distribution',
        'Use Broadcast Channels for superfan engagement — boosts post reach for subscribers',
        'Early adoption of new Instagram features (always get temporary boost from Meta)',
        'Respond to all comments within 60 minutes of posting — algorithm tracks creator responsiveness',
        'Cross-post Reels to Facebook simultaneously — doubles distribution at no cost',
        'Use Instagram Close Friends for exclusive content — high engagement signals premium reach',
      ],
      recentChanges: [],
    },
    youtube: {
      platform: 'youtube',
      keyFactors: [
        {
          factor: 'watch_time_and_session',
          weight: 0.35,
          description: 'Total watch time AND whether your video keeps viewers on YouTube overall',
        },
        {
          factor: 'click_through_rate',
          weight: 0.28,
          description: 'CTR from thumbnail + title — industry benchmark: 2-10%, top creators: 10%+',
        },
        {
          factor: 'engagement_signals',
          weight: 0.18,
          description: 'Likes, comments, shares — weighted by velocity and depth of comment discussion',
        },
        {
          factor: 'audience_retention_curve',
          weight: 0.12,
          description: 'Where viewers drop off — spikes in the graph (replays) strongly boost ranking',
        },
        {
          factor: 'post_frequency_consistency',
          weight: 0.07,
          description: 'Consistent upload schedule trains the algorithm to surface your content',
        },
      ],
      contentPreferences: [
        'Thumbnail + title combo must work together — test with VidIQ or TubeBuddy',
        'Optimal duration: 8-15 minutes for maximum ad revenue and algorithm favor',
        'Chapter markers (timestamps) — boosts search ranking and reduces drop-off perception',
        'End screens and cards in last 20 seconds — drives session time which YouTube rewards',
        'Keyword-rich descriptions (300+ words) with timestamps and relevant links',
        'YouTube Shorts cross-promoting long-form — Shorts algorithm feeds long-form channel',
        'Music-specific: Official Artist Channel verification boosts all music uploads',
      ],
      penaltyTriggers: [
        'Clickbait that causes early drop-off (CTR high but retention <40% tanks ranking)',
        'Copyright strikes and content ID claims (restrict monetization and reach)',
        'Community guideline strikes (progressive: warning → 1w → 2w → channel termination)',
        'Artificial traffic (bots, click farms) — YouTube detects and removes views',
        'Misleading metadata (tags unrelated to content = spam signal)',
        'Long gaps in upload schedule (algorithm deprioritizes inconsistent channels)',
        'Deleting videos hurts channel authority — set to unlisted instead',
      ],
      boostOpportunities: [
        'YouTube Premieres create a watch-party event that spikes initial engagement signals',
        'Community tab posts (available at 500 subs) — keep audience warm between uploads',
        'YouTube Live with Super Chat — live content gets separate algorithmic boost',
        'Respond to comments with pinned "director\'s commentary" comment — increases dwell time',
        'Collaborate with channels of similar size — cross-audience reach without dilution',
        'Create Playlists around your music catalogue — YouTube surfaces playlists in search',
        'Leverage YouTube Music tab if registered as an Official Artist Channel',
      ],
      recentChanges: [],
    },
    twitter: {
      platform: 'twitter',
      keyFactors: [
        {
          factor: 'replies_and_conversations',
          weight: 0.28,
          description: 'Replies and quote tweets — X algorithm prioritizes content that sparks discussion',
        },
        {
          factor: 'engagement_velocity',
          weight: 0.25,
          description: 'Engagement speed in first 15-30 minutes — X timeline has a short half-life',
        },
        {
          factor: 'reposts_quote_tweets',
          weight: 0.22,
          description: 'Reposts amplify reach; quote tweets spark further discussion (double boost)',
        },
        {
          factor: 'dwell_time',
          weight: 0.14,
          description: 'Time spent reading long tweets or watching embedded media',
        },
        {
          factor: 'link_clicks',
          weight: 0.06,
          description: 'External link clicks — X/Twitter has been deprioritizing external links',
        },
        {
          factor: 'follows_from_tweet',
          weight: 0.05,
          description: 'New followers gained from a single post — indicates discovery-driven growth',
        },
      ],
      contentPreferences: [
        'Thread format for in-depth takes — X algorithm boosts threads with 5+ tweets',
        'Embedded images or video — media posts get 3x more engagement than text-only',
        'Original opinion/hot take — X rewards polarizing but authentic content',
        'Reply to trending conversations within relevant music/industry hashtags',
        'Polls — generate high engagement with minimal effort, boosted by algorithm',
        'First tweet without external links — X suppresses tweets with links in main tweet',
        'Text-only tweets with emotional punch — these sometimes outperform media posts',
      ],
      penaltyTriggers: [
        'Posting the same link repeatedly in short timeframe (spam trigger)',
        'Excessive @mentions of non-followers (triggers spam classifier)',
        'External links in the main tweet body (reduces reach; put in reply instead)',
        'Automated posting that violates API rate limits',
        'Coordinated behavior (posting same content from multiple accounts)',
        'Using banned or shadowbanned hashtags',
        'Rapid follow/unfollow cycling',
      ],
      boostOpportunities: [
        'Post external links in the first REPLY to your tweet, not in the tweet itself',
        'Twitter Spaces: hosting audio rooms significantly boosts profile visibility',
        'Quote tweet viral content with a strong take — gets your content in front of that audience',
        'Engage with posts from large accounts in your niche — replies appear in their audience\'s feed',
        'Pin your best tweet — profile visitors who engage become algorithm signal',
        'Join trending conversations in music/entertainment within first hour of trend emerging',
        'X Blue (Premium) subscription — algorithm gives slight distribution boost to subscribers',
      ],
      recentChanges: [],
    },
    facebook: {
      platform: 'facebook',
      keyFactors: [
        {
          factor: 'meaningful_interactions',
          weight: 0.32,
          description: 'Comments, replies, and shares — Facebook prioritizes content people discuss',
        },
        {
          factor: 'video_watch_time',
          weight: 0.25,
          description: 'Native video completion rate — Facebook Reels uses watch-time model',
        },
        {
          factor: 'saves_and_shares',
          weight: 0.20,
          description: 'Saving a post or sharing to feed/story/DM — strong distribution signal',
        },
        {
          factor: 'reactions_diversity',
          weight: 0.12,
          description: 'Multiple reaction types (love, wow, haha) weighted higher than just "like"',
        },
        {
          factor: 'page_interactions',
          weight: 0.11,
          description: 'How often followers engage with the Page overall (loyalty signal)',
        },
      ],
      contentPreferences: [
        'Facebook Reels — Meta is actively promoting Reels to compete with TikTok',
        'Native video uploads (not YouTube links) — Facebook suppresses external video links',
        'Facebook Live — live video gets 6x more interactions than regular video',
        'Event creation for performances/listening parties — boosts organic reach',
        'Group content — Facebook Groups have higher organic reach than Pages',
        'Long-form text posts that tell a story (Facebook users read more than other platforms)',
        'Cross-post Instagram Reels to Facebook simultaneously for free dual distribution',
      ],
      penaltyTriggers: [
        'External links to YouTube, Spotify, or other platforms (suppressed reach)',
        'Clickbait headlines ("You won\'t believe what happened...")',
        'Engagement bait ("Like this if you...", "Tag a friend who...")',
        'Misinformation or health claim violations',
        'Boosting posts that have organic reach problems (wastes budget)',
        'Multiple link posts in same day (Facebook limits link distribution)',
      ],
      boostOpportunities: [
        'Star subscription for exclusive fan content — signals loyal audience to algorithm',
        'Fan Subscriptions — paid subscribers get higher priority notification delivery',
        'Facebook Shops — commerce integration boosts Page visibility in marketplace',
        'Collaborate with other Pages via Collaborative Articles feature',
        'Run Facebook contests/giveaways (strictly following terms) — massive reach spikes',
        'Use Facebook Insights to post during YOUR audience\'s specific peak hours',
      ],
      recentChanges: [],
    },
    linkedin: {
      platform: 'linkedin',
      keyFactors: [
        {
          factor: 'early_engagement',
          weight: 0.35,
          description: 'Comments and likes in first 1-2 hours — LinkedIn algorithm window is narrow',
        },
        {
          factor: 'comment_depth',
          weight: 0.28,
          description: 'Multi-word comments and reply conversations signal high-value content',
        },
        {
          factor: 'dwell_time_on_post',
          weight: 0.18,
          description: 'LinkedIn tracks how long users pause on a post — longer = more distribution',
        },
        {
          factor: 'shares_reposts',
          weight: 0.12,
          description: 'Reposts with commentary weight higher than silent shares',
        },
        {
          factor: 'profile_follows_from_post',
          weight: 0.07,
          description: 'New followers gained from a post — signals content-to-audience match',
        },
      ],
      contentPreferences: [
        'Text-first posts with a strong first line (LinkedIn shows ~3 lines before "See more")',
        'Personal story + professional insight format — highest engagement on platform',
        'Native documents (PDF carousels) — LinkedIn surfaces these heavily in feed',
        'Video content (natively uploaded) — growing priority for LinkedIn algorithm',
        'Posts about career lessons, industry shifts, and "what I learned" formats',
        'Music industry specific: music business, artist monetization, sync licensing topics',
        'Industry data and statistics with personal commentary perform extremely well',
      ],
      penaltyTriggers: [
        'External links in main post body (LinkedIn suppresses; put in first comment)',
        'Hashtag overuse (3-5 relevant hashtags max; more looks spammy)',
        'Promotional or sales-focused content without value (LinkedIn audience is B2B savvy)',
        'Reposting identical content across multiple accounts',
        'Auto-connecting at scale without personalized messages (spam risk)',
      ],
      boostOpportunities: [
        'Put external links in FIRST COMMENT, not in the post — announce it in post text',
        'Post personal career journey content — these outperform all other formats',
        'Engage with comments within first 2 hours of posting (every reply resets distribution window)',
        'LinkedIn Newsletter — subscribers get email notification on each edition',
        'LinkedIn Live — notify all followers + connections simultaneously',
        'Creator Mode: enables access to additional distribution features and analytics',
        'Tag collaborators (not companies) — tagged people\'s networks see the post',
      ],
      recentChanges: [],
    },
  };

  // Fine-tuned shadowban thresholds — calibrated to avoid false positives
  // Music artists normally have lower hashtag reach than lifestyle/fashion creators
  private readonly shadowbanIndicators = {
    hashtagVisibilityThreshold: 25,      // Below 25% = concern (music niche has lower baseline)
    exploreReachThreshold: 8,            // Below 8% non-follower explore = concern
    nonFollowerReachThreshold: 18,       // Below 18% non-follower total reach = concern
    newEngagementThreshold: 12,          // Below 12% engagement from new accounts = concern
    searchVisibilityThreshold: 40,       // Below 40% search visibility = concern
  };

  // Fine-tuned engagement patterns per platform — calibrated for music artists specifically
  private readonly engagementPatterns: Record<string, EngagementPattern> = {
    tiktok: {
      platform: 'tiktok',
      optimalPostFrequency: 2.5,          // 2-3x per day is optimal for growth phase
      engagementDecayRate: 0.12,          // TikTok keeps pushing good content for days
      peakEngagementWindow: 3,            // 3-hour peak window
      recommendedGapBetweenPosts: 5,      // 5 hours minimum between posts
      contentTypePerformance: {
        'music_preview': 1.45,           // New music snippets perform extremely well
        'trending_sound': 1.38,
        'original_sound': 1.15,          // Artists with original sounds get extra push
        'studio_bts': 1.30,              // Studio behind-the-scenes very popular
        'duet': 1.25,
        'stitch': 1.20,
        'tutorial': 1.18,
        'day_in_life': 1.12,
        'challenge': 1.22,
        'reaction': 1.08,
        'text_only': 0.75,
      },
    },
    instagram: {
      platform: 'instagram',
      optimalPostFrequency: 1.2,          // 1 Reel/day + Stories throughout
      engagementDecayRate: 0.22,
      peakEngagementWindow: 1.5,
      recommendedGapBetweenPosts: 12,
      contentTypePerformance: {
        'carousel': 1.45,                 // Highest save rate = highest reach
        'reel_original_audio': 1.40,      // Artist original audio — massive potential
        'reel_trending_audio': 1.32,
        'collab_post': 1.38,
        'studio_bts': 1.25,
        'single_image': 0.92,
        'story_interactive': 1.15,
        'broadcast_channel': 1.10,
        'live': 1.20,
      },
    },
    youtube: {
      platform: 'youtube',
      optimalPostFrequency: 0.5,          // 1 long-form per 2 weeks + Shorts daily
      engagementDecayRate: 0.04,          // YouTube content lives for months/years
      peakEngagementWindow: 72,           // 72-hour main engagement window
      recommendedGapBetweenPosts: 96,     // 4 days minimum between long-form
      contentTypePerformance: {
        'music_video_official': 1.50,
        'premiere': 1.35,
        'behind_the_scenes': 1.25,
        'long_form_vlog': 1.20,
        'tutorial_producer': 1.22,
        'live_performance': 1.18,
        'shorts_music': 1.28,            // Shorts for music previews cross-feed
        'lyric_video': 1.15,
        'reaction': 1.12,
        'community_post': 0.85,
      },
    },
    twitter: {
      platform: 'twitter',
      optimalPostFrequency: 4,            // 3-5 posts/day for music artist growth
      engagementDecayRate: 0.45,          // Twitter content decays fastest (30-min half-life)
      peakEngagementWindow: 0.5,          // 30-minute window
      recommendedGapBetweenPosts: 2,      // Minimum 2 hours between posts
      contentTypePerformance: {
        'thread': 1.45,
        'hot_take': 1.40,
        'behind_scenes_image': 1.30,
        'music_clip': 1.28,
        'quote_tweet': 1.25,
        'poll': 1.20,
        'text_opinion': 1.15,
        'pure_promo': 0.75,              // Pure promo without engagement hook tanks
        'external_link': 0.68,
      },
    },
    facebook: {
      platform: 'facebook',
      optimalPostFrequency: 0.75,         // 5x/week for music Pages
      engagementDecayRate: 0.18,
      peakEngagementWindow: 3,
      recommendedGapBetweenPosts: 20,
      contentTypePerformance: {
        'native_reel': 1.40,
        'live_video': 1.50,
        'native_video': 1.30,
        'event': 1.25,
        'story': 1.15,
        'photo_album': 1.10,
        'long_text': 1.05,
        'external_link': 0.55,          // Facebook aggressively suppresses external links
      },
    },
    linkedin: {
      platform: 'linkedin',
      optimalPostFrequency: 0.75,         // 3-5x/week
      engagementDecayRate: 0.15,          // LinkedIn content has longer half-life than Twitter
      peakEngagementWindow: 2,
      recommendedGapBetweenPosts: 24,
      contentTypePerformance: {
        'personal_story': 1.50,
        'industry_insight': 1.40,
        'document_carousel': 1.38,
        'native_video': 1.25,
        'text_post': 1.20,
        'poll': 1.15,
        'article': 1.10,
        'pure_promotion': 0.65,
      },
    },
  };

  // Platform-specific engagement rate benchmarks for music creators (2024-2026)
  private readonly platformBenchmarks: Record<string, { userAvg: number; good: number; topCreators: number }> = {
    tiktok: { userAvg: 5.8, good: 8.5, topCreators: 14.0 },
    instagram: { userAvg: 2.8, good: 5.0, topCreators: 9.5 },
    youtube: { userAvg: 2.2, good: 4.0, topCreators: 7.0 },
    twitter: { userAvg: 1.5, good: 3.0, topCreators: 6.5 },
    facebook: { userAvg: 1.2, good: 2.5, topCreators: 5.0 },
    linkedin: { userAvg: 2.0, good: 4.5, topCreators: 8.0 },
  };

  constructor() {
    logger.info('✅ Algorithm Intelligence service initialized');
  }

  private async getRedis(): Promise<RedisClientType | null> {
    return await getRedisClient();
  }

  async checkAlgorithmHealth(
    platform: string,
    userId: string,
    recentMetrics?: {
      impressions: number[];
      engagement: number[];
      followers: number[];
      hashtagReach: number[];
    }
  ): Promise<AlgorithmHealth> {
    const cacheKey = `${this.CACHE_PREFIX}health:${platform}:${userId}`;

    const redis = await this.getRedis();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) return JSON.parse(cached);
      } catch {}
    }

    const metrics = this.analyzeMetrics(platform, recentMetrics);
    const alerts = await this.detectAlerts(platform, metrics, userId);
    const status = this.determineStatus(metrics, alerts);
    const recommendations = this.generateRecommendations(platform, metrics, alerts);
    const overallScore = this.calculateHealthScore(metrics, alerts, platform);

    const result: AlgorithmHealth = {
      platform,
      overallScore,
      status,
      metrics: {
        reachTrend: metrics.reachTrend,
        engagementRate: metrics.engagementRate,
        impressionRatio: metrics.impressionRatio,
        followerGrowth: metrics.followerGrowth,
        hashtagReach: metrics.hashtagReach,
      },
      alerts,
      recommendations,
      lastChecked: new Date(),
    };

    if (redis) {
      try {
        await redis.setEx(cacheKey, this.REDIS_TTL, JSON.stringify(result));
      } catch {}
    }

    logger.info(`🔍 Algorithm health check: ${platform} — Score: ${overallScore}/100 — Status: ${status}`);
    return result;
  }

  async checkShadowBan(
    platform: string,
    userId: string,
    recentMetrics?: {
      hashtagReach: number;
      exploreReach: number;
      nonFollowerReach: number;
      newEngagement: number;
      searchVisibility: number;
    }
  ): Promise<ShadowBanCheck> {
    const metrics = recentMetrics || {
      hashtagReach: 58,
      exploreReach: 38,
      nonFollowerReach: 48,
      newEngagement: 32,
      searchVisibility: 65,
    };

    const indicators = {
      hashtagVisibility: metrics.hashtagReach,
      explorePageReach: metrics.exploreReach,
      nonFollowerReach: metrics.nonFollowerReach,
      engagementFromNew: metrics.newEngagement,
      searchVisibility: metrics.searchVisibility,
    };

    const { shadowbanIndicators } = this;
    const lowFlags = [
      indicators.hashtagVisibility < shadowbanIndicators.hashtagVisibilityThreshold,
      indicators.explorePageReach < shadowbanIndicators.exploreReachThreshold,
      indicators.nonFollowerReach < shadowbanIndicators.nonFollowerReachThreshold,
      indicators.engagementFromNew < shadowbanIndicators.newEngagementThreshold,
      indicators.searchVisibility < shadowbanIndicators.searchVisibilityThreshold,
    ];

    const lowCount = lowFlags.filter(Boolean).length;

    // Require 3+ low flags for shadowban diagnosis (reduces false positives for niche artists)
    const isShadowbanned = lowCount >= 3;

    // Confidence scales with number of low indicators (calibrated: 3 flags = 65%, 5 flags = 95%)
    const confidence = lowCount === 0 ? 5 :
                       lowCount === 1 ? 20 :
                       lowCount === 2 ? 40 :
                       lowCount === 3 ? 65 :
                       lowCount === 4 ? 82 : 95;

    const possibleCauses: string[] = [];
    const remediation: string[] = [];

    if (indicators.hashtagVisibility < shadowbanIndicators.hashtagVisibilityThreshold) {
      possibleCauses.push('Banned, flagged, or overused hashtags limiting discovery reach');
      remediation.push('Audit your hashtags — remove any banned tags and rotate to fresh niche hashtags');
    }
    if (indicators.explorePageReach < shadowbanIndicators.exploreReachThreshold) {
      possibleCauses.push('Content not meeting platform discovery quality threshold');
      remediation.push('Increase save-worthy value: tutorials, how-tos, music tips outperform pure promos');
    }
    if (indicators.nonFollowerReach < shadowbanIndicators.nonFollowerReachThreshold) {
      possibleCauses.push('Algorithm has limited distribution — likely from recent content policy signal');
      remediation.push('Increase authentic engagement quality (reply to comments, start genuine conversations)');
    }
    if (indicators.engagementFromNew < shadowbanIndicators.newEngagementThreshold) {
      possibleCauses.push('Content not resonating with discovery audiences — hook may need strengthening');
      remediation.push('A/B test 3 different hook styles — POV, curiosity gap, and question format');
    }
    if (indicators.searchVisibility < shadowbanIndicators.searchVisibilityThreshold) {
      possibleCauses.push('Account or content metadata flagged in search index');
      remediation.push('Update bio, ensure no banned terms in profile, and submit account review if available');
    }

    if (isShadowbanned) {
      remediation.push('Take a 48-72 hour posting break — activity pause often resets distribution limits');
      remediation.push('Remove and disconnect any suspicious third-party apps from account settings');
      remediation.push('Avoid all engagement pods, mass DM campaigns, or automation tools for 2 weeks');
      remediation.push('Post 3-5 pieces of high-quality, policy-compliant content after the break');
    }

    return { platform, isShadowbanned, confidence, indicators, possibleCauses, remediation };
  }

  async getEngagementPatterns(platform: string, _userId: string): Promise<EngagementPattern> {
    return this.engagementPatterns[platform] || this.engagementPatterns.instagram;
  }

  async detectAlgorithmChanges(
    platform: string,
    historicalData?: Array<{ date: Date; reach: number; engagement: number }>
  ): Promise<AlgorithmChange[]> {
    const changes: AlgorithmChange[] = [];

    if (!historicalData || historicalData.length < 7) {
      return this.getRecentPlatformChanges(platform);
    }

    const recentReach = this.calculateAverage(historicalData.slice(-7).map(d => d.reach));
    const previousReach = this.calculateAverage(historicalData.slice(-14, -7).map(d => d.reach));
    const recentEngagement = this.calculateAverage(historicalData.slice(-7).map(d => d.engagement));
    const previousEngagement = this.calculateAverage(historicalData.slice(-14, -7).map(d => d.engagement));

    const reachChangePercent = previousReach > 0 ? ((recentReach - previousReach) / previousReach) * 100 : 0;
    const engagementChangePercent = previousEngagement > 0 ? ((recentEngagement - previousEngagement) / previousEngagement) * 100 : 0;

    // Significant reach change detection (threshold: 15% — meaningful but not noise)
    if (Math.abs(reachChangePercent) > 15) {
      changes.push({
        id: nanoid(),
        platform,
        detectedAt: new Date(),
        changeType: 'reach',
        impact: reachChangePercent > 0 ? 'positive' : 'negative',
        description: `Reach ${reachChangePercent > 0 ? 'increased' : 'decreased'} ${Math.abs(reachChangePercent).toFixed(1)}% over the last 7 days vs prior week`,
        adaptations: reachChangePercent < 0
          ? [
              'Audit recent content quality — drop in reach often correlates with hook weakening',
              'Check for banned hashtags or metadata issues',
              'Increase posting frequency temporarily to rebuild algorithm signals',
              'Engage more deeply with existing followers (replies, polls) to re-establish engagement rate',
            ]
          : [
              'Double down on current content format — algorithm is rewarding it',
              'Increase posting frequency by 20-30% while momentum is high',
              'Test variations of your best-performing content style',
              'Analyze what changed in the last 7 days and replicate it',
            ],
      });
    }

    // Significant engagement change detection
    if (Math.abs(engagementChangePercent) > 20) {
      changes.push({
        id: nanoid(),
        platform,
        detectedAt: new Date(),
        changeType: 'engagement',
        impact: engagementChangePercent > 0 ? 'positive' : 'negative',
        description: `Engagement ${engagementChangePercent > 0 ? 'up' : 'down'} ${Math.abs(engagementChangePercent).toFixed(1)}% vs prior week`,
        adaptations: engagementChangePercent < 0
          ? [
              'Review comment strategy — are you responding to every comment within the first hour?',
              'Add stronger calls to action: "Drop a 🔥 if you want the full track"',
              'Test more interactive content: polls, question stickers, "this or that" formats',
            ]
          : [
              'This content style is resonating — create a content series in the same format',
              'Capture the audience: ask them to follow for Part 2',
            ],
      });
    }

    return changes;
  }

  async getPlatformProfile(platform: string): Promise<PlatformAlgorithmProfile> {
    return this.platformAlgorithms[platform] || this.platformAlgorithms.instagram;
  }

  async adaptToAlgorithmChange(
    platform: string,
    change: AlgorithmChange
  ): Promise<{ strategy: string[]; priority: 'immediate' | 'short_term' | 'long_term' }> {
    const strategies: string[] = [];
    let priority: 'immediate' | 'short_term' | 'long_term' = 'short_term';

    if (change.impact === 'negative') {
      priority = 'immediate';
      strategies.push('Pause scheduled content for 24 hours to analyze the shift');
      strategies.push('Pull your last 7 days of analytics — identify the first post that underperformed');
      strategies.push('Review hashtag health via platform insights');
      strategies.push('Increase direct audience engagement: reply to every comment and DM today');
      strategies.push('Create a high-quality "reset" piece of content to re-establish algorithm trust');
    } else {
      priority = 'short_term';
      strategies.push('Increase posting frequency 20-25% for the next 2 weeks while algorithm favor is high');
      strategies.push('Repurpose top-performing content across formats (video → carousel → thread)');
      strategies.push('Launch a series based on what\'s working — algorithm rewards consistent formats');
      strategies.push('Test a slightly higher production quality version of your best content type');
    }

    return { strategy: strategies, priority };
  }

  async getAlgorithmInsights(
    platform: string,
    userId: string
  ): Promise<{
    currentState: AlgorithmHealth;
    optimizationScore: number;
    topActions: Array<{ action: string; expectedImpact: number; effort: 'low' | 'medium' | 'high' }>;
    benchmarks: { userAvg: number; platformAvg: number; topCreators: number };
  }> {
    const health = await this.checkAlgorithmHealth(platform, userId);
    const benchmarks = this.platformBenchmarks[platform] || { userAvg: 2.5, good: 5.0, topCreators: 9.0 };

    const topActions: Array<{ action: string; expectedImpact: number; effort: 'low' | 'medium' | 'high' }> = [
      {
        action: 'Reply to every comment within 60 minutes of posting',
        expectedImpact: 18,
        effort: 'low',
      },
      {
        action: 'Use platform-specific engagement features (Collab, Duet, Stitch, etc)',
        expectedImpact: 22,
        effort: 'medium',
      },
      {
        action: 'Post during your top 3 optimal timing windows consistently for 30 days',
        expectedImpact: 14,
        effort: 'low',
      },
      {
        action: 'A/B test hook styles: curiosity gap vs POV vs "mistake" format',
        expectedImpact: 20,
        effort: 'medium',
      },
      {
        action: 'Create 1 highly save-worthy piece (value list, tips, resource) per week',
        expectedImpact: 28,
        effort: 'high',
      },
      {
        action: 'Cross-post native content to secondary platform for free reach multiplication',
        expectedImpact: 15,
        effort: 'low',
      },
    ];

    // Sort by impact-to-effort ratio (ROI sort)
    const effortScore = { low: 1, medium: 2, high: 3 };
    topActions.sort((a, b) =>
      (b.expectedImpact / effortScore[b.effort]) - (a.expectedImpact / effortScore[a.effort])
    );

    return {
      currentState: health,
      optimizationScore: health.overallScore,
      topActions,
      benchmarks: {
        userAvg: health.metrics.engagementRate,
        platformAvg: benchmarks.userAvg,
        topCreators: benchmarks.topCreators,
      },
    };
  }

  private analyzeMetrics(platform: string, recentMetrics?: {
    impressions: number[];
    engagement: number[];
    followers: number[];
    hashtagReach: number[];
  }): {
    reachTrend: 'increasing' | 'stable' | 'declining';
    engagementRate: number;
    impressionRatio: number;
    followerGrowth: number;
    hashtagReach: number;
  } {
    const benchmark = this.platformBenchmarks[platform] || { userAvg: 3.0, good: 5.0, topCreators: 9.0 };

    if (!recentMetrics) {
      return {
        reachTrend: 'stable',
        engagementRate: benchmark.userAvg,
        impressionRatio: 62,
        followerGrowth: 0.6,
        hashtagReach: 48,
      };
    }

    const { impressions, engagement, followers, hashtagReach } = recentMetrics;

    // Compare recent half vs earlier half for trend
    const mid = Math.floor(impressions.length / 2);
    const recentImp = this.calculateAverage(impressions.slice(mid));
    const previousImp = this.calculateAverage(impressions.slice(0, mid));
    const impChange = previousImp > 0 ? ((recentImp - previousImp) / previousImp) * 100 : 0;

    let reachTrend: 'increasing' | 'stable' | 'declining' = 'stable';
    if (impChange > 8) reachTrend = 'increasing';
    else if (impChange < -8) reachTrend = 'declining';

    const totalImp = this.calculateSum(impressions);
    const totalEng = this.calculateSum(engagement);
    const engagementRate = totalImp > 0 ? Math.round((totalEng / totalImp) * 1000) / 10 : 0;

    const followerGrowth = followers.length >= 2
      ? Math.round(((followers[followers.length - 1] - followers[0]) / Math.max(1, followers[0])) * 1000) / 10
      : 0;

    return {
      reachTrend,
      engagementRate,
      impressionRatio: Math.min(95, Math.round(55 + (recentImp / Math.max(1, totalImp / impressions.length)) * 20)),
      followerGrowth,
      hashtagReach: this.calculateAverage(hashtagReach),
    };
  }

  private async detectAlerts(
    platform: string,
    metrics: ReturnType<typeof this.analyzeMetrics>,
    _userId: string
  ): Promise<AlgorithmAlert[]> {
    const alerts: AlgorithmAlert[] = [];
    const benchmark = this.platformBenchmarks[platform] || { userAvg: 3.0, good: 5.0, topCreators: 9.0 };

    if (metrics.reachTrend === 'declining') {
      alerts.push({
        id: nanoid(),
        type: 'reach_decline',
        severity: 'medium',
        message: `Reach declining on ${platform} — engagement signals may have weakened`,
        detectedAt: new Date(),
        suggestedAction: 'Run Algorithm Insights to identify the drop trigger and adapt content strategy',
        resolved: false,
      });
    }

    // Platform-specific engagement thresholds — music artists have lower baseline on some platforms
    const lowEngagementThreshold = platform === 'facebook' ? 1.0 :
                                   platform === 'twitter' ? 1.2 :
                                   platform === 'linkedin' ? 1.5 :
                                   platform === 'youtube' ? 1.8 : 2.0;

    if (metrics.engagementRate < lowEngagementThreshold) {
      alerts.push({
        id: nanoid(),
        type: 'engagement_drop',
        severity: metrics.engagementRate < lowEngagementThreshold * 0.5 ? 'critical' : 'high',
        message: `Engagement rate ${metrics.engagementRate}% is below platform baseline of ${benchmark.userAvg}%`,
        detectedAt: new Date(),
        suggestedAction: 'Create more interactive content — ask direct questions, use polls, and strengthen your CTA',
        resolved: false,
      });
    }

    if (metrics.hashtagReach < this.shadowbanIndicators.hashtagVisibilityThreshold) {
      alerts.push({
        id: nanoid(),
        type: 'shadowban',
        severity: metrics.hashtagReach < 15 ? 'critical' : 'high',
        message: `Hashtag visibility at ${Math.round(metrics.hashtagReach)}% — possible reach restriction active`,
        detectedAt: new Date(),
        suggestedAction: 'Run full shadowban check and audit hashtag strategy immediately',
        resolved: false,
      });
    }

    if (metrics.followerGrowth < -0.5) {
      alerts.push({
        id: nanoid(),
        type: 'reach_decline',
        severity: 'medium',
        message: `Net follower loss detected (${metrics.followerGrowth}%) — check for bot purges or content misalignment`,
        detectedAt: new Date(),
        suggestedAction: 'Review recent content relevance and audience targeting — focus on value-driven posts',
        resolved: false,
      });
    }

    return alerts;
  }

  private determineStatus(
    metrics: ReturnType<typeof this.analyzeMetrics>,
    alerts: AlgorithmAlert[]
  ): AlgorithmHealth['status'] {
    const criticalAlerts = alerts.filter(a => a.severity === 'critical').length;
    const highAlerts = alerts.filter(a => a.severity === 'high').length;
    const shadowbanAlert = alerts.find(a => a.type === 'shadowban');

    if (shadowbanAlert && (shadowbanAlert.severity === 'critical' || shadowbanAlert.severity === 'high')) {
      if (metrics.hashtagReach < 15) return 'shadowbanned';
    }
    if (criticalAlerts > 0 || highAlerts >= 2) return 'critical';
    if (highAlerts > 0 || metrics.reachTrend === 'declining') return 'warning';
    return 'healthy';
  }

  private generateRecommendations(
    platform: string,
    metrics: ReturnType<typeof this.analyzeMetrics>,
    alerts: AlgorithmAlert[]
  ): string[] {
    const recommendations: string[] = [];
    const profile = this.platformAlgorithms[platform];

    if (metrics.reachTrend === 'declining') {
      recommendations.push('Analyze your last 10 posts — identify the first underperformer and find what changed');
      recommendations.push('Temporarily shift from promo content to value content (tips, BTS, tutorials)');
    }

    if (metrics.engagementRate < 3) {
      recommendations.push('Rewrite your CTA: instead of "listen now" try "drop a 🔥 if this hits"');
      recommendations.push('Post a question-first piece of content to restart engagement signals with the algorithm');
    }

    if (profile) {
      // Add 2 platform-specific boost opportunities
      recommendations.push(...profile.boostOpportunities.slice(0, 2));
    }

    if (metrics.followerGrowth > 2) {
      recommendations.push('Growth momentum detected — this is the best time to test new content formats');
    }

    return recommendations.slice(0, 5);
  }

  private calculateHealthScore(
    metrics: ReturnType<typeof this.analyzeMetrics>,
    alerts: AlgorithmAlert[],
    platform: string
  ): number {
    let score = 65; // Start at 65 (above baseline, room to go both ways)
    const benchmark = this.platformBenchmarks[platform] || { userAvg: 3.0, good: 5.0, topCreators: 9.0 };

    // Reach trend impact
    if (metrics.reachTrend === 'increasing') score += 12;
    else if (metrics.reachTrend === 'declining') score -= 18;

    // Engagement rate scoring (relative to platform benchmark)
    if (metrics.engagementRate >= benchmark.topCreators) score += 20;
    else if (metrics.engagementRate >= benchmark.good) score += 12;
    else if (metrics.engagementRate >= benchmark.userAvg) score += 5;
    else if (metrics.engagementRate >= benchmark.userAvg * 0.5) score -= 8;
    else score -= 15;

    // Follower growth impact
    if (metrics.followerGrowth > 3) score += 10;
    else if (metrics.followerGrowth > 1) score += 6;
    else if (metrics.followerGrowth > 0) score += 2;
    else if (metrics.followerGrowth < -1) score -= 8;

    // Hashtag reach
    if (metrics.hashtagReach > 60) score += 6;
    else if (metrics.hashtagReach < this.shadowbanIndicators.hashtagVisibilityThreshold) score -= 12;

    // Alert penalties (calibrated)
    for (const alert of alerts) {
      if (alert.severity === 'critical') score -= 28;
      else if (alert.severity === 'high') score -= 16;
      else if (alert.severity === 'medium') score -= 8;
      else score -= 3;
    }

    return Math.max(0, Math.min(100, Math.round(score)));
  }

  private getRecentPlatformChanges(_platform: string): AlgorithmChange[] {
    return [];
  }

  private calculateAverage(arr: number[]): number {
    if (arr.length === 0) return 0;
    return Math.round((arr.reduce((a, b) => a + b, 0) / arr.length) * 10) / 10;
  }

  private calculateSum(arr: number[]): number {
    return arr.reduce((a, b) => a + b, 0);
  }
}

export const algorithmIntelligenceService = new AlgorithmIntelligenceService();
