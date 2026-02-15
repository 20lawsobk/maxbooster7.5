/**
 * Custom Content Pattern Learning System
 * TF-IDF + n-grams + Markov chains for content generation
 * Pattern-based learning from successful historical content
 */

import type { ContentPattern, BrandVoiceProfile } from '../types.js';

export interface NGram {
  tokens: string[];
  frequency: number;
  avgPerformance: number;
}

export interface MarkovChain {
  transitions: Map<string, Map<string, number>>;
  order: number;
}

export class ContentPatternLearner {
  private ngramCache: Map<number, NGram[]> = new Map();
  private tfidfScores: Map<string, number> = new Map();
  private markovChain: MarkovChain | null = null;
  private brandVoice: BrandVoiceProfile | null = null;

  constructor() {}

  public learnPatterns(posts: Array<{ text: string; engagement: number }>): ContentPattern[] {
    this.buildNGrams(posts);
    this.calculateTFIDF(posts.map(p => p.text));
    this.buildMarkovChain(posts.map(p => p.text));

    const patterns: ContentPattern[] = [];

    for (const n of [1, 2, 3]) {
      const ngrams = this.ngramCache.get(n) || [];
      
      for (const ngram of ngrams.slice(0, 50)) {
        if (ngram.frequency >= 3 && ngram.avgPerformance > 0) {
          patterns.push({
            pattern: ngram.tokens.join(' '),
            frequency: ngram.frequency,
            performance: ngram.avgPerformance,
            examples: [],
          });
        }
      }
    }

    return patterns.sort((a, b) => b.performance - a.performance);
  }

  public analyzeBrandVoice(posts: string[]): BrandVoiceProfile {
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

  public generateContent(
    topic: string,
    targetVoice?: BrandVoiceProfile,
    count: number = 5
  ): string[] {
    const voice = targetVoice || this.brandVoice;
    if (!voice) {
      throw new Error('Brand voice not analyzed. Call analyzeBrandVoice() first.');
    }

    const generated: string[] = [];

    for (let i = 0; i < count; i++) {
      let content = this.generateUsingMarkov(topic, voice);

      content = this.adjustToVoice(content, voice);

      generated.push(content);
    }

    return generated;
  }

  private buildNGrams(posts: Array<{ text: string; engagement: number }>): void {
    for (const n of [1, 2, 3]) {
      const ngramMap = new Map<string, { count: number; totalEngagement: number }>();

      for (const post of posts) {
        const tokens = this.tokenize(post.text);

        for (let i = 0; i <= tokens.length - n; i++) {
          const ngram = tokens.slice(i, i + n);
          const key = ngram.join('_');

          const existing = ngramMap.get(key) || { count: 0, totalEngagement: 0 };
          ngramMap.set(key, {
            count: existing.count + 1,
            totalEngagement: existing.totalEngagement + post.engagement,
          });
        }
      }

      const ngrams: NGram[] = Array.from(ngramMap.entries()).map(([key, data]) => ({
        tokens: key.split('_'),
        frequency: data.count,
        avgPerformance: data.totalEngagement / data.count,
      }));

      ngrams.sort((a, b) => b.frequency - a.frequency);
      this.ngramCache.set(n, ngrams);
    }
  }

  private calculateTFIDF(documents: string[]): void {
    const termFrequency = new Map<string, Map<number, number>>();
    const documentFrequency = new Map<string, number>();

    documents.forEach((doc, docIdx) => {
      const tokens = this.tokenize(doc);
      const uniqueTokens = new Set(tokens);

      tokens.forEach(token => {
        if (!termFrequency.has(token)) {
          termFrequency.set(token, new Map());
        }
        const docMap = termFrequency.get(token)!;
        docMap.set(docIdx, (docMap.get(docIdx) || 0) + 1);
      });

      uniqueTokens.forEach(token => {
        documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
      });
    });

    const numDocuments = documents.length;

    termFrequency.forEach((docMap, term) => {
      let maxTFIDF = 0;

      docMap.forEach((tf, docIdx) => {
        const df = documentFrequency.get(term) || 1;
        const idf = Math.log(numDocuments / df);
        const tfidf = tf * idf;
        maxTFIDF = Math.max(maxTFIDF, tfidf);
      });

      this.tfidfScores.set(term, maxTFIDF);
    });
  }

  private buildMarkovChain(texts: string[]): void {
    const transitions = new Map<string, Map<string, number>>();
    const order = 2;

    for (const text of texts) {
      const tokens = this.tokenize(text);

      for (let i = 0; i < tokens.length - order; i++) {
        const state = tokens.slice(i, i + order).join(' ');
        const next = tokens[i + order];

        if (!transitions.has(state)) {
          transitions.set(state, new Map());
        }

        const nextMap = transitions.get(state)!;
        nextMap.set(next, (nextMap.get(next) || 0) + 1);
      }
    }

    this.markovChain = { transitions, order };
  }

  private generateUsingMarkov(seed: string, voice: BrandVoiceProfile): string {
    if (!this.markovChain) {
      return this.generateTemplateBasedContent(seed, voice);
    }

    const { transitions, order } = this.markovChain;
    const seedTokens = this.tokenize(seed);

    let currentState = seedTokens.slice(-order).join(' ');
    let generatedTokens = [...seedTokens];

    const maxLength = voice.avgSentenceLength * 2;

    while (generatedTokens.length < maxLength) {
      const possibleNext = transitions.get(currentState);
      if (!possibleNext || possibleNext.size === 0) break;

      const next = this.weightedRandomChoice(possibleNext);
      generatedTokens.push(next);

      currentState = generatedTokens.slice(-order).join(' ');

      if (next.endsWith('.') || next.endsWith('!') || next.endsWith('?')) {
        break;
      }
    }

    return generatedTokens.join(' ');
  }

  private generateTemplateBasedContent(topic: string, voice: BrandVoiceProfile): string {
    const templates = [
      `Check out our latest ${topic}! 🎵`,
      `New ${topic} just dropped 🔥`,
      `Excited to share this ${topic} with you all!`,
      `${topic} is live now! What do you think?`,
      `Working on some amazing ${topic} content 🎶`,
    ];

    let content = templates[Math.floor(Math.random() * templates.length)];

    return this.adjustToVoice(content, voice);
  }

  private adjustToVoice(content: string, voice: BrandVoiceProfile): string {
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

  private weightedRandomChoice(options: Map<string, number>): string {
    const total = Array.from(options.values()).reduce((sum, val) => sum + val, 0);
    let random = Math.random() * total;

    for (const [key, weight] of options.entries()) {
      random -= weight;
      if (random <= 0) {
        return key;
      }
    }

    return Array.from(options.keys())[0];
  }

  public getTopKeywords(count: number = 10): Array<{ word: string; score: number }> {
    return Array.from(this.tfidfScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, count)
      .map(([word, score]) => ({ word, score }));
  }

  public getCommonBigrams(count: number = 10): string[] {
    const bigrams = this.ngramCache.get(2) || [];
    return bigrams.slice(0, count).map(bg => bg.tokens.join(' '));
  }

  public getBrandVoice(): BrandVoiceProfile | null {
    return this.brandVoice;
  }
}
