import { db } from "../db";
import { eq, and, desc, isNull, sql, gte } from "drizzle-orm";
import { careerCoachRecommendations, careerGoals, analytics, releases, socialAccounts, dspAnalytics, InsertCareerCoachRecommendation, InsertCareerGoal, CareerCoachRecommendation, CareerGoal } from "../../shared/schema";
import { logger } from "../logger";
import { MaxCoreAIClient } from "./maxcoreClient.js";
import { requireMaxCore, AIUnavailableError } from "../lib/aiSource.js";

interface CareerGap {
  area: string;
  severity: "high" | "medium" | "low";
  description: string;
  recommendation: string;
  actionUrl: string;
  steps?: string[];
  expectedImpact?: string;
  timeframe?: string;
}

interface SmartGoalSuggestion {
  goalType: string;
  title: string;
  description: string;
  targetValue: number;
  unit: string;
  deadlineDays: number;
  reasoning: string;
}

interface UserAnalyticsSnapshot {
  totalStreams: number;
  totalFollowers: number;
  totalRevenue: number;
  releaseCount: number;
  lastReleaseDate: Date | null;
  socialAccounts: string[];
  topPlatform: string | null;
  topCity: string | null;
  avgEngagementRate: number;
  daysSinceRelease: number;
  platformEngagement: Record<string, number>;
  platformStreams: Record<string, number>;
}

interface CoachPattern {
  id: string;
  type: string;
  area: string;
  priority: 1 | 2 | 3;
  trigger: (snapshot: UserAnalyticsSnapshot) => boolean;
  severity: (snapshot: UserAnalyticsSnapshot) => "high" | "medium" | "low";
  title: (snapshot: UserAnalyticsSnapshot) => string;
  description: (snapshot: UserAnalyticsSnapshot) => string;
  actionUrl: string;
  steps: string[];
  expectedImpact: string;
  timeframe: string;
}

const CAREER_COACH_PATTERNS: CoachPattern[] = [
  // ─── Release Strategy ────────────────────────────────────────────────────────
  {
    id: "release_cadence_critical",
    type: "release_consistency",
    area: "release_frequency",
    priority: 1,
    trigger: (s) => s?.daysSinceRelease > 60,
    severity: (s) => (s?.daysSinceRelease > 90 ? "high" : "medium"),
    title: (s) =>
      `Re-engage your audience — ${s?.daysSinceRelease} days without a release`,
    description: (s) =>
      `Streaming algorithms deprioritize artists who go silent for extended periods. After ${s?.daysSinceRelease} days, your playlist placements and algorithmic reach have likely dropped. A new release — even a single — resets the algorithm clock.`,
    actionUrl: "/distribution",
    steps: [
      "Release a single within the next 7 days — even an acoustic or remix version of an existing track counts",
      "Submit for Spotify editorial review via Spotify for Artists at least 7 days before release",
      "Announce the release on all your connected social platforms 3 days before drop",
      "Set up a pre-save campaign using Max Booster Distribution",
    ],
    expectedImpact:
      "20–40% increase in algorithmic playlist adds within 14 days of release",
    timeframe: "7–14 days",
  },
  {
    id: "release_cadence_moderate",
    type: "release_consistency",
    area: "release_frequency",
    priority: 2,
    trigger: (s) => s?.daysSinceRelease > 30 && s?.daysSinceRelease <= 60,
    severity: () => "medium",
    title: () => "Maintain release momentum with a new drop soon",
    description: () =>
      "The sweet spot for independent artists is releasing every 3–4 weeks. DSP algorithms reward consistency. You're approaching the window where your algorithmic reach starts to decline.",
    actionUrl: "/distribution",
    steps: [
      "Plan your next release — a B-side, remix, or collaboration works well as an interlude release",
      "Use Max Booster Studio to finish a track you've been working on",
      "Schedule your release 2 weeks out to allow editorial submission time",
      "Tease the track on social media with a 15-second clip",
    ],
    expectedImpact:
      "Sustains your current algorithmic momentum and listener retention",
    timeframe: "14–21 days",
  },
  {
    id: "release_volume_low",
    type: "benchmark",
    area: "release_volume",
    priority: 2,
    trigger: (s) => s?.releaseCount < 3 && s?.releaseCount >= 1,
    severity: () => "medium",
    title: () =>
      "Build your catalog — artists with 5+ releases get 3× more playlist placements",
    description: () =>
      "Industry data shows that Spotify, Apple Music, and Amazon Music's recommendation engines heavily favor artists with deep catalogs. With fewer than 3 releases, you're limiting your discoverability surface area.",
    actionUrl: "/studio",
    steps: [
      "Aim for at least 5 distinct tracks or 1 EP in your catalog this quarter",
      "Use Max Booster Studio's AI mastering tools to finish production efficiently",
      'Consider a "vault release" — tracks you\'ve finished but not yet released',
      "Distribute each release at least 2 weeks apart for maximum algorithm impact",
    ],
    expectedImpact:
      "3× increase in algorithmic discovery once catalog reaches 5+ tracks",
    timeframe: "60–90 days",
  },
  {
    id: "single_vs_album_strategy",
    type: "release_consistency",
    area: "release_strategy",
    priority: 3,
    trigger: (s) => s?.releaseCount >= 5 && s?.totalStreams > 5000,
    severity: () => "low",
    title: () => "Consider an EP to consolidate your single momentum",
    description: () =>
      "You've built enough catalog depth for an EP or mini-album. Bundling your best-performing singles with 2–3 new tracks creates a major marketing moment and increases your chances of editorial features.",
    actionUrl: "/distribution",
    steps: [
      "Bundle your top 3–5 singles with 2 new exclusive tracks",
      "Pitch the EP to Spotify editorial at least 4 weeks before release date",
      "Create a dedicated EPK (Electronic Press Kit) for the project",
      "Plan a release week campaign: teaser → pre-save → release day → behind-the-scenes",
    ],
    expectedImpact:
      "EP releases typically generate 2–5× the streams of a single release week",
    timeframe: "30–60 days to plan, then release",
  },

  // ─── Social Media & Content ───────────────────────────────────────────────
  {
    id: "social_connect_zero",
    type: "social_connect",
    area: "social_presence",
    priority: 1,
    trigger: (s) => s.socialAccounts.length === 0,
    severity: () => "high",
    title: () => "Connect a social account to unlock your promotional engine",
    description: () =>
      "Social media is the #1 driver of organic music discovery in 2024. Without a connected account, Max Booster's autopilot, content generator, and analytics tools cannot work for you. Start with Instagram or TikTok — they drive the highest music streams per post.",
    actionUrl: "/settings?tab=integrations",
    steps: [
      "Go to Settings → Integrations and connect Instagram (highest music discovery ROI)",
      "Connect TikTok if you want viral potential — TikTok drives 30%+ of chart entries",
      "Enable Social Autopilot to post consistently without manual effort",
      "Use Max Booster's Content Generator for your first AI-generated posts",
    ],
    expectedImpact:
      "Artists with 2+ social accounts see 4× more discovery streams",
    timeframe: "15 minutes to connect, results within 7 days",
  },
  {
    id: "social_connect_one",
    type: "social_connect",
    area: "social_presence",
    priority: 1,
    trigger: (s) => s.socialAccounts.length === 1,
    severity: () => "high",
    title: (s) =>
      `Add a second social platform to ${s.socialAccounts[0] || "your current one"}`,
    description: (s) =>
      `You're on ${s?.socialAccounts[0] || "one platform"}, but cross-platform presence multiplies your reach. Each platform has a unique algorithm and audience — being on 2 platforms roughly doubles your organic reach ceiling.`,
    actionUrl: "/settings?tab=integrations",
    steps: [
      "Connect TikTok or Instagram (whichever you don't have yet) — they drive the highest music discovery combined",
      "Cross-post content between platforms using Max Booster's autopilot scheduler",
      "Adapt content format per platform: TikTok needs vertical video, Instagram works well with carousels",
      "Track which platform drives more streams in your analytics dashboard",
    ],
    expectedImpact:
      "Second social account typically adds 30–60% more organic streams",
    timeframe: "7–14 days to see cross-platform impact",
  },
  {
    id: "engagement_rate_low",
    type: "engagement_boost",
    area: "engagement",
    priority: 2,
    trigger: (s) => s?.avgEngagementRate < 0.04 && s?.totalStreams > 500,
    severity: (s) => (s?.avgEngagementRate < 0.02 ? "high" : "medium"),
    title: () =>
      "Your save rate is low — boost it to unlock algorithmic playlists",
    description: () =>
      "Spotify's algorithm heavily weights the save-to-stream ratio. A rate below 4% signals to Spotify that listeners aren't connecting with your music, leading to fewer Discover Weekly and Radio placements.",
    actionUrl: "/social-media",
    steps: [
      'Ask fans to "save" your track (not just stream it) in all your posts — saves count more than streams',
      'Create a "save to support" campaign with a specific call-to-action',
      "Post behind-the-scenes content showing your creative process — this builds emotional connection",
      'Use Max Booster\'s AI content generator to create "save this" stories and posts',
      'Run a playlist challenge: "add this to your workout/study playlist"',
    ],
    expectedImpact:
      "Every 1% improvement in save rate can increase algorithmic reach by 15–25%",
    timeframe: "30 days",
  },
  {
    id: "content_posting_frequency",
    type: "content_optimization",
    area: "content_cadence",
    priority: 2,
    trigger: (s) => s?.socialAccounts.length >= 1 && s?.avgEngagementRate < 0.08,
    severity: () => "medium",
    title: () => "Post consistently — the algorithm rewards daily activity",
    description: () =>
      "Social algorithms (Instagram, TikTok, YouTube) favor accounts that post 4–7 times per week. Inconsistent posting trains the algorithm to deprioritize your content.",
    actionUrl: "/social-media",
    steps: [
      "Enable Social Autopilot to automatically post at optimal times every day",
      "Use Max Booster's Content Generator to create a week of posts in one session",
      "Plan content in 3 categories: 40% music/promotional, 40% personal/relatable, 20% educational",
      "Repurpose one piece of content across 3 formats: video clip, audiogram, text quote",
      "Use the AI Content Scheduler to batch-create 30 days of content",
    ],
    expectedImpact:
      "Consistent posting increases algorithmic reach by 40–70% over 30 days",
    timeframe: "30 days",
  },
  {
    id: "behind_the_scenes_content",
    type: "content_optimization",
    area: "content_type",
    priority: 3,
    trigger: (s) => s.totalStreams > 100 && s.socialAccounts.length >= 1,
    severity: () => "low",
    title: () => "Add behind-the-scenes content to build deeper fan loyalty",
    description: () =>
      "Behind-the-scenes (BTS) content consistently outperforms promotional posts by 2–3× on engagement. Fans want to see the human behind the music — studio sessions, songwriting process, day-in-the-life.",
    actionUrl: "/social-media",
    steps: [
      "Film a 60-second studio session clip this week (you don't need a professional setup)",
      'Post a "making of" story for your most recent release',
      "Share your songwriting process — even just showing lyrics on paper performs well",
      "Use Max Booster's AI to write captions that complement your BTS visual",
    ],
    expectedImpact:
      "BTS content averages 2.3× more saves and comments than promotional posts",
    timeframe: "Immediate — post this week",
  },

  // ─── Platform & Distribution ──────────────────────────────────────────────
  {
    id: "platform_focus_dominant",
    type: "platform_focus",
    area: "platform_optimization",
    priority: 2,
    trigger: (s) => {
      const platforms = Object.entries(s.platformStreams).sort(
        (a, b) => b[1] - a[1],
      );
      return platforms.length >= 2 && platforms[0][1] > platforms[1][1] * 3;
    },
    severity: () => "medium",
    title: (s) => {
      const top = Object.entries(s.platformStreams).sort(
        (a, b) => b[1] - a[1],
      )[0];
      return `Double down on ${top[0] || "your top platform"} — that\'s where your fans are`;
    },
    description: (s) => {
      const top = Object.entries(s.platformStreams).sort(
        (a, b) => b[1] - a[1],
      )[0];
      return `Your streams on ${top[0] || "your top platform"} are significantly higher than other platforms. This tells you where your fanbase naturally lives — optimize your promotional efforts there for maximum ROI.`;
    },
    actionUrl: "/analytics",
    steps: [
      "Set up a verified artist profile on your top platform if you haven't already",
      "Submit your next release for editorial playlist consideration on that platform",
      "Analyze which tracks perform best there and create similar content",
      "Run targeted promotion specifically for that platform's user base",
    ],
    expectedImpact:
      "Focused platform strategy can increase streams on your top platform by 25–50%",
    timeframe: "30–60 days",
  },
  {
    id: "playlist_pitching",
    type: "growth_opportunity",
    area: "playlist_strategy",
    priority: 1,
    trigger: (s) => s.totalStreams > 1000 && s.releaseCount >= 1,
    severity: () => "high",
    title: () =>
      "Pitch your music to independent playlists — they're the fastest growth lever",
    description: () =>
      "Independent playlist placements are the single highest-ROI activity for growing streams. A single playlist with 10,000 followers can add 500–5,000 streams per week. Unlike editorial playlists, independent playlists respond quickly to artist outreach.",
    actionUrl: "/distribution",
    steps: [
      "Identify 20 playlists in your genre with 5,000–50,000 followers (this is the sweet spot)",
      "Create a short, personalized pitch for each curator — mention why your track fits their playlist",
      "Use Max Booster's Distribution tools to find placement opportunities",
      "Follow up once after 5 days if you don't hear back",
      "Track which placements drive the most saves/follows in your analytics",
    ],
    expectedImpact:
      "3–10 playlist placements can add 1,000–10,000 streams per month",
    timeframe: "14–30 days to get placements, ongoing results",
  },
  {
    id: "presave_campaigns",
    type: "release_consistency",
    area: "pre_release",
    priority: 2,
    trigger: (s) => s?.releaseCount >= 1 && s?.totalFollowers > 100,
    severity: () => "medium",
    title: () => "Run a pre-save campaign before your next release",
    description: () =>
      "Pre-saves are the digital equivalent of pre-orders. Spotify counts pre-saves as signals of demand — higher pre-saves can trigger editorial consideration and better first-day algorithmic placement. Even 50 pre-saves can meaningfully impact your release day performance.",
    actionUrl: "/distribution",
    steps: [
      "Set up your next release in Max Booster Distribution at least 3 weeks before release date",
      "Enable the pre-save link and share it across all your social platforms",
      "Offer an incentive: exclusive preview, behind-the-scenes content, or early access",
      "Post the pre-save link 3× per week in the 2 weeks before release",
      "Track pre-save signups in your analytics dashboard",
    ],
    expectedImpact: "100+ pre-saves can boost first-week streams by 30–50%",
    timeframe: "2–3 weeks before your next release",
  },

  // ─── Monetization ─────────────────────────────────────────────────────────
  {
    id: "revenue_diversification",
    type: "growth_opportunity",
    area: "monetization",
    priority: 2,
    trigger: (s) => s?.totalRevenue < 100 && s?.totalStreams > 5000,
    severity: () => "medium",
    title: () =>
      "Diversify beyond streaming — beats, merch, and sync can 10× your revenue",
    description: () =>
      "Streaming revenue alone averages $0.003–0.005 per stream. At 5,000 streams/month, that's $15–25. Adding beat sales, merchandise, or sync licensing can realistically generate $500–2,000/month from the same fanbase.",
    actionUrl: "/marketplace",
    steps: [
      "List your instrumentals on Max Booster's Beat Marketplace — set non-exclusive licenses at $30–75",
      "Create 3 merchandise items using print-on-demand (no upfront inventory cost)",
      "Submit your music for sync licensing — TV, YouTube, and podcast placements pay $50–500+ per placement",
      "Offer a fan subscription tier through Max Booster for exclusive content at $4.99/month",
    ],
    expectedImpact:
      "Artists with 3+ revenue streams earn 5–10× more than streaming-only artists",
    timeframe: "30–60 days to set up, then recurring income",
  },
  {
    id: "beat_marketplace_listing",
    type: "growth_opportunity",
    area: "beat_sales",
    priority: 2,
    trigger: (s) => s?.totalRevenue < 500 && s?.releaseCount >= 2,
    severity: () => "medium",
    title: () =>
      "List beats on the marketplace — producers earn $200–2,000/month passively",
    description: () =>
      "Beat licensing is one of the most passive income streams in music. Once listed, beats sell while you sleep. Max Booster's marketplace has active buyers searching for new beats daily.",
    actionUrl: "/marketplace",
    steps: [
      "Upload your best 5 instrumentals to Max Booster Marketplace",
      "Price non-exclusive leases at $30–75, trackout stems at $150–300, exclusive rights at $500–2,000",
      "Write compelling beat titles and descriptions (genre + mood + tempo)",
      "Tag your beats accurately — correct tagging increases search visibility by 3×",
      "Promote your marketplace page on your social accounts weekly",
    ],
    expectedImpact:
      "Active marketplace sellers average $200–800/month within 90 days",
    timeframe: "90 days to build consistent sales",
  },
  {
    id: "sync_licensing_opportunity",
    type: "growth_opportunity",
    area: "sync_licensing",
    priority: 3,
    trigger: (s) => s.totalStreams > 2000 && s.totalRevenue < 200,
    severity: () => "low",
    title: () =>
      "Submit for sync licensing — one placement can pay more than 100,000 streams",
    description: () =>
      "Sync licensing (music in TV, film, ads, YouTube) is the highest per-use revenue in the music industry. A single TV sync can pay $500–50,000 depending on the usage. Your music doesn't need to be chart-topping to land syncs — mood and production quality matter more.",
    actionUrl: "/distribution",
    steps: [
      "Prepare instrumental versions of your top 3 tracks for sync submission",
      "Register your catalog with a PRO (ASCAP, BMI, or SESAC) for royalty tracking",
      "Use Max Booster's sync licensing tools to submit to music supervisors",
      'Create a "sync-ready" demo reel with your most cinematic or mood-specific tracks',
    ],
    expectedImpact:
      "1–2 sync placements per quarter can add $500–5,000 in licensing income",
    timeframe: "30–90 days to land first placement",
  },

  // ─── Audience Building ────────────────────────────────────────────────────
  {
    id: "geo_targeting_top_city",
    type: "geo_targeting",
    area: "geo_targeting",
    priority: 3,
    trigger: (s) => !!s.topCity,
    severity: () => "low",
    title: (s) => `You have a hotspot in ${s.topCity} — capitalize on it`,
    description: (s) =>
      `${s.topCity} is your strongest market. Local artists who invest in their top city see dramatically better live booking opportunities, local press coverage, and word-of-mouth growth. A concentrated local fanbase also signals to algorithms that you have genuine community support.`,
    actionUrl: "/advertising",
    steps: [
      "Run targeted social ads specifically to your top city fans — cost as low as $5/day",
      "Research venues and promoters in your strongest market for potential live shows or showcases",
      "Connect with local music bloggers and radio stations in your top city",
      "Use Max Booster's advertising tools to create geo-targeted campaigns",
    ],
    expectedImpact:
      "Local fanbase concentration leads to 2× higher engagement and live booking opportunities",
    timeframe: "30–60 days",
  },
  {
    id: "email_list_building",
    type: "growth_opportunity",
    area: "fan_retention",
    priority: 2,
    trigger: (s) => s?.totalFollowers > 200,
    severity: () => "medium",
    title: () => "Build an email list — it's the only fan channel you own",
    description: () =>
      "Social media platforms can change their algorithms or suspend your account overnight. Your email list is the only direct, algorithm-free channel to reach your fans. Artists with email lists see 40–70% higher attendance at shows and 3× more merch sales.",
    actionUrl: "/social-media",
    steps: [
      "Set up a free download (exclusive track, preset pack, or lyric sheet) in exchange for email signup",
      "Link your email signup in your Instagram bio and TikTok profile",
      "Send a monthly newsletter with new releases, behind-the-scenes content, and exclusive offers",
      "Use Max Booster's content tools to create your first email newsletter template",
    ],
    expectedImpact:
      "Email subscribers have 40× higher conversion rate than social followers for merch/shows",
    timeframe: "60 days to build initial list of 100+ subscribers",
  },
  {
    id: "collaboration_strategy",
    type: "growth_opportunity",
    area: "collaboration",
    priority: 2,
    trigger: (s) => s?.releaseCount >= 2 && s?.totalFollowers < 10000,
    severity: () => "medium",
    title: () =>
      "Collaborate with an artist at a similar level for mutual audience growth",
    description: () =>
      "Collaboration is the fastest organic growth hack in music. When you feature an artist with a similar audience size, you typically get 30–50% of their fanbase discovering you. Both artists win without paying for ads.",
    actionUrl: "/social-media",
    steps: [
      "Identify 5 artists in your genre with a similar follower count (within 2× your size)",
      "Reach out with a specific collaboration pitch — suggest a feature, co-write, or remix swap",
      "Create the collaboration and distribute it to both your audiences simultaneously",
      "Cross-post the collaboration on both artists' social channels on release day",
    ],
    expectedImpact:
      "A well-matched collaboration can add 15–30% new followers within 7 days of release",
    timeframe: "30–60 days to arrange and release",
  },

  // ─── PR & Press ────────────────────────────────────────────────────────────
  {
    id: "press_kit_optimization",
    type: "growth_opportunity",
    area: "press_pr",
    priority: 3,
    trigger: (s) => s.totalStreams > 1000,
    severity: () => "low",
    title: () =>
      "Update your Electronic Press Kit (EPK) to attract press and booking agents",
    description: () =>
      "Journalists, bloggers, playlist curators, and venue bookers all require a professional EPK before covering or booking you. A polished EPK is often the difference between getting featured or being ignored.",
    actionUrl: "/analytics",
    steps: [
      "Create or update your EPK with your best streaming stats and achievements",
      "Include a professional bio (3 versions: 1 sentence, 1 paragraph, full bio)",
      "Add your top 3 streaming numbers and any notable placements or features",
      "Include high-quality press photos (2–3 options in different styles)",
      "Share your EPK with 10 music blogs or playlist curators this week",
    ],
    expectedImpact:
      "Artists with professional EPKs are 5× more likely to get blog features and playlist placements",
    timeframe: "1–2 hours to create, ongoing benefit",
  },
  {
    id: "radio_blog_pitching",
    type: "growth_opportunity",
    area: "radio_pr",
    priority: 3,
    trigger: (s) => s.totalStreams > 5000 && s.releaseCount >= 3,
    severity: () => "low",
    title: () =>
      "Pitch to music blogs and college radio — they're still powerful discovery channels",
    description: () =>
      "Music blogs and college radio stations reach dedicated music fans who actively seek new artists. A feature on a respected blog can drive 500–5,000 new streams and establishes credibility for future opportunities.",
    actionUrl: "/social-media",
    steps: [
      "Research 20 music blogs in your genre that review independent artists",
      "Write a personalized pitch email (not a copy-paste) with your streaming stats and story",
      "Submit to college radio stations in your target markets — they accept 80%+ of quality submissions",
      "Follow up once per submission after 5 business days",
      "Add any press coverage to your EPK and social media",
    ],
    expectedImpact:
      "Blog and radio coverage drives credibility and 500–2,000 new streams per feature",
    timeframe: "30–60 days to get first feature",
  },

  // ─── Career Milestones ────────────────────────────────────────────────────
  {
    id: "first_1000_fans",
    type: "benchmark",
    area: "milestone",
    priority: 1,
    trigger: (s) => s?.totalFollowers < 1000 && s?.totalFollowers > 50,
    severity: () => "high",
    title: (s) =>
      `${1000 - s?.totalFollowers} followers away from your first milestone — push hard now`,
    description: () =>
      "1,000 followers is the first major credibility threshold in music. It unlocks Instagram's swipe-up links, YouTube monetization eligibility, and signals to playlist curators and booking agents that you have a real fanbase. Many artists stall here — don't let that be you.",
    actionUrl: "/social-media",
    steps: [
      'Run a 48-hour "follow challenge" — give fans a reason to share your profile',
      "Post daily for the next 30 days using Max Booster's autopilot",
      "Ask your current followers to share your music with 3 friends",
      "Collaborate with a similar-sized artist to cross-promote to each other's audiences",
      "Run a small targeted ad ($30–50 budget) to reach fans in your genre",
    ],
    expectedImpact:
      "With focused effort, reaching 1,000 followers typically takes 30–60 days",
    timeframe: "30–60 days",
  },
  {
    id: "first_10k_streams",
    type: "benchmark",
    area: "milestone",
    priority: 1,
    trigger: (s) => s?.totalStreams < 10000 && s?.totalStreams > 500,
    severity: () => "high",
    title: (s) =>
      `${Math?.round(10000 - s?.totalStreams).toLocaleString()} streams to your first major milestone — accelerate now`,
    description: () =>
      "10,000 streams is the threshold where Spotify's algorithm begins to take an artist seriously for Discover Weekly and Release Radar placements. It's also the point where you start earning meaningful royalties and attracting curator attention.",
    actionUrl: "/distribution",
    steps: [
      "Submit your current releases for 5–10 independent playlist placements this week",
      'Run a "stream to support" campaign on your social channels',
      "Ask friends, family, and existing fans to add your track to a playlist they already listen to",
      "Release a new single to generate a fresh wave of algorithmic exposure",
      "Use Max Booster's advertising tools for a targeted $50 stream boost campaign",
    ],
    expectedImpact:
      "Reaching 10K streams can trigger Discover Weekly consideration, multiplying organic growth",
    timeframe: "30–45 days with active promotion",
  },
  {
    id: "revenue_first_dollar",
    type: "benchmark",
    area: "milestone",
    priority: 2,
    trigger: (s) => s.totalRevenue < 10 && s.totalStreams > 100,
    severity: () => "medium",
    title: () => "Set up royalty collection to start earning from every stream",
    description: () =>
      "Many artists leave money on the table by not properly registering with a PRO (Performing Rights Organization) and collecting publishing royalties. In addition to streaming royalties, you're entitled to sync, performance, and mechanical royalties.",
    actionUrl: "/analytics",
    steps: [
      "Register with a PRO (ASCAP, BMI, or SESAC in the US) — it's free and essential",
      "Set up your Max Booster Distribution account to collect streaming royalties on all platforms",
      "Register your songs with your PRO after each release",
      "Check your royalty dashboard in Max Booster regularly for pending payments",
    ],
    expectedImpact:
      "Proper royalty setup can recover 20–40% more income from existing streams",
    timeframe: "2–4 weeks to set up, then ongoing",
  },

  // ─── Verification & Presence ──────────────────────────────────────────────
  {
    id: "artist_profile_optimization",
    type: "growth_opportunity",
    area: "profile_optimization",
    priority: 2,
    trigger: (s) => s.totalStreams > 500,
    severity: () => "medium",
    title: () => "Claim and optimize your artist profiles on all DSPs",
    description: () =>
      "Verified artist profiles on Spotify for Artists, Apple Music for Artists, and Amazon Music for Artists give you control over your image, access to streaming data, and the ability to pitch for editorial playlists. Unclaimed profiles miss out on all of these benefits.",
    actionUrl: "/distribution",
    steps: [
      "Claim your Spotify for Artists profile at artists.spotify.com",
      "Upload a professional artist photo and complete your bio on all DSPs",
      'Enable "Artist\'s Pick" to feature your newest release at the top of your profile',
      "Submit your next release for editorial playlist consideration via Spotify for Artists",
      "Connect your social accounts to your Spotify artist profile for the social follow feature",
    ],
    expectedImpact:
      "Optimized artist profiles receive 25–40% more profile visits and follows",
    timeframe: "1–2 hours to set up, permanent benefit",
  },
];

class CareerCoachService {
  private readonly recommendationTypes = {
    RELEASE_CONSISTENCY: "release_consistency",
    PLATFORM_FOCUS: "platform_focus",
    BENCHMARK: "benchmark",
    SOCIAL_CONNECT: "social_connect",
    GEO_TARGETING: "geo_targeting",
    CONTENT_OPTIMIZATION: "content_optimization",
    GROWTH_OPPORTUNITY: "growth_opportunity",
    ENGAGEMENT_BOOST: "engagement_boost",
  };

  async generateDailyRecommendations(
    userId: string,
  ): Promise<CareerCoachRecommendation[]> {
    try {
      logger?.info(`Generating daily recommendations for user ${userId}`);

      const today = new Date();
      today?.setHours(0, 0, 0, 0);
      const existingToday = await db
        .select()
        .from(careerCoachRecommendations)
        .where(
          and(
            eq(careerCoachRecommendations?.userId, userId),
            gte(careerCoachRecommendations?.createdAt, today),
            isNull(careerCoachRecommendations?.dismissedAt),
            isNull(careerCoachRecommendations?.completedAt),
          ),
        );

      if (existingToday?.length > 0) {
        logger?.info(
          `Found ${existingToday?.length} existing recommendations for today`,
        );
        return existingToday;
      }

      const snapshot = await this?.getUserAnalyticsSnapshot(userId);
      const recommendations: InsertCareerCoachRecommendation[] = [];

      // Route through MaxCore — it is the sole AI source for career coaching.
      const mcResult = requireMaxCore(
        await MaxCoreAIClient.generate<{
          recommendations: Array<{
            type: string;
            title: string;
            description: string;
            priority: number;
            actionUrl: string;
            patternId: string;
            area: string;
            severity: "high" | "medium" | "low";
            steps: string[];
            expectedImpact: string;
            timeframe: string;
          }>;
        }>("/api/generate/content", {
          type: "career_coaching",
          format: "json",
          tone: "motivational",
          analytics_snapshot: {
            totalStreams: snapshot.totalStreams,
            totalFollowers: snapshot.totalFollowers,
            totalRevenue: snapshot.totalRevenue,
            releaseCount: snapshot.releaseCount,
            daysSinceRelease: snapshot.daysSinceRelease,
            socialAccounts: snapshot.socialAccounts,
            topPlatform: snapshot.topPlatform,
            topCity: snapshot.topCity,
            avgEngagementRate: snapshot.avgEngagementRate,
            platformStreams: snapshot.platformStreams,
          },
          max_recommendations: 6,
        }),
        "career coaching",
      );

      const mcRecs = Array.isArray(mcResult?.recommendations)
        ? mcResult.recommendations
        : [];

      for (const rec of mcRecs.slice(0, 6)) {
        recommendations?.push({
          userId,
          type: rec.type || this.recommendationTypes.GROWTH_OPPORTUNITY,
          title: rec.title,
          description: rec.description,
          priority: rec.priority ?? 2,
          actionUrl: rec.actionUrl || "/analytics",
          metadata: {
            patternId: rec.patternId || "maxcore",
            area: rec.area || "growth",
            severity: rec.severity || "medium",
            steps: rec.steps || [],
            expectedImpact: rec.expectedImpact || "",
            timeframe: rec.timeframe || "",
            snapshot: {
              totalStreams: snapshot.totalStreams,
              totalFollowers: snapshot.totalFollowers,
              totalRevenue: snapshot.totalRevenue,
              releaseCount: snapshot.releaseCount,
              daysSinceRelease: snapshot.daysSinceRelease,
              socialAccounts: snapshot.socialAccounts,
              topPlatform: snapshot.topPlatform,
              topCity: snapshot.topCity,
            },
          },
        });
      }

      if (recommendations?.length === 0) {
        // MaxCore returned an empty recommendations array — treat as unavailable.
        throw new AIUnavailableError("career coaching");
      }

      const inserted: CareerCoachRecommendation[] = [];
      for (const rec of recommendations) {
        const [result] = await db
          .insert(careerCoachRecommendations)
          .values(rec)
          .returning();
        inserted?.push(result);
      }

      logger?.info(
        `Generated ${inserted?.length} recommendations for user ${userId}`,
      );
      return inserted;
    } catch (error) {
      logger?.warn(
        { err: error },
        `Error generating recommendations for user ${userId}:`,
      );
      throw error;
    }
  }

  async analyzeCareerGaps(userId: string): Promise<CareerGap[]> {
    const snapshot = await this?.getUserAnalyticsSnapshot(userId);

    // Route through MaxCore — sole AI source for career gap analysis.
    const mcResult = requireMaxCore(
      await MaxCoreAIClient.generate<{
        gaps: Array<{
          area: string;
          severity: "high" | "medium" | "low";
          description: string;
          recommendation: string;
          actionUrl: string;
          steps: string[];
          expectedImpact: string;
          timeframe: string;
        }>;
      }>("/api/generate/content", {
        type: "career_gap_analysis",
        format: "json",
        tone: "analytical",
        analytics_snapshot: {
          totalStreams: snapshot.totalStreams,
          totalFollowers: snapshot.totalFollowers,
          totalRevenue: snapshot.totalRevenue,
          releaseCount: snapshot.releaseCount,
          daysSinceRelease: snapshot.daysSinceRelease,
          socialAccounts: snapshot.socialAccounts,
          topPlatform: snapshot.topPlatform,
          topCity: snapshot.topCity,
          avgEngagementRate: snapshot.avgEngagementRate,
          platformStreams: snapshot.platformStreams,
        },
      }),
      "career gap analysis",
    );

    const gaps: CareerGap[] = Array.isArray(mcResult?.gaps)
      ? mcResult.gaps
      : [];

    return gaps.sort((a, b) => {
      const severityOrder = { high: 0, medium: 1, low: 2 };
      return (severityOrder[a?.severity] ?? 1) - (severityOrder[b?.severity] ?? 1);
    });
  }

  async createSmartGoal(
    userId: string,
    goalType: string,
  ): Promise<CareerGoal | null> {
    try {
      const suggestion = await this?.suggestSmartGoal(userId, goalType);
      if (!suggestion) return null;

      const deadline = new Date();
      deadline?.setDate(deadline?.getDate() + suggestion?.deadlineDays);

      const [goal] = await db
        .insert(careerGoals)
        .values({
          userId,
          goalType: suggestion.goalType,
          title: suggestion.title,
          description: suggestion.description,
          targetValue: suggestion.targetValue,
          currentValue: 0,
          unit: suggestion.unit,
          deadline,
          status: "active",
          metadata: { reasoning: suggestion.reasoning },
        })
        .returning();

      logger?.info(`Created SMART goal for user ${userId}: ${goal?.title}`);
      return goal;
    } catch (error) {
      logger?.warn(
        { err: error },
        `Error creating SMART goal for user ${userId}:`,
      );
      throw error;
    }
  }

  async dismissRecommendation(
    userId: string,
    recommendationId: string,
  ): Promise<boolean> {
    try {
      const [updated] = await db
        .update(careerCoachRecommendations)
        .set({ dismissedAt: new Date() })
        .where(
          and(
            eq(careerCoachRecommendations?.id, recommendationId),
            eq(careerCoachRecommendations?.userId, userId),
          ),
        )
        .returning();

      return !!updated;
    } catch (error) {
      logger?.warn(
        { err: error },
        `Error dismissing recommendation ${recommendationId}:`,
      );
      throw error;
    }
  }

  async completeRecommendation(
    userId: string,
    recommendationId: string,
  ): Promise<boolean> {
    try {
      const [updated] = await db
        .update(careerCoachRecommendations)
        .set({ completedAt: new Date() })
        .where(
          and(
            eq(careerCoachRecommendations?.id, recommendationId),
            eq(careerCoachRecommendations?.userId, userId),
          ),
        )
        .returning();

      return !!updated;
    } catch (error) {
      logger?.warn(
        { err: error },
        `Error completing recommendation ${recommendationId}:`,
      );
      throw error;
    }
  }

  async getActiveRecommendations(
    userId: string,
  ): Promise<CareerCoachRecommendation[]> {
    return db
      .select()
      .from(careerCoachRecommendations)
      .where(
        and(
          eq(careerCoachRecommendations?.userId, userId),
          isNull(careerCoachRecommendations?.dismissedAt),
          isNull(careerCoachRecommendations?.completedAt),
        ),
      )
      .orderBy(
        desc(careerCoachRecommendations?.priority),
        desc(careerCoachRecommendations?.createdAt),
      )
      .limit(10);
  }

  async getGoals(userId: string): Promise<CareerGoal[]> {
    return db
      .select()
      .from(careerGoals)
      .where(eq(careerGoals?.userId, userId))
      .orderBy(desc(careerGoals?.createdAt));
  }

  async createGoal(
    userId: string,
    data: Omit<InsertCareerGoal, "userId">,
  ): Promise<CareerGoal> {
    const [goal] = await db
      .insert(careerGoals)
      .values({
        ...data,
        userId,
      })
      .returning();
    return goal;
  }

  async updateGoal(
    userId: string,
    goalId: string,
    data: Partial<Omit<InsertCareerGoal, "userId" | "id">>,
  ): Promise<CareerGoal | null> {
    const [goal] = await db
      .update(careerGoals)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(careerGoals?.id, goalId), eq(careerGoals?.userId, userId)))
      .returning();
    return goal || null;
  }

  async deleteGoal(userId: string, goalId: string): Promise<boolean> {
    const [deleted] = await db
      .delete(careerGoals)
      .where(and(eq(careerGoals?.id, goalId), eq(careerGoals?.userId, userId)))
      .returning({ id: careerGoals.id });
    return !!deleted;
  }

  async updateGoalProgress(
    userId: string,
    goalId: string,
    currentValue: number,
  ): Promise<CareerGoal | null> {
    const [goal] = await db
      .update(careerGoals)
      .set({
        currentValue,
        updatedAt: new Date(),
        status:
          currentValue >= (await this?.getGoalTarget(goalId))
            ? "completed"
            : "active",
      })
      .where(and(eq(careerGoals?.id, goalId), eq(careerGoals?.userId, userId)))
      .returning();
    return goal || null;
  }

  getPatternLibrary() {
    return CAREER_COACH_PATTERNS?.map((p) => ({
      id: p.id,
      type: p.type,
      area: p.area,
      priority: p.priority,
      actionUrl: p.actionUrl,
      steps: p.steps,
      expectedImpact: p.expectedImpact,
      timeframe: p.timeframe,
    }));
  }

  private async getGoalTarget(goalId: string): Promise<number> {
    const [goal] = await db
      .select({ targetValue: careerGoals.targetValue })
      .from(careerGoals)
      .where(eq(careerGoals?.id, goalId))
      .limit(1);
    return goal?.targetValue || 0;
  }

  private async getUserAnalyticsSnapshot(
    userId: string,
  ): Promise<UserAnalyticsSnapshot> {
    const analyticsData = await db
      .select({
        totalStreams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        totalFollowers: sql<number>`COALESCE(MAX(${analytics?.followers}), 0)`,
        totalRevenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics?.userId, userId));

    const releasesData = await db
      .select()
      .from(releases)
      .where(eq(releases?.userId, userId))
      .orderBy(desc(releases?.createdAt));

    const socialData = await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts?.userId, userId));

    const dspData = await db
      .select()
      .from(dspAnalytics)
      .where(eq(dspAnalytics?.userId, userId))
      .limit(100);

    let topPlatform: string | null = null;
    let topCity: string | null = null;
    let avgEngagementRate = 0;
    const platformEngagement: Record<string, number> = {};
    const platformStreams: Record<string, number> = {};

    if (dspData?.length > 0) {
      let totalEngagement = 0;
      let totalStreams = 0;

      for (const d of dspData) {
        const platform = d?.platform || "unknown";
        platformStreams[platform] =
          (platformStreams[platform] || 0) + (d?.streams || 0);
        const engagement = (d?.saves || 0) + (d?.playlistAdds || 0);
        platformEngagement[platform] =
          (platformEngagement[platform] || 0) + engagement;
        totalEngagement += engagement;
        totalStreams += d?.streams || 0;

        const geo = d?.geography as {
          countries?: { name: string; streams: number }[];
        } | null;
        if (geo?.countries?.[0]) {
          topCity = geo?.countries[0].name;
        }
      }

      topPlatform =
        Object?.entries(platformStreams).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        null;

      avgEngagementRate = totalStreams > 0 ? totalEngagement / totalStreams : 0;
    }

    const lastReleaseDate = releasesData[0]?.createdAt || null;
    const daysSinceRelease = lastReleaseDate
      ? Math?.floor(
          (Date?.now() - new Date(lastReleaseDate).getTime()) /
            (1000 * 60 * 60 * 24),
        )
      : 999;

    return {
      totalStreams: Number(analyticsData[0]?.totalStreams || 0),
      totalFollowers: Number(analyticsData[0]?.totalFollowers || 0),
      totalRevenue: Number(analyticsData[0]?.totalRevenue || 0),
      releaseCount: releasesData.length,
      lastReleaseDate,
      socialAccounts: socialData.map((s) => s?.platform),
      topPlatform,
      topCity,
      avgEngagementRate,
      daysSinceRelease,
      platformEngagement,
      platformStreams,
    };
  }

  private async suggestSmartGoal(
    userId: string,
    goalType: string,
  ): Promise<SmartGoalSuggestion | null> {
    const snapshot = await this?.getUserAnalyticsSnapshot(userId);

    const suggestions: Record<string, SmartGoalSuggestion> = {
      streams: {
        goalType: "streams",
        title: "Increase Monthly Streams",
        description:
          "Grow your monthly streaming numbers through consistent releases and promotion",
        targetValue: Math.max(Math?.round(snapshot?.totalStreams * 1.5), 10000),
        unit: "streams",
        deadlineDays: 30,
        reasoning: `Based on your current ${snapshot?.totalStreams.toLocaleString()} streams, a 50% growth target is ambitious but achievable with focused playlist pitching and a new release.`,
      },
      followers: {
        goalType: "followers",
        title: "Grow Your Fanbase",
        description: "Build your follower count across all connected platforms",
        targetValue: Math.max(Math?.round(snapshot?.totalFollowers * 1.25), 1000),
        unit: "followers",
        deadlineDays: 60,
        reasoning: `Growing your fanbase by 25% from ${snapshot?.totalFollowers.toLocaleString()} over 2 months aligns with industry growth rates. Focus on collaborations and consistent posting.`,
      },
      releases: {
        goalType: "releases",
        title: "Consistent Release Schedule",
        description:
          "Maintain a regular release cadence to feed the algorithm and keep fans engaged",
        targetValue: snapshot.releaseCount + 4,
        unit: "releases",
        deadlineDays: 90,
        reasoning:
          "Industry data shows artists who release 4+ tracks per quarter receive significantly better algorithmic placement on Spotify, Apple Music, and Amazon Music.",
      },
      engagement: {
        goalType: "engagement",
        title: "Boost Save & Engagement Rate",
        description:
          "Increase the save-to-stream ratio to unlock algorithmic playlist placements",
        targetValue: Math.max(snapshot?.avgEngagementRate * 2, 0.05),
        unit: "rate",
        deadlineDays: 30,
        reasoning:
          "A save rate above 5% signals to Spotify that fans love your music, which triggers Discover Weekly and Radio placements.",
      },
      revenue: {
        goalType: "revenue",
        title: "Reach Your First Revenue Milestone",
        description:
          "Diversify income streams through beat sales, sync, and merchandise",
        targetValue: Math.max(snapshot?.totalRevenue * 2, 100),
        unit: "dollars",
        deadlineDays: 90,
        reasoning: `Starting from $${snapshot?.totalRevenue.toFixed(2)}, doubling your revenue is achievable by adding beat marketplace listings and sync submissions.`,
      },
      playlists: {
        goalType: "playlists",
        title: "Land 10 Independent Playlist Placements",
        description:
          "Systematically pitch to independent curators to dramatically increase stream volume",
        targetValue: 10,
        unit: "playlists",
        deadlineDays: 45,
        reasoning:
          "10 playlist placements across curators with 5K–50K followers can realistically add 2,000–20,000 streams per month.",
      },
    };

    return suggestions[goalType] || suggestions?.streams;
  }
}

export const careerCoachService = new CareerCoachService();
