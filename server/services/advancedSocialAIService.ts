/**
 * Advanced Social AI Service - Server-side GPT-5.2 Level Content Generation
 *
 * Integrates the AdvancedSocialAI engine with Max Booster's content generation
 * pipeline for sophisticated social media post creation and autopilot capabilities.
 *
 * Features:
 * - Deep semantic understanding of content context
 * - Platform-specific optimization with detailed knowledge bases
 * - Audience psychology-based content tailoring
 * - Viral pattern recognition and application
 * - Multi-variant generation with predictive scoring
 * - Brand voice consistency analysis
 * - Real-time trend integration
 *
 * 100% in-house, no external APIs
 */

import { logger } from "../logger.js";
import { db } from "../db.js";
import { userBrandVoices, autopilotPreferences } from "@shared/schema";
import { eq } from "drizzle-orm";
import { MaxCoreAIClient } from "./unifiedAIController.js";
import { evolutionRegistry } from "./evolutionRegistry.js";

// ============================================================================
// SEEDED PRNG HELPER
// Returns a deterministic index into an array of `length` items based on a
// string seed. Same seed → same index every time; different seeds → varied
// results spread across the full range.
// ============================================================================

// seededGate: deterministic probability gate — replaces Math.random() < threshold.
// Same seed → same true/false outcome every time. threshold range: 0.0–1.0.

// ============================================================================
// MAX BOOSTER PLATFORM KNOWLEDGE
// Injected into content generation engine so every AI post reflects the full
// breadth of what Max Booster offers independent musicians.
// ============================================================================

export const MAX_BOOSTER_PLATFORM_KNOWLEDGE = {
  name: "Max Booster",
  tagline:
    "The all-in-one AI music career management platform for independent artists.",
  owner: "B-Lawz Music",

  coreFeatures: {
    studio: {
      name: "Studio DAW",
      description:
        "Professional-grade digital audio workstation built 100% in-house.",
      highlights: [
        "Unlimited multi-track audio and MIDI recording",
        "AI Mixer — automatic level balance, EQ, compression, spatial imaging",
        "AI Mastering — loudness targeting for Spotify (-14 LUFS), Apple Music (-16 LUFS), YouTube, Tidal",
        "AI Generator — create beats, melodies, chord progressions from text descriptions",
        "Stem Separation — isolate vocals, drums, bass, and instruments from any audio",
        "MIDI Piano Roll editor with virtual instruments",
        "Real-time collaboration with other artists",
        "VST plugin bridge for external plugins",
        "Comping — select best takes across multiple recordings",
        "Export to WAV, MP3, FLAC, and individual stems",
        "Reference Track Matching — match the tonal character of any reference",
        "Cloud save — projects auto-save, never lose work",
      ],
    },

    distribution: {
      name: "Music Distribution",
      description: "One-click delivery to 150+ streaming platforms worldwide.",
      highlights: [
        "150+ platforms including Spotify, Apple Music, YouTube Music, Amazon Music, Tidal, Deezer, TikTok, Instagram, Pandora, SoundCloud, Boomplay, Anghami, iHeart, Napster, Beatport, Traxsource, and more",
        "Auto-generate ISRC codes for every track",
        "Auto-generate UPC barcodes for every release",
        "Playlist pitching to Spotify editorial and platform curators",
        "LabelGrid submission portal for label distribution",
        "Pre-save campaigns — build momentum before your release goes live",
        "Release date scheduling — plan drops weeks in advance",
        "Metadata management — edit song info, album art, credits anytime",
        "Cover art requirements: 3000x3000px, JPG or PNG",
        "Audio requirements: WAV or FLAC, 16-bit minimum",
        "Timeline: most releases live within 1-3 business days",
        "Smart content ID — automatic copyright protection across platforms",
      ],
    },

    royalties: {
      name: "Royalties & Payments",
      description:
        "Full royalty tracking and payout management — keep 100% of what you earn.",
      highlights: [
        "100% royalty retention — Max Booster takes 0% of your streaming earnings",
        "Real-time earnings dashboard with per-platform and per-track breakdowns",
        "Earnings by territory — see which countries stream you most",
        "Monthly payouts once you reach the $10 minimum threshold",
        "Royalty splits — automatically divide earnings among collaborators by percentage",
        "Publishing rights management — mechanical and performance royalties",
        "PRO registration guidance (ASCAP, BMI, SOCAN)",
        "Sync licensing revenue tracking for TV, film, and commercial placements",
        "Instant Payout / Royalty Advance — cash out future earnings early",
        "Revenue Intelligence — 90-day earnings forecast powered by AI",
        "Tax report export for year-end filing",
        "Stripe-powered secure payment processing",
      ],
    },

    marketplace: {
      name: "Beat Marketplace",
      description:
        "Built-in storefront to sell beats, loops, samples, and presets directly to artists.",
      highlights: [
        "Sell beats with Non-Exclusive, Exclusive, and Unlimited license tiers",
        "Custom license templates — set your own terms",
        "Watermarked MP3 preview generation (automatic)",
        "Custom branded storefront with unique URL",
        "Bundle pricing — offer discounts on multi-beat purchases",
        "Marketplace Analytics — conversion rates, top performers, revenue trends",
        "Social media auto-promotion of new beat uploads via Autopilot integration",
        "Instant delivery to buyers after purchase",
        "Sell samples, loops, and preset packs alongside beats",
        "Integrated checkout — Stripe-powered, no third-party redirects",
      ],
    },

    socialMedia: {
      name: "Social Media Autopilot",
      description:
        "AI-powered automated posting and growth engine across all major platforms.",
      highlights: [
        "Connect Instagram, Twitter/X, TikTok, Facebook, YouTube, LinkedIn",
        "AI generates platform-optimized captions, hashtags, and emojis automatically",
        "AI-Optimized Timing — posts go out at peak audience engagement hours",
        "Content Calendar — plan and schedule posts weeks in advance",
        "Burst Mode — high-frequency posting around release dates for maximum momentum",
        "AI Content Variants — multiple caption versions generated for A/B testing",
        "A/B Testing — automatically test caption hooks to find top performers",
        "Brand Voice — AI learns your style and maintains consistency across posts",
        "Audience segmentation — tailor content by genre, fanbase, and objective",
        "Engagement metrics — track likes, comments, shares, click-through per post",
        "Auto-hashtag optimization — trending and niche hashtags per genre",
      ],
    },

    advertisingAutopilot: {
      name: "Advertising Autopilot",
      description:
        "Zero-budget organic growth campaigns powered by AI — no ad spend required.",
      highlights: [
        "AI builds and runs full promotional campaigns without paid advertising",
        "Organic growth tactics — smart engagement, cross-posting, and discovery optimization",
        "A/B content testing — identifies which angles resonate with your audience",
        "Campaign scheduling aligned with release strategy",
        "Multi-platform campaign management from a single dashboard",
        "Performance analytics — impressions, reach, and conversion tracking",
        "Fan targeting — reach listeners who already follow similar artists",
      ],
    },

    analytics: {
      name: "Analytics & Insights",
      description:
        "Deep listener intelligence and career performance metrics in real time.",
      highlights: [
        "Executive Dashboard — career health score and overall performance overview",
        "Stream counts, listener counts, and play data per track and platform",
        "Audience demographics — age, gender, and location breakdowns",
        "Territory maps — visualize where your listeners are geographically",
        "Social engagement metrics — linked to every post and campaign",
        "Revenue analytics — earnings by track, platform, and territory",
        "Trend detection — rising tracks and growing territories highlighted automatically",
        "Competitor benchmarking — compare your growth to similar artists",
        "Predictive insights — AI suggests actions to grow based on your data",
      ],
    },

    careerTools: {
      name: "Career Tools",
      description:
        "End-to-end music career management beyond production and distribution.",
      highlights: [
        "AI Career Coach — personalized strategy based on your goals and current metrics",
        "Electronic Press Kit (EPK) generator — professional bio, photos, and credits",
        "Tour & Venue Management — track shows, booking, and logistics",
        "Sync Licensing Portal — submit tracks for TV, film, and brand placements",
        "Songwriting Assistant — verse/chorus structure, lyric co-writing with AI",
        "Sample Clearance Tracker — manage samples used in your productions",
        "Project Budget Planner — track production and marketing spend",
        "Contract Management — draft and manage music contracts",
        "Radio Pitch Tool — submit tracks for FM, internet, and playlist radio",
        "Fan Campaign Manager — coordinate fan engagement campaigns",
        "Release Countdown — build pre-release anticipation with countdown assets",
      ],
    },

    videoGenerator: {
      name: "AI Cinematic Video Generator",
      description:
        "Generate professional music videos and visual content from audio — 100% in-house AI.",
      highlights: [
        "Convert your music into full cinematic music videos automatically",
        "AI generates scene compositions, transitions, and visual effects",
        "Multiple visual styles: Cinematic, Lo-Fi, Abstract, Performance, Lyric Video",
        "Sync visual cuts to beat drops and song structure automatically",
        "Export in 1080p and 4K for YouTube, TikTok, and Instagram Reels",
        "Add custom branding — artist name, logo overlays, and color palette",
        "No video editing skills required — AI handles everything end to end",
        "100% in-house technology, no external rendering APIs",
      ],
    },

    aiTechnology: {
      name: "In-House AI Engine",
      description:
        "Every AI feature on Max Booster runs on proprietary models — no OpenAI, no external APIs.",
      highlights: [
        "AdvancedMusicAI — beat and melody generation model",
        "Max AI Assistant — conversational platform guide trained on all Max Booster features",
        "Social Content AI — engagement-optimized post generation",
        "AI Mixer / Mastering Engine — audio processing and loudness optimization",
        "Self-Evolution Engine — AI models continuously retrain on platform usage patterns",
        "Pocket Dimension — custom distributed storage fabric for all AI model weights",
        "PocketFabric Cluster — 3-node auto-scaling AI compute layer",
        "Zero dependency on third-party AI providers — all data stays on-platform",
      ],
    },

    subscriptionPlans: {
      name: "Subscription Plans",
      description: "Flexible plans for every stage of your music career.",
      plans: [
        {
          name: "Free",
          details: "Core tools with usage limits — get started at no cost",
        },
        { name: "Monthly", details: "Full platform access, billed monthly" },
        { name: "Yearly", details: "Full platform access with annual savings" },
        {
          name: "Lifetime",
          details: "One-time payment, permanent access to all features",
        },
      ],
      note: "100% royalty retention on all paid plans. No hidden fees.",
    },
  },

  keyUSPs: [
    "All-in-one platform — Studio, Distribution, Royalties, Marketplace, Social, Analytics, and Career tools in one place",
    "100% royalty retention — keep every dollar you earn from streaming",
    "150+ distribution platforms — widest global reach available",
    "Zero external AI APIs — all models are custom-built and proprietary",
    "Organic advertising — AI-powered growth without ad spend",
    "Self-evolving AI — the platform gets smarter the more you use it",
    "No experience required — AI handles the technical complexity so you can focus on music",
  ],

  hashtags: {
    brand: ["#MaxBooster", "#BLawzMusic", "#MaxBoosterAI"],
    music: [
      "#IndieArtist",
      "#MusicDistribution",
      "#MusicProduction",
      "#NewMusic",
      "#MusicBusiness",
    ],
    ai: ["#AIMusic", "#MusicTech", "#AIProducer", "#FutureOfMusic"],
    distribution: [
      "#MusicRelease",
      "#StreamingNow",
      "#IndependentArtist",
      "#MusicForAll",
    ],
    studio: [
      "#StudioLife",
      "#BeatMaker",
      "#Producer",
      "#RecordingStudio",
      "#DAW",
    ],
  },
} as const;

// Helper: detect if a topic or content request is about Max Booster features
export function detectMaxBoosterContext(topic?: string): {
  isMaxBoosterTopic: boolean;
  relevantFeature?: keyof (typeof MAX_BOOSTER_PLATFORM_KNOWLEDGE)["coreFeatures"];
  keywords: string[];
} {
  if (!topic) return { isMaxBoosterTopic: false, keywords: [] };
  const lower = topic.toLowerCase();

  const featureMap: Array<{
    feature: keyof (typeof MAX_BOOSTER_PLATFORM_KNOWLEDGE)["coreFeatures"];
    triggers: string[];
  }> = [
    {
      feature: "studio",
      triggers: [
        "studio",
        "daw",
        "record",
        "mix",
        "master",
        "beat",
        "produce",
        "track",
        "stem",
      ],
    },
    {
      feature: "distribution",
      triggers: [
        "distribut",
        "release",
        "spotify",
        "apple music",
        "streaming",
        "platform",
        "isrc",
        "upc",
        "playlist pitch",
      ],
    },
    {
      feature: "royalties",
      triggers: [
        "royalt",
        "earnings",
        "payout",
        "revenue",
        "income",
        "publish",
        "split",
      ],
    },
    {
      feature: "marketplace",
      triggers: [
        "marketplace",
        "beat store",
        "sell beat",
        "license",
        "storefront",
      ],
    },
    {
      feature: "socialMedia",
      triggers: [
        "social",
        "autopilot",
        "instagram",
        "tiktok",
        "twitter",
        "content",
        "post",
        "caption",
      ],
    },
    {
      feature: "analytics",
      triggers: [
        "analytics",
        "stats",
        "dashboard",
        "insight",
        "stream count",
        "listener",
      ],
    },
    {
      feature: "videoGenerator",
      triggers: ["video", "music video", "visual", "cinematic", "reel"],
    },
    {
      feature: "careerTools",
      triggers: [
        "career",
        "epk",
        "press kit",
        "sync",
        "tour",
        "radio",
        "contract",
        "songwrit",
      ],
    },
    {
      feature: "aiTechnology",
      triggers: [
        "ai",
        "artificial intelligence",
        "max booster",
        "in-house",
        "proprietary",
      ],
    },
  ];

  for (const { feature, triggers } of featureMap) {
    if (triggers.some((t) => lower.includes(t))) {
      return {
        isMaxBoosterTopic: true,
        relevantFeature: feature,
        keywords: triggers.filter((t) => lower.includes(t)),
      };
    }
  }

  return { isMaxBoosterTopic: false, keywords: [] };
}

// ============================================================================
// TYPES AND INTERFACES
// ============================================================================

export interface AdvancedContentRequest {
  userId: string;
  topic?: string;
  platforms: string[];
  objective: "awareness" | "engagement" | "conversions" | "viral";
  tone?:
    | "professional"
    | "casual"
    | "energetic"
    | "inspirational"
    | "humorous"
    | "storytelling";
  targetAudience?: string;
  genre?: string;
  artistName?: string;
  contentType?:
    | "announcement"
    | "behind_scenes"
    | "engagement"
    | "promotional"
    | "storytelling";
  includeHashtags?: boolean;
  includeEmojis?: boolean;
  variantCount?: number;
  // Self-Evolution content_optimization knobs, surfaced from a real detected
  // industry change via evolutionRegistry.getContentOptimization(). When set
  // they reshape the hashtags / caption length / call-to-action of the output.
  hashtagStrategy?: "trending" | "niche" | "branded" | "balanced";
  captionLength?: "short" | "optimal" | "long";
  callToActionStrength?: "low" | "medium" | "high";
  trendContext?: string[];
  competitorContext?: string[];
  storefrontUrl?: string;
  beatContext?: string;
  promotionContext?: string;
}

/**
 * Affinity between a self-evolution posting_optimization `contentFormatPriority`
 * media format and this service's contentType enum. When a real detected change
 * prioritizes a media format, a direct/manual/scheduled generation request that
 * did NOT pin a contentType is biased toward the matching content type — the
 * same "bias toward the prioritized format" idea the autopilot engine applies
 * over its configured content types.
 */
const CONTENT_FORMAT_TO_TYPE: Record<
  string,
  NonNullable<AdvancedContentRequest["contentType"]>
> = {
  video: "behind_scenes",
  reel: "behind_scenes",
  story: "behind_scenes",
  carousel: "storytelling",
  image: "announcement",
  text: "engagement",
};

export interface AdvancedGeneratedContent {
  primary: {
    headline: string;
    body: string;
    hook: string;
    callToAction: string;
    hashtags: string[];
    emojis: string[];
  };
  platformVersions: Map<string, PlatformOptimizedContent>;
  variants: ContentVariant[];
  scoring: ContentScoring;
  insights: ContentInsight[];
  optimalTiming: OptimalTiming;
  mediaGuidance: MediaGuidance;
  viralPotential: ViralAnalysis;
  audienceResonance: AudienceResonance;
}

export interface PlatformOptimizedContent {
  platform: string;
  content: string;
  hashtags: string[];
  characterCount: number;
  isValid: boolean;
  optimizations: string[];
}

export interface ContentVariant {
  id: string;
  type: "concise" | "question" | "urgent" | "storytelling" | "data-driven";
  content: string;
  headline: string;
  hook: string;
  cta: string;
  hashtags: string[];
  predictedScore: number;
  differentiator: string;
  targetedAudience?: string;
}

export interface ContentScoring {
  overall: number;
  engagement: number;
  virality: number;
  clarity: number;
  sentiment: number;
  brandAlignment: number;
  hookStrength: number;
  ctaEffectiveness: number;
  platformOptimization: number;
  audienceRelevance: number;
  trendAlignment: number;
  originality: number;
}

export interface ContentInsight {
  type: "improvement" | "warning" | "success" | "tip";
  category:
    | "hook"
    | "cta"
    | "hashtag"
    | "length"
    | "tone"
    | "timing"
    | "audience";
  message: string;
  impact: "high" | "medium" | "low";
  actionable: boolean;
}

export interface OptimalTiming {
  bestDays: number[];
  bestHours: number[];
  timezone: string;
  confidence: number;
  reasoning: string;
  audienceBased: boolean;
}

export interface MediaGuidance {
  recommendedType: "image" | "video" | "carousel" | "text" | "live";
  specifications: {
    aspectRatio?: string;
    duration?: string;
    slideCount?: number;
  };
  styleNotes: string[];
  exampleDescriptions: string[];
}

export interface ViralAnalysis {
  score: number;
  factors: ViralFactor[];
  patterns: string[];
  recommendations: string[];
}

export interface ViralFactor {
  name: string;
  present: boolean;
  impact: number;
  suggestion?: string;
}

export interface AudienceResonance {
  primarySegment: string;
  secondarySegments: string[];
  resonanceScore: number;
  psychographicMatch: number;
  demographicMatch: number;
  behavioralMatch: number;
}

// ============================================================================
// KNOWLEDGE BASES (GPT-5.2 LEVEL)
// ============================================================================

const PLATFORM_PROFILES: Record<string, PlatformProfile> = {
  twitter: {
    id: "twitter",
    name: "Twitter/X",
    maxChars: 280,
    hashtagRange: { min: 1, max: 3 },
    emojiRange: { min: 0, max: 2 },
    peakHours: [8, 12, 17, 21],
    bestDays: [1, 2, 3, 4],
    hookWeight: 0.9,
    ctaWeight: 0.6,
    hashtagWeight: 0.15,
    viralMultiplier: 0.85,
    audienceDemo: { minAge: 18, maxAge: 49 },
    contentTypes: ["text", "image", "video", "poll", "thread"],
    tonePreference: 0.4,
  },
  instagram: {
    id: "instagram",
    name: "Instagram",
    maxChars: 2200,
    hashtagRange: { min: 5, max: 15 },
    emojiRange: { min: 2, max: 5 },
    peakHours: [11, 13, 19, 21],
    bestDays: [3, 4, 5, 6],
    hookWeight: 0.7,
    ctaWeight: 0.8,
    hashtagWeight: 0.35,
    viralMultiplier: 0.75,
    audienceDemo: { minAge: 18, maxAge: 34 },
    contentTypes: ["image", "carousel", "reel", "story", "live"],
    tonePreference: 0.3,
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    maxChars: 2200,
    hashtagRange: { min: 3, max: 5 },
    emojiRange: { min: 1, max: 3 },
    peakHours: [12, 15, 19, 22],
    bestDays: [4, 5, 6, 0],
    hookWeight: 0.95,
    ctaWeight: 0.5,
    hashtagWeight: 0.4,
    viralMultiplier: 0.95,
    audienceDemo: { minAge: 16, maxAge: 30 },
    contentTypes: ["video", "duet", "stitch", "live"],
    tonePreference: 0.2,
  },
  facebook: {
    id: "facebook",
    name: "Facebook",
    maxChars: 63206,
    hashtagRange: { min: 1, max: 3 },
    emojiRange: { min: 1, max: 3 },
    peakHours: [9, 13, 16, 20],
    bestDays: [3, 4, 5],
    hookWeight: 0.6,
    ctaWeight: 0.7,
    hashtagWeight: 0.1,
    viralMultiplier: 0.6,
    audienceDemo: { minAge: 25, maxAge: 54 },
    contentTypes: ["text", "image", "video", "link", "event", "live"],
    tonePreference: 0.5,
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    maxChars: 3000,
    hashtagRange: { min: 3, max: 5 },
    emojiRange: { min: 0, max: 2 },
    peakHours: [7, 10, 12, 17],
    bestDays: [1, 2, 3, 4],
    hookWeight: 0.8,
    ctaWeight: 0.7,
    hashtagWeight: 0.25,
    viralMultiplier: 0.5,
    audienceDemo: { minAge: 25, maxAge: 55 },
    contentTypes: ["text", "image", "video", "article", "poll", "document"],
    tonePreference: 0.8,
  },
  youtube: {
    id: "youtube",
    name: "YouTube",
    maxChars: 5000,
    hashtagRange: { min: 3, max: 15 },
    emojiRange: { min: 1, max: 3 },
    peakHours: [14, 17, 20, 22],
    bestDays: [4, 5, 6, 0],
    hookWeight: 0.95,
    ctaWeight: 0.9,
    hashtagWeight: 0.2,
    viralMultiplier: 0.7,
    audienceDemo: { minAge: 18, maxAge: 44 },
    contentTypes: ["video", "short", "live", "community"],
    tonePreference: 0.4,
  },
};

interface PlatformProfile {
  id: string;
  name: string;
  maxChars: number;
  hashtagRange: { min: number; max: number };
  emojiRange: { min: number; max: number };
  peakHours: number[];
  bestDays: number[];
  hookWeight: number;
  ctaWeight: number;
  hashtagWeight: number;
  viralMultiplier: number;
  audienceDemo: { minAge: number; maxAge: number };
  contentTypes: string[];
  tonePreference: number;
}

const TONE_PROFILES: Record<string, ToneProfile> = {
  professional: {
    formality: 0.8,
    energy: 0.5,
    emotionality: 0.3,
    humor: 0.1,
    authority: 0.8,
    vocabulary: [
      "announce",
      "introducing",
      "excited to share",
      "proud to present",
      "pleased",
    ],
    avoidWords: ["lol", "omg", "bruh", "lowkey", "fr fr", "ngl"],
    emojiStyle: "minimal",
  },
  casual: {
    formality: 0.3,
    energy: 0.7,
    emotionality: 0.6,
    humor: 0.5,
    authority: 0.3,
    vocabulary: [
      "hey",
      "check this out",
      "dropping",
      "vibes",
      "fire",
      "lit",
      "yo",
    ],
    avoidWords: ["hereby", "pursuant", "regarding", "aforementioned"],
    emojiStyle: "moderate",
  },
  energetic: {
    formality: 0.2,
    energy: 0.95,
    emotionality: 0.8,
    humor: 0.4,
    authority: 0.4,
    vocabulary: [
      "LET'S GO",
      "HUGE",
      "INSANE",
      "MASSIVE",
      "can't wait",
      "so hyped",
      "FINALLY",
    ],
    avoidWords: ["perhaps", "quite", "rather", "somewhat", "arguably"],
    emojiStyle: "heavy",
  },
  inspirational: {
    formality: 0.5,
    energy: 0.7,
    emotionality: 0.9,
    humor: 0.2,
    authority: 0.6,
    vocabulary: [
      "dream",
      "journey",
      "believe",
      "achieve",
      "passion",
      "purpose",
      "grateful",
      "blessed",
    ],
    avoidWords: ["boring", "meh", "whatever", "impossible", "can't"],
    emojiStyle: "moderate",
  },
  humorous: {
    formality: 0.1,
    energy: 0.8,
    emotionality: 0.7,
    humor: 0.95,
    authority: 0.2,
    vocabulary: [
      "ngl",
      "fr fr",
      "lowkey",
      "deadass",
      "no cap",
      "sheesh",
      "bruh",
    ],
    avoidWords: ["sincerely", "formally", "professionally", "concerning"],
    emojiStyle: "heavy",
  },
  storytelling: {
    formality: 0.4,
    energy: 0.5,
    emotionality: 0.85,
    humor: 0.3,
    authority: 0.5,
    vocabulary: [
      "let me tell you",
      "here's the story",
      "back when",
      "that moment when",
      "the journey",
    ],
    avoidWords: ["fyi", "btw", "tldr", "imo"],
    emojiStyle: "light",
  },
};

interface ToneProfile {
  formality: number;
  energy: number;
  emotionality: number;
  humor: number;
  authority: number;
  vocabulary: string[];
  avoidWords: string[];
  emojiStyle: "minimal" | "light" | "moderate" | "heavy";
}

const AUDIENCE_PROFILES: Record<string, AudienceProfile> = {
  gen_z_music_fans: {
    name: "Gen Z Music Fans",
    ageRange: { min: 16, max: 26 },
    interests: ["music", "concerts", "streaming", "tiktok", "gaming", "memes"],
    preferredTone: 0.2,
    preferredLength: "short",
    visualPreference: 0.9,
    interactivity: 0.8,
    peakDays: [4, 5, 6],
    peakHours: [15, 18, 21, 23],
    responseRate: 0.12,
    values: ["authenticity", "creativity", "social-justice", "sustainability"],
    motivations: [
      "self-expression",
      "connection",
      "entertainment",
      "discovery",
    ],
  },
  millennial_producers: {
    name: "Millennial Producers",
    ageRange: { min: 27, max: 42 },
    interests: [
      "production",
      "daw",
      "synthesizers",
      "mixing",
      "industry",
      "gear",
    ],
    preferredTone: 0.5,
    preferredLength: "medium",
    visualPreference: 0.7,
    interactivity: 0.6,
    peakDays: [1, 2, 3, 4],
    peakHours: [10, 14, 20, 22],
    responseRate: 0.08,
    values: ["craftsmanship", "innovation", "community", "growth"],
    motivations: ["skill-development", "networking", "recognition", "income"],
  },
  indie_artists: {
    name: "Independent Artists",
    ageRange: { min: 20, max: 35 },
    interests: [
      "music-creation",
      "distribution",
      "marketing",
      "live-shows",
      "collaboration",
    ],
    preferredTone: 0.4,
    preferredLength: "medium",
    visualPreference: 0.8,
    interactivity: 0.7,
    peakDays: [3, 4, 5, 6],
    peakHours: [12, 18, 21],
    responseRate: 0.15,
    values: [
      "independence",
      "artistry",
      "authenticity",
      "direct-fan-connection",
    ],
    motivations: ["exposure", "monetization", "creative-freedom", "fan-growth"],
  },
  casual_listeners: {
    name: "Casual Music Listeners",
    ageRange: { min: 18, max: 45 },
    interests: ["playlists", "discovery", "concerts", "lifestyle", "streaming"],
    preferredTone: 0.3,
    preferredLength: "short",
    visualPreference: 0.7,
    interactivity: 0.5,
    peakDays: [5, 6, 0],
    peakHours: [12, 18, 21],
    responseRate: 0.03,
    values: ["entertainment", "convenience", "mood-enhancement"],
    motivations: ["background-music", "event-discovery", "social-sharing"],
  },
};

interface AudienceProfile {
  name: string;
  ageRange: { min: number; max: number };
  interests: string[];
  preferredTone: number;
  preferredLength: "short" | "medium" | "long";
  visualPreference: number;
  interactivity: number;
  peakDays: number[];
  peakHours: number[];
  responseRate: number;
  values: string[];
  motivations: string[];
}

const VIRAL_PATTERNS = [
  {
    id: "controversy",
    name: "Controversial Take",
    triggers: [
      "unpopular opinion",
      "hot take",
      "controversial",
      "i said what i said",
      "real talk",
      "fight me",
    ],
    emotionalHooks: ["surprise", "disagreement", "validation"],
    shareMultiplier: 1.8,
    riskLevel: 0.6,
  },
  {
    id: "relatable",
    name: "Relatable Moment",
    triggers: [
      "pov",
      "me when",
      "that feeling",
      "who else",
      "y'all ever",
      "can we talk about",
      "not me",
    ],
    emotionalHooks: ["recognition", "humor", "connection"],
    shareMultiplier: 1.5,
    riskLevel: 0.1,
  },
  {
    id: "transformation",
    name: "Transformation Story",
    triggers: [
      "from",
      "to",
      "before",
      "after",
      "glow up",
      "journey",
      "i used to",
      "look at me now",
    ],
    emotionalHooks: ["inspiration", "hope", "motivation"],
    shareMultiplier: 1.4,
    riskLevel: 0.05,
  },
  {
    id: "exclusive",
    name: "Exclusive Access",
    triggers: [
      "behind the scenes",
      "exclusive",
      "first look",
      "sneak peek",
      "unreleased",
      "you don't usually see",
    ],
    emotionalHooks: ["curiosity", "fomo", "connection"],
    shareMultiplier: 1.3,
    riskLevel: 0.1,
  },
  {
    id: "challenge",
    name: "Challenge/CTA",
    triggers: [
      "challenge",
      "can you",
      "tag someone",
      "duet this",
      "stitch this",
      "rate this",
      "react to this",
    ],
    emotionalHooks: ["competition", "belonging", "excitement"],
    shareMultiplier: 1.6,
    riskLevel: 0.1,
  },
  {
    id: "breaking",
    name: "Breaking News",
    triggers: [
      "breaking",
      "just in",
      "announcement",
      "happening now",
      "official",
      "just announced",
    ],
    emotionalHooks: ["urgency", "fomo", "importance"],
    shareMultiplier: 1.7,
    riskLevel: 0.2,
  },
  {
    id: "milestone",
    name: "Milestone Celebration",
    triggers: [
      "streams",
      "million",
      "chart",
      "playlist",
      "milestone",
      "certified",
      "platinum",
      "gold",
    ],
    emotionalHooks: ["celebration", "pride", "community"],
    shareMultiplier: 1.45,
    riskLevel: 0.05,
  },
  {
    id: "vulnerability",
    name: "Vulnerable Moment",
    triggers: [
      "i almost quit",
      "didn't think",
      "almost gave up",
      "darkest",
      "struggled",
      "therapy",
      "real with you",
    ],
    emotionalHooks: ["empathy", "connection", "inspiration"],
    shareMultiplier: 1.65,
    riskLevel: 0.15,
  },
  {
    id: "discovery",
    name: "Discovery Hook",
    triggers: [
      "just found",
      "you need to hear",
      "your playlist is missing",
      "sleeping on",
      "hidden gem",
    ],
    emotionalHooks: ["curiosity", "discovery", "fomo"],
    shareMultiplier: 1.5,
    riskLevel: 0.05,
  },
  {
    id: "industry_truth",
    name: "Industry Truth",
    triggers: [
      "nobody tells you",
      "music industry",
      "label",
      "streams pay",
      "independent artist",
      "the truth about",
    ],
    emotionalHooks: ["validation", "anger", "empowerment"],
    shareMultiplier: 1.75,
    riskLevel: 0.3,
  },
  {
    id: "process_reveal",
    name: "Process Reveal",
    triggers: [
      "made this in",
      "studio session",
      "how i made",
      "from scratch",
      "making of",
      "producer cam",
    ],
    emotionalHooks: ["curiosity", "admiration", "inspiration"],
    shareMultiplier: 1.35,
    riskLevel: 0.05,
  },
  {
    id: "replay_bait",
    name: "Replay Value Signal",
    triggers: [
      "can't stop",
      "on repeat",
      "replay",
      "no skips",
      "earworm",
      "stuck in my head",
      "goosebumps",
    ],
    emotionalHooks: ["curiosity", "fomo", "social_proof"],
    shareMultiplier: 1.55,
    riskLevel: 0.05,
  },
  {
    id: "community_love",
    name: "Community Appreciation",
    triggers: [
      "thank you",
      "because of you",
      "this community",
      "my supporters",
      "day ones",
      "real ones",
    ],
    emotionalHooks: ["gratitude", "belonging", "pride"],
    shareMultiplier: 1.3,
    riskLevel: 0.0,
  },
  {
    id: "curiosity_gap",
    name: "Curiosity Gap",
    triggers: [
      "wait till you hear",
      "nobody expected",
      "you won't believe",
      "i almost",
      "something happened",
      "crazy story",
    ],
    emotionalHooks: ["curiosity", "anticipation", "surprise"],
    shareMultiplier: 1.72,
    riskLevel: 0.15,
  },
];

const SEMANTIC_WORD_WEIGHTS: Record<
  string,
  { engagement: number; virality: number; sentiment: number }
> = {
  new: { engagement: 0.7, virality: 0.6, sentiment: 0.7 },
  exclusive: { engagement: 0.85, virality: 0.75, sentiment: 0.8 },
  breaking: { engagement: 0.9, virality: 0.9, sentiment: 0.6 },
  finally: { engagement: 0.8, virality: 0.7, sentiment: 0.8 },
  amazing: { engagement: 0.75, virality: 0.65, sentiment: 0.95 },
  insane: { engagement: 0.85, virality: 0.8, sentiment: 0.85 },
  fire: { engagement: 0.9, virality: 0.85, sentiment: 0.9 },
  drop: { engagement: 0.8, virality: 0.75, sentiment: 0.7 },
  stream: { engagement: 0.7, virality: 0.5, sentiment: 0.6 },
  listen: { engagement: 0.65, virality: 0.45, sentiment: 0.65 },
  love: { engagement: 0.85, virality: 0.7, sentiment: 0.95 },
  viral: { engagement: 0.9, virality: 1.0, sentiment: 0.7 },
  trending: { engagement: 0.85, virality: 0.9, sentiment: 0.7 },
  limited: { engagement: 0.75, virality: 0.65, sentiment: 0.6 },
  free: { engagement: 0.9, virality: 0.75, sentiment: 0.85 },
  win: { engagement: 0.9, virality: 0.8, sentiment: 0.9 },
  giveaway: { engagement: 0.95, virality: 0.85, sentiment: 0.85 },
  secret: { engagement: 0.85, virality: 0.8, sentiment: 0.6 },
  reveal: { engagement: 0.8, virality: 0.75, sentiment: 0.7 },
  collab: { engagement: 0.8, virality: 0.7, sentiment: 0.75 },
  banger: { engagement: 0.9, virality: 0.85, sentiment: 0.9 },
  heat: { engagement: 0.85, virality: 0.8, sentiment: 0.85 },
  slaps: { engagement: 0.88, virality: 0.82, sentiment: 0.88 },
  dope: { engagement: 0.82, virality: 0.76, sentiment: 0.85 },
  legendary: { engagement: 0.87, virality: 0.82, sentiment: 0.92 },
  iconic: { engagement: 0.86, virality: 0.81, sentiment: 0.9 },
  goated: { engagement: 0.88, virality: 0.84, sentiment: 0.92 },
  authentic: { engagement: 0.78, virality: 0.68, sentiment: 0.88 },
  real: { engagement: 0.72, virality: 0.65, sentiment: 0.82 },
  honest: { engagement: 0.75, virality: 0.67, sentiment: 0.85 },
  vulnerable: { engagement: 0.82, virality: 0.76, sentiment: 0.88 },
  emotional: { engagement: 0.83, virality: 0.77, sentiment: 0.82 },
  milestone: { engagement: 0.78, virality: 0.72, sentiment: 0.8 },
  charted: { engagement: 0.82, virality: 0.78, sentiment: 0.82 },
  playlisted: { engagement: 0.79, virality: 0.74, sentiment: 0.8 },
  debut: { engagement: 0.77, virality: 0.7, sentiment: 0.78 },
  unreleased: { engagement: 0.86, virality: 0.82, sentiment: 0.75 },
  acoustic: { engagement: 0.72, virality: 0.62, sentiment: 0.82 },
  studio: { engagement: 0.71, virality: 0.6, sentiment: 0.72 },
  recording: { engagement: 0.7, virality: 0.58, sentiment: 0.7 },
  session: { engagement: 0.68, virality: 0.6, sentiment: 0.7 },
  beat: { engagement: 0.76, virality: 0.72, sentiment: 0.75 },
  bars: { engagement: 0.8, virality: 0.75, sentiment: 0.8 },
  hook: { engagement: 0.75, virality: 0.7, sentiment: 0.75 },
  chorus: { engagement: 0.72, virality: 0.66, sentiment: 0.76 },
  movement: { engagement: 0.8, virality: 0.78, sentiment: 0.82 },
  journey: { engagement: 0.75, virality: 0.68, sentiment: 0.82 },
  story: { engagement: 0.77, virality: 0.7, sentiment: 0.82 },
  chapter: { engagement: 0.72, virality: 0.64, sentiment: 0.78 },
  raw: { engagement: 0.78, virality: 0.72, sentiment: 0.78 },
  powerful: { engagement: 0.8, virality: 0.73, sentiment: 0.88 },
  massive: { engagement: 0.83, virality: 0.78, sentiment: 0.82 },
  crazy: { engagement: 0.82, virality: 0.78, sentiment: 0.8 },
  wild: { engagement: 0.8, virality: 0.76, sentiment: 0.78 },
  epic: { engagement: 0.83, virality: 0.79, sentiment: 0.88 },
  playlist: { engagement: 0.75, virality: 0.68, sentiment: 0.72 },
  spotify: { engagement: 0.72, virality: 0.64, sentiment: 0.7 },
  certified: { engagement: 0.78, virality: 0.73, sentiment: 0.78 },
  gold: { engagement: 0.82, virality: 0.76, sentiment: 0.84 },
  platinum: { engagement: 0.86, virality: 0.82, sentiment: 0.88 },
  independent: { engagement: 0.74, virality: 0.68, sentiment: 0.8 },
  unsigned: { engagement: 0.72, virality: 0.66, sentiment: 0.78 },
  underrated: { engagement: 0.8, virality: 0.76, sentiment: 0.75 },
  replay: { engagement: 0.82, virality: 0.78, sentiment: 0.82 },
  earworm: { engagement: 0.83, virality: 0.8, sentiment: 0.82 },
  chills: { engagement: 0.85, virality: 0.79, sentiment: 0.88 },
  goosebumps: { engagement: 0.86, virality: 0.8, sentiment: 0.88 },
  therapy: { engagement: 0.82, virality: 0.76, sentiment: 0.88 },
  healing: { engagement: 0.8, virality: 0.74, sentiment: 0.9 },
  breakthrough: { engagement: 0.82, virality: 0.76, sentiment: 0.84 },
};

// ============================================================================
// ADVANCED AI CONSTANTS — ROUND 2 UPGRADES
// ============================================================================

// ─── PLATFORM-NATIVE DNA ───────────────────────────────────────────────────────
// Each platform has distinct language patterns. Native-feeling content outperforms
// generic content by 2-3x in both reach and engagement across all platforms.

// ─── SELF-IDENTIFICATION PHRASES ───────────────────────────────────────────────
// Phrases that make the reader project themselves into the content.
// Research: self-identification phrases increase comment rate by 40-60% and shares by 25%.

// ─── EMOTIONAL ARC TEMPLATES ───────────────────────────────────────────────────
// Each content type has an optimal emotional arc structure.
// Scientifically, content following Hook → Context → Tension → Resolution → CTA
// outperforms flat content by 2.8x in average watch/read time.

// ─── CURIOSITY GAP PATTERNS ───────────────────────────────────────────────────
// Specific linguistic constructions that create information gaps — forcing
// the viewer to complete the content to resolve the gap. Curiosity gap hooks
// consistently outperform standard hooks by 30-50% in click-through rate.

// ============================================================================
// MAIN SERVICE CLASS
// ============================================================================

class AdvancedSocialAIService {
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    logger.info(
      "[AdvancedSocialAI] GPT-5.2 level social AI engine initialized",
    );
  }

  // ── In-memory content cache ────────────────────────────────────────────────
  // Prevents redundant computation when the same topic+platform+tone combination
  // is requested within a short window (e.g. autopilot batch, retries).
  // TTL: 90 seconds. Max entries: 200 (LRU-lite: evict oldest when full).
  private static _contentCache = new Map<
    string,
    { ts: number; result: AdvancedGeneratedContent }
  >();
  private static readonly _CACHE_TTL_MS = 90_000;
  private static readonly _CACHE_MAX = 200;

  private static cacheKey(r: AdvancedContentRequest): string {
    return [
      r.userId || "anon",
      (r.platforms || []).join(","),
      r.topic || "",
      r.tone || "",
      r.genre || "",
      r.contentType || "",
      r.objective || "",
      r.artistName || "",
      r.storefrontUrl || "",
      r.beatContext || "",
      r.promotionContext || "",
    ].join("|");
  }

  /**
   * Surface the Self-Evolution posting_optimization knobs (derived from a real
   * detected industry change) into ANY generation request — manual, scheduled,
   * or the service called directly — the same way the autopilot engine does, so
   * the AI's format/engagement guidance is consistent everywhere. Sits ABOVE the
   * caller's defaults and is fully reversible (deactivateAll() reverts it).
   * Per-artist learned data is never touched here.
   *
   *  - engagementTargeting==='high' steers the objective toward 'engagement'
   *    (mirrors autopilot-engine.generateContentForAutopilot, which overrides the
   *    goal-derived objective unconditionally).
   *  - contentFormatPriority biases contentType toward the prioritized media
   *    format, but ONLY when the caller did not pin a contentType — an explicit
   *    caller choice always wins.
   */
  private applyPostingOptimization(
    request: AdvancedContentRequest,
  ): AdvancedContentRequest {
    try {
      const platform = request.platforms[0].toLowerCase();
      const posting = platform
        ? evolutionRegistry.getPostingOptimization(platform)
        : null;
      if (!posting) return request;

      const patch: Partial<AdvancedContentRequest> = {};

      if (
        posting.engagementTargeting === "high" &&
        request.objective !== "engagement"
      ) {
        patch.objective = "engagement";
      }

      if (
        !request.contentType &&
        Array.isArray(posting.contentFormatPriority)
      ) {
        for (const fmt of posting.contentFormatPriority) {
          const mapped =
            typeof fmt === "string"
              ? CONTENT_FORMAT_TO_TYPE[fmt.toLowerCase()]
              : undefined;
          if (mapped) {
            patch.contentType = mapped;
            break;
          }
        }
      }

      if (Object.keys(patch).length === 0) return request;
      logger.info(
        `[AdvancedSocialAI] Applied self-evolution posting_optimization for ${platform}: ` +
          `${Object.keys(patch).join(", ")}`,
      );
      return { ...request, ...patch };
    } catch (err) {
      logger.warn(
        { err },
        "[AdvancedSocialAI] Failed to apply evolution posting_optimization",
      );
      return request;
    }
  }

  async generateAdvancedContent(
    rawRequest: AdvancedContentRequest,
  ): Promise<AdvancedGeneratedContent> {
    // Surface the Self-Evolution posting_optimization guidance into this request
    // before anything else (cache key, MaxCore hints, post-processing) so the
    // override is honored on manual / scheduled / direct paths, not just autopilot.
    const request = this.applyPostingOptimization(rawRequest);
    const cacheKey = AdvancedSocialAIService.cacheKey(request);
    const cached = AdvancedSocialAIService._contentCache.get(cacheKey);
    if (
      cached &&
      Date.now() - cached.ts < AdvancedSocialAIService._CACHE_TTL_MS
    ) {
      logger.info(
        `[AdvancedSocialAI] Cache hit for key=${cacheKey.slice(0, 60)}`,
      );
      return cached.result;
    }

    await this.initialize();

    const userContext = await this.getUserContext(request.userId);
    const primaryPlatform =
      PLATFORM_PROFILES[request.platforms[0].toLowerCase()] ||
      PLATFORM_PROFILES.instagram;
    const tone =
      TONE_PROFILES[request.tone || "casual"] || TONE_PROFILES.casual;
    const audience =
      AUDIENCE_PROFILES[
        request.targetAudience.toLowerCase().replace(/\s+/g, "_") ||
          "indie_artists"
      ] || AUDIENCE_PROFILES.indie_artists;

    // ── 8TB dataset via MaxCore is the ONLY text source ─────────────────────
    const mc = await MaxCoreAIClient.infer<unknown>("/api/generate/content", {
      platform: request.platforms[0] || "instagram",
      topic: request.topic || "new music",
      tone: request.tone || "energetic",
      genre: request.genre || userContext.genre,
      artist_name: request.artistName || userContext.artistName,
      brand_voice: userContext.brandVoice,
      target_audience: request.targetAudience,
      storefront_url: request.storefrontUrl,
      beat_context: request.beatContext,
      promotion_context: request.promotionContext,
      // Self-Evolution content_optimization knobs forwarded so MaxCore can bias
      // generation; we ALSO post-process below so the knob is guaranteed to take
      // effect even if MaxCore ignores these hints.
      hashtag_strategy: request.hashtagStrategy,
      caption_length: request.captionLength,
      cta_strength: request.callToActionStrength,
    });

    if (!mc.hook && !mc.caption) {
      // MaxCore returned null — either the endpoint is suppressed after a burst
      // exhausted all retries (rate-limit / 503 / timeout) or the response shape
      // didn't carry the expected hook/caption fields.  Throw so the caller's
      // Tier-3 local pattern fallback can take over immediately.
      throw new Error(
        "[AdvancedSocialAI] MaxCore infer returned null — rate-limited or response shape mismatch",
      );
    }

    const hook = mc.hook || "";
    const bodyText = mc.body || "";
    // Apply the call-to-action strength knob BEFORE appending the storefront URL
    // so the strengthened/softened CTA still carries the link.
    const baseCta = this.applyCtaStrength(
      mc.cta || "",
      request.callToActionStrength,
    );

    // Append storefront URL to the CTA so every autopilot post links back to the
    // storefront — critical for driving traffic during the temp slug-URL period.
    const cta =
      request.storefrontUrl && !baseCta.includes(request.storefrontUrl)
        ? `${baseCta}\n🔗 ${request.storefrontUrl}`.trim()
        : baseCta;

    const rawHashtags: string[] = Array.isArray(mc.hashtags) ? mc.hashtags : [];
    const hashtags = this.applyHashtagStrategy(
      rawHashtags,
      request.hashtagStrategy,
      primaryPlatform,
    );
    const emojis = this.selectEmojis(request, primaryPlatform, tone);
    const rawContent =
      mc.caption || [hook, bodyText, cta].filter(Boolean).join("\n\n");
    const fullContent = this.applyCaptionLength(
      rawContent,
      request.captionLength,
    );

    const platformVersions = this.generatePlatformVersions(
      request,
      hook,
      bodyText,
      cta,
      hashtags,
    );
    const variants = this.generateVariants(
      request,
      hook,
      bodyText,
      cta,
      hashtags,
      tone,
    );
    const scoring = this.scoreContent(
      fullContent,
      primaryPlatform,
      tone,
      audience,
      request,
    );
    const insights = this.generateInsights(
      fullContent,
      scoring,
      primaryPlatform,
      request,
    );
    const optimalTiming = this.calculateOptimalTiming(
      request.platforms,
      audience,
    );
    const mediaGuidance = this.generateMediaGuidance(request, primaryPlatform);
    const viralPotential = this.analyzeViralPotential(fullContent, request);
    const audienceResonance = this.analyzeAudienceResonance(
      fullContent,
      audience,
      request,
    );

    logger.info(
      `[AdvancedSocialAI] MaxCore-sourced content for user ${request.userId}: score=${scoring.overall.toFixed(1)}`,
    );

    const result: AdvancedGeneratedContent = {
      primary: {
        headline: hook,
        body: fullContent,
        hook,
        callToAction: cta,
        hashtags,
        emojis,
      },
      platformVersions,
      variants,
      scoring,
      insights,
      optimalTiming,
      mediaGuidance,
      viralPotential,
      audienceResonance,
    };

    if (
      AdvancedSocialAIService._contentCache.size >=
      AdvancedSocialAIService._CACHE_MAX
    ) {
      const oldestKey = AdvancedSocialAIService._contentCache
        .keys()
        .next().value;
      if (oldestKey) AdvancedSocialAIService._contentCache.delete(oldestKey);
    }
    AdvancedSocialAIService._contentCache.set(cacheKey, {
      ts: Date.now(),
      result,
    });
    return result;
  }

  private async getUserContext(userId: string): Promise<unknown> {
    try {
      const [[brandVoice], [preferences]] = await Promise.all([
        db
          .select()
          .from(userBrandVoices)
          .where(eq(userBrandVoices.userId, userId))
          .limit(1),
        db
          .select()
          .from(autopilotPreferences)
          .where(eq(autopilotPreferences.userId, userId))
          .limit(1),
      ]);
      return {
        brandVoice: brandVoice.voiceProfile,
        artistName: preferences.artistName || "Artist",
        genre: preferences.genre,
        preferences,
      };
    } catch (error) {
      const msg = (error as Error).message ?? String(error);
      logger.warn(
        `[AdvancedSocialAI] Failed to load user context for ${userId}: ${msg}`,
      );
      throw error;
    }
  }






  /**
   * Reshape the hashtag set per the Self-Evolution `hashtagStrategy` knob.
   *  - niche   → fewer, more targeted tags (down to the platform minimum).
   *  - trending→ maximize reach: keep the full platform-allowed count.
   *  - branded → lead with branded/artist tags (those containing the topic/
   *    artist token), then fill with the rest, capped at the platform max.
   *  - balanced→ leave the MaxCore-provided set untouched.
   * Falls back to the original set when no strategy is set or there are no tags.
   */
  private applyHashtagStrategy(
    hashtags: string[],
    strategy: AdvancedContentRequest["hashtagStrategy"],
    platform: PlatformProfile,
  ): string[] {
    if (!strategy || !Array.isArray(hashtags) || hashtags.length === 0)
      return hashtags;
    const { min, max } = platform.hashtagRange;
    switch (strategy) {
      case "niche":
        return hashtags.slice(0, Math.max(min, Math.min(3, hashtags.length)));
      case "trending":
        return hashtags.slice(0, Math.max(max, min));
      case "branded": {
        const branded = hashtags.filter((h) =>
          /brand|official|artist|music/i.test(h),
        );
        const rest = hashtags.filter((h) => !branded.includes(h));
        return [...branded, ...rest].slice(0, max);
      }
      case "balanced":
      default:
        return hashtags;
    }
  }

  /**
   * Trim or preserve the caption per the Self-Evolution `captionLength` knob.
   *  - short  → cap at ~280 chars (single-glance caption).
   *  - optimal→ cap at ~600 chars (the default sweet spot).
   *  - long   → leave the full caption untouched.
   * Truncation is on a word boundary with an ellipsis; only ever shortens.
   */
  private applyCaptionLength(
    text: string,
    captionLength: AdvancedContentRequest["captionLength"],
  ): string {
    if (!text || !captionLength) return text;
    const caps: Record<
      NonNullable<AdvancedContentRequest["captionLength"]>,
      number
    > = {
      short: 280,
      optimal: 600,
      long: Number.POSITIVE_INFINITY,
    };
    const cap = caps[captionLength];
    if (!Number.isFinite(cap) || text.length <= cap) return text;
    const sliced = text.slice(0, cap - 1);
    const lastSpace = sliced.lastIndexOf(" ");
    return (
      (lastSpace > cap * 0.6 ? sliced.slice(0, lastSpace) : sliced).trimEnd() +
      "…"
    );
  }

  /**
   * Adjust the call-to-action emphasis per the Self-Evolution
   * `callToActionStrength` knob.
   *  - high → add urgency framing + an exclamation if missing.
   *  - low  → soften: strip trailing exclamations/emphatic punctuation.
   *  - medium→ leave the CTA as-is.
   * Returns the CTA unchanged when no strength is set or the CTA is empty.
   */
  private applyCtaStrength(
    cta: string,
    strength: AdvancedContentRequest["callToActionStrength"],
  ): string {
    if (!cta || !strength || strength === "medium") return cta;
    if (strength === "high") {
      const emphasized = /[!?]$/.test(cta.trim())
        ? cta.trim()
        : `${cta.trim()}!`;
      return /\b(now|today|don't miss|limited)\b/i?.test(emphasized)
        ? emphasized
        : `${emphasized} Don't miss out!`;
    }
    // low
    return cta
      .replace(/[!]+/g, ".")
      .replace(/\.\s*\.+/g, ".")
      .trim();
  }

  private selectEmojis(
    request: AdvancedContentRequest,
    platform: PlatformProfile,
    tone: ToneProfile,
  ): string[] {
    if (request.includeEmojis === false) return [];

    const emojiSets: Record<string, string[]> = {
      music: ["🎵", "🎶", "🎤", "🎧", "🎹", "🎸"],
      fire: ["🔥", "💥", "⚡", "✨", "💫"],
      engagement: ["👇", "💬", "❤️", "👀", "🙌"],
      celebration: ["🎉", "🥳", "💯", "🚀"],
      action: ["🔔", "📢", "🆕", "🔊"],
    };

    const targetCount = Math.floor(
      (platform.emojiRange.min + platform.emojiRange.max) / 2,
    );
    const selected: string[] = [];

    selected.push(...emojiSets.music.slice(0, 1));

    if (tone.energy > 0.7) {
      selected.push(...emojiSets.fire.slice(0, 1));
    }

    if (request.objective === "engagement") {
      selected.push(...emojiSets.engagement.slice(0, 1));
    }

    return [...new Set(selected)].slice(0, targetCount);
  }

  private generatePlatformVersions(
    request: AdvancedContentRequest,
    hook: string,
    body: string,
    cta: string,
    hashtags: string[],
  ): Map<string, PlatformOptimizedContent> {
    const versions = new Map<string, PlatformOptimizedContent>();

    for (const platformId of request.platforms) {
      const platform = PLATFORM_PROFILES[platformId.toLowerCase()];
      if (!platform) continue;

      let content = `${hook}\n\n${body}\n\n${cta}`;
      const platformHashtags = hashtags.slice(0, platform.hashtagRange.max);

      if (platformHashtags.length > 0) {
        content += "\n\n" + platformHashtags.join(" ");
      }

      const optimizations: string[] = [];
      let isValid = true;

      if (content.length > platform.maxChars) {
        const excess = content.length - platform.maxChars;
        content = content.substring(0, platform.maxChars - 3) + "...";
        optimizations.push(`Truncated ${excess} characters`);
        isValid = false;
      }

      if (platformHashtags.length < platform.hashtagRange.min) {
        optimizations.push(
          `Add ${platform.hashtagRange.min - platformHashtags.length} more hashtags`,
        );
      }

      versions.set(platformId, {
        platform: platform.name,
        content,
        hashtags: platformHashtags,
        characterCount: content.length,
        isValid,
        optimizations,
      });
    }

    return versions;
  }

  private generateVariants(
    request: AdvancedContentRequest,
    hook: string,
    body: string,
    cta: string,
    hashtags: string[],
    tone: ToneProfile,
  ): ContentVariant[] {
    const variants: ContentVariant[] = [];
    const count = request.variantCount || 3;

    variants.push({
      id: "variant_concise",
      type: "concise",
      content: `${hook}\n\n${cta}`,
      headline: hook,
      hook,
      cta,
      hashtags: hashtags.slice(0, 3),
      predictedScore: 72,
      differentiator:
        "Shorter, more direct approach for higher scroll-stopping",
    });

    variants.push({
      id: "variant_question",
      type: "question",
      content: `What do you think about this?\n\n${body}\n\n${cta}`,
      headline: "What do you think?",
      hook: "What do you think about this?",
      cta,
      hashtags,
      predictedScore: 80,
      differentiator: "Question-based hook drives 2x more comments",
    });

    variants.push({
      id: "variant_urgent",
      type: "urgent",
      content: `🚨 ${hook.replace(/^[🔥💥⚡🚀✨🎵🎶🚨]\s*/, "")}\n\n${body}\n\nDon't miss out! ${cta}`,
      headline: `🚨 ${hook}`,
      hook: `🚨 ${hook}`,
      cta: `Don't miss out! ${cta}`,
      hashtags,
      predictedScore: 75,
      differentiator: "Urgency-focused for time-sensitive promotions",
    });

    if (count > 3) {
      variants.push({
        id: "variant_story",
        type: "storytelling",
        content: `Let me tell you something...\n\n${body}\n\nThis is just the beginning. ${cta}`,
        headline: "Let me tell you something...",
        hook: "Let me tell you something...",
        cta: `This is just the beginning. ${cta}`,
        hashtags,
        predictedScore: 74,
        differentiator: "Storytelling approach for deeper engagement",
      });
    }

    if (count > 4) {
      variants.push({
        id: "variant_milestone",
        type: "milestone",
        content: `We made it. 🏆\n\n${body}\n\nThank you for being part of this journey. ${cta}`,
        headline: "We made it. 🏆",
        hook: "We made it. 🏆",
        cta: `Thank you for being part of this journey. ${cta}`,
        hashtags,
        predictedScore: 77,
        differentiator:
          "Milestone/community celebration — highest brand loyalty response",
      });
    }

    return variants.slice(0, count);
  }

  private scoreContent(
    content: string,
    platform: PlatformProfile,
    tone: ToneProfile,
    audience: AudienceProfile,
    request: AdvancedContentRequest,
  ): ContentScoring {
    const words = content.toLowerCase().split(/\s+/);

    let engagementSum = 0;
    let viralitySum = 0;
    let sentimentSum = 0;
    let wordCount = 0;

    words.forEach((word) => {
      const cleaned = word.replace(/[^a-z]/g, "");
      if (SEMANTIC_WORD_WEIGHTS[cleaned]) {
        engagementSum += SEMANTIC_WORD_WEIGHTS[cleaned].engagement;
        viralitySum += SEMANTIC_WORD_WEIGHTS[cleaned].virality;
        sentimentSum += SEMANTIC_WORD_WEIGHTS[cleaned].sentiment;
        wordCount++;
      }
    });

    const avgEngagement = wordCount > 0 ? engagementSum / wordCount : 0.5;
    const avgVirality = wordCount > 0 ? viralitySum / wordCount : 0.5;
    const avgSentiment = wordCount > 0 ? sentimentSum / wordCount : 0.5;

    const hookStrength = this.calculateHookStrength(content, platform);
    const ctaEffectiveness = this.calculateCTAEffectiveness(
      content,
      request.objective,
    );
    const platformOpt = this.calculatePlatformOptimization(content, platform);

    const engagement =
      (avgEngagement * 0.4 + hookStrength * 0.3 + ctaEffectiveness * 0.3) * 100;
    const virality = avgVirality * 100 * platform.viralMultiplier;
    const clarity = Math.max(40, 100 - words.length * 0.3);
    const sentiment = avgSentiment * 100;
    const brandAlignment = (1 - Math.abs(tone.formality - 0.5)) * 100;

    const audienceMatch =
      (1 - Math.abs(audience.preferredTone - tone.formality)) * 100;
    const trendAlignment = request.trendContext.length
      ? Math.min(95, 65 + request.trendContext.length * 5)
      : 50;
    const uniqueWords = new Set(words.map((w) => w.replace(/[^a-z]/g, "")))
      .size;
    const originality = Math.min(
      90,
      Math.max(60, 50 + (uniqueWords / Math.max(words.length, 1)) * 60),
    );

    const overall =
      engagement * 0.2 +
      virality * 0.15 +
      clarity * 0.1 +
      sentiment * 0.1 +
      brandAlignment * 0.1 +
      hookStrength * 100 * 0.1 +
      ctaEffectiveness * 100 * 0.1 +
      platformOpt * 100 * 0.05 +
      audienceMatch * 0.05 +
      originality * 0.05;

    return {
      overall: Math.min(100, Math.max(0, overall)),
      engagement: Math.min(100, Math.max(0, engagement)),
      virality: Math.min(100, Math.max(0, virality)),
      clarity: Math.min(100, Math.max(0, clarity)),
      sentiment: Math.min(100, Math.max(0, sentiment)),
      brandAlignment: Math.min(100, Math.max(0, brandAlignment)),
      hookStrength: Math.min(100, Math.max(0, hookStrength * 100)),
      ctaEffectiveness: Math.min(100, Math.max(0, ctaEffectiveness * 100)),
      platformOptimization: Math.min(100, Math.max(0, platformOpt * 100)),
      audienceRelevance: Math.min(100, Math.max(0, audienceMatch)),
      trendAlignment: Math.min(100, Math.max(0, trendAlignment)),
      originality: Math.min(100, Math.max(0, originality)),
    };
  }

  private calculateHookStrength(
    content: string,
    platform: PlatformProfile,
  ): number {
    const firstLine = content.split("\n")[0] || "";
    let strength = 0.5;

    if (/^[🔥💥⚡🚀✨🎵🎶🚨]/.test(firstLine)) strength += 0.15;
    if (/^[A-Z]{2,}/.test(firstLine)) strength += 0.1;
    if (firstLine.endsWith("?")) strength += 0.1;
    if (firstLine.length < 50) strength += 0.1;
    if (/(!|🔥)/.test(firstLine)) strength += 0.05;

    return Math.min(1, strength) * platform.hookWeight;
  }

  private calculateCTAEffectiveness(
    content: string,
    objective: string,
  ): number {
    const lowerContent = content.toLowerCase();
    let effectiveness = 0.3;

    const ctaPatterns = [
      { pattern: /link in bio/, boost: 0.15 },
      { pattern: /check it out/, boost: 0.1 },
      { pattern: /stream now|listen now/, boost: 0.12 },
      { pattern: /tap the link|click/, boost: 0.1 },
      { pattern: /share|comment|tag someone/, boost: 0.12 },
      { pattern: /follow|subscribe/, boost: 0.1 },
      { pattern: /save this/, boost: 0.1 },
      { pattern: /let me know|drop.*below/, boost: 0.1 },
      { pattern: /don't miss/, boost: 0.08 },
    ];

    ctaPatterns?.forEach(({ pattern, boost }) => {
      if (pattern.test(lowerContent)) effectiveness += boost;
    });

    const objectiveMultipliers: Record<string, number> = {
      conversions: 1.2,
      engagement: 1.1,
      viral: 0.9,
      awareness: 1.0,
    };

    return Math?.min(1, effectiveness * (objectiveMultipliers[objective] || 1));
  }

  private calculatePlatformOptimization(
    content: string,
    platform: PlatformProfile,
  ): number {
    let optimization = 0.5;

    if (content?.length <= platform?.maxChars) {
      optimization += 0.25;
    } else {
      optimization -= 0.3;
    }

    const hashtagCount = (content?.match(/#\w+/g) || []).length;
    if (
      hashtagCount >= platform?.hashtagRange.min &&
      hashtagCount <= platform?.hashtagRange.max
    ) {
      optimization += 0.15;
    }

    const emojiRegex =
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojiCount = (content?.match(emojiRegex) || []).length;
    if (
      emojiCount >= platform?.emojiRange.min &&
      emojiCount <= platform?.emojiRange.max
    ) {
      optimization += 0.1;
    }

    return Math?.min(1, Math?.max(0, optimization));
  }

  private generateInsights(
    content: string,
    scores: ContentScoring,
    platform: PlatformProfile,
    request: AdvancedContentRequest,
  ): ContentInsight[] {
    const insights: ContentInsight[] = [];

    if (scores?.hookStrength < 60) {
      insights?.push({
        type: "improvement",
        category: "hook",
        message:
          "Start with an emoji or question to grab attention in the first 3 seconds",
        impact: "high",
        actionable: true,
      });
    } else if (scores?.hookStrength > 80) {
      insights?.push({
        type: "success",
        category: "hook",
        message: "Strong opening hook - likely to stop scrollers",
        impact: "high",
        actionable: false,
      });
    }

    if (scores?.ctaEffectiveness < 50) {
      insights?.push({
        type: "improvement",
        category: "cta",
        message: "Add a clear call-to-action to guide audience behavior",
        impact: "high",
        actionable: true,
      });
    }

    if (content?.length > platform?.maxChars) {
      insights?.push({
        type: "warning",
        category: "length",
        message: `Content exceeds ${platform?.name}'s ${platform.maxChars} character limit`,
        impact: "high",
        actionable: true,
      });
    }

    if (scores.virality < 50 && request.objective === "viral") {
      insights.push({
        type: "tip",
        category: "tone",
        message:
          "Add emotional triggers or controversy to increase share potential",
        impact: "medium",
        actionable: true,
      });
    }

    if (scores.platformOptimization < 70) {
      insights.push({
        type: "tip",
        category: "hashtag",
        message: `Optimize hashtag count for ${platform.name} (${platform.hashtagRange.min}-${platform.hashtagRange.max} recommended)`,
        impact: "medium",
        actionable: true,
      });
    }

    if (scores.audienceRelevance < 60) {
      insights.push({
        type: "tip",
        category: "audience",
        message:
          "Consider adjusting tone to better match target audience preferences",
        impact: "medium",
        actionable: true,
      });
    }

    return insights;
  }

  private calculateOptimalTiming(
    platforms: string[],
    audience: AudienceProfile,
  ): OptimalTiming {
    const platformProfiles = platforms
      .map((p) => PLATFORM_PROFILES[p.toLowerCase()])
      .filter(Boolean);

    const allPeakHours = new Set<number>();
    const allBestDays = new Set<number>();

    platformProfiles.forEach((p) => {
      p.peakHours.forEach((h) => allPeakHours.add(h));
      p.bestDays.forEach((d) => allBestDays.add(d));
    });

    const overlappingHours = [...allPeakHours].filter((h) =>
      audience.peakHours.includes(h),
    );
    const overlappingDays = [...allBestDays].filter((d) =>
      audience.peakDays.includes(d),
    );

    const bestHours =
      overlappingHours.length > 0 ? overlappingHours : audience.peakHours;
    const bestDays =
      overlappingDays.length > 0 ? overlappingDays : audience.peakDays;

    return {
      bestDays,
      bestHours,
      timezone: "UTC",
      confidence: overlappingHours.length > 0 ? 0.85 : 0.65,
      reasoning: `Based on ${audience.name} activity patterns and ${platforms.join(", ")} peak hours`,
      audienceBased: true,
    };
  }

  private generateMediaGuidance(
    request: AdvancedContentRequest,
    platform: PlatformProfile,
  ): MediaGuidance {
    const guidance: MediaGuidance = {
      recommendedType: "image",
      specifications: {},
      styleNotes: [],
      exampleDescriptions: [],
    };

    if (
      platform.contentTypes.includes("video") ||
      platform.contentTypes.includes("reel")
    ) {
      if (platform.id === "tiktok" || platform.id === "instagram") {
        guidance.recommendedType = "video";
        guidance.specifications = {
          aspectRatio: "9:16",
          duration: "15-30 seconds",
        };
        guidance.styleNotes = [
          "Vertical format for mobile-first viewing",
          "Hook within first 3 seconds",
          "Text overlays for sound-off viewers",
          "Trending audio increases reach",
        ];
      }
    }

    if (request.contentType === "behind_scenes") {
      guidance.styleNotes.push(
        "Raw, authentic footage performs better than polished",
      );
      guidance.exampleDescriptions.push(
        "Studio recording session with visible equipment",
      );
    }

    if (request.contentType === "announcement") {
      guidance.styleNotes.push("Bold text overlay with release info");
      guidance.styleNotes.push("Artist/cover art as focal point");
      guidance.exampleDescriptions.push(
        "Album artwork with animated reveal effect",
      );
    }

    if (platform.contentTypes.includes("carousel")) {
      guidance.recommendedType = "carousel";
      guidance.specifications.slideCount = 5;
      guidance.styleNotes.push("First slide must grab attention");
      guidance.styleNotes.push("Last slide should contain CTA");
    }

    return guidance;
  }

  private analyzeViralPotential(
    content: string,
    request: AdvancedContentRequest,
  ): ViralAnalysis {
    const lowerContent = content.toLowerCase();
    const factors: ViralFactor[] = [];
    const patterns: string[] = [];
    let totalScore = 50;

    VIRAL_PATTERNS.forEach((pattern) => {
      const isPresent = pattern.triggers.some((trigger) =>
        lowerContent.includes(trigger),
      );
      factors.push({
        name: pattern.name,
        present: isPresent,
        impact: isPresent ? pattern.shareMultiplier * 20 : 0,
        suggestion: isPresent
          ? undefined
          : `Consider using: "${pattern.triggers[0]}"`,
      });
      if (isPresent) {
        patterns.push(pattern.id);
        totalScore += pattern.shareMultiplier * 10;
      }
    });

    if (content.includes("?")) {
      totalScore += 8;
      factors.push({ name: "Question Hook", present: true, impact: 8 });
    }
    if (/[A-Z]{3,}/.test(content)) {
      totalScore += 5;
      factors.push({ name: "Emphasis Caps", present: true, impact: 5 });
    }
    if (/🔥|💥|⚡/.test(content)) {
      totalScore += 5;
      factors.push({ name: "Viral Emojis", present: true, impact: 5 });
    }

    const recommendations: string[] = [];
    if (totalScore < 60) {
      recommendations.push("Add a question to drive comments");
      recommendations.push(
        "Use emotional triggers (excitement, controversy, relatability)",
      );
    }
    if (!patterns.includes("challenge")) {
      recommendations.push(
        "Consider adding a challenge or participation element",
      );
    }

    return {
      score: Math.min(100, Math.max(0, totalScore)),
      factors,
      patterns,
      recommendations,
    };
  }

  private analyzeAudienceResonance(
    content: string,
    audience: AudienceProfile,
    request: AdvancedContentRequest,
  ): AudienceResonance {
    const lowerContent = content.toLowerCase();

    const interestMatch =
      audience.interests.filter((interest) =>
        lowerContent.includes(interest.toLowerCase()),
      ).length / audience.interests.length;

    const valueMatch =
      audience.values.filter((value) =>
        lowerContent.includes(value.toLowerCase().replace(/-/g, " ")),
      ).length / audience.values.length;

    const lengthMatch = (() => {
      const wordCount = content.split(/\s+/).length;
      if (audience.preferredLength === "short" && wordCount < 30) return 1;
      if (
        audience.preferredLength === "medium" &&
        wordCount >= 30 &&
        wordCount < 80
      )
        return 1;
      if (audience.preferredLength === "long" && wordCount >= 80) return 1;
      return 0.5;
    })();

    const resonanceScore =
      (interestMatch * 0.4 + valueMatch * 0.3 + lengthMatch * 0.3) * 100;

    const secondarySegments = Object.entries(AUDIENCE_PROFILES)
      .filter(
        ([key]) =>
          key !== request.targetAudience.toLowerCase().replace(/\s+/g, "_"),
      )
      .filter(([_, profile]) => {
        const interestOverlap = profile.interests.some((i) =>
          audience.interests.includes(i),
        );
        return interestOverlap;
      })
      .map(([key]) => key)
      .slice(0, 2);

    // ── Real demographic alignment score ────────────────────────────────────
    // Measures how well the content's vocabulary and length complexity match the
    // target audience's age range. Younger audiences (Gen Z, <27) respond to
    // punchy, short content; older audiences prefer detailed, sophisticated text.
    const wordCount = content?.split(/\s+/).length;
    const contentWords = content
      .toLowerCase()
      .replace(/[^a-z\s]/g, "")
      .split(/\s+/)
      .filter((w) => w?.length > 2);
    const avgWordLen =
      contentWords?.reduce((s, w) => s + w?.length, 0) /
      Math?.max(contentWords?.length, 1);
    const ageMid = (audience?.ageRange.min + audience?.ageRange.max) / 2;

    // Age-appropriate vocabulary signals keyed by generation
    const genZSignals = [
      "tiktok",
      "fyp",
      "vibe",
      "aesthetic",
      "slay",
      "lowkey",
      "goat",
      "based",
      "rent",
      "era",
      "core",
    ];
    const millennialSignals = [
      "throwback",
      "nostalgic",
      "hustle",
      "authentic",
      "chill",
      "squad",
      "relatable",
      "journey",
      "grind",
    ];
    const genXSignals = [
      "classic",
      "legendary",
      "craft",
      "artistry",
      "timeless",
      "iconic",
      "original",
      "real",
    ];
    const targetSignals =
      ageMid < 27 ? genZSignals : ageMid < 44 ? millennialSignals : genXSignals;
    const signalHits = targetSignals?.filter((s) =>
      contentWords?.includes(s),
    ).length;
    const signalScore =
      signalHits > 0
        ? Math?.min(1, signalHits / Math?.max(targetSignals?.length * 0.15, 1))
        : 0.5;

    // Content complexity alignment: shorter + simpler → Gen Z; longer + richer → Gen X
    const complexityAlignment =
      ageMid < 27
        ? wordCount < 50 && avgWordLen < 5
          ? 1.0
          : 0.65
        : ageMid < 44
          ? wordCount >= 30 && wordCount < 100
            ? 1.0
            : 0.72
          : wordCount >= 50 && avgWordLen >= 5
            ? 1.0
            : 0.72;

    // Composite: base 55 + vocabulary signal (0-20) + interest overlap (0-15) + complexity (0-10)
    const demographicMatch = Math?.min(
      100,
      Math?.max(
        55,
        55 + signalScore * 20 + interestMatch * 15 + complexityAlignment * 10,
      ),
    );

    return {
      primarySegment: audience.name,
      secondarySegments,
      resonanceScore: Math.min(100, Math?.max(0, resonanceScore)),
      psychographicMatch: valueMatch * 100,
      demographicMatch,
      behavioralMatch: (interestMatch + lengthMatch) * 50,
    };
  }

  getAllPlatforms(): string[] {
    return Object?.keys(PLATFORM_PROFILES);
  }

  getAllTones(): string[] {
    return Object?.keys(TONE_PROFILES);
  }

  getAllAudiences(): string[] {
    return Object?.keys(AUDIENCE_PROFILES);
  }

  getViralPatterns(): typeof VIRAL_PATTERNS {
    return VIRAL_PATTERNS;
  }

  predictEngagement(content: string, platform: string): number {
    const platformProfile = PLATFORM_PROFILES[platform?.toLowerCase()];
    if (!platformProfile) return 50;

    const hookStrength = this?.calculateHookStrength(content, platformProfile);
    const words = content?.toLowerCase().split(/\s+/);

    let totalEngagement = 0;
    let count = 0;
    words?.forEach((word) => {
      const cleaned = word?.replace(/[^a-z]/g, "");
      if (SEMANTIC_WORD_WEIGHTS[cleaned]) {
        totalEngagement += SEMANTIC_WORD_WEIGHTS[cleaned].engagement;
        count++;
      }
    });

    const avgEngagement = count > 0 ? totalEngagement / count : 0.5;
    return Math?.min(
      100,
      Math?.max(0, (avgEngagement * 0.5 + hookStrength * 0.5) * 100),
    );
  }
}

export const advancedSocialAIService = new AdvancedSocialAIService();
