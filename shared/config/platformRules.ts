import type { Platform } from '../types/multimodalGeneration.js';

export interface TextRules {
  maxLength?: number;
  titleMax?: number;
  descriptionMax?: number;
  recommendedLength?: number;
  hashtags?: {
    allowed: boolean;
    max?: number;
  };
  tone: string[];
}

export interface ImageRules {
  aspectRatios: string[];
  recommended?: string;
}

export interface VideoRules {
  aspectRatios: string[];
  maxDurationSec: number;
  recommendedDurationSec?: number;
  recommendedShortSec?: number;
  requiresHook?: boolean;
}

export interface AudioRules {
  voiceover: boolean;
  maxDurationSec?: number;
  style?: string[];
  tone?: string[];
}

export interface PlatformRules {
  text: TextRules;
  image: ImageRules;
  video: VideoRules;
  audio: AudioRules;
}

export const PLATFORM_RULES: Record<Platform, PlatformRules> = {
  facebook: {
    text: {
      maxLength: 63206,
      recommendedLength: 80,
      hashtags: { allowed: true, max: 3 },
      tone: ['conversational', 'personal', 'story-driven'],
    },
    image: {
      aspectRatios: ['1.91:1', '1:1'],
      recommended: '1.91:1',
    },
    video: {
      aspectRatios: ['4:5', '1:1', '16:9'],
      maxDurationSec: 240,
      recommendedDurationSec: 15,
    },
    audio: {
      voiceover: true,
      maxDurationSec: 30,
    },
  },

  instagram: {
    text: {
      maxLength: 2200,
      recommendedLength: 150,
      hashtags: { allowed: true, max: 8 },
      tone: ['aesthetic', 'emotional', 'punchy'],
    },
    image: {
      aspectRatios: ['1:1', '4:5', '1.91:1'],
      recommended: '4:5',
    },
    video: {
      aspectRatios: ['9:16'],
      maxDurationSec: 90,
      recommendedDurationSec: 7,
    },
    audio: {
      voiceover: true,
      maxDurationSec: 15,
    },
  },

  threads: {
    text: {
      maxLength: 500,
      recommendedLength: 120,
      hashtags: { allowed: false },
      tone: ['casual', 'authentic', 'direct'],
    },
    image: {
      aspectRatios: ['1:1', '4:5'],
    },
    video: {
      aspectRatios: ['9:16'],
      maxDurationSec: 300,
    },
    audio: {
      voiceover: false,
    },
  },

  tiktok: {
    text: {
      maxLength: 2200,
      recommendedLength: 80,
      hashtags: { allowed: true, max: 5 },
      tone: ['hook-first', 'energetic', 'fast-paced'],
    },
    image: {
      aspectRatios: ['9:16'],
    },
    video: {
      aspectRatios: ['9:16'],
      maxDurationSec: 60,
      recommendedDurationSec: 6,
      requiresHook: true,
    },
    audio: {
      voiceover: true,
      maxDurationSec: 10,
      style: ['energetic', 'punchy'],
    },
  },

  youtube: {
    text: {
      titleMax: 100,
      descriptionMax: 5000,
      tone: ['informative', 'search-optimized'],
    },
    image: {
      aspectRatios: ['16:9'],
      recommended: '16:9',
    },
    video: {
      aspectRatios: ['16:9', '9:16'],
      maxDurationSec: 600,
      recommendedShortSec: 15,
    },
    audio: {
      voiceover: true,
      maxDurationSec: 30,
    },
  },

  google_business: {
    text: {
      maxLength: 1500,
      recommendedLength: 150,
      hashtags: { allowed: false },
      tone: ['professional', 'clear', 'informational'],
    },
    image: {
      aspectRatios: ['4:3', '16:9'],
    },
    video: {
      aspectRatios: ['16:9'],
      maxDurationSec: 30,
    },
    audio: {
      voiceover: false,
    },
  },

  linkedin: {
    text: {
      maxLength: 3000,
      recommendedLength: 200,
      hashtags: { allowed: true, max: 5 },
      tone: ['professional', 'insightful', 'value-driven'],
    },
    image: {
      aspectRatios: ['1.91:1', '1:1'],
    },
    video: {
      aspectRatios: ['1:1', '16:9'],
      maxDurationSec: 300,
    },
    audio: {
      voiceover: true,
      tone: ['professional', 'clear'],
    },
  },
};

export function getRules(platform: Platform): PlatformRules {
  return PLATFORM_RULES[platform];
}

export function enforceTextLength(text: string, rules: TextRules): string {
  const max = rules.maxLength ?? rules.descriptionMax ?? 5000;
  if (text.length <= max) return text;
  return text.slice(0, max - 3) + '…';
}

export function enforceHashtagLimit(
  tags: string[],
  rules: TextRules,
): string[] {
  if (!rules.hashtags?.allowed) return [];
  const max = rules.hashtags.max ?? 30;
  return tags.slice(0, max);
}
