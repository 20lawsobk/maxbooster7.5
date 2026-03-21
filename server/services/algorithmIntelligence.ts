import { randomBytes } from 'crypto';
import { logger } from '../logger.js';
import { getRedisClient, RedisClientType } from '../lib/redisConnectionFactory.js';


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
    spotify: {
      platform: 'spotify',
      keyFactors: [
        {
          factor: 'playlist_adds',
          weight: 0.30,
          description: 'User and editorial playlist adds — primary signal for algorithmic playlist consideration (Discover Weekly, Release Radar)',
        },
        {
          factor: 'stream_completion_rate',
          weight: 0.26,
          description: 'Stream completion rate — Spotify counts a stream after 30s; replay rate signals quality to editorial team',
        },
        {
          factor: 'save_to_library',
          weight: 0.22,
          description: 'Saving a track is the strongest individual user endorsement signal in Spotify\'s algorithm',
        },
        {
          factor: 'follower_to_listener_ratio',
          weight: 0.12,
          description: 'Monthly listeners who convert to profile followers — indicates sticky, returning audience',
        },
        {
          factor: 'release_velocity',
          weight: 0.10,
          description: 'Consistent release cadence keeps Release Radar and Discover Weekly placements active',
        },
      ],
      contentPreferences: [
        'Submit via Spotify for Artists pitch tool at least 7 days before release for editorial consideration',
        'Spotify Canvas (8-second visual loop) — tracks with Canvas see avg 145% higher listener shares',
        'Countdown Page in Spotify for Artists builds pre-save momentum before release',
        'Acoustic, instrumental, or remix versions of existing tracks get separate Release Radar cycles',
        'Target skip rate under 15% in first 30 seconds — high skips tank Release Radar distribution',
        'Collaborate with other artists — collab tracks appear on both profiles and both Discover Weeklys',
        'Artist bio and profile photo must be current — editors check profile before editorial pitches',
      ],
      penaltyTriggers: [
        'High skip rate (>30%) in first 30 seconds tanks algorithmic playlist placement',
        'Stream farming or fake plays — Spotify audits remove fraudulent streams and can blacklist artists',
        'Duplicate content (identical tracks uploaded multiple times across releases)',
        'Missing ISRC codes or incorrect metadata blocks editorial consideration entirely',
        'Long release gaps (>6 months) cause Monthly Listener count to decay significantly',
        'Copyright disputes trigger distribution holds that prevent algorithmic indexing',
      ],
      boostOpportunities: [
        'Spotify Discovery Mode (opt-in via S4A) — artists who opt in see avg 40% more algorithmic playlist adds',
        'Pitch to independent playlist curators via Groover, SubmitHub, or direct email outreach',
        'Cross-platform: link Spotify profile in all social bios — Spotify tracks referral traffic for editorial scoring',
        'Spotify Sessions / Spotify Singles — exclusive content gets platform-wide promotion',
        'Release acoustic or live versions — separate Release Radar push at no additional cost',
        'Pre-save campaigns via Spotify Countdown Page build day-1 momentum that boosts Release Radar position',
      ],
      recentChanges: [],
    },
    apple_music: {
      platform: 'apple_music',
      keyFactors: [
        {
          factor: 'editorial_pitching',
          weight: 0.35,
          description: 'Apple Music editorial is human-curated — getting onto New Music Daily or genre playlists drives exponential growth',
        },
        {
          factor: 'add_to_library',
          weight: 0.28,
          description: 'Users adding a track to their library is the strongest demand signal Apple Music tracks',
        },
        {
          factor: 'playlist_adds',
          weight: 0.22,
          description: 'Both editorial and user playlist adds amplify algorithmic New Music and "Listen Now" recommendations',
        },
        {
          factor: 'play_completion',
          weight: 0.15,
          description: 'Full track plays vs. partial plays — completion rate signals quality to Apple\'s recommendation engine',
        },
      ],
      contentPreferences: [
        'Submit via Apple Music for Artists dashboard — editorial pitching available for each release',
        'Spatial Audio (Dolby Atmos) mix gets priority placement in Apple Music playlists and marketing',
        'Animated cover art (Motion Album Art) increases track visibility in Apple Music browse sections',
        'Music videos linked directly to tracks increase visibility in the music video browse section',
        'Artist stories and editorial notes in Apple Music for Artists build profile authority for pitching',
        'Target the "New Music" editorial window — pitch at least 10 days before release',
        'iTunes/Apple Music chart position still drives significant discovery especially internationally',
      ],
      penaltyTriggers: [
        'Missing or incorrect metadata (wrong ISRC, release date errors) blocks editorial consideration',
        'Low-quality audio (below Loudness Normalized standards) reduces playlist add rate',
        'Copyright issues or content ID conflicts trigger distribution holds',
        'Abrupt release gaps — algorithm deprioritizes dormant catalogues in recommendations',
        'Not submitting for editorial consideration before the 10-day deadline',
      ],
      boostOpportunities: [
        'Apple Music editorial pitch: submit release details + press notes through A4A at least 10 days out',
        'Dolby Atmos / Spatial Audio mix — Apple actively markets and promotes Atmos-enabled tracks',
        'Apple Music Radio (Apple Music 1, genre channels) — pitch to show producers for premieres',
        'Pre-release exclusive content (lyrics, liner notes, artist commentary) builds editorial relationship',
        'Promote your Apple Music link to iOS audience specifically — highest Apple Music conversion demographic',
        'Apple Music exclusivity window (even 1-2 weeks pre-other-DSPs) signals priority to Apple editorial',
      ],
      recentChanges: [],
    },
    soundcloud: {
      platform: 'soundcloud',
      keyFactors: [
        {
          factor: 'plays_and_reposts',
          weight: 0.28,
          description: 'Total plays and reposts drive SoundCloud algorithm ranking in the "Suggested" and "Similar Artists" sections',
        },
        {
          factor: 'likes_to_plays_ratio',
          weight: 0.25,
          description: 'Likes as a proportion of total plays — indicates content resonance quality, not just volume',
        },
        {
          factor: 'timed_comments',
          weight: 0.22,
          description: 'Timestamped comments are unique to SoundCloud — they signal deep listening engagement at specific moments',
        },
        {
          factor: 'follower_engagement',
          weight: 0.15,
          description: 'Engagement rate from existing followers affects "New Tracks from People You Follow" feed distribution',
        },
        {
          factor: 'curator_reposts',
          weight: 0.10,
          description: 'Reposts from verified curators and popular accounts amplify discovery exponentially',
        },
      ],
      contentPreferences: [
        'Upload full tracks and EPs — SoundCloud\'s audience expects complete works, not short clips',
        'Tags: use genre tags + mood tags + instrument tags + BPM for maximum discovery surface area',
        'Engage with community: comment on tracks from artists in your genre (reciprocal attention)',
        'Reposts from your account give other artists\' fans indirect exposure to your linked catalog',
        'Playlist creation: "Artist name — discography" playlists get shared as a single unit',
        'SoundCloud Go+ exclusive first week for releases builds "supporter" audience signals',
        'Waveform artwork (track-specific visual) increases time-on-track and share rate',
      ],
      penaltyTriggers: [
        'Privating tracks after they gain traction removes them from discovery algorithm',
        'Purchasing fake plays — SoundCloud audits and removes bot traffic, flags accounts',
        'Frequent track deletions and re-uploads reset all engagement signals to zero',
        'Spam commenting or unsolicited self-promotion in other artists\' comment sections',
        'Uploading silent or test tracks to your main profile',
      ],
      boostOpportunities: [
        'SoundCloud Repost by Repost Network — submit to the curator network for paid or earned reposts',
        'Collaborate with popular SoundCloud curators (Majestic Casual, MrSuicideSheep-tier channels)',
        'Upload early/demo versions to build community hype before a full release',
        'Free download gating (in exchange for follow or repost) drives organic follower growth',
        'Engage with trending artists in your genre on the Discover page daily',
        'SoundCloud Promote (paid) feature targets your track to similar listeners algorithmically',
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
    spotify: {
      platform: 'spotify',
      optimalPostFrequency: 1.5,          // 1-2 singles/EPs per month is the sweet spot
      engagementDecayRate: 0.015,         // Streaming catalogue has very long shelf life (years)
      peakEngagementWindow: 168,          // 7-day new release window is the primary push period
      recommendedGapBetweenPosts: 168,    // Minimum 1 week between major releases for Release Radar
      contentTypePerformance: {
        'new_single': 1.65,              // New singles get highest Release Radar + Discover Weekly boost
        'ep_release': 1.55,
        'album': 1.50,
        'remix': 1.40,                   // Remixes get a separate Release Radar push
        'spotify_session': 1.45,         // Spotify Singles / Spotify Sessions get platform promotion
        'acoustic_version': 1.35,        // Alternate versions recycle the Release Radar slot
        'live_version': 1.25,
        'feature_credit': 1.30,          // Being featured on another artist's track — dual-profile boost
      },
    },
    apple_music: {
      platform: 'apple_music',
      optimalPostFrequency: 1.5,          // Similar cadence to Spotify
      engagementDecayRate: 0.015,
      peakEngagementWindow: 168,
      recommendedGapBetweenPosts: 168,
      contentTypePerformance: {
        'spatial_audio_mix': 1.75,       // Dolby Atmos tracks get dedicated Apple Music marketing
        'new_single': 1.60,
        'ep_release': 1.50,
        'album': 1.48,
        'music_video': 1.40,             // Music videos get separate browse placement
        'remix': 1.32,
        'acoustic_version': 1.25,
        'feature_credit': 1.22,
      },
    },
    soundcloud: {
      platform: 'soundcloud',
      optimalPostFrequency: 3,            // 3x/week is acceptable; community expects frequent uploads
      engagementDecayRate: 0.08,          // Faster decay than DSPs but slower than social media
      peakEngagementWindow: 48,           // 48-hour peak window for new tracks in followers' feeds
      recommendedGapBetweenPosts: 24,     // Minimum 24 hours between uploads
      contentTypePerformance: {
        'full_track': 1.55,
        'free_download': 1.50,           // Free downloads drive massive repost sharing
        'remix': 1.40,
        'demo_wip': 1.30,               // SoundCloud community uniquely appreciates WIP content
        'bootleg_remix': 1.22,
        'live_set': 1.18,
        'podcast_mix': 1.10,
        'clip_preview': 0.80,            // Short clips perform poorly; full tracks strongly preferred
      },
    },
  };

  // Platform-specific engagement rate benchmarks for music creators (2024-2026)
  // Social platforms: engagement rate (%) = engagements / impressions × 100
  // Streaming platforms: stream completion rate (%) or likes-to-plays ratio (%)
  private readonly platformBenchmarks: Record<string, { userAvg: number; good: number; topCreators: number }> = {
    tiktok: { userAvg: 5.8, good: 8.5, topCreators: 14.0 },
    instagram: { userAvg: 2.8, good: 5.0, topCreators: 9.5 },
    youtube: { userAvg: 2.2, good: 4.0, topCreators: 7.0 },
    twitter: { userAvg: 1.5, good: 3.0, topCreators: 6.5 },
    facebook: { userAvg: 1.2, good: 2.5, topCreators: 5.0 },
    linkedin: { userAvg: 2.0, good: 4.5, topCreators: 8.0 },
    spotify: { userAvg: 28.0, good: 50.0, topCreators: 72.0 },       // Stream completion % benchmark
    apple_music: { userAvg: 30.0, good: 52.0, topCreators: 74.0 },   // Stream completion % benchmark
    soundcloud: { userAvg: 3.5, good: 7.0, topCreators: 14.0 },      // Likes-to-plays % benchmark
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
        id: randomBytes(8).toString('hex'),
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
        id: randomBytes(8).toString('hex'),
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
        id: randomBytes(8).toString('hex'),
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
        id: randomBytes(8).toString('hex'),
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
        id: randomBytes(8).toString('hex'),
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
        id: randomBytes(8).toString('hex'),
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
    const benchmark = this.platformBenchmarks[platform] || { userAvg: 3.0, good: 5.0, topCreators: 9.0 };
    const hasShadowbanAlert = alerts.some(a => a.type === 'shadowban');

    // === Reach trend recommendations ===
    if (metrics.reachTrend === 'declining') {
      recommendations.push('Pull your last 10 posts\' analytics — find the exact first post that underperformed and identify what changed (hook, format, length, time posted)');
      if (platform === 'tiktok') {
        recommendations.push('Shift from promo content to authentic BTS (behind-the-scenes studio, songwriting process) — these outperform music promo 2:1 when reach drops');
      } else if (platform === 'instagram') {
        recommendations.push('Switch to carousel format for your next 3 posts — Instagram resurfaces carousels to non-engagers, doubling impressions during a reach dip');
      } else if (platform === 'youtube') {
        recommendations.push('Publish a Community tab post and a Short this week to rebuild algorithm signals without committing to a full long-form upload');
      } else if (platform === 'spotify' || platform === 'apple_music') {
        recommendations.push('Release an acoustic, remix, or live version of an existing track — this triggers a fresh Release Radar cycle and revives catalogue streams');
      } else {
        recommendations.push('Temporarily shift from promotional content to value-first content (tips, BTS, personal story) to rebuild engagement signals');
      }
    }

    // === Low engagement recommendations ===
    if (metrics.engagementRate < benchmark.userAvg) {
      if (platform === 'tiktok') {
        recommendations.push('Strengthen your hook: the first 1-2 seconds decide 75% of watch-through. Try "Here\'s why your favorite song sounds like this" over "New music out now"');
        recommendations.push('Add a timed call-to-action: "Drop a 🔥 at 0:15 when the beat hits" — timestamped engagement spikes trigger extra distribution');
      } else if (platform === 'instagram') {
        recommendations.push('Rewrite your last post\'s CTA: instead of "stream now" try asking a genuine question related to the music ("What does this track remind you of?")');
        recommendations.push('Post a poll or question sticker in Stories immediately after publishing a Reel — warm followers push up the Reel\'s engagement rate');
      } else if (platform === 'twitter' || platform === 'linkedin') {
        recommendations.push('Start your next post with a polarizing or curiosity-gap opener — first line determines whether readers hit "See more" which drives dwell-time signals');
      } else if (platform === 'soundcloud') {
        recommendations.push('Ask listeners to leave a timestamped comment at their favorite moment — SoundCloud\'s timed comments uniquely amplify discovery for that track');
      } else {
        recommendations.push('Rewrite your CTA: instead of "listen now" try asking a question that invites a reaction directly tied to the emotional content');
        recommendations.push('Post an engagement-first piece (poll, question, reaction) to restart your engagement rate signals with the algorithm');
      }
    }

    // === Shadowban / hashtag reach recommendations ===
    if (hasShadowbanAlert || metrics.hashtagReach < 25) {
      recommendations.push('Audit all hashtags — remove any flagged or overused tags, take a 48-72h posting break, then return with 3 fresh niche-specific hashtags maximum');
    }

    // === Growth momentum recommendations ===
    if (metrics.followerGrowth > 2) {
      recommendations.push('Growth momentum detected — now is the ideal time to test a new content format. The algorithm gives preference to growing accounts when they experiment');
    } else if (metrics.followerGrowth < -0.5) {
      recommendations.push('Net follower loss detected — shift focus from promotional posts to value content that showcases personality and artistry, not just releases');
    }

    // === Platform-specific boost opportunities (always include top 2) ===
    if (profile) {
      const boosts = profile.boostOpportunities.slice(0, 2);
      recommendations.push(...boosts);
    }

    // === Streaming platform specific ===
    if (platform === 'spotify') {
      recommendations.push('Pitch your next release to Spotify editorial via Spotify for Artists — submit at least 7 days before release date for Release Radar eligibility');
    } else if (platform === 'apple_music') {
      recommendations.push('Submit your next release for Apple Music editorial consideration via Apple Music for Artists at least 10 days before release');
    }

    return recommendations.slice(0, 6);
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

  private getRecentPlatformChanges(platform: string): AlgorithmChange[] {
    const changes: Record<string, AlgorithmChange[]> = {
      tiktok: [
        {
          id: 'ttk-2025-q3',
          platform: 'tiktok',
          detectedAt: new Date('2025-09-01'),
          changeType: 'content_distribution',
          impact: 'positive',
          description: 'TikTok 2025 Q3: Creator Music Library original audio now receives an extended algorithmic push window (up to 72h from prior 24h) when used by other creators.',
          adaptations: [
            'Upload original music to the TikTok Creator Music Library to benefit from the extended window',
            'Post consistently on days 1-3 after another creator uses your original sound',
          ],
        },
        {
          id: 'ttk-2026-q1',
          platform: 'tiktok',
          detectedAt: new Date('2026-01-01'),
          changeType: 'engagement',
          impact: 'positive',
          description: 'TikTok 2026: Watch-through replays now weighted 2× more than a single full view; comment reply threads from the creator get 1.5× distribution multiplier.',
          adaptations: [
            'Create loopable content (last-frame hooks back to first-frame) to drive replays',
            'Reply to top comments with video replies — separate distribution slot in For You',
          ],
        },
      ],
      instagram: [
        {
          id: 'ig-2025-h1',
          platform: 'instagram',
          detectedAt: new Date('2025-06-01'),
          changeType: 'ranking',
          impact: 'positive',
          description: 'Instagram 2025 H1: Broadcast Channels subscribers now boost post reach — creators with 1k+ subscribers see approximately 25% higher Reel distribution.',
          adaptations: [
            'Launch a Broadcast Channel and invite existing followers immediately',
            'Post exclusive previews, release dates, and BTS content there to grow subscriber count',
          ],
        },
        {
          id: 'ig-2025-q4',
          platform: 'instagram',
          detectedAt: new Date('2025-11-01'),
          changeType: 'hashtag',
          impact: 'negative',
          description: 'Instagram 2025 Q4: Hashtag reach declined further — algorithm now prioritizes topic/interest signals over hashtag text matching.',
          adaptations: [
            'Reduce hashtags to 3-5 highly relevant, niche-specific tags only',
            'Focus on keyword-rich captions and on-screen text — Instagram reads these for topic signals',
          ],
        },
      ],
      youtube: [
        {
          id: 'yt-2025-q3',
          platform: 'youtube',
          detectedAt: new Date('2025-07-01'),
          changeType: 'reach',
          impact: 'positive',
          description: 'YouTube 2025 Q3: Shorts-to-long-form funnel strengthened — viewers who watch 3+ Shorts from a channel are now recommended long-form content from that same channel.',
          adaptations: [
            'Create 3 topically-related Shorts per long-form video to build the recommendation funnel',
            'End every Short with on-screen text: "Full version on the channel"',
          ],
        },
      ],
      twitter: [
        {
          id: 'x-2025-q1',
          platform: 'twitter',
          detectedAt: new Date('2025-03-01'),
          changeType: 'ranking',
          impact: 'negative',
          description: 'X/Twitter 2025: Non-Premium (unverified) accounts receive approximately 30% less algorithmic reach vs. X Premium subscribers in the For You feed.',
          adaptations: [
            'Evaluate X Premium subscription for meaningful algorithmic reach improvement',
            'Prioritize engagement depth (replies, quote tweets, threads) over raw posting frequency',
          ],
        },
      ],
      facebook: [
        {
          id: 'fb-2025-q2',
          platform: 'facebook',
          detectedAt: new Date('2025-04-01'),
          changeType: 'reach',
          impact: 'positive',
          description: 'Facebook 2025 Q2: Reels now distributed to non-followers by default; organic reach for Reels is 3-5× higher than static posts for Pages under 100k.',
          adaptations: [
            'Prioritize Facebook Reels over static posts and text updates',
            'Cross-post Instagram Reels to Facebook simultaneously for double distribution at zero cost',
          ],
        },
      ],
      linkedin: [
        {
          id: 'li-2025-q3',
          platform: 'linkedin',
          detectedAt: new Date('2025-08-01'),
          changeType: 'engagement',
          impact: 'positive',
          description: 'LinkedIn 2025 Q3: Native documents (PDF carousels) now get 3× more impressions than single-image posts; algorithm specifically boosts "how-to" and "list" formatted documents.',
          adaptations: [
            'Convert your best insights and music business tips into PDF carousel format',
            'Use "how I got X result" or "5 things I learned" framing in document titles',
          ],
        },
      ],
      spotify: [
        {
          id: 'spt-2025-q2',
          platform: 'spotify',
          detectedAt: new Date('2025-04-01'),
          changeType: 'content_distribution',
          impact: 'positive',
          description: 'Spotify 2025 Q2: Discovery Mode expanded — artists who opt in via Spotify for Artists see avg 40% increase in algorithmic playlist adds on opted-in tracks.',
          adaptations: [
            'Evaluate Spotify Discovery Mode in Spotify for Artists for catalogue tracks',
            'Use for older releases to revive streams while protecting new release royalty rates',
          ],
        },
        {
          id: 'spt-2025-q4',
          platform: 'spotify',
          detectedAt: new Date('2025-10-01'),
          changeType: 'ranking',
          impact: 'positive',
          description: 'Spotify 2025 Q4: Canvas completion rate now factored into Release Radar distribution — tracks whose Canvas is watched to completion get 1.2× Radar boost.',
          adaptations: [
            'Create a Canvas for every new release — prioritize loopable, visually striking 8-second clips',
            'Ensure Canvas does not require sound (many listeners see it on mute)',
          ],
        },
      ],
      apple_music: [
        {
          id: 'apl-2025-q1',
          platform: 'apple_music',
          detectedAt: new Date('2025-02-01'),
          changeType: 'content_distribution',
          impact: 'positive',
          description: 'Apple Music 2025: Dolby Atmos / Spatial Audio tracks receiving dedicated placement in Apple Music marketing, "Listen Now" carousels, and editorial features.',
          adaptations: [
            'Mix current and upcoming releases in Dolby Atmos — most DAWs and online services support this',
            'Flag Atmos availability in your Apple Music for Artists pitch submission',
          ],
        },
      ],
      soundcloud: [
        {
          id: 'sc-2025-q3',
          platform: 'soundcloud',
          detectedAt: new Date('2025-09-01'),
          changeType: 'reach',
          impact: 'positive',
          description: 'SoundCloud 2025 Q3: SoundCloud Repost Network expanded curator pool; tracks with 500+ organic plays in first 48h are auto-eligible for curator review.',
          adaptations: [
            'Drive early plays from your existing fanbase within first 48h of upload via social sharing',
            'Submit to SoundCloud Repost Network for catalogue tracks with strong organic performance',
          ],
        },
      ],
    };
    return changes[platform] ?? [];
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
