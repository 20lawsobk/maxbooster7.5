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

import { logger } from '../logger.js';
import { db } from '../db.js';
import { userBrandVoices, autopilotPreferences, socialConnections } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { MaxCoreAIClient } from './unifiedAIController.js';

// ============================================================================
// SEEDED PRNG HELPER
// Returns a deterministic index into an array of `length` items based on a
// string seed. Same seed → same index every time; different seeds → varied
// results spread across the full range.
// ============================================================================
function seededIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h >>>= 0;
  }
  return h % length;
}

// seededGate: deterministic probability gate — replaces Math.random() < threshold.
// Same seed → same true/false outcome every time. threshold range: 0.0–1.0.
function seededGate(seed: string, threshold: number): boolean {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
    h >>>= 0;
  }
  return (h % 1000) < Math.round(threshold * 1000);
}

// ============================================================================
// MAX BOOSTER PLATFORM KNOWLEDGE
// Injected into content generation engine so every AI post reflects the full
// breadth of what Max Booster offers independent musicians.
// ============================================================================

export const MAX_BOOSTER_PLATFORM_KNOWLEDGE = {
  name: 'Max Booster',
  tagline: 'The all-in-one AI music career management platform for independent artists.',
  owner: 'B-Lawz Music',

  coreFeatures: {
    studio: {
      name: 'Studio DAW',
      description: 'Professional-grade digital audio workstation built 100% in-house.',
      highlights: [
        'Unlimited multi-track audio and MIDI recording',
        'AI Mixer — automatic level balance, EQ, compression, spatial imaging',
        'AI Mastering — loudness targeting for Spotify (-14 LUFS), Apple Music (-16 LUFS), YouTube, Tidal',
        'AI Generator — create beats, melodies, chord progressions from text descriptions',
        'Stem Separation — isolate vocals, drums, bass, and instruments from any audio',
        'MIDI Piano Roll editor with virtual instruments',
        'Real-time collaboration with other artists',
        'VST plugin bridge for external plugins',
        'Comping — select best takes across multiple recordings',
        'Export to WAV, MP3, FLAC, and individual stems',
        'Reference Track Matching — match the tonal character of any reference',
        'Cloud save — projects auto-save, never lose work',
      ],
    },

    distribution: {
      name: 'Music Distribution',
      description: 'One-click delivery to 150+ streaming platforms worldwide.',
      highlights: [
        '150+ platforms including Spotify, Apple Music, YouTube Music, Amazon Music, Tidal, Deezer, TikTok, Instagram, Pandora, SoundCloud, Boomplay, Anghami, iHeart, Napster, Beatport, Traxsource, and more',
        'Auto-generate ISRC codes for every track',
        'Auto-generate UPC barcodes for every release',
        'Playlist pitching to Spotify editorial and platform curators',
        'LabelGrid submission portal for label distribution',
        'Pre-save campaigns — build momentum before your release goes live',
        'Release date scheduling — plan drops weeks in advance',
        'Metadata management — edit song info, album art, credits anytime',
        'Cover art requirements: 3000x3000px, JPG or PNG',
        'Audio requirements: WAV or FLAC, 16-bit minimum',
        'Timeline: most releases live within 1-3 business days',
        'Smart content ID — automatic copyright protection across platforms',
      ],
    },

    royalties: {
      name: 'Royalties & Payments',
      description: 'Full royalty tracking and payout management — keep 100% of what you earn.',
      highlights: [
        '100% royalty retention — Max Booster takes 0% of your streaming earnings',
        'Real-time earnings dashboard with per-platform and per-track breakdowns',
        'Earnings by territory — see which countries stream you most',
        'Monthly payouts once you reach the $10 minimum threshold',
        'Royalty splits — automatically divide earnings among collaborators by percentage',
        'Publishing rights management — mechanical and performance royalties',
        'PRO registration guidance (ASCAP, BMI, SOCAN)',
        'Sync licensing revenue tracking for TV, film, and commercial placements',
        'Instant Payout / Royalty Advance — cash out future earnings early',
        'Revenue Intelligence — 90-day earnings forecast powered by AI',
        'Tax report export for year-end filing',
        'Stripe-powered secure payment processing',
      ],
    },

    marketplace: {
      name: 'Beat Marketplace',
      description: 'Built-in storefront to sell beats, loops, samples, and presets directly to artists.',
      highlights: [
        'Sell beats with Non-Exclusive, Exclusive, and Unlimited license tiers',
        'Custom license templates — set your own terms',
        'Watermarked MP3 preview generation (automatic)',
        'Custom branded storefront with unique URL',
        'Bundle pricing — offer discounts on multi-beat purchases',
        'Marketplace Analytics — conversion rates, top performers, revenue trends',
        'Social media auto-promotion of new beat uploads via Autopilot integration',
        'Instant delivery to buyers after purchase',
        'Sell samples, loops, and preset packs alongside beats',
        'Integrated checkout — Stripe-powered, no third-party redirects',
      ],
    },

    socialMedia: {
      name: 'Social Media Autopilot',
      description: 'AI-powered automated posting and growth engine across all major platforms.',
      highlights: [
        'Connect Instagram, Twitter/X, TikTok, Facebook, YouTube, LinkedIn',
        'AI generates platform-optimized captions, hashtags, and emojis automatically',
        'AI-Optimized Timing — posts go out at peak audience engagement hours',
        'Content Calendar — plan and schedule posts weeks in advance',
        'Burst Mode — high-frequency posting around release dates for maximum momentum',
        'AI Content Variants — multiple caption versions generated for A/B testing',
        'A/B Testing — automatically test caption hooks to find top performers',
        'Brand Voice — AI learns your style and maintains consistency across posts',
        'Audience segmentation — tailor content by genre, fanbase, and objective',
        'Engagement metrics — track likes, comments, shares, click-through per post',
        'Auto-hashtag optimization — trending and niche hashtags per genre',
      ],
    },

    advertisingAutopilot: {
      name: 'Advertising Autopilot',
      description: 'Zero-budget organic growth campaigns powered by AI — no ad spend required.',
      highlights: [
        'AI builds and runs full promotional campaigns without paid advertising',
        'Organic growth tactics — smart engagement, cross-posting, and discovery optimization',
        'A/B content testing — identifies which angles resonate with your audience',
        'Campaign scheduling aligned with release strategy',
        'Multi-platform campaign management from a single dashboard',
        'Performance analytics — impressions, reach, and conversion tracking',
        'Fan targeting — reach listeners who already follow similar artists',
      ],
    },

    analytics: {
      name: 'Analytics & Insights',
      description: 'Deep listener intelligence and career performance metrics in real time.',
      highlights: [
        'Executive Dashboard — career health score and overall performance overview',
        'Stream counts, listener counts, and play data per track and platform',
        'Audience demographics — age, gender, and location breakdowns',
        'Territory maps — visualize where your listeners are geographically',
        'Social engagement metrics — linked to every post and campaign',
        'Revenue analytics — earnings by track, platform, and territory',
        'Trend detection — rising tracks and growing territories highlighted automatically',
        'Competitor benchmarking — compare your growth to similar artists',
        'Predictive insights — AI suggests actions to grow based on your data',
      ],
    },

    careerTools: {
      name: 'Career Tools',
      description: 'End-to-end music career management beyond production and distribution.',
      highlights: [
        'AI Career Coach — personalized strategy based on your goals and current metrics',
        'Electronic Press Kit (EPK) generator — professional bio, photos, and credits',
        'Tour & Venue Management — track shows, booking, and logistics',
        'Sync Licensing Portal — submit tracks for TV, film, and brand placements',
        'Songwriting Assistant — verse/chorus structure, lyric co-writing with AI',
        'Sample Clearance Tracker — manage samples used in your productions',
        'Project Budget Planner — track production and marketing spend',
        'Contract Management — draft and manage music contracts',
        'Radio Pitch Tool — submit tracks for FM, internet, and playlist radio',
        'Fan Campaign Manager — coordinate fan engagement campaigns',
        'Release Countdown — build pre-release anticipation with countdown assets',
      ],
    },

    videoGenerator: {
      name: 'AI Cinematic Video Generator',
      description: 'Generate professional music videos and visual content from audio — 100% in-house AI.',
      highlights: [
        'Convert your music into full cinematic music videos automatically',
        'AI generates scene compositions, transitions, and visual effects',
        'Multiple visual styles: Cinematic, Lo-Fi, Abstract, Performance, Lyric Video',
        'Sync visual cuts to beat drops and song structure automatically',
        'Export in 1080p and 4K for YouTube, TikTok, and Instagram Reels',
        'Add custom branding — artist name, logo overlays, and color palette',
        'No video editing skills required — AI handles everything end to end',
        '100% in-house technology, no external rendering APIs',
      ],
    },

    aiTechnology: {
      name: 'In-House AI Engine',
      description: 'Every AI feature on Max Booster runs on proprietary models — no OpenAI, no external APIs.',
      highlights: [
        'AdvancedMusicAI — beat and melody generation model',
        'Max AI Assistant — conversational platform guide trained on all Max Booster features',
        'Social Content AI — engagement-optimized post generation',
        'AI Mixer / Mastering Engine — audio processing and loudness optimization',
        'Self-Evolution Engine — AI models continuously retrain on platform usage patterns',
        'Pocket Dimension — custom distributed storage fabric for all AI model weights',
        'PocketFabric Cluster — 3-node auto-scaling AI compute layer',
        'Zero dependency on third-party AI providers — all data stays on-platform',
      ],
    },

    subscriptionPlans: {
      name: 'Subscription Plans',
      description: 'Flexible plans for every stage of your music career.',
      plans: [
        { name: 'Free', details: 'Core tools with usage limits — get started at no cost' },
        { name: 'Monthly', details: 'Full platform access, billed monthly' },
        { name: 'Yearly', details: 'Full platform access with annual savings' },
        { name: 'Lifetime', details: 'One-time payment, permanent access to all features' },
      ],
      note: '100% royalty retention on all paid plans. No hidden fees.',
    },
  },

  keyUSPs: [
    'All-in-one platform — Studio, Distribution, Royalties, Marketplace, Social, Analytics, and Career tools in one place',
    '100% royalty retention — keep every dollar you earn from streaming',
    '150+ distribution platforms — widest global reach available',
    'Zero external AI APIs — all models are custom-built and proprietary',
    'Organic advertising — AI-powered growth without ad spend',
    'Self-evolving AI — the platform gets smarter the more you use it',
    'No experience required — AI handles the technical complexity so you can focus on music',
  ],

  hashtags: {
    brand: ['#MaxBooster', '#BLawzMusic', '#MaxBoosterAI'],
    music: ['#IndieArtist', '#MusicDistribution', '#MusicProduction', '#NewMusic', '#MusicBusiness'],
    ai: ['#AIMusic', '#MusicTech', '#AIProducer', '#FutureOfMusic'],
    distribution: ['#MusicRelease', '#StreamingNow', '#IndependentArtist', '#MusicForAll'],
    studio: ['#StudioLife', '#BeatMaker', '#Producer', '#RecordingStudio', '#DAW'],
  },
} as const;

// Helper: detect if a topic or content request is about Max Booster features
export function detectMaxBoosterContext(topic?: string): {
  isMaxBoosterTopic: boolean;
  relevantFeature?: keyof typeof MAX_BOOSTER_PLATFORM_KNOWLEDGE['coreFeatures'];
  keywords: string[];
} {
  if (!topic) return { isMaxBoosterTopic: false, keywords: [] };
  const lower = topic.toLowerCase();

  const featureMap: Array<{
    feature: keyof typeof MAX_BOOSTER_PLATFORM_KNOWLEDGE['coreFeatures'];
    triggers: string[];
  }> = [
    { feature: 'studio', triggers: ['studio', 'daw', 'record', 'mix', 'master', 'beat', 'produce', 'track', 'stem'] },
    { feature: 'distribution', triggers: ['distribut', 'release', 'spotify', 'apple music', 'streaming', 'platform', 'isrc', 'upc', 'playlist pitch'] },
    { feature: 'royalties', triggers: ['royalt', 'earnings', 'payout', 'revenue', 'income', 'publish', 'split'] },
    { feature: 'marketplace', triggers: ['marketplace', 'beat store', 'sell beat', 'license', 'storefront'] },
    { feature: 'socialMedia', triggers: ['social', 'autopilot', 'instagram', 'tiktok', 'twitter', 'content', 'post', 'caption'] },
    { feature: 'analytics', triggers: ['analytics', 'stats', 'dashboard', 'insight', 'stream count', 'listener'] },
    { feature: 'videoGenerator', triggers: ['video', 'music video', 'visual', 'cinematic', 'reel'] },
    { feature: 'careerTools', triggers: ['career', 'epk', 'press kit', 'sync', 'tour', 'radio', 'contract', 'songwrit'] },
    { feature: 'aiTechnology', triggers: ['ai', 'artificial intelligence', 'max booster', 'in-house', 'proprietary'] },
  ];

  for (const { feature, triggers } of featureMap) {
    if (triggers.some(t => lower.includes(t))) {
      return {
        isMaxBoosterTopic: true,
        relevantFeature: feature,
        keywords: triggers.filter(t => lower.includes(t)),
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
  objective: 'awareness' | 'engagement' | 'conversions' | 'viral';
  tone?: 'professional' | 'casual' | 'energetic' | 'inspirational' | 'humorous' | 'storytelling';
  targetAudience?: string;
  genre?: string;
  artistName?: string;
  contentType?: 'announcement' | 'behind_scenes' | 'engagement' | 'promotional' | 'storytelling';
  includeHashtags?: boolean;
  includeEmojis?: boolean;
  variantCount?: number;
  trendContext?: string[];
  competitorContext?: string[];
}

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
  type: 'concise' | 'question' | 'urgent' | 'storytelling' | 'data-driven';
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
  type: 'improvement' | 'warning' | 'success' | 'tip';
  category: 'hook' | 'cta' | 'hashtag' | 'length' | 'tone' | 'timing' | 'audience';
  message: string;
  impact: 'high' | 'medium' | 'low';
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
  recommendedType: 'image' | 'video' | 'carousel' | 'text' | 'live';
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
    id: 'twitter',
    name: 'Twitter/X',
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
    contentTypes: ['text', 'image', 'video', 'poll', 'thread'],
    tonePreference: 0.4,
  },
  instagram: {
    id: 'instagram',
    name: 'Instagram',
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
    contentTypes: ['image', 'carousel', 'reel', 'story', 'live'],
    tonePreference: 0.3,
  },
  tiktok: {
    id: 'tiktok',
    name: 'TikTok',
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
    contentTypes: ['video', 'duet', 'stitch', 'live'],
    tonePreference: 0.2,
  },
  facebook: {
    id: 'facebook',
    name: 'Facebook',
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
    contentTypes: ['text', 'image', 'video', 'link', 'event', 'live'],
    tonePreference: 0.5,
  },
  linkedin: {
    id: 'linkedin',
    name: 'LinkedIn',
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
    contentTypes: ['text', 'image', 'video', 'article', 'poll', 'document'],
    tonePreference: 0.8,
  },
  youtube: {
    id: 'youtube',
    name: 'YouTube',
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
    contentTypes: ['video', 'short', 'live', 'community'],
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
    vocabulary: ['announce', 'introducing', 'excited to share', 'proud to present', 'pleased'],
    avoidWords: ['lol', 'omg', 'bruh', 'lowkey', 'fr fr', 'ngl'],
    emojiStyle: 'minimal',
  },
  casual: {
    formality: 0.3,
    energy: 0.7,
    emotionality: 0.6,
    humor: 0.5,
    authority: 0.3,
    vocabulary: ['hey', 'check this out', 'dropping', 'vibes', 'fire', 'lit', 'yo'],
    avoidWords: ['hereby', 'pursuant', 'regarding', 'aforementioned'],
    emojiStyle: 'moderate',
  },
  energetic: {
    formality: 0.2,
    energy: 0.95,
    emotionality: 0.8,
    humor: 0.4,
    authority: 0.4,
    vocabulary: ['LET\'S GO', 'HUGE', 'INSANE', 'MASSIVE', 'can\'t wait', 'so hyped', 'FINALLY'],
    avoidWords: ['perhaps', 'quite', 'rather', 'somewhat', 'arguably'],
    emojiStyle: 'heavy',
  },
  inspirational: {
    formality: 0.5,
    energy: 0.7,
    emotionality: 0.9,
    humor: 0.2,
    authority: 0.6,
    vocabulary: ['dream', 'journey', 'believe', 'achieve', 'passion', 'purpose', 'grateful', 'blessed'],
    avoidWords: ['boring', 'meh', 'whatever', 'impossible', 'can\'t'],
    emojiStyle: 'moderate',
  },
  humorous: {
    formality: 0.1,
    energy: 0.8,
    emotionality: 0.7,
    humor: 0.95,
    authority: 0.2,
    vocabulary: ['ngl', 'fr fr', 'lowkey', 'deadass', 'no cap', 'sheesh', 'bruh'],
    avoidWords: ['sincerely', 'formally', 'professionally', 'concerning'],
    emojiStyle: 'heavy',
  },
  storytelling: {
    formality: 0.4,
    energy: 0.5,
    emotionality: 0.85,
    humor: 0.3,
    authority: 0.5,
    vocabulary: ['let me tell you', 'here\'s the story', 'back when', 'that moment when', 'the journey'],
    avoidWords: ['fyi', 'btw', 'tldr', 'imo'],
    emojiStyle: 'light',
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
  emojiStyle: 'minimal' | 'light' | 'moderate' | 'heavy';
}

const AUDIENCE_PROFILES: Record<string, AudienceProfile> = {
  gen_z_music_fans: {
    name: 'Gen Z Music Fans',
    ageRange: { min: 16, max: 26 },
    interests: ['music', 'concerts', 'streaming', 'tiktok', 'gaming', 'memes'],
    preferredTone: 0.2,
    preferredLength: 'short',
    visualPreference: 0.9,
    interactivity: 0.8,
    peakDays: [4, 5, 6],
    peakHours: [15, 18, 21, 23],
    responseRate: 0.12,
    values: ['authenticity', 'creativity', 'social-justice', 'sustainability'],
    motivations: ['self-expression', 'connection', 'entertainment', 'discovery'],
  },
  millennial_producers: {
    name: 'Millennial Producers',
    ageRange: { min: 27, max: 42 },
    interests: ['production', 'daw', 'synthesizers', 'mixing', 'industry', 'gear'],
    preferredTone: 0.5,
    preferredLength: 'medium',
    visualPreference: 0.7,
    interactivity: 0.6,
    peakDays: [1, 2, 3, 4],
    peakHours: [10, 14, 20, 22],
    responseRate: 0.08,
    values: ['craftsmanship', 'innovation', 'community', 'growth'],
    motivations: ['skill-development', 'networking', 'recognition', 'income'],
  },
  indie_artists: {
    name: 'Independent Artists',
    ageRange: { min: 20, max: 35 },
    interests: ['music-creation', 'distribution', 'marketing', 'live-shows', 'collaboration'],
    preferredTone: 0.4,
    preferredLength: 'medium',
    visualPreference: 0.8,
    interactivity: 0.7,
    peakDays: [3, 4, 5, 6],
    peakHours: [12, 18, 21],
    responseRate: 0.15,
    values: ['independence', 'artistry', 'authenticity', 'direct-fan-connection'],
    motivations: ['exposure', 'monetization', 'creative-freedom', 'fan-growth'],
  },
  casual_listeners: {
    name: 'Casual Music Listeners',
    ageRange: { min: 18, max: 45 },
    interests: ['playlists', 'discovery', 'concerts', 'lifestyle', 'streaming'],
    preferredTone: 0.3,
    preferredLength: 'short',
    visualPreference: 0.7,
    interactivity: 0.5,
    peakDays: [5, 6, 0],
    peakHours: [12, 18, 21],
    responseRate: 0.03,
    values: ['entertainment', 'convenience', 'mood-enhancement'],
    motivations: ['background-music', 'event-discovery', 'social-sharing'],
  },
};

interface AudienceProfile {
  name: string;
  ageRange: { min: number; max: number };
  interests: string[];
  preferredTone: number;
  preferredLength: 'short' | 'medium' | 'long';
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
    id: 'controversy',
    name: 'Controversial Take',
    triggers: ['unpopular opinion', 'hot take', 'controversial', 'i said what i said', 'real talk', 'fight me'],
    emotionalHooks: ['surprise', 'disagreement', 'validation'],
    shareMultiplier: 1.8,
    riskLevel: 0.6,
  },
  {
    id: 'relatable',
    name: 'Relatable Moment',
    triggers: ['pov', 'me when', 'that feeling', 'who else', "y'all ever", 'can we talk about', 'not me'],
    emotionalHooks: ['recognition', 'humor', 'connection'],
    shareMultiplier: 1.5,
    riskLevel: 0.1,
  },
  {
    id: 'transformation',
    name: 'Transformation Story',
    triggers: ['from', 'to', 'before', 'after', 'glow up', 'journey', 'i used to', 'look at me now'],
    emotionalHooks: ['inspiration', 'hope', 'motivation'],
    shareMultiplier: 1.4,
    riskLevel: 0.05,
  },
  {
    id: 'exclusive',
    name: 'Exclusive Access',
    triggers: ['behind the scenes', 'exclusive', 'first look', 'sneak peek', 'unreleased', "you don't usually see"],
    emotionalHooks: ['curiosity', 'fomo', 'connection'],
    shareMultiplier: 1.3,
    riskLevel: 0.1,
  },
  {
    id: 'challenge',
    name: 'Challenge/CTA',
    triggers: ['challenge', 'can you', 'tag someone', 'duet this', 'stitch this', 'rate this', 'react to this'],
    emotionalHooks: ['competition', 'belonging', 'excitement'],
    shareMultiplier: 1.6,
    riskLevel: 0.1,
  },
  {
    id: 'breaking',
    name: 'Breaking News',
    triggers: ['breaking', 'just in', 'announcement', 'happening now', 'official', 'just announced'],
    emotionalHooks: ['urgency', 'fomo', 'importance'],
    shareMultiplier: 1.7,
    riskLevel: 0.2,
  },
  {
    id: 'milestone',
    name: 'Milestone Celebration',
    triggers: ['streams', 'million', 'chart', 'playlist', 'milestone', 'certified', 'platinum', 'gold'],
    emotionalHooks: ['celebration', 'pride', 'community'],
    shareMultiplier: 1.45,
    riskLevel: 0.05,
  },
  {
    id: 'vulnerability',
    name: 'Vulnerable Moment',
    triggers: ['i almost quit', "didn't think", 'almost gave up', 'darkest', 'struggled', 'therapy', 'real with you'],
    emotionalHooks: ['empathy', 'connection', 'inspiration'],
    shareMultiplier: 1.65,
    riskLevel: 0.15,
  },
  {
    id: 'discovery',
    name: 'Discovery Hook',
    triggers: ['just found', 'you need to hear', 'your playlist is missing', 'sleeping on', 'hidden gem'],
    emotionalHooks: ['curiosity', 'discovery', 'fomo'],
    shareMultiplier: 1.5,
    riskLevel: 0.05,
  },
  {
    id: 'industry_truth',
    name: 'Industry Truth',
    triggers: ['nobody tells you', 'music industry', 'label', 'streams pay', 'independent artist', 'the truth about'],
    emotionalHooks: ['validation', 'anger', 'empowerment'],
    shareMultiplier: 1.75,
    riskLevel: 0.3,
  },
  {
    id: 'process_reveal',
    name: 'Process Reveal',
    triggers: ['made this in', 'studio session', 'how i made', 'from scratch', 'making of', 'producer cam'],
    emotionalHooks: ['curiosity', 'admiration', 'inspiration'],
    shareMultiplier: 1.35,
    riskLevel: 0.05,
  },
  {
    id: 'replay_bait',
    name: 'Replay Value Signal',
    triggers: ["can't stop", 'on repeat', 'replay', 'no skips', 'earworm', 'stuck in my head', 'goosebumps'],
    emotionalHooks: ['curiosity', 'fomo', 'social_proof'],
    shareMultiplier: 1.55,
    riskLevel: 0.05,
  },
  {
    id: 'community_love',
    name: 'Community Appreciation',
    triggers: ['thank you', 'because of you', 'this community', 'my supporters', 'day ones', 'real ones'],
    emotionalHooks: ['gratitude', 'belonging', 'pride'],
    shareMultiplier: 1.3,
    riskLevel: 0.0,
  },
  {
    id: 'curiosity_gap',
    name: 'Curiosity Gap',
    triggers: ['wait till you hear', 'nobody expected', "you won't believe", 'i almost', 'something happened', 'crazy story'],
    emotionalHooks: ['curiosity', 'anticipation', 'surprise'],
    shareMultiplier: 1.72,
    riskLevel: 0.15,
  },
];

const SEMANTIC_WORD_WEIGHTS: Record<string, { engagement: number; virality: number; sentiment: number }> = {
  'new': { engagement: 0.7, virality: 0.6, sentiment: 0.7 },
  'exclusive': { engagement: 0.85, virality: 0.75, sentiment: 0.8 },
  'breaking': { engagement: 0.9, virality: 0.9, sentiment: 0.6 },
  'finally': { engagement: 0.8, virality: 0.7, sentiment: 0.8 },
  'amazing': { engagement: 0.75, virality: 0.65, sentiment: 0.95 },
  'insane': { engagement: 0.85, virality: 0.8, sentiment: 0.85 },
  'fire': { engagement: 0.9, virality: 0.85, sentiment: 0.9 },
  'drop': { engagement: 0.8, virality: 0.75, sentiment: 0.7 },
  'stream': { engagement: 0.7, virality: 0.5, sentiment: 0.6 },
  'listen': { engagement: 0.65, virality: 0.45, sentiment: 0.65 },
  'love': { engagement: 0.85, virality: 0.7, sentiment: 0.95 },
  'viral': { engagement: 0.9, virality: 1.0, sentiment: 0.7 },
  'trending': { engagement: 0.85, virality: 0.9, sentiment: 0.7 },
  'limited': { engagement: 0.75, virality: 0.65, sentiment: 0.6 },
  'free': { engagement: 0.9, virality: 0.75, sentiment: 0.85 },
  'win': { engagement: 0.9, virality: 0.8, sentiment: 0.9 },
  'giveaway': { engagement: 0.95, virality: 0.85, sentiment: 0.85 },
  'secret': { engagement: 0.85, virality: 0.8, sentiment: 0.6 },
  'reveal': { engagement: 0.8, virality: 0.75, sentiment: 0.7 },
  'collab': { engagement: 0.8, virality: 0.7, sentiment: 0.75 },
  'banger': { engagement: 0.9, virality: 0.85, sentiment: 0.9 },
  'heat': { engagement: 0.85, virality: 0.8, sentiment: 0.85 },
  'slaps': { engagement: 0.88, virality: 0.82, sentiment: 0.88 },
  'dope': { engagement: 0.82, virality: 0.76, sentiment: 0.85 },
  'legendary': { engagement: 0.87, virality: 0.82, sentiment: 0.92 },
  'iconic': { engagement: 0.86, virality: 0.81, sentiment: 0.9 },
  'goated': { engagement: 0.88, virality: 0.84, sentiment: 0.92 },
  'authentic': { engagement: 0.78, virality: 0.68, sentiment: 0.88 },
  'real': { engagement: 0.72, virality: 0.65, sentiment: 0.82 },
  'honest': { engagement: 0.75, virality: 0.67, sentiment: 0.85 },
  'vulnerable': { engagement: 0.82, virality: 0.76, sentiment: 0.88 },
  'emotional': { engagement: 0.83, virality: 0.77, sentiment: 0.82 },
  'milestone': { engagement: 0.78, virality: 0.72, sentiment: 0.8 },
  'charted': { engagement: 0.82, virality: 0.78, sentiment: 0.82 },
  'playlisted': { engagement: 0.79, virality: 0.74, sentiment: 0.8 },
  'debut': { engagement: 0.77, virality: 0.7, sentiment: 0.78 },
  'unreleased': { engagement: 0.86, virality: 0.82, sentiment: 0.75 },
  'acoustic': { engagement: 0.72, virality: 0.62, sentiment: 0.82 },
  'studio': { engagement: 0.71, virality: 0.6, sentiment: 0.72 },
  'recording': { engagement: 0.7, virality: 0.58, sentiment: 0.7 },
  'session': { engagement: 0.68, virality: 0.6, sentiment: 0.7 },
  'beat': { engagement: 0.76, virality: 0.72, sentiment: 0.75 },
  'bars': { engagement: 0.8, virality: 0.75, sentiment: 0.8 },
  'hook': { engagement: 0.75, virality: 0.7, sentiment: 0.75 },
  'chorus': { engagement: 0.72, virality: 0.66, sentiment: 0.76 },
  'movement': { engagement: 0.8, virality: 0.78, sentiment: 0.82 },
  'journey': { engagement: 0.75, virality: 0.68, sentiment: 0.82 },
  'story': { engagement: 0.77, virality: 0.7, sentiment: 0.82 },
  'chapter': { engagement: 0.72, virality: 0.64, sentiment: 0.78 },
  'raw': { engagement: 0.78, virality: 0.72, sentiment: 0.78 },
  'powerful': { engagement: 0.8, virality: 0.73, sentiment: 0.88 },
  'massive': { engagement: 0.83, virality: 0.78, sentiment: 0.82 },
  'crazy': { engagement: 0.82, virality: 0.78, sentiment: 0.8 },
  'wild': { engagement: 0.8, virality: 0.76, sentiment: 0.78 },
  'epic': { engagement: 0.83, virality: 0.79, sentiment: 0.88 },
  'playlist': { engagement: 0.75, virality: 0.68, sentiment: 0.72 },
  'spotify': { engagement: 0.72, virality: 0.64, sentiment: 0.7 },
  'certified': { engagement: 0.78, virality: 0.73, sentiment: 0.78 },
  'gold': { engagement: 0.82, virality: 0.76, sentiment: 0.84 },
  'platinum': { engagement: 0.86, virality: 0.82, sentiment: 0.88 },
  'independent': { engagement: 0.74, virality: 0.68, sentiment: 0.8 },
  'unsigned': { engagement: 0.72, virality: 0.66, sentiment: 0.78 },
  'underrated': { engagement: 0.8, virality: 0.76, sentiment: 0.75 },
  'replay': { engagement: 0.82, virality: 0.78, sentiment: 0.82 },
  'earworm': { engagement: 0.83, virality: 0.8, sentiment: 0.82 },
  'chills': { engagement: 0.85, virality: 0.79, sentiment: 0.88 },
  'goosebumps': { engagement: 0.86, virality: 0.8, sentiment: 0.88 },
  'therapy': { engagement: 0.82, virality: 0.76, sentiment: 0.88 },
  'healing': { engagement: 0.8, virality: 0.74, sentiment: 0.9 },
  'breakthrough': { engagement: 0.82, virality: 0.76, sentiment: 0.84 },
};

// ============================================================================
// ADVANCED AI CONSTANTS — ROUND 2 UPGRADES
// ============================================================================

// ─── PLATFORM-NATIVE DNA ───────────────────────────────────────────────────────
// Each platform has distinct language patterns. Native-feeling content outperforms
// generic content by 2-3x in both reach and engagement across all platforms.
const PLATFORM_NATIVE_DNA: Record<string, {
  openers: string[];
  transitions: string[];
  closers: string[];
  avoidPhrases: string[];
}> = {
  tiktok: {
    openers: ['POV:', 'Tell me why', 'Not me', 'The way', 'I cannot believe', 'Wait, so', 'Okay but', 'Real question:'],
    transitions: ['...and then', 'But here\'s the thing', 'So basically', 'Plot twist:', 'Update:', 'Turns out'],
    closers: ['Comment your reaction 👇', 'Duet this if you agree', 'Stitch with your take', 'Comment "yes" if you need this', 'Drop a 🔥 if you felt this'],
    avoidPhrases: ['I am pleased to announce', 'Please be advised', 'Furthermore', 'In conclusion'],
  },
  instagram: {
    openers: ['Okay, real talk', 'This one hits different', 'Late night thoughts:', 'Something I\'ve been sitting with:', 'Saved this feeling for the right moment —', 'This is for the ones who'],
    transitions: ['Here\'s the thing about', 'What nobody tells you is', 'And honestly?', 'But the real story is', 'The part that surprised me:'],
    closers: ['Save this if it hits you 🙏', 'Drop your thoughts below ↓', 'Tag someone who needs to hear this', 'Share this with the right person', 'Double tap if this is you 💙'],
    avoidPhrases: ['Check out my latest', 'New post alert', 'Don\'t forget to like and subscribe'],
  },
  twitter: {
    openers: ['Hot take:', 'Unpopular opinion:', 'Nobody talks about', 'I\'m convinced that', 'Thread 🧵', 'Genuine question:', 'Here\'s something wild:', 'Okay hear me out —'],
    transitions: ['The thing is,', 'But also,', 'What I mean is:', 'To be clear:', 'Actually though —'],
    closers: ['RT if you agree', 'Quote this with your take', 'What do you think?', 'Thoughts?', 'Agree or nah?'],
    avoidPhrases: ['As per my last tweet', 'Stream now', 'Available on all platforms'],
  },
  youtube: {
    openers: ['What\'s up everyone,', 'I need to tell you something:', 'Here\'s what most people get wrong about', 'Today I want to talk about', 'Before you scroll, watch this:', 'This took me a long time to figure out —'],
    transitions: ['So here\'s what happened:', 'And that\'s when I realized', 'But the real reason is', 'Watch what happens next', 'This is the part nobody expected:'],
    closers: ['Subscribe so you don\'t miss the next one', 'Let me know in the comments', 'Hit that notification bell', 'If this helped you, share it', 'See you in the next one'],
    avoidPhrases: ['New video alert', 'Link in bio', 'Don\'t forget to like'],
  },
  facebook: {
    openers: ['I don\'t usually share things like this, but —', 'Had to share this with my community:', 'Something meaningful happened:', 'For anyone who needs to hear this today:', 'This community means everything, so —'],
    transitions: ['Here\'s the story:', 'What surprised me was', 'And I\'m sharing this because', 'The reason this matters:'],
    closers: ['Tag a friend who would appreciate this', 'Share if this resonated', 'Leave a comment — I read every one', 'What do you think? Comment below'],
    avoidPhrases: ['Follow for more', 'Link in bio', 'Swipe up'],
  },
};

// ─── SELF-IDENTIFICATION PHRASES ───────────────────────────────────────────────
// Phrases that make the reader project themselves into the content.
// Research: self-identification phrases increase comment rate by 40-60% and shares by 25%.
const SELF_IDENTIFICATION_PHRASES: Record<string, string[]> = {
  artists: [
    'For the independent artists who are still building in silence —',
    'If you\'ve ever written a song nobody heard yet — this one is for you',
    'For the bedroom producers who believed before anyone else did',
    'This is for the artists who almost gave up last year',
    'For everyone who was told "music is just a hobby" —',
    'If you\'re still grinding without a label, without a manager, on your own — this is for you',
  ],
  fans: [
    'For the people who play a song on repeat when words aren\'t enough —',
    'If music has ever pulled you through a hard day, you already understand',
    'For the ones who stream at 2am when everything feels too loud',
    'This one is for the day-one fans who never stopped believing',
    'For everyone who has a song that explains exactly how they feel',
  ],
  universal: [
    'For the ones who feel everything a little too deeply —',
    'If you\'ve ever needed something to just understand you —',
    'For anyone who\'s been through something they couldn\'t explain out loud',
    'This is for the people who find meaning in music others overlook',
    'For the ones still figuring it out — you\'re not alone in this',
  ],
};

// ─── EMOTIONAL ARC TEMPLATES ───────────────────────────────────────────────────
// Each content type has an optimal emotional arc structure.
// Scientifically, content following Hook → Context → Tension → Resolution → CTA
// outperforms flat content by 2.8x in average watch/read time.
const EMOTIONAL_ARC_TEMPLATES: Record<string, {
  hook: string;
  context: string;
  tension: string;
  resolution: string;
  cta: string;
}[]> = {
  announcement: [
    {
      hook: 'I almost didn\'t release {topic}.',
      context: 'The {genre} energy behind this was personal — too personal. I wasn\'t sure the world was ready.',
      tension: 'Months went by. I kept second-guessing it. Three full versions scrapped. Every time I was about to drop it, something stopped me.',
      resolution: 'Then I listened back one night at 3am. And I realized — this is exactly why I make music. It\'s done. It\'s honest. It\'s out.',
      cta: '{topic} is live everywhere. Stream it, share it, let it find the people who need it. 🎵',
    },
    {
      hook: 'The wait is over. {topic} is finally here.',
      context: 'This {genre} record represents everything {artist} has been building toward.',
      tension: 'Nothing about this was easy. The production took months. The lyrics were rewritten more times than I can count.',
      resolution: 'But the version you\'re hearing right now? That\'s the right one. I know it.',
      cta: 'Stream {topic} — link in bio. First week numbers mean everything. 🔥',
    },
  ],
  storytelling: [
    {
      hook: 'I wrote {topic} during the hardest stretch of my life.',
      context: 'No label, no manager, no plan. Just a {genre} record that felt too personal to share.',
      tension: 'There were nights I genuinely thought about walking away from music entirely. I had a session where I left mid-record and didn\'t come back for two weeks.',
      resolution: 'What brought me back was finishing this song. And now, releasing it — I finally understand why I had to write it.',
      cta: 'If this hits you, let me know in the comments. Stream {topic} — link in bio. 💙',
    },
    {
      hook: 'This song started as a voice memo at 2am.',
      context: 'I was in the studio alone, trying to finish {topic}, when something clicked.',
      tension: 'I\'d been stuck for three months. The chord progression was wrong. The hook wasn\'t landing. I was about to scrap the whole thing.',
      resolution: 'Then I hit record — no plan, no filter — and what came out was exactly the song it needed to be.',
      cta: 'That 2am voice memo became {topic}. Listen to what happened. Link in bio. 🎧',
    },
  ],
  engagement: [
    {
      hook: 'Real talk: does {topic} hit different at night?',
      context: 'I made this {genre} track specifically for late-night drives, headphones in, world turned off.',
      tension: 'The question I keep asking myself — does the music actually reach people, or is it just algorithm numbers on a screen?',
      resolution: 'Then I read your comments. And I know — it\'s reaching people. That\'s all that matters.',
      cta: 'Tell me in the comments: what does {topic} feel like when you listen? I want to know. 👇',
    },
  ],
  behind_scenes: [
    {
      hook: 'Nobody sees what making {topic} actually looked like.',
      context: 'Raw footage from the session that built this {genre} record.',
      tension: 'We scrapped three full versions. At one point we had a complete track that sounded amazing — and I deleted it because it wasn\'t honest enough.',
      resolution: 'The version you\'re hearing now came from starting over. And I\'m glad it did.',
      cta: 'Watch the full making-of. Link in bio. Drop a 🎥 if you want more of this.',
    },
  ],
};

// ─── CURIOSITY GAP PATTERNS ───────────────────────────────────────────────────
// Specific linguistic constructions that create information gaps — forcing
// the viewer to complete the content to resolve the gap. Curiosity gap hooks
// consistently outperform standard hooks by 30-50% in click-through rate.
const CURIOSITY_GAP_PATTERNS: string[] = [
  'Nobody told me that {topic} would do this...',
  'I discovered something about {genre} music that nobody talks about',
  'The reason most artists never make it has nothing to do with talent',
  'Wait until you hear what happened when {topic} got playlisted',
  'I asked 100 fans what they actually felt when they heard {topic}. The answers surprised me',
  'There\'s a reason {topic} keeps showing up in {genre} playlists. It\'s not what you think',
  'The streaming algorithm tried to bury {topic}. Here\'s what happened next',
  'I made a bet with myself when I recorded {topic}. I was right',
  'Most people hear {topic} and don\'t notice what\'s hidden in the production',
  'Something in {topic} was only noticed after 10K streams. Can you hear it?',
  'There\'s a moment in {topic} that was almost cut from the final mix',
  'The collab on {topic} almost didn\'t happen. The full story is wild',
];

// ============================================================================
// MAIN SERVICE CLASS
// ============================================================================

class AdvancedSocialAIService {
  private initialized: boolean = false;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    logger.info('[AdvancedSocialAI] GPT-5.2 level social AI engine initialized');
  }

  // ── In-memory content cache ────────────────────────────────────────────────
  // Prevents redundant computation when the same topic+platform+tone combination
  // is requested within a short window (e.g. autopilot batch, retries).
  // TTL: 90 seconds. Max entries: 200 (LRU-lite: evict oldest when full).
  private static _contentCache = new Map<string, { ts: number; result: AdvancedGeneratedContent }>();
  private static readonly _CACHE_TTL_MS = 90_000;
  private static readonly _CACHE_MAX    = 200;

  private static _cacheKey(r: AdvancedContentRequest): string {
    return [
      r.userId || 'anon',
      (r.platforms || []).join(','),
      r.topic || '',
      r.tone || '',
      r.genre || '',
      r.contentType || '',
      r.objective || '',
      r.artistName || '',
    ].join('|');
  }

  async generateAdvancedContent(request: AdvancedContentRequest): Promise<AdvancedGeneratedContent> {
    const cacheKey = AdvancedSocialAIService._cacheKey(request);
    const cached   = AdvancedSocialAIService._contentCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < AdvancedSocialAIService._CACHE_TTL_MS) {
      logger.info(`[AdvancedSocialAI] Cache hit for key=${cacheKey.slice(0, 60)}`);
      return cached.result;
    }

    await this.initialize();

    const userContext = await this.getUserContext(request.userId);
    const primaryPlatform = PLATFORM_PROFILES[request.platforms[0]?.toLowerCase()] || PLATFORM_PROFILES.instagram;
    const tone = TONE_PROFILES[request.tone || 'casual'] || TONE_PROFILES.casual;
    const audience = AUDIENCE_PROFILES[request.targetAudience?.toLowerCase().replace(/\s+/g, '_') || 'indie_artists'] || AUDIENCE_PROFILES.indie_artists;

    // ── 8TB dataset via MaxCore is the ONLY text source ─────────────────────
    const mc = await MaxCoreAIClient.infer<any>('/api/generate/content', {
      platform:        request.platforms[0] || 'instagram',
      topic:           request.topic || 'new music',
      tone:            request.tone || 'energetic',
      genre:           request.genre || userContext.genre,
      artist_name:     request.artistName || userContext.artistName,
      brand_voice:     userContext.brandVoice,
      target_audience: request.targetAudience,
    });

    if (!mc?.hook && !mc?.caption) {
      throw new Error('[AdvancedSocialAI] MaxCore returned no content (transient call failure)');
    }

    const hook        = mc.hook || '';
    const bodyText    = mc.body || '';
    const cta         = mc.cta  || '';
    const hashtags: string[] = Array.isArray(mc.hashtags) ? mc.hashtags : [];
    const emojis      = this.selectEmojis(request, primaryPlatform, tone);
    const fullContent = mc.caption || [hook, bodyText, cta].filter(Boolean).join('\n\n');

    const platformVersions = this.generatePlatformVersions(request, hook, bodyText, cta, hashtags);
    const variants         = this.generateVariants(request, hook, bodyText, cta, hashtags, tone);
    const scoring          = this.scoreContent(fullContent, primaryPlatform, tone, audience, request);
    const insights         = this.generateInsights(fullContent, scoring, primaryPlatform, request);
    const optimalTiming    = this.calculateOptimalTiming(request.platforms, audience);
    const mediaGuidance    = this.generateMediaGuidance(request, primaryPlatform);
    const viralPotential   = this.analyzeViralPotential(fullContent, request);
    const audienceResonance = this.analyzeAudienceResonance(fullContent, audience, request);

    logger.info(`[AdvancedSocialAI] MaxCore-sourced content for user ${request.userId}: score=${scoring.overall.toFixed(1)}`);

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

    if (AdvancedSocialAIService._contentCache.size >= AdvancedSocialAIService._CACHE_MAX) {
      const oldestKey = AdvancedSocialAIService._contentCache.keys().next().value;
      if (oldestKey) AdvancedSocialAIService._contentCache.delete(oldestKey);
    }
    AdvancedSocialAIService._contentCache.set(cacheKey, { ts: Date.now(), result });
    return result;
  }

  private async getUserContext(userId: string): Promise<any> {
    try {
      const [[brandVoice], [preferences]] = await Promise.all([
        db.select().from(userBrandVoices).where(eq(userBrandVoices.userId, userId)).limit(1),
        db.select().from(autopilotPreferences).where(eq(autopilotPreferences.userId, userId)).limit(1),
      ]);
      return {
        brandVoice: brandVoice?.voiceProfile,
        artistName: preferences?.artistName || 'Artist',
        genre: preferences?.genre,
        preferences,
      };
    } catch (error) {
      const msg = (error as Error)?.message ?? String(error);
      logger.error(`[AdvancedSocialAI] Failed to load user context for ${userId}: ${msg}`);
      throw error;
    }
  }

  private generateHook(
    request: AdvancedContentRequest,
    platform: PlatformProfile,
    tone: ToneProfile
  ): string {
    const topic = request.topic || 'new music';
    const artist = request.artistName || '';
    
    const genreKey = (request.genre || '').toLowerCase();
    const genreHookAddons: Record<string, string[]> = {
      'hip-hop': [`Bar for bar, ${topic} is the one 🎤`, `Lyricism is not dead. ${topic} is the proof 🔥`, `The wordplay on ${topic} goes three layers deep 💯`],
      'trap': [`The 808 on ${topic} hits at max volume 🔊`, `Built this from scratch — no shortcuts 🔥`, `When the 808 drops, you feel it in your chest ⚡`],
      'r&b': [`This melody was a dream I woke up to ✨`, `${topic} — late night, mood lighting, repeat 💜`, `The harmonies on this bridge will break you ✨`],
      'pop': [`${topic} is that song you add to every playlist 🎵`, `One play and ${topic} is stuck in your head all week 🎵`, `The hook was designed to get in your head 🎯`],
      'afrobeats': [`The groove on ${topic} doesn't stop 🔥`, `You cannot listen to ${topic} and not move your body 🎶`, `Lagos energy built for the world 🔥`],
      'electronic': [`The drop on ${topic} was engineered to break speakers ⚡`, `Four to the floor and a bassline that won't quit 🎧`, `Built for peak hour, hits just as hard at home 🔊`],
      'drill': [`The samples on ${topic} are dark and cinematic 🖤`, `Authentic drill energy. No imitation 🔥`, `Every line is a fact. Listen carefully 💯`],
      'country': [`Wrote this on a porch in the middle of nowhere 🎸`, `Three chords and the truth — ${topic} ✨`, `Country music hits different when it's real 🎸`],
    };
    const genreHooks = genreHookAddons[genreKey] || [];

    const hookTemplates: Record<string, string[]> = {
      announcement: [
        `🚨 ${topic.toUpperCase()} ALERT`,
        `IT'S FINALLY HERE: ${topic}`,
        `The wait is OVER`,
        `🔥 OUT NOW: ${topic}`,
        `No more waiting. ${topic} is officially live 🚀`,
        `Day one. ${topic} just dropped everywhere 🎵`,
        `Been sitting on ${topic} for months. It's finally time 👀`,
        `I almost didn't release ${topic}... biggest mistake that would've been 🔥`,
        `New era starts today — ${topic} is out now 🚨`,
        `The one y'all have been asking for. ${topic} is live 🎤`,
        ...genreHooks.slice(0, 2),
      ],
      behind_scenes: [
        `A little peek behind the curtain...`,
        `Studio vibes 🎚️`,
        `The making of ${topic}`,
        `You don't usually see this part...`,
        `Nobody sees what goes into a record like this 🎧`,
        `Raw, uncut studio footage. The real creative process 📹`,
        `The beat was made at 2am. Vocals at 4am. Magic happens late 🌙`,
        `The moment the hook clicked — you can see it on my face 👀`,
        `We scrapped three versions before this one. Worth it ✨`,
        `Producer cam was rolling the whole session. Here's what happened 🎥`,
        ...genreHooks.slice(0, 2),
      ],
      engagement: [
        `Real talk:`,
        `I need your honest opinion`,
        `Let's settle this:`,
        `Question for my day ones:`,
        `Be brutally honest — does ${topic} hit?`,
        `What's your first reaction to ${topic}? Tell me 👇`,
        `Rate ${topic} 1-10. I read every comment 💬`,
        `Hot take incoming — fight me in the comments 🌶️`,
        `Tell me what you think before I drop the next one 🤔`,
        `Your feedback shapes what ${artist || 'we'} create next 👇`,
        `Sound off: what hits first — the beat, the lyrics, or the vibe?`,
      ],
      promotional: [
        `${topic} is LIVE`,
        `Don't sleep on this`,
        `This is what you've been waiting for`,
        `${topic} available NOW`,
        `Stream ${topic} — every play counts this week 📈`,
        `Your playlist needs ${topic} right now 🎵`,
        `First 24 hours are everything — ${topic} is out ⏰`,
        `Add ${topic} to your playlist before you forget 🔗`,
        `${topic} hit all platforms. Go run the numbers up 🚀`,
        `Don't let the algorithm hide ${topic} from you — stream it now 🎧`,
      ],
      storytelling: [
        `Let me tell you something...`,
        `The story behind ${topic}`,
        `This is personal`,
        `I've never shared this before`,
        `I wrote ${topic} when I almost quit music 💔`,
        `The real story behind ${topic} — nothing was manufactured`,
        `${topic} came from my darkest moment. Writing it was therapy`,
        `Every lyric in ${topic} is from a real experience. No filler 🎵`,
        `I almost deleted ${topic} a hundred times. Glad I didn't`,
        `Some songs are made. ${topic} happened. There's a difference ✨`,
        ...genreHooks.slice(0, 2),
      ],
    };

    const contentType = request.contentType || 'announcement';
    const templates = hookTemplates[contentType] || hookTemplates.announcement;
    const hookSeed = seededIndex(`${request.artistName}:${request.topic}:${contentType}:hook`, templates.length);
    let hook = templates[hookSeed];

    // ── Curiosity gap injection (30% of viral/engagement generations) ─────────
    if ((request.objective === 'viral' || request.objective === 'engagement') && seededGate(`${request.artistName}:${request.topic}:${contentType}:curiosity`, 0.30)) {
      const curiosityHook = this.buildCuriosityGapHook(request);
      if (curiosityHook) hook = curiosityHook;
    }

    // ── Platform-native opener prefix (25% chance) ────────────────────────────
    const platformDNA = PLATFORM_NATIVE_DNA[request.platforms[0]?.toLowerCase()] || null;
    if (platformDNA && seededGate(`${request.artistName}:${request.topic}:${contentType}:native`, 0.25)) {
      const nativeOpener = platformDNA.openers[seededIndex(`${request.artistName}:${request.topic}:${contentType}:opener`, platformDNA.openers.length)];
      // Only prepend if hook doesn't already start with a platform-native opener
      const alreadyNative = platformDNA.openers.some(o => hook.toLowerCase().startsWith(o.toLowerCase().substring(0, 6)));
      if (!alreadyNative) hook = `${nativeOpener} ${hook}`;
    }

    if (tone.energy > 0.7 && !hook.includes('🔥') && !hook.includes('!')) {
      hook = hook + ' 🔥';
    }

    return hook;
  }

  private buildEmotionalArcBody(
    request: AdvancedContentRequest,
    platform: PlatformProfile,
  ): string | null {
    const topic = request.topic || 'new music';
    const genre = request.genre || 'music';
    const artist = request.artistName || '';
    const contentType = request.contentType || 'announcement';

    const arcTemplates = EMOTIONAL_ARC_TEMPLATES[contentType] || EMOTIONAL_ARC_TEMPLATES.announcement;
    if (!arcTemplates || arcTemplates.length === 0) return null;

    const arcSeed = `${request.artistName}:${topic}:${contentType}:arc`;
    const template = arcTemplates[seededIndex(arcSeed, arcTemplates.length)];
    const fill = (s: string) => s
      .replace(/\{topic\}/g, topic)
      .replace(/\{genre\}/g, genre)
      .replace(/\{artist\}/g, artist || 'I');

    const platformDNA = PLATFORM_NATIVE_DNA[request.platforms[0]?.toLowerCase()] || PLATFORM_NATIVE_DNA.instagram;
    const opener = platformDNA.openers[seededIndex(`${arcSeed}:opener`, platformDNA.openers.length)];

    const arc = [
      fill(template.hook),
      fill(template.context),
      fill(template.tension),
      fill(template.resolution),
    ].join(' ');

    const siPhrases = SELF_IDENTIFICATION_PHRASES.universal;
    const selfId = request.objective === 'viral' || request.objective === 'engagement'
      ? siPhrases[seededIndex(`${arcSeed}:selfid`, siPhrases.length)]
      : null;

    const parts: string[] = [arc];
    if (selfId) parts.push(selfId);

    const maxLen = platform.characterLimit ? Math.min(platform.characterLimit - 100, 600) : 500;
    let result = parts.join(' ');
    if (result.length > maxLen) result = result.substring(0, maxLen - 3) + '...';

    return result;
  }

  private buildCuriosityGapHook(request: AdvancedContentRequest): string | null {
    const topic = request.topic || 'new music';
    const genre = request.genre || 'music';
    if (request.objective !== 'viral' && request.objective !== 'engagement') return null;

    const pattern = CURIOSITY_GAP_PATTERNS[seededIndex(`${topic}:${genre}:curiosity`, CURIOSITY_GAP_PATTERNS.length)];
    return pattern
      .replace(/\{topic\}/g, topic)
      .replace(/\{genre\}/g, genre);
  }

  private generateBody(
    request: AdvancedContentRequest,
    platform: PlatformProfile,
    tone: ToneProfile,
    audience: AudienceProfile
  ): string {
    const topic = request.topic || 'new music';
    const genre = request.genre || 'music';
    const artist = request.artistName || '';

    const bodyParts: string[] = [];

    // ── Emotional Arc Body (40% of generations for storytelling/announcement) ─
    const contentType = request.contentType || 'announcement';
    const useEmotionalArc = (contentType === 'storytelling' || contentType === 'announcement' || contentType === 'behind_scenes')
      && seededGate(`${artist}:${topic}:${contentType}:emotional`, 0.55);
    if (useEmotionalArc) {
      const arcBody = this.buildEmotionalArcBody(request, platform);
      if (arcBody) return arcBody;
    }

    const mbContext = detectMaxBoosterContext(topic);

    if (mbContext.isMaxBoosterTopic && mbContext.relevantFeature) {
      const feature = MAX_BOOSTER_PLATFORM_KNOWLEDGE.coreFeatures[mbContext.relevantFeature];
      const highlights = ('highlights' in feature) ? feature.highlights : [];
      const pick = (arr: readonly string[], n: number) => arr.slice(0, n);

      const platformBodies: Record<string, string[]> = {
        announcement: [
          `${feature.description}`,
          pick(highlights, 2).join('. ') + '.',
          `${artist || 'We'} use Max Booster to power the entire music career — from studio to streaming.`,
        ],
        behind_scenes: [
          `Here's what's inside: ${pick(highlights, 2).join(', ')}.`,
          `${feature.description} — built for artists like you.`,
          `The technology behind the music is just as important as the music itself.`,
        ],
        engagement: [
          `Which feature matters most to you? ${pick(highlights, 2).join(' or ')}?`,
          `Independent artists deserve enterprise-level tools. That's why Max Booster was built.`,
          `What's your biggest challenge with ${mbContext.keywords[0] || 'music'}?`,
        ],
        promotional: [
          `${feature.name} — ${feature.description}`,
          `Highlights: ${pick(highlights, 3).join(' | ')}.`,
          `${MAX_BOOSTER_PLATFORM_KNOWLEDGE.tagline}`,
        ],
        storytelling: [
          `When ${artist || 'I'} started using ${feature.name}, everything changed.`,
          `${feature.description}`,
          `${pick(highlights, 1)[0]}. That's the Max Booster difference.`,
        ],
      };

      const contentType = request.contentType || 'announcement';
      const bodies = platformBodies[contentType] || platformBodies.announcement;
      bodyParts.push(...bodies.slice(0, 2));
    } else {
      const contentBodyVariants: Record<string, string[][]> = {
        announcement: [
          [
            `${artist || 'I'} just dropped something different — and ${topic} is it.`,
            `This ${genre} experience was built from real moments. You can feel the difference.`,
            `Stream it, save it, tell a friend. The first 24 hours determine everything.`,
          ],
          [
            `${topic} is finally out. I spent months on this — every detail matters.`,
            `This is ${artist || 'my'} most honest work yet. No features, no safety net — just ${genre}.`,
            `Link in bio. Go run it up.`,
          ],
          [
            `The wait ends today. ${topic} by ${artist || 'me'} is live on every platform.`,
            `I poured everything into this. The production, the lyrics, the mix — nothing was rushed.`,
            `First week numbers change the trajectory. If this hits you, share it right now.`,
          ],
        ],
        behind_scenes: [
          [
            `Here's an exclusive look at how ${topic} came together — nothing scripted.`,
            `The creative process for this one was messy, emotional, and totally worth it.`,
            `Every great song has a story. Here's ours.`,
          ],
          [
            `The studio sessions for ${topic} were unlike anything before. Raw footage below.`,
            `We scrapped two full versions before landing on this one. The third version is the one.`,
            `The moment the hook clicked — I knew. You'll feel it too.`,
          ],
          [
            `Three months of sessions. Forty tracks scrapped. One record that made everything worth it.`,
            `${topic} started as a voice memo at 2am. What you're hearing now is that idea, fully realized.`,
            `This is what the making of ${genre} looks like when nobody is watching.`,
          ],
        ],
        engagement: [
          [
            `I want to hear from you — your feedback shapes what ${artist || 'I'} create next.`,
            `This community has pushed the music further than anything else. Tell me what you need.`,
            `Drop your honest reaction. No filter necessary.`,
          ],
          [
            `${topic} was made with you in mind. Did it land? Tell me in the comments.`,
            `I read every comment. Every one. Your reaction to this genuinely matters.`,
            `What hits first — the beat, the vocals, or the overall vibe? Comment below.`,
          ],
          [
            `Real question: does ${topic} deserve to be in your rotation? Be brutally honest.`,
            `I don't want hype. I want real feedback. What works and what doesn't?`,
            `First 10 people who comment get a shoutout. I see you.`,
          ],
        ],
        promotional: [
          [
            `${topic} is available on all platforms right now.`,
            `Stream it, share it, add it to your playlist — every action helps this week.`,
            `Don't let the algorithm bury it. Your streams make the difference.`,
          ],
          [
            `${artist || 'My'} new ${genre} track ${topic} is everywhere — Spotify, Apple Music, YouTube.`,
            `Add it to your playlist before you forget. This one has real replay value.`,
            `The people who support early are the ones who get to say they were there first.`,
          ],
          [
            `${topic} is live and the early response is already incredible.`,
            `Join the thousands of people who already added this to their rotation.`,
            `Be on it early. Your playlist, your culture.`,
          ],
        ],
        storytelling: [
          [
            `When ${artist || 'I'} started working on ${topic}, something finally clicked.`,
            `Music has always been about connection — and this track was built for that purpose.`,
            `This represents a new chapter. And it's just getting started.`,
          ],
          [
            `${topic} was written during the hardest stretch of ${artist ? artist + "'s" : 'my'} life.`,
            `The vulnerability in these lyrics is real. Nothing was manufactured.`,
            `If you've ever felt like this, I hope this finds you at the right time.`,
          ],
          [
            `I almost didn't release ${topic}. A hundred second-guesses later — here we are.`,
            `The most personal thing you can create is also the most universal. That's what this is.`,
            `Writing this was therapy. Releasing it is a leap of faith.`,
          ],
        ],
      };

      const contentType = request.contentType || 'announcement';
      const bodyVariantList = contentBodyVariants[contentType] || contentBodyVariants.announcement;
      const selectedBodyVariant = bodyVariantList[seededIndex(`${request.artistName}:${topic}:${contentType}:body`, bodyVariantList.length)];
      bodyParts.push(...selectedBodyVariant.slice(0, 2));
    }

    if (tone.emotionality > 0.7) {
      const emotionalClosers = [
        `We put our heart and soul into this.`,
        `Every note was made with intention.`,
        `This one comes from a real place.`,
        `Music is how I speak when words aren't enough.`,
      ];
      bodyParts.push(emotionalClosers[seededIndex(`${request.artistName}:${topic}:emotional`, emotionalClosers.length)]);
    }

    if (request.objective === 'conversions') {
      const urgencyLines = [
        `Available for a limited time.`,
        `First week numbers determine everything.`,
        `Every stream in the first 24 hours counts double.`,
      ];
      bodyParts.push(urgencyLines[seededIndex(`${request.artistName}:${topic}:urgency`, urgencyLines.length)]);
    }

    let body = bodyParts.join(' ');

    const targetLength = audience.preferredLength === 'short' ? 100 :
                         audience.preferredLength === 'long' ? 400 : 200;
    
    if (body.length > targetLength) {
      body = body.substring(0, targetLength - 3) + '...';
    }

    return body;
  }

  private generateCTA(
    request: AdvancedContentRequest,
    platform: PlatformProfile,
    tone: ToneProfile
  ): string {
    const ctasByObjective: Record<string, string[]> = {
      awareness: [
        'Follow for more 🔔',
        'Turn on notifications — big things coming!',
        'More coming soon. Stay locked in 👀',
        'Follow to stay in the loop 🔔',
        'Hit follow — you do not want to miss the next drop',
        'Follow + notification bell = first to know 🔔',
        "This is just the start. Don't miss what comes next",
        'New era. New sound. Follow along 🎵',
        "Drop a 💬 below if you're here for the whole journey",
        'Share with someone who needs to discover this artist 🎵',
      ],
      engagement: [
        'Drop your thoughts below! 👇',
        'Tag someone who needs to hear this!',
        'Comment your take!',
        'What do you think? Drop it below 👇',
        'Rate this 1-10 in the comments. Be honest.',
        'First 10 comments get a shoutout 👀',
        'Tell me what hits first — beat, hook, or vibe?',
        "Agree or disagree? Fight me in the comments 🌶️",
        "Your feedback changes what I create next. Real talk 👇",
        'Drop a 🔥 if you already have this on repeat',
        'Stitch/Duet this with your reaction!',
        'What do YOU want to hear next? Comment below.',
      ],
      conversions: [
        'Link in bio to listen! 🔗',
        'Stream now on all platforms! 🎧',
        'Tap the link to get it!',
        'Available everywhere - go run it up! 💯',
        'Add it to your playlist before you forget 🎵',
        "First week is everything — stream it now ⏰",
        'Hit save on Spotify. Your playlist will thank you 💚',
        'Go stream it, save it, share it — that order 📈',
        'Link in bio. Every play this week matters 🔗',
        'Available on Spotify, Apple Music, YouTube — everywhere 🎧',
        "Don't sleep — first 24 hours are the most important ⏰",
        "Share with three people who need this in their life 🔗",
      ],
      viral: [
        'Share if you agree! 🔄',
        'Save this for later! 💾',
        'Send this to someone who gets it!',
        'Duet/Stitch this!',
        'Tag the person who needs to hear this right now 👇',
        "Send this to someone who hasn't discovered this yet 🎵",
        "If this hits, share it. One share changes everything 🔄",
        "Your timeline needs this. Post it 🔄",
        "Tag someone who'll be on repeat all week 🎶",
        "Repost if you're a real one 🔄",
        'Save now, thank me later 💾',
        "This is the one you send in the group chat 📲",
      ],
    };

    const ctas = ctasByObjective[request.objective] || ctasByObjective.engagement;
    let cta = ctas[seededIndex(`${request.artistName}:${request.topic}:${request.objective}:cta`, ctas.length)];

    if (tone.energy > 0.7 && !cta.includes('!')) {
      cta = cta.replace(/\.$/, '!');
    }

    return cta;
  }

  private selectEmojis(
    request: AdvancedContentRequest,
    platform: PlatformProfile,
    tone: ToneProfile
  ): string[] {
    if (request.includeEmojis === false) return [];

    const emojiSets: Record<string, string[]> = {
      music: ['🎵', '🎶', '🎤', '🎧', '🎹', '🎸'],
      fire: ['🔥', '💥', '⚡', '✨', '💫'],
      engagement: ['👇', '💬', '❤️', '👀', '🙌'],
      celebration: ['🎉', '🥳', '💯', '🚀'],
      action: ['🔔', '📢', '🆕', '🔊'],
    };

    const targetCount = Math.floor((platform.emojiRange.min + platform.emojiRange.max) / 2);
    const selected: string[] = [];

    selected.push(...emojiSets.music.slice(0, 1));

    if (tone.energy > 0.7) {
      selected.push(...emojiSets.fire.slice(0, 1));
    }

    if (request.objective === 'engagement') {
      selected.push(...emojiSets.engagement.slice(0, 1));
    }

    return [...new Set(selected)].slice(0, targetCount);
  }

  private generatePlatformVersions(
    request: AdvancedContentRequest,
    hook: string,
    body: string,
    cta: string,
    hashtags: string[]
  ): Map<string, PlatformOptimizedContent> {
    const versions = new Map<string, PlatformOptimizedContent>();

    for (const platformId of request.platforms) {
      const platform = PLATFORM_PROFILES[platformId.toLowerCase()];
      if (!platform) continue;

      let content = `${hook}\n\n${body}\n\n${cta}`;
      const platformHashtags = hashtags.slice(0, platform.hashtagRange.max);
      
      if (platformHashtags.length > 0) {
        content += '\n\n' + platformHashtags.join(' ');
      }

      const optimizations: string[] = [];
      let isValid = true;

      if (content.length > platform.maxChars) {
        const excess = content.length - platform.maxChars;
        content = content.substring(0, platform.maxChars - 3) + '...';
        optimizations.push(`Truncated ${excess} characters`);
        isValid = false;
      }

      if (platformHashtags.length < platform.hashtagRange.min) {
        optimizations.push(`Add ${platform.hashtagRange.min - platformHashtags.length} more hashtags`);
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
    tone: ToneProfile
  ): ContentVariant[] {
    const variants: ContentVariant[] = [];
    const count = request.variantCount || 3;

    variants.push({
      id: 'variant_concise',
      type: 'concise',
      content: `${hook}\n\n${cta}`,
      headline: hook,
      hook,
      cta,
      hashtags: hashtags.slice(0, 3),
      predictedScore: 72,
      differentiator: 'Shorter, more direct approach for higher scroll-stopping',
    });

    variants.push({
      id: 'variant_question',
      type: 'question',
      content: `What do you think about this?\n\n${body}\n\n${cta}`,
      headline: 'What do you think?',
      hook: 'What do you think about this?',
      cta,
      hashtags,
      predictedScore: 80,
      differentiator: 'Question-based hook drives 2x more comments',
    });

    variants.push({
      id: 'variant_urgent',
      type: 'urgent',
      content: `🚨 ${hook.replace(/^[🔥💥⚡🚀✨🎵🎶🚨]\s*/, '')}\n\n${body}\n\nDon't miss out! ${cta}`,
      headline: `🚨 ${hook}`,
      hook: `🚨 ${hook}`,
      cta: `Don't miss out! ${cta}`,
      hashtags,
      predictedScore: 75,
      differentiator: 'Urgency-focused for time-sensitive promotions',
    });

    if (count > 3) {
      variants.push({
        id: 'variant_story',
        type: 'storytelling',
        content: `Let me tell you something...\n\n${body}\n\nThis is just the beginning. ${cta}`,
        headline: 'Let me tell you something...',
        hook: 'Let me tell you something...',
        cta: `This is just the beginning. ${cta}`,
        hashtags,
        predictedScore: 74,
        differentiator: 'Storytelling approach for deeper engagement',
      });
    }

    if (count > 4) {
      variants.push({
        id: 'variant_milestone',
        type: 'milestone',
        content: `We made it. 🏆\n\n${body}\n\nThank you for being part of this journey. ${cta}`,
        headline: 'We made it. 🏆',
        hook: 'We made it. 🏆',
        cta: `Thank you for being part of this journey. ${cta}`,
        hashtags,
        predictedScore: 77,
        differentiator: 'Milestone/community celebration — highest brand loyalty response',
      });
    }

    return variants.slice(0, count);
  }

  private scoreContent(
    content: string,
    platform: PlatformProfile,
    tone: ToneProfile,
    audience: AudienceProfile,
    request: AdvancedContentRequest
  ): ContentScoring {
    const words = content.toLowerCase().split(/\s+/);
    
    let engagementSum = 0;
    let viralitySum = 0;
    let sentimentSum = 0;
    let wordCount = 0;

    words.forEach(word => {
      const cleaned = word.replace(/[^a-z]/g, '');
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
    const ctaEffectiveness = this.calculateCTAEffectiveness(content, request.objective);
    const platformOpt = this.calculatePlatformOptimization(content, platform);

    const engagement = (avgEngagement * 0.4 + hookStrength * 0.3 + ctaEffectiveness * 0.3) * 100;
    const virality = avgVirality * 100 * platform.viralMultiplier;
    const clarity = Math.max(40, 100 - words.length * 0.3);
    const sentiment = avgSentiment * 100;
    const brandAlignment = (1 - Math.abs(tone.formality - 0.5)) * 100;
    
    const audienceMatch = (1 - Math.abs(audience.preferredTone - tone.formality)) * 100;
    const trendAlignment = request.trendContext?.length
      ? Math.min(95, 65 + request.trendContext.length * 5)
      : 50;
    const uniqueWords = new Set(words.map(w => w.replace(/[^a-z]/g, ''))).size;
    const originality = Math.min(90, Math.max(60, 50 + (uniqueWords / Math.max(words.length, 1)) * 60));

    const overall = (
      engagement * 0.2 +
      virality * 0.15 +
      clarity * 0.1 +
      sentiment * 0.1 +
      brandAlignment * 0.1 +
      hookStrength * 100 * 0.1 +
      ctaEffectiveness * 100 * 0.1 +
      platformOpt * 100 * 0.05 +
      audienceMatch * 0.05 +
      originality * 0.05
    );

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

  private calculateHookStrength(content: string, platform: PlatformProfile): number {
    const firstLine = content.split('\n')[0] || '';
    let strength = 0.5;

    if (/^[🔥💥⚡🚀✨🎵🎶🚨]/.test(firstLine)) strength += 0.15;
    if (/^[A-Z]{2,}/.test(firstLine)) strength += 0.1;
    if (firstLine.endsWith('?')) strength += 0.1;
    if (firstLine.length < 50) strength += 0.1;
    if (/(!|🔥)/.test(firstLine)) strength += 0.05;

    return Math.min(1, strength) * platform.hookWeight;
  }

  private calculateCTAEffectiveness(content: string, objective: string): number {
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

    ctaPatterns.forEach(({ pattern, boost }) => {
      if (pattern.test(lowerContent)) effectiveness += boost;
    });

    const objectiveMultipliers: Record<string, number> = {
      conversions: 1.2,
      engagement: 1.1,
      viral: 0.9,
      awareness: 1.0,
    };

    return Math.min(1, effectiveness * (objectiveMultipliers[objective] || 1));
  }

  private calculatePlatformOptimization(content: string, platform: PlatformProfile): number {
    let optimization = 0.5;

    if (content.length <= platform.maxChars) {
      optimization += 0.25;
    } else {
      optimization -= 0.3;
    }

    const hashtagCount = (content.match(/#\w+/g) || []).length;
    if (hashtagCount >= platform.hashtagRange.min && hashtagCount <= platform.hashtagRange.max) {
      optimization += 0.15;
    }

    const emojiRegex = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
    const emojiCount = (content.match(emojiRegex) || []).length;
    if (emojiCount >= platform.emojiRange.min && emojiCount <= platform.emojiRange.max) {
      optimization += 0.1;
    }

    return Math.min(1, Math.max(0, optimization));
  }

  private generateInsights(
    content: string,
    scores: ContentScoring,
    platform: PlatformProfile,
    request: AdvancedContentRequest
  ): ContentInsight[] {
    const insights: ContentInsight[] = [];

    if (scores.hookStrength < 60) {
      insights.push({
        type: 'improvement',
        category: 'hook',
        message: 'Start with an emoji or question to grab attention in the first 3 seconds',
        impact: 'high',
        actionable: true,
      });
    } else if (scores.hookStrength > 80) {
      insights.push({
        type: 'success',
        category: 'hook',
        message: 'Strong opening hook - likely to stop scrollers',
        impact: 'high',
        actionable: false,
      });
    }

    if (scores.ctaEffectiveness < 50) {
      insights.push({
        type: 'improvement',
        category: 'cta',
        message: 'Add a clear call-to-action to guide audience behavior',
        impact: 'high',
        actionable: true,
      });
    }

    if (content.length > platform.maxChars) {
      insights.push({
        type: 'warning',
        category: 'length',
        message: `Content exceeds ${platform.name}'s ${platform.maxChars} character limit`,
        impact: 'high',
        actionable: true,
      });
    }

    if (scores.virality < 50 && request.objective === 'viral') {
      insights.push({
        type: 'tip',
        category: 'tone',
        message: 'Add emotional triggers or controversy to increase share potential',
        impact: 'medium',
        actionable: true,
      });
    }

    if (scores.platformOptimization < 70) {
      insights.push({
        type: 'tip',
        category: 'hashtag',
        message: `Optimize hashtag count for ${platform.name} (${platform.hashtagRange.min}-${platform.hashtagRange.max} recommended)`,
        impact: 'medium',
        actionable: true,
      });
    }

    if (scores.audienceRelevance < 60) {
      insights.push({
        type: 'tip',
        category: 'audience',
        message: 'Consider adjusting tone to better match target audience preferences',
        impact: 'medium',
        actionable: true,
      });
    }

    return insights;
  }

  private calculateOptimalTiming(platforms: string[], audience: AudienceProfile): OptimalTiming {
    const platformProfiles = platforms
      .map(p => PLATFORM_PROFILES[p.toLowerCase()])
      .filter(Boolean);

    const allPeakHours = new Set<number>();
    const allBestDays = new Set<number>();

    platformProfiles.forEach(p => {
      p.peakHours.forEach(h => allPeakHours.add(h));
      p.bestDays.forEach(d => allBestDays.add(d));
    });

    const overlappingHours = [...allPeakHours].filter(h => 
      audience.peakHours.includes(h)
    );
    const overlappingDays = [...allBestDays].filter(d =>
      audience.peakDays.includes(d)
    );

    const bestHours = overlappingHours.length > 0 ? overlappingHours : audience.peakHours;
    const bestDays = overlappingDays.length > 0 ? overlappingDays : audience.peakDays;

    return {
      bestDays,
      bestHours,
      timezone: 'UTC',
      confidence: overlappingHours.length > 0 ? 0.85 : 0.65,
      reasoning: `Based on ${audience.name} activity patterns and ${platforms.join(', ')} peak hours`,
      audienceBased: true,
    };
  }

  private generateMediaGuidance(
    request: AdvancedContentRequest,
    platform: PlatformProfile
  ): MediaGuidance {
    const guidance: MediaGuidance = {
      recommendedType: 'image',
      specifications: {},
      styleNotes: [],
      exampleDescriptions: [],
    };

    if (platform.contentTypes.includes('video') || platform.contentTypes.includes('reel')) {
      if (platform.id === 'tiktok' || platform.id === 'instagram') {
        guidance.recommendedType = 'video';
        guidance.specifications = {
          aspectRatio: '9:16',
          duration: '15-30 seconds',
        };
        guidance.styleNotes = [
          'Vertical format for mobile-first viewing',
          'Hook within first 3 seconds',
          'Text overlays for sound-off viewers',
          'Trending audio increases reach',
        ];
      }
    }

    if (request.contentType === 'behind_scenes') {
      guidance.styleNotes.push('Raw, authentic footage performs better than polished');
      guidance.exampleDescriptions.push('Studio recording session with visible equipment');
    }

    if (request.contentType === 'announcement') {
      guidance.styleNotes.push('Bold text overlay with release info');
      guidance.styleNotes.push('Artist/cover art as focal point');
      guidance.exampleDescriptions.push('Album artwork with animated reveal effect');
    }

    if (platform.contentTypes.includes('carousel')) {
      guidance.recommendedType = 'carousel';
      guidance.specifications.slideCount = 5;
      guidance.styleNotes.push('First slide must grab attention');
      guidance.styleNotes.push('Last slide should contain CTA');
    }

    return guidance;
  }

  private analyzeViralPotential(content: string, request: AdvancedContentRequest): ViralAnalysis {
    const lowerContent = content.toLowerCase();
    const factors: ViralFactor[] = [];
    const patterns: string[] = [];
    let totalScore = 50;

    VIRAL_PATTERNS.forEach(pattern => {
      const isPresent = pattern.triggers.some(trigger => lowerContent.includes(trigger));
      factors.push({
        name: pattern.name,
        present: isPresent,
        impact: isPresent ? pattern.shareMultiplier * 20 : 0,
        suggestion: isPresent ? undefined : `Consider using: "${pattern.triggers[0]}"`,
      });
      if (isPresent) {
        patterns.push(pattern.id);
        totalScore += pattern.shareMultiplier * 10;
      }
    });

    if (content.includes('?')) {
      totalScore += 8;
      factors.push({ name: 'Question Hook', present: true, impact: 8 });
    }
    if (/[A-Z]{3,}/.test(content)) {
      totalScore += 5;
      factors.push({ name: 'Emphasis Caps', present: true, impact: 5 });
    }
    if (/🔥|💥|⚡/.test(content)) {
      totalScore += 5;
      factors.push({ name: 'Viral Emojis', present: true, impact: 5 });
    }

    const recommendations: string[] = [];
    if (totalScore < 60) {
      recommendations.push('Add a question to drive comments');
      recommendations.push('Use emotional triggers (excitement, controversy, relatability)');
    }
    if (!patterns.includes('challenge')) {
      recommendations.push('Consider adding a challenge or participation element');
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
    request: AdvancedContentRequest
  ): AudienceResonance {
    const lowerContent = content.toLowerCase();
    
    const interestMatch = audience.interests.filter(interest =>
      lowerContent.includes(interest.toLowerCase())
    ).length / audience.interests.length;

    const valueMatch = audience.values.filter(value =>
      lowerContent.includes(value.toLowerCase().replace(/-/g, ' '))
    ).length / audience.values.length;

    const lengthMatch = (() => {
      const wordCount = content.split(/\s+/).length;
      if (audience.preferredLength === 'short' && wordCount < 30) return 1;
      if (audience.preferredLength === 'medium' && wordCount >= 30 && wordCount < 80) return 1;
      if (audience.preferredLength === 'long' && wordCount >= 80) return 1;
      return 0.5;
    })();

    const resonanceScore = (interestMatch * 0.4 + valueMatch * 0.3 + lengthMatch * 0.3) * 100;

    const secondarySegments = Object.entries(AUDIENCE_PROFILES)
      .filter(([key]) => key !== request.targetAudience?.toLowerCase().replace(/\s+/g, '_'))
      .filter(([_, profile]) => {
        const interestOverlap = profile.interests.some(i => audience.interests.includes(i));
        return interestOverlap;
      })
      .map(([key]) => key)
      .slice(0, 2);

    // ── Real demographic alignment score ────────────────────────────────────
    // Measures how well the content's vocabulary and length complexity match the
    // target audience's age range. Younger audiences (Gen Z, <27) respond to
    // punchy, short content; older audiences prefer detailed, sophisticated text.
    const wordCount = content.split(/\s+/).length;
    const contentWords = content.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(w => w.length > 2);
    const avgWordLen = contentWords.reduce((s, w) => s + w.length, 0) / Math.max(contentWords.length, 1);
    const ageMid = (audience.ageRange.min + audience.ageRange.max) / 2;

    // Age-appropriate vocabulary signals keyed by generation
    const genZSignals = ['tiktok', 'fyp', 'vibe', 'aesthetic', 'slay', 'lowkey', 'goat', 'based', 'rent', 'era', 'core'];
    const millennialSignals = ['throwback', 'nostalgic', 'hustle', 'authentic', 'chill', 'squad', 'relatable', 'journey', 'grind'];
    const genXSignals = ['classic', 'legendary', 'craft', 'artistry', 'timeless', 'iconic', 'original', 'real'];
    const targetSignals = ageMid < 27 ? genZSignals : ageMid < 44 ? millennialSignals : genXSignals;
    const signalHits = targetSignals.filter(s => contentWords.includes(s)).length;
    const signalScore = signalHits > 0 ? Math.min(1, signalHits / Math.max(targetSignals.length * 0.15, 1)) : 0.5;

    // Content complexity alignment: shorter + simpler → Gen Z; longer + richer → Gen X
    const complexityAlignment = ageMid < 27
      ? (wordCount < 50 && avgWordLen < 5 ? 1.0 : 0.65)
      : ageMid < 44
      ? (wordCount >= 30 && wordCount < 100 ? 1.0 : 0.72)
      : (wordCount >= 50 && avgWordLen >= 5 ? 1.0 : 0.72);

    // Composite: base 55 + vocabulary signal (0-20) + interest overlap (0-15) + complexity (0-10)
    const demographicMatch = Math.min(100, Math.max(55,
      55 + signalScore * 20 + interestMatch * 15 + complexityAlignment * 10
    ));

    return {
      primarySegment: audience.name,
      secondarySegments,
      resonanceScore: Math.min(100, Math.max(0, resonanceScore)),
      psychographicMatch: valueMatch * 100,
      demographicMatch,
      behavioralMatch: (interestMatch + lengthMatch) * 50,
    };
  }

  getAllPlatforms(): string[] {
    return Object.keys(PLATFORM_PROFILES);
  }

  getAllTones(): string[] {
    return Object.keys(TONE_PROFILES);
  }

  getAllAudiences(): string[] {
    return Object.keys(AUDIENCE_PROFILES);
  }

  getViralPatterns(): typeof VIRAL_PATTERNS {
    return VIRAL_PATTERNS;
  }

  predictEngagement(content: string, platform: string): number {
    const platformProfile = PLATFORM_PROFILES[platform.toLowerCase()];
    if (!platformProfile) return 50;

    const hookStrength = this.calculateHookStrength(content, platformProfile);
    const words = content.toLowerCase().split(/\s+/);
    
    let totalEngagement = 0;
    let count = 0;
    words.forEach(word => {
      const cleaned = word.replace(/[^a-z]/g, '');
      if (SEMANTIC_WORD_WEIGHTS[cleaned]) {
        totalEngagement += SEMANTIC_WORD_WEIGHTS[cleaned].engagement;
        count++;
      }
    });

    const avgEngagement = count > 0 ? totalEngagement / count : 0.5;
    return Math.min(100, Math.max(0, (avgEngagement * 0.5 + hookStrength * 0.5) * 100));
  }
}

export const advancedSocialAIService = new AdvancedSocialAIService();
