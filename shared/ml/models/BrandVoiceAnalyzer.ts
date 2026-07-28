/**
 * Dedicated Brand Voice Analyzer for Music Artists
 * Extracts and analyzes brand voice characteristics from content
 * Enhanced with music artist persona detection and consistency scoring
 * Separate from ContentPatternLearner as per research architecture
 */

import type { BrandVoiceProfile } from "../types.js";

export const ARTIST_ARCHETYPES = {
  authenticStoryteller: {
    traits: ["genuine", "vulnerable", "narrative-driven", "personal"],
    contentStyle: [
      "behind-the-scenes",
      "songwriting-process",
      "personal-stories",
      "mental-health",
      "life-lessons",
    ],
    indicators: [
      "share",
      "story",
      "journey",
      "heart",
      "soul",
      "real",
      "honest",
      "truth",
      "vulnerable",
      "personal",
      "confess",
      "open",
      "raw",
      "authentic",
      "diary",
      "wrote",
      "felt",
      "experience",
      "chapter",
      "reveal",
      "never told",
      "inside",
      "grew up",
      "struggle",
      "process",
      "healing",
      "overcome",
      "remind",
    ],
    emojiProfile: "moderate",
    toneProfile: "casual",
    phraseIndicators: [
      "behind the scenes",
      "real talk",
      "fun fact",
      "never knew",
      "took me",
      "i wrote",
    ],
  },
  mysteriousArtist: {
    traits: ["enigmatic", "visual-focused", "cryptic", "artistic"],
    contentStyle: [
      "artistic-visuals",
      "cryptic-teasers",
      "minimal-text",
      "conceptual-art",
      "surreal-imagery",
    ],
    indicators: [
      "soon",
      "...",
      "silence",
      "listen",
      "watch",
      "coming",
      "mystery",
      "signal",
      "stay tuned",
      "project",
      "vision",
      "universe",
      "world",
      "next",
      "chapter",
      "drop",
      "incoming",
      "prepare",
      "witness",
      "unlocked",
      "era",
      "new era",
      "incoming",
      "forthcoming",
      "imminent",
      "patience",
      "signal",
      "code",
    ],
    emojiProfile: "none",
    toneProfile: "formal",
    phraseIndicators: [
      "coming soon",
      "new era",
      "the vision",
      "something is coming",
    ],
  },
  communityBuilder: {
    traits: ["interactive", "fan-focused", "grateful", "accessible"],
    contentStyle: [
      "fan-shoutouts",
      "q&a",
      "polls",
      "fan-content-shares",
      "lives",
      "meet-greets",
    ],
    indicators: [
      "you",
      "love",
      "family",
      "thank",
      "appreciate",
      "together",
      "we",
      "community",
      "fans",
      "day ones",
      "supporters",
      "ride or die",
      "fam",
      "squad",
      "tribe",
      "ask me",
      "reply",
      "comment",
      "dm",
      "shoutout",
      "mean the world",
      "couldn't",
      "without you",
      "loyal",
      "support",
      "grateful",
      "bless",
      "anniversary",
      "celebrate",
    ],
    emojiProfile: "heavy",
    toneProfile: "casual",
    phraseIndicators: [
      "because of you",
      "drop a comment",
      "what do you think",
      "ask me anything",
    ],
  },
  industryProfessional: {
    traits: ["polished", "business-savvy", "collaborative", "networked"],
    contentStyle: [
      "collaborations",
      "industry-insights",
      "professional-updates",
      "brand-deals",
      "press",
    ],
    indicators: [
      "excited",
      "announce",
      "partnership",
      "collab",
      "project",
      "team",
      "release",
      "proud",
      "honored",
      "grateful",
      "milestone",
      "campaign",
      "strategy",
      "branding",
      "deal",
      "signing",
      "label",
      "management",
      "booking",
      "tour",
      "venue",
      "press",
      "media",
      "interview",
      "feature",
      "ep",
      "album",
      "single",
      "distribution",
      "sync",
    ],
    emojiProfile: "light",
    toneProfile: "mixed",
    phraseIndicators: [
      "excited to announce",
      "officially",
      "out now",
      "available everywhere",
    ],
  },
  entertainmentPersonality: {
    traits: ["humorous", "entertaining", "viral-focused", "trend-aware"],
    contentStyle: [
      "trends",
      "memes",
      "challenges",
      "entertainment",
      "skits",
      "reactions",
    ],
    indicators: [
      "lol",
      "haha",
      "dead",
      "literally",
      "vibe",
      "mood",
      "energy",
      "let's go",
      "no cap",
      "bussin",
      "fr fr",
      "on god",
      "lowkey",
      "highkey",
      "slaps",
      "hit different",
      "go crazy",
      "send it",
      "rizz",
      "era",
      "understood the assignment",
      "ate",
      "periodt",
      "slay",
      "girlboss",
      "king",
      "based",
      "chad",
      "cope",
      "rent free",
      "iconic",
      "serving",
      "obsessed",
      "unhinged",
      "iykyk",
    ],
    emojiProfile: "heavy",
    toneProfile: "casual",
    phraseIndicators: [
      "understood the assignment",
      "no cap",
      "hit different",
      "go crazy",
    ],
  },
} as const;

export type ArtistArchetype = keyof typeof ARTIST_ARCHETYPES;

export interface MusicArtistPersona {
  primaryArchetype: ArtistArchetype;
  secondaryArchetype: ArtistArchetype | null;
  archetypeConfidences: Record<ArtistArchetype, number>;
  brandStrength: number;
  consistencyScore: number;
  recommendations: string[];
}

export class BrandVoiceAnalyzer {
  private brandVoice: BrandVoiceProfile | null = null;
  private artistPersona: MusicArtistPersona | null = null;

  constructor() {}

  public analyze(posts: string[]): BrandVoiceProfile {
    const allTokens = posts.flatMap((p) => this.tokenize(p));
    const sentences = posts.flatMap((p) => this.splitSentences(p));

    const emojiCount = allTokens.filter((t) => /\p{Emoji}/u.test(t)).length;
    const hashtagCount = allTokens.filter((t) => t.startsWith("#")).length;

    const avgSentenceLength =
      sentences.reduce((sum, s) => sum + s.split(" ").length, 0) /
      Math.max(sentences.length, 1);

    const complexWords = allTokens.filter((t) => t.length > 10).length;
    const vocabularyComplexity =
      complexWords / allTokens.length > 0.2
        ? "advanced"
        : complexWords / allTokens.length > 0.1
          ? "moderate"
          : "simple";

    const emojiRatio = emojiCount / Math.max(posts.length, 1);
    const emojiUsage =
      emojiRatio > 3
        ? "heavy"
        : emojiRatio > 1.5
          ? "moderate"
          : emojiRatio > 0.5
            ? "light"
            : "none";

    const hashtagRatio = hashtagCount / Math.max(posts.length, 1);

    const exclamationRatio =
      posts.filter((p) => p.includes("!")).length / Math.max(posts.length, 1);
    posts.filter((p) => p.includes("?")).length / Math.max(posts.length, 1);

    const isFormal =
      avgSentenceLength > 15 &&
      vocabularyComplexity === "advanced" &&
      exclamationRatio < 0.2;
    const isCasual =
      (avgSentenceLength < 12 && emojiUsage !== "none") ||
      exclamationRatio > 0.4;

    const tone: "formal" | "casual" | "mixed" = isFormal
      ? "formal"
      : isCasual
        ? "casual"
        : "mixed";

    const bigramCounts = new Map<string, number>();
    const trigramCounts = new Map<string, number>();
    for (const post of posts) {
      const tokens = this.tokenize(post);
      for (let i = 0; i < tokens.length - 1; i++) {
        const bigram = `${tokens[i]} ${tokens[i + 1]}`;
        bigramCounts.set(bigram, (bigramCounts.get(bigram) || 0) + 1);
      }
      for (let i = 0; i < tokens.length - 2; i++) {
        const trigram = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
        trigramCounts.set(trigram, (trigramCounts.get(trigram) || 0) + 1);
      }
    }

    const commonPhrases = [
      ...Array.from(trigramCounts.entries())
        .filter(([_, count]) => count >= 2)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([phrase]) => phrase),
      ...Array.from(bigramCounts.entries())
        .filter(([_, count]) => count >= 3)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 7)
        .map(([phrase]) => phrase),
    ].slice(0, 10);

    const confidenceScore =
      posts.length >= 20
        ? 0.9
        : posts.length >= 10
          ? 0.75
          : posts.length >= 5
            ? 0.6
            : 0.4;

    this.brandVoice = {
      tone,
      emojiUsage,
      hashtagFrequency: hashtagRatio,
      avgSentenceLength,
      vocabularyComplexity: vocabularyComplexity as any,
      commonPhrases,
      confidenceScore,
    };

    return this.brandVoice;
  }

  public calculateSimilarity(
    content: string,
    profile: BrandVoiceProfile,
  ): number {
    const tokens = this.tokenize(content);
    const sentences = this.splitSentences(content);

    const contentEmojiCount = tokens.filter((t) => /\p{Emoji}/u.test(t)).length;
    const contentHashtagCount = tokens.filter((t) => t.startsWith("#")).length;
    const contentAvgSentenceLength =
      sentences.reduce((sum, s) => sum + s.split(" ").length, 0) /
      Math.max(sentences.length, 1);

    let similarity = 0;
    let factors = 0;

    const sentenceLengthDiff = Math.abs(
      contentAvgSentenceLength - profile.avgSentenceLength,
    );
    const sentenceLengthSimilarity = Math.max(
      0,
      1 - sentenceLengthDiff / Math.max(profile.avgSentenceLength, 1),
    );
    similarity += sentenceLengthSimilarity;
    factors++;

    const contentEmojiRatio = contentEmojiCount;
    const expectedEmoji =
      profile.emojiUsage === "heavy"
        ? 3
        : profile.emojiUsage === "moderate"
          ? 1.5
          : profile.emojiUsage === "light"
            ? 0.5
            : 0;
    const emojiDiff = Math.abs(contentEmojiRatio - expectedEmoji);
    const emojiSimilarity = Math.max(0, 1 - emojiDiff / 4);
    similarity += emojiSimilarity;
    factors++;

    const hashtagDiff = Math.abs(
      contentHashtagCount - profile.hashtagFrequency,
    );
    const hashtagSimilarity = Math.max(
      0,
      1 - hashtagDiff / Math.max(profile.hashtagFrequency + 1, 3),
    );
    similarity += hashtagSimilarity;
    factors++;

    const phraseMatches = profile.commonPhrases.filter((phrase) =>
      content.toLowerCase().includes(phrase.toLowerCase()),
    ).length;
    const phraseSimilarity =
      phraseMatches / Math.max(profile.commonPhrases.length, 1);
    similarity += phraseSimilarity;
    factors++;

    const contentWords = new Set(tokens.filter((t) => t.length > 4));
    const profileWords = new Set(
      profile.commonPhrases
        .flatMap((p) => p.split(" "))
        .filter((w) => w.length > 4),
    );
    const intersection = [...contentWords].filter((w) =>
      profileWords.has(w),
    ).length;
    const vocabularyOverlap = Math.min(
      1,
      intersection / Math.max(profileWords.size, 1),
    );
    similarity += vocabularyOverlap;
    factors++;

    return similarity / factors;
  }

  public adjustContentToVoice(
    content: string,
    voice: BrandVoiceProfile,
  ): string {
    let adjusted = content;

    if (voice.emojiUsage === "none") {
      adjusted = adjusted.replace(/[\p{Emoji}]/gu, "").trim();
    } else if (voice.emojiUsage === "heavy" && !content.match(/[\p{Emoji}]/u)) {
      adjusted += " 🎵✨🔥";
    } else if (
      voice.emojiUsage === "moderate" &&
      !content.match(/[\p{Emoji}]/u)
    ) {
      adjusted += " 🎵";
    }

    if (voice.tone === "formal") {
      adjusted = adjusted
        .replace(/!/g, ".")
        .replace(/\bawesome\b/gi, "exceptional")
        .replace(/\bcool\b/gi, "impressive")
        .replace(/\bamazing\b/gi, "remarkable")
        .replace(/\bcrazy\b/gi, "extraordinary")
        .replace(/\bsick\b/gi, "excellent")
        .replace(/\bfire\b/gi, "outstanding")
        .replace(/\bdope\b/gi, "notable")
        .replace(/\blit\b/gi, "vibrant")
        .replace(/\bvibe\b/gi, "atmosphere")
        .replace(/\bfam\b/gi, "community")
        .replace(/\bgonna\b/gi, "going to")
        .replace(/\bwanna\b/gi, "want to")
        .replace(/\bgotta\b/gi, "need to");
    } else if (voice.tone === "casual") {
      adjusted = adjusted
        .replace(/\bexcellent\b/gi, "amazing")
        .replace(/\bremarkable\b/gi, "crazy good")
        .replace(/\bimpressive\b/gi, "fire")
        .replace(/\boutstanding\b/gi, "incredible");
    }

    const currentHashtags = (adjusted.match(/#\w+/g) || []).length;
    const targetHashtags = Math.round(voice.hashtagFrequency);

    if (currentHashtags < targetHashtags && voice.commonPhrases.length > 0) {
      const phrase = voice.commonPhrases[0].replace(/\s/g, "");
      adjusted += ` #${phrase}`;
    }

    return adjusted;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s#@\p{Emoji}]/gu, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  private splitSentences(text: string): string[] {
    return text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  }

  public getProfile(): BrandVoiceProfile | null {
    return this.brandVoice;
  }

  public detectMusicArtistPersona(posts: string[]): MusicArtistPersona {
    const allText = posts.join(" ").toLowerCase();
    const tokens = this.tokenize(allText);

    const archetypeScores: Record<ArtistArchetype, number> = {
      authenticStoryteller: 0,
      mysteriousArtist: 0,
      communityBuilder: 0,
      industryProfessional: 0,
      entertainmentPersonality: 0,
    };

    for (const [archetype, config] of Object.entries(ARTIST_ARCHETYPES)) {
      let score = 0;

      for (const indicator of config.indicators) {
        const indicatorTokens = indicator.toLowerCase().split(" ");
        if (indicatorTokens.length === 1) {
          const count = tokens.filter((t) => t === indicatorTokens[0]).length;
          score += count * 0.12;
          const partialCount = tokens.filter(
            (t) => t.includes(indicatorTokens[0]) && t !== indicatorTokens[0],
          ).length;
          score += partialCount * 0.06;
        } else {
          if (allText.includes(indicator)) {
            const matches = (
              allText.match(
                new RegExp(
                  indicator.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
                  "g",
                ),
              ) || []
            ).length;
            score += matches * 0.2;
          }
        }
      }

      if ("phraseIndicators" in config) {
        for (const phrase of (config as any).phraseIndicators) {
          if (allText.includes(phrase)) {
            score += 0.25;
          }
        }
      }

      const emojiCount =
        (allText.match(/[\p{Emoji}]/gu) || []).length /
        Math.max(posts.length, 1);
      if (config.emojiProfile === "heavy" && emojiCount > 2) score += 0.25;
      else if (
        config.emojiProfile === "moderate" &&
        emojiCount >= 1 &&
        emojiCount <= 2
      )
        score += 0.25;
      else if (
        config.emojiProfile === "light" &&
        emojiCount > 0 &&
        emojiCount < 1
      )
        score += 0.25;
      else if (config.emojiProfile === "none" && emojiCount === 0)
        score += 0.25;

      archetypeScores[archetype as ArtistArchetype] = Math.min(1, score);
    }

    const sortedArchetypes = Object.entries(archetypeScores).sort(
      ([, a], [, b]) => b - a,
    );

    const primaryArchetype = sortedArchetypes[0][0] as ArtistArchetype;
    const secondaryArchetype =
      sortedArchetypes[1][1] > 0.25
        ? (sortedArchetypes[1][0] as ArtistArchetype)
        : null;

    const brandStrength = this.calculateBrandStrength(posts, primaryArchetype);
    const consistencyScore = this.calculateConsistencyScore(
      posts,
      archetypeScores,
    );
    const recommendations = this.generatePersonaRecommendations(
      primaryArchetype,
      brandStrength,
      consistencyScore,
      secondaryArchetype,
    );

    this.artistPersona = {
      primaryArchetype,
      secondaryArchetype,
      archetypeConfidences: archetypeScores,
      brandStrength,
      consistencyScore,
      recommendations,
    };

    return this.artistPersona;
  }

  private calculateBrandStrength(
    posts: string[],
    archetype: ArtistArchetype,
  ): number {
    const config = ARTIST_ARCHETYPES[archetype];
    let strength = 0;

    const indicatorCoverage =
      config.indicators.filter((indicator) =>
        posts.some((post) => post.toLowerCase().includes(indicator)),
      ).length / config.indicators.length;
    strength += indicatorCoverage * 0.45;

    const avgPostLength =
      posts.reduce((sum, p) => sum + p.length, 0) / Math.max(posts.length, 1);
    if (avgPostLength > 150) strength += 0.2;
    else if (avgPostLength > 80) strength += 0.15;
    else if (avgPostLength > 40) strength += 0.08;

    const postSampleSize = posts.length;
    if (postSampleSize >= 30) strength += 0.35;
    else if (postSampleSize >= 20) strength += 0.28;
    else if (postSampleSize >= 10) strength += 0.2;
    else if (postSampleSize >= 5) strength += 0.1;

    return Math.min(1, strength);
  }

  private calculateConsistencyScore(
    posts: string[],
    scores: Record<ArtistArchetype, number>,
  ): number {
    const maxScore = Math.max(...Object.values(scores));
    const avgScore =
      Object.values(scores).reduce((a, b) => a + b, 0) /
      Object.values(scores).length;

    const dominance = maxScore - avgScore;

    const variance =
      Object.values(scores)
        .map((s) => Math.pow(s - avgScore, 2))
        .reduce((a, b) => a + b, 0) / Object.values(scores).length;

    const consistencyFromDominance = Math.min(1, dominance * 2.5);
    const consistencyFromVariance = Math.max(0, 1 - Math.sqrt(variance) * 1.5);

    if (posts.length >= 5) {
      const perPostScores = posts.map((post) => {
        const postText = post.toLowerCase();
        this.tokenize(postText);
        let topScore = 0;
        for (const [, config] of Object.entries(ARTIST_ARCHETYPES)) {
          let s = 0;
          for (const ind of config.indicators) {
            if (postText.includes(ind)) s += 0.15;
          }
          topScore = Math.max(topScore, s);
        }
        return topScore;
      });
      const postMean =
        perPostScores.reduce((a, b) => a + b, 0) / perPostScores.length;
      const postVariance =
        perPostScores.reduce((sum, s) => sum + Math.pow(s - postMean, 2), 0) /
        perPostScores.length;
      const perPostConsistency = Math.max(0, 1 - Math.sqrt(postVariance) * 3);
      return (
        consistencyFromDominance * 0.45 +
        consistencyFromVariance * 0.3 +
        perPostConsistency * 0.25
      );
    }

    return consistencyFromDominance * 0.6 + consistencyFromVariance * 0.4;
  }

  private generatePersonaRecommendations(
    archetype: ArtistArchetype,
    brandStrength: number,
    consistencyScore: number,
    secondaryArchetype: ArtistArchetype | null,
  ): string[] {
    const recommendations: string[] = [];
    const config = ARTIST_ARCHETYPES[archetype];

    if (brandStrength < 0.4) {
      recommendations.push(
        `Your ${archetype.replace(/([A-Z])/g, " $1").toLowerCase()} brand is still developing. Lean into these themes more consistently: ${config.indicators.slice(0, 4).join(", ")}.`,
      );
    } else if (brandStrength < 0.65) {
      recommendations.push(
        `Strengthen your ${archetype.replace(/([A-Z])/g, " $1").toLowerCase()} persona by incorporating signature phrases like: "${config.phraseIndicators ? (config as any).phraseIndicators.slice(0, 2).join('" or "') : config.indicators.slice(0, 2).join(", ")}".`,
      );
    }

    if (consistencyScore < 0.45) {
      recommendations.push(
        "Your content voice is scattered across multiple styles. Pick 1-2 core themes and repeat them every 3-4 posts to build recognition.",
      );
    } else if (consistencyScore < 0.65) {
      recommendations.push(
        "Your brand voice is emerging but inconsistent. Aim for a recognizable pattern — fans should be able to identify your posts without seeing your name.",
      );
    }

    if (archetype === "communityBuilder") {
      recommendations.push(
        'Use interactive formats: "Drop a 🔥 if you know this song" or "Tag someone who needs to hear this." Direct fan participation outperforms passive content 3-to-1.',
      );
    } else if (archetype === "mysteriousArtist") {
      recommendations.push(
        "Maintain the mystique — post cryptic visuals or single-word captions before drops. Silence and anticipation are your most powerful tools.",
      );
    } else if (archetype === "authenticStoryteller") {
      recommendations.push(
        'Go deeper: share the specific moment, conversation, or emotion behind your music. Specificity builds connection. "I wrote this at 3am after..." is more compelling than "this song is personal."',
      );
    } else if (archetype === "industryProfessional") {
      recommendations.push(
        'Highlight your accolades and partnerships with context: not just "new collab out" but "I\'ve been trying to work with [artist] for 2 years — here\'s how it finally happened."',
      );
    } else if (archetype === "entertainmentPersonality") {
      recommendations.push(
        "Jump on trends within 24-48 hours. Your strongest asset is cultural fluency — when you react to a meme or trend fast, it signals you're plugged in and authentic.",
      );
    }

    if (secondaryArchetype && brandStrength > 0.5) {
      const secConfig = ARTIST_ARCHETYPES[secondaryArchetype];
      recommendations.push(
        `You have a strong secondary ${secondaryArchetype.replace(/([A-Z])/g, " $1").toLowerCase()} dimension. Occasionally leaning into ${secConfig.contentStyle[0].replace(/-/g, " ")} content adds depth without breaking your primary brand.`,
      );
    }

    if (config.emojiProfile === "heavy" && brandStrength > 0.5) {
      recommendations.push(
        'Your emoji-forward style is working well. Keep a consistent "signature emoji" set (2-3 you always use) to reinforce brand recognition visually.',
      );
    } else if (config.emojiProfile === "none" && brandStrength > 0.5) {
      recommendations.push(
        "Your clean, emoji-free aesthetic is intentional and consistent. Stick with it — it sets you apart from noisier feeds.",
      );
    }

    return recommendations;
  }

  public getArtistPersona(): MusicArtistPersona | null {
    return this.artistPersona;
  }

  public getMusicContentSuggestions(
    genre: string,
    archetype: ArtistArchetype,
  ): string[] {
    const suggestions: string[] = [];
    const config = ARTIST_ARCHETYPES[archetype];

    const genreHashtags: Record<string, string[]> = {
      "hip-hop": [
        "#hiphop",
        "#rap",
        "#newmusic",
        "#trapmusic",
        "#bars",
        "#rapper",
        "#hiphopmusic",
      ],
      trap: [
        "#trap",
        "#trapmusic",
        "#traprap",
        "#drill",
        "#plugwalk",
        "#trapsoul",
      ],
      drill: [
        "#drill",
        "#ukdrill",
        "#chicagodrill",
        "#nydrill",
        "#brooklyndrill",
      ],
      electronic: [
        "#edm",
        "#electronicmusic",
        "#dj",
        "#producer",
        "#techno",
        "#housemusic",
        "#edmfamily",
      ],
      house: [
        "#housemusic",
        "#deephouse",
        "#techhouse",
        "#afrohouse",
        "#househeads",
      ],
      pop: ["#pop", "#popmusic", "#newpop", "#indipop", "#popstar", "#toppop"],
      "r&b": [
        "#rnb",
        "#rnbmusic",
        "#soulsinger",
        "#newrnb",
        "#contemporaryrnb",
        "#neosoul",
      ],
      "neo-soul": [
        "#neosoul",
        "#soul",
        "#soulmusic",
        "#soulsinger",
        "#blackmusic",
      ],
      indie: [
        "#indiemusic",
        "#indieartist",
        "#underground",
        "#alternativemusic",
        "#indierock",
      ],
      rock: [
        "#rock",
        "#rockmusic",
        "#livemusic",
        "#guitar",
        "#alternativerock",
        "#indierock",
      ],
      country: [
        "#country",
        "#countrymusic",
        "#newcountry",
        "#countrypop",
        "#nashville",
        "#americana",
      ],
      afrobeats: [
        "#afrobeats",
        "#afropop",
        "#afrobeat",
        "#africamusic",
        "#amapiano",
        "#naijamusicscene",
      ],
      reggae: ["#reggae", "#reggaemusic", "#dancehall", "#roots", "#caribbean"],
      jazz: [
        "#jazz",
        "#jazzmusic",
        "#jazzpiano",
        "#livemusic",
        "#jazzvibes",
        "#smoothjazz",
      ],
      classical: [
        "#classical",
        "#classicalmusic",
        "#orchestra",
        "#symphony",
        "#pianist",
        "#violin",
      ],
      "lo-fi": [
        "#lofi",
        "#lofihiphop",
        "#chillhop",
        "#studymusic",
        "#lofibeats",
        "#chill",
      ],
      metal: [
        "#metal",
        "#heavymetal",
        "#metalhead",
        "#metalcore",
        "#deathmetal",
        "#prog",
      ],
      punk: [
        "#punk",
        "#punkrock",
        "#punkmusic",
        "#hardcore",
        "#diy",
        "#skatepunk",
      ],
      gospel: [
        "#gospel",
        "#gospelmusic",
        "#christianmusic",
        "#worshipmusic",
        "#praise",
      ],
      latin: [
        "#latin",
        "#latinmusic",
        "#reggaeton",
        "#salsa",
        "#latinpop",
        "#urbano",
      ],
    };

    const lGenre = genre.toLowerCase();
    const hashtags = genreHashtags[lGenre] ||
      Object.entries(genreHashtags).find(([k]) => lGenre.includes(k))?.[1] || [
        "#music",
        "#newmusic",
        "#artist",
        "#independentartist",
        "#unsigned",
      ];

    suggestions.push(
      `Top hashtags for your genre: ${hashtags.slice(0, 4).join(", ")}`,
    );
    suggestions.push(
      `Content pillars for your archetype: ${config.contentStyle
        .slice(0, 3)
        .map((s) => s.replace(/-/g, " "))
        .join(", ")}`,
    );

    if (archetype === "communityBuilder") {
      suggestions.push(
        `Fan engagement post: "Which of my songs hit different at [time/season]? Drop your answer below 👇"`,
      );
      suggestions.push(
        `Shoutout format: Feature a fan's art, video, or comment every Friday to reward loyalty.`,
      );
    } else if (archetype === "mysteriousArtist") {
      suggestions.push(
        `Teaser formula: Post a 3-second audio clip or blurred visual with only the release date as the caption.`,
      );
      suggestions.push(
        `Use a countdown series — post "7 days", "3 days", "tomorrow" with identical cryptic imagery.`,
      );
    } else if (archetype === "authenticStoryteller") {
      suggestions.push(
        `Story-hook template: "I almost never released [song name]. Here's what happened..." — then tell it in 3-4 sentences.`,
      );
      suggestions.push(
        `Behind-the-process: film a 30-second voice memo of you writing in real time. Imperfect and raw performs better than polished for this archetype.`,
      );
    } else if (archetype === "industryProfessional") {
      suggestions.push(
        `Milestone announcement: "Proud to share [achievement] — this one took [X months/years]. Thank you to everyone who believed."`,
      );
      suggestions.push(
        `Platform diversity signal: Link your DSP pre-save or smart link in every release post to reinforce professional distribution presence.`,
      );
    } else if (archetype === "entertainmentPersonality") {
      suggestions.push(
        `React to a trending sound or meme in your genre — add your own music to a trending format within 48 hours for maximum reach.`,
      );
      suggestions.push(
        `"POV: [relatable artist situation]" format drives high shares from fans who see themselves in the scenario.`,
      );
    }

    return suggestions;
  }
}
