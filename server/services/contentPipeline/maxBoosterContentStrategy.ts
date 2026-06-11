/**
 * Max Booster Content Strategy
 *
 * Generates social media and ad content specifically for Max Booster's own
 * features, subsystems, and workflows. This is the platform's self-promotional
 * pipeline — every module, tool, and capability gets its own content playbook.
 *
 * Subsystems covered:
 * - Studio / DAW (beat-making, mixing, mastering, MIDI, stems)
 * - Distribution (release wizard, DSP delivery, metadata)
 * - Social Management (autopilot, scheduling, listening)
 * - Advertising (ad builder, autopilot, ROAS)
 * - Analytics (insights, HyperLearning, real-time metrics)
 * - Marketplace (beat store, licensing, storefronts)
 * - Collaboration (sessions, contracts, splits)
 * - Career Tools (coach, pitching, label submissions)
 * - Max Assistant (AI system)
 * - Billing / Pro plans
 */

import type { GeneratorContext } from "./contentTypeGenerators.js";
import type { SupportedPlatform } from "./platformFormatters.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MaxBoosterFeature {
  id: string;
  displayName: string;
  category: MaxBoosterCategory;
  tagline: string;
  painPoint: string;
  valueProp: string;
  proofPoint: string;
  ctaText: string;
  ctaDestination: string;
  relevantPlatforms: SupportedPlatform[];
  contentAngles: string[];
}

export type MaxBoosterCategory =
  | "studio"
  | "distribution"
  | "social"
  | "advertising"
  | "analytics"
  | "marketplace"
  | "collaboration"
  | "career"
  | "ai_assistant"
  | "billing";

export interface MaxBoosterContentContext {
  feature: MaxBoosterFeature;
  targetArtistSegment:
    | "bedroom_producer"
    | "emerging_artist"
    | "indie_label"
    | "professional";
  platform: SupportedPlatform;
  format:
    | "feature_highlight"
    | "tutorial_teaser"
    | "social_proof"
    | "comparison"
    | "launch_announcement";
  brandVoice?: GeneratorContext["brandVoice"];
}

export interface MaxBoosterContentPiece {
  featureId: string;
  platform: SupportedPlatform;
  format: MaxBoosterContentContext["format"];
  headline: string;
  caption: string;
  hook: string;
  cta: string;
  hashtags: string[];
  visualDirection: string;
  videoScriptHook?: string;
  source?: string;
}

// ─── Feature Registry ─────────────────────────────────────────────────────────

export const MAX_BOOSTER_FEATURES: MaxBoosterFeature[] = [
  {
    id: "studio_daw",
    displayName: "Pro Studio & DAW",
    category: "studio",
    tagline: "Record, Mix, and Master — All in Your Browser",
    painPoint:
      "Studios cost $200/hour. Most artists can't afford professional production.",
    valueProp:
      "Max Booster gives you a full professional DAW with AI mixing and mastering — free with your subscription.",
    proofPoint: "AI mastering in under 60 seconds. Sounds like a $500 session.",
    ctaText: "Open the Studio",
    ctaDestination: "/studio",
    relevantPlatforms: ["tiktok", "instagram", "youtube", "twitter"],
    contentAngles: [
      "Before/after audio quality comparison",
      "Speed run: produce a beat in 10 minutes",
      "AI mastering reveal — raw vs mastered",
      "Artist using the studio for the first time",
    ],
  },
  {
    id: "distribution_wizard",
    displayName: "Release Wizard & Distribution",
    category: "distribution",
    tagline: "Get on 97 Platforms With One Click",
    painPoint:
      "Uploading to every DSP manually takes hours and costs aggregator fees.",
    valueProp:
      "Upload once. Distribute to 97 platforms simultaneously. No per-release fees.",
    proofPoint:
      "97 DSPs. Spotify, Apple Music, TikTok Sound, YouTube Music — all included.",
    ctaText: "Distribute Your Music",
    ctaDestination: "/distribution",
    relevantPlatforms: [
      "tiktok",
      "instagram",
      "youtube",
      "twitter",
      "linkedin",
    ],
    contentAngles: [
      "One upload → 97 platforms walkthrough",
      "Compare: Max Booster vs DistroKid/TuneCore costs",
      "Friday release optimization — how the algorithm works",
      "Artist's first global release moment",
    ],
  },
  {
    id: "social_autopilot",
    displayName: "Social Autopilot",
    category: "social",
    tagline: "Your Social Media Runs Itself — 24/7",
    painPoint:
      "Artists spend 3+ hours daily on social media and still miss optimal posting windows.",
    valueProp:
      "Max Booster's AI schedules, writes, and posts content automatically — optimized per platform.",
    proofPoint:
      "Posts at peak algorithm windows. Engagement increases by 40% on autopilot.",
    ctaText: "Enable Autopilot",
    ctaDestination: "/social/autopilot",
    relevantPlatforms: [
      "tiktok",
      "instagram",
      "twitter",
      "linkedin",
      "threads",
    ],
    contentAngles: [
      "24 hours of automated posts — what it looks like",
      "AI writing your captions better than you could",
      "Before/after: manual vs autopilot engagement stats",
      "The exact posting schedule the algorithm loves",
    ],
  },
  {
    id: "advertising_autopilot",
    displayName: "Advertising Autopilot",
    category: "advertising",
    tagline: "AI Ads That Actually Convert — On Any Budget",
    painPoint:
      "Running ads is expensive, confusing, and most artists lose money on them.",
    valueProp:
      "Max Booster's AI builds, launches, and optimizes your ad campaigns automatically.",
    proofPoint:
      "Predictive ROAS forecasting. Stop wasting money on ads that don't work.",
    ctaText: "Launch Ad Campaign",
    ctaDestination: "/advertising",
    relevantPlatforms: ["instagram", "facebook", "youtube", "twitter"],
    contentAngles: [
      "$10/day ad strategy breakdown",
      "AI ad copy that outperforms human-written ads",
      "ROAS forecast: know your ROI before you spend",
      "Competitor analysis — what's working for similar artists",
    ],
  },
  {
    id: "hyperlearning_analytics",
    displayName: "HyperLearning Analytics",
    category: "analytics",
    tagline: "AI That Learns 72× Faster Than Human Analysts",
    painPoint:
      "Most artists fly blind — no real data on what's working across platforms.",
    valueProp:
      "Max Booster's HyperLearning engine analyzes your stats 72× faster and predicts your next move.",
    proofPoint: "360 dimensions of data. Micro-patterns human analysts miss.",
    ctaText: "See Your Analytics",
    ctaDestination: "/analytics",
    relevantPlatforms: ["linkedin", "twitter", "instagram", "youtube"],
    contentAngles: [
      "What most artists don't know about their own analytics",
      "Predicting your viral moment before it happens",
      "Cross-platform analytics in one dashboard",
      "A/B testing your content automatically",
    ],
  },
  {
    id: "beat_marketplace",
    displayName: "Beat Marketplace & Storefront",
    category: "marketplace",
    tagline: "Sell Beats While You Sleep",
    painPoint:
      "Producers earn pennies on streaming. The real money is in licensing.",
    valueProp:
      "Launch your own storefront on Max Booster. Sell beats, stems, and licenses directly.",
    proofPoint:
      "Custom licensing templates. Instant digital delivery. 0% platform cut on basic licenses.",
    ctaText: "Open Your Store",
    ctaDestination: "/storefront",
    relevantPlatforms: ["tiktok", "instagram", "youtube", "twitter"],
    contentAngles: [
      "Producer goes from $0 to $500/month on the marketplace",
      "Custom license templates — exclusive vs non-exclusive",
      "How beat tagging drives discovery",
      "Stem pack upsell strategy",
    ],
  },
  {
    id: "collaboration_tools",
    displayName: "Collaboration & Splits",
    category: "collaboration",
    tagline: "Collaborate Without the Drama",
    painPoint:
      "Feature splits and collaboration agreements end careers and friendships.",
    valueProp:
      "Max Booster handles split agreements, session management, and royalty tracking automatically.",
    proofPoint:
      "Digital contracts. Automated split calculations. No lawyers needed.",
    ctaText: "Start Collaborating",
    ctaDestination: "/collaborations",
    relevantPlatforms: ["instagram", "twitter", "linkedin", "threads"],
    contentAngles: [
      "How to set up a fair split agreement in 2 minutes",
      "The split dispute artists never had — because they used Max Booster",
      "Remote session workflow: artist + producer across continents",
      "Auto-tracked royalties — real time",
    ],
  },
  {
    id: "career_coach",
    displayName: "AI Career Coach",
    category: "career",
    tagline: "A Music Industry Veteran in Your Pocket",
    painPoint:
      "Music industry mentorship costs thousands. Most artists have no access to real guidance.",
    valueProp:
      "Max Booster's AI Career Coach gives personalized advice on pitching, releasing, and growing.",
    proofPoint:
      "Label submission guidance. Radio pitching. Playlist pitching. All AI-powered.",
    ctaText: "Talk to Your Coach",
    ctaDestination: "/career",
    relevantPlatforms: ["instagram", "tiktok", "linkedin", "youtube"],
    contentAngles: [
      "Artist gets feedback on their release strategy — live demo",
      "AI career coach vs a real A&R — who wins?",
      "How to pitch your first Spotify playlist",
      "Submitting to labels: what AI Coach recommends",
    ],
  },
  {
    id: "max_assistant",
    displayName: "Max AI Assistant",
    category: "ai_assistant",
    tagline: "Ask Max Anything About Your Music Career",
    painPoint:
      "Artists waste hours Googling industry questions they can't get straight answers to.",
    valueProp:
      "Max Assistant knows the entire music industry. Ask it anything — get a real answer.",
    proofPoint:
      "In-house trained on music industry data. Proactive predictions. Available 24/7.",
    ctaText: "Ask Max",
    ctaDestination: "/assistant",
    relevantPlatforms: ["tiktok", "instagram", "twitter", "threads"],
    contentAngles: [
      "Ask Max: how do I get on Spotify editorial?",
      "Max predicted my viral moment before it happened",
      "The music industry question Max can't answer (spoiler: there isn't one)",
      "Max vs ChatGPT for music industry questions — blind test",
    ],
  },
  {
    id: "pro_billing",
    displayName: "Max Booster Pro Plans",
    category: "billing",
    tagline: "The Entire Music Business Stack for $49/Month",
    painPoint:
      "Artists pay $200+/month across 10 different tools. Still missing features.",
    valueProp:
      "Max Booster Pro: distribution + social + studio + analytics + ads + AI — one price.",
    proofPoint: "$49/month. $468/year. $699 lifetime. Cancel anytime.",
    ctaText: "Go Pro Now",
    ctaDestination: "/billing",
    relevantPlatforms: [
      "instagram",
      "tiktok",
      "youtube",
      "twitter",
      "facebook",
    ],
    contentAngles: [
      "What $49/month gets you: full breakdown",
      "The 10 tools Max Booster replaces (and their combined cost)",
      "Lifetime deal — why this is the best value in music tech",
      "Artist's first month on Pro — what changed",
    ],
  },
];

// ─── Registry lookup ──────────────────────────────────────────────────────────

export function getFeatureById(id: string): MaxBoosterFeature | undefined {
  return MAX_BOOSTER_FEATURES?.find((f) => f?.id === id);
}

export function getFeaturesByCategory(
  category: MaxBoosterCategory,
): MaxBoosterFeature[] {
  return MAX_BOOSTER_FEATURES?.filter((f) => f?.category === category);
}

export function getFeaturesForPlatform(
  platform: SupportedPlatform,
): MaxBoosterFeature[] {
  return MAX_BOOSTER_FEATURES?.filter((f) =>
    f?.relevantPlatforms.includes(platform),
  );
}

// ─── Content Generator ────────────────────────────────────────────────────────

/**
 * Generates a complete content piece for a Max Booster feature on a given platform.
 * Uses the feature registry to pick the right angle and assembles platform-aware copy.
 */
export function generateMaxBoosterContent(
  ctx: MaxBoosterContentContext,
): MaxBoosterContentPiece {
  const { feature, platform, format, targetArtistSegment } = ctx;

  const segmentAdjective: Record<string, string> = {
    bedroom_producer: "bedroom producer",
    emerging_artist: "emerging artist",
    indie_label: "indie label owner",
    professional: "professional artist",
  };

  const _angle =
    feature?.contentAngles[
      Math?.abs(
        [...feature?.id].reduce((h, c) => (h * 31 + c?.charCodeAt(0)) | 0, 0),
      ) % feature?.contentAngles.length
    ];

  const formatTemplates: Record<
    MaxBoosterContentContext["format"],
    () => MaxBoosterContentPiece
  > = {
    feature_highlight: () => ({
      featureId: feature?.id,
      platform,
      format,
      headline: feature?.tagline,
      hook: `${feature?.painPoint} 🚫`,
      caption: `${feature?.tagline}\n\n${feature?.valueProp}\n\n✅ ${feature?.proofPoint}\n\n${feature?.ctaText} →`,
      cta: feature?.ctaText,
      hashtags: buildMaxBoosterHashtags(feature?.category, platform),
      visualDirection: `Feature UI screenshot or demo clip. Text overlay: "${feature?.tagline}". Color: Max Booster brand palette.`,
    }),

    tutorial_teaser: () => ({
      featureId: feature?.id,
      platform,
      format,
      headline: `How to: ${angle}`,
      hook: `Did you know Max Booster can do this? 👀`,
      caption: `Tutorial: ${angle}\n\nThis is how ${segmentAdjective[targetArtistSegment]}s are using Max Booster's ${feature?.displayName}.\n\n${feature?.valueProp}\n\n👉 ${feature?.ctaText}`,
      cta: "Watch Full Tutorial",
      hashtags: buildMaxBoosterHashtags(feature?.category, platform),
      visualDirection: `Screen recording walkthrough of ${feature?.displayName}. Add text overlays for each step.`,
      videoScriptHook: `If you're a ${segmentAdjective[targetArtistSegment]}, you need to see this.`,
    }),

    social_proof: () => ({
      featureId: feature?.id,
      platform,
      format,
      headline: `Artists are using ${feature?.displayName} to change their careers`,
      hook: `Real ${segmentAdjective[targetArtistSegment]}s. Real results. 📊`,
      caption: `${feature?.displayName} — what it looks like in real life:\n\n✅ ${feature?.proofPoint}\n\n${feature?.valueProp}\n\nReady to see what it can do for you?\n${feature?.ctaText} →`,
      cta: feature?.ctaText,
      hashtags: buildMaxBoosterHashtags(feature?.category, platform),
      visualDirection: `Social proof graphic — stat overlay on artist imagery. Include real metric (${feature?.proofPoint}).`,
    }),

    comparison: () => ({
      featureId: feature?.id,
      platform,
      format,
      headline: `Max Booster vs the alternatives`,
      hook: `Why pay for 10 tools when one does it all? 🤔`,
      caption: `${feature?.painPoint}\n\nOld way: expensive, fragmented, time-consuming.\nMax Booster way: ${feature?.valueProp}\n\n${feature?.proofPoint}\n\n${feature?.ctaText} — No credit card required.`,
      cta: "Try Free",
      hashtags: buildMaxBoosterHashtags(feature?.category, platform),
      visualDirection: `Split-screen comparison: "Before Max Booster" vs "After Max Booster". Use red/green visual language.`,
    }),

    launch_announcement: () => ({
      featureId: feature?.id,
      platform,
      format,
      headline: `🚀 Introducing: ${feature?.displayName}`,
      hook: `Something big just dropped at Max Booster 🎉`,
      caption: `🚀 JUST LAUNCHED: ${feature?.displayName}\n\n${feature?.tagline}\n\n${feature?.valueProp}\n\nAvailable now for all Max Booster subscribers.\n\n👉 ${feature?.ctaText}`,
      cta: feature?.ctaText,
      hashtags: [
        "#MaxBooster",
        "#MusicTech",
        "#NewFeature",
        "#IndependentArtist",
        ...buildMaxBoosterHashtags(feature?.category, platform),
      ],
      visualDirection: `Launch announcement graphic — confetti/celebratory style. Feature name large. Max Booster brand colors.`,
    }),
  };

  return formatTemplates[format]();
}

function buildMaxBoosterHashtags(
  category: MaxBoosterCategory,
  _platform: SupportedPlatform,
): string[] {
  const _base = [
    "#MaxBooster",
    "#MusicBusiness",
    "#IndependentArtist",
    "#MusicMarketing",
  ];
  const categoryTags: Record<MaxBoosterCategory, string[]> = {
    studio: [
      "#MusicProduction",
      "#HomeStudio",
      "#BeatMaking",
      "#MixingAndMastering",
    ],
    distribution: [
      "#MusicDistribution",
      "#IndieRelease",
      "#NewMusicFriday",
      "#StreamingMusic",
    ],
    social: [
      "#SocialMediaMarketing",
      "#ContentCreator",
      "#MusicMarketing",
      "#ArtistGrowth",
    ],
    advertising: [
      "#MusicAds",
      "#ArtistMarketing",
      "#MusicPromotion",
      "#PaidAds",
    ],
    analytics: [
      "#DataDriven",
      "#MusicAnalytics",
      "#ArtistInsights",
      "#GrowthHacking",
    ],
    marketplace: [
      "#BeatMarketplace",
      "#BeatSales",
      "#ProducerLife",
      "#BeatMaker",
    ],
    collaboration: [
      "#MusicCollaboration",
      "#SplitSheets",
      "#MusicBusiness",
      "#ArtistCollab",
    ],
    career: [
      "#MusicCareer",
      "#ArtistDevelopment",
      "#MusicIndustry",
      "#CareerAdvice",
    ],
    ai_assistant: ["#MusicAI", "#AIForArtists", "#MusicTech", "#FutureOfMusic"],
    billing: [
      "#MusicSubscription",
      "#MusicTech",
      "#ProTools",
      "#ArtistResources",
    ],
  };
  return [...base, ...(categoryTags[category] ?? [])].slice(0, 15);
}

/**
 * Generates content pieces for ALL Max Booster features across given platforms.
 * Returns a flat array of content pieces ready for formatting and scheduling.
 */
export function generateAllMaxBoosterContent(
  platforms: SupportedPlatform[],
  targetSegment: MaxBoosterContentContext["targetArtistSegment"] = "emerging_artist",
): MaxBoosterContentPiece[] {
  const pieces: MaxBoosterContentPiece[] = [];
  const formats: MaxBoosterContentContext["format"][] = [
    "feature_highlight",
    "tutorial_teaser",
    "social_proof",
  ];

  for (const feature of MAX_BOOSTER_FEATURES) {
    for (const platform of platforms) {
      if (!feature?.relevantPlatforms.includes(platform)) continue;
      const _format =
        formats[MAX_BOOSTER_FEATURES?.indexOf(feature) % formats?.length];
      pieces?.push({
        ...generateMaxBoosterContent({
          feature,
          targetArtistSegment: targetSegment,
          platform,
          format,
        }),
        source: "MaxCoreAI",
      });
    }
  }

  return pieces;
}
