/**
 * Music Industry Training Data Module
 * Comprehensive domain knowledge for training Max Booster AI models
 * Covers genres, social media patterns, advertising strategies, and artist personas
 */

export const MUSIC_GENRE_TAXONOMY = {
  primary: [
    'rock', 'pop', 'hip-hop', 'electronic', 'r&b', 'country', 'jazz', 
    'classical', 'indie', 'folk', 'metal', 'punk', 'reggae', 'latin'
  ],
  subgenres: {
    'hip-hop': ['trap', 'boom-bap', 'drill', 'conscious', 'mumble', 'cloud-rap', 'emo-rap', 'old-school'],
    'electronic': ['house', 'techno', 'dubstep', 'trance', 'ambient', 'drum-and-bass', 'edm', 'synthwave', 'lo-fi'],
    'rock': ['alternative', 'indie-rock', 'hard-rock', 'progressive', 'grunge', 'punk-rock', 'post-rock'],
    'pop': ['synth-pop', 'dance-pop', 'electropop', 'indie-pop', 'art-pop', 'k-pop', 'j-pop'],
    'r&b': ['neo-soul', 'contemporary-r&b', 'alternative-r&b', 'quiet-storm', 'new-jack-swing'],
    'metal': ['heavy-metal', 'thrash', 'death-metal', 'black-metal', 'nu-metal', 'metalcore', 'djent'],
    'jazz': ['bebop', 'fusion', 'smooth-jazz', 'free-jazz', 'swing', 'nu-jazz'],
    'country': ['outlaw', 'country-pop', 'bluegrass', 'americana', 'bro-country', 'alt-country'],
  },
  audioFeatures: {
    'hip-hop': { bpmRange: [80, 110], bassHeavy: true, rhythmFocus: true, vocalPresence: 'high' },
    'electronic': { bpmRange: [120, 150], bassHeavy: true, rhythmFocus: true, vocalPresence: 'variable' },
    'rock': { bpmRange: [100, 140], bassHeavy: false, rhythmFocus: true, vocalPresence: 'high' },
    'pop': { bpmRange: [100, 130], bassHeavy: false, rhythmFocus: true, vocalPresence: 'high' },
    'r&b': { bpmRange: [70, 110], bassHeavy: true, rhythmFocus: true, vocalPresence: 'high' },
    'jazz': { bpmRange: [80, 200], bassHeavy: false, rhythmFocus: false, vocalPresence: 'variable' },
    'classical': { bpmRange: [40, 180], bassHeavy: false, rhythmFocus: false, vocalPresence: 'low' },
    'metal': { bpmRange: [100, 220], bassHeavy: true, rhythmFocus: true, vocalPresence: 'high' },
  }
} as const;

export const SOCIAL_MEDIA_MUSIC_PATTERNS = {
  platformOptimalTimes: {
    twitter: { 
      peakHours: [9, 12, 17, 20], 
      peakDays: ['tuesday', 'wednesday', 'thursday'],
      musicSpecific: { newReleaseTime: 'friday-midnight', engagementPeak: 'evening' }
    },
    instagram: { 
      peakHours: [11, 14, 19, 21], 
      peakDays: ['monday', 'wednesday', 'friday'],
      musicSpecific: { reelsOptimal: [18, 21], storiesOptimal: [8, 12, 20] }
    },
    tiktok: { 
      peakHours: [7, 10, 15, 19, 22], 
      peakDays: ['tuesday', 'thursday', 'friday'],
      musicSpecific: { trendingWindow: '24-48hrs', viralThreshold: 10000 }
    },
    youtube: { 
      peakHours: [12, 16, 20], 
      peakDays: ['thursday', 'friday', 'saturday'],
      musicSpecific: { premiereOptimal: 'friday-9am', shortsOptimal: [14, 19] }
    },
    facebook: { 
      peakHours: [9, 13, 16, 19], 
      peakDays: ['wednesday', 'thursday', 'friday'],
      musicSpecific: { eventPromotion: 'thursday-evening', livePerformance: 'weekend' }
    },
    linkedin: { 
      peakHours: [8, 10, 12, 17], 
      peakDays: ['tuesday', 'wednesday', 'thursday'],
      musicSpecific: { industryNews: 'weekday-morning', careerUpdates: 'midweek' }
    },
  },
  contentTypes: {
    behindTheScenes: { engagementMultiplier: 1.8, bestPlatforms: ['instagram', 'tiktok', 'youtube'] },
    newRelease: { engagementMultiplier: 2.5, bestPlatforms: ['twitter', 'instagram', 'youtube'] },
    livePerformance: { engagementMultiplier: 2.2, bestPlatforms: ['instagram', 'facebook', 'youtube'] },
    studioSession: { engagementMultiplier: 1.6, bestPlatforms: ['instagram', 'tiktok'] },
    fanInteraction: { engagementMultiplier: 2.0, bestPlatforms: ['twitter', 'tiktok'] },
    musicVideo: { engagementMultiplier: 3.0, bestPlatforms: ['youtube', 'instagram', 'tiktok'] },
    tourAnnouncement: { engagementMultiplier: 2.8, bestPlatforms: ['twitter', 'instagram', 'facebook'] },
    collaboration: { engagementMultiplier: 2.4, bestPlatforms: ['all'] },
  },
  hashtagStrategies: {
    'hip-hop': ['#hiphop', '#rap', '#newmusic', '#trapmusic', '#hiphopculture', '#rapper', '#beats'],
    'electronic': ['#edm', '#electronicmusic', '#dj', '#producer', '#rave', '#techno', '#house'],
    'rock': ['#rock', '#rockmusic', '#livemusic', '#guitar', '#rockband', '#alternative'],
    'pop': ['#pop', '#popmusic', '#newpop', '#popsinger', '#hitmusic', '#mainstream'],
    'r&b': ['#rnb', '#rnbmusic', '#soulsinger', '#rnbartist', '#newrnb', '#contemporaryrnb'],
    'indie': ['#indiemusic', '#indieartist', '#indieband', '#underground', '#independentartist'],
    general: ['#music', '#newmusic', '#artist', '#singer', '#musician', '#spotify', '#streaming'],
  },
  viralFactors: {
    hooks: { importance: 0.95, optimalLength: '0-3 seconds' },
    audioQuality: { importance: 0.85, minimumBitrate: 320 },
    visualQuality: { importance: 0.90, minimumResolution: 1080 },
    captionEngagement: { importance: 0.75, optimalLength: '100-150 chars' },
    trendParticipation: { importance: 0.88, responseWindow: '24 hours' },
    duetability: { importance: 0.80, bestFormats: ['challenge', 'reaction', 'cover'] },
  }
} as const;

export const MUSIC_ADVERTISING_INTELLIGENCE = {
  campaignObjectives: {
    streaming: {
      platforms: ['spotify', 'apple_music', 'youtube_music', 'amazon_music'],
      kpis: ['streams', 'saves', 'playlist_adds', 'monthly_listeners'],
      avgCPC: { low: 0.15, medium: 0.35, high: 0.75 },
      avgCPM: { low: 3.50, medium: 8.00, high: 15.00 },
      conversionRate: { low: 0.02, medium: 0.05, high: 0.12 }
    },
    engagement: {
      platforms: ['instagram', 'tiktok', 'twitter', 'facebook'],
      kpis: ['likes', 'comments', 'shares', 'follows'],
      avgCPC: { low: 0.08, medium: 0.25, high: 0.50 },
      avgCPM: { low: 2.00, medium: 5.00, high: 12.00 },
      conversionRate: { low: 0.03, medium: 0.08, high: 0.15 }
    },
    awareness: {
      platforms: ['youtube', 'spotify', 'pandora', 'iheartradio'],
      kpis: ['impressions', 'reach', 'video_views', 'brand_recall'],
      avgCPC: { low: 0.05, medium: 0.15, high: 0.35 },
      avgCPM: { low: 1.50, medium: 4.00, high: 10.00 },
      conversionRate: { low: 0.01, medium: 0.03, high: 0.07 }
    },
    ticketSales: {
      platforms: ['facebook', 'instagram', 'google', 'ticketing_partners'],
      kpis: ['ticket_purchases', 'rsvps', 'event_responses'],
      avgCPC: { low: 0.50, medium: 1.25, high: 3.00 },
      avgCPM: { low: 8.00, medium: 15.00, high: 35.00 },
      conversionRate: { low: 0.005, medium: 0.02, high: 0.05 }
    },
    merchSales: {
      platforms: ['instagram', 'facebook', 'google', 'youtube'],
      kpis: ['purchases', 'add_to_cart', 'revenue'],
      avgCPC: { low: 0.40, medium: 1.00, high: 2.50 },
      avgCPM: { low: 6.00, medium: 12.00, high: 28.00 },
      conversionRate: { low: 0.008, medium: 0.025, high: 0.06 }
    }
  },
  audienceSegments: {
    coreFans: {
      characteristics: ['high engagement', 'multiple platform follows', 'email subscribers'],
      targetingWeight: 1.0,
      expectedROI: 3.5,
      retargetingPriority: 'highest'
    },
    casualListeners: {
      characteristics: ['spotify follows', 'occasional engagement', 'algorithmic discovery'],
      targetingWeight: 0.7,
      expectedROI: 2.2,
      retargetingPriority: 'medium'
    },
    genreEnthusiasts: {
      characteristics: ['genre playlist followers', 'similar artist fans', 'festival goers'],
      targetingWeight: 0.8,
      expectedROI: 2.8,
      retargetingPriority: 'high'
    },
    localScene: {
      characteristics: ['geo-targeted', 'local venue followers', 'regional interest'],
      targetingWeight: 0.9,
      expectedROI: 3.0,
      retargetingPriority: 'high'
    },
    lookalikes: {
      characteristics: ['similar demographics', 'interest overlap', 'behavioral match'],
      targetingWeight: 0.6,
      expectedROI: 1.8,
      retargetingPriority: 'low'
    }
  },
  budgetAllocation: {
    newRelease: {
      preLaunch: 0.25, // 25% of budget
      launchWeek: 0.45, // 45% of budget
      sustain: 0.20, // 20% of budget
      retargeting: 0.10 // 10% of budget
    },
    tourPromotion: {
      announcement: 0.20,
      onSale: 0.35,
      lastChance: 0.30,
      dayOf: 0.15
    },
    generalGrowth: {
      awareness: 0.30,
      engagement: 0.40,
      conversion: 0.30
    }
  },
  creativePerformance: {
    video: { avgCTR: 0.045, avgCVR: 0.028, engagementRate: 0.065 },
    image: { avgCTR: 0.032, avgCVR: 0.022, engagementRate: 0.048 },
    carousel: { avgCTR: 0.038, avgCVR: 0.025, engagementRate: 0.055 },
    audio: { avgCTR: 0.028, avgCVR: 0.018, engagementRate: 0.035 },
    text: { avgCTR: 0.018, avgCVR: 0.012, engagementRate: 0.022 }
  }
} as const;

export const ARTIST_PERSONA_PROFILES = {
  archetypes: {
    authenticStoryteller: {
      traits: ['genuine', 'vulnerable', 'narrative-driven', 'personal'],
      contentStyle: ['behind-the-scenes', 'songwriting-process', 'personal-stories'],
      brandVoice: { tone: 'casual', emojiUsage: 'moderate', formality: 'low' },
      idealPlatforms: ['instagram', 'youtube', 'twitter'],
      engagementPattern: 'consistent, personal responses',
      hashtagStyle: 'minimal, authentic',
      postingFrequency: { daily: 1, weekly: 5 }
    },
    mysteriousArtist: {
      traits: ['enigmatic', 'visual-focused', 'cryptic', 'artistic'],
      contentStyle: ['artistic-visuals', 'cryptic-teasers', 'minimal-text'],
      brandVoice: { tone: 'formal', emojiUsage: 'none', formality: 'high' },
      idealPlatforms: ['instagram', 'youtube'],
      engagementPattern: 'rare, significant',
      hashtagStyle: 'branded, minimal',
      postingFrequency: { daily: 0.5, weekly: 3 }
    },
    communityBuilder: {
      traits: ['interactive', 'fan-focused', 'grateful', 'accessible'],
      contentStyle: ['fan-shoutouts', 'q&a', 'polls', 'fan-content-shares'],
      brandVoice: { tone: 'casual', emojiUsage: 'heavy', formality: 'low' },
      idealPlatforms: ['twitter', 'tiktok', 'instagram'],
      engagementPattern: 'frequent, enthusiastic',
      hashtagStyle: 'community-focused, abundant',
      postingFrequency: { daily: 3, weekly: 20 }
    },
    industryProfessional: {
      traits: ['polished', 'business-savvy', 'collaborative', 'networked'],
      contentStyle: ['collaborations', 'industry-insights', 'professional-updates'],
      brandVoice: { tone: 'mixed', emojiUsage: 'light', formality: 'medium' },
      idealPlatforms: ['linkedin', 'twitter', 'instagram'],
      engagementPattern: 'strategic, professional',
      hashtagStyle: 'industry-relevant, moderate',
      postingFrequency: { daily: 2, weekly: 12 }
    },
    entertainmentPersonality: {
      traits: ['humorous', 'entertaining', 'viral-focused', 'trend-aware'],
      contentStyle: ['trends', 'memes', 'challenges', 'entertainment'],
      brandVoice: { tone: 'casual', emojiUsage: 'heavy', formality: 'low' },
      idealPlatforms: ['tiktok', 'twitter', 'instagram'],
      engagementPattern: 'high-frequency, witty',
      hashtagStyle: 'trending, abundant',
      postingFrequency: { daily: 5, weekly: 30 }
    }
  },
  voiceMetrics: {
    sentenceLength: { formal: 25, casual: 12, mixed: 18 },
    emojiDensity: { none: 0, light: 0.5, moderate: 1.5, heavy: 3 },
    hashtagDensity: { minimal: 2, moderate: 5, abundant: 10 },
    responseTime: { immediate: '1hr', responsive: '4hr', selective: '24hr' },
    personalPronoun: { first: 'I', collective: 'we', brand: 'artistName' }
  }
} as const;

export const STREAMING_PLATFORM_BENCHMARKS = {
  spotify: {
    avgSaveRate: 0.08,
    avgPlaylistAddRate: 0.03,
    avgSkipRate: 0.25,
    avgCompletionRate: 0.65,
    discoveryAlgorithmFactors: ['saves', 'playlist_adds', 'completion_rate', 'repeat_listens'],
    editorialPlaylistCriteria: ['unique_streams', 'save_rate', 'listener_geography', 'momentum']
  },
  appleMusic: {
    avgSaveRate: 0.10,
    avgPlaylistAddRate: 0.04,
    avgSkipRate: 0.22,
    avgCompletionRate: 0.70,
    discoveryAlgorithmFactors: ['library_adds', 'shares', 'completion_rate'],
    editorialPlaylistCriteria: ['sound_quality', 'artistic_merit', 'listener_engagement']
  },
  youtubeMusic: {
    avgSaveRate: 0.06,
    avgPlaylistAddRate: 0.05,
    avgSkipRate: 0.30,
    avgCompletionRate: 0.55,
    discoveryAlgorithmFactors: ['watch_time', 'likes', 'shares', 'comments'],
    editorialPlaylistCriteria: ['video_quality', 'engagement_metrics', 'channel_subscribers']
  },
  tidal: {
    avgSaveRate: 0.12,
    avgPlaylistAddRate: 0.05,
    avgSkipRate: 0.18,
    avgCompletionRate: 0.75,
    discoveryAlgorithmFactors: ['saves', 'playlist_adds', 'audio_quality_preference'],
    editorialPlaylistCriteria: ['audio_quality', 'artistic_credibility', 'exclusivity']
  }
} as const;

export const ENGAGEMENT_PREDICTION_FEATURES = {
  contentFactors: {
    postLength: { optimal: { min: 80, max: 150 }, weight: 0.15 },
    hashtagCount: { optimal: { min: 3, max: 7 }, weight: 0.12 },
    emojiCount: { optimal: { min: 1, max: 3 }, weight: 0.08 },
    mentionCount: { optimal: { min: 0, max: 2 }, weight: 0.06 },
    mediaPresence: { importance: 0.25, videoMultiplier: 1.8, imageMultiplier: 1.4 },
    callToAction: { importance: 0.20, types: ['link', 'comment', 'share', 'tag'] }
  },
  temporalFactors: {
    hourOfDay: { weight: 0.18, peakHours: [9, 12, 17, 20] },
    dayOfWeek: { weight: 0.12, peakDays: [2, 3, 4] },
    seasonality: { weight: 0.05, musicPeaks: ['summer', 'holidays'] },
    releaseProximity: { weight: 0.22, decayRate: 0.85 }
  },
  audienceFactors: {
    followerCount: { weight: 0.15, logScale: true },
    historicalEngagement: { weight: 0.25, lookbackDays: 30 },
    accountAge: { weight: 0.05, maturityThreshold: 365 },
    postingFrequency: { weight: 0.08, optimalDaily: 2 }
  },
  musicSpecificFactors: {
    newRelease: { multiplier: 2.5, decayDays: 14 },
    tourAnnouncement: { multiplier: 2.2, decayDays: 7 },
    collaboration: { multiplier: 1.8, crossPromotion: true },
    behindTheScenes: { multiplier: 1.6, authenticityBonus: true },
    livePerformance: { multiplier: 2.0, urgencyFactor: true }
  }
} as const;

export const CHURN_PREDICTION_SIGNALS = {
  engagementDecline: {
    threshold: 0.30,
    lookbackPeriod: 30,
    weight: 0.35,
    indicators: ['reduced_likes', 'fewer_comments', 'no_shares']
  },
  contentQuality: {
    threshold: 0.40,
    lookbackPeriod: 14,
    weight: 0.20,
    indicators: ['low_video_quality', 'inconsistent_posting', 'off-brand_content']
  },
  competitorActivity: {
    threshold: 0.50,
    lookbackPeriod: 7,
    weight: 0.15,
    indicators: ['similar_artist_releases', 'genre_saturation', 'trending_competition']
  },
  platformHealth: {
    threshold: 0.25,
    lookbackPeriod: 60,
    weight: 0.20,
    indicators: ['algorithm_changes', 'reach_decline', 'engagement_rate_drop']
  },
  fanSentiment: {
    threshold: 0.35,
    lookbackPeriod: 30,
    weight: 0.10,
    indicators: ['negative_comments', 'unfollows', 'criticism']
  }
} as const;

export const TIME_SERIES_PATTERNS = {
  releaseWeekCycle: {
    day0: 1.0, day1: 0.85, day2: 0.70, day3: 0.60,
    day4: 0.52, day5: 0.45, day6: 0.40, day7: 0.35
  },
  weeklyPattern: {
    monday: 0.85, tuesday: 0.95, wednesday: 1.0, thursday: 0.98,
    friday: 1.05, saturday: 0.75, sunday: 0.70
  },
  seasonalPattern: {
    january: 0.85, february: 0.88, march: 0.92, april: 0.95,
    may: 1.0, june: 1.05, july: 1.10, august: 1.08,
    september: 0.95, october: 0.92, november: 0.98, december: 1.15
  },
  holidayMultipliers: {
    newYear: 1.3, valentines: 1.2, summer: 1.15,
    halloween: 1.1, thanksgiving: 0.9, christmas: 1.25
  }
} as const;

export function getGenreAudioProfile(genre: string): typeof MUSIC_GENRE_TAXONOMY.audioFeatures[keyof typeof MUSIC_GENRE_TAXONOMY.audioFeatures] | null {
  const normalizedGenre = genre.toLowerCase().replace(/[\s-]/g, '-');
  return MUSIC_GENRE_TAXONOMY.audioFeatures[normalizedGenre as keyof typeof MUSIC_GENRE_TAXONOMY.audioFeatures] || null;
}

export function getPlatformOptimalTimes(platform: string): { peakHours: number[]; peakDays: string[] } | null {
  const normalizedPlatform = platform.toLowerCase();
  const config = SOCIAL_MEDIA_MUSIC_PATTERNS.platformOptimalTimes[normalizedPlatform as keyof typeof SOCIAL_MEDIA_MUSIC_PATTERNS.platformOptimalTimes];
  return config ? { peakHours: config.peakHours, peakDays: config.peakDays } : null;
}

export function getAudienceSegmentWeight(segment: string): number {
  const normalizedSegment = segment.toLowerCase().replace(/[\s-]/g, '');
  const segments = MUSIC_ADVERTISING_INTELLIGENCE.audienceSegments;
  for (const [key, value] of Object.entries(segments)) {
    if (key.toLowerCase().replace(/[\s-]/g, '') === normalizedSegment) {
      return value.targetingWeight;
    }
  }
  return 0.5;
}

export function getArtistPersonaProfile(archetype: string): typeof ARTIST_PERSONA_PROFILES.archetypes[keyof typeof ARTIST_PERSONA_PROFILES.archetypes] | null {
  const normalizedArchetype = archetype.toLowerCase().replace(/[\s-]/g, '');
  for (const [key, profile] of Object.entries(ARTIST_PERSONA_PROFILES.archetypes)) {
    if (key.toLowerCase() === normalizedArchetype) {
      return profile;
    }
  }
  return null;
}

export function calculateSeasonalMultiplier(date: Date): number {
  const month = date.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  return TIME_SERIES_PATTERNS.seasonalPattern[month as keyof typeof TIME_SERIES_PATTERNS.seasonalPattern] || 1.0;
}

export function calculateWeekdayMultiplier(date: Date): number {
  const day = date.toLocaleString('en-US', { weekday: 'long' }).toLowerCase();
  return TIME_SERIES_PATTERNS.weeklyPattern[day as keyof typeof TIME_SERIES_PATTERNS.weeklyPattern] || 1.0;
}

export function getHashtagsForGenre(genre: string): string[] {
  const normalizedGenre = genre.toLowerCase().replace(/[\s-]/g, '-');
  const genreHashtags = SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies[normalizedGenre as keyof typeof SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies] || [];
  const generalHashtags = SOCIAL_MEDIA_MUSIC_PATTERNS.hashtagStrategies.general;
  return [...genreHashtags, ...generalHashtags.slice(0, 3)];
}

export function getContentTypeMultiplier(contentType: string): number {
  const normalizedType = contentType.toLowerCase().replace(/[\s-]/g, '');
  const types = SOCIAL_MEDIA_MUSIC_PATTERNS.contentTypes;
  for (const [key, value] of Object.entries(types)) {
    if (key.toLowerCase().replace(/[\s-]/g, '') === normalizedType) {
      return value.engagementMultiplier;
    }
  }
  return 1.0;
}

export function getCampaignBenchmarks(objective: string): typeof MUSIC_ADVERTISING_INTELLIGENCE.campaignObjectives[keyof typeof MUSIC_ADVERTISING_INTELLIGENCE.campaignObjectives] | null {
  const normalizedObjective = objective.toLowerCase().replace(/[\s-]/g, '');
  const objectives = MUSIC_ADVERTISING_INTELLIGENCE.campaignObjectives;
  for (const [key, value] of Object.entries(objectives)) {
    if (key.toLowerCase() === normalizedObjective) {
      return value;
    }
  }
  return null;
}
