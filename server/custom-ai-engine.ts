import { logger } from "./logger.js";

/**
 * FNV-1a 32-bit hash for deterministic seeded selection.
 * Same algorithm used across all content-generation services for consistency.
 */
function seededIndex(seed: string, length: number): number {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return hash % length;
}

/**
 * Seeded Fisher-Yates shuffle — produces a deterministic ordering from a string seed.
 */
function seededShuffle<T>(arr: T[], seed: string): T[] {
  const out = [...arr];
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  for (let i = out.length - 1; i > 0; i--) {
    hash = (hash * 16777619 + i) >>> 0;
    const j = hash % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface ModelParameters {
  [key: string]: Record<string, unknown>;
}

interface ContentGenerationParams {
  topic: string;
  platform: string;
  brandVoice: string;
  contentType: string;
  targetAudience: string;
  businessGoals: string[];
}

interface GeneratedContent {
  text: string;
  hashtags: string[];
  hook?: string;
  callToAction?: string;
  mediaRecommendation?: string;
  templateUsed?: string;
  variationIndex?: number;
}

interface TemplatePerformance {
  templateId: string;
  platform: string;
  contentType: string;
  usageCount: number;
  totalEngagement: number;
  avgEngagement: number;
  totalReach: number;
  avgReach: number;
  lastUsed: string;
  engagementHistory: number[];
}

interface ContentTemplate {
  id: string;
  category: string;
  name: string;
  template: string;
  platforms: string[];
  hooks: string[];
  callToActions: string[];
  emojiSets: string[][];
  variations: string[];
}

type HookType =
  | "question"
  | "statistic"
  | "story"
  | "controversy"
  | "teaser"
  | "challenge";

const PLATFORM_LIMITS = {
  twitter: { maxChars: 280, hashtagCount: 3, emojiDensity: "low" },
  instagram: { maxChars: 2200, hashtagCount: 30, emojiDensity: "high" },
  linkedin: { maxChars: 3000, hashtagCount: 5, emojiDensity: "minimal" },
  tiktok: { maxChars: 2200, hashtagCount: 8, emojiDensity: "high" },
  facebook: { maxChars: 63206, hashtagCount: 5, emojiDensity: "medium" },
  youtube: { maxChars: 5000, hashtagCount: 15, emojiDensity: "medium" },
};

const CONTENT_TEMPLATES: ContentTemplate[] = [
  {
    id: "announcement_new_release",
    category: "music_announcement",
    name: "New Release Announcement",
    template:
      '{hook} {artist} just dropped "{title}" {emoji} {description} {cta}',
    platforms: ["twitter", "instagram", "tiktok", "facebook", "linkedin"],
    hooks: [
      "🚨 NEW MUSIC ALERT!",
      "The wait is OVER!",
      "It's finally here...",
      "🔥 OUT NOW:",
      "Breaking: New heat just dropped!",
    ],
    callToActions: [
      "Stream now on all platforms! 🎧",
      "Link in bio to listen!",
      "Go run it up! 💯",
      "Pre-save and be first to hear!",
      "Drop a 🔥 if you're ready!",
    ],
    emojiSets: [
      ["🎵", "🔥", "💿", "🎧"],
      ["⚡", "🌟", "✨", "🎤"],
      ["🚀", "💥", "🔊", "🎹"],
    ],
    variations: [
      "{hook} {title} by {artist} is officially OUT! {emoji} {description} {cta}",
      '{artist} presents: "{title}" {emoji} {hook} {description} {cta}',
      '{emoji} {hook} "{title}" available everywhere NOW! {description} {cta}',
    ],
  },
  {
    id: "behind_the_scenes",
    category: "behind_the_scenes",
    name: "Behind The Scenes",
    template: "{hook} {description} {emoji} {insight} {cta}",
    platforms: ["instagram", "tiktok", "youtube", "facebook"],
    hooks: [
      "Studio vibes 🎚️",
      "Ever wonder how the magic happens?",
      "A little peek behind the curtain...",
      "Late night session update:",
      "The making of...",
    ],
    callToActions: [
      "Want to see more BTS content?",
      "Comment what song you want next!",
      "The full track drops soon 👀",
      "Stay tuned for the final result!",
      "Which part sounds best to you?",
    ],
    emojiSets: [
      ["🎚️", "🎛️", "🎙️", "💡"],
      ["🌙", "✨", "🔮", "🎹"],
      ["📹", "🎬", "🎥", "👀"],
    ],
    variations: [
      "{hook} Here's a sneak peek at what we're cooking up! {emoji} {description} {cta}",
      "{emoji} {hook} {description} The process is just as beautiful as the final product. {cta}",
      "What happens in the studio doesn't always stay in the studio {emoji} {hook} {description} {cta}",
    ],
  },
  {
    id: "fan_engagement",
    category: "fan_engagement",
    name: "Fan Engagement Post",
    template: "{hook} {question} {emoji} {context} {cta}",
    platforms: ["twitter", "instagram", "tiktok", "facebook"],
    hooks: [
      "Real talk:",
      "I need your honest opinion...",
      "Let's settle this:",
      "Question for my day ones:",
      "Help me decide!",
    ],
    callToActions: [
      "Drop your answer below! 👇",
      "Vote in the comments!",
      "Tag someone who needs to see this!",
      "Share your thoughts!",
      "Let me know in the replies!",
    ],
    emojiSets: [
      ["🤔", "💭", "❓", "👇"],
      ["💬", "🗣️", "📢", "🎤"],
      ["❤️", "🙏", "💯", "✌️"],
    ],
    variations: [
      "{hook} {question} {emoji} I genuinely want to hear from YOU! {cta}",
      "{emoji} {hook} {question} Your opinion matters to me more than you know. {cta}",
      "No right or wrong answers here {emoji} {hook} {question} {cta}",
    ],
  },
  {
    id: "release_promotion",
    category: "release_promotion",
    name: "Release Promotion",
    template: "{hook} {title} has hit {milestone}! {emoji} {gratitude} {cta}",
    platforms: ["twitter", "instagram", "tiktok", "facebook", "linkedin"],
    hooks: [
      "WE DID IT!",
      "This is INSANE!",
      "I can't believe it...",
      "THANK YOU!",
      "Y'all really showed up!",
    ],
    callToActions: [
      "Keep streaming! Let's go higher! 🚀",
      "Share with someone who hasn't heard it yet!",
      "Can we hit the next milestone?",
      "This is just the beginning!",
      "Let's keep this energy going! 💪",
    ],
    emojiSets: [
      ["🎉", "🏆", "📈", "💎"],
      ["🙏", "❤️", "🔥", "⭐"],
      ["💯", "🚀", "✨", "👑"],
    ],
    variations: [
      '{emoji} {hook} "{title}" just reached {milestone}! {gratitude} {cta}',
      '{hook} {emoji} {milestone} streams on "{title}"! {gratitude} {cta}',
      "From my heart to your speakers {emoji} {title} hit {milestone}! {hook} {gratitude} {cta}",
    ],
  },
  {
    id: "collaboration_highlight",
    category: "collaboration",
    name: "Collaboration Highlight",
    template: "{hook} {collaborator} {emoji} {description} {cta}",
    platforms: ["twitter", "instagram", "tiktok", "facebook", "linkedin"],
    hooks: [
      "Dream collab loading...",
      "When two worlds collide 🌍",
      "Been waiting to share this!",
      "The link up you've been asking for:",
      "Special announcement:",
    ],
    callToActions: [
      "Who else should we work with?",
      "Tag them so they see this!",
      "Can't wait for you to hear the full thing!",
      "Pre-save now!",
      "Drop a 🔥 if you're hyped!",
    ],
    emojiSets: [
      ["🤝", "⚡", "🌟", "💫"],
      ["🎤", "🎵", "🔥", "✨"],
      ["👥", "💪", "🙌", "🚀"],
    ],
    variations: [
      "{hook} {emoji} Me x {collaborator}! {description} {cta}",
      "{emoji} {hook} Something special cooking with {collaborator}! {description} {cta}",
      "What happens when you put me and {collaborator} in the same room? {emoji} {description} {cta}",
    ],
  },
  {
    id: "studio_update",
    category: "studio_update",
    name: "Studio Update",
    template: "{hook} {status} {emoji} {teaser} {cta}",
    platforms: ["twitter", "instagram", "tiktok", "facebook"],
    hooks: [
      "Studio mode: ACTIVATED 🎚️",
      "Another day, another song...",
      "The grind never stops!",
      "When inspiration hits at 3AM:",
      "Creating something special...",
    ],
    callToActions: [
      "What kind of vibe should the next track be?",
      "Any guesses what I'm working on?",
      "Updates coming soon!",
      "Stay locked in 🔐",
      "Notifications ON if you don't wanna miss it!",
    ],
    emojiSets: [
      ["🎚️", "🎛️", "🎹", "🔊"],
      ["🌙", "☕", "💡", "✍️"],
      ["🔥", "💿", "🎧", "⚡"],
    ],
    variations: [
      "{hook} {emoji} {status}. {teaser} {cta}",
      "{emoji} {hook} Locked in and focused. {status} {teaser} {cta}",
      "No days off {emoji} {hook} {status} {teaser} {cta}",
    ],
  },
];

const HOOK_TEMPLATES: Record<HookType, string[]> = {
  question: [
    "Have you ever wondered {topic}?",
    "What if I told you {topic}?",
    "Can we talk about {topic} for a second?",
    "Why doesn't anyone talk about {topic}?",
    "Quick question: {topic}?",
    "Be honest - {topic}?",
    "What's your take on {topic}?",
  ],
  statistic: [
    "Did you know? {topic}",
    "Fun fact: {topic}",
    "The numbers don't lie - {topic}",
    "Here's something wild: {topic}",
    "{percentage}% of artists don't know this about {topic}",
    "The data is clear: {topic}",
    "Research shows {topic}",
  ],
  story: [
    "Let me tell you about {topic}...",
    "Story time: {topic}",
    "I'll never forget when {topic}",
    "True story about {topic}:",
    "This is how {topic} changed everything...",
    "The moment I realized {topic}...",
    "You won't believe what happened with {topic}...",
  ],
  controversy: [
    "Unpopular opinion: {topic}",
    "This might be controversial but {topic}",
    "Hot take: {topic}",
    "I know I'll get hate for this, but {topic}",
    "Let's debate: {topic}",
    "Agree or disagree? {topic}",
    "Said what I said: {topic}",
  ],
  teaser: [
    "Something big is coming... {topic}",
    "Not supposed to say this but... {topic}",
    "Sneak peek: {topic}",
    "You're not ready for {topic}",
    "Mark your calendars: {topic}",
    "The countdown begins... {topic}",
    "Stay tuned for {topic}...",
  ],
  challenge: [
    "Challenge: {topic}",
    "Can you do this? {topic}",
    "I challenge you to {topic}",
    "Let's see who can {topic}",
    "Bet you can't {topic}",
    "Try this: {topic}",
    "Tag someone who should try {topic}",
  ],
};

const PLATFORM_HASHTAGS: Record<string, Record<string, string[]>> = {
  twitter: {
    music: ["#NewMusic", "#NowPlaying", "#MusicTwitter"],
    release: ["#OutNow", "#NewRelease", "#StreamNow"],
    engagement: ["#MusicCommunity", "#IndieArtist", "#SupportIndieMusic"],
    studio: ["#StudioLife", "#ProducerLife", "#MakingMusic"],
    general: ["#Music", "#Artist", "#Singer"],
  },
  instagram: {
    music: [
      "#newmusic",
      "#musicislife",
      "#instamusic",
      "#musiclover",
      "#musician",
    ],
    release: [
      "#outnow",
      "#newrelease",
      "#justdropped",
      "#linkinbio",
      "#streaming",
    ],
    engagement: [
      "#musiccommunity",
      "#supportlocalartists",
      "#indieartist",
      "#unsigned",
    ],
    studio: ["#studiolife", "#recordingstudio", "#producerlife", "#beatmaker"],
    general: ["#music", "#artist", "#singer", "#songwriter", "#producer"],
  },
  tiktok: {
    music: ["#newmusic", "#foryou", "#fyp", "#viral", "#musicviral"],
    release: ["#newrelease", "#outnow", "#mustlisten", "#trending", "#fypage"],
    engagement: ["#duet", "#stitch", "#challenge", "#trend", "#foryoupage"],
    studio: [
      "#studiolife",
      "#makingmusic",
      "#behindthescenes",
      "#musicproducer",
    ],
    general: ["#music", "#song", "#singer", "#artist", "#viral"],
  },
  linkedin: {
    music: ["#MusicIndustry", "#MusicBusiness", "#Entertainment"],
    release: ["#NewRelease", "#Launch", "#ContentCreator"],
    engagement: ["#CreativeIndustry", "#Networking", "#ArtistDevelopment"],
    studio: ["#Recording", "#Production", "#AudioEngineering"],
    general: [
      "#Music",
      "#Artist",
      "#CreativeEntrepreneur",
      "#IndependentArtist",
    ],
  },
  facebook: {
    music: ["#NewMusic", "#MusicLovers", "#LiveMusic"],
    release: ["#OutNow", "#JustDropped", "#NewSingle"],
    engagement: ["#MusicCommunity", "#SupportArtists", "#IndieMusic"],
    studio: ["#StudioSession", "#RecordingStudio", "#BehindTheScenes"],
    general: ["#Music", "#Artist", "#Musician", "#Singer"],
  },
  youtube: {
    music: ["#newmusic", "#musicvideo", "#officialmusicvideo", "#song"],
    release: ["#premiere", "#outnow", "#newsingle", "#newalbum"],
    engagement: ["#subscribe", "#comment", "#like", "#share"],
    studio: ["#behindthescenes", "#makingof", "#studiolife", "#vlog"],
    general: ["#music", "#artist", "#singer", "#musician"],
  },
};

const BRAND_VOICE_MODIFIERS: Record<
  string,
  { tone: string; vocabulary: string[]; punctuation: string }
> = {
  professional: {
    tone: "formal",
    vocabulary: [
      "announce",
      "present",
      "introduce",
      "share",
      "reveal",
      "unveil",
    ],
    punctuation: ".",
  },
  casual: {
    tone: "relaxed",
    vocabulary: ["drop", "vibe", "peep", "check out", "yo", "hey"],
    punctuation: "!",
  },
  energetic: {
    tone: "excited",
    vocabulary: ["BOOM", "LET'S GO", "FINALLY", "INSANE", "CRAZY", "FIRE"],
    punctuation: "!!!",
  },
  authentic: {
    tone: "genuine",
    vocabulary: [
      "honestly",
      "real talk",
      "from the heart",
      "truth is",
      "genuinely",
    ],
    punctuation: "...",
  },
  edgy: {
    tone: "bold",
    vocabulary: ["disrupt", "break", "push", "rebel", "raw", "unfiltered"],
    punctuation: ".",
  },
  friendly: {
    tone: "warm",
    vocabulary: [
      "hey friends",
      "fam",
      "you guys",
      "everyone",
      "beautiful people",
    ],
    punctuation: "!",
  },
};

class CustomAIEngine {
  private modelParameters: Map<string, ModelParameters> = new Map();
  private performanceHistory: Map<string, any[]> = new Map();
  private templatePerformance: Map<string, TemplatePerformance> = new Map();
  private contentVariationTracker: Map<string, number[]> = new Map();
  private recentlyUsedTemplates: string[] = [];
  private learningWeights: Map<string, number> = new Map();

  constructor() {
    this.initializeDefaultParameters();
    this.initializeTemplateLearning();
  }

  private initializeDefaultParameters(): void {
    this.modelParameters.set("content_generation", {
      temperature: 0.7,
      maxTokens: 150,
      topP: 0.9,
      frequencyPenalty: 0.3,
      presencePenalty: 0.2,
      templates: ["engaging", "professional", "casual"],
      adaptiveBoost: 0,
      trendContext: [],
    });

    this.modelParameters.set("music_analysis", {
      bpmTolerance: 2,
      keyConfidenceThreshold: 0.7,
      genreClassificationDepth: 3,
      moodDetectionSensitivity: 0.8,
      trendAwareAnalysis: false,
      recentGenreTrends: [],
    });

    this.modelParameters.set("social_posting", {
      optimalPostingTimes: [9, 12, 15, 18, 21],
      hashtagDensity: 5,
      contentMixRatio: { video: 0.4, image: 0.4, text: 0.2 },
      engagementHooks: ["question", "cta", "teaser"],
      platformOptimizations: {},
      algorithmAwarePosting: false,
    });
  }

  private initializeTemplateLearning(): void {
    for (const template of CONTENT_TEMPLATES) {
      const perfKey = `${template.id}_default`;
      this.templatePerformance.set(perfKey, {
        templateId: template.id,
        platform: "all",
        contentType: template.category,
        usageCount: 0,
        totalEngagement: 0,
        avgEngagement: 0,
        totalReach: 0,
        avgReach: 0,
        lastUsed: "",
        engagementHistory: [],
      });
      this.learningWeights.set(template.id, 1.0);
    }
  }

  updateModelParameters(modelType: string, parameters: ModelParameters): void {
    const existing = this.modelParameters.get(modelType) || {};
    const updated = { ...existing, ...parameters };
    this.modelParameters.set(modelType, updated);
    logger.info(`🔧 Updated ${modelType} parameters:`, parameters);
  }

  getModelParameters(modelType: string): ModelParameters | undefined {
    return this.modelParameters.get(modelType);
  }

  getAllModelParameters(): Map<string, ModelParameters> {
    return new Map(this.modelParameters);
  }

  recordPerformance(modelType: string, metrics: unknown): void {
    const history = this.performanceHistory.get(modelType) || [];
    history.push({
      ...(metrics as object),
      timestamp: new Date().toISOString(),
    });

    if (history.length > 100) {
      history.shift();
    }

    this.performanceHistory.set(modelType, history);
  }

  getPerformanceHistory(modelType: string): unknown[] {
    return this.performanceHistory.get(modelType) || [];
  }

  getPerformanceSummary(modelType: string): Record<string, unknown> {
    const history = this.performanceHistory.get(modelType) || [];
    if (history.length === 0) {
      return { records: 0, avgEngagement: 0, avgQuality: 0 };
    }

    const avgEngagement =
      history.reduce((sum, h) => sum + (h.engagement || 0), 0) / history.length;
    const avgQuality =
      history.reduce((sum, h) => sum + (h.quality || 0), 0) / history.length;

    return {
      records: history.length,
      avgEngagement: avgEngagement.toFixed(4),
      avgQuality: avgQuality.toFixed(4),
      latestUpdate: history[history.length - 1]?.timestamp,
    };
  }

  async generateContent(
    params: ContentGenerationParams,
  ): Promise<GeneratedContent> {
    const {
      topic,
      platform,
      brandVoice,
      contentType,
      targetAudience,
      businessGoals,
    } = params;
    const normalizedPlatform = platform.toLowerCase();

    const template = this.selectOptimalTemplate(
      contentType,
      normalizedPlatform,
    );
    const variationIndex = this.selectVariation(template);
    const hook = this.generateHook(topic, this.selectHookType(businessGoals));
    const hashtags = this.generateHashtags(
      topic,
      normalizedPlatform,
      this.getHashtagCount(normalizedPlatform),
    );

    let content = this.buildContentFromTemplate(template, variationIndex, {
      topic,
      hook,
      brandVoice,
      targetAudience,
    });

    content = this.optimizeForPlatform(content, normalizedPlatform);
    content = this.applyBrandVoice(content, brandVoice);

    const callToAction = this.selectCallToAction(template, businessGoals);
    const mediaRecommendation = this.getMediaRecommendation(
      normalizedPlatform,
      contentType,
    );

    this.trackTemplateUsage(template.id, normalizedPlatform);

    this.recordPerformance("content_generation", {
      platform: normalizedPlatform,
      topic,
      templateId: template.id,
      variationIndex,
      brandVoice,
      contentType,
      businessGoals,
    });

    return {
      text: content,
      hashtags,
      hook,
      callToAction,
      mediaRecommendation,
      templateUsed: template.id,
      variationIndex,
    };
  }

  generateHook(topic: string, hookType: HookType): string {
    const templates = HOOK_TEMPLATES[hookType] || HOOK_TEMPLATES.teaser;
    const selectedTemplate =
      templates[
        seededIndex(`hook-template:${topic}:${hookType}`, templates.length)
      ];

    let hook = selectedTemplate.replace(/{topic}/g, topic);

    if (hook.includes("{percentage}")) {
      const pctBase = seededIndex(`hook-pct:${topic}:${hookType}`, 40);
      const percentage = 60 + pctBase;
      hook = hook.replace(/{percentage}/g, percentage.toString());
    }

    return hook;
  }

  optimizeForPlatform(content: string, platform: string): string {
    const limits =
      PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS] ||
      PLATFORM_LIMITS.instagram;
    let optimized = content;

    if (platform === "twitter") {
      if (optimized.length > limits.maxChars) {
        optimized = this.truncateForTwitter(optimized, limits.maxChars);
      }
      optimized = this.removeExcessiveEmojis(optimized);
    }

    if (platform === "instagram") {
      optimized = this.addEmojis(optimized, "high");
      optimized = this.formatForInstagram(optimized);
    }

    if (platform === "linkedin") {
      optimized = this.formatForLinkedIn(optimized);
      optimized = this.removeExcessiveEmojis(optimized);
    }

    if (platform === "tiktok") {
      optimized = this.formatForTikTok(optimized);
      optimized = this.addEmojis(optimized, "high");
    }

    if (platform === "facebook") {
      optimized = this.formatForFacebook(optimized);
    }

    return optimized;
  }

  generateHashtags(
    content: string,
    platform: string,
    count: number = 5,
  ): string[] {
    const platformTags =
      PLATFORM_HASHTAGS[platform] || PLATFORM_HASHTAGS.instagram;
    const contentLower = content.toLowerCase();

    let category = "general";
    if (
      contentLower.includes("release") ||
      contentLower.includes("drop") ||
      contentLower.includes("out now")
    ) {
      category = "release";
    } else if (
      contentLower.includes("studio") ||
      contentLower.includes("recording") ||
      contentLower.includes("session")
    ) {
      category = "studio";
    } else if (
      contentLower.includes("collab") ||
      contentLower.includes("feature") ||
      contentLower.includes("community")
    ) {
      category = "engagement";
    } else if (
      contentLower.includes("song") ||
      contentLower.includes("track") ||
      contentLower.includes("music")
    ) {
      category = "music";
    }

    const categoryTags = platformTags[category] || platformTags.general;
    const generalTags = platformTags.general;

    const selectedTags: string[] = [];
    const usedTags = new Set<string>();

    const addUniqueTag = (tag: string) => {
      const normalizedTag = tag.toLowerCase();
      if (!usedTags.has(normalizedTag) && selectedTags.length < count) {
        usedTags.add(normalizedTag);
        selectedTags.push(tag);
      }
    };

    const shuffled = seededShuffle(
      [...categoryTags],
      `hashtags:${content.slice(0, 32)}:${platform}:cat`,
    );
    shuffled.forEach((tag) => addUniqueTag(tag));

    const shuffledGeneral = seededShuffle(
      [...generalTags],
      `hashtags:${content.slice(0, 32)}:${platform}:gen`,
    );
    shuffledGeneral.forEach((tag) => addUniqueTag(tag));

    const performanceTags = this.getHighPerformingHashtags(
      platform,
      count - selectedTags.length,
    );
    performanceTags.forEach((tag) => addUniqueTag(tag));

    return selectedTags.slice(0, count);
  }

  updatePerformanceData(
    contentType: string,
    platform: string,
    templateIndex: number,
    analytics: {
      engagement?: number;
      reach?: number;
      likes?: number;
      shares?: number;
      comments?: number;
    },
  ): void {
    const template = CONTENT_TEMPLATES[templateIndex] || CONTENT_TEMPLATES[0];
    const perfKey = `${template.id}_${platform}`;

    let perf = this.templatePerformance.get(perfKey);
    if (!perf) {
      perf = {
        templateId: template.id,
        platform,
        contentType,
        usageCount: 0,
        totalEngagement: 0,
        avgEngagement: 0,
        totalReach: 0,
        avgReach: 0,
        lastUsed: "",
        engagementHistory: [],
      };
    }

    const engagement =
      analytics.engagement ??
      (analytics.likes || 0) +
        (analytics.shares || 0) * 2 +
        (analytics.comments || 0) * 3;
    const reach = analytics.reach || 0;

    perf.usageCount++;
    perf.totalEngagement += engagement;
    perf.avgEngagement = perf.totalEngagement / perf.usageCount;
    perf.totalReach += reach;
    perf.avgReach = perf.totalReach / perf.usageCount;
    perf.lastUsed = new Date().toISOString();
    perf.engagementHistory.push(engagement);

    if (perf.engagementHistory.length > 50) {
      perf.engagementHistory.shift();
    }

    this.templatePerformance.set(perfKey, perf);
    this.updateLearningWeights(template.id, engagement);

    this.recordPerformance("content_generation", {
      contentType,
      platform,
      templateIndex,
      templateId: template.id,
      ...analytics,
    });

    logger.info(
      `📊 Updated performance for ${template.id} on ${platform}: avg engagement ${perf.avgEngagement.toFixed(2)}`,
    );
  }

  getTopPerformingTemplates(
    platform: string,
    limit: number = 5,
  ): Array<{
    templateId: string;
    name: string;
    avgEngagement: number;
    usageCount: number;
    weight: number;
  }> {
    const platformTemplates: Array<{
      templateId: string;
      name: string;
      avgEngagement: number;
      usageCount: number;
      weight: number;
    }> = [];

    this.templatePerformance.forEach((perf, key) => {
      if (key.includes(platform) || key.includes("default")) {
        const template = CONTENT_TEMPLATES.find(
          (t) => t.id === perf.templateId,
        );
        if (template) {
          platformTemplates.push({
            templateId: perf.templateId,
            name: template.name,
            avgEngagement: perf.avgEngagement,
            usageCount: perf.usageCount,
            weight: this.learningWeights.get(perf.templateId) || 1.0,
          });
        }
      }
    });

    return platformTemplates
      .sort((a, b) => b.avgEngagement * b.weight - a.avgEngagement * a.weight)
      .slice(0, limit);
  }

  async analyzeMusicTrack(audioData: unknown): Promise<unknown> {
    const modelParams = this.modelParameters.get("music_analysis") || {};

    const keyConfidenceThreshold = modelParams.keyConfidenceThreshold || 0.7;
    const genreDepth = modelParams.genreClassificationDepth || 3;
    const recentTrends = modelParams.recentGenreTrends || [];

    // Seed from audioData so the same input always produces the same analysis output.
    const dataSeed =
      typeof audioData === "string"
        ? audioData
        : JSON.stringify(audioData ?? "unknown");

    const keys = ["C", "D", "E", "F", "G", "A", "B"];
    const moods = ["energetic", "calm", "melancholic", "uplifting"];
    const bpmVariance = seededIndex(`bpm:${dataSeed}`, 600); // 0–599 → /10 → 0.0–59.9
    const confVariance = seededIndex(`conf:${dataSeed}`, 1000); // 0–999 → /1000

    const analysis = {
      bpm: 120 + bpmVariance / 10,
      key: keys[seededIndex(`key:${dataSeed}`, keys.length)],
      genre: this.selectGenreWithTrends(recentTrends, genreDepth, dataSeed),
      mood: moods[seededIndex(`mood:${dataSeed}`, moods.length)],
      confidence:
        keyConfidenceThreshold +
        (confVariance / 1000) * (1 - keyConfidenceThreshold),
      trendAligned: recentTrends.length > 0,
    };

    this.recordPerformance("music_analysis", {
      genre: analysis.genre,
      confidence: analysis.confidence,
      trendsConsidered: recentTrends.length,
    });

    return analysis;
  }

  private selectGenreWithTrends(
    recentTrends: string[],
    depth: number,
    seed: string = "",
  ): string {
    const allGenres = [
      "Hip-Hop",
      "Pop",
      "EDM",
      "R&B",
      "Rock",
      "Country",
      "Jazz",
      "Classical",
    ];
    const trendSeed = `genre:${seed}:${recentTrends.join(":")}`;

    if (recentTrends.length > 0 && seededIndex(trendSeed, 2) === 1) {
      return recentTrends[
        seededIndex(`${trendSeed}:pick`, recentTrends.length)
      ];
    }

    const pool = allGenres.slice(0, Math.max(1, depth * 2));
    return pool[seededIndex(`${trendSeed}:all`, pool.length)];
  }

  async optimizeSocialPosting(
    platform: string,
    _content: unknown,
  ): Promise<unknown> {
    const modelParams = this.modelParameters.get("social_posting") || {};

    const optimalTimes = modelParams.optimalPostingTimes || [9, 12, 15, 18, 21];
    const platformOpts = modelParams.platformOptimizations || {};
    const contentMix = modelParams.contentMixRatio || {
      video: 0.4,
      image: 0.4,
      text: 0.2,
    };

    const platformSpecific = platformOpts[platform] || {};
    const boostFactor = platformSpecific.boostFactor || 1.0;

    const recommendation = {
      bestPostingTime:
        optimalTimes[
          seededIndex(`posting-time:${platform}`, optimalTimes.length)
        ],
      contentFormat: this.selectContentFormat(
        contentMix,
        platformSpecific.contentFormatPriority,
        platform,
      ),
      expectedEngagement: (0.05 * boostFactor).toFixed(4),
      platformOptimized: !!platformSpecific.adjustedTiming,
      engagementHooks: modelParams.engagementHooks || [],
    };

    this.recordPerformance("social_posting", {
      platform,
      boostFactor,
      optimized: recommendation.platformOptimized,
    });

    return recommendation;
  }

  private selectContentFormat(
    mixRatio: { video: number; image: number; text: number },
    priority?: string,
    platformSeed: string = "",
  ): string {
    if (priority) return priority;

    // Weighted deterministic selection seeded by platform so the same platform
    // always maps to the same format unless the mix ratios themselves change.
    const weights = [
      mixRatio.video,
      mixRatio.image,
      1 - mixRatio.video - mixRatio.image,
    ];
    const seed = `content-format:${platformSeed}:${weights.join(",")}`;
    const slot = seededIndex(seed, 20);
    if (slot < Math.round(weights[0] * 20)) return "video";
    if (slot < Math.round((weights[0] + weights[1]) * 20)) return "image";
    return "text";
  }

  createSnapshot(modelType: string): {
    version: string;
    parameters: ModelParameters;
  } {
    const params = this.modelParameters.get(modelType);
    if (!params) {
      throw new Error(`Model type ${modelType} not found`);
    }

    const snapshot = {
      version: `snapshot_${Date.now()}`,
      parameters: JSON.parse(JSON.stringify(params)),
    };

    logger.info(`📸 Created snapshot for ${modelType}: ${snapshot.version}`);
    return snapshot;
  }

  restoreSnapshot(
    modelType: string,
    snapshot: { version: string; parameters: ModelParameters },
  ): void {
    this.modelParameters.set(modelType, snapshot.parameters);
    logger.info(`♻️  Restored ${modelType} from snapshot: ${snapshot.version}`);
  }

  private selectOptimalTemplate(
    contentType: string,
    platform: string,
  ): ContentTemplate {
    const categoryMap: Record<string, string> = {
      announcement: "music_announcement",
      release: "release_promotion",
      behind_the_scenes: "behind_the_scenes",
      bts: "behind_the_scenes",
      engagement: "fan_engagement",
      fan: "fan_engagement",
      promotion: "release_promotion",
      collaboration: "collaboration",
      collab: "collaboration",
      studio: "studio_update",
    };

    const targetCategory =
      categoryMap[contentType.toLowerCase()] || contentType.toLowerCase();

    const eligibleTemplates = CONTENT_TEMPLATES.filter(
      (t) => t.category === targetCategory && t.platforms.includes(platform),
    );

    if (eligibleTemplates.length === 0) {
      const fallbackTemplates = CONTENT_TEMPLATES.filter((t) =>
        t.platforms.includes(platform),
      );
      if (fallbackTemplates.length === 0) {
        return CONTENT_TEMPLATES[0];
      }
      return this.selectByWeight(fallbackTemplates);
    }

    return this.selectByWeight(eligibleTemplates);
  }

  private selectByWeight(templates: ContentTemplate[]): ContentTemplate {
    const weights = templates.map((t) => this.learningWeights.get(t.id) || 1.0);

    const recentPenalty = templates.map((t) =>
      this.recentlyUsedTemplates.includes(t.id) ? 0.3 : 1.0,
    );

    const adjustedWeights = weights.map((w, i) => w * recentPenalty[i]);
    const adjustedTotal = adjustedWeights.reduce((sum, w) => sum + w, 0);

    // Seeded weighted selection: deterministic given the same template IDs and weights.
    // This preserves the weighted semantics (high-weight templates are still more likely)
    // while eliminating non-reproducible randomness.
    const seed = `template-weight:${templates.map((t, i) => `${t.id}:${adjustedWeights[i].toFixed(2)}`).join("|")}`;
    let cursor = (seededIndex(seed, 10000) / 10000) * adjustedTotal;
    for (let i = 0; i < templates.length; i++) {
      cursor -= adjustedWeights[i];
      if (cursor <= 0) {
        return templates[i];
      }
    }

    return templates[0];
  }

  private selectVariation(template: ContentTemplate): number {
    const templateVariations =
      this.contentVariationTracker.get(template.id) || [];
    const totalVariations = template.variations.length + 1;

    const leastUsedIndex = this.findLeastUsedVariation(
      templateVariations,
      totalVariations,
    );

    templateVariations.push(leastUsedIndex);
    if (templateVariations.length > 20) {
      templateVariations.shift();
    }
    this.contentVariationTracker.set(template.id, templateVariations);

    return leastUsedIndex;
  }

  private findLeastUsedVariation(history: number[], total: number): number {
    const counts = new Array(total).fill(0);
    history.forEach((idx) => {
      if (idx < total) counts[idx]++;
    });

    const minCount = Math.min(...counts);
    const leastUsed = counts.reduce((acc: number[], count, idx) => {
      if (count === minCount) acc.push(idx);
      return acc;
    }, []);

    return leastUsed[
      seededIndex(`least-used:${history.join(",")}:${total}`, leastUsed.length)
    ];
  }

  private selectHookType(businessGoals: string[]): HookType {
    const goalToHook: Record<string, HookType> = {
      engagement: "question",
      awareness: "statistic",
      storytelling: "story",
      controversy: "controversy",
      teaser: "teaser",
      viral: "challenge",
      growth: "question",
      sales: "teaser",
    };

    for (const goal of businessGoals) {
      const hookType = goalToHook[goal.toLowerCase()];
      if (hookType) return hookType;
    }

    const hookTypes: HookType[] = [
      "question",
      "statistic",
      "story",
      "teaser",
      "challenge",
    ];
    return hookTypes[
      seededIndex(
        `hook-type:${businessGoals.slice().sort().join(":")}`,
        hookTypes.length,
      )
    ];
  }

  private buildContentFromTemplate(
    template: ContentTemplate,
    variationIndex: number,
    context: {
      topic: string;
      hook: string;
      brandVoice: string;
      targetAudience: string;
    },
  ): string {
    let contentTemplate =
      variationIndex === 0
        ? template.template
        : template.variations[variationIndex - 1] || template.template;

    const emojiSetSeed = `emoji-set:${context.topic}:${template.id}:${variationIndex}`;
    const emojiSet =
      template.emojiSets[seededIndex(emojiSetSeed, template.emojiSets.length)];
    const emoji =
      emojiSet[seededIndex(`emoji:${emojiSetSeed}`, emojiSet.length)];
    const hookFromTemplate =
      template.hooks[
        seededIndex(
          `hook-from-tpl:${context.topic}:${template.id}:${variationIndex}`,
          template.hooks.length,
        )
      ];

    contentTemplate = contentTemplate
      .replace(/{hook}/g, context.hook || hookFromTemplate)
      .replace(/{topic}/g, context.topic)
      .replace(/{emoji}/g, emoji)
      .replace(/{title}/g, context.topic)
      .replace(/{artist}/g, "We")
      .replace(/{description}/g, `Check out ${context.topic}!`)
      .replace(/{teaser}/g, "More coming soon...")
      .replace(/{status}/g, "Working on something special")
      .replace(/{insight}/g, "The creative process never stops")
      .replace(/{question}/g, `What do you think about ${context.topic}?`)
      .replace(/{context}/g, "")
      .replace(/{milestone}/g, "10K streams")
      .replace(/{gratitude}/g, "Thank you all for the support!")
      .replace(/{collaborator}/g, "an amazing artist")
      .replace(/{cta}/g, "");

    return contentTemplate.trim();
  }

  private applyBrandVoice(content: string, brandVoice: string): string {
    const modifier =
      BRAND_VOICE_MODIFIERS[brandVoice.toLowerCase()] ||
      BRAND_VOICE_MODIFIERS.casual;

    if (modifier.tone === "formal") {
      content = content.replace(/yo|hey|fam|y'all/gi, "");
      content = content.replace(/!!+/g, ".");
      content = content.replace(/\.\.\./g, ".");
    }

    if (modifier.tone === "excited") {
      content = content.toUpperCase();
      content = content.replace(/\./g, "!");
    }

    return content;
  }

  private truncateForTwitter(content: string, maxLength: number): string {
    if (content.length <= maxLength) return content;

    const sentences = content.split(/[.!?]+/);
    let result = "";

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;

      if ((result + trimmed + "...").length <= maxLength) {
        result += (result ? ". " : "") + trimmed;
      } else {
        break;
      }
    }

    if (result.length === 0) {
      result = content.substring(0, maxLength - 3);
    }

    return result + "...";
  }

  private removeExcessiveEmojis(content: string): string {
    const commonEmojis = [
      "🔥",
      "✨",
      "💫",
      "🎵",
      "🎧",
      "💯",
      "🚀",
      "⚡",
      "🎤",
      "🎹",
      "🎚️",
      "🎛️",
      "🎙️",
      "💡",
      "🌙",
      "📹",
      "🎬",
      "🎥",
      "👀",
      "🤔",
      "💭",
      "❓",
      "👇",
      "💬",
      "🗣️",
      "📢",
      "❤️",
      "🙏",
      "✌️",
      "🎉",
      "🏆",
      "📈",
      "💎",
      "⭐",
      "👑",
      "🤝",
      "🌟",
      "👥",
      "💪",
      "🙌",
      "🔊",
      "☕",
      "✍️",
      "💿",
      "🌍",
      "😍",
      "😎",
      "🥳",
      "👏",
      "💥",
    ];
    let emojiCount = 0;

    for (const emoji of commonEmojis) {
      const matches = content.split(emoji).length - 1;
      emojiCount += matches;
    }

    if (emojiCount <= 3) return content;

    let count = 0;
    let result = content;
    for (const emoji of commonEmojis) {
      result = result.replace(new RegExp(emoji, "g"), (match) => {
        count++;
        return count <= 3 ? match : "";
      });
    }
    return result;
  }

  private addEmojis(
    content: string,
    density: "low" | "medium" | "high",
  ): string {
    const commonEmojis = [
      "🔥",
      "✨",
      "💫",
      "🎵",
      "🎧",
      "💯",
      "🚀",
      "⚡",
      "🎤",
      "🎹",
    ];
    let existingEmojis = 0;
    for (const emoji of commonEmojis) {
      existingEmojis += content.split(emoji).length - 1;
    }

    const targetCount = density === "high" ? 5 : density === "medium" ? 3 : 1;
    if (existingEmojis >= targetCount) return content;

    const emojisToAdd = ["🔥", "✨", "💫", "🎵", "🎧", "💯", "🚀", "⚡"];
    const needed = targetCount - existingEmojis;
    const selected = emojisToAdd.slice(0, needed);

    return content + " " + selected.join("");
  }

  private formatForInstagram(content: string): string {
    let formatted = content;
    formatted = formatted.replace(/([.!?])\s+/g, "$1\n\n");
    return formatted;
  }

  private formatForLinkedIn(content: string): string {
    let formatted = content;
    formatted = formatted.replace(/\b(yo|fam|lit|fire|bussin|slaps)\b/gi, "");
    formatted = formatted.replace(/!!+/g, ".");
    formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);
    return formatted;
  }

  private formatForTikTok(content: string): string {
    let formatted = content;
    if (formatted.length > 150) {
      const sentences = formatted.split(/[.!?]+/);
      formatted = sentences.slice(0, 2).join("! ") + "!";
    }
    return formatted;
  }

  private formatForFacebook(content: string): string {
    return content;
  }

  private getHashtagCount(platform: string): number {
    const limits = PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS];
    return limits ? Math.min(limits.hashtagCount, 10) : 5;
  }

  private selectCallToAction(
    template: ContentTemplate,
    businessGoals: string[],
  ): string {
    const goalSeed = `cta:${template.id}:${businessGoals.slice().sort().join(":")}`;

    if (
      businessGoals.includes("sales") ||
      businessGoals.includes("conversion")
    ) {
      const salesCTAs = template.callToActions.filter(
        (cta) =>
          cta.toLowerCase().includes("stream") ||
          cta.toLowerCase().includes("link") ||
          cta.toLowerCase().includes("now"),
      );
      if (salesCTAs.length > 0) {
        return salesCTAs[seededIndex(`${goalSeed}:sales`, salesCTAs.length)];
      }
    }

    if (businessGoals.includes("engagement")) {
      const engagementCTAs = template.callToActions.filter(
        (cta) =>
          cta.toLowerCase().includes("comment") ||
          cta.toLowerCase().includes("drop") ||
          cta.toLowerCase().includes("tell"),
      );
      if (engagementCTAs.length > 0) {
        return engagementCTAs[
          seededIndex(`${goalSeed}:engagement`, engagementCTAs.length)
        ];
      }
    }

    return template.callToActions[
      seededIndex(`${goalSeed}:default`, template.callToActions.length)
    ];
  }

  private getMediaRecommendation(
    platform: string,
    contentType: string,
  ): string {
    const recommendations: Record<string, Record<string, string>> = {
      twitter: {
        announcement:
          "Single high-quality image or short video clip (max 2:20)",
        behind_the_scenes: "Candid photo or short video clip",
        fan_engagement: "Poll or text-only works best",
        release_promotion: "Album artwork or music video snippet",
        collaboration: "Photo with collaborator",
        studio_update: "Studio photo or equipment shot",
      },
      instagram: {
        announcement: "Carousel with artwork + behind-the-scenes + teaser",
        behind_the_scenes: "Reel showing process (15-30 seconds)",
        fan_engagement: "Story poll or interactive post",
        release_promotion: "Reel with music preview + album art in feed",
        collaboration: "Photo carousel with both artists",
        studio_update: "Reel or photo dump",
      },
      tiktok: {
        announcement: "Trending sound + reveal format (15-60 seconds)",
        behind_the_scenes: "Raw footage with text overlay",
        fan_engagement: "Duet challenge or response video",
        release_promotion: "Song snippet with lyrics on screen",
        collaboration: "Split screen or transition to collaborator",
        studio_update: "Day in the life or process video",
      },
      linkedin: {
        announcement: "Professional press photo or artwork",
        behind_the_scenes: "Professional studio photo",
        fan_engagement: "Text post with question",
        release_promotion: "Album artwork with professional caption",
        collaboration: "Professional photo with collaborator",
        studio_update: "Professional workspace photo",
      },
      facebook: {
        announcement: "Video trailer or photo album",
        behind_the_scenes: "Photo album or short video",
        fan_engagement: "Poll or discussion starter",
        release_promotion: "Music video or lyric video",
        collaboration: "Photo with description",
        studio_update: "Photo album or live stream",
      },
    };

    const platformRecs = recommendations[platform] || recommendations.instagram;
    return platformRecs[contentType] || "High-quality image or short video";
  }

  private trackTemplateUsage(templateId: string, _platform: string): void {
    this.recentlyUsedTemplates.push(templateId);
    if (this.recentlyUsedTemplates.length > 10) {
      this.recentlyUsedTemplates.shift();
    }
  }

  private updateLearningWeights(templateId: string, engagement: number): void {
    const currentWeight = this.learningWeights.get(templateId) || 1.0;
    const history = this.performanceHistory.get("content_generation") || [];

    const avgEngagement =
      history.length > 0
        ? history.reduce((sum, h) => sum + (h.engagement || 0), 0) /
          history.length
        : 50;

    let adjustment = 0;
    if (engagement > avgEngagement * 1.5) {
      adjustment = 0.1;
    } else if (engagement > avgEngagement) {
      adjustment = 0.05;
    } else if (engagement < avgEngagement * 0.5) {
      adjustment = -0.1;
    } else if (engagement < avgEngagement) {
      adjustment = -0.05;
    }

    const newWeight = Math.max(0.1, Math.min(3.0, currentWeight + adjustment));
    this.learningWeights.set(templateId, newWeight);
  }

  private getHighPerformingHashtags(platform: string, count: number): string[] {
    const history = this.performanceHistory.get("content_generation") || [];
    const hashtagPerformance: Map<string, { total: number; count: number }> =
      new Map();

    history.forEach((record) => {
      if (record.platform === platform && record.hashtags) {
        const engagement = record.engagement || 0;
        record.hashtags.forEach((tag: string) => {
          const current = hashtagPerformance.get(tag) || { total: 0, count: 0 };
          current.total += engagement;
          current.count++;
          hashtagPerformance.set(tag, current);
        });
      }
    });

    const sorted = Array.from(hashtagPerformance.entries())
      .map(([tag, data]) => ({ tag, avgEngagement: data.total / data.count }))
      .sort((a, b) => b.avgEngagement - a.avgEngagement);

    return sorted.slice(0, count).map((item) => item.tag);
  }

  getContentTemplates(): ContentTemplate[] {
    return CONTENT_TEMPLATES;
  }

  getTemplateCategories(): string[] {
    return [...new Set(CONTENT_TEMPLATES.map((t) => t.category))];
  }

  getHookTypes(): HookType[] {
    return Object.keys(HOOK_TEMPLATES) as HookType[];
  }

  getPlatformLimits(
    platform: string,
  ): (typeof PLATFORM_LIMITS)[keyof typeof PLATFORM_LIMITS] | undefined {
    return PLATFORM_LIMITS[platform as keyof typeof PLATFORM_LIMITS];
  }

  getLearningStats(): {
    templatesTracked: number;
    totalPerformanceRecords: number;
    topWeightedTemplates: Array<{ id: string; weight: number }>;
  } {
    const totalRecords = Array.from(this.performanceHistory.values()).reduce(
      (sum, arr) => sum + arr.length,
      0,
    );

    const topWeighted = Array.from(this.learningWeights.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, weight]) => ({ id, weight }));

    return {
      templatesTracked: this.templatePerformance.size,
      totalPerformanceRecords: totalRecords,
      topWeightedTemplates: topWeighted,
    };
  }
}

export const customAI = new CustomAIEngine();
