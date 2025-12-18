/**
 * Dedicated Brand Voice Analyzer for Music Artists
 * Extracts and analyzes brand voice characteristics from content
 * Enhanced with music artist persona detection and consistency scoring
 * Separate from ContentPatternLearner as per research architecture
 */

import type { BrandVoiceProfile } from '../types.js';

export const ARTIST_ARCHETYPES = {
  authenticStoryteller: {
    traits: ['genuine', 'vulnerable', 'narrative-driven', 'personal'],
    contentStyle: ['behind-the-scenes', 'songwriting-process', 'personal-stories'],
    indicators: ['share', 'story', 'journey', 'heart', 'soul', 'real', 'honest', 'truth'],
    emojiProfile: 'moderate',
    toneProfile: 'casual'
  },
  mysteriousArtist: {
    traits: ['enigmatic', 'visual-focused', 'cryptic', 'artistic'],
    contentStyle: ['artistic-visuals', 'cryptic-teasers', 'minimal-text'],
    indicators: ['soon', '...', 'silence', 'listen', 'watch', 'coming'],
    emojiProfile: 'none',
    toneProfile: 'formal'
  },
  communityBuilder: {
    traits: ['interactive', 'fan-focused', 'grateful', 'accessible'],
    contentStyle: ['fan-shoutouts', 'q&a', 'polls', 'fan-content-shares'],
    indicators: ['you', 'love', 'family', 'thank', 'appreciate', 'together', 'we', 'community'],
    emojiProfile: 'heavy',
    toneProfile: 'casual'
  },
  industryProfessional: {
    traits: ['polished', 'business-savvy', 'collaborative', 'networked'],
    contentStyle: ['collaborations', 'industry-insights', 'professional-updates'],
    indicators: ['excited', 'announce', 'partnership', 'collab', 'project', 'team', 'release'],
    emojiProfile: 'light',
    toneProfile: 'mixed'
  },
  entertainmentPersonality: {
    traits: ['humorous', 'entertaining', 'viral-focused', 'trend-aware'],
    contentStyle: ['trends', 'memes', 'challenges', 'entertainment'],
    indicators: ['lol', 'haha', 'dead', 'literally', 'vibe', 'mood', 'energy', 'let\'s go'],
    emojiProfile: 'heavy',
    toneProfile: 'casual'
  }
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
    const allTokens = posts.flatMap(p => this.tokenize(p));
    const sentences = posts.flatMap(p => this.splitSentences(p));

    const emojiCount = allTokens.filter(t => /\p{Emoji}/u.test(t)).length;
    const hashtagCount = allTokens.filter(t => t.startsWith('#')).length;

    const avgSentenceLength =
      sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / sentences.length;

    const complexWords = allTokens.filter(t => t.length > 10).length;
    const vocabularyComplexity =
      complexWords / allTokens.length > 0.2
        ? 'advanced'
        : complexWords / allTokens.length > 0.1
        ? 'moderate'
        : 'simple';

    const emojiRatio = emojiCount / posts.length;
    const emojiUsage =
      emojiRatio > 3
        ? 'heavy'
        : emojiRatio > 1.5
        ? 'moderate'
        : emojiRatio > 0.5
        ? 'light'
        : 'none';

    const hashtagRatio = hashtagCount / posts.length;

    const isFormal = avgSentenceLength > 15 && vocabularyComplexity === 'advanced';
    const isCasual = avgSentenceLength < 12 && emojiUsage !== 'none';

    const tone: 'formal' | 'casual' | 'mixed' = isFormal
      ? 'formal'
      : isCasual
      ? 'casual'
      : 'mixed';

    const bigramCounts = new Map<string, number>();
    for (const post of posts) {
      const tokens = this.tokenize(post);
      for (let i = 0; i < tokens.length - 1; i++) {
        const bigram = `${tokens[i]} ${tokens[i + 1]}`;
        bigramCounts.set(bigram, (bigramCounts.get(bigram) || 0) + 1);
      }
    }

    const commonPhrases = Array.from(bigramCounts.entries())
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([phrase]) => phrase);

    const confidenceScore = posts.length >= 20 ? 0.9 : posts.length >= 10 ? 0.7 : 0.5;

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

  public calculateSimilarity(content: string, profile: BrandVoiceProfile): number {
    const tokens = this.tokenize(content);
    const sentences = this.splitSentences(content);

    const contentEmojiCount = tokens.filter(t => /\p{Emoji}/u.test(t)).length;
    const contentHashtagCount = tokens.filter(t => t.startsWith('#')).length;
    const contentAvgSentenceLength = sentences.reduce((sum, s) => sum + s.split(' ').length, 0) / (sentences.length || 1);

    let similarity = 0;
    let factors = 0;

    const sentenceLengthDiff = Math.abs(contentAvgSentenceLength - profile.avgSentenceLength);
    const sentenceLengthSimilarity = Math.max(0, 1 - sentenceLengthDiff / profile.avgSentenceLength);
    similarity += sentenceLengthSimilarity;
    factors++;

    const emojiRatio = contentEmojiCount;
    const expectedEmoji = profile.emojiUsage === 'heavy' ? 2 : profile.emojiUsage === 'moderate' ? 1 : 0;
    const emojiSimilarity = 1 - Math.abs(emojiRatio - expectedEmoji) / 3;
    similarity += Math.max(0, emojiSimilarity);
    factors++;

    const hashtagDiff = Math.abs(contentHashtagCount - profile.hashtagFrequency);
    const hashtagSimilarity = Math.max(0, 1 - hashtagDiff / 5);
    similarity += hashtagSimilarity;
    factors++;

    const phraseMatches = profile.commonPhrases.filter(phrase =>
      content.toLowerCase().includes(phrase.toLowerCase())
    ).length;
    const phraseSimilarity = phraseMatches / Math.max(profile.commonPhrases.length, 1);
    similarity += phraseSimilarity;
    factors++;

    return similarity / factors;
  }

  public adjustContentToVoice(content: string, voice: BrandVoiceProfile): string {
    let adjusted = content;

    if (voice.emojiUsage === 'none') {
      adjusted = adjusted.replace(/[\p{Emoji}]/gu, '').trim();
    } else if (voice.emojiUsage === 'heavy' && !content.match(/[\p{Emoji}]/u)) {
      adjusted += ' 🎵✨';
    }

    if (voice.tone === 'formal') {
      adjusted = adjusted.replace(/!/g, '.').replace(/awesome|cool|amazing/gi, 'excellent');
    }

    const currentHashtags = (adjusted.match(/#\w+/g) || []).length;
    const targetHashtags = Math.round(voice.hashtagFrequency);

    if (currentHashtags < targetHashtags && voice.commonPhrases.length > 0) {
      const phrase = voice.commonPhrases[0].replace(/\s/g, '');
      adjusted += ` #${phrase}`;
    }

    return adjusted;
  }

  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^\w\s#@]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 0);
  }

  private splitSentences(text: string): string[] {
    return text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  }

  public getProfile(): BrandVoiceProfile | null {
    return this.brandVoice;
  }

  public detectMusicArtistPersona(posts: string[]): MusicArtistPersona {
    const allText = posts.join(' ').toLowerCase();
    const tokens = this.tokenize(allText);
    
    const archetypeScores: Record<ArtistArchetype, number> = {
      authenticStoryteller: 0,
      mysteriousArtist: 0,
      communityBuilder: 0,
      industryProfessional: 0,
      entertainmentPersonality: 0
    };

    for (const [archetype, config] of Object.entries(ARTIST_ARCHETYPES)) {
      let score = 0;
      
      for (const indicator of config.indicators) {
        const count = tokens.filter(t => t.includes(indicator.toLowerCase())).length;
        score += count * 0.15;
      }
      
      const emojiCount = (allText.match(/[\p{Emoji}]/gu) || []).length / posts.length;
      if (config.emojiProfile === 'heavy' && emojiCount > 2) score += 0.3;
      else if (config.emojiProfile === 'moderate' && emojiCount >= 1 && emojiCount <= 2) score += 0.3;
      else if (config.emojiProfile === 'light' && emojiCount > 0 && emojiCount < 1) score += 0.3;
      else if (config.emojiProfile === 'none' && emojiCount === 0) score += 0.3;
      
      archetypeScores[archetype as ArtistArchetype] = Math.min(1, score);
    }

    const sortedArchetypes = Object.entries(archetypeScores)
      .sort(([, a], [, b]) => b - a);
    
    const primaryArchetype = sortedArchetypes[0][0] as ArtistArchetype;
    const secondaryArchetype = sortedArchetypes[1][1] > 0.3 
      ? sortedArchetypes[1][0] as ArtistArchetype 
      : null;

    const brandStrength = this.calculateBrandStrength(posts, primaryArchetype);
    const consistencyScore = this.calculateConsistencyScore(posts, archetypeScores);
    const recommendations = this.generatePersonaRecommendations(
      primaryArchetype, 
      brandStrength, 
      consistencyScore
    );

    this.artistPersona = {
      primaryArchetype,
      secondaryArchetype,
      archetypeConfidences: archetypeScores,
      brandStrength,
      consistencyScore,
      recommendations
    };

    return this.artistPersona;
  }

  private calculateBrandStrength(posts: string[], archetype: ArtistArchetype): number {
    const config = ARTIST_ARCHETYPES[archetype];
    let strength = 0;
    
    const indicatorCoverage = config.indicators.filter(indicator =>
      posts.some(post => post.toLowerCase().includes(indicator))
    ).length / config.indicators.length;
    strength += indicatorCoverage * 0.4;
    
    const avgPostLength = posts.reduce((sum, p) => sum + p.length, 0) / posts.length;
    if (avgPostLength > 50) strength += 0.2;
    if (avgPostLength > 100) strength += 0.1;
    
    if (posts.length >= 20) strength += 0.3;
    else if (posts.length >= 10) strength += 0.2;
    else if (posts.length >= 5) strength += 0.1;

    return Math.min(1, strength);
  }

  private calculateConsistencyScore(
    posts: string[], 
    scores: Record<ArtistArchetype, number>
  ): number {
    const maxScore = Math.max(...Object.values(scores));
    const avgScore = Object.values(scores).reduce((a, b) => a + b, 0) / Object.values(scores).length;
    
    const dominance = maxScore - avgScore;
    
    const variance = Object.values(scores)
      .map(s => Math.pow(s - avgScore, 2))
      .reduce((a, b) => a + b, 0) / Object.values(scores).length;
    
    const consistencyFromDominance = Math.min(1, dominance * 2);
    const consistencyFromVariance = Math.max(0, 1 - Math.sqrt(variance));
    
    return (consistencyFromDominance * 0.6 + consistencyFromVariance * 0.4);
  }

  private generatePersonaRecommendations(
    archetype: ArtistArchetype,
    brandStrength: number,
    consistencyScore: number
  ): string[] {
    const recommendations: string[] = [];
    const config = ARTIST_ARCHETYPES[archetype];

    if (brandStrength < 0.5) {
      recommendations.push(`Strengthen your ${archetype.replace(/([A-Z])/g, ' $1').toLowerCase()} persona by using more phrases like: ${config.indicators.slice(0, 3).join(', ')}`);
    }

    if (consistencyScore < 0.6) {
      recommendations.push('Your content voice varies significantly. Try to maintain a more consistent tone across posts for stronger brand recognition.');
    }

    if (archetype === 'communityBuilder') {
      recommendations.push('Continue engaging with fans through Q&As, polls, and shoutouts to strengthen community bonds.');
    } else if (archetype === 'mysteriousArtist') {
      recommendations.push('Maintain your enigmatic presence with cryptic teasers and minimal but impactful posts.');
    } else if (archetype === 'authenticStoryteller') {
      recommendations.push('Share more personal stories and behind-the-scenes content to deepen fan connection.');
    } else if (archetype === 'industryProfessional') {
      recommendations.push('Highlight collaborations and industry partnerships to reinforce your professional brand.');
    } else if (archetype === 'entertainmentPersonality') {
      recommendations.push('Stay on top of trends and continue creating entertaining, viral-worthy content.');
    }

    if (config.emojiProfile === 'heavy' && brandStrength > 0.5) {
      recommendations.push('Your emoji usage aligns well with your personality. Keep it up!');
    }

    return recommendations;
  }

  public getArtistPersona(): MusicArtistPersona | null {
    return this.artistPersona;
  }

  public getMusicContentSuggestions(genre: string, archetype: ArtistArchetype): string[] {
    const suggestions: string[] = [];
    const config = ARTIST_ARCHETYPES[archetype];

    const genreHashtags: Record<string, string[]> = {
      'hip-hop': ['#hiphop', '#rap', '#newmusic', '#trapmusic'],
      'electronic': ['#edm', '#electronicmusic', '#dj', '#producer'],
      'rock': ['#rock', '#rockmusic', '#livemusic', '#guitar'],
      'pop': ['#pop', '#popmusic', '#newpop', '#mainstream'],
      'r&b': ['#rnb', '#rnbmusic', '#soulsinger', '#newrnb'],
      'indie': ['#indiemusic', '#indieartist', '#underground'],
    };

    const hashtags = genreHashtags[genre.toLowerCase()] || ['#music', '#newmusic', '#artist'];
    
    suggestions.push(`Use genre-relevant hashtags: ${hashtags.slice(0, 3).join(', ')}`);
    suggestions.push(`Content style focus: ${config.contentStyle.slice(0, 2).join(', ')}`);
    
    if (archetype === 'communityBuilder') {
      suggestions.push(`Ask fans: "What's your favorite track from the new project?" to boost engagement`);
    } else if (archetype === 'mysteriousArtist') {
      suggestions.push(`Tease with cryptic visuals and minimal captions like "..." or "soon"`);
    }

    return suggestions;
  }
}
