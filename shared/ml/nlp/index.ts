/**
 * NLP Module Exports for Max Booster
 * Custom natural language processing for social media content generation
 * 100% self-contained - no external API dependencies
 */

export {
  ContentGenerator,
  type ContentTone,
  type Platform,
  type Language,
  type GenerationOptions,
  type CaptionResult,
  type MarkovTransition,
  type NGramModel,
} from './ContentGenerator.js';

export {
  SentimentAnalyzer,
  type Emotion,
  type SentimentLabel,
  type ToxicityLevel,
  type SentimentResult,
  type AspectSentiment,
  type EmotionResult,
  type ToxicityResult,
  type FullAnalysisResult,
} from './SentimentAnalyzer.js';
