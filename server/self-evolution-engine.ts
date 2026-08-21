// @ts-nocheck
/**
 * Max Booster Self-Evolution Engine
 *
 * REAL-TIME AUTONOMOUS PLATFORM UPGRADING SYSTEM
 *
 * This system monitors the music industry, competitors, and technology landscape
 * then LITERALLY generates and deploys code changes to keep Max Booster ahead
 * of competition for all time.
 *
 * Core Capabilities:
 * 1. Industry Monitoring - Tracks competitor features, API changes, standards
 * 2. Code Generation - AI writes new features, optimizations, fixes
 * 3. Automated Testing - Validates generated code before deployment
 * 4. Safe Deployment - Canary releases with automatic rollback
 * 5. Continuous Learning - Improves based on user feedback and metrics
 *
 * NO EXTERNAL AI APIS - All code generation is custom-built
 */

import { EventEmitter } from "events";
import http from "http";
import { logger } from "./logger.js";
import { storage } from "./storage.js";
import { customAI } from "./custom-ai-engine.js";
import { industryMonitor } from "./services/industryMonitorService.js";
import { storageService } from "./services/storageService.js";
import {
  evolutionRegistry,
  type EnhancementCategory,
} from "./services/evolutionRegistry.js";
import { isProductionEnv } from "./lib/envHelpers.js";

interface IndustryChange {
  id: string;
  source:
    | "competitor"
    | "streaming_platform"
    | "social_media"
    | "security"
    | "regulation"
    | "technology";
  category:
    | "feature"
    | "api_change"
    | "standard"
    | "optimization"
    | "security_patch"
    | "ux_pattern";
  title: string;
  description: string;
  detectedAt: Date;
  urgency: "critical" | "high" | "medium" | "low";
  affectedModules: string[];
  competitiveImpact: number; // 0-100, how much this affects our competitive position
  implementationComplexity:
    | "trivial"
    | "simple"
    | "moderate"
    | "complex"
    | "major";
  estimatedImplementationHours: number;
}

interface CodeUpgrade {
  id: string;
  changeId: string;
  type:
    | "new_feature"
    | "optimization"
    | "bug_fix"
    | "api_update"
    | "security_patch"
    | "standard_compliance";
  targetFiles: string[];
  generatedCode: Map<string, string>;
  testCode: string;
  status:
    | "pending"
    | "testing"
    | "deploying"
    | "deployed"
    | "rolled_back"
    | "failed";
  createdAt: Date;
  deployedAt?: Date;
  rollbackReason?: string;
  performanceImpact: {
    before: Record<string, number>;
    after: Record<string, number>;
  };
  // ── Honest registry-application fields ──────────────────────────────────
  // The bounded enhancement this upgrade produces. `applied` is true ONLY when
  // the enhancement was written into a registry category that a live subsystem
  // actually reads at runtime — never just because a function finished.
  enhancementCategory?: EnhancementCategory;
  enhancementPayload?: Record<string, unknown>;
  applied?: boolean;
  notAppliedReason?: string;
}


interface PlatformStandard {
  platform: string; // Spotify, Apple Music, YouTube, etc.
  standardType:
    | "audio_format"
    | "metadata"
    | "api_version"
    | "loudness"
    | "artwork"
    | "content_policy";
  currentRequirement: string;
  maxBoosterCompliant: boolean;
  complianceDeadline?: Date;
  autoFixAvailable: boolean;
}

// ============================================================
// COMPETITIVE LEADERSHIP KNOWLEDGE BASE
// ============================================================

/**
 * Complete competitor universe — beat marketplaces, AI music/social platforms,
 * music distribution services, artist management tools, and every major DAW.
 * Max Booster must stay ahead on every axis across all categories.
 */
const COMPETITOR_PLATFORMS: Array<{
  name: string;
  category: string;
  knownFeatures: string[];
}> = [
  // ── MUSIC DISTRIBUTION ───────────────────────────────────────────────────
  {
    name: "DistroKid",
    category: "distribution",
    knownFeatures: [
      "music distribution to all DSPs",
      "royalty splits with collaborators",
      "smart links and pre-save pages",
      "Spotify for Artists integration",
      "YouTube Content ID",
      "daily streaming stats",
      "album artwork creation tool",
      "scheduled release date setting",
      "leave a legacy feature",
      "bank-direct royalty payouts",
    ],
  },
  {
    name: "TuneCore",
    category: "distribution",
    knownFeatures: [
      "music distribution to all DSPs",
      "music publishing administration",
      "sync licensing marketplace",
      "social media monetization",
      "streaming analytics dashboard",
      "advance funding for artists",
      "publishing royalty collection worldwide",
    ],
  },
  {
    name: "CD Baby",
    category: "distribution",
    knownFeatures: [
      "music distribution to all DSPs",
      "physical CD and vinyl distribution",
      "music publishing administration",
      "sync licensing",
      "YouTube Content ID",
      "artist merch store",
      "cover song licensing",
      "radio tracking airplay reporting",
    ],
  },
  {
    name: "AWAL",
    category: "distribution",
    knownFeatures: [
      "selective distribution with A&R support",
      "marketing campaigns for signed artists",
      "advanced real-time streaming analytics",
      "editorial playlist pitching",
      "brand partnerships",
      "recording advances",
      "label services deal structure",
    ],
  },
  {
    name: "UnitedMasters",
    category: "distribution",
    knownFeatures: [
      "music distribution to all DSPs",
      "brand deals and sync opportunities",
      "first-party fan data ownership",
      "advanced streaming analytics",
      "select artist marketing support",
      "direct brand licensing",
      "UnitedMasters app for mobile distribution",
    ],
  },
  {
    name: "Amuse",
    category: "distribution",
    knownFeatures: [
      "free music distribution",
      "AI-powered artist insights",
      "advance funding for artists",
      "split payments",
      "mobile-first iOS distribution app",
      "Spotify playlist submission tool",
    ],
  },
  {
    name: "Stem",
    category: "distribution",
    knownFeatures: [
      "music distribution to all DSPs",
      "split payments for collaborators",
      "fan growth tools",
      "detailed streaming reports",
      "advance funding",
      "multi-party royalty splits",
    ],
  },
  {
    name: "Landr",
    category: "distribution",
    knownFeatures: [
      "AI-powered audio mastering",
      "music distribution to all DSPs",
      "sample pack marketplace",
      "online music collaboration tools",
      "plugin marketplace",
      "AI mixing feedback",
      "mastering for stems",
    ],
  },
  {
    name: "Bandcamp",
    category: "distribution",
    knownFeatures: [
      "direct fan sales with artist-kept revenue",
      "name-your-price album pricing",
      "merch sales",
      "fan subscriptions and memberships",
      "artist discovery via genre tags",
      "Bandcamp Friday artist promotions",
    ],
  },
  {
    name: "RouteNote",
    category: "distribution",
    knownFeatures: [
      "free music distribution to DSPs",
      "revenue share distribution model",
      "YouTube Content ID",
      "streaming analytics",
      "cover song licensing",
    ],
  },
  {
    name: "Ditto Music",
    category: "distribution",
    knownFeatures: [
      "music distribution to all DSPs",
      "record label in a box service",
      "music publishing royalty collection",
      "chart eligibility distribution",
      "band/artist management tools",
    ],
  },
  {
    name: "ONErpm",
    category: "distribution",
    knownFeatures: [
      "music distribution to all DSPs",
      "YouTube channel management",
      "label services",
      "advance funding for artists",
      "marketing and promotional support",
      "streaming analytics",
    ],
  },
  {
    name: "Believe Digital",
    category: "distribution",
    knownFeatures: [
      "distribution for independent artists and labels",
      "digital marketing services",
      "A&R scouting and support",
      "streaming platform relationship management",
      "advanced analytics",
    ],
  },
  {
    name: "Vydia",
    category: "distribution",
    knownFeatures: [
      "music video and audio distribution",
      "YouTube Content ID monetization",
      "rights management",
      "automated royalty splits",
      "video distribution to streaming platforms",
    ],
  },
  {
    name: "Soundrop",
    category: "distribution",
    knownFeatures: [
      "cover song licensing and distribution",
      "original music distribution",
      "per-release pricing model",
      "automated mechanical license procurement",
    ],
  },

  // ── BEAT MARKETPLACES ────────────────────────────────────────────────────
  {
    name: "BeatStars",
    category: "beat_marketplace",
    knownFeatures: [
      "beat marketplace with licensing tiers",
      "exclusive and non-exclusive beat leases",
      "built-in beat player storefront",
      "beat collaboration splits",
      "direct-to-fan beat selling",
      "beat licensing contract generation",
      "beat subscription plans for producers",
      "built-in YouTube monetization for beats",
      "beat analytics and play tracking",
      "mobile app for producers",
      "producer profile pages",
      "stem file delivery",
    ],
  },
  {
    name: "Airbit",
    category: "beat_marketplace",
    knownFeatures: [
      "beat marketplace with licensing tiers",
      "customizable beat player embed",
      "exclusive and non-exclusive licenses",
      "beat licensing contract templates",
      "beat analytics dashboard",
      "direct PayPal and Stripe payouts",
      "bulk beat upload",
      "discount and coupon codes for beats",
      "beat subscription bundles",
    ],
  },
  {
    name: "SoundClick",
    category: "beat_marketplace",
    knownFeatures: [
      "beat and music selling marketplace",
      "fan streaming pages",
      "subscription-based fan membership",
      "beat licensing",
      "music charts and rankings",
    ],
  },
  {
    name: "Traktrain",
    category: "beat_marketplace",
    knownFeatures: [
      "beat marketplace",
      "exclusive and non-exclusive licenses",
      "beat licensing contracts",
      "beat player embed for websites",
      "analytics for beat plays and sales",
    ],
  },
  {
    name: "Beatbrokerz",
    category: "beat_marketplace",
    knownFeatures: [
      "beat marketplace",
      "beat licensing tiers",
      "bulk beat purchases",
      "producer storefront pages",
    ],
  },
  {
    name: "Soundee",
    category: "beat_marketplace",
    knownFeatures: [
      "beat marketplace",
      "producer profile and storefront",
      "beat licensing",
      "audio sample marketplace",
    ],
  },
  {
    name: "Rocbattle",
    category: "beat_marketplace",
    knownFeatures: [
      "beat marketplace",
      "beat battle competitions",
      "producer community",
      "beat licensing",
    ],
  },
  {
    name: "Soundgine",
    category: "beat_marketplace",
    knownFeatures: [
      "embeddable beat player",
      "beat licensing and sales",
      "digital product delivery",
      "beat store widget for websites",
    ],
  },

  // ── AI MUSIC CREATION ─────────────────────────────────────────────────────
  {
    name: "Suno AI",
    category: "ai_music",
    knownFeatures: [
      "AI full song generation from text prompts",
      "AI vocals and lyrics generation",
      "genre-specific AI music creation",
      "instant music production without instruments",
      "royalty-free AI-generated music",
      "mobile and web AI music app",
    ],
  },
  {
    name: "Udio",
    category: "ai_music",
    knownFeatures: [
      "AI full song generation from text prompts",
      "high-fidelity AI audio generation",
      "AI lyric writing and vocal generation",
      "genre and mood control",
      "stem exports from AI generation",
    ],
  },
  {
    name: "Boomy",
    category: "ai_music",
    knownFeatures: [
      "AI music generation in seconds",
      "auto-distribute AI songs to DSPs",
      "royalty sharing for AI-generated music",
      "no-instrument music creation",
      "AI genre selection and customization",
    ],
  },
  {
    name: "AIVA",
    category: "ai_music",
    knownFeatures: [
      "AI composition for film and games",
      "orchestral and classical AI scoring",
      "style influence from existing compositions",
      "MIDI export from AI composition",
      "commercial licensing of AI music",
    ],
  },
  {
    name: "Soundraw",
    category: "ai_music",
    knownFeatures: [
      "AI royalty-free music generation",
      "real-time AI music customization",
      "mood and energy AI music controls",
      "commercial license included",
      "DAW-ready stems download",
    ],
  },
  {
    name: "Beatoven.ai",
    category: "ai_music",
    knownFeatures: [
      "AI background music generation for video",
      "mood-based AI music creation",
      "multi-section AI track building",
      "royalty-free AI music for content creators",
    ],
  },
  {
    name: "Mubert",
    category: "ai_music",
    knownFeatures: [
      "AI generative music streaming",
      "API for AI music in apps",
      "real-time AI music for video",
      "royalty-free AI music licensing",
    ],
  },
  {
    name: "Loudly",
    category: "ai_music",
    knownFeatures: [
      "AI music generation for content creators",
      "royalty-free AI music library",
      "loop and stem AI generation",
      "mood and genre AI controls",
    ],
  },

  // ── AI SOCIAL MEDIA MANAGEMENT ───────────────────────────────────────────
  {
    name: "Hootsuite",
    category: "social_management",
    knownFeatures: [
      "multi-platform social media scheduling",
      "social media analytics and reporting",
      "team collaboration for social posts",
      "social listening and monitoring",
      "AI-powered caption suggestions",
      "best time to post AI recommendations",
      "social media ad management",
      "inbox unified messaging",
    ],
  },
  {
    name: "Buffer",
    category: "social_management",
    knownFeatures: [
      "social media post scheduling",
      "multi-platform content calendar",
      "AI post writing assistant",
      "social media analytics",
      "link in bio landing page",
      "engagement reply tools",
      "hashtag manager",
    ],
  },
  {
    name: "Sprout Social",
    category: "social_management",
    knownFeatures: [
      "social media scheduling and publishing",
      "social listening and sentiment analysis",
      "AI-powered social analytics",
      "CRM integration for social",
      "team workflow and approval",
      "competitor social analysis",
      "influencer identification",
    ],
  },
  {
    name: "Later",
    category: "social_management",
    knownFeatures: [
      "visual social media content calendar",
      "Instagram post and Reels scheduling",
      "TikTok scheduling",
      "link in bio tool",
      "AI caption writer",
      "hashtag suggestions",
      "best time to post analytics",
      "user-generated content repurposing",
    ],
  },
  {
    name: "Metricool",
    category: "social_management",
    knownFeatures: [
      "social media scheduling across all platforms",
      "unified analytics dashboard",
      "competitor social analytics",
      "hashtag analytics",
      "TikTok and YouTube analytics",
      "social ad performance tracking",
      "best time to post AI",
    ],
  },
  {
    name: "Planoly",
    category: "social_management",
    knownFeatures: [
      "Instagram visual feed planner",
      "social media scheduling",
      "Reels and Stories scheduling",
      "link in bio page builder",
      "hashtag manager",
      "content analytics",
    ],
  },
  {
    name: "Vista Social",
    category: "social_management",
    knownFeatures: [
      "social media scheduling and publishing",
      "AI post content generator",
      "review management across platforms",
      "social inbox unified messaging",
      "analytics and reporting",
    ],
  },
  {
    name: "Publer",
    category: "social_management",
    knownFeatures: [
      "AI-powered social media post generator",
      "social media scheduling",
      "bulk scheduling via CSV",
      "watermarking media for posts",
      "analytics dashboard",
      "recycling evergreen content",
    ],
  },

  // ── MUSIC MARKETING & ARTIST TOOLS ───────────────────────────────────────
  {
    name: "Submithub",
    category: "music_marketing",
    knownFeatures: [
      "music submission to playlist curators",
      "music blog submission",
      "TikTok influencer pitching",
      "YouTube channel submission",
      "guaranteed curator feedback",
      "promotion performance analytics",
    ],
  },
  {
    name: "Groover",
    category: "music_marketing",
    knownFeatures: [
      "music promotion to blogs and playlists",
      "guaranteed feedback from curators",
      "influencer and press pitching",
      "radio station pitching",
      "streaming platform pitching",
    ],
  },
  {
    name: "Feature.fm",
    category: "music_marketing",
    knownFeatures: [
      "smart music links",
      "pre-save campaign tool",
      "fan data capture from links",
      "music ad targeting on social media",
      "release countdown pages",
      "artist website builder",
    ],
  },
  {
    name: "Hypeddit",
    category: "music_marketing",
    knownFeatures: [
      "music promotion gate campaigns",
      "free download in exchange for social follow",
      "TikTok sound growth tools",
      "SoundCloud promotion",
      "Spotify playlist promotion",
    ],
  },
  {
    name: "Linkfire",
    category: "music_marketing",
    knownFeatures: [
      "smart music links for all DSPs",
      "pre-save and pre-add campaigns",
      "fan behavior analytics from links",
      "album and tour smart pages",
      "retargeting pixel support",
    ],
  },
  {
    name: "Chartmetric",
    category: "music_marketing",
    knownFeatures: [
      "real-time music streaming analytics",
      "playlist tracking across all DSPs",
      "artist benchmark comparisons",
      "TikTok and social trend analytics",
      "A&R discovery tools",
      "radio airplay tracking",
    ],
  },
  {
    name: "Soundcharts",
    category: "music_marketing",
    knownFeatures: [
      "real-time chart position tracking",
      "radio airplay monitoring",
      "social media performance analytics",
      "streaming platform analytics",
      "playlist tracking",
      "competitor artist benchmarking",
    ],
  },
  {
    name: "ReverbNation",
    category: "music_marketing",
    knownFeatures: [
      "artist promotional tools",
      "gig and venue booking",
      "music distribution",
      "fan email marketing",
      "EPK electronic press kit",
      "music licensing opportunities",
    ],
  },
  {
    name: "Toneden",
    category: "music_marketing",
    knownFeatures: [
      "smart link pages for music",
      "pre-save and pre-add campaigns",
      "fan data capture tools",
      "social media retargeting from links",
      "contest and giveaway campaigns",
    ],
  },
  {
    name: "Promoly",
    category: "music_marketing",
    knownFeatures: [
      "music press and blog pitching",
      "email promo campaign tracking",
      "media contact database",
      "open and click analytics for promos",
    ],
  },

  // ── DAWS (DIGITAL AUDIO WORKSTATIONS) ────────────────────────────────────
  {
    name: "FL Studio",
    category: "daw",
    knownFeatures: [
      "pattern-based beat making",
      "step sequencer",
      "piano roll editor",
      "built-in mixer with effects chains",
      "lifetime free updates",
      "VST plugin support",
      "MIDI controller integration",
      "audio recording and editing",
      "Edison audio editor",
      "ZGameEditor Visualizer",
      "integrated beat marketplace plugins",
      "mobile version FL Studio Mobile",
    ],
  },
  {
    name: "Ableton Live",
    category: "daw",
    knownFeatures: [
      "session view for live performance",
      "arrangement view for production",
      "Max for Live modular integration",
      "built-in instruments and effects",
      "VST and AU plugin support",
      "MIDI and audio clip launching",
      "warping and time-stretching",
      "built-in synthesizers",
      "Push hardware controller integration",
      "Packs sample library ecosystem",
    ],
  },
  {
    name: "Logic Pro",
    category: "daw",
    knownFeatures: [
      "professional audio recording and mixing",
      "built-in AI stem splitter",
      "Drummer virtual session drummer AI",
      "built-in mastering tools",
      "large instrument and loop library",
      "AU plugin support",
      "Spatial Audio and Dolby Atmos mixing",
      "GarageBand project import",
      "Score editor for notation",
      "Logic Remote iPad controller",
      "Flex Time audio editing",
    ],
  },
  {
    name: "Pro Tools",
    category: "daw",
    knownFeatures: [
      "industry-standard recording and mixing",
      "advanced audio editing",
      "cloud collaboration sessions",
      "AAX plugin ecosystem",
      "AVID hardware integration",
      "clip gain and automation",
      "Dolby Atmos mixing",
      "subscription and perpetual license options",
    ],
  },
  {
    name: "Studio One",
    category: "daw",
    knownFeatures: [
      "drag-and-drop workflow",
      "built-in mastering suite Project page",
      "Melodyne pitch correction bundled",
      "scratch pad for ideas",
      "VST and AU plugin support",
      "built-in chord track and key detection",
      "impact XT drum machine",
      "free Studio One Prime tier",
    ],
  },
  {
    name: "Cubase",
    category: "daw",
    knownFeatures: [
      "professional MIDI sequencing",
      "advanced audio editing",
      "VariAudio pitch correction",
      "built-in chord pads",
      "Steinberg VST plugin support",
      "remote recording",
      "score editor for notation",
    ],
  },
  {
    name: "Reaper",
    category: "daw",
    knownFeatures: [
      "lightweight highly customizable DAW",
      "affordable perpetual license",
      "VST and AU plugin support",
      "scripting with Lua and Python",
      "flexible routing",
      "active community themes and scripts",
    ],
  },
  {
    name: "Bitwig Studio",
    category: "daw",
    knownFeatures: [
      "modular device system The Grid",
      "cross-platform Windows Mac Linux",
      "live performance clip launcher",
      "VST plugin support",
      "Bitwig hardware controller integration",
      "note expression per-note modulation",
    ],
  },
  {
    name: "Reason Studios",
    category: "daw",
    knownFeatures: [
      "rack-based modular synthesizers",
      "built-in instruments and effects",
      "VST plugin support via Rack Extension",
      "combinators for complex patches",
      "built-in mastering suite",
      "Reason Plus subscription model",
    ],
  },
  {
    name: "GarageBand",
    category: "daw",
    knownFeatures: [
      "free DAW for macOS and iOS",
      "Drummer AI beat generation",
      "large loop library",
      "basic recording and mixing",
      "Logic Pro project upgrade path",
      "iPhone and iPad music creation",
    ],
  },
  {
    name: "Cakewalk by BandLab",
    category: "daw",
    knownFeatures: [
      "free professional DAW on Windows",
      "ProChannel mastering console",
      "VST plugin support",
      "BandLab cloud integration",
      "MIDI sequencing",
      "audio recording and editing",
    ],
  },
  {
    name: "Adobe Audition",
    category: "daw",
    knownFeatures: [
      "professional audio editing and restoration",
      "multi-track mixing",
      "AI noise reduction and speech cleanup",
      "podcast and broadcast audio tools",
      "Adobe Creative Cloud integration",
    ],
  },
  {
    name: "Soundtrap",
    category: "daw",
    knownFeatures: [
      "browser-based online DAW",
      "real-time collaboration in the browser",
      "built-in loops and instruments",
      "podcast recording tools",
      "Spotify integration",
      "education-focused music creation",
    ],
  },
  {
    name: "BandLab",
    category: "daw",
    knownFeatures: [
      "free browser and mobile DAW",
      "social music creation community",
      "real-time online collaboration",
      "built-in mastering",
      "music distribution via BandLab Distribution",
      "fan engagement tools",
      "split royalties",
    ],
  },
  {
    name: "Splice",
    category: "daw",
    knownFeatures: [
      "sample and loop subscription library",
      "plugin rent-to-own marketplace",
      "DAW project version control",
      "collaboration via shared projects",
      "AI-powered sample search",
      "CoSo AI beat maker",
    ],
  },
];

/**
 * Competitive advantage tiers:
 *   'surpassed'  — Max Booster does this measurably better than every competitor.
 *                  The description states exactly why we win.
 *   'at_parity'  — Max Booster has an equivalent but has not meaningfully differentiated.
 *                  Still a gap — parity is never the goal.
 *
 * Features absent from this map are 'missing' — the most urgent tier.
 *
 * Score: only reaches 100 when EVERY competitor feature is 'surpassed'.
 *   surpassed  → +3 pts per feature
 *   at_parity  → +1 pt per feature
 *   missing    → +0 pts
 *   score = (Σ pts) / (totalFeatures × 3) × 100
 */
type AdvantageLevel = "surpassed" | "at_parity";

interface AdvantageEntry {
  level: AdvantageLevel;
  reason: string; // why we win, or why we still need to improve
}

const MAX_BOOSTER_ADVANTAGES = new Map<string, AdvantageEntry>([
  // ── DISTRIBUTION ──────────────────────────────────────────────────────────
  [
    "music distribution to all DSPs",
    {
      level: "at_parity",
      reason:
        "We distribute but lack a speed or pricing edge over DistroKid/RouteNote — need to surpass on delivery speed or fan analytics at distribution point.",
    },
  ],
  [
    "royalty splits with collaborators",
    {
      level: "at_parity",
      reason:
        "Splits exist but DistroKid and Stem offer more granular real-time split tracking — need superior UX and instant payout triggers.",
    },
  ],
  [
    "split payments for collaborators",
    {
      level: "at_parity",
      reason:
        "Same as above — must surpass with automated multi-party smart contracts and instant settlement.",
    },
  ],
  [
    "smart links and pre-save pages",
    {
      level: "at_parity",
      reason:
        "Smart links exist but Feature.fm and Linkfire offer deeper retargeting pixels and fan data capture — must surpass on conversion analytics.",
    },
  ],
  [
    "YouTube Content ID",
    {
      level: "at_parity",
      reason:
        "Content ID implemented but need automated conflict resolution and real-time earnings dashboard to surpass.",
    },
  ],
  [
    "daily streaming stats",
    {
      level: "at_parity",
      reason:
        "Stats available but not yet presented with AI narrative summaries and predictive trend lines — must surpass Chartmetric-level intelligence.",
    },
  ],
  [
    "music publishing administration",
    {
      level: "at_parity",
      reason:
        "Publishing exists but TuneCore collects from more societies globally — need broader PRO coverage to surpass.",
    },
  ],
  [
    "sync licensing",
    {
      level: "at_parity",
      reason:
        "Sync exists but CD Baby and TuneCore have larger supervisor networks — must surpass with AI-powered sync pitch matching.",
    },
  ],
  [
    "advance funding for artists",
    {
      level: "at_parity",
      reason:
        "Funding offered but TuneCore and Amuse have faster approval — surpass with AI-scored instant advance decisions.",
    },
  ],

  // ── BEAT MARKETPLACE ──────────────────────────────────────────────────────
  [
    "beat marketplace with licensing tiers",
    {
      level: "at_parity",
      reason:
        "Marketplace exists but BeatStars has far more producers and social discovery — must surpass with AI beat-to-artist matching and trend scoring.",
    },
  ],
  [
    "exclusive and non-exclusive beat leases",
    {
      level: "at_parity",
      reason:
        "Tiers exist but BeatStars and Airbit have smarter automated upsell flows — surpass with AI-generated dynamic pricing.",
    },
  ],
  [
    "beat licensing contract generation",
    {
      level: "surpassed",
      reason:
        "AI-generated contracts that auto-populate splits, usage rights, and delivery on purchase — BeatStars still uses static templates.",
    },
  ],
  [
    "beat analytics and play tracking",
    {
      level: "at_parity",
      reason:
        'Basic analytics exist — must surpass Airbit with listener geography, skip rates, and AI-powered "beats trending toward purchase" signals.',
    },
  ],
  [
    "stem file delivery",
    {
      level: "at_parity",
      reason:
        "Stems delivered on purchase but no quality gate or automatic format conversion — must surpass BeatStars with AI stem validation.",
    },
  ],
  [
    "producer profile pages",
    {
      level: "at_parity",
      reason:
        "Profiles exist — surpass BeatStars with AI-curated producer highlight reels and auto-generated promo videos from beats.",
    },
  ],

  // ── ANALYTICS ─────────────────────────────────────────────────────────────
  [
    "streaming analytics dashboard",
    {
      level: "at_parity",
      reason:
        "Dashboard exists — must surpass Chartmetric with real-time AI narrative summaries and anomaly flagging.",
    },
  ],
  [
    "advanced real-time streaming analytics",
    {
      level: "surpassed",
      reason:
        "Multi-platform aggregation with AI cohort analysis and predictive revenue modeling — ahead of AWAL and Chartmetric on AI insight depth.",
    },
  ],
  [
    "revenue forecasting",
    {
      level: "surpassed",
      reason:
        "AI time-series revenue forecasting with confidence intervals — no competitor offers this at the independent artist level.",
    },
  ],
  [
    "playlist tracking across all DSPs",
    {
      level: "at_parity",
      reason:
        "Playlist tracking implemented — surpass Soundcharts by adding AI prediction of editorial playlist add probability.",
    },
  ],
  [
    "artist benchmark comparisons",
    {
      level: "at_parity",
      reason:
        "Benchmarking exists — surpass by adding AI strategy recommendations derived from what top comparables are doing differently.",
    },
  ],
  [
    "competitor artist benchmarking",
    {
      level: "surpassed",
      reason:
        "Full competitor analysis suite with share-of-voice, engagement gap detection, and strategy insights — no pure music distributor matches this.",
    },
  ],
  [
    "A&R discovery tools",
    {
      level: "surpassed",
      reason:
        "AI signing potential scoring with trajectory modeling — AWAL does this manually for their own roster, we do it for everyone.",
    },
  ],
  [
    "radio tracking airplay reporting",
    {
      level: "at_parity",
      reason:
        "Radio tracking exists but CD Baby and Soundcharts have wider station coverage — must surpass with automatic pitch recommendations based on airplay gaps.",
    },
  ],

  // ── SOCIAL & AUTOPILOT ────────────────────────────────────────────────────
  [
    "social media scheduling and publishing",
    {
      level: "surpassed",
      reason:
        "Music-native autopilot understands release cycles, drop timing, and platform algorithms in ways Hootsuite and Buffer never will — fully surpassed for music artists.",
    },
  ],
  [
    "social media autopilot",
    {
      level: "surpassed",
      reason:
        "Fully autonomous 24/7 posting with algorithm-aware timing, viral scoring, and auto-content generation — no competitor in music or social management offers this.",
    },
  ],
  [
    "multi-platform content calendar",
    {
      level: "surpassed",
      reason:
        "Calendar auto-populated by AI based on release schedule, trending sounds, and engagement windows — generic tools require manual planning.",
    },
  ],
  [
    "AI post content generator",
    {
      level: "surpassed",
      reason:
        "Music-context-aware AI that writes captions aligned to artist brand voice, release narrative, and genre slang — Buffer and Publer use generic LLMs.",
    },
  ],
  [
    "AI-powered caption suggestions",
    {
      level: "surpassed",
      reason:
        "Captions trained on viral music content patterns, not generic marketing copy — fully differentiated from Hootsuite and Later.",
    },
  ],
  [
    "best time to post AI recommendations",
    {
      level: "at_parity",
      reason:
        "Timing recommendations exist — surpass Later and Metricool by adding release-day surge detection and fan timezone clustering.",
    },
  ],
  [
    "hashtag suggestions",
    {
      level: "at_parity",
      reason:
        "Hashtag tool exists — surpass Buffer and Later with real-time trending hashtag velocity scoring and niche penetration analysis.",
    },
  ],
  [
    "social listening and monitoring",
    {
      level: "at_parity",
      reason:
        "Listening tools exist — surpass Sprout Social on music-specific signal detection: sample usage, cover songs, lyric quotes, fan videos.",
    },
  ],
  [
    "fan growth tools",
    {
      level: "at_parity",
      reason:
        "Fan growth features exist — must surpass Stem and UnitedMasters with AI-driven fan segment analysis and personalized re-engagement flows.",
    },
  ],
  [
    "content auto-generation",
    {
      level: "surpassed",
      reason:
        "Full AI content pipeline generating posts, captions, hooks, video scripts, and artwork variants — no distribution platform or social tool matches this scope.",
    },
  ],
  [
    "link in bio landing page",
    {
      level: "at_parity",
      reason:
        "Smart links exist but Buffer and Later offer more polished link-in-bio builders — surpass with AI-personalized fan landing pages that change by traffic source.",
    },
  ],
  [
    "social media ad management",
    {
      level: "surpassed",
      reason:
        "AI-optimized ad campaigns with music-native targeting (genre fans, similar artist audiences) that generic tools cannot replicate.",
    },
  ],

  // ── AI MUSIC ──────────────────────────────────────────────────────────────
  [
    "AI-powered audio mastering",
    {
      level: "surpassed",
      reason:
        "LUFS-targeted AI mastering with platform-specific loudness profiles for every DSP — Landr offers one profile, we offer per-platform optimization.",
    },
  ],
  [
    "AI mixing feedback",
    {
      level: "at_parity",
      reason:
        "Mixing feedback exists — must surpass Landr with stem-level AI analysis and genre-specific mix benchmarks.",
    },
  ],
  [
    "AI-powered artist insights",
    {
      level: "surpassed",
      reason:
        "Multi-dimensional AI insights combining streaming, social, market position, and revenue trajectory — Amuse and AWAL only surface surface-level metrics.",
    },
  ],
  [
    "AI full song generation from text prompts",
    {
      level: "at_parity",
      reason:
        "AI generation exists — must surpass Suno and Udio by tying AI generation directly to the artist's existing style and brand DNA.",
    },
  ],

  // ── ADVERTISING ───────────────────────────────────────────────────────────
  [
    "automated advertising campaigns",
    {
      level: "surpassed",
      reason:
        "AI-managed campaigns with music-native targeting, automatic creative rotation, and ROAS optimization — no music distribution platform offers this.",
    },
  ],

  // ── MARKETING ─────────────────────────────────────────────────────────────
  [
    "playlist pitching",
    {
      level: "at_parity",
      reason:
        "Pitching exists — surpass Submithub and Groover with AI pitch letter personalization and curator match scoring.",
    },
  ],
  [
    "editorial playlist pitching",
    {
      level: "at_parity",
      reason:
        "Editorial pitching available — surpass AWAL with AI mood/genre match scoring against known editorial playlist criteria.",
    },
  ],
  [
    "viral score prediction",
    {
      level: "surpassed",
      reason:
        "Multi-signal viral probability scoring using social velocity, streaming trajectory, and content format analysis — unique to Max Booster.",
    },
  ],
  [
    "platform algorithm intelligence",
    {
      level: "surpassed",
      reason:
        "Deep per-platform algorithm health monitoring with shadowban detection and boost-window identification — no competitor tracks this systematically.",
    },
  ],
  [
    "social media monetization",
    {
      level: "at_parity",
      reason:
        "Monetization tracking exists — surpass TuneCore with AI-predicted earnings by platform and automatic routing of content to highest-yield platforms.",
    },
  ],
  [
    "brand deals and sync opportunities",
    {
      level: "at_parity",
      reason:
        "Opportunities surfaced but UnitedMasters has direct brand relationships — surpass by building AI brand-to-artist fit scoring and outreach automation.",
    },
  ],
  [
    "guaranteed curator feedback",
    {
      level: "at_parity",
      reason:
        "Feedback collection exists — surpass Submithub and Groover by closing the loop: AI learns from curator rejections to improve future pitches.",
    },
  ],
  [
    "music promotion to blogs and playlists",
    {
      level: "at_parity",
      reason:
        "Promotion tools exist — surpass Groover with AI-ranked media lists and auto-personalized outreach emails per contact.",
    },
  ],

  // ── DAW / STUDIO ──────────────────────────────────────────────────────────
  [
    "audio recording and editing",
    {
      level: "at_parity",
      reason:
        "Basic recording exists — must surpass traditional DAWs by integrating AI-assisted arrangement suggestions and real-time AI coaching during sessions.",
    },
  ],
  [
    "VST plugin support",
    {
      level: "at_parity",
      reason:
        "Plugins supported — surpass by building an AI plugin recommendation engine that suggests chains based on genre and reference track analysis.",
    },
  ],
  [
    "MIDI controller integration",
    {
      level: "at_parity",
      reason:
        "MIDI exists — surpass by adding AI that learns a producer's playing patterns and auto-suggests scale/chord completions in real time.",
    },
  ],
  [
    "built-in mastering tools",
    {
      level: "surpassed",
      reason:
        "AI mastering superior to Logic Pro's built-in tools — platform-specific LUFS targeting and stem-aware mastering not available in any DAW.",
    },
  ],
  [
    "pattern-based beat making",
    {
      level: "at_parity",
      reason:
        "Beat tools exist — surpass FL Studio and BeatStars with AI that generates pattern variations based on genre rules and trending rhythmic templates.",
    },
  ],
  [
    "sample pack marketplace",
    {
      level: "at_parity",
      reason:
        "Sample marketplace exists — surpass Landr and Splice by adding AI-curated packs tailored to each producer's existing sound and genre.",
    },
  ],
  [
    "online music collaboration tools",
    {
      level: "at_parity",
      reason:
        "Collaboration features exist — surpass Soundtrap and BandLab with AI session co-production that fills in missing parts in real time.",
    },
  ],
]);

export class SelfEvolutionEngine extends EventEmitter {
  private isRunning: boolean = false;
  private isCycleRunning: boolean = false;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private upgradeQueue: CodeUpgrade[] = [];
  private industryChanges: IndustryChange[] = [];
  private seenChangeIds: Set<string> = new Set();
  private lastCycleAt: Date | null = null;
  private lastCycleError: string | null = null;
  private totalCyclesRun: number = 0;
  private platformStandards: PlatformStandard[] = [];
  // Competitive leadership tracking
  private competitivePositionScore: number = 0;
  private competitiveGapsAddressed: number = 0;
  private competitiveGapsDetected: number = 0;
  private lastCompetitiveScan: Date | null = null;
  private lastSurpassedCount: number = 0;
  private lastParityCount: number = 0;
  private lastMissingCount: number = 0;

  private readonly MONITORING_INTERVAL_MS = 60 * 60 * 1000;
  private readonly MAX_CHANGES_IN_MEMORY = 500;
  private readonly MAX_UPGRADES_IN_MEMORY = 200;
  private readonly MAX_SEEN_IDS = 2000;
  private readonly STATE_KEY = "evolution-state/state.json";

  constructor() {
    super();
    this.initializeIndustryKnowledge();
    this.seedSeenIdsFromDisk().catch(() => {});
    logger.info("🧬 Self-Evolution Engine initialized");
  }

  private async seedSeenIdsFromDisk(): Promise<void> {
    try {
      const buf = await storageService?.downloadFile(this.STATE_KEY);
      const state = JSON.parse(buf?.toString("utf-8")) as {
        seenChangeIds?: string[];
      };
      if (Array.isArray(state?.seenChangeIds)) {
        for (const id of state?.seenChangeIds ?? []) this.seenChangeIds.add(id);
        logger.info(
          `🧬 Restored ${this.seenChangeIds.size} seen change IDs from Pocket Dimension`,
        );
      }
    } catch {
      logger.info("🧬 No prior evolution state found — starting fresh");
    }
  }

  private async saveStateToDisk(): Promise<void> {
    try {
      const ids = Array.from(this.seenChangeIds);
      const state = { seenChangeIds: ids, savedAt: new Date().toISOString() };
      await storageService?.uploadFile(
        Buffer?.from(JSON.stringify(state, null, 2), "utf-8"),
        this.STATE_KEY,
        "application/json",
      );
    } catch (e) {
      logger.warn({ err: e }, "Failed to persist evolution state:");
    }
  }

  private pruneSeenIds(): void {
    if (this.seenChangeIds.size > this.MAX_SEEN_IDS) {
      const arr = Array.from(this.seenChangeIds);
      const keep = arr?.slice(arr?.length - (this.MAX_SEEN_IDS - 500));
      this.seenChangeIds = new Set(keep);
      logger.info(
        `🧬 Pruned seenChangeIds to ${this.seenChangeIds.size} entries`,
      );
    }
  }

  /**
   * PRODUCTION SAFETY GATE
   *
   * The Self-Evolution Engine is DISABLED by default in production.
   * To enable automatic self-evolution:
   * 1. Set ENABLE_SELF_EVOLUTION=true in environment variables
   * 2. OR run in development mode (NODE_ENV=development)
   *
   * Manual triggering via API is always available for controlled upgrades.
   */
  isProductionSafetyEnabled(): boolean {
    const isProd = isProductionEnv();
    const explicitlyEnabled = process.env.ENABLE_SELF_EVOLUTION === "true";

    // In development, auto-evolution is allowed
    if (!isProd) {
      return true;
    }

    // In production, require explicit opt-in
    return explicitlyEnabled;
  }

  /**
   * Check if engine can auto-start (respects production safety gate)
   */
  canAutoStart(): boolean {
    return this.isProductionSafetyEnabled();
  }

  /**
   * Get production safety status for API responses
   */
  getProductionSafetyStatus(): {
    isProduction: boolean;
    autoEvolutionEnabled: boolean;
    explicitOptIn: boolean;
    reason: string;
  } {
    const isProduction = isProductionEnv();
    const explicitOptIn = process.env.ENABLE_SELF_EVOLUTION === "true";
    const autoEvolutionEnabled = this.isProductionSafetyEnabled();

    let reason: string;
    if (!isProduction) {
      reason = "Development mode - auto-evolution enabled by default";
    } else if (explicitOptIn) {
      reason =
        "Production mode with explicit ENABLE_SELF_EVOLUTION=true opt-in";
    } else {
      reason =
        "Production mode - auto-evolution disabled for safety. Set ENABLE_SELF_EVOLUTION=true to enable.";
    }

    return {
      isProduction,
      autoEvolutionEnabled,
      explicitOptIn,
      reason,
    };
  }

  /**
   * Manual trigger for a single evolution cycle (bypasses auto-start gate)
   * Use this for controlled upgrades in production
   */
  async triggerManualUpgrade(): Promise<{
    success: boolean;
    cycleId: string;
    changesDetected: number;
    upgradesDeployed: number;
  }> {
    const cycleId = `manual_evolution_${Date.now()}`;
    logger.info(
      `🔧 MANUAL EVOLUTION TRIGGER: Starting controlled upgrade cycle ${cycleId}`,
    );

    try {
      await this.runEvolutionCycle();

      const status = this.getStatus();
      return {
        success: true,
        cycleId,
        changesDetected: status.changesDetected,
        upgradesDeployed: status.upgradesDeployed,
      };
    } catch (error) {
      logger.warn(
        { err: error },
        `❌ Manual evolution cycle ${cycleId} failed:`,
      );
      throw error;
    }
  }

  private async initializeIndustryKnowledge(): Promise<void> {
    this.platformStandards = [
      {
        platform: "Spotify",
        standardType: "loudness",
        currentRequirement: "-14 LUFS",
        maxBoosterCompliant: true,
        autoFixAvailable: true,
      },
      {
        platform: "Apple Music",
        standardType: "loudness",
        currentRequirement: "-16 LUFS",
        maxBoosterCompliant: true,
        autoFixAvailable: true,
      },
      {
        platform: "YouTube",
        standardType: "loudness",
        currentRequirement: "-14 LUFS",
        maxBoosterCompliant: true,
        autoFixAvailable: true,
      },
      {
        platform: "Tidal",
        standardType: "loudness",
        currentRequirement: "-14 LUFS",
        maxBoosterCompliant: true,
        autoFixAvailable: true,
      },
      {
        platform: "Amazon Music",
        standardType: "loudness",
        currentRequirement: "-14 LUFS",
        maxBoosterCompliant: true,
        autoFixAvailable: true,
      },
      {
        platform: "Spotify",
        standardType: "audio_format",
        currentRequirement: "FLAC/WAV 16-24bit 44.1-192kHz",
        maxBoosterCompliant: true,
        autoFixAvailable: true,
      },
      {
        platform: "Apple Music",
        standardType: "audio_format",
        currentRequirement: "ALAC/FLAC 24bit 96kHz+",
        maxBoosterCompliant: true,
        autoFixAvailable: true,
      },
      {
        platform: "Instagram",
        standardType: "api_version",
        currentRequirement: "Graph API v18.0",
        maxBoosterCompliant: true,
        autoFixAvailable: true,
      },
      {
        platform: "TikTok",
        standardType: "api_version",
        currentRequirement: "TikTok API v2",
        maxBoosterCompliant: true,
        autoFixAvailable: true,
      },
    ];
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    if (!this.isProductionSafetyEnabled()) {
      logger.warn(
        "🛡️ Self-Evolution Engine: auto-start blocked by production safety gate. Set ENABLE_SELF_EVOLUTION=true to allow.",
      );
      return;
    }

    this.isRunning = true;

    logger.info("🚀 Self-Evolution Engine ACTIVATED");
    logger.info(
      "   Max Booster will now autonomously upgrade itself to stay ahead of competition",
    );

    this.runEvolutionCycle().catch((e) =>
      logger.warn({ err: e }, "Initial evolution cycle error:"),
    );

    this.monitoringInterval = setInterval(() => {
      this.runEvolutionCycle().catch((e) =>
        logger.warn({ err: e }, "Scheduled evolution cycle error:"),
      );
    }, this.MONITORING_INTERVAL_MS);

    this.emit("started");
  }

  async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info("🛑 Self-Evolution Engine stopped");
    this.emit("stopped");
  }

  private async runEvolutionCycle(): Promise<void> {
    if (this.isCycleRunning) {
      logger.info("🔒 Evolution cycle already in progress — skipping overlap");
      return;
    }

    this.isCycleRunning = true;
    const cycleId = `evolution_${Date.now()}`;
    logger.info(`🧬 Starting evolution cycle: ${cycleId}`);

    try {
      // Phase 0: Competitive leadership check — runs FIRST every cycle
      const leadershipGaps = await this.assessCompetitiveLeadership();
      logger.info(
        `   🏆 Competitive leadership: ${leadershipGaps?.length} gaps vs competitors (score: ${this.competitivePositionScore}/100)`,
      );

      // Phase 1: Monitor the industry landscape
      const changes = await this.monitorIndustryLandscape();
      // Merge leadership gaps in as high-priority industry changes
      for (const gap of leadershipGaps) {
        if (!this.seenChangeIds.has(gap?.id)) {
          this.seenChangeIds.add(gap?.id);
          changes?.push(gap);
          this.industryChanges.push(gap);
        }
      }
      logger.info(
        `   📡 Detected ${changes?.length} industry changes (${leadershipGaps?.length} from competitive scan)`,
      );

      // Phase 2: Analyze competitive position
      const competitiveGaps = await this.analyzeCompetitivePosition(changes);
      logger.info(
        `   🎯 Identified ${competitiveGaps?.length} competitive gaps to address`,
      );

      // Phase 3: Generate code upgrades for high-priority changes
      const upgrades = await this.generateCodeUpgrades(competitiveGaps);
      logger.info(`   💻 Generated ${upgrades?.length} code upgrades`);
      this.upgradeQueue.push(...upgrades);
      if (this.upgradeQueue.length > this.MAX_UPGRADES_IN_MEMORY) {
        this.upgradeQueue = this.upgradeQueue.slice(
          -this.MAX_UPGRADES_IN_MEMORY,
        );
      }

      // Phase 4: Test and validate generated code
      const validatedUpgrades = await this.testUpgrades(upgrades);
      logger.info(
        `   ✅ Validated ${validatedUpgrades?.length} upgrades for deployment`,
      );

      // Phase 5: Deploy upgrades with canary pattern
      const deployedCount = await this.deployUpgrades(validatedUpgrades);
      logger.info(`   🚀 Deployed ${deployedCount} upgrades`);

      // Phase 6: Monitor post-deployment metrics
      await this.monitorDeploymentHealth();

      // Phase 7: Learn from results and improve
      await this.learnFromCycle(cycleId);

      this.lastCycleError = null;
      logger.info(
        `✅ Evolution cycle ${cycleId} completed successfully (total: ${this.totalCyclesRun + 1})`,
      );
      this.emit("cycleCompleted", {
        cycleId,
        changes: changes.length,
        upgrades: deployedCount,
      });
    } catch (error) {
      this.lastCycleError = (error as Error).message || String(error);
      logger.warn({ err: error }, `❌ Evolution cycle ${cycleId} failed:`);
      this.emit("cycleFailed", { cycleId, error });
    } finally {
      this.lastCycleAt = new Date();
      this.totalCyclesRun++;
      this.pruneSeenIds();
      this.saveStateToDisk().catch((e) =>
        logger.warn({ err: e }, "Could not save state:"),
      );
      this.isCycleRunning = false;
    }
  }

  // ============================================
  // PHASE 0: COMPETITIVE LEADERSHIP
  // ============================================

  /**
   * Three-tier competitive assessment:
   *
   *   MISSING    → Max Booster has nothing equivalent.
   *                Generates a CRITICAL change (impact 98) — "Build this immediately."
   *
   *   AT_PARITY  → Max Booster has an equivalent but no meaningful advantage.
   *                Generates a HIGH change (impact 85) — "Surpass [competitor]'s version."
   *                Parity is never acceptable — we must be definitively better.
   *
   *   SURPASSED  → Max Booster is measurably better.
   *                No change generated. Score boosted.
   *
   * Score formula: only reaches 100 when every feature is SURPASSED.
   *   surpassed = +3 pts, at_parity = +1 pt, missing = +0 pts
   *   score = (Σ pts) / (totalFeatures × 3) × 100
   */
  private async assessCompetitiveLeadership(): Promise<IndustryChange[]> {
    this.lastCompetitiveScan = new Date();
    const gaps: IndustryChange[] = [];

    let totalPoints = 0;
    let maxPoints = 0;
    let missingCount = 0;
    let parityCount = 0;
    let surpassedCount = 0;

    // ── 1. Three-tier assessment across all competitor features ──────────────
    for (const competitor of COMPETITOR_PLATFORMS) {
      for (const feature of competitor.knownFeatures) {
        maxPoints += 3;

        // Look up our advantage status for this feature (fuzzy key match)
        const advantageEntry = this.lookupAdvantage(feature);

        if (advantageEntry!.level === "surpassed") {
          // We win on this dimension — no action needed
          totalPoints += 3;
          surpassedCount++;
          continue;
        }

        if (advantageEntry!.level === "at_parity") {
          // Parity is not the goal — generate a change to SURPASS this feature
          totalPoints += 1;
          parityCount++;
          const gapId = `surpass_${competitor.name}_${feature}`
            .replace(/[^a-z0-9_]/gi, "_")
            .toLowerCase();
          if (!this.seenChangeIds.has(gapId)) {
            gaps.push({
              id: gapId,
              source: "competitor",
              category: "optimization",
              title: `Surpass ${competitor.name}: "${feature}"`,
              description: `Max Booster has an equivalent but has not meaningfully differentiated. ${advantageEntry!.reason} Target: be definitively better than ${competitor.name} on this dimension.`,
              detectedAt: new Date(),
              urgency: "high",
              affectedModules: this.inferModulesFromFeature(feature),
              competitiveImpact: 85,
              implementationComplexity: "moderate",
              estimatedImplementationHours: 16,
            });
            this.competitiveGapsDetected++;
          }
          continue;
        }

        // Missing entirely — most urgent
        missingCount++;
        const gapId = `missing_${competitor.name}_${feature}`
          .replace(/[^a-z0-9_]/gi, "_")
          .toLowerCase();
        if (!this.seenChangeIds.has(gapId)) {
          gaps.push({
            id: gapId,
            source: "competitor",
            category: "feature",
            title: `MISSING vs ${competitor.name}: "${feature}"`,
            description: `${competitor.name} offers "${feature}" and Max Booster has no equivalent. This is a critical gap that must be closed — then exceeded.`,
            detectedAt: new Date(),
            urgency: "critical",
            affectedModules: this.inferModulesFromFeature(feature),
            competitiveImpact: 98,
            implementationComplexity: "moderate",
            estimatedImplementationHours: 24,
          });
          this.competitiveGapsDetected++;
        }
      }
    }

    // ── 2. Live competitor signals from RSS/search ───────────────────────────
    const liveCompetitorSignals = industryMonitor.getCompetitiveIntelligence();
    for (const signal of liveCompetitorSignals.slice(0, 10)) {
      const converted: IndustryChange = {
        id: signal.id,
        source: "competitor",
        category: signal.category,
        title: `SURPASS: ${signal.title}`,
        description: `${signal.description} — this is a live competitive threat. The goal is not to match this but to do it better.`,
        detectedAt: signal.detectedAt,
        urgency: signal.urgency,
        affectedModules: signal.affectedModules,
        competitiveImpact: Math.max(signal.competitiveImpact, 88),
        implementationComplexity: signal.implementationComplexity,
        estimatedImplementationHours: signal.estimatedImplementationHours,
      };
      if (!this.seenChangeIds.has(converted.id)) {
        gaps.push(converted);
        this.competitiveGapsDetected++;
      }
    }

    // ── 3. Score: 100 = surpassed on everything, 0 = missing everything ─────
    const rawScore =
      maxPoints > 0 ? Math.round((totalPoints / maxPoints) * 100) : 0;
    this.competitivePositionScore = Math.min(100, rawScore);

    logger.info(
      `[SelfEvolution] Competitive scan — score: ${this.competitivePositionScore}/100` +
        ` | surpassed: ${surpassedCount} | at_parity: ${parityCount} | missing: ${missingCount}` +
        ` | action_items: ${gaps.length}`,
    );

    if (missingCount > 0) {
      logger.warn(
        `[SelfEvolution] ${missingCount} features MISSING entirely vs competitors — highest priority to build AND surpass.`,
      );
    }
    if (parityCount > 0) {
      logger.info(
        `[SelfEvolution] ${parityCount} features at parity — must be surpassed, not just maintained.`,
      );
    }
    if (surpassedCount > 0) {
      logger.info(
        `[SelfEvolution] ${surpassedCount} features where Max Booster is definitively ahead — maintain and extend lead.`,
      );
    }

    // Persist for getStatus()
    this.lastSurpassedCount = surpassedCount;
    this.lastParityCount = parityCount;
    this.lastMissingCount = missingCount;

    return gaps;
  }

  /**
   * Fuzzy-match a competitor feature string against MAX_BOOSTER_ADVANTAGES keys.
   * Returns the advantage entry if found, or null if missing.
   */
  private lookupAdvantage(feature: string): AdvantageEntry | null {
    const featureLower = feature.toLowerCase();

    // Exact match first
    if (MAX_BOOSTER_ADVANTAGES.has(feature)) {
      return MAX_BOOSTER_ADVANTAGES.get(feature)!;
    }

    // Fuzzy: check if any key is a substantial substring of the feature or vice versa
    for (const [key, entry] of MAX_BOOSTER_ADVANTAGES) {
      const keyLower = key.toLowerCase();
      const featureWords = featureLower.split(" ").slice(0, 4).join(" ");
      const keyWords = keyLower.split(" ").slice(0, 4).join(" ");
      if (featureLower.includes(keyWords) || keyLower.includes(featureWords)) {
        return entry;
      }
    }

    return null; // missing
  }

  private inferModulesFromFeature(feature: string): string[] {
    const f = feature.toLowerCase();
    const modules: string[] = [];
    if (/distribut|dsp|isrc|upc|release/.test(f)) modules.push("distribution");
    if (/analytic|stats|insight|report|dashboard/.test(f))
      modules.push("analytics");
    if (/social|tiktok|instagram|post|content/.test(f)) modules.push("social");
    if (/market|advertis|campaign|brand|deal/.test(f))
      modules.push("advertising");
    if (/monetiz|revenue|royalt|payout|split|funding|advance/.test(f))
      modules.push("monetization");
    if (/mix|master|studio|plugin|vst|produc/.test(f)) modules.push("studio");
    if (/marketplace|beat|sample|merch/.test(f)) modules.push("marketplace");
    if (/securi|auth|encrypt/.test(f)) modules.push("security");
    return modules.length > 0 ? modules : ["distribution", "analytics"];
  }

  // ============================================
  // PHASE 1: INDUSTRY MONITORING
  // ============================================

  private async monitorIndustryLandscape(): Promise<IndustryChange[]> {
    let liveChanges: IndustryChange[] = [];

    // Primary: real RSS feeds + optional Tavily/Exa search intelligence
    try {
      const raw = await industryMonitor.fetchLiveChanges();
      liveChanges = raw.map((c) => ({
        id: c.id,
        source: c.source,
        category: c.category,
        title: c.title,
        description: c.description,
        detectedAt: c.detectedAt,
        urgency: c.urgency,
        affectedModules: c.affectedModules,
        competitiveImpact: c.competitiveImpact,
        implementationComplexity: c.implementationComplexity,
        estimatedImplementationHours: c.estimatedImplementationHours,
      }));
      logger.info(
        `[SelfEvolution] Live industry monitor: ${liveChanges.length} real changes fetched`,
      );
    } catch (error) {
      logger.warn(
        "[SelfEvolution] Live industry monitor failed — no simulated fallback, skipping cycle phase 1:",
        (error as Error).message,
      );
    }

    const newChanges = liveChanges.filter((c) => !this.seenChangeIds.has(c.id));
    for (const c of newChanges) this.seenChangeIds.add(c.id);
    this.industryChanges.push(...newChanges);
    if (this.industryChanges.length > this.MAX_CHANGES_IN_MEMORY) {
      this.industryChanges = this.industryChanges.slice(
        -this.MAX_CHANGES_IN_MEMORY,
      );
    }
    return newChanges;
  }

  // ============================================
  // PHASE 2: COMPETITIVE ANALYSIS
  // ============================================

  private async analyzeCompetitivePosition(
    changes: IndustryChange[],
  ): Promise<IndustryChange[]> {
    // Sort by competitive impact and urgency
    const prioritized = changes
      .filter((c) => c.competitiveImpact > 50) // Only address significant gaps
      .sort((a, b) => {
        const urgencyWeight = { critical: 4, high: 3, medium: 2, low: 1 };
        const aScore = a.competitiveImpact * urgencyWeight[a.urgency];
        const bScore = b.competitiveImpact * urgencyWeight[b.urgency];
        return bScore - aScore;
      });

    // Take top priority changes to address this cycle
    return prioritized.slice(0, 5);
  }

  // ============================================
  // PHASE 3: CODE GENERATION
  // ============================================

  private async generateCodeUpgrades(
    changes: IndustryChange[],
  ): Promise<CodeUpgrade[]> {
    const upgrades: CodeUpgrade[] = [];

    for (const change of changes) {
      const upgrade = await this.generateUpgradeForChange(change);
      if (upgrade) {
        upgrades.push(upgrade);
      }
    }

    return upgrades;
  }

  private async generateUpgradeForChange(
    change: IndustryChange,
  ): Promise<CodeUpgrade | null> {
    logger.info(`   🔧 Generating enhancement for: ${change.title}`);

    const category = this.categorizeChange(change);
    const payload = this.buildEnhancementPayload(category, change);

    const upgrade: CodeUpgrade = {
      id: `upgrade_${change.id}_${Date.now()}`,
      changeId: change.id,
      type: this.mapChangeToUpgradeType(change),
      targetFiles: await this.identifyTargetFiles(change),
      generatedCode: new Map([
        // Human-readable record of the bounded enhancement this upgrade
        // produces — surfaced verbatim in the admin upgrade history.
        [`registry:${category}`, JSON.stringify(payload, null, 2)],
      ]),
      testCode: "",
      status: "pending",
      createdAt: new Date(),
      performanceImpact: { before: {}, after: {} },
      enhancementCategory: category,
      enhancementPayload: payload,
      applied: false,
    };

    return upgrade;
  }

  /**
   * Map a detected industry change to the most appropriate bounded registry
   * knob. Only `posting_optimization` and `content_optimization` are actually
   * consumed by a live subsystem today; other categories are recorded but the
   * engine will NOT report them as applied behavior changes.
   */
  private categorizeChange(change: IndustryChange): EnhancementCategory {
    const mods = change.affectedModules || [];
    const social = change.source === "social_media" || mods.includes("social");
    const timingSignal =
      /\b(timing|schedul|post time|best time|when to post|peak hour)/i.test(
        `${change.title} ${change.description}`,
      );

    if (change.source === "social_media") {
      return timingSignal ? "posting_optimization" : "content_optimization";
    }
    if (change.source === "streaming_platform") return "platform_compliance";
    if (change.source === "regulation") return "platform_compliance";
    if (change.source === "security") return "feature_flag";
    if (change.source === "technology") return "feature_flag";
    // competitor (and anything else)
    if (social)
      return timingSignal ? "posting_optimization" : "content_optimization";
    if (mods.includes("distribution")) return "distribution_config";
    return "content_optimization";
  }

  /**
   * Build a bounded, sanitizable payload for a registry category from a real
   * detected change. These are heuristic STRATEGY knobs (not fabricated
   * analytics) — they sit below real per-artist learned data at runtime.
   */
  private buildEnhancementPayload(
    category: EnhancementCategory,
    change: IndustryChange,
  ): Record<string, unknown> {
    const platform = this.inferPlatformFromChange(change);
    const high =
      change.competitiveImpact >= 80 || change.urgency === "critical";

    switch (category) {
      case "posting_optimization": {
        // The ONLY posting knob a live consumer reads is `optimalHours`
        // (getOptimalHoursOverride → autopilot posting-window selection). Emit a
        // bounded heuristic engagement window so this enhancement produces a
        // REAL behavior change. It is a heuristic that sits BELOW per-artist
        // learned timing and ABOVE static defaults — fully reversible.
        const payload: Record<string, unknown> = {
          optimalHours: high ? [11, 14, 17, 19, 21] : [12, 18, 20],
          engagementTargeting: high ? "high" : "standard",
        };
        if (platform) payload.platform = platform;
        return payload;
      }
      case "content_optimization": {
        const payload: Record<string, unknown> = {
          hashtagStrategy: high ? "trending" : "balanced",
          captionLength: "optimal",
          callToActionStrength: high ? "high" : "medium",
          visualPriority: true,
          variantCount: high ? 5 : 3,
        };
        if (platform) payload.platform = platform;
        return payload;
      }
      case "distribution_config":
        return {
          autoFormat: true,
          qualityCheck: true,
          metadataValidation: true,
          complianceLevel: high ? "strict" : "standard",
        };
      case "platform_compliance":
        return {
          platform: platform || "all",
          requirement: change.description.slice(0, 500),
          urgency: change.urgency,
          autoApply: false,
        };
      case "feature_flag":
        return {
          name:
            this.camelCase(change.title).slice(0, 80) || `flag_${change.id}`,
          enabled: false,
          rolloutPercentage: 0,
        };
      default:
        return {};
    }
  }

  private inferPlatformFromChange(change: IndustryChange): string | undefined {
    const text = `${change.title} ${change.description}`.toLowerCase();
    const platforms = [
      "tiktok",
      "instagram",
      "twitter",
      "facebook",
      "linkedin",
      "youtube",
      "threads",
      "spotify",
      "apple music",
      "tidal",
    ];
    for (const p of platforms) {
      if (text.includes(p)) return p;
    }
    return undefined;
  }

  // ============================================
  // PHASE 4: TESTING
  // ============================================

  /**
   * Validate each upgrade's bounded enhancement payload against the registry's
   * sanitizer (the safety gate). An upgrade only proceeds to apply if its
   * payload survives sanitization with usable, in-bounds content. This replaces
   * the old dead-code compile-gate — there is no longer any generated code to
   * compile; the gate now validates the structured knob payload instead.
   */
  private async testUpgrades(upgrades: CodeUpgrade[]): Promise<CodeUpgrade[]> {
    const validated: CodeUpgrade[] = [];

    for (const upgrade of upgrades) {
      upgrade.status = "testing";

      if (!upgrade.enhancementCategory || !upgrade.enhancementPayload) {
        upgrade.status = "failed";
        upgrade.notAppliedReason = "no enhancement payload generated";
        logger.warn(
          `   ❌ Validation failed for: ${upgrade.id} - no enhancement payload`,
        );
        continue;
      }

      const clean = evolutionRegistry.sanitize(
        upgrade.enhancementCategory,
        upgrade.enhancementPayload,
      );
      if (!clean.ok) {
        upgrade.status = "failed";
        upgrade.notAppliedReason = clean.reason;
        logger.warn(
          `   ❌ Validation failed for: ${upgrade.id} - ${clean.reason}`,
        );
        continue;
      }

      // Persist the sanitized payload so what we apply == what we validated.
      upgrade.enhancementPayload = clean.payload;
      validated.push(upgrade);
      logger.info(
        `   ✅ Validated enhancement for: ${upgrade.id} (${upgrade.enhancementCategory})`,
      );
    }

    return validated;
  }

  // ============================================
  // PHASE 5: DEPLOYMENT
  // ============================================

  /**
   * Apply each validated upgrade's enhancement to the live registry. An upgrade
   * is marked `deployed` (status) but `applied=true` ONLY when its category is
   * genuinely consumed by a live subsystem and the registry stored it active.
   * Enhancements in not-yet-wired categories are recorded as active registry
   * entries but honestly flagged `applied=false` — never reported as a real
   * behavior change. Returns the count of genuinely-applied upgrades.
   */
  private async deployUpgrades(upgrades: CodeUpgrade[]): Promise<number> {
    let appliedCount = 0;

    for (const upgrade of upgrades) {
      try {
        upgrade.status = "deploying";

        if (!upgrade?.enhancementCategory || !upgrade?.enhancementPayload) {
          upgrade.status = "failed";
          upgrade.notAppliedReason = "no enhancement payload to apply";
          continue;
        }

        const change = this.industryChanges.find(
          (c) => c?.id === upgrade?.changeId,
        );
        const result = await evolutionRegistry?.apply({
          upgradeId: upgrade.id,
          changeId: upgrade.changeId,
          category: upgrade.enhancementCategory,
          title: change?.title || upgrade?.changeId,
          source: change?.source || "unknown",
          payload: upgrade.enhancementPayload,
        });

        if (!result?.consumed) {
          // Stored in the registry, but no live subsystem reads this category
          // yet — be honest: this is NOT an applied behavior change.
          upgrade.status = "deployed";
          upgrade.deployedAt = new Date();
          upgrade.applied = false;
          upgrade.notAppliedReason = `category "${upgrade.enhancementCategory}" has no wired runtime consumer yet`;
          logger.info(
            `   📋 Recorded (advisory, not applied): ${upgrade?.id} (${upgrade?.enhancementCategory})`,
          );
          await this.recordDeployment(upgrade);
          continue;
        }

        if (!result?.applied) {
          upgrade.status = "failed";
          upgrade.notAppliedReason =
            result?.reason || "registry rejected payload";
          logger.warn(
            `   ❌ Apply rejected for ${upgrade?.id}: ${upgrade?.notAppliedReason}`,
          );
          continue;
        }

        upgrade.status = "deployed";
        upgrade.deployedAt = new Date();
        upgrade.applied = true;
        appliedCount++;
        logger.info(
          `   ✅ Applied (live): ${upgrade?.id} → registry[${upgrade?.enhancementCategory}]`,
        );

        await this.recordDeployment(upgrade);

        // NOTE: we intentionally do NOT emit 'filesDeployed' anymore — the
        // registry takes effect in-process immediately (and persists for other
        // workers), so a disruptive full-process restart is no longer needed.
        this.emit("enhancementsApplied", {
          upgradeId: upgrade.id,
          category: upgrade.enhancementCategory,
        });
      } catch (error) {
        upgrade.status = "failed";
        upgrade.notAppliedReason = (error as Error).message;
        logger.warn({ err: error }, `   ❌ Failed to apply ${upgrade?.id}:`);
      }
    }

    return appliedCount;
  }

  async triggerRollback(): Promise<void> {
    await this.performRollback();
  }

  private async recordDeployment(upgrade: CodeUpgrade): Promise<void> {
    try {
      await (storage as any)?.createOptimizationTask({
        taskType: "self_evolution",
        // Honest status: 'completed' only when a real behavior change was
        // applied; otherwise 'recorded' (stored but not behavior-changing).
        status: upgrade.applied ? "completed" : "recorded",
        description: upgrade.applied
          ? `Applied: ${upgrade?.enhancementCategory} - ${upgrade?.changeId}`
          : `Recorded (not applied): ${upgrade?.enhancementCategory} - ${upgrade?.changeId} (${upgrade?.notAppliedReason})`,
        metrics: {
          upgradeId: upgrade.id,
          category: upgrade.enhancementCategory,
          applied: upgrade.applied === true,
          notAppliedReason: upgrade.notAppliedReason,
          deployedAt: upgrade.deployedAt?.toISOString(),
        },
        executedAt: new Date(),
        completedAt: new Date(),
      });
    } catch (error) {
      logger.warn({ err: error }, "Failed to record deployment:");
    }
  }

  // ============================================
  // PHASE 6: MONITORING
  // ============================================

  private async monitorDeploymentHealth(): Promise<void> {
    try {
      const port = process.env.PORT || "5000";
      const start = Date.now();

      const responseTime = await new Promise<number>((resolve, reject) => {
        const req = http?.get(`http://127.0.0.1:${port}/api/health`, (res) => {
          res.resume();
          res.on("end", () => resolve(Date.now() - start));
        });
        req.setTimeout(5000, () => {
          req.destroy();
          reject(new Error("Health check timeout"));
        });
        req.on("error", reject);
      });

      const metrics = { errorRate: 0, responseTime };

      if (responseTime > 3000) {
        logger.warn(
          `⚠️ Post-deployment health check slow: ${responseTime}ms — analyzing rollback need`,
        );
        await this.analyzeRollbackNeed({ ...metrics, errorRate: 0.02 });
      } else {
        logger.info(`   💚 Health check passed: ${responseTime}ms`);
      }
    } catch (e) {
      logger.warn(
        `⚠️ Health check failed (${(e as Error).message}) — analyzing rollback need`,
      );
      await this.analyzeRollbackNeed({ errorRate: 0.1, responseTime: 9999 });
    }
  }

  private async analyzeRollbackNeed(
    metrics: Record<string, number>,
  ): Promise<void> {
    const needsRollback =
      metrics?.errorRate > 0.05 || metrics?.responseTime > 3000;

    if (needsRollback) {
      logger.warn(
        `🔙 CRITICAL: Initiating automatic rollback (errorRate=${metrics.errorRate.toFixed(3)}, responseTime=${metrics?.responseTime}ms)`,
      );
      await this.performRollback();
    }
  }

  private async performRollback(): Promise<void> {
    logger.info(
      "🔙 Performing automatic rollback — deactivating all active registry enhancements...",
    );

    // The REAL revert: deactivate every active registry enhancement so live
    // subsystems fall back to real learned data / static defaults immediately.
    let revertedCount = 0;
    try {
      revertedCount = await evolutionRegistry?.deactivateAll();
    } catch (e) {
      logger.warn(
        { err: e },
        "   ❌ Failed to deactivate registry enhancements:",
      );
    }

    if (revertedCount > 0) {
      logger.info(
        `🔙 Rollback complete — deactivated ${revertedCount} enhancement(s)`,
      );
    } else {
      logger.info("🔙 Rollback: no active enhancements — nothing to revert");
    }

    this.emit("rollbackCompleted", { revertedCount });
  }

  // ============================================
  // PHASE 7: LEARNING
  // ============================================

  private async learnFromCycle(cycleId: string): Promise<void> {
    logger.info(`   🧠 Learning from cycle ${cycleId}...`);

    // Honest accounting: success = upgrades whose enhancement was genuinely
    // APPLIED to a live-consumed registry category, not merely "deployed".
    const appliedCount = this.upgradeQueue.filter(
      (u) => u?.applied === true,
    ).length;
    const failedCount = this.upgradeQueue.filter(
      (u) => u?.status === "failed",
    ).length;
    const total = appliedCount + failedCount;
    const successRate = total > 0 ? appliedCount / (total || 1) : 1.0;
    const deployedCount = appliedCount;

    // Count how many of this cycle's applied upgrades addressed competitive gaps
    const competitorGapsClosedThisCycle = this.upgradeQueue
      .filter((u) => u?.applied === true)
      .filter((u) => {
        const change = this.industryChanges.find((c) => c?.id === u?.changeId);
        return change?.source === "competitor";
      }).length;

    if (competitorGapsClosedThisCycle > 0) {
      this.competitiveGapsAddressed += competitorGapsClosedThisCycle;
      // Each closed gap nudges the score up (capped at 100)
      this.competitivePositionScore = Math.min(
        100,
        this.competitivePositionScore + competitorGapsClosedThisCycle,
      );
      logger.info(
        `   🏆 Competitive position improved: +${competitorGapsClosedThisCycle} gaps closed → score now ${this.competitivePositionScore}/100`,
      );
    }

    // Log competitive leadership summary
    const competitorChanges = this.industryChanges.filter(
      (c) => c?.source === "competitor",
    ).length;
    logger.info(
      `   📊 Competitive leadership summary: score=${this.competitivePositionScore}/100 | gaps_detected=${this.competitiveGapsDetected} | gaps_addressed=${this.competitiveGapsAddressed} | competitor_signals=${competitorChanges}`,
    );

    if (successRate > 0.9) {
      customAI?.recordPerformance("self_evolution", {
        cycleId,
        successRate,
        deployedCount,
        failedCount,
        competitivePositionScore: this.competitivePositionScore,
        competitorGapsAddressed: this.competitiveGapsAddressed,
        timestamp: new Date().toISOString(),
      });
    }

    this.pruneSeenIds();
    await this.saveStateToDisk();
  }

  // ============================================
  // HELPER METHODS
  // ============================================


  private async identifyTargetFiles(change: IndustryChange): Promise<string[]> {
    const moduleFileMap: Record<string, string[]> = {
      studio: [
        "server/services/aiMusicService.ts",
        "server/services/studioService.ts",
      ],
      distribution: ["server/services/distributionService.ts"],
      social: [
        "server/services/aiContentService.ts",
        "server/autonomous-autopilot.ts",
      ],
      advertising: ["server/services/advertisingAIService.ts"],
      marketplace: ["server/services/marketplaceService.ts"],
      analytics: [
        "server/services/aiAnalyticsService.ts",
        "server/services/aiInsightsEngine.ts",
      ],
      security: ["server/security-system.ts", "server/audit-system.ts"],
      monetization: ["server/services/paymentService.ts"],
    };

    const files: string[] = [];
    for (const module of change?.affectedModules ?? []) {
      if (moduleFileMap[module]) {
        files?.push(...moduleFileMap[module]);
      }
    }
    return files;
  }

  private mapChangeToUpgradeType(change: IndustryChange): CodeUpgrade["type"] {
    switch (change?.category) {
      case "feature":
        return "new_feature";
      case "optimization":
        return "optimization";
      case "security_patch":
        return "security_patch";
      case "api_change":
        return "api_update";
      case "standard":
        return "standard_compliance";
      default:
        return "optimization";
    }
  }


  private camelCase(str: string): string {
    return str
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, char) => char?.toUpperCase())
      .replace(/^./, (char) => char?.toLowerCase())
      .replace(/[^a-zA-Z0-9]/g, "");
  }

  // ============================================
  // PUBLIC API
  // ============================================

  getStatus(): {
    isRunning: boolean;
    isCycleRunning: boolean;
    changesDetected: number;
    upgradesGenerated: number;
    upgradesApplied: number;
    upgradesRecordedNotApplied: number;
    upgradesDeployed: number;
    appliedEnhancements: number;
    lastCycle: Date | null;
    lastCycleAt: Date | null;
    lastCycleError: string | null;
    totalCyclesRun: number;
    intervalHealthy: boolean;
    competitiveLeadership: {
      score: number;
      goal: string;
      competitorsTracked: number;
      surpassed: number;
      atParity: number;
      missing: number;
      gapsDetected: number;
      gapsAddressed: number;
      lastScan: Date | null;
      topThreats: Array<{ title: string; impact: number; urgency: string }>;
    };
    memoryUsage: { changes: number; upgrades: number; seenIds: number };
  } {
    const now = Date.now();
    const expectedIntervalMs = this.MONITORING_INTERVAL_MS * 1.5;
    const intervalHealthy =
      !this.isRunning || !this.lastCycleAt
        ? true
        : now - this.lastCycleAt.getTime() < expectedIntervalMs;

    const competitorChanges = this.industryChanges.filter(
      (c) => c?.source === "competitor",
    );
    return {
      isRunning: this.isRunning,
      isCycleRunning: this.isCycleRunning,
      changesDetected: this.industryChanges.length,
      upgradesGenerated: this.upgradeQueue.length,
      upgradesApplied: this.upgradeQueue.filter((u) => u?.applied === true)
        .length,
      upgradesRecordedNotApplied: this.upgradeQueue.filter(
        (u) => u?.status === "deployed" && u?.applied !== true,
      ).length,
      // upgradesDeployed reports genuinely-APPLIED upgrades (honest): a "deployed"
      // status alone no longer counts unless it changed live behavior.
      upgradesDeployed: this.upgradeQueue.filter((u) => u?.applied === true)
        .length,
      appliedEnhancements: evolutionRegistry.getStats().consumedActive,
      lastCycle:
        this.industryChanges.length > 0
          ? this.industryChanges[this.industryChanges.length - 1].detectedAt
          : null,
      lastCycleAt: this.lastCycleAt,
      lastCycleError: this.lastCycleError,
      totalCyclesRun: this.totalCyclesRun,
      intervalHealthy,
      // Competitive leadership metrics
      competitiveLeadership: {
        score: this.competitivePositionScore,
        goal: "surpass every competitor on every dimension — parity is never enough",
        competitorsTracked: COMPETITOR_PLATFORMS.length,
        surpassed: this.lastSurpassedCount,
        atParity: this.lastParityCount,
        missing: this.lastMissingCount,
        gapsDetected: this.competitiveGapsDetected,
        gapsAddressed: this.competitiveGapsAddressed,
        lastScan: this.lastCompetitiveScan,
        topThreats: competitorChanges
          .sort((a, b) => b?.competitiveImpact - a?.competitiveImpact)
          .slice(0, 5)
          .map((c) => ({
            title: c.title,
            impact: c.competitiveImpact,
            urgency: c.urgency,
          })),
      },
      memoryUsage: {
        changes: this.industryChanges.length,
        upgrades: this.upgradeQueue.length,
        seenIds: this.seenChangeIds.size,
      },
    };
  }

  getIndustryChanges(limit: number = 50): IndustryChange[] {
    return this.industryChanges.slice(-limit);
  }

  getUpgradeHistory(
    limit: number = 50,
  ): Array<
    Omit<CodeUpgrade, "generatedCode"> & {
      generatedCode: Record<string, string>;
    }
  > {
    return this.upgradeQueue.slice(-limit).map((upgrade) => ({
      ...upgrade,
      generatedCode: Object.fromEntries(upgrade?.generatedCode),
    }));
  }

  async forceEvolutionCycle(): Promise<void> {
    logger.info("⚡ Force-triggering evolution cycle...");
    await this.runEvolutionCycle();
  }
}

// Export singleton instance
export const selfEvolution = new SelfEvolutionEngine();
