/**
 * Custom NLP Content Generator for Max Booster
 * Self-contained social media content generation without external APIs
 * Uses Markov chains, n-gram models, and template-based generation
 * Specialized for music industry content
 */

import type { BrandVoiceProfile } from "../types.js";
import {
  SOCIAL_MEDIA_MUSIC_PATTERNS,
  ARTIST_PERSONA_PROFILES,
  MUSIC_GENRE_TAXONOMY,
  GENRE_VIRAL_HOOKS,
  PLATFORM_CONTENT_SCRIPTS,
  CALL_TO_ACTION_LIBRARY,
  EMOTIONAL_TRIGGER_PATTERNS,
  VIDEO_CONTENT_TRAINING_PACK,
  VIRAL_CONTENT_CORPUS,
  VIRAL_CONTENT_CORPUS_FLAT,
} from "../training/musicIndustryTrainingData.js";

export type ContentTone =
  | "professional"
  | "casual"
  | "energetic"
  | "promotional";
export type Platform =
  | "twitter"
  | "instagram"
  | "tiktok"
  | "youtube"
  | "facebook"
  | "linkedin";
export type Language = "en" | "es" | "fr" | "de" | "pt";

export interface GenerationOptions {
  tone: ContentTone;
  platform: Platform;
  language?: Language;
  maxLength?: number;
  includeHashtags?: boolean;
  includeEmojis?: boolean;
  topic?: string;
  genre?: string;
  artistName?: string;
  trackTitle?: string;
  contentType?:
    | "release"
    | "behind-the-scenes"
    | "announcement"
    | "engagement"
    | "promotional";
  patternWeights?: Record<string, number>;
}

export interface CaptionResult {
  caption: string;
  hashtags: string[];
  emojis: string[];
  characterCount: number;
  estimatedEngagement: number;
  toneMatch: number;
  hook?: string;
  body?: string;
  cta?: string;
}

export interface MarkovTransition {
  nextWords: Map<string, number>;
  totalCount: number;
}

export interface NGramModel {
  order: number;
  transitions: Map<string, MarkovTransition>;
  startSequences: string[];
}

const PLATFORM_LIMITS: Record<Platform, number> = {
  twitter: 280,
  instagram: 2200,
  tiktok: 2200,
  youtube: 5000,
  facebook: 63206,
  linkedin: 3000,
};

const TONE_EMOJIS: Record<ContentTone, string[]> = {
  professional: ["✨", "🎵", "🎶", "📀", "🎤", "🎧", "💫", "⭐"],
  casual: ["🎵", "🔥", "💯", "✌️", "🙌", "❤️", "😎", "🎶", "💜", "🖤"],
  energetic: ["🔥", "⚡", "💥", "🚀", "🎉", "🙌", "💪", "🤯", "🔊", "🎊"],
  promotional: ["🚨", "📢", "🔔", "🎧", "🎵", "▶️", "🆕", "💿", "🎤", "🌟"],
};

const TONE_PHRASES: Record<ContentTone, Record<string, string[]>> = {
  professional: {
    opening: [
      "Excited to announce",
      "Proud to share",
      "Introducing",
      "Presenting",
      "Delighted to unveil",
      "Thrilled to present",
    ],
    middle: [
      "This represents",
      "A culmination of",
      "Showcasing",
      "Featuring",
      "Highlighting",
      "Demonstrating",
    ],
    closing: [
      "Available now",
      "Out now on all platforms",
      "Stream now",
      "Listen now",
      "Experience the music",
    ],
  },
  casual: {
    opening: [
      "yo check this out",
      "new vibes",
      "something special for yall",
      "been working on this",
      "finally dropping this",
      "here we go",
    ],
    middle: [
      "this one hits different",
      "put my whole heart in this",
      "straight vibes",
      "feeling this energy",
      "really proud of this one",
    ],
    closing: [
      "link in bio",
      "let me know what you think",
      "stream it",
      "turn it up",
      "share with someone who needs this",
    ],
  },
  energetic: {
    opening: [
      "LET'S GO",
      "THIS IS IT",
      "FINALLY",
      "ITS HERE",
      "GET READY",
      "BANGER ALERT",
    ],
    middle: [
      "absolute fire",
      "we went crazy on this",
      "energy is unmatched",
      "this one is INSANE",
      "hit after hit",
    ],
    closing: [
      "RUN IT UP",
      "STREAM NOW",
      "TURN IT ALL THE WAY UP",
      "DROP A COMMENT",
      "SHARE THIS WITH YOUR SQUAD",
    ],
  },
  promotional: {
    opening: [
      "NEW RELEASE",
      "OUT NOW",
      "JUST DROPPED",
      "AVAILABLE NOW",
      "PREMIERE",
      "EXCLUSIVE",
    ],
    middle: [
      "featuring",
      "produced by",
      "mixed and mastered by",
      "in collaboration with",
      "from the upcoming album",
    ],
    closing: [
      "Stream on all platforms",
      "Pre-save now",
      "Add to your playlist",
      "Available everywhere",
      "Get it now",
    ],
  },
};

const MUSIC_VOCABULARY = {
  nouns: [
    "beat",
    "melody",
    "rhythm",
    "vibe",
    "energy",
    "sound",
    "track",
    "song",
    "music",
    "flow",
    "lyrics",
    "hook",
    "chorus",
    "verse",
    "bridge",
    "drop",
    "bass",
    "synth",
    "vocal",
    "harmony",
    "groove",
    "pulse",
    "wave",
    "frequency",
    "tone",
    "mood",
    "studio",
    "session",
    "recording",
    "mix",
    "master",
    "release",
    "album",
    "EP",
    "single",
    "feature",
    "collab",
    "remix",
    "cover",
    "original",
    "production",
    "playlist",
    "stream",
    "premiere",
    "debut",
    "era",
    "chapter",
    "journey",
    "audience",
    "fanbase",
    "community",
    "movement",
    "culture",
    "scene",
    "banger",
    "anthem",
    "ballad",
    "freestyle",
    "bars",
    "cadence",
    "delivery",
    "arrangement",
    "instrumentation",
    "sample",
    "loop",
    "vocal-chop",
    "adlib",
  ],
  verbs: [
    "drop",
    "release",
    "stream",
    "play",
    "listen",
    "vibe",
    "feel",
    "experience",
    "share",
    "support",
    "love",
    "create",
    "produce",
    "mix",
    "master",
    "record",
    "collaborate",
    "feature",
    "perform",
    "rock",
    "groove",
    "flow",
    "hit",
    "bang",
    "save",
    "add",
    "discover",
    "connect",
    "inspire",
    "move",
    "elevate",
    "build",
    "hustle",
    "grind",
    "push",
    "go",
    "run",
    "climb",
    "rise",
    "shine",
  ],
  adjectives: [
    "new",
    "fresh",
    "fire",
    "heat",
    "hot",
    "cold",
    "hard",
    "soft",
    "smooth",
    "raw",
    "real",
    "authentic",
    "unique",
    "original",
    "amazing",
    "incredible",
    "insane",
    "crazy",
    "wild",
    "epic",
    "legendary",
    "classic",
    "timeless",
    "emotional",
    "powerful",
    "energetic",
    "chill",
    "mellow",
    "intense",
    "heavy",
    "infectious",
    "anthemic",
    "melodic",
    "rhythmic",
    "soulful",
    "atmospheric",
    "dark",
    "uplifting",
    "nostalgic",
    "cinematic",
    "hypnotic",
    "groovy",
    "undeniable",
    "undiscovered",
    "independent",
    "fearless",
    "unapologetic",
  ],
};

const GENRE_VOCABULARY: Record<
  string,
  { nouns: string[]; adjectives: string[]; phrases: string[] }
> = {
  "hip-hop": {
    nouns: [
      "bars",
      "flow",
      "808s",
      "trap",
      "drill",
      "ad-libs",
      "freestyle",
      "punchlines",
      "wordplay",
      "sauce",
      "drip",
    ],
    adjectives: [
      "hard",
      "fire",
      "cold",
      "raw",
      "gritty",
      "slept-on",
      "underrated",
      "certified",
      "street",
      "lyrical",
    ],
    phrases: [
      "no cap",
      "on god",
      "straight facts",
      "real talk",
      "built different",
      "different breed",
      "can't stop won't stop",
    ],
  },
  "r&b": {
    nouns: [
      "falsetto",
      "melisma",
      "harmonies",
      "soul",
      "heartbreak",
      "feelings",
      "love",
      "emotions",
      "neo-soul",
      "groove",
    ],
    adjectives: [
      "silky",
      "soulful",
      "smooth",
      "emotional",
      "vulnerable",
      "intimate",
      "sensual",
      "healing",
      "raw",
    ],
    phrases: [
      "in your feelings",
      "hits different",
      "had me crying",
      "spoke to my soul",
      "felt every word",
    ],
  },
  pop: {
    nouns: [
      "hook",
      "chorus",
      "bop",
      "anthem",
      "earworm",
      "catchiness",
      "radio",
      "mainstream",
      "stadium",
    ],
    adjectives: [
      "catchy",
      "anthemic",
      "infectious",
      "radio-ready",
      "feel-good",
      "uplifting",
      "danceable",
      "bright",
    ],
    phrases: [
      "can't get it out of my head",
      "instant classic",
      "summer anthem",
      "bop of the year",
    ],
  },
  electronic: {
    nouns: [
      "drop",
      "build-up",
      "synth",
      "bassline",
      "arpeggio",
      "filter",
      "reverb",
      "delay",
      "mixing-desk",
      "BPM",
    ],
    adjectives: [
      "pounding",
      "euphoric",
      "hypnotic",
      "immersive",
      "relentless",
      "driving",
      "ethereal",
      "atmospheric",
    ],
    phrases: [
      "the drop hits different",
      "feel the bass",
      "made for the rave",
      "headphones required",
    ],
  },
  afrobeats: {
    nouns: [
      "riddim",
      "percussion",
      "rhythm",
      "groove",
      "culture",
      "vibe",
      "energy",
      "dance-floor",
      "diaspora",
    ],
    adjectives: [
      "infectious",
      "cultural",
      "rhythmic",
      "vibrant",
      "global",
      "authentic",
      "ancestral",
      "jubilant",
    ],
    phrases: [
      "made for the dance floor",
      "the culture travels",
      "rhythm of the continent",
      "global takeover",
    ],
  },
  latin: {
    nouns: [
      "ritmo",
      "sabor",
      "fuego",
      "corazón",
      "dembow",
      "clave",
      "congos",
      "pasión",
      "cultura",
    ],
    adjectives: [
      "fuego",
      "caliente",
      "rítmico",
      "apasionado",
      "tropical",
      "urbano",
      "bailable",
      "romántico",
    ],
    phrases: [
      "el ritmo no miente",
      "hecho para bailar",
      "latin heat",
      "la cultura nos une",
    ],
  },
  country: {
    nouns: [
      "story",
      "heartland",
      "roots",
      "americana",
      "porch",
      "road",
      "soul",
      "truth",
      "campfire",
      "honesty",
    ],
    adjectives: [
      "authentic",
      "raw",
      "heartfelt",
      "honest",
      "real",
      "gritty",
      "soulful",
      "country",
      "roots-driven",
    ],
    phrases: [
      "three chords and the truth",
      "written from real life",
      "music for real people",
      "the heartland speaks",
    ],
  },
  rock: {
    nouns: [
      "riff",
      "amp",
      "distortion",
      "guitar",
      "power-chord",
      "energy",
      "stage",
      "solo",
      "drummer",
      "mosh",
    ],
    adjectives: [
      "loud",
      "raw",
      "powerful",
      "electric",
      "uncompromising",
      "anthemic",
      "visceral",
      "driving",
    ],
    phrases: [
      "turn it up",
      "built to last",
      "rock never dies",
      "feel the electricity",
    ],
  },
};

const CONTENT_TEMPLATES: Record<string, Record<ContentTone, string[]>> = {
  release: {
    professional: [
      '{opening} "{trackTitle}" {middle} {genre} excellence. {closing}. {hashtags}',
      'New music alert: "{trackTitle}" is {closing}. {middle} artistic vision and sonic innovation. {hashtags}',
      '{opening} my latest single "{trackTitle}". This track {middle} my journey as an artist. {hashtags}',
    ],
    casual: [
      '{opening} 🎵 "{trackTitle}" just dropped! {middle}. {closing} {hashtags}',
      'new song "{trackTitle}" is out!! {middle} {closing} ✌️ {hashtags}',
      '{opening}... "{trackTitle}" 🔥 {middle}. lmk what yall think {hashtags}',
    ],
    energetic: [
      '🔥 {opening}!! "{trackTitle}" IS {closing}!! {middle}!! {hashtags}',
      '{opening} 🚀🚀🚀 "{trackTitle}" dropped and its {middle}!! {closing}!! {hashtags}',
      'YOOOO "{trackTitle}" IS FINALLY HERE!! {middle} {closing}!!! {hashtags}',
    ],
    promotional: [
      '🚨 {opening}: "{trackTitle}" 🚨 {closing}. {middle}. {hashtags}',
      '{opening} 📢 "{trackTitle}" - {closing} on all major streaming platforms. {hashtags}',
      '🆕 {opening} "{trackTitle}" | {middle} | {closing} 🎧 {hashtags}',
    ],
  },
  "behind-the-scenes": {
    professional: [
      "A glimpse into the creative process. Working on something special in the studio. {hashtags}",
      "Studio sessions bring out the best in creativity. {middle} new music. {hashtags}",
      "Behind every great track is countless hours of dedication. {hashtags}",
    ],
    casual: [
      "studio vibes 🎵 cooking up something special {hashtags}",
      "late night in the studio... {middle} {hashtags}",
      "bts of the magic happening rn ✨ {hashtags}",
    ],
    energetic: [
      "STUDIO GRIND NEVER STOPS 🔥🔥 {middle}!! {hashtags}",
      "WE IN HERE MAKING HEAT 🔊🔊 {hashtags}",
      "MAGIC HAPPENING IN THE STUDIO RN!! {hashtags}",
    ],
    promotional: [
      "🎬 Behind the scenes of what's coming next. Stay tuned. {hashtags}",
      "Exclusive studio content. New music loading... {hashtags}",
      "Studio update: Big things in the works. {closing} {hashtags}",
    ],
  },
  announcement: {
    professional: [
      "{opening}: Exciting news to share with you all. {middle} this incredible opportunity. {hashtags}",
      "Major announcement: {middle}. {closing} {hashtags}",
      "{opening}. A new chapter begins. {hashtags}",
    ],
    casual: [
      "got some news for yall 👀 {middle} {hashtags}",
      "sooo this is happening... {middle} 🙌 {hashtags}",
      "cant believe im saying this but... {middle} {hashtags}",
    ],
    energetic: [
      "MASSIVE ANNOUNCEMENT 🚨🚨 {middle}!! {hashtags}",
      "BIG NEWS YALL!! {middle}!! LETS GOOO 🔥 {hashtags}",
      "IM SO HYPED TO ANNOUNCE {middle}!! {hashtags}",
    ],
    promotional: [
      "📢 ANNOUNCEMENT: {middle}. {closing} {hashtags}",
      "🔔 Important update: {middle}. {hashtags}",
      "NEWS: {middle}. More details coming soon. {hashtags}",
    ],
  },
  engagement: {
    professional: [
      "What tracks are you listening to this week? Always looking for inspiration. {hashtags}",
      "Grateful for this amazing community. Your support means everything. {hashtags}",
      "Music connects us all. What song has been on repeat for you lately? {hashtags}",
    ],
    casual: [
      "whats everyone listening to rn? drop your fav tracks below 👇 {hashtags}",
      "yall are the best fr ❤️ thanks for all the love {hashtags}",
      "question: what song gets you through tough days? {hashtags}",
    ],
    energetic: [
      "DROP YOUR FAV SONG IN THE COMMENTS!! LETS BUILD A PLAYLIST 🔥 {hashtags}",
      "YALL ARE INSANE!! THANK YOU FOR 💯 SUPPORT!! {hashtags}",
      "WHO ELSE IS VIBING TO SOME HEAT RN?? 🙌🙌 {hashtags}",
    ],
    promotional: [
      "Join the conversation: What music moves you? Share below. {hashtags}",
      "Community poll: Which track should I release next? Vote now. {hashtags}",
      "Fan appreciation: Thank you for your incredible support. {hashtags}",
    ],
  },
  promotional: {
    professional: [
      "{opening} my music on all streaming platforms. Your support makes a difference. {hashtags}",
      "Now available: Stream the latest releases and join the journey. {hashtags}",
      "Thank you for supporting independent music. {closing} {hashtags}",
    ],
    casual: [
      "if you fw the music, stream it and share it! means the world 💜 {hashtags}",
      "new music needs love... yall know what to do 🙏 {hashtags}",
      "appreciate everyone who streams and shares fr {hashtags}",
    ],
    energetic: [
      "STREAM GANG WHERE YOU AT?! 🔥🔥 RUN IT UP!! {hashtags}",
      "LETS HIT THOSE STREAMING NUMBERS!! SHARE WITH YOUR FRIENDS!! {hashtags}",
      "THE SUPPORT IS CRAZY!! KEEP STREAMING!! 🚀 {hashtags}",
    ],
    promotional: [
      "🎧 Stream now on Spotify, Apple Music, and all major platforms. {hashtags}",
      "📲 Pre-save the new release. Link in bio. {hashtags}",
      "🔗 Listen now: Available on all streaming services. {hashtags}",
    ],
  },
};

const LANGUAGE_PHRASES: Record<Language, Record<string, string[]>> = {
  en: {
    newMusic: ["new music", "new track", "new single", "latest release"],
    outNow: ["out now", "available now", "streaming now", "just dropped"],
    streamIt: ["stream it", "listen now", "check it out", "give it a listen"],
  },
  es: {
    newMusic: [
      "nueva música",
      "nuevo tema",
      "nuevo sencillo",
      "último lanzamiento",
    ],
    outNow: ["ya disponible", "disponible ahora", "ya salió", "acaba de salir"],
    streamIt: ["escúchalo", "escucha ahora", "dale play", "no te lo pierdas"],
  },
  fr: {
    newMusic: [
      "nouvelle musique",
      "nouveau morceau",
      "nouveau single",
      "dernière sortie",
    ],
    outNow: ["disponible maintenant", "sorti maintenant", "vient de sortir"],
    streamIt: ["écoute maintenant", "écoutez-le", "découvrez-le"],
  },
  de: {
    newMusic: [
      "neue Musik",
      "neuer Track",
      "neue Single",
      "neueste Veröffentlichung",
    ],
    outNow: ["jetzt verfügbar", "jetzt draußen", "gerade erschienen"],
    streamIt: ["jetzt streamen", "jetzt anhören", "hör es dir an"],
  },
  pt: {
    newMusic: ["música nova", "nova faixa", "novo single", "último lançamento"],
    outNow: ["já disponível", "disponível agora", "acabou de sair"],
    streamIt: ["ouça agora", "dá um play", "confere aí"],
  },
};

export interface BeamContext {
  objective: string;
  genre?: string;
  platform: string;
  releasePhase?: string;
  tone?: string;
  patternWeights?: Record<string, number>;
}

export class ContentGenerator {
  private ngramModel: NGramModel;
  private trainingCorpus: string[] = [];
  private brandVoice: BrandVoiceProfile | null = null;

  constructor() {
    this.ngramModel = {
      order: 2,
      transitions: new Map(),
      startSequences: [],
    };
    this.initializeWithMusicPatterns();
  }

  private initializeWithMusicPatterns(): void {
    const sampleContent = this.generateTrainingCorpus();
    this.trainOnContent(sampleContent);
  }

  private generateTrainingCorpus(): string[] {
    const corpus: string[] = [];

    Object.values(CONTENT_TEMPLATES).forEach((toneTemplates) => {
      Object.values(toneTemplates).forEach((templates) => {
        corpus.push(...templates);
      });
    });

    Object.values(TONE_PHRASES).forEach((phrases) => {
      Object.values(phrases).forEach((phraseList) => {
        corpus.push(...phraseList);
      });
    });

    corpus.push(...VIRAL_CONTENT_CORPUS_FLAT);

    return corpus;
  }

  public trainOnContent(content: string[]): void {
    this.trainingCorpus = [...this.trainingCorpus, ...content];

    for (const text of content) {
      const tokens = this.tokenize(text);
      if (tokens.length < this.ngramModel.order + 1) continue;

      const startSeq = tokens.slice(0, this.ngramModel.order).join(" ");
      if (!this.ngramModel.startSequences.includes(startSeq)) {
        this.ngramModel.startSequences.push(startSeq);
      }

      for (let i = 0; i <= tokens.length - this.ngramModel.order - 1; i++) {
        const state = tokens.slice(i, i + this.ngramModel.order).join(" ");
        const nextWord = tokens[i + this.ngramModel.order];

        if (!this.ngramModel.transitions.has(state)) {
          this.ngramModel.transitions.set(state, {
            nextWords: new Map(),
            totalCount: 0,
          });
        }

        const transition = this.ngramModel.transitions.get(state)!;
        transition.nextWords.set(
          nextWord,
          (transition.nextWords.get(nextWord) || 0) + 1,
        );
        transition.totalCount++;
      }
    }
  }

  public generateCaption(options: GenerationOptions): CaptionResult {
    const {
      tone,
      platform,
      language = "en",
      maxLength = PLATFORM_LIMITS[platform],
      includeHashtags = true,
      includeEmojis = true,
      topic = "",
      genre = "",
      artistName = "",
      trackTitle = "",
      contentType = "release",
      patternWeights,
    } = options;

    let caption = this.generateFromTemplate(
      contentType,
      tone,
      { topic, genre, artistName, trackTitle, platform },
      patternWeights,
    );

    if (this.brandVoice) {
      caption = this.applyBrandVoice(caption, this.brandVoice);
    }

    caption = this.applyToneAdjustments(caption, tone);

    const hashtags = includeHashtags
      ? this.generateHashtags({
          topic,
          genre,
          platform,
          tone,
          count: this.getHashtagCount(platform),
        })
      : [];

    const emojis = includeEmojis
      ? this.suggestEmojis({
          tone,
          content: caption,
          count: this.getEmojiCount(tone),
        })
      : [];

    if (hashtags.length > 0) {
      caption = caption.replace("{hashtags}", "");
    } else {
      caption = caption.replace("{hashtags}", "");
    }

    caption = this.formatForPlatform(caption, platform, maxLength, hashtags);

    if (language !== "en") {
      caption = this.adaptForLanguage(caption, language);
    }

    const toneMatch = this.calculateToneMatch(caption, tone);
    const estimatedEngagement = this.estimateEngagement(
      caption,
      platform,
      hashtags.length,
    );

    return {
      caption: caption.trim(),
      hashtags,
      emojis,
      characterCount: caption.length,
      estimatedEngagement,
      toneMatch,
    };
  }

  private pickRandom<T>(arr: readonly T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private getGenreHook(
    genre: string,
    platform: string,
    trackTitle: string,
  ): string | null {
    const normalizedGenre = genre
      .toLowerCase()
      .replace(/[\s_]/g, "-") as keyof typeof GENRE_VIRAL_HOOKS;
    const normalizedPlatform =
      platform.toLowerCase() as keyof (typeof GENRE_VIRAL_HOOKS)[typeof normalizedGenre];
    const genreHooks = GENRE_VIRAL_HOOKS[normalizedGenre];
    if (!genreHooks) return null;
    const platformHooks = (genreHooks as Record<string, readonly string[]>)[
      normalizedPlatform
    ];
    if (!platformHooks || platformHooks.length === 0) return null;
    const hook = this.pickRandom(platformHooks);
    return hook
      .replace("{trackTitle}", trackTitle || "this track")
      .replace("{timestamp}", "0:30")
      .replace("{situation}", "a real moment");
  }

  private getGenreAdjective(genre: string): string {
    const normalizedGenre = genre.toLowerCase().replace(/[\s_]/g, "-");
    const vocab = GENRE_VOCABULARY[normalizedGenre];
    if (!vocab) {
      return this.pickRandom(MUSIC_VOCABULARY.adjectives);
    }
    return Math.random() > 0.4
      ? this.pickRandom(vocab.adjectives)
      : this.pickRandom(MUSIC_VOCABULARY.adjectives);
  }

  private getEmotionalTrigger(): string {
    const categories = Object.values(EMOTIONAL_TRIGGER_PATTERNS);
    const category = this.pickRandom(categories);
    return this.pickRandom(category);
  }

  private getPlatformCTA(platform: string): string {
    const normalizedPlatform = platform.toLowerCase();
    const urgentCTAs = CALL_TO_ACTION_LIBRARY.streaming.urgent;
    const directCTAs = CALL_TO_ACTION_LIBRARY.streaming.direct;
    const commentCTAs = CALL_TO_ACTION_LIBRARY.engagement.comment_bait;
    if (normalizedPlatform === "tiktok") return this.pickRandom(commentCTAs);
    if (normalizedPlatform === "youtube") return this.pickRandom(directCTAs);
    return Math.random() > 0.5
      ? this.pickRandom(urgentCTAs)
      : this.pickRandom(directCTAs);
  }

  /**
   * Parse the topic string (which may contain enriched URL context) into structured fields.
   * Mirrors the Python _parse_topic() logic so both engines behave consistently.
   */
  private parseTopicContext(
    topic: string,
    artistName: string,
    trackTitle: string,
    genre: string,
  ) {
    const STOP = new Set([
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "is",
      "are",
      "was",
      "were",
      "be",
      "been",
      "by",
      "from",
      "as",
      "this",
      "that",
      "it",
      "its",
      "their",
      "our",
      "your",
      "my",
      "we",
      "they",
      "you",
      "i",
      "me",
      "all",
      "just",
      "more",
      "can",
      "will",
      "have",
      "has",
      "had",
      "do",
      "does",
      "not",
      "no",
      "so",
      "if",
      "new",
      "out",
      "get",
      "best",
      "great",
      "how",
      "what",
      "when",
      "where",
      "which",
    ]);

    // Extract [Features: ...] block
    const featuresMatch = topic.match(/\[Features?: ([^\]]+)\]/i);
    const features = featuresMatch
      ? featuresMatch[1]
          .split(",")
          .map((f) => f.trim())
          .filter(Boolean)
      : [];
    const cleanTopic = topic
      .replace(/\[Features?:[^\]]+\]/gi, "")
      .trim()
      .replace(/^\s*[-—|•]+\s*/, "");

    // Extract [Stats: ...] block (engagement signals)
    const statsMatch = topic.match(/\[Stats?: ([^\]]+)\]/i);
    const stats = statsMatch ? statsMatch[1].trim() : "";
    const cleanFull = cleanTopic.replace(/\[Stats?:[^\]]+\]/gi, "").trim();

    // Extract quoted titles e.g. "Song Name"
    const quoted = Array.from(cleanFull.matchAll(/['"]([^'"]{2,60})['"]/g)).map(
      (m) => m[1],
    );

    // Split on em-dash, pipe, or " - " (space-hyphen-space)
    const parts = cleanFull
      .split(/\s*[—|•]\s*|\s+-\s+/)
      .map((p) => p.trim())
      .filter((p) => p.length > 1);
    const primary = parts[0] || cleanFull;
    const subtitle = parts.slice(1).join(" — ");

    // Content words (not stop words, not too short)
    const allWords =
      (cleanFull + " " + features.join(" ")).match(/\b[a-zA-Z]{3,}\b/g) || [];
    const contentWords = [
      ...new Set(allWords.filter((w) => !STOP.has(w.toLowerCase()))),
    ].slice(0, 10);

    // Descriptors (tone/mood words)
    const DESCRIPTOR_RE =
      /\b(chill|dreamy|smooth|raw|dark|deep|fresh|warm|bright|bold|gritty|acoustic|electric|indie|underground|experimental|authentic|organic|exclusive|iconic|trending|emerging|emotional|upbeat|melancholy|uplifting|powerful|gentle|fierce|energetic|vibrant|nostalgic)\b/gi;
    const descriptors = [
      ...new Set(
        Array.from(cleanFull.matchAll(DESCRIPTOR_RE)).map((m) =>
          m[1].toLowerCase(),
        ),
      ),
    ].slice(0, 4);

    // Content-type flags
    const isPlatform =
      /\b(platform|app|software|management|marketplace|distribution|SaaS|AI-powered|music career|music business)\b/i.test(
        topic,
      );
    const isEvent =
      /\b(show|concert|tour|gig|performance|festival|event|live\s+at|live\s+show)\b/i.test(
        cleanFull,
      );
    const isBeat =
      /\b(beat|instrumental|sample|loop|type\s*beat|prod(?:uced)?)\b/i.test(
        cleanFull,
      );
    const isRelease = Boolean(
      quoted.length ||
      trackTitle ||
      /\b(single|track|song|album|ep|mixtape|release|drop|out\s*now)\b/i.test(
        cleanFull,
      ),
    );

    // ── Release phase detection ────────────────────────────────────────────────
    // Determines where we are in the release cycle based on topic context.
    // Pre-release: teasing/coming soon language
    // Launch: "out now", "just dropped", immediate release language
    // First-week: "first week", "chart week", day 2-7 framing
    // Milestone: number achievements, thank-you framing
    // Sustain: default / no specific phase signal
    let releasePhase:
      | "pre-release"
      | "launch"
      | "first-week"
      | "sustain"
      | "milestone" = "sustain";
    if (isRelease) {
      if (
        /\b(coming soon|dropping|countdown|pre.?save|tease|teaser|dropping\s+soon|this\s+friday|release\s+date)\b/i.test(
          cleanFull,
        )
      ) {
        releasePhase = "pre-release";
      } else if (
        /\b(out\s*now|just\s*dropped|available\s*now|live\s*now|officially\s*out|drop\s*day|day\s*one|release\s*day)\b/i.test(
          cleanFull,
        )
      ) {
        releasePhase = "launch";
      } else if (
        /\b(first\s*week|chart\s*week|first\s*24|48\s*hours|day\s*[2-7]|still\s*(charting|climbing))\b/i.test(
          cleanFull,
        )
      ) {
        releasePhase = "first-week";
      } else if (
        /\b(\d+k|\d+\s*million|milestone|crossed|hit\s+\d|reached|thank\s+you\s+for|\d+\s*(streams|plays|followers))\b/i.test(
          cleanFull,
        )
      ) {
        releasePhase = "milestone";
      }
    }

    return {
      primary: trackTitle || primary,
      subtitle,
      parts,
      features,
      quoted: trackTitle ? [trackTitle, ...quoted] : quoted,
      descriptors,
      contentWords,
      stats,
      isPlatform,
      isEvent,
      isBeat,
      isRelease,
      releasePhase,
      artistName: artistName || "",
      genre,
    };
  }

  /**
   * Builds hook + body + CTA directly from the user's prompt words.
   * Used instead of template-based generation so content reflects the actual topic.
   */
  // ── Beam Search Candidate Scorer ───────────────────────────────────────────
  // Lightweight inline scorer (~0.5ms) — no async, no external calls.
  // Rates how well a candidate aligns with the generation context.
  private scoreCandidate(text: string, ctx: BeamContext): number {
    if (!text || !text.trim()) return 0;
    const lower = text.toLowerCase();
    let score = 50;

    const objectiveSignals: Record<string, string[]> = {
      release: [
        "out now",
        "stream",
        "listen",
        "drop",
        "available",
        "platform",
        "spotify",
        "first week",
      ],
      viral: [
        "wait",
        "nobody",
        "hidden",
        "secret",
        "discover",
        "can't believe",
        "you won't",
        "nobody told",
      ],
      engagement: [
        "comment",
        "tell me",
        "rate",
        "drop",
        "thoughts",
        "think",
        "reply",
        "honest",
        "below",
      ],
      event: [
        "ticket",
        "live",
        "show",
        "rsvp",
        "stage",
        "city",
        "come",
        "night",
        "venue",
      ],
      beat: [
        "license",
        "exclusive",
        "available",
        "beat",
        "dm",
        "rates",
        "grab",
        "project",
      ],
      platform: [
        "sign up",
        "try",
        "free",
        "start",
        "join",
        "link",
        "account",
        "tools",
        "artist",
      ],
      general: ["music", "sound", "artist", "create", "studio", "record"],
    };
    const sigs = objectiveSignals[ctx.objective] || objectiveSignals.general;
    sigs.forEach((s) => {
      if (lower.includes(s)) score += 8;
    });

    const platformSignals: Record<string, string[]> = {
      tiktok: ["pov", "stitch", "duet", "comment", "tell me why", "not me"],
      instagram: ["save", "link in bio", "double tap", "tagged", "reel"],
      twitter: [
        "thread",
        "unpopular opinion",
        "hot take",
        "hear me out",
        "real talk",
        "agree or not",
      ],
      youtube: ["subscribe", "notification", "watch", "premiere", "shorts"],
      facebook: ["share", "event", "rsvp", "group"],
      linkedin: ["professional", "industry", "career", "network"],
    };
    const platSigs = platformSignals[ctx.platform] || [];
    platSigs.forEach((s) => {
      if (lower.includes(s)) score += 6;
    });

    if (ctx.releasePhase) {
      const phaseSignals: Record<string, string[]> = {
        "pre-release": [
          "coming",
          "soon",
          "countdown",
          "pre-save",
          "drops",
          "waiting",
          "building",
        ],
        launch: [
          "out now",
          "right now",
          "today",
          "just dropped",
          "available",
          "live everywhere",
          "it's out",
        ],
        "first-week": [
          "first week",
          "streaming",
          "climbing",
          "momentum",
          "numbers",
          "playlisting",
        ],
        milestone: [
          "milestone",
          "can't believe",
          "thank you",
          "reached",
          "crossed",
          "numbers",
        ],
        sustain: ["playlist", "stream", "share", "save", "add it"],
      };
      const phaseSigs = phaseSignals[ctx.releasePhase] || [];
      phaseSigs.forEach((s) => {
        if (lower.includes(s)) score += 5;
      });
    }

    if (ctx.genre) {
      const genreVocab: Record<string, string[]> = {
        "hip-hop": [
          "bar",
          "lyric",
          "flow",
          "wordplay",
          "quotable",
          "booth",
          "verse",
        ],
        trap: ["808", "hi-hat", "production", "hard", "bass", "slide"],
        "r&b": [
          "melody",
          "harmony",
          "feel",
          "emotion",
          "late night",
          "mood",
          "chord",
        ],
        pop: ["hook", "playlist", "radio", "anthemic", "stuck in", "head"],
        afrobeats: ["groove", "dance", "percussion", "vibe", "floor"],
        electronic: ["drop", "bassline", "synth", "four to the floor"],
        country: ["heartland", "story", "honest", "roots", "road"],
        indie: ["authentic", "crafted", "independent", "bedroom", "lo-fi"],
      };
      const genreVoc = genreVocab[ctx.genre.toLowerCase()] || [];
      genreVoc.forEach((s) => {
        if (lower.includes(s)) score += 4;
      });
    }

    if (/\d+/.test(lower)) score += 5;
    if (/3am|midnight|2am|24 hour/.test(lower)) score += 4;
    if (
      /nobody|wait until|discover|secret|hidden|you won't believe|can't believe/.test(
        lower,
      )
    )
      score += 8;
    if (/honest|real|truth|vulnerable|personal|heart|soul|genuine/.test(lower))
      score += 6;

    if (ctx.tone) {
      const toneSignals: Record<string, string[]> = {
        energetic: [
          "fire",
          "hit",
          "crazy",
          "insane",
          "energy",
          "hype",
          "banger",
        ],
        casual: ["vibes", "honestly", "real talk", "lowkey", "ngl", "vibe"],
        professional: [
          "represents",
          "dedicated",
          "craft",
          "industry",
          "career",
          "curated",
        ],
        promotional: [
          "stream",
          "available",
          "out now",
          "link",
          "platform",
          "save",
        ],
      };
      const toneSigs = toneSignals[ctx.tone] || [];
      toneSigs.forEach((s) => {
        if (lower.includes(s)) score += 3;
      });
    }

    if (ctx.patternWeights) {
      for (const [pattern, weight] of Object.entries(ctx.patternWeights)) {
        if (lower.includes(pattern.toLowerCase()) && weight > 1.0) {
          score = Math.min(score * weight, score + 30);
          break;
        }
      }
    }

    return Math.max(1, score);
  }

  // ── Beam Selection ─────────────────────────────────────────────────────────
  // Scores all pool candidates, applies temperature-scaled softmax weighting,
  // then does weighted random selection — high-quality bias with variance preserved.
  private beamSelect(
    pool: string[],
    ctx: BeamContext,
    temperature: number = 0.6,
  ): string {
    const valid = pool.filter((o) => o && o.trim());
    if (!valid.length) return "";
    if (valid.length === 1) return valid[0];

    const scores = valid.map((item) => this.scoreCandidate(item, ctx));
    const maxScore = Math.max(...scores);
    const weights = scores.map((s) =>
      Math.exp((s - maxScore) / ((temperature * maxScore) / 100 + 1)),
    );
    const total = weights.reduce((a, b) => a + b, 0);

    let rand = Math.random() * total;
    for (let i = 0; i < valid.length; i++) {
      rand -= weights[i];
      if (rand <= 0) return valid[i];
    }
    return valid[valid.length - 1];
  }

  // ── Markov Body Generator ──────────────────────────────────────────────────
  // Generates novel body text from the trained n-gram model.
  // Returns null if the model lacks sufficient training data.
  private generateMarkovBody(
    ctx: ReturnType<typeof this.parseTopicContext>,
    tone: ContentTone,
  ): string | null {
    if (this.ngramModel.startSequences.length < 10) return null;

    const contentKeywords = ctx.isRelease
      ? [
          "the wait",
          "this is",
          "every single",
          "nothing was",
          "I put",
          "been sitting",
          "this one",
        ]
      : ctx.isBeat
        ? ["the beat", "built this", "this melody"]
        : ctx.isEvent
          ? ["the energy", "come be", "see you"]
          : ["the story", "I wrote", "music has", "this track"];

    let candidateStarts = this.ngramModel.startSequences.filter((seq) =>
      contentKeywords.some((kw) =>
        seq.toLowerCase().startsWith(kw.toLowerCase()),
      ),
    );
    if (!candidateStarts.length) {
      candidateStarts = this.ngramModel.startSequences;
    }

    const startSeq =
      candidateStarts[Math.floor(Math.random() * candidateStarts.length)];
    let currentState = startSeq;
    const words = startSeq.split(" ");

    const targetLength = 16 + Math.floor(Math.random() * 8);
    for (let i = 0; i < targetLength; i++) {
      const transition = this.ngramModel.transitions.get(currentState);
      if (!transition || transition.totalCount === 0) break;
      const nextWord = this.weightedRandomChoice(
        transition.nextWords,
        transition.totalCount,
      );
      if (!nextWord) break;
      words.push(nextWord);
      const stateTokens = currentState.split(" ");
      stateTokens.shift();
      stateTokens.push(nextWord);
      currentState = stateTokens.join(" ");
    }

    if (words.length < 8) return null;
    const result = words.join(" ");
    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  private buildFromPrompt(
    ctx: ReturnType<typeof this.parseTopicContext>,
    tone: ContentTone,
    platform: string,
    patternWeights?: Record<string, number>,
  ): { hook: string; body: string; cta: string } {
    const TONE_EMOJI: Record<string, string[]> = {
      energetic: ["🔥", "🚀", "💥", "⚡", "🎯", "💣", "🎤", "🔊"],
      promotional: ["🚀", "💡", "🎯", "✅", "🔑", "📢", "🆕", "🎉"],
      casual: ["✨", "💯", "🎵", "🙌", "💪", "😤", "👀", "🎶"],
      professional: ["🎯", "📈", "✅", "🏆", "💼", "🎼", "🎹", "📊"],
    };
    const emojiPool = TONE_EMOJI[tone] || TONE_EMOJI.energetic;
    const e1 = emojiPool[Math.floor(Math.random() * 3)];
    const e2 = emojiPool[Math.floor(Math.random() * emojiPool.length)];

    const title = ctx.quoted[0] ? `"${ctx.quoted[0]}"` : ctx.primary;
    const adj = ctx.descriptors[0] || "";
    const adjCap = adj ? adj.charAt(0).toUpperCase() + adj.slice(1) + " " : "";
    const genre = ctx.genre || "";
    const artist = ctx.artistName || "";

    // ── Beam context for quality-biased candidate selection ──────────────
    const objective = ctx.isPlatform
      ? "platform"
      : ctx.isEvent
        ? "event"
        : ctx.isBeat
          ? "beat"
          : ctx.isRelease
            ? "release"
            : "general";
    const beamCtx: BeamContext = {
      objective,
      genre: genre || undefined,
      platform,
      releasePhase: ctx.releasePhase || undefined,
      tone,
      patternWeights,
    };

    // ── GENRE-SPECIFIC HOOK POOLS ──────────────────────────────────────
    const genreHooks: Record<string, string[]> = {
      "hip-hop": [
        `Bar for bar, ${title} is the one ${e1}`,
        `Lyricism is not dead — ${title} is the proof ${e1}`,
        `Every bar is a quotable. I promise ${e1}`,
        `The wordplay on this goes three layers deep ${e2}`,
        `Classic boom-bap energy with a modern twist ${e1}`,
      ],
      trap: [
        `The 808 on ${title} hits different at max volume ${e1}`,
        `Built this from scratch — no samples, no shortcuts ${e1}`,
        `The hi-hats alone are worth the listen ${e2}`,
        `When the 808 drops, you feel it in your chest ${e1}`,
        `Hard production + real bars = ${title} ${e1}`,
      ],
      "r&b": [
        `This melody was a dream I woke up to ${e1}`,
        `${title} — late night, mood lighting, repeat ${e1}`,
        `The harmonies on the bridge of ${title} will break you ${e2}`,
        `Wrote this in one sitting. Feelings poured out ${e1}`,
        `R&B for people who actually feel things ${e1}`,
      ],
      pop: [
        `${title} is that song you add to every playlist ${e1}`,
        `One play and you'll have ${title} stuck in your head all week ${e1}`,
        `Built for playlists, made for people — ${title} is out ${e2}`,
        `The hook on ${title} was designed to get in your head ${e1}`,
        `Anthemic energy. ${title} is the one ${e1}`,
      ],
      afrobeats: [
        `The groove doesn't stop — ${title} is for the dance floor ${e1}`,
        `You can't listen to ${title} and not move your body ${e1}`,
        `Lagos energy built for the world — ${title} is out ${e2}`,
        `The percussion arrangement on ${title} is next level ${e1}`,
        `Afrobeats taking over. ${title} is the proof ${e1}`,
      ],
      electronic: [
        `The drop on ${title} was engineered to break speakers ${e1}`,
        `Four to the floor and a bassline that won't quit ${e1}`,
        `Close your eyes and let ${title} take you somewhere ${e2}`,
        `House music is a feeling. ${title} is the feeling ${e1}`,
        `Built for peak hour, hits just as hard at home ${e1}`,
      ],
    };
    const genreHookOptions = genre ? genreHooks[genre.toLowerCase()] || [] : [];

    // ── Hook ─────────────────────────────────────────────────────────
    let hookOptions: string[];
    if (ctx.isPlatform) {
      const shortName = ctx.primary.includes(" - ")
        ? ctx.primary.split(" - ")[0].trim()
        : ctx.primary;
      hookOptions = [
        `Meet ${shortName} ${e1}`,
        `Introducing ${shortName} — built for artists like you ${e1}`,
        `${shortName} is changing the game ${e1}`,
        `Have you discovered ${shortName} yet? ${e1}`,
        `Why every artist needs ${shortName} ${e2}`,
        `The all-in-one music career platform artists actually use ${e1}`,
        `${shortName} — more artists, more music, more wins ${e1}`,
        `Stop sleeping on ${shortName} — your career needs this ${e2}`,
        `If you're serious about your music career, you need ${shortName} ${e1}`,
        `This is how independent artists compete with majors — ${shortName} ${e1}`,
      ];
    } else if (ctx.isEvent) {
      hookOptions = [
        `${e1} ${ctx.primary} — don't miss this`,
        `See you there: ${ctx.primary} ${e1}`,
        `Don't miss ${ctx.primary} ${e1}`,
        `${ctx.primary} is LIVE — get your tickets ${e1}`,
        `I'm coming to your city ${e2} — ${ctx.primary}`,
        `Who's pulling up? ${ctx.primary} is happening ${e1}`,
        `The energy in that room is going to be insane — ${ctx.primary} ${e1}`,
        `Every show is selling out fast. ${ctx.primary} ${e2}`,
        `The setlist for ${ctx.primary} is something else. Be there ${e1}`,
        `Live and in person. ${ctx.primary} — tickets on sale now ${e1}`,
        ...genreHookOptions.slice(0, 3),
      ];
    } else if (ctx.isBeat) {
      hookOptions = [
        `${e1} New beat: ${title}`,
        `Beat drop: ${title} ${e1}`,
        `${title} — available now ${e1}`,
        `${e1} ${title} — fire your next project up`,
        `Nobody is making beats like ${title} right now ${e1}`,
        `This beat stayed in my head for two weeks before I finished it ${e2}`,
        `${title} — the melody alone is worth 10 plays ${e1}`,
        `Produced ${title} from scratch. Tell me what it's missing ${e1}`,
        `${adjCap}beat alert: ${title} is ready for someone's verse ${e1}`,
        `The type beat nobody asked for, everybody needed — ${title} ${e2}`,
        ...genreHookOptions.slice(0, 3),
      ];
    } else if (ctx.isRelease) {
      const subHint = ctx.subtitle
        ? ctx.subtitle
            .split("—")[0]
            .split(",")[0]
            .split("about")[0]
            .trim()
            .slice(0, 38)
        : adj
          ? `${adjCap}release`
          : "new release";

      // ── Curiosity gap hooks for release content ─────────────────────────
      const curiosityGapHooks = [
        `Nobody told me ${title} would do this... ${e1}`,
        `I discovered something when I listened back to ${title} at 3am ${e2}`,
        `The reason ${title} keeps getting added to playlists — it's not what you think ${e1}`,
        `Wait until you hear what's hidden in the production of ${title} ${e2}`,
        `Something in ${title} was only noticed after 1,000 plays. Can you hear it? ${e1}`,
        `Most artists never drop a song like ${title}. Here's why ${e2}`,
      ];

      // ── Release phase-specific hooks ─────────────────────────────────────
      const phaseHooks: Record<string, string[]> = {
        "pre-release": [
          `Something big is coming. ${title} drops soon — pre-save now ${e1}`,
          `Been working on ${title} for months. The countdown starts now ${e2}`,
          `Pre-save ${title} before it drops. You don't want to miss day one ${e1}`,
          `${title} is the project I've been building toward. Coming soon ${e2}`,
        ],
        launch: [
          `Day one. ${title} is live everywhere RIGHT NOW ${e1}`,
          `The wait is finally over — ${title} just dropped ${e2}`,
          `IT'S OUT. ${title} is on every platform right now — go stream it ${e1}`,
          `${title} is officially here. First 24 hours determine everything ${e2}`,
        ],
        "first-week": [
          `${title} is in its first week and the response has been unreal ${e1}`,
          `Still streaming ${title}? Good. First week numbers matter for playlisting ${e2}`,
          `${title} is climbing. Keep the momentum going this week ${e1}`,
        ],
        milestone: [
          `${title} just hit a milestone I didn't expect this fast ${e1}`,
          `Can't believe the numbers on ${title} right now. Thank you ${e2}`,
          `${title} reached something incredible. This community did that ${e1}`,
        ],
        sustain: [],
      };
      const phaseSpecific = phaseHooks[ctx.releasePhase || "sustain"] || [];

      hookOptions = [
        `${e1} ${title} is out now`,
        `New music: ${title} ${e1}`,
        `You need to hear ${title} right now ${e2}`,
        `${title} — ${subHint} ${e1}`.trim(),
        `Stream ${title} — this one hits different ${e2}`,
        `I almost didn't release ${title}... glad I did ${e1}`,
        `${title} is finally here. I poured everything into this ${e1}`,
        `Day one. First 24 hours matter most — ${title} is out ${e2}`,
        `Don't sleep on ${title}. First week numbers matter for playlisting ${e1}`,
        `Been sitting on ${title} for months. Couldn't hold it anymore ${e1}`,
        `This is the one y'all have been asking for — ${title} ${e2}`,
        `Save it. Share it. Tell a friend. ${title} is out now ${e1}`,
        artist
          ? `${artist} just dropped ${title} and it goes crazy ${e1}`
          : `This goes crazy — ${title} out now ${e1}`,
        ...curiosityGapHooks.slice(0, 2),
        ...phaseSpecific.slice(0, 2),
        ...genreHookOptions.slice(0, 4),
      ];
    } else {
      const descHint = ctx.subtitle.split("—")[0].trim() || adj;
      hookOptions = [
        `${e1} ${ctx.primary}`,
        `${ctx.primary} ${e1}`,
        `Check this out: ${ctx.primary} ${e1}`,
        descHint
          ? `${e1} ${ctx.primary} — ${descHint}`
          : `${e1} ${ctx.primary}`,
        `Nobody talks about this: ${ctx.primary} ${e1}`,
        `Wait till you hear what happens next — ${ctx.primary} ${e2}`,
        `The studio session that changed everything ${e1}`,
        `No one is ready for what I'm about to share ${e1}`,
        ...genreHookOptions.slice(0, 3),
      ];
    }
    const hook = this.beamSelect(hookOptions, beamCtx);

    // ── Body ──────────────────────────────────────────────────────────
    const segments: string[] = [];
    if (ctx.isPlatform) {
      if (ctx.features.length) {
        segments.push(ctx.features.slice(0, 3).join(" | "));
        if (ctx.features.length > 3)
          segments.push(ctx.features.slice(3, 6).join(" | "));
      } else if (ctx.subtitle) {
        segments.push(ctx.subtitle);
      }
      const closers = [
        "All the tools you need, in one place",
        "Manage, distribute, and promote — all in one",
        "Built to grow your career",
        "Independent artists deserve enterprise-level tools",
        "The music industry changed. Your tools should too",
        "From studio to streaming — one platform handles it all",
        "Stop grinding harder. Start working smarter",
      ];
      segments.push(this.beamSelect(closers, beamCtx));
    } else if (ctx.isEvent) {
      if (ctx.subtitle) segments.push(ctx.subtitle);
      if (!segments.length) segments.push(ctx.primary);
      const eventBodies = [
        "The energy in that room is going to be unreal.",
        "Every show is a once-in-a-lifetime moment. Come be part of it.",
        "The setlist has been carefully crafted for this night.",
        "Live music hits different. Come experience it in person.",
      ];
      segments.push(this.beamSelect(eventBodies, beamCtx));
    } else if (ctx.isRelease || ctx.quoted.length) {
      if (ctx.subtitle) {
        segments.push(ctx.subtitle);
      } else if (ctx.descriptors.length) {
        const descBodies = [
          `A ${ctx.descriptors.slice(0, 2).join(", ")} sound that speaks for itself`,
          `${adjCap}music made for people who feel everything`,
          `Pure ${adj || "raw"} energy captured in a single track`,
          `${adjCap}sound built from real experiences — no filler, no compromise`,
        ];
        segments.push(this.beamSelect(descBodies, beamCtx));
      } else {
        const genericReleaseBodies = [
          "This one is different — hit play and find out",
          "Every lyric came from a real place. Hope it resonates",
          "I poured everything into this record. Hope it reaches you",
          "No skips. Start from track one. Trust me",
          "This track represents a new chapter. Glad it finally exists",
          "Three months. Forty scrapped versions. One record that made it worth it",
          `${title} started as a voice memo. What you're hearing now is that idea, fully realized`,
          "The most personal thing you can create is also the most universal. That's what this is",
        ];
        const markovBody =
          Math.random() < 0.25 ? this.generateMarkovBody(ctx, tone) : null;
        if (markovBody) {
          segments.push(markovBody);
        } else {
          segments.push(this.beamSelect(genericReleaseBodies, beamCtx));
        }
      }

      // ── Self-identification phrases (added 50% of the time) ──────────────
      const selfIdPhrases = [
        "For the ones who feel everything a little too deeply — this one is for you",
        "If you've ever needed something to just understand you, I hope this finds you",
        "For the artists who are still building — keep going",
        "For everyone who streams music at 2am when everything feels too loud",
        "If music has ever pulled you through a hard day, you already understand what this is",
      ];
      if (Math.random() < 0.5) {
        segments.push(
          this.beamSelect(selfIdPhrases, {
            ...beamCtx,
            objective: "engagement",
          }),
        );
      }

      if (ctx.stats) segments.push(ctx.stats);
    } else if (ctx.isBeat) {
      if (ctx.subtitle) segments.push(ctx.subtitle);
      const beatBodies = [
        `${adjCap}sound ready for your next project`,
        `Available for licensing. DM for rates or use the link`,
        `Built for artists who want something different`,
        `Exclusive and non-exclusive licenses available`,
        `Produced with intention — every layer has a purpose`,
      ];
      segments.push(this.beamSelect(beatBodies, beamCtx));
    } else {
      if (ctx.subtitle) segments.push(ctx.subtitle);
      if (!ctx.subtitle && ctx.contentWords.length)
        segments.push(ctx.contentWords.slice(0, 4).join(" | "));
      if (!segments.length) segments.push(ctx.primary);
    }
    const body = segments.filter(Boolean).join(" | ");

    // ── CTA ───────────────────────────────────────────────────────────
    const ctaMap: Record<string, string[]> = {
      platform: [
        "Try it free — link in bio 🔗",
        "Sign up today — link in bio 🚀",
        "Start your free trial — link in bio",
        "Get started free — no credit card needed 🔗",
        "Join thousands of artists already using it — link in bio",
        "See why artists are switching — link in bio 🎯",
        "Claim your free account — link in bio ✅",
        "Try it risk-free — link in bio 🚀",
      ],
      event: [
        "Grab your tickets — link in bio 🎟️",
        "Get tickets now — selling fast 🎟️",
        "RSVP — link in bio",
        "Presale link in bio — first come, first served 🔗",
        "Don't wait — last tickets going fast 🎟️",
        "Drop your city below if you're coming 👇",
        "VIP packages still available — link in bio 🎟️",
        "See you on the road — tickets in bio 🎤",
      ],
      beat: [
        "License this beat — DM or link in bio 🎛️",
        "Grab the beat — link in bio",
        "Exclusive and non-exclusive available — DM for rates 🎛️",
        "BUY NOW — link in bio before someone else does 🔥",
        "For licensing info, DM or tap the link 🎧",
        "Secured by first come, first served — link in bio 🎛️",
        "Perfect for your next project — grab it in bio 🎯",
        "This one is EXCLUSIVE — DM while it lasts 🔒",
      ],
      release: [
        "Stream now — link in bio 🔗",
        "Listen on all platforms 🎵",
        "Save this one 🎵",
        "Follow for more music 🎵",
        "Add it to your playlist before you forget 🎶",
        "First week numbers change everything — stream now 📈",
        "Hit save on Spotify so you never lose it 💚",
        "Share with someone who needs this in their life 🔗",
        "Available everywhere — go run the numbers up 🚀",
        "Don't sleep — first 24 hours matter most ⏰",
        "Drop a 🔥 in the comments if you already know every word",
      ],
      general: [
        "Follow for more 🎵",
        "Share with someone who needs this ✨",
        "Drop your thoughts below 👇",
        "Turn on post notifications — big things incoming 🔔",
        "Save this for later 💾",
        "Tag someone who needs to see this 👇",
        "What do you think? Drop it in the comments 💬",
        "Follow for the full rollout — nothing getting missed 🔔",
        "Like if you agree ❤️",
        "Repost if you're a real one 🔄",
      ],
    };
    const ctaKey = ctx.isPlatform
      ? "platform"
      : ctx.isEvent
        ? "event"
        : ctx.isBeat
          ? "beat"
          : ctx.isRelease
            ? "release"
            : "general";
    const ctaOptions = ctaMap[ctaKey];
    const cta = this.beamSelect(ctaOptions, beamCtx);

    return { hook, body, cta };
  }

  private generateFromTemplate(
    contentType: string,
    tone: ContentTone,
    context: {
      topic: string;
      genre: string;
      artistName: string;
      trackTitle: string;
      platform?: string;
    },
    patternWeights?: Record<string, number>,
  ): string {
    const ctx = this.parseTopicContext(
      context.topic,
      context.artistName,
      context.trackTitle,
      context.genre,
    );
    const { hook, body, cta } = this.buildFromPrompt(
      ctx,
      tone,
      context.platform || "instagram",
      patternWeights,
    );
    return `${hook}\n\n${body}\n\n${cta}`;
  }

  private generateMarkovSequence(maxWords: number): string {
    if (this.ngramModel.startSequences.length === 0) {
      return "";
    }

    const startIdx = Math.floor(
      Math.random() * this.ngramModel.startSequences.length,
    );
    let currentState = this.ngramModel.startSequences[startIdx];
    const words = currentState.split(" ");

    for (let i = 0; i < maxWords; i++) {
      const transition = this.ngramModel.transitions.get(currentState);
      if (!transition || transition.totalCount === 0) break;

      const nextWord = this.weightedRandomChoice(
        transition.nextWords,
        transition.totalCount,
      );
      if (!nextWord) break;

      words.push(nextWord);
      const stateTokens = currentState.split(" ");
      stateTokens.shift();
      stateTokens.push(nextWord);
      currentState = stateTokens.join(" ");
    }

    return words.join(" ");
  }

  private weightedRandomChoice(
    options: Map<string, number>,
    total: number,
  ): string | null {
    let random = Math.random() * total;
    for (const [word, weight] of options.entries()) {
      random -= weight;
      if (random <= 0) return word;
    }
    return null;
  }

  public generateHashtags(options: {
    topic?: string;
    genre?: string;
    platform?: Platform;
    tone?: ContentTone;
    count?: number;
    trending?: boolean;
  }): string[] {
    const {
      topic = "",
      genre = "",
      platform = "instagram",
      tone = "casual",
      count = 5,
      trending = true,
    } = options;
    const hashtags: Set<string> = new Set();

    const genreHashtags =
      SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies[
        genre.toLowerCase() as keyof typeof SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies
      ] || [];
    genreHashtags.forEach((h) => hashtags.add(h));

    SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies.general.forEach((h) =>
      hashtags.add(h),
    );

    if (topic) {
      const topicTag = `#${topic.toLowerCase().replace(/\s+/g, "")}`;
      hashtags.add(topicTag);
    }

    const toneHashtags: Record<ContentTone, string[]> = {
      professional: [
        "#MusicBusiness",
        "#MusicIndustry",
        "#IndependentArtist",
        "#MusicProduction",
      ],
      casual: ["#Vibes", "#MusicLife", "#GoodVibesOnly", "#FeelGoodMusic"],
      energetic: ["#Hype", "#TurnUp", "#LetsGo", "#Energy", "#Banger"],
      promotional: [
        "#NewRelease",
        "#OutNow",
        "#StreamNow",
        "#LinkInBio",
        "#PreSave",
      ],
    };
    (toneHashtags[tone] || toneHashtags.casual).forEach((h) => hashtags.add(h));

    if (trending) {
      const trendingTags = this.getTrendingHashtags(platform);
      trendingTags.slice(0, 2).forEach((h) => hashtags.add(h));
    }

    return Array.from(hashtags).slice(0, count);
  }

  private getTrendingHashtags(platform: Platform): string[] {
    const baseTrending = ["#FYP", "#Viral", "#Trending", "#Explore", "#ForYou"];

    const platformTrending: Record<Platform, string[]> = {
      twitter: ["#MusicTwitter", "#NewMusicFriday", "#NowPlaying"],
      instagram: ["#Reels", "#IGMusic", "#MusicReels", "#ExplorePage"],
      tiktok: ["#TikTokMusic", "#FYP", "#ForYouPage", "#Viral", "#MusicTok"],
      youtube: ["#Shorts", "#YouTubeMusic", "#Subscribe", "#MusicVideo"],
      facebook: ["#FacebookMusic", "#LiveMusic", "#MusicVideo"],
      linkedin: ["#MusicBusiness", "#CreativeIndustry", "#ArtistLife"],
    };

    return [...platformTrending[platform], ...baseTrending];
  }

  public suggestEmojis(options: {
    tone?: ContentTone;
    content?: string;
    count?: number;
    genre?: string;
  }): string[] {
    const { tone = "casual", content = "", count = 3, genre = "" } = options;
    const emojis: Set<string> = new Set();

    const toneEmojis = TONE_EMOJIS[tone] || TONE_EMOJIS.casual;
    const shuffled = [...toneEmojis].sort(() => Math.random() - 0.5);
    shuffled.slice(0, Math.ceil(count / 2)).forEach((e) => emojis.add(e));

    const contentLower = content.toLowerCase();
    const contextEmojis: [string, string[]][] = [
      ["fire|hot|heat|flame|burn", ["🔥"]],
      ["love|heart|feel", ["❤️", "💜", "💙"]],
      ["star|shine|bright", ["⭐", "✨", "💫"]],
      ["music|song|track|beat", ["🎵", "🎶", "🎤"]],
      ["studio|record|mix", ["🎧", "🎚️", "🎛️"]],
      ["drop|release|new", ["🆕", "📢", "🚨"]],
      ["night|late|dark", ["🌙", "✨", "🖤"]],
      ["party|celebrate|hype", ["🎉", "🎊", "🙌"]],
      ["mic|vocal|sing", ["🎤", "🎙️"]],
      ["play|listen|stream", ["▶️", "🎧", "📲"]],
    ];

    for (const [pattern, emojiList] of contextEmojis) {
      if (new RegExp(pattern, "i").test(contentLower)) {
        emojiList.forEach((e) => emojis.add(e));
      }
    }

    const genreEmojis: Record<string, string[]> = {
      "hip-hop": ["🎤", "🔥", "💯", "🖤"],
      electronic: ["🎧", "🔊", "⚡", "🌌"],
      rock: ["🎸", "🤘", "🔥", "⚡"],
      pop: ["💖", "✨", "🎵", "🌟"],
      "r&b": ["💜", "✨", "🎤", "💫"],
      country: ["🤠", "🎸", "🌾", "🎵"],
      jazz: ["🎷", "🎺", "🎹", "✨"],
    };
    if (genre && genreEmojis[genre.toLowerCase()]) {
      genreEmojis[genre.toLowerCase()].forEach((e) => emojis.add(e));
    }

    return Array.from(emojis).slice(0, count);
  }

  public matchBrandVoice(
    content: string,
    targetVoice: BrandVoiceProfile,
  ): {
    adjustedContent: string;
    matchScore: number;
    suggestions: string[];
  } {
    let adjustedContent = content;
    const suggestions: string[] = [];

    if (targetVoice.emojiUsage === "none") {
      adjustedContent = adjustedContent.replace(/[\p{Emoji}]/gu, "").trim();
      if (content !== adjustedContent) {
        suggestions.push("Removed emojis to match brand voice");
      }
    } else if (targetVoice.emojiUsage === "heavy") {
      const emojiCount = (adjustedContent.match(/[\p{Emoji}]/gu) || []).length;
      if (emojiCount < 2) {
        const addEmojis = this.suggestEmojis({ count: 2 });
        adjustedContent = `${adjustedContent} ${addEmojis.join("")}`;
        suggestions.push("Added emojis to match brand voice");
      }
    }

    if (targetVoice.tone === "formal") {
      adjustedContent = adjustedContent
        .replace(/!/g, ".")
        .replace(/\byall\b/gi, "everyone")
        .replace(/\bfw\b/gi, "appreciate")
        .replace(/\brn\b/gi, "right now")
        .replace(/\bfr\b/gi, "truly")
        .replace(/\bvibes\b/gi, "atmosphere")
        .replace(/\bheat\b/gi, "excellence")
        .replace(/\bfire\b/gi, "exceptional");
      suggestions.push("Adjusted language for formal tone");
    } else if (targetVoice.tone === "casual") {
      adjustedContent = adjustedContent
        .replace(/\bexcellent\b/gi, "fire")
        .replace(/\bexceptional\b/gi, "heat")
        .replace(/\beveryone\b/gi, "yall")
        .replace(/\btruly\b/gi, "fr");
      suggestions.push("Adjusted language for casual tone");
    }

    const sentences = this.splitSentences(adjustedContent);
    const avgLength =
      sentences.reduce((sum, s) => sum + s.split(" ").length, 0) /
      (sentences.length || 1);

    if (Math.abs(avgLength - targetVoice.avgSentenceLength) > 5) {
      if (avgLength > targetVoice.avgSentenceLength) {
        suggestions.push("Consider breaking up longer sentences");
      } else {
        suggestions.push("Consider combining short sentences for more depth");
      }
    }

    const hashtagCount = (adjustedContent.match(/#\w+/g) || []).length;
    const targetHashtags = Math.round(targetVoice.hashtagFrequency);
    if (hashtagCount < targetHashtags - 2) {
      suggestions.push(`Add ${targetHashtags - hashtagCount} more hashtags`);
    } else if (hashtagCount > targetHashtags + 2) {
      suggestions.push(`Remove ${hashtagCount - targetHashtags} hashtags`);
    }

    const matchScore = this.calculateVoiceMatchScore(
      adjustedContent,
      targetVoice,
    );

    return {
      adjustedContent: adjustedContent.trim(),
      matchScore,
      suggestions,
    };
  }

  private calculateVoiceMatchScore(
    content: string,
    voice: BrandVoiceProfile,
  ): number {
    let score = 0;
    let factors = 0;

    const emojiCount = (content.match(/[\p{Emoji}]/gu) || []).length;
    const expectedEmoji =
      voice.emojiUsage === "heavy"
        ? 3
        : voice.emojiUsage === "moderate"
          ? 1.5
          : voice.emojiUsage === "light"
            ? 0.5
            : 0;
    const emojiDiff = Math.abs(emojiCount - expectedEmoji);
    score += Math.max(0, 1 - emojiDiff / 3);
    factors++;

    const sentences = this.splitSentences(content);
    const avgLength =
      sentences.reduce((sum, s) => sum + s.split(" ").length, 0) /
      (sentences.length || 1);
    const lengthDiff = Math.abs(avgLength - voice.avgSentenceLength);
    score += Math.max(0, 1 - lengthDiff / voice.avgSentenceLength);
    factors++;

    const hashtagCount = (content.match(/#\w+/g) || []).length;
    const hashtagDiff = Math.abs(hashtagCount - voice.hashtagFrequency);
    score += Math.max(0, 1 - hashtagDiff / 5);
    factors++;

    const phraseMatches = voice.commonPhrases.filter((phrase) =>
      content.toLowerCase().includes(phrase.toLowerCase()),
    ).length;
    score += phraseMatches / Math.max(voice.commonPhrases.length, 1);
    factors++;

    return (score / factors) * voice.confidenceScore;
  }

  public setBrandVoice(voice: BrandVoiceProfile): void {
    this.brandVoice = voice;
  }

  public getBrandVoice(): BrandVoiceProfile | null {
    return this.brandVoice;
  }

  public analyzeBrandVoice(posts: string[]): BrandVoiceProfile {
    const allTokens = posts.flatMap((p) => this.tokenize(p));
    const sentences = posts.flatMap((p) => this.splitSentences(p));

    const emojiCount = allTokens.filter((t) => /[\p{Emoji}]/u.test(t)).length;
    const hashtagCount = allTokens.filter((t) => t.startsWith("#")).length;

    const avgSentenceLength =
      sentences.length > 0
        ? sentences.reduce((sum, s) => sum + s.split(" ").length, 0) /
          sentences.length
        : 12;

    const complexWords = allTokens.filter((t) => t.length > 10).length;
    const vocabularyComplexity: "simple" | "moderate" | "advanced" =
      complexWords / allTokens.length > 0.2
        ? "advanced"
        : complexWords / allTokens.length > 0.1
          ? "moderate"
          : "simple";

    const emojiRatio = emojiCount / posts.length;
    const emojiUsage: "none" | "light" | "moderate" | "heavy" =
      emojiRatio > 3
        ? "heavy"
        : emojiRatio > 1.5
          ? "moderate"
          : emojiRatio > 0.5
            ? "light"
            : "none";

    const hashtagRatio = hashtagCount / posts.length;

    const isFormal =
      avgSentenceLength > 15 && vocabularyComplexity === "advanced";
    const isCasual = avgSentenceLength < 12 && emojiUsage !== "none";
    const tone: "formal" | "casual" | "mixed" = isFormal
      ? "formal"
      : isCasual
        ? "casual"
        : "mixed";

    const bigramCounts = new Map<string, number>();
    for (const post of posts) {
      const tokens = this.tokenize(post);
      for (let i = 0; i < tokens.length - 1; i++) {
        const bigram = `${tokens[i]} ${tokens[i + 1]}`;
        bigramCounts.set(bigram, (bigramCounts.get(bigram) || 0) + 1);
      }
    }

    const commonPhrases = Array.from(bigramCounts.entries())
      .filter(([_, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([phrase]) => phrase);

    const confidenceScore =
      posts.length >= 20 ? 0.9 : posts.length >= 10 ? 0.7 : 0.5;

    this.brandVoice = {
      tone,
      emojiUsage,
      hashtagFrequency: hashtagRatio,
      avgSentenceLength,
      vocabularyComplexity,
      commonPhrases,
      confidenceScore,
    };

    return this.brandVoice;
  }

  private applyBrandVoice(content: string, voice: BrandVoiceProfile): string {
    let adjusted = content;

    if (voice.emojiUsage === "none") {
      adjusted = adjusted.replace(/[\p{Emoji}]/gu, "").trim();
    } else if (voice.emojiUsage === "heavy" && !content.match(/[\p{Emoji}]/u)) {
      adjusted += " 🎵✨";
    }

    if (voice.tone === "formal") {
      adjusted = adjusted
        .replace(/!/g, ".")
        .replace(/awesome|cool|amazing/gi, "excellent");
    }

    return adjusted;
  }

  private applyToneAdjustments(content: string, tone: ContentTone): string {
    let adjusted = content;

    switch (tone) {
      case "professional":
        adjusted = adjusted.charAt(0).toUpperCase() + adjusted.slice(1);
        adjusted = adjusted.replace(/\s{2,}/g, " ");
        break;
      case "casual":
        adjusted = adjusted.replace(/\bI am\b/g, "I'm");
        adjusted = adjusted.replace(/\bdo not\b/g, "don't");
        adjusted = adjusted.replace(/\bcannot\b/g, "can't");
        break;
      case "energetic":
        adjusted = adjusted.replace(/\.\s+/g, "!! ");
        if (!adjusted.endsWith("!")) {
          adjusted = adjusted.replace(/\.$/, "!!");
        }
        break;
      case "promotional":
        if (!adjusted.includes("📢") && !adjusted.includes("🚨")) {
          adjusted = "📢 " + adjusted;
        }
        break;
    }

    return adjusted;
  }

  private formatForPlatform(
    content: string,
    platform: Platform,
    maxLength: number,
    hashtags: string[],
  ): string {
    let formatted = content;
    const limit = Math.min(maxLength, PLATFORM_LIMITS[platform]);

    if (platform === "twitter" && formatted.length > limit - 30) {
      formatted = formatted.substring(0, limit - 30) + "...";
    }

    if (platform === "instagram" || platform === "facebook") {
      if (hashtags.length > 0) {
        formatted = `${formatted}\n\n${hashtags.join(" ")}`;
      }
    } else if (platform === "twitter") {
      if (hashtags.length > 0) {
        const hashtagStr = hashtags.slice(0, 3).join(" ");
        if (formatted.length + hashtagStr.length + 1 <= limit) {
          formatted = `${formatted} ${hashtagStr}`;
        }
      }
    } else if (platform === "tiktok") {
      if (hashtags.length > 0) {
        formatted = `${formatted} ${hashtags.slice(0, 5).join(" ")}`;
      }
    } else if (platform === "linkedin") {
      formatted = formatted.replace(/[!]{2,}/g, "!");
      if (hashtags.length > 0) {
        formatted = `${formatted}\n\n${hashtags.slice(0, 3).join(" ")}`;
      }
    } else if (platform === "youtube") {
      if (hashtags.length > 0) {
        formatted = `${formatted}\n\n${hashtags.join(" ")}`;
      }
    }

    return formatted;
  }

  private adaptForLanguage(content: string, language: Language): string {
    const phrases = LANGUAGE_PHRASES[language];
    if (!phrases) return content;

    let adapted = content;

    const enPhrases = LANGUAGE_PHRASES.en;
    Object.keys(enPhrases).forEach((key) => {
      const enList = enPhrases[key as keyof typeof enPhrases];
      const targetList = phrases[key as keyof typeof phrases];
      if (enList && targetList) {
        enList.forEach((enPhrase, idx) => {
          const targetPhrase = targetList[idx] || targetList[0];
          adapted = adapted.replace(new RegExp(enPhrase, "gi"), targetPhrase);
        });
      }
    });

    return adapted;
  }

  private getHashtagCount(platform: Platform): number {
    const counts: Record<Platform, number> = {
      twitter: 3,
      instagram: 10,
      tiktok: 5,
      youtube: 5,
      facebook: 3,
      linkedin: 3,
    };
    return counts[platform];
  }

  private getEmojiCount(tone: ContentTone): number {
    const counts: Record<ContentTone, number> = {
      professional: 1,
      casual: 3,
      energetic: 4,
      promotional: 2,
    };
    return counts[tone];
  }

  private calculateToneMatch(content: string, targetTone: ContentTone): number {
    let score = 0.5;

    const exclamationCount = (content.match(/!/g) || []).length;
    const capsRatio = (content.match(/[A-Z]/g) || []).length / content.length;
    const emojiCount = (content.match(/[\p{Emoji}]/gu) || []).length;

    switch (targetTone) {
      case "professional":
        if (exclamationCount <= 1) score += 0.2;
        if (capsRatio < 0.1) score += 0.15;
        if (emojiCount <= 2) score += 0.15;
        break;
      case "casual":
        if (emojiCount >= 1) score += 0.2;
        if (capsRatio < 0.15) score += 0.15;
        if (content.includes("'")) score += 0.15;
        break;
      case "energetic":
        if (exclamationCount >= 2) score += 0.2;
        if (capsRatio > 0.1) score += 0.15;
        if (emojiCount >= 2) score += 0.15;
        break;
      case "promotional":
        if (content.includes("📢") || content.includes("🚨")) score += 0.2;
        if (
          content.toLowerCase().includes("now") ||
          content.toLowerCase().includes("new")
        )
          score += 0.15;
        if (content.includes("#")) score += 0.15;
        break;
    }

    return Math.min(1, score);
  }

  private estimateEngagement(
    content: string,
    platform: Platform,
    hashtagCount: number,
  ): number {
    let score = 0.5;

    const length = content.length;
    const optimalLength = platform === "twitter" ? 120 : 150;
    const lengthScore = 1 - Math.abs(length - optimalLength) / optimalLength;
    score += lengthScore * 0.2;

    const emojiCount = (content.match(/[\p{Emoji}]/gu) || []).length;
    if (emojiCount >= 1 && emojiCount <= 5) score += 0.1;

    const optimalHashtags = this.getHashtagCount(platform);
    const hashtagScore =
      1 - Math.abs(hashtagCount - optimalHashtags) / optimalHashtags;
    score += hashtagScore * 0.1;

    if (content.includes("?")) score += 0.05;
    if (content.toLowerCase().includes("you")) score += 0.05;

    return Math.min(1, Math.max(0, score));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s#@']/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 0);
  }

  private splitSentences(text: string): string[] {
    return text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  }

  public generateBatch(
    options: GenerationOptions,
    count: number = 5,
  ): CaptionResult[] {
    const results: CaptionResult[] = [];
    for (let i = 0; i < count; i++) {
      results.push(this.generateCaption(options));
    }
    return results;
  }

  public getVocabularyStats(): {
    totalWords: number;
    uniqueWords: number;
    topWords: Array<{ word: string; count: number }>;
  } {
    const wordCounts = new Map<string, number>();

    for (const text of this.trainingCorpus) {
      const tokens = this.tokenize(text);
      tokens.forEach((token) => {
        wordCounts.set(token, (wordCounts.get(token) || 0) + 1);
      });
    }

    const topWords = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([word, count]) => ({ word, count }));

    return {
      totalWords: Array.from(wordCounts.values()).reduce((a, b) => a + b, 0),
      uniqueWords: wordCounts.size,
      topWords,
    };
  }
}
