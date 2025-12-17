/**
 * Dedicated Brand Voice Analyzer
 * Extracts and analyzes brand voice characteristics from content
 * Separate from ContentPatternLearner as per research architecture
 */

import type { BrandVoiceProfile } from '../types.js';

export class BrandVoiceAnalyzer {
  private brandVoice: BrandVoiceProfile | null = null;

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
}
