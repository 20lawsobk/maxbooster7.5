/**
 * Custom NLP Content Generator for Max Booster
 * Self-contained social media content generation without external APIs
 * Uses Markov chains, n-gram models, and template-based generation
 * Specialized for music industry content
 */

import type { BrandVoiceProfile } from '../types.js';
import {
  SOCIAL_MEDIA_MUSIC_PATTERNS,
  ARTIST_PERSONA_PROFILES,
  MUSIC_GENRE_TAXONOMY,
} from '../training/musicIndustryTrainingData.js';

export type ContentTone = 'professional' | 'casual' | 'energetic' | 'promotional';
export type Platform = 'twitter' | 'instagram' | 'tiktok' | 'youtube' | 'facebook' | 'linkedin';
export type Language = 'en' | 'es' | 'fr' | 'de' | 'pt';

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
  contentType?: 'release' | 'behind-the-scenes' | 'announcement' | 'engagement' | 'promotional';
}

export interface CaptionResult {
  caption: string;
  hashtags: string[];
  emojis: string[];
  characterCount: number;
  estimatedEngagement: number;
  toneMatch: number;
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
  professional: ['✨', '🎵', '🎶', '📀', '🎤', '🎧', '💫', '⭐'],
  casual: ['🎵', '🔥', '💯', '✌️', '🙌', '❤️', '😎', '🎶', '💜', '🖤'],
  energetic: ['🔥', '⚡', '💥', '🚀', '🎉', '🙌', '💪', '🤯', '🔊', '🎊'],
  promotional: ['🚨', '📢', '🔔', '🎧', '🎵', '▶️', '🆕', '💿', '🎤', '🌟'],
};

const TONE_PHRASES: Record<ContentTone, Record<string, string[]>> = {
  professional: {
    opening: [
      'Excited to announce',
      'Proud to share',
      'Introducing',
      'Presenting',
      'Delighted to unveil',
      'Thrilled to present',
    ],
    middle: [
      'This represents',
      'A culmination of',
      'Showcasing',
      'Featuring',
      'Highlighting',
      'Demonstrating',
    ],
    closing: [
      'Available now',
      'Out now on all platforms',
      'Stream now',
      'Listen now',
      'Experience the music',
    ],
  },
  casual: {
    opening: [
      'yo check this out',
      'new vibes',
      'something special for yall',
      'been working on this',
      'finally dropping this',
      'here we go',
    ],
    middle: [
      'this one hits different',
      'put my whole heart in this',
      'straight vibes',
      'feeling this energy',
      'really proud of this one',
    ],
    closing: [
      'link in bio',
      'let me know what you think',
      'stream it',
      'turn it up',
      'share with someone who needs this',
    ],
  },
  energetic: {
    opening: [
      'LET\'S GO',
      'THIS IS IT',
      'FINALLY',
      'ITS HERE',
      'GET READY',
      'BANGER ALERT',
    ],
    middle: [
      'absolute fire',
      'we went crazy on this',
      'energy is unmatched',
      'this one is INSANE',
      'hit after hit',
    ],
    closing: [
      'RUN IT UP',
      'STREAM NOW',
      'TURN IT ALL THE WAY UP',
      'DROP A COMMENT',
      'SHARE THIS WITH YOUR SQUAD',
    ],
  },
  promotional: {
    opening: [
      'NEW RELEASE',
      'OUT NOW',
      'JUST DROPPED',
      'AVAILABLE NOW',
      'PREMIERE',
      'EXCLUSIVE',
    ],
    middle: [
      'featuring',
      'produced by',
      'mixed and mastered by',
      'in collaboration with',
      'from the upcoming album',
    ],
    closing: [
      'Stream on all platforms',
      'Pre-save now',
      'Add to your playlist',
      'Available everywhere',
      'Get it now',
    ],
  },
};

const MUSIC_VOCABULARY = {
  nouns: [
    'beat', 'melody', 'rhythm', 'vibe', 'energy', 'sound', 'track', 'song', 'music',
    'flow', 'lyrics', 'hook', 'chorus', 'verse', 'bridge', 'drop', 'bass', 'synth',
    'vocal', 'harmony', 'groove', 'pulse', 'wave', 'frequency', 'tone', 'mood',
    'studio', 'session', 'recording', 'mix', 'master', 'release', 'album', 'EP',
    'single', 'feature', 'collab', 'remix', 'cover', 'original', 'production',
  ],
  verbs: [
    'drop', 'release', 'stream', 'play', 'listen', 'vibe', 'feel', 'experience',
    'share', 'support', 'love', 'create', 'produce', 'mix', 'master', 'record',
    'collaborate', 'feature', 'perform', 'rock', 'groove', 'flow', 'hit', 'bang',
  ],
  adjectives: [
    'new', 'fresh', 'fire', 'heat', 'hot', 'cold', 'hard', 'soft', 'smooth',
    'raw', 'real', 'authentic', 'unique', 'original', 'amazing', 'incredible',
    'insane', 'crazy', 'wild', 'epic', 'legendary', 'classic', 'timeless',
    'emotional', 'powerful', 'energetic', 'chill', 'mellow', 'intense', 'heavy',
  ],
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
  'behind-the-scenes': {
    professional: [
      'A glimpse into the creative process. Working on something special in the studio. {hashtags}',
      'Studio sessions bring out the best in creativity. {middle} new music. {hashtags}',
      'Behind every great track is countless hours of dedication. {hashtags}',
    ],
    casual: [
      'studio vibes 🎵 cooking up something special {hashtags}',
      'late night in the studio... {middle} {hashtags}',
      'bts of the magic happening rn ✨ {hashtags}',
    ],
    energetic: [
      'STUDIO GRIND NEVER STOPS 🔥🔥 {middle}!! {hashtags}',
      'WE IN HERE MAKING HEAT 🔊🔊 {hashtags}',
      'MAGIC HAPPENING IN THE STUDIO RN!! {hashtags}',
    ],
    promotional: [
      '🎬 Behind the scenes of what\'s coming next. Stay tuned. {hashtags}',
      'Exclusive studio content. New music loading... {hashtags}',
      'Studio update: Big things in the works. {closing} {hashtags}',
    ],
  },
  announcement: {
    professional: [
      '{opening}: Exciting news to share with you all. {middle} this incredible opportunity. {hashtags}',
      'Major announcement: {middle}. {closing} {hashtags}',
      '{opening}. A new chapter begins. {hashtags}',
    ],
    casual: [
      'got some news for yall 👀 {middle} {hashtags}',
      'sooo this is happening... {middle} 🙌 {hashtags}',
      'cant believe im saying this but... {middle} {hashtags}',
    ],
    energetic: [
      'MASSIVE ANNOUNCEMENT 🚨🚨 {middle}!! {hashtags}',
      'BIG NEWS YALL!! {middle}!! LETS GOOO 🔥 {hashtags}',
      'IM SO HYPED TO ANNOUNCE {middle}!! {hashtags}',
    ],
    promotional: [
      '📢 ANNOUNCEMENT: {middle}. {closing} {hashtags}',
      '🔔 Important update: {middle}. {hashtags}',
      'NEWS: {middle}. More details coming soon. {hashtags}',
    ],
  },
  engagement: {
    professional: [
      'What tracks are you listening to this week? Always looking for inspiration. {hashtags}',
      'Grateful for this amazing community. Your support means everything. {hashtags}',
      'Music connects us all. What song has been on repeat for you lately? {hashtags}',
    ],
    casual: [
      'whats everyone listening to rn? drop your fav tracks below 👇 {hashtags}',
      'yall are the best fr ❤️ thanks for all the love {hashtags}',
      'question: what song gets you through tough days? {hashtags}',
    ],
    energetic: [
      'DROP YOUR FAV SONG IN THE COMMENTS!! LETS BUILD A PLAYLIST 🔥 {hashtags}',
      'YALL ARE INSANE!! THANK YOU FOR 💯 SUPPORT!! {hashtags}',
      'WHO ELSE IS VIBING TO SOME HEAT RN?? 🙌🙌 {hashtags}',
    ],
    promotional: [
      'Join the conversation: What music moves you? Share below. {hashtags}',
      'Community poll: Which track should I release next? Vote now. {hashtags}',
      'Fan appreciation: Thank you for your incredible support. {hashtags}',
    ],
  },
  promotional: {
    professional: [
      '{opening} my music on all streaming platforms. Your support makes a difference. {hashtags}',
      'Now available: Stream the latest releases and join the journey. {hashtags}',
      'Thank you for supporting independent music. {closing} {hashtags}',
    ],
    casual: [
      'if you fw the music, stream it and share it! means the world 💜 {hashtags}',
      'new music needs love... yall know what to do 🙏 {hashtags}',
      'appreciate everyone who streams and shares fr {hashtags}',
    ],
    energetic: [
      'STREAM GANG WHERE YOU AT?! 🔥🔥 RUN IT UP!! {hashtags}',
      'LETS HIT THOSE STREAMING NUMBERS!! SHARE WITH YOUR FRIENDS!! {hashtags}',
      'THE SUPPORT IS CRAZY!! KEEP STREAMING!! 🚀 {hashtags}',
    ],
    promotional: [
      '🎧 Stream now on Spotify, Apple Music, and all major platforms. {hashtags}',
      '📲 Pre-save the new release. Link in bio. {hashtags}',
      '🔗 Listen now: Available on all streaming services. {hashtags}',
    ],
  },
};

const LANGUAGE_PHRASES: Record<Language, Record<string, string[]>> = {
  en: {
    newMusic: ['new music', 'new track', 'new single', 'latest release'],
    outNow: ['out now', 'available now', 'streaming now', 'just dropped'],
    streamIt: ['stream it', 'listen now', 'check it out', 'give it a listen'],
  },
  es: {
    newMusic: ['nueva música', 'nuevo tema', 'nuevo sencillo', 'último lanzamiento'],
    outNow: ['ya disponible', 'disponible ahora', 'ya salió', 'acaba de salir'],
    streamIt: ['escúchalo', 'escucha ahora', 'dale play', 'no te lo pierdas'],
  },
  fr: {
    newMusic: ['nouvelle musique', 'nouveau morceau', 'nouveau single', 'dernière sortie'],
    outNow: ['disponible maintenant', 'sorti maintenant', 'vient de sortir'],
    streamIt: ['écoute maintenant', 'écoutez-le', 'découvrez-le'],
  },
  de: {
    newMusic: ['neue Musik', 'neuer Track', 'neue Single', 'neueste Veröffentlichung'],
    outNow: ['jetzt verfügbar', 'jetzt draußen', 'gerade erschienen'],
    streamIt: ['jetzt streamen', 'jetzt anhören', 'hör es dir an'],
  },
  pt: {
    newMusic: ['música nova', 'nova faixa', 'novo single', 'último lançamento'],
    outNow: ['já disponível', 'disponível agora', 'acabou de sair'],
    streamIt: ['ouça agora', 'dá um play', 'confere aí'],
  },
};

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
    
    Object.values(CONTENT_TEMPLATES).forEach(toneTemplates => {
      Object.values(toneTemplates).forEach(templates => {
        corpus.push(...templates);
      });
    });

    Object.values(TONE_PHRASES).forEach(phrases => {
      Object.values(phrases).forEach(phraseList => {
        corpus.push(...phraseList);
      });
    });

    const musicPhrases = [
      'new music dropping soon stay tuned for the heat',
      'this track represents everything I stand for as an artist',
      'late nights in the studio paying off with this one',
      'grateful for everyone who supports the journey',
      'the energy in this one is unmatched feeling blessed',
      'collaboration with some incredible artists coming soon',
      'streaming now on all major platforms show some love',
      'behind every song is a story waiting to be told',
      'the beat hits different at 2am in the studio',
      'music is my therapy and I hope it helps you too',
      'new single out now link in bio stream and share',
      'vibing to the new project cant wait for yall to hear it',
      'production on point thanks to the amazing team',
      'this one is for the real ones who been here since day one',
      'fresh sounds for your playlist add it now',
    ];
    corpus.push(...musicPhrases);

    return corpus;
  }

  public trainOnContent(content: string[]): void {
    this.trainingCorpus = [...this.trainingCorpus, ...content];
    
    for (const text of content) {
      const tokens = this.tokenize(text);
      if (tokens.length < this.ngramModel.order + 1) continue;

      const startSeq = tokens.slice(0, this.ngramModel.order).join(' ');
      if (!this.ngramModel.startSequences.includes(startSeq)) {
        this.ngramModel.startSequences.push(startSeq);
      }

      for (let i = 0; i <= tokens.length - this.ngramModel.order - 1; i++) {
        const state = tokens.slice(i, i + this.ngramModel.order).join(' ');
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
          (transition.nextWords.get(nextWord) || 0) + 1
        );
        transition.totalCount++;
      }
    }
  }

  public generateCaption(options: GenerationOptions): CaptionResult {
    const {
      tone,
      platform,
      language = 'en',
      maxLength = PLATFORM_LIMITS[platform],
      includeHashtags = true,
      includeEmojis = true,
      topic = '',
      genre = '',
      artistName = '',
      trackTitle = '',
      contentType = 'release',
    } = options;

    let caption = this.generateFromTemplate(
      contentType,
      tone,
      { topic, genre, artistName, trackTitle }
    );

    if (this.brandVoice) {
      caption = this.applyBrandVoice(caption, this.brandVoice);
    }

    caption = this.applyToneAdjustments(caption, tone);

    const hashtags = includeHashtags
      ? this.generateHashtags({ topic, genre, platform, tone, count: this.getHashtagCount(platform) })
      : [];

    const emojis = includeEmojis
      ? this.suggestEmojis({ tone, content: caption, count: this.getEmojiCount(tone) })
      : [];

    if (hashtags.length > 0) {
      caption = caption.replace('{hashtags}', '');
    } else {
      caption = caption.replace('{hashtags}', '');
    }

    caption = this.formatForPlatform(caption, platform, maxLength, hashtags);

    if (language !== 'en') {
      caption = this.adaptForLanguage(caption, language);
    }

    const toneMatch = this.calculateToneMatch(caption, tone);
    const estimatedEngagement = this.estimateEngagement(caption, platform, hashtags.length);

    return {
      caption: caption.trim(),
      hashtags,
      emojis,
      characterCount: caption.length,
      estimatedEngagement,
      toneMatch,
    };
  }

  private generateFromTemplate(
    contentType: string,
    tone: ContentTone,
    context: { topic: string; genre: string; artistName: string; trackTitle: string }
  ): string {
    const templates = CONTENT_TEMPLATES[contentType]?.[tone] || CONTENT_TEMPLATES.release[tone];
    const template = templates[Math.floor(Math.random() * templates.length)];

    const phrases = TONE_PHRASES[tone];
    const opening = phrases.opening[Math.floor(Math.random() * phrases.opening.length)];
    const middle = phrases.middle[Math.floor(Math.random() * phrases.middle.length)];
    const closing = phrases.closing[Math.floor(Math.random() * phrases.closing.length)];

    let result = template
      .replace('{opening}', opening)
      .replace('{middle}', middle)
      .replace('{closing}', closing)
      .replace('{trackTitle}', context.trackTitle || 'the new track')
      .replace('{artistName}', context.artistName || 'the artist')
      .replace('{genre}', context.genre || 'music')
      .replace('{topic}', context.topic || 'music');

    const markovAddition = this.generateMarkovSequence(5);
    if (markovAddition && Math.random() > 0.5) {
      result = `${result} ${markovAddition}`;
    }

    return result;
  }

  private generateMarkovSequence(maxWords: number): string {
    if (this.ngramModel.startSequences.length === 0) {
      return '';
    }

    const startIdx = Math.floor(Math.random() * this.ngramModel.startSequences.length);
    let currentState = this.ngramModel.startSequences[startIdx];
    const words = currentState.split(' ');

    for (let i = 0; i < maxWords; i++) {
      const transition = this.ngramModel.transitions.get(currentState);
      if (!transition || transition.totalCount === 0) break;

      const nextWord = this.weightedRandomChoice(transition.nextWords, transition.totalCount);
      if (!nextWord) break;

      words.push(nextWord);
      const stateTokens = currentState.split(' ');
      stateTokens.shift();
      stateTokens.push(nextWord);
      currentState = stateTokens.join(' ');
    }

    return words.join(' ');
  }

  private weightedRandomChoice(options: Map<string, number>, total: number): string | null {
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
    const { topic = '', genre = '', platform = 'instagram', tone = 'casual', count = 5, trending = true } = options;
    const hashtags: Set<string> = new Set();

    const genreHashtags = SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies[
      genre.toLowerCase() as keyof typeof SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies
    ] || [];
    genreHashtags.forEach(h => hashtags.add(h));

    SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies.general.forEach(h => hashtags.add(h));

    if (topic) {
      const topicTag = `#${topic.toLowerCase().replace(/\s+/g, '')}`;
      hashtags.add(topicTag);
    }

    const toneHashtags: Record<ContentTone, string[]> = {
      professional: ['#MusicBusiness', '#MusicIndustry', '#IndependentArtist', '#MusicProduction'],
      casual: ['#Vibes', '#MusicLife', '#GoodVibesOnly', '#FeelGoodMusic'],
      energetic: ['#Hype', '#TurnUp', '#LetsGo', '#Energy', '#Banger'],
      promotional: ['#NewRelease', '#OutNow', '#StreamNow', '#LinkInBio', '#PreSave'],
    };
    toneHashtags[tone].forEach(h => hashtags.add(h));

    if (trending) {
      const trendingTags = this.getTrendingHashtags(platform);
      trendingTags.slice(0, 2).forEach(h => hashtags.add(h));
    }

    return Array.from(hashtags).slice(0, count);
  }

  private getTrendingHashtags(platform: Platform): string[] {
    const baseTrending = ['#FYP', '#Viral', '#Trending', '#Explore', '#ForYou'];
    
    const platformTrending: Record<Platform, string[]> = {
      twitter: ['#MusicTwitter', '#NewMusicFriday', '#NowPlaying'],
      instagram: ['#Reels', '#IGMusic', '#MusicReels', '#ExplorePage'],
      tiktok: ['#TikTokMusic', '#FYP', '#ForYouPage', '#Viral', '#MusicTok'],
      youtube: ['#Shorts', '#YouTubeMusic', '#Subscribe', '#MusicVideo'],
      facebook: ['#FacebookMusic', '#LiveMusic', '#MusicVideo'],
      linkedin: ['#MusicBusiness', '#CreativeIndustry', '#ArtistLife'],
    };

    return [...platformTrending[platform], ...baseTrending];
  }

  public suggestEmojis(options: {
    tone?: ContentTone;
    content?: string;
    count?: number;
    genre?: string;
  }): string[] {
    const { tone = 'casual', content = '', count = 3, genre = '' } = options;
    const emojis: Set<string> = new Set();

    const toneEmojis = TONE_EMOJIS[tone];
    const shuffled = [...toneEmojis].sort(() => Math.random() - 0.5);
    shuffled.slice(0, Math.ceil(count / 2)).forEach(e => emojis.add(e));

    const contentLower = content.toLowerCase();
    const contextEmojis: [string, string[]][] = [
      ['fire|hot|heat|flame|burn', ['🔥']],
      ['love|heart|feel', ['❤️', '💜', '💙']],
      ['star|shine|bright', ['⭐', '✨', '💫']],
      ['music|song|track|beat', ['🎵', '🎶', '🎤']],
      ['studio|record|mix', ['🎧', '🎚️', '🎛️']],
      ['drop|release|new', ['🆕', '📢', '🚨']],
      ['night|late|dark', ['🌙', '✨', '🖤']],
      ['party|celebrate|hype', ['🎉', '🎊', '🙌']],
      ['mic|vocal|sing', ['🎤', '🎙️']],
      ['play|listen|stream', ['▶️', '🎧', '📲']],
    ];

    for (const [pattern, emojiList] of contextEmojis) {
      if (new RegExp(pattern, 'i').test(contentLower)) {
        emojiList.forEach(e => emojis.add(e));
      }
    }

    const genreEmojis: Record<string, string[]> = {
      'hip-hop': ['🎤', '🔥', '💯', '🖤'],
      'electronic': ['🎧', '🔊', '⚡', '🌌'],
      'rock': ['🎸', '🤘', '🔥', '⚡'],
      'pop': ['💖', '✨', '🎵', '🌟'],
      'r&b': ['💜', '✨', '🎤', '💫'],
      'country': ['🤠', '🎸', '🌾', '🎵'],
      'jazz': ['🎷', '🎺', '🎹', '✨'],
    };
    if (genre && genreEmojis[genre.toLowerCase()]) {
      genreEmojis[genre.toLowerCase()].forEach(e => emojis.add(e));
    }

    return Array.from(emojis).slice(0, count);
  }

  public matchBrandVoice(content: string, targetVoice: BrandVoiceProfile): {
    adjustedContent: string;
    matchScore: number;
    suggestions: string[];
  } {
    let adjustedContent = content;
    const suggestions: string[] = [];

    if (targetVoice.emojiUsage === 'none') {
      adjustedContent = adjustedContent.replace(/[\p{Emoji}]/gu, '').trim();
      if (content !== adjustedContent) {
        suggestions.push('Removed emojis to match brand voice');
      }
    } else if (targetVoice.emojiUsage === 'heavy') {
      const emojiCount = (adjustedContent.match(/[\p{Emoji}]/gu) || []).length;
      if (emojiCount < 2) {
        const addEmojis = this.suggestEmojis({ count: 2 });
        adjustedContent = `${adjustedContent} ${addEmojis.join('')}`;
        suggestions.push('Added emojis to match brand voice');
      }
    }

    if (targetVoice.tone === 'formal') {
      adjustedContent = adjustedContent
        .replace(/!/g, '.')
        .replace(/\byall\b/gi, 'everyone')
        .replace(/\bfw\b/gi, 'appreciate')
        .replace(/\brn\b/gi, 'right now')
        .replace(/\bfr\b/gi, 'truly')
        .replace(/\bvibes\b/gi, 'atmosphere')
        .replace(/\bheat\b/gi, 'excellence')
        .replace(/\bfire\b/gi, 'exceptional');
      suggestions.push('Adjusted language for formal tone');
    } else if (targetVoice.tone === 'casual') {
      adjustedContent = adjustedContent
        .replace(/\bexcellent\b/gi, 'fire')
        .replace(/\bexceptional\b/gi, 'heat')
        .replace(/\beveryone\b/gi, 'yall')
        .replace(/\btruly\b/gi, 'fr');
      suggestions.push('Adjusted language for casual tone');
    }

    const sentences = this.splitSentences(adjustedContent);
    const avgLength = sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / (sentences.length || 1);
    
    if (Math.abs(avgLength - targetVoice.avgSentenceLength) > 5) {
      if (avgLength > targetVoice.avgSentenceLength) {
        suggestions.push('Consider breaking up longer sentences');
      } else {
        suggestions.push('Consider combining short sentences for more depth');
      }
    }

    const hashtagCount = (adjustedContent.match(/#\w+/g) || []).length;
    const targetHashtags = Math.round(targetVoice.hashtagFrequency);
    if (hashtagCount < targetHashtags - 2) {
      suggestions.push(`Add ${targetHashtags - hashtagCount} more hashtags`);
    } else if (hashtagCount > targetHashtags + 2) {
      suggestions.push(`Remove ${hashtagCount - targetHashtags} hashtags`);
    }

    const matchScore = this.calculateVoiceMatchScore(adjustedContent, targetVoice);

    return {
      adjustedContent: adjustedContent.trim(),
      matchScore,
      suggestions,
    };
  }

  private calculateVoiceMatchScore(content: string, voice: BrandVoiceProfile): number {
    let score = 0;
    let factors = 0;

    const emojiCount = (content.match(/[\p{Emoji}]/gu) || []).length;
    const expectedEmoji = voice.emojiUsage === 'heavy' ? 3 : 
                          voice.emojiUsage === 'moderate' ? 1.5 :
                          voice.emojiUsage === 'light' ? 0.5 : 0;
    const emojiDiff = Math.abs(emojiCount - expectedEmoji);
    score += Math.max(0, 1 - emojiDiff / 3);
    factors++;

    const sentences = this.splitSentences(content);
    const avgLength = sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / (sentences.length || 1);
    const lengthDiff = Math.abs(avgLength - voice.avgSentenceLength);
    score += Math.max(0, 1 - lengthDiff / voice.avgSentenceLength);
    factors++;

    const hashtagCount = (content.match(/#\w+/g) || []).length;
    const hashtagDiff = Math.abs(hashtagCount - voice.hashtagFrequency);
    score += Math.max(0, 1 - hashtagDiff / 5);
    factors++;

    const phraseMatches = voice.commonPhrases.filter(phrase =>
      content.toLowerCase().includes(phrase.toLowerCase())
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
    const allTokens = posts.flatMap(p => this.tokenize(p));
    const sentences = posts.flatMap(p => this.splitSentences(p));

    const emojiCount = allTokens.filter(t => /[\p{Emoji}]/u.test(t)).length;
    const hashtagCount = allTokens.filter(t => t.startsWith('#')).length;

    const avgSentenceLength = sentences.length > 0
      ? sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / sentences.length
      : 12;

    const complexWords = allTokens.filter(t => t.length > 10).length;
    const vocabularyComplexity: 'simple' | 'moderate' | 'advanced' =
      complexWords / allTokens.length > 0.2 ? 'advanced' :
      complexWords / allTokens.length > 0.1 ? 'moderate' : 'simple';

    const emojiRatio = emojiCount / posts.length;
    const emojiUsage: 'none' | 'light' | 'moderate' | 'heavy' =
      emojiRatio > 3 ? 'heavy' :
      emojiRatio > 1.5 ? 'moderate' :
      emojiRatio > 0.5 ? 'light' : 'none';

    const hashtagRatio = hashtagCount / posts.length;

    const isFormal = avgSentenceLength > 15 && vocabularyComplexity === 'advanced';
    const isCasual = avgSentenceLength < 12 && emojiUsage !== 'none';
    const tone: 'formal' | 'casual' | 'mixed' = isFormal ? 'formal' : isCasual ? 'casual' : 'mixed';

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

    const confidenceScore = posts.length >= 20 ? 0.9 : posts.length >= 10 ? 0.7 : 0.5;

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

    if (voice.emojiUsage === 'none') {
      adjusted = adjusted.replace(/[\p{Emoji}]/gu, '').trim();
    } else if (voice.emojiUsage === 'heavy' && !(content.match(/[\p{Emoji}]/u))) {
      adjusted += ' 🎵✨';
    }

    if (voice.tone === 'formal') {
      adjusted = adjusted
        .replace(/!/g, '.')
        .replace(/awesome|cool|amazing/gi, 'excellent');
    }

    return adjusted;
  }

  private applyToneAdjustments(content: string, tone: ContentTone): string {
    let adjusted = content;

    switch (tone) {
      case 'professional':
        adjusted = adjusted.charAt(0).toUpperCase() + adjusted.slice(1);
        adjusted = adjusted.replace(/\s{2,}/g, ' ');
        break;
      case 'casual':
        adjusted = adjusted.replace(/\bI am\b/g, "I'm");
        adjusted = adjusted.replace(/\bdo not\b/g, "don't");
        adjusted = adjusted.replace(/\bcannot\b/g, "can't");
        break;
      case 'energetic':
        adjusted = adjusted.replace(/\.\s+/g, '!! ');
        if (!adjusted.endsWith('!')) {
          adjusted = adjusted.replace(/\.$/, '!!');
        }
        break;
      case 'promotional':
        if (!adjusted.includes('📢') && !adjusted.includes('🚨')) {
          adjusted = '📢 ' + adjusted;
        }
        break;
    }

    return adjusted;
  }

  private formatForPlatform(
    content: string,
    platform: Platform,
    maxLength: number,
    hashtags: string[]
  ): string {
    let formatted = content;
    const limit = Math.min(maxLength, PLATFORM_LIMITS[platform]);

    if (platform === 'twitter' && formatted.length > limit - 30) {
      formatted = formatted.substring(0, limit - 30) + '...';
    }

    if (platform === 'instagram' || platform === 'facebook') {
      if (hashtags.length > 0) {
        formatted = `${formatted}\n\n${hashtags.join(' ')}`;
      }
    } else if (platform === 'twitter') {
      if (hashtags.length > 0) {
        const hashtagStr = hashtags.slice(0, 3).join(' ');
        if (formatted.length + hashtagStr.length + 1 <= limit) {
          formatted = `${formatted} ${hashtagStr}`;
        }
      }
    } else if (platform === 'tiktok') {
      if (hashtags.length > 0) {
        formatted = `${formatted} ${hashtags.slice(0, 5).join(' ')}`;
      }
    } else if (platform === 'linkedin') {
      formatted = formatted.replace(/[!]{2,}/g, '!');
      if (hashtags.length > 0) {
        formatted = `${formatted}\n\n${hashtags.slice(0, 3).join(' ')}`;
      }
    } else if (platform === 'youtube') {
      if (hashtags.length > 0) {
        formatted = `${formatted}\n\n${hashtags.join(' ')}`;
      }
    }

    return formatted;
  }

  private adaptForLanguage(content: string, language: Language): string {
    const phrases = LANGUAGE_PHRASES[language];
    if (!phrases) return content;

    let adapted = content;
    
    const enPhrases = LANGUAGE_PHRASES.en;
    Object.keys(enPhrases).forEach(key => {
      const enList = enPhrases[key as keyof typeof enPhrases];
      const targetList = phrases[key as keyof typeof phrases];
      if (enList && targetList) {
        enList.forEach((enPhrase, idx) => {
          const targetPhrase = targetList[idx] || targetList[0];
          adapted = adapted.replace(new RegExp(enPhrase, 'gi'), targetPhrase);
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
      case 'professional':
        if (exclamationCount <= 1) score += 0.2;
        if (capsRatio < 0.1) score += 0.15;
        if (emojiCount <= 2) score += 0.15;
        break;
      case 'casual':
        if (emojiCount >= 1) score += 0.2;
        if (capsRatio < 0.15) score += 0.15;
        if (content.includes("'")) score += 0.15;
        break;
      case 'energetic':
        if (exclamationCount >= 2) score += 0.2;
        if (capsRatio > 0.1) score += 0.15;
        if (emojiCount >= 2) score += 0.15;
        break;
      case 'promotional':
        if (content.includes('📢') || content.includes('🚨')) score += 0.2;
        if (content.toLowerCase().includes('now') || content.toLowerCase().includes('new')) score += 0.15;
        if (content.includes('#')) score += 0.15;
        break;
    }

    return Math.min(1, score);
  }

  private estimateEngagement(content: string, platform: Platform, hashtagCount: number): number {
    let score = 0.5;

    const length = content.length;
    const optimalLength = platform === 'twitter' ? 120 : 150;
    const lengthScore = 1 - Math.abs(length - optimalLength) / optimalLength;
    score += lengthScore * 0.2;

    const emojiCount = (content.match(/[\p{Emoji}]/gu) || []).length;
    if (emojiCount >= 1 && emojiCount <= 5) score += 0.1;

    const optimalHashtags = this.getHashtagCount(platform);
    const hashtagScore = 1 - Math.abs(hashtagCount - optimalHashtags) / optimalHashtags;
    score += hashtagScore * 0.1;

    if (content.includes('?')) score += 0.05;
    if (content.toLowerCase().includes('you')) score += 0.05;

    return Math.min(1, Math.max(0, score));
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s#@']/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  private splitSentences(text: string): string[] {
    return text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  }

  public generateBatch(
    options: GenerationOptions,
    count: number = 5
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
      tokens.forEach(token => {
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
