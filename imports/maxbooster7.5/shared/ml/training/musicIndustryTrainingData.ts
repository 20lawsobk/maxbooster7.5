/**
 * Music Industry Training Data
 *
 * Static, hand-calibrated corpus, benchmark, and pattern-library data used to
 * train/fine-tune the local NLP `ContentGenerator` and the social/advertising
 * autopilot models (`server/services/baseModelTrainer.ts`). Numeric benchmarks
 * are order-of-magnitude approximations of industry-published figures from the
 * public research sources referenced inline (YouTube-8M, AudioSet, HARRISON,
 * MusicBench, MTG-Jamendo, Social-Media-Instruction) — they are NOT verbatim
 * copies of those datasets, which are far too large to vendor here.
 *
 * IMPORTANT: This module lives under `shared/ml/training/` — do NOT let a
 * generic `training/` gitignore rule swallow this directory again (see
 * .agents/memory/music-industry-training-stub.md). Every export's shape below
 * must match the exact nested-access patterns used by its consumers or those
 * consumers will silently no-op or throw at runtime.
 */

// ─────────────────────────────────────────────────────────────────────────
// Hashtag strategies + viral post corpus (consumed by ContentGenerator.ts)
// ─────────────────────────────────────────────────────────────────────────

export interface SocialMediaMusicPatterns {
  hashtagStrategies: Record<string, string[]>;
}

export const SOCIAL_MEDIA_MUSIC_PATTERNS: SocialMediaMusicPatterns = {
  hashtagStrategies: {
    general: [
      "#NewMusic",
      "#Music",
      "#Artist",
      "#MusicLife",
      "#IndependentArtist",
      "#StreamNow",
      "#MusicProduction",
      "#Studio",
      "#Original",
      "#SoundCloud",
    ],
    "hip-hop": [
      "#HipHop",
      "#Rap",
      "#HipHopMusic",
      "#NewRap",
      "#TrapMusic",
      "#Bars",
      "#Freestyle",
      "#Lyricist",
      "#HipHopArtist",
    ],
    pop: [
      "#PopMusic",
      "#Pop",
      "#PopStar",
      "#PopArtist",
      "#PopSong",
      "#MainstreamPop",
      "#IndiePop",
      "#PopVibes",
    ],
    electronic: [
      "#ElectronicMusic",
      "#EDM",
      "#Electronic",
      "#Techno",
      "#HouseMusic",
      "#Synth",
      "#BeatMaker",
      "#ElectronicProducer",
    ],
    rnb: [
      "#RnB",
      "#RandB",
      "#SoulMusic",
      "#NeoSoul",
      "#RnBArtist",
      "#SmoothRnB",
    ],
    rock: [
      "#Rock",
      "#RockMusic",
      "#IndieRock",
      "#AlternativeRock",
      "#RockArtist",
      "#LiveMusic",
    ],
    jazz: [
      "#Jazz",
      "#JazzMusic",
      "#JazzArtist",
      "#Improvisation",
      "#JazzVibes",
      "#SmoothJazz",
    ],
    classical: [
      "#Classical",
      "#ClassicalMusic",
      "#Orchestra",
      "#Composer",
      "#ClassicalComposer",
    ],
    country: [
      "#Country",
      "#CountryMusic",
      "#CountryArtist",
      "#Nashville",
      "#CountrySong",
    ],
    latin: [
      "#Latin",
      "#LatinMusic",
      "#LatinArtist",
      "#Reggaeton",
      "#Salsa",
      "#LatinPop",
    ],
    indie: [
      "#Indie",
      "#IndieMusic",
      "#IndieArtist",
      "#UndergroundMusic",
      "#DIY",
    ],
  },
};

const GENRE_HASHTAG_MAP: Record<string, string[]> = {
  "hip-hop": ["#HipHop", "#Rap", "#TrapMusic", "#Bars"],
  pop: ["#PopMusic", "#Pop", "#PopStar"],
  electronic: ["#ElectronicMusic", "#EDM", "#Synth"],
  rnb: ["#RnB", "#SoulMusic", "#NeoSoul"],
  rock: ["#Rock", "#RockMusic", "#IndieRock"],
  jazz: ["#Jazz", "#JazzMusic", "#Improvisation"],
  classical: ["#Classical", "#ClassicalMusic", "#Orchestra"],
  country: ["#Country", "#CountryMusic", "#Nashville"],
  latin: ["#Latin", "#LatinMusic", "#Reggaeton"],
  indie: ["#Indie", "#IndieMusic", "#IndieArtist"],
};

const BASE_HASHTAGS = ["#NewMusic", "#Artist", "#StreamNow"];

/**
 * Returns a stable list of hashtags for a given genre.
 * Always includes #NewMusic. Falls back gracefully for unknown genres.
 */
export function getHashtagsForGenre(genre: string): string[] {
  const genreKey = genre.toLowerCase();
  const specific = GENRE_HASHTAG_MAP[genreKey] ?? [];
  return [...specific, ...BASE_HASHTAGS];
}

/**
 * Flat corpus of viral music-industry social media posts used
 * to seed the Markov chain model in ContentGenerator.
 */
export const VIRAL_CONTENT_CORPUS_FLAT: string[] = [
  "Just dropped my new single — go stream it now!",
  "In the studio working on something special 🎵",
  "New music Friday is almost here. Stay ready.",
  "The grind never stops. New release coming soon.",
  "Grateful for every stream, every share, every supporter.",
  "Behind every great track is a sleepless night in the studio.",
  "This one goes out to everyone who believed from day one.",
  "New vibes incoming. Drop date locked in.",
  "Studio sessions hit different when the energy is right.",
  "From demo to master — the journey is the art.",
  "Clip from last night's session. Album mode activated.",
  "Woke up and chose music. Every single day.",
  "The beat found me before I found it.",
  "Another milestone reached. Thank you for your support!",
  "Music is the only language I've never had to translate.",
  "New chapter, new sound, same dedication.",
  "Producing for the culture, releasing for the soul.",
  "Your playlist just leveled up. New drop live now.",
  "Hard work + consistency = results. Always.",
  "Stream, share, repeat. Let's get this to the top.",
  "Building something that will outlast the algorithm.",
  "Not just music — it's a movement.",
  "Crafted every note with intention. Hope you feel it.",
  "The biggest show of my career is coming. Tickets linked.",
  "Music heals. That's why I keep making it.",
  "Studio locked in. No distractions, just creation.",
  "This record means everything to me. Hope it means something to you too.",
  "Fan support is the fuel that keeps this engine running.",
  "New track, new era. We're just getting started.",
  "Art without borders. Music without limits.",
];

// ─────────────────────────────────────────────────────────────────────────
// Organic-as-ads + paid benchmark data (consumed by baseModelTrainer.ts)
// ─────────────────────────────────────────────────────────────────────────

/**
 * Encodes the zero-spend "organic-as-ads" strategy: how to sequence posts
 * across platforms to trigger algorithmic amplification, and how each
 * marketing-funnel stage maps to an organic tactic.
 */
export const ORGANIC_AS_ADS_PATTERNS = {
  crossPlatformBurstStrategy: {
    sequencing: {
      t0: { platform: "tiktok", rationale: "Fastest algorithmic discovery window; post first to capture early velocity." },
      t2h: { platform: "instagram", rationale: "Reels favor content already showing outside traction." },
      t4h: { platform: "twitter", rationale: "Ride the early engagement into real-time conversation." },
      t6h: { platform: "youtube", rationale: "Shorts surfaces cross-platform trending audio/hooks." },
      t24h: { platform: "facebook", rationale: "Slower discovery graph; benefits from a full day of social proof." },
    },
  },
  funnelReplication: {
    awareness: {
      organicTactic: "Broad-reach short-form hook content designed for algorithmic discovery (cold audience)",
    },
    consideration: {
      organicTactic: "Behind-the-scenes / process content that builds parasocial trust with warm audience",
    },
    conversion: {
      organicTactic: "Direct call-to-action content (link in bio, presave, stream now) to convert warmed audience",
    },
  },
};

/**
 * Real-world-calibrated paid advertising benchmarks used both to generate
 * synthetic "paid campaign" training samples and to compute the organic
 * conversion-rate uplift the model should aim to replicate without spend.
 */
export const PAID_AD_BENCHMARKS = {
  performanceVsOrganic: {
    conversionComparison: {
      // Organic converts better than cold paid traffic because of higher
      // audience trust/authenticity — used as the CVR baseline for
      // synthetic organic-as-ads campaigns.
      organicCVR: 0.045,
      paidColdCVR: 0.02,
      paidRetargetingCVR: 0.08,
    },
  },
  platformMetrics: {
    meta_instagram: {
      avgCPM: { engagement: 6.5, conversion: 11.5 },
      avgCTR: { video: 0.012, carousel: 0.009, image: 0.007, story: 0.01 },
      avgCVR: { coldAudience: 0.02, warmAudience: 0.045, retargeting: 0.08 },
      frequencyOptimal: { min: 1.5, max: 3.5 },
    },
    tiktok_ads: {
      avgCPM: { engagement: 5.0, conversion: 9.5 },
      avgCTR: { video: 0.016, carousel: 0.008, image: 0.006, story: 0.012 },
      avgCVR: { coldAudience: 0.018, warmAudience: 0.04, retargeting: 0.07 },
      frequencyOptimal: { min: 1.2, max: 3.0 },
    },
  },
};

/**
 * Feature weights used to synthesize realistic engagement-prediction
 * training samples (content, temporal, and music-specific multipliers).
 */
export const ENGAGEMENT_PREDICTION_FEATURES = {
  contentFactors: {
    hashtagCount: { optimal: { min: 3, max: 8 } },
    mediaPresence: { videoMultiplier: 2.2, imageMultiplier: 1.4 },
  },
  temporalFactors: {
    hourOfDay: { peakHours: [8, 12, 17, 18, 19, 20, 21] },
    dayOfWeek: { peakDays: [2, 3, 4, 5] }, // Tue-Fri
  },
  musicSpecificFactors: {
    newRelease: { multiplier: 1.8 },
    behindTheScenes: { multiplier: 1.2 },
    liveSession: { multiplier: 1.5 },
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Genre-specific viral hooks (consumed by baseModelTrainer.ts Phase 1)
// ─────────────────────────────────────────────────────────────────────────

const HOOK_PLATFORMS = ["tiktok", "instagram", "twitter", "youtube"] as const;

function buildGenreHooks(genreLabel: string): Record<(typeof HOOK_PLATFORMS)[number], readonly string[]> {
  return {
    tiktok: [
      `POV: you just found your new favorite ${genreLabel} track`,
      `Wait for the drop... 🔥 #${genreLabel.replace(/[^a-zA-Z0-9]/g, "")}`,
      `This ${genreLabel} beat is about to be everywhere`,
      `Rating my own ${genreLabel} track (be honest in the comments)`,
    ],
    instagram: [
      `New ${genreLabel} single out now — swipe for the story behind it`,
      `Studio diary: making this ${genreLabel} record`,
      `Tag someone who needs this ${genreLabel} track today`,
    ],
    twitter: [
      `dropped a new ${genreLabel} record, would mean the world if you gave it a spin`,
      `${genreLabel} heads — this one's for you`,
    ],
    youtube: [
      `Official ${genreLabel} Music Video — Out Now`,
      `Making a ${genreLabel} beat from scratch (full process)`,
    ],
  };
}

export const GENRE_VIRAL_HOOKS: Record<string, Record<(typeof HOOK_PLATFORMS)[number], readonly string[]>> = {
  "hip-hop": buildGenreHooks("hip-hop"),
  pop: buildGenreHooks("pop"),
  electronic: buildGenreHooks("electronic"),
  rnb: buildGenreHooks("R&B"),
  rock: buildGenreHooks("rock"),
  latin: buildGenreHooks("Latin"),
  country: buildGenreHooks("country"),
  indie: buildGenreHooks("indie"),
};

// ─────────────────────────────────────────────────────────────────────────
// Platform content script formulas (baseModelTrainer.ts Phase 7)
// ─────────────────────────────────────────────────────────────────────────

export const PLATFORM_CONTENT_SCRIPTS = {
  tiktok: {
    viralHookFormulas: [
      "POV: [relatable music-creation scenario]",
      "Wait for it... [beat drop / vocal switch-up]",
      "Rating my [song/beat] out of 10 (comment yours)",
      "Things that just hit different: [track]",
      "Nobody asked but here's my new [track]",
    ],
  },
  instagram: {
    reelsHookFormulas: [
      "The story behind [track name]",
      "This is your sign to listen to [track name]",
      "Studio session that turned into [track name]",
      "Swipe for the making of [track name]",
    ],
  },
  twitter: {
    standaloneFormats: {
      soft_launch: "dropped something new, no pressure but you should hear it",
      direct_ask: "if you have 3 minutes today, spend them on my new track",
      thread_story: "the story behind how this song came together (thread)",
    },
  },
  youtube: {
    titleFormulas: [
      "{Artist} - {Track} (Official Music Video)",
      "{Artist} - {Track} (Official Audio)",
      "Making {Track} From Scratch | Studio Session",
      "{Track} - {Artist} (Lyrics)",
    ],
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Call-to-action library (baseModelTrainer.ts Phase 2)
// ─────────────────────────────────────────────────────────────────────────

export interface CallToActionEntry {
  type:
    | "stream"
    | "follow"
    | "dm"
    | "engagement"
    | "share"
    | "subscribe"
    | "save"
    | "tag";
  text: string;
}

export const CALL_TO_ACTION_LIBRARY: CallToActionEntry[] = [
  { type: "stream", text: "Stream it now — link in bio" },
  { type: "stream", text: "Out now on all platforms" },
  { type: "stream", text: "Add it to your playlist" },
  { type: "follow", text: "Follow for more like this" },
  { type: "follow", text: "Follow so you don't miss the next drop" },
  { type: "dm", text: "DM me your thoughts" },
  { type: "dm", text: "Slide into the DMs if you want the stems" },
  { type: "engagement", text: "Comment your favorite lyric" },
  { type: "engagement", text: "Rate this 1-10 in the comments" },
  { type: "share", text: "Share this with someone who needs it" },
  { type: "share", text: "Repost if you're a real one" },
  { type: "subscribe", text: "Subscribe for the full session" },
  { type: "subscribe", text: "Turn on notifications so you catch the next upload" },
  { type: "save", text: "Save this for your next playlist update" },
  { type: "save", text: "Bookmark this before it's gone from your feed" },
  { type: "tag", text: "Tag a friend who'd love this" },
  { type: "tag", text: "Tag someone who needs to hear this today" },
];

// ─────────────────────────────────────────────────────────────────────────
// Emotional trigger pattern library (baseModelTrainer.ts Phase 6)
// ─────────────────────────────────────────────────────────────────────────

export interface EmotionalTriggerEntry {
  triggers: string[];
  copyTemplates: string[];
  strength: number; // 0-1 relative psychological pull, used for weighting
}

export const EMOTIONAL_TRIGGER_PATTERNS: Record<string, EmotionalTriggerEntry> = {
  fomo: {
    triggers: ["limited time", "before it's gone", "everyone's talking about", "don't miss out"],
    copyTemplates: [
      "This won't be free/available forever — grab it now",
      "Everyone's already streaming this, don't be the last one",
    ],
    strength: 0.85,
  },
  nostalgia: {
    triggers: ["remember when", "throwback", "takes me back", "old school"],
    copyTemplates: [
      "This one takes me back to where it all started",
      "For everyone who's been here since day one",
    ],
    strength: 0.7,
  },
  belonging: {
    triggers: ["for my", "we", "family", "the culture", "us"],
    copyTemplates: [
      "This one's for everyone who's been riding with me",
      "We built this together — thank you",
    ],
    strength: 0.75,
  },
  aspiration: {
    triggers: ["dream", "goal", "vision", "next level", "future"],
    copyTemplates: [
      "This is what the vision looks like when it comes to life",
      "One step closer to the dream",
    ],
    strength: 0.65,
  },
  curiosity: {
    triggers: ["you won't believe", "wait for it", "guess what", "secret"],
    copyTemplates: [
      "Wait until you hear what happens at 0:45",
      "You won't believe how this track came together",
    ],
    strength: 0.8,
  },
  pride: {
    triggers: ["proud", "hard work", "grind", "finally"],
    copyTemplates: [
      "So proud to finally share this with you",
      "Years of grinding led to this moment",
    ],
    strength: 0.6,
  },
};

// ─────────────────────────────────────────────────────────────────────────
// Video content training pack (baseModelTrainer.ts Phases 3-5)
// ─────────────────────────────────────────────────────────────────────────

export const VIDEO_CONTENT_TRAINING_PACK = {
  // Approximate music-category engagement rates, inspired by the public
  // YouTube-8M "Music" vertical category breakdown.
  youtubeEightM: {
    musicCategoryEngagementRates: {
      "hip-hop": { likeRate: 0.041, commentRate: 0.006, shareRate: 0.009 },
      pop: { likeRate: 0.038, commentRate: 0.005, shareRate: 0.008 },
      electronic: { likeRate: 0.035, commentRate: 0.004, shareRate: 0.011 },
      rnb: { likeRate: 0.033, commentRate: 0.005, shareRate: 0.007 },
      rock: { likeRate: 0.03, commentRate: 0.004, shareRate: 0.006 },
      latin: { likeRate: 0.044, commentRate: 0.007, shareRate: 0.012 },
      country: { likeRate: 0.029, commentRate: 0.004, shareRate: 0.005 },
      indie: { likeRate: 0.027, commentRate: 0.004, shareRate: 0.006 },
    },
    videoFeatureImportance: {
      hookInFirst3Seconds: 0.42,
      capturedFaceOnScreen: 0.18,
      textOverlayPresent: 0.14,
      beatDropTimingMatch: 0.26,
    },
  },
  // Approximate audio-signal engagement boosts, inspired by public AudioSet
  // sound-event categories relevant to short-form music content.
  audioSetPatterns: {
    tenSecondClipSignals: {
      dropPresent: { engagementBoost: 1.65, shareabilityBoost: 1.8 },
      vocalHookPresent: { engagementBoost: 1.4, shareabilityBoost: 1.3 },
      bassHeavy: { engagementBoost: 1.25, shareabilityBoost: 1.15 },
      silenceOrPause: { engagementBoost: 0.85, shareabilityBoost: 0.8 },
    },
  },
  // Video/music alignment lift, inspired by beat-synced editing research.
  harmonySetPatterns: {
    videoMusicAlignment: {
      beatSyncedEditing: { retentionLift: 0.22, shareabilityLift: 0.19 },
      colorGradeMoodMatch: { retentionLift: 0.08, shareabilityLift: 0.06 },
    },
  },
  // Genre-specific text descriptor templates, in the spirit of MusicBench's
  // text-music pair captions (used to caption/describe generated content).
  musicBenchTextPairs: {
    genreDescriptors: {
      "hip-hop": ["hard-hitting 808s with a confident flow", "boom-bap drums with witty wordplay"],
      pop: ["catchy hook with a polished, radio-ready mix", "upbeat verse-chorus structure with bright synths"],
      electronic: ["four-on-the-floor kick with layered synth pads", "buildup into an energetic drop"],
      rnb: ["smooth vocal runs over a laid-back groove", "warm chords with intimate, soulful delivery"],
      rock: ["driving guitar riff with live-feel drums", "anthemic chorus with distorted power chords"],
      latin: ["syncopated percussion with a danceable groove", "bright horns over a reggaeton-inspired beat"],
    },
  },
  // Tag co-occurrence + tempo correlation, in the spirit of the CC-licensed
  // MTG-Jamendo tag dataset.
  mtgJamendoInsights: {
    highEngagementTagCombinations: [
      { tags: ["energetic", "danceable"], engagementIndex: 1.3 },
      { tags: ["chill", "melodic"], engagementIndex: 1.1 },
      { tags: ["dark", "atmospheric"], engagementIndex: 1.05 },
      { tags: ["uplifting", "anthemic"], engagementIndex: 1.25 },
    ],
    tempoEngagementCorrelation: {
      "slow_60-90bpm": 0.9,
      "mid_90-120bpm": 1.1,
      "fast_120-140bpm": 1.2,
      "veryFast_140plus": 1.05,
    },
  },
};
