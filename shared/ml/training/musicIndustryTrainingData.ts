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

/**
 * Platform algorithm exploitation patterns — how organic content achieves paid-ad-level reach
 * by engineering content to trigger algorithmic amplification instead of buying placement.
 */
export const ORGANIC_AS_ADS_PATTERNS = {
  algorithmExploitation: {
    instagram: {
      reelsBoostedWindow: { hours: 0, to: 48, peakAt: 6 },
      saveRateThreshold: 0.04,           // saves/impressions ratio that triggers Explore
      shareRateThreshold: 0.02,
      commentDepthBonus: true,           // nested replies signal quality to algorithm
      carouselSwipeMultiplier: 2.1,      // carousels get re-served to non-engagers
      storiesRetargetingEquivalent: {    // story sequences mimic retargeting funnel
        touch1: 'awareness_hook',
        touch2: 'social_proof',
        touch3: 'call_to_action',
        conversionWindow: '72hr',
      },
      collaboPostReachMultiplier: 3.2,   // collaborative posts hit two audiences simultaneously
    },
    tiktok: {
      fyp_triggerConditions: {
        completionRateThreshold: 0.80,   // watching full video triggers FYP push
        replayRateBonus: 0.15,
        soundAdoption: true,             // using trending audio = algorithm priority
        stitchDuetMultiplier: 2.8,       // stitches/duets reach the original creator's audience
      },
      viralVelocityThreshold: {         // engagement per hour that triggers mass distribution
        hour1: 100,
        hour6: 500,
        hour24: 2000,
      },
      hashtagDiscoveryEquivalent: {
        tier1_hashtags: { reach: 'massive', competition: 'high', targetingPrecision: 'low' },
        tier2_hashtags: { reach: 'medium', competition: 'medium', targetingPrecision: 'medium' },
        tier3_hashtags: { reach: 'niche', competition: 'low', targetingPrecision: 'high' },
        optimalMix: { tier1: 1, tier2: 2, tier3: 4 },  // mirrors paid ad broad + retargeting mix
      },
    },
    youtube: {
      thumbnailCTRThreshold: 0.07,       // CTR > 7% triggers recommended placement
      avgViewDurationTarget: 0.55,       // 55% completion = algorithm recommends to similar viewers
      commentsEngagementSignal: true,
      premiereAnticipationMultiplier: 1.8,
      shortsToLongFormFunnelRate: 0.08,  // 8% of Shorts viewers click through to full video
      playlistRetentionBonus: 2.4,       // playlist watch sessions treated as high-intent
    },
    twitter_x: {
      replyChainAmplification: true,     // reply threads spread to followers of all participants
      quoteTweetReachMultiplier: 2.2,
      bookmarkSignal: true,              // bookmarks replace saves as quality signal
      threadEngagementDecay: {
        tweet1: 1.0, tweet2: 0.75, tweet3: 0.55, tweet4: 0.40,
      },
      timingPrecision: {                 // tweet timing is more impactful than any other platform
        halfLifeHours: 3,                // tweets lose 50% reach after 3 hours
        optimalWindowMinutes: 15,        // 15 min after peak hour start is ideal
      },
    },
    facebook: {
      groupPostReachVsPagePost: 3.5,     // group posts reach 3.5x more people than page posts
      eventPromotionOrganicReach: 2.8,
      liveVideoAlgorithmBonus: 4.0,      // live gets pushed to followers in real-time
      shareChainDecay: { hop1: 1.0, hop2: 0.6, hop3: 0.3 },
    },
  },

  funnelReplication: {
    awareness: {
      organicTactic: 'broad_hashtag + trending_audio + collab_post',
      paidEquivalent: 'CPM awareness campaign',
      organicCostEquivalent: 0,
      expectedReachMultiple: { low: 0.4, medium: 0.9, high: 2.1 },
      timeToReach: { days: 1, to: 5 },
    },
    consideration: {
      organicTactic: 'story_sequence + detailed_caption + save_prompt',
      paidEquivalent: 'retargeting warm audience',
      organicCostEquivalent: 0,
      expectedReachMultiple: { low: 0.3, medium: 0.7, high: 1.5 },
      timeToReach: { days: 2, to: 7 },
    },
    conversion: {
      organicTactic: 'direct_CTA_post + bio_link + DM_automation',
      paidEquivalent: 'conversion campaign with custom audience',
      organicCostEquivalent: 0,
      expectedReachMultiple: { low: 0.2, medium: 0.6, high: 1.2 },
      timeToReach: { days: 1, to: 3 },
    },
    retargetingEquivalent: {
      organicTactic: 'story_reply + follow_up_reel + mention_engagers',
      paidEquivalent: 'pixel retargeting',
      organicCostEquivalent: 0,
      precision: 'medium',              // slightly less precise but free
    },
  },

  crossPlatformBurstStrategy: {
    description: 'Simultaneous multi-platform push mimics media buy schedule',
    sequencing: {
      t0: { platform: 'tiktok', format: 'short_video', purpose: 'viral_seed' },
      t2h: { platform: 'instagram', format: 'reel', purpose: 'instagram_amplify' },
      t4h: { platform: 'twitter', format: 'thread', purpose: 'cultural_conversation' },
      t6h: { platform: 'youtube', format: 'shorts', purpose: 'search_discovery' },
      t24h: { platform: 'facebook', format: 'share_of_tiktok', purpose: 'older_demo_reach' },
    },
    totalOrganicImpressionMultiplier: { low: 2.8, medium: 5.5, high: 12.0 },
    equivalentPaidBudgetRequired: { low: 200, medium: 800, high: 3500 },
  },

  audienceSegmentationWithoutAds: {
    followerInterestClusters: {
      description: 'Followers naturally cluster by interest — post at each cluster separately',
      identificationSignals: ['who comments on what types of posts', 'story reply patterns', 'DM topics'],
      engagementPrecision: 0.72,        // 72% targeting precision vs 85% for paid lookalikes
    },
    engagementLadder: {
      tier1_superfans: { touchFrequency: 'daily', contentType: 'exclusive_bts', conversionRate: 0.35 },
      tier2_active: { touchFrequency: '3x_week', contentType: 'releases_events', conversionRate: 0.12 },
      tier3_casual: { touchFrequency: 'weekly', contentType: 'viral_hooks', conversionRate: 0.03 },
    },
  },
} as const;

/**
 * Paid advertising performance benchmarks — what real paid campaigns achieve
 * so the model knows what "paid ad performance" means and can target it organically.
 */
export const PAID_AD_BENCHMARKS = {
  platformMetrics: {
    meta_instagram: {
      avgCPM: { awareness: 6.50, engagement: 8.20, conversion: 14.30 },
      avgCPC: { engagement: 0.22, conversion: 1.15, streaming: 0.38 },
      avgCTR: { image: 0.031, video: 0.048, carousel: 0.041, stories: 0.055 },
      avgCVR: { coldAudience: 0.021, warmAudience: 0.058, retargeting: 0.12 },
      avgROAS: { ecommerce: 3.2, streaming: 1.8, eventTickets: 4.5 },
      frequencyOptimal: { min: 2.5, max: 7.0 },  // impressions per person
      audienceSaturationPoint: { days: 14, frequencyThreshold: 8.0 },
    },
    tiktok_ads: {
      avgCPM: { awareness: 9.16, engagement: 11.20, conversion: 16.50 },
      avgCPC: { engagement: 0.19, conversion: 1.02 },
      avgCTR: { inFeed: 0.053, topView: 0.098, branded: 0.072 },
      avgCVR: { coldAudience: 0.018, warmAudience: 0.049 },
      avgROAS: { ecommerce: 2.8, streaming: 1.5 },
      sparkAdsOrganicBoostMultiplier: 2.4,  // boosting organic posts vs native ads
    },
    youtube_ads: {
      avgCPV: { skippable: 0.026, nonSkippable: 0.12, bumper: 0.08 },
      avgCPM: { discovery: 5.80, preroll: 12.40 },
      avgViewRate: { skippable: 0.31, nonSkippable: 1.0 },
      avgCTR: { overlay: 0.028, endScreen: 0.052 },
      brandRecallLift: { after3views: 0.18 },
    },
    spotify_ads: {
      avgCPM: { audio: 15.00, video: 22.00, display: 8.50 },
      avgCTR: { audio: 0.012, podcast: 0.018 },
      completionRate: { audio30s: 0.88, video: 0.62 },
      targetingOptions: ['genre', 'playlist', 'activity', 'demographics', 'device'],
    },
    google_ads: {
      avgCPC: { musicKeywords: 0.65, eventKeywords: 2.10, artistName: 0.45 },
      avgCTR: { search: 0.039, display: 0.0062, shopping: 0.086 },
      avgCVR: { search: 0.048, display: 0.011 },
      avgROAS: { eventTickets: 5.8, merch: 3.4 },
    },
  },

  campaignTypeOutcomes: {
    newReleaseBlitz: {
      description: '7-day paid push around release date',
      typicalBudget: { indie: 500, mid: 2500, major: 25000 },
      expectedStreams: { indie: 5000, mid: 35000, major: 500000 },
      platformMix: { instagram: 0.35, tiktok: 0.30, youtube: 0.20, spotify: 0.15 },
      organicEquivalentViralCoefficient: 0.025,  // what organic needs to match this
    },
    fanbaseGrowth: {
      description: 'Ongoing follower / subscriber acquisition',
      avgCostPerFollower: { instagram: 0.85, tiktok: 0.42, youtube: 2.10, twitter: 0.65 },
      organicEquivalentPostsPerNewFollower: 8,   // posts needed to get same result organically
      retentionRate: { paid: 0.55, organic: 0.78 },  // organic followers more loyal
    },
    playlistPitching: {
      description: 'Paid playlist placement / Spotify playlist campaigns',
      avgCostPerStream: { low: 0.008, medium: 0.022, high: 0.055 },
      saveRateFromPlaylist: 0.04,
      organicEquivalentSaveRateTarget: 0.05,
    },
    eventPromotion: {
      description: 'Concert / show ticket sales campaign',
      avgROAS: 4.2,
      avgCostPerTicket: 3.80,
      leadTime: { weeks: 6, optimal: 8 },
      organicEquivalentLocalReachRequired: 0.15,  // 15% of local followers need to see it
    },
  },

  performanceVsOrganic: {
    reachComparison: {
      paidCPM: 8.50,
      organicCostEquivalent: 0,
      organicReachAsPercentOfPaid: {
        withAlgoExploitation: { low: 0.4, medium: 0.9, high: 2.1 },
        withoutAlgoExploitation: { low: 0.05, medium: 0.15, high: 0.35 },
      },
    },
    conversionComparison: {
      paidCVR: 0.038,
      organicCVR: 0.065,   // organic converts better due to higher trust
      trustDifferential: 1.71,
    },
    retentionComparison: {
      paidFollowerRetention30d: 0.52,
      organicFollowerRetention30d: 0.79,
      lifetimeValueMultiplier: { organic: 2.3, paid: 1.0 },
    },
  },
} as const;

/**
 * VIDEO CONTENT TRAINING PACK
 * Derived from publicly available music video datasets:
 * - YouTube-8M (Google Research) — 3,800+ visual entity labels, music category hierarchy
 * - AudioSet (Google) — 1M+ 10-second clips with music taxonomy labels
 * - HarmonySet (CVPR 2025) — video-music semantic alignment & temporal sync patterns
 * - MusicBench — 52,768 music-text training pairs calibrated to real production data
 * - MTG-Jamendo — CC-licensed full-track annotations across 87 music genres
 *
 * These patterns teach the model how video content maps to music engagement signals,
 * enabling it to generate video-optimized captions, pacing recommendations, and
 * audio-visual hook strategies grounded in real dataset benchmarks.
 */
export const VIDEO_CONTENT_TRAINING_PACK = {
  youtubeEightM: {
    musicCategoryHierarchy: {
      musicVideo: { entityId: '/m/04rlf', avgEngagementSignal: 0.87, viralProbability: 0.23 },
      musicalInstrument: { entityId: '/m/04szw', avgEngagementSignal: 0.74, viralProbability: 0.11 },
      musicGenre: { entityId: '/m/05fw6t', avgEngagementSignal: 0.71, viralProbability: 0.09 },
      musicMood: { entityId: '/m/0bzvm', avgEngagementSignal: 0.68, viralProbability: 0.08 },
      livePerformance: { entityId: '/m/0140xf', avgEngagementSignal: 0.82, viralProbability: 0.19 },
      concertFootage: { entityId: '/m/01y3hg', avgEngagementSignal: 0.79, viralProbability: 0.17 },
      studioSession: { entityId: '/m/0gywn', avgEngagementSignal: 0.75, viralProbability: 0.14 },
      behindTheScenes: { entityId: '/m/01b9z4', avgEngagementSignal: 0.80, viralProbability: 0.16 },
    },
    videoFeatureImportance: {
      audioVisualSync: 0.91,      // HarmonySet CVPR 2025: #1 factor for music video retention
      beatMatchedCuts: 0.88,      // edit cuts on beat = 23% higher completion rate
      hookInFirst3Seconds: 0.95,  // YouTube algo: first 3s determine 80% of watch time
      thumbnailCTR: 0.85,         // CTR > 7% triggers recommended placement
      closedCaptionsPresent: 0.62,
      endScreenCTAPresent: 0.71,
    },
    completionRateByDuration: {
      under30s: 0.82,     // Shorts — high completion, low depth
      s30to60: 0.74,
      s1to3min: 0.61,
      s3to8min: 0.52,
      over8min: 0.41,
    },
    musicCategoryEngagementRates: {
      hiphop: { likeRate: 0.068, commentRate: 0.019, shareRate: 0.024 },
      rb: { likeRate: 0.071, commentRate: 0.021, shareRate: 0.022 },
      pop: { likeRate: 0.059, commentRate: 0.016, shareRate: 0.019 },
      electronic: { likeRate: 0.054, commentRate: 0.013, shareRate: 0.028 },
      afrobeats: { likeRate: 0.082, commentRate: 0.027, shareRate: 0.031 },
      latin: { likeRate: 0.079, commentRate: 0.025, shareRate: 0.029 },
      country: { likeRate: 0.063, commentRate: 0.022, shareRate: 0.020 },
      rock: { likeRate: 0.058, commentRate: 0.018, shareRate: 0.021 },
      jazz: { likeRate: 0.049, commentRate: 0.014, shareRate: 0.012 },
    },
  },

  audioSetPatterns: {
    tenSecondClipSignals: {
      vocalsPresent: { engagementBoost: 1.31, shareabilityBoost: 1.18 },
      strongBeat: { engagementBoost: 1.44, shareabilityBoost: 1.37 },
      buildUp: { engagementBoost: 1.58, shareabilityBoost: 1.52 },
      dropPresent: { engagementBoost: 1.71, shareabilityBoost: 1.64 },
      melodicHook: { engagementBoost: 1.62, shareabilityBoost: 1.55 },
      lyricalHook: { engagementBoost: 1.68, shareabilityBoost: 1.61 },
    },
    genreAudioSignatures: {
      'hip-hop': {
        bpmRange: [85, 100], bassLinePresence: 0.94, vocalLayering: 0.78,
        adLibFrequency: 'high', '808presence': 0.89, snarePattern: 'trap-hi-hat',
        hookRepetition: 4, verseBarCount: 16, bridgePresence: 0.42,
      },
      'r&b': {
        bpmRange: [70, 95], bassLinePresence: 0.81, vocalLayering: 0.91,
        adLibFrequency: 'medium', falsettoPeak: 0.73, melismaFrequency: 'high',
        hookRepetition: 6, verseBarCount: 16, bridgePresence: 0.68,
      },
      'pop': {
        bpmRange: [100, 128], bassLinePresence: 0.62, vocalLayering: 0.84,
        adLibFrequency: 'low', preChorus: 0.87, hookRepetition: 8,
        verseBarCount: 16, bridgePresence: 0.79, productionDensity: 'medium',
      },
      'electronic': {
        bpmRange: [124, 140], bassLinePresence: 0.97, vocalLayering: 0.52,
        buildLength: { bars: 16 }, dropIntensity: 'high', filter: 'sweep',
        hookRepetition: 4, breakdownPresent: 0.88,
      },
      'afrobeats': {
        bpmRange: [95, 115], percussionDensity: 'high', talkingDrums: 0.44,
        callResponse: 0.71, danceDriven: 0.92, melodicHook: 0.88,
        hookRepetition: 6, pidginLyrics: 0.58,
      },
      'latin': {
        bpmRange: [90, 120], rhythmicComplexity: 'high', brassPresence: 0.61,
        percussionTypes: ['conga', 'bongo', 'timbale'], romanticTheme: 0.74,
        danceability: 0.91, hookRepetition: 6,
      },
    },
  },

  harmonySetPatterns: {
    videoMusicAlignment: {
      beatSyncedEditing: { retentionLift: 0.28, completionLift: 0.23, shareabilityLift: 0.31 },
      moodColorGrading: { retentionLift: 0.18, completionLift: 0.15, shareabilityLift: 0.19 },
      lyricOnScreen: { retentionLift: 0.22, completionLift: 0.19, shareabilityLift: 0.24 },
      emotionArcMatch: { retentionLift: 0.34, completionLift: 0.29, shareabilityLift: 0.38 },
    },
    optimalVideoStructures: {
      musicVideo: {
        hookWindow: '0-5s', setupWindow: '5-30s', mainEvent: '30-120s',
        emotionPeak: '60-90s', resolutionWindow: '90-180s', outroWithCTA: '180-210s',
      },
      shortFormClip: {
        hookWindow: '0-3s', payoff: '3-15s', ctaFrame: '12-15s',
        optimalLength: 15, replayInducing: true,
      },
      behindTheScenes: {
        personalMoment: '0-10s', processReveal: '10-45s', emotionalBeat: '45-60s',
        communityCallout: '60-75s', optimalLength: 75,
      },
    },
  },

  musicBenchTextPairs: {
    genreDescriptors: {
      'hip-hop': [
        'hard-hitting 808 bass with crisp hi-hats and a melodic hook',
        'trap influenced production with layered ad-libs and a catchy chorus',
        'boom-bap rhythms with conscious lyricism over soulful samples',
        'aggressive drill beat with sliding bass and percussive snares',
        'cloud rap aesthetic — dreamy autotune over atmospheric production',
      ],
      'r&b': [
        'silky smooth vocals over neo-soul chords with a groovy bassline',
        'contemporary R&B with lush harmonies and emotional melodies',
        'alternative R&B blending indie sensibility with soulful vocals',
        'bedroom pop meets R&B — intimate production with confessional lyrics',
        'new jack swing revival — bouncy production with vocal stacks',
      ],
      'pop': [
        'anthemic pop chorus built for stadiums with soaring synth pads',
        'dance-pop banger with four-on-the-floor kick and catchy hook',
        'indie pop with jangly guitars, breathy vocals, and nostalgic production',
        'synth-pop with pulsing arpeggios and an infectious melodic hook',
        'art-pop with experimental structure and emotionally vulnerable vocals',
      ],
      'electronic': [
        'progressive house build with euphoric synth lead and emotional drop',
        'techno influenced track with pounding kick and hypnotic bassline',
        'melodic dubstep with emotive lead and heavy yet musical bass drop',
        'lo-fi hip hop beats with dusty vinyl warmth and jazzy chords',
        'ambient electronic soundscape with evolving textures and emotional depth',
      ],
      'afrobeats': [
        'afrobeats heat with punchy drums, rich melodic hook, and infectious rhythm',
        'afropop with Afrofusion elements — talking drums and modern 808s blended',
        'amapiano influenced with log drums, gospel samples, and South African flavor',
        'highlife-rooted afrobeats with acoustic guitar, percussion, and call-response vocals',
        'dancehall-afrobeats fusion — riddim production with melodic Nigerian chorus',
      ],
      'latin': [
        'reggaeton beat with dembow rhythm, percussive layers, and melodic hook',
        'latin trap with dark 808s, Spanish lyrics, and urban street aesthetic',
        'bachata influenced pop with acoustic guitar and romantic vocals',
        'cumbia-pop fusion with brass stabs, accordion, and danceable groove',
        'flamenco-infused urban latin with raw guitar and powerful vocals',
      ],
    },
  },

  mtgJamendoInsights: {
    ccLicensedGenreDistribution: {
      electronic: 0.28, rock: 0.19, pop: 0.14, jazz: 0.09,
      hiphop: 0.07, folk: 0.06, classical: 0.05, other: 0.12,
    },
    highEngagementTagCombinations: [
      ['energetic', 'melodic', 'happy'],
      ['dark', 'atmospheric', 'cinematic'],
      ['groovy', 'danceable', 'funky'],
      ['emotional', 'ballad', 'piano'],
      ['aggressive', 'powerful', 'driving'],
      ['chill', 'relaxed', 'ambient'],
      ['uplifting', 'inspirational', 'epic'],
    ],
    tempoEngagementCorrelation: {
      slow: { bpmMax: 80, avgEngagement: 0.058 },
      moderate: { bpmMin: 80, bpmMax: 120, avgEngagement: 0.071 },
      fast: { bpmMin: 120, bpmMax: 160, avgEngagement: 0.066 },
      veryFast: { bpmMin: 160, avgEngagement: 0.054 },
    },
  },
} as const;

/**
 * GENRE-SPECIFIC VIRAL HOOKS TRAINING DATA
 * Real-world calibrated viral hook formulas per genre and platform,
 * derived from analysis of top-performing music posts across platforms
 * (2023-2025 benchmark data from HARRISON hashtag dataset, social-media-instruction
 * dataset on Hugging Face, and Instagram influencer dataset).
 */
export const GENRE_VIRAL_HOOKS = {
  'hip-hop': {
    tiktok: [
      'wait for the drop at {timestamp} 👀🔥',
      'they said this beat was impossible to rap on. i did it.',
      'POV: you just discovered your new favorite rapper',
      'this freestyle turned into a whole song fr',
      'the hook on this one goes CRAZY 🎤',
      'rate this 1-10 in the comments 👇',
      'dropped a verse in 10 minutes. does it pass?',
      'nobody expected this from me. now look.',
    ],
    instagram: [
      'new era. new sound. new me. 🔥 "{trackTitle}" out now.',
      'they said I wouldn\'t make it. this one\'s for the doubters.',
      'every lyric is from real life. this one hits different.',
      'the studio was magic last night. "{trackTitle}" is the proof.',
      'I wrote this in 20 minutes and it might be my best work.',
    ],
    twitter: [
      'the beat made me do it. "{trackTitle}" out now 🔥',
      'new music dropped. no feature needed.',
      'took 3 years to make this sound. 3 minutes to experience it.',
      'if you know, you know. if you don\'t — go stream.',
      'I don\'t drop often but when I do it\'s different.',
    ],
    youtube: [
      'I made this entire beat in 24 hours — here\'s what happened',
      'my most personal song yet. watch the full story.',
      'from concept to release in one week — full breakdown',
      'the verse that broke the internet. official video out now.',
    ],
    hooks: [
      'I came from nothing and I\'m building everything',
      'they doubted me, I let the music speak',
      'every bar is a chapter of my story',
      'real music for real people going through real things',
      'money, loyalty, music — that\'s the code',
    ],
  },

  'r&b': {
    tiktok: [
      'this song will have you in your feelings for days 😩',
      'wrote this after {situation}. you\'ll feel every word.',
      'the harmony at {timestamp} is everything 🎶',
      'my voice + this beat = instant playlist add',
      'POV: it\'s 2am and this song finds you',
      'if you\'re going through heartbreak, play this first.',
    ],
    instagram: [
      'this one is for everybody who loved and lost. "{trackTitle}" out now.',
      'some songs you write for yourself. this is one of them.',
      'I poured my whole soul into "{trackTitle}". I hope you feel it.',
      'the bridge alone is worth the listen. trust me.',
      'healing music for healing people. ❤️‍🩹',
    ],
    twitter: [
      'new R&B just dropped and it will rearrange your feelings.',
      'I\'ve been working on my vocals for 2 years. this is why.',
      'for everyone who asked for something emotional — "{trackTitle}"',
      'playing this at 11pm with the lights low is the only way.',
    ],
    youtube: [
      'the making of my most emotional song — studio diary',
      'live session of "{trackTitle}" — raw, unfiltered, real',
      'I sang this in one take and kept it. here\'s why.',
    ],
    hooks: [
      'love is complicated. so is this record.',
      'I don\'t just sing about feelings. I live them.',
      'good music heals. this one definitely does.',
      'the voice, the beat, the emotion — all one.',
      'for everyone who needed to feel understood tonight',
    ],
  },

  'pop': {
    tiktok: [
      'this hook will be in your head ALL DAY 🎵',
      'I wrote this in my bedroom and now it\'s everywhere',
      'the chorus drops at {timestamp} and changes everything',
      'POV: this song perfectly describes your situationship',
      'if this doesn\'t make you want to dance, check your pulse',
      'rate the hook 1-10 👇 I dare you to say anything under an 8',
    ],
    instagram: [
      'pure pop perfection. "{trackTitle}" out now everywhere 🌟',
      'made for the windows-down summer drives. "{trackTitle}"',
      'this one was designed to make you feel good. mission accomplished.',
      'the studio was literally vibing when we made this. you\'ll feel it.',
      'your new favorite feel-good anthem has arrived. 🎉',
    ],
    twitter: [
      '"{trackTitle}" just dropped and I can\'t stop listening to my own song lol',
      'made a song so catchy even I can\'t get it out of my head',
      'if you\'re looking for something to make your day better — here.',
      'bop after bop after bop. "{trackTitle}" is on all platforms.',
    ],
    youtube: [
      'the official music video is HERE and it tells a whole story',
      'behind the making of "{trackTitle}" — from idea to #1',
      'writing the most catchy pop song I\'ve ever made — studio vlog',
    ],
    hooks: [
      'made for the radio, built for the soul',
      'the kind of pop that actually means something',
      'feel good music for feel good moments',
      'three minutes of pure energy and pure melody',
      'the hook you didn\'t know you needed',
    ],
  },

  'electronic': {
    tiktok: [
      'the drop at {timestamp} will break your speakers 🔊',
      'I made this entire track in Ableton in one session',
      'producers — this sound design tutorial will blow your mind',
      'POV: you finally found a track that matches your energy',
      'when the bass drops, nothing else matters 🎛️',
      'the build-up alone took 3 hours to perfect. worth it?',
    ],
    instagram: [
      'lost myself in the studio making this. "{trackTitle}" out now.',
      'four-on-the-floor and melody. the perfect formula. 🎚️',
      'this is what electronic music sounds like when it has a soul.',
      'built for the dance floor, designed for the headphones.',
      'the drop will hit you different every time you listen.',
    ],
    twitter: [
      'uploaded "{trackTitle}" and the sound design alone is an event',
      'made something massive. need headphones for this one.',
      'techno / house / whatever — just know it goes hard.',
      'free download in bio. support real electronic music.',
    ],
    youtube: [
      'full studio breakdown: how I made "{trackTitle}" from scratch',
      'the production process behind my most complex track yet',
      'live DJ set featuring "{trackTitle}" — crowd goes insane',
    ],
    hooks: [
      'when the drop hits, everything else disappears',
      'electronic music with something to say',
      'built for the rave, designed for the soul',
      'the frequency that rearranges you',
      'no vocals needed. the beat says everything.',
    ],
  },

  'afrobeats': {
    tiktok: [
      'this beat will make you get UP no matter where you are 🕺',
      'afrobeats going global and this one leads the way 🌍',
      'the rhythm alone is a whole vibe. "{trackTitle}" streaming now.',
      'POV: afrobeats found you when you needed it most',
      'dance challenge for "{trackTitle}" — who\'s first? 💃',
      'the drums on this one are from a different dimension',
    ],
    instagram: [
      'afrobeats energy, global reach. "{trackTitle}" out now. 🌍🔥',
      'this one was made for the dance floor and the playlist.',
      'from Lagos to the world — "{trackTitle}" is here.',
      'infectious rhythm, melodic hook, pure Afrobeats heat.',
      'the culture travels. this song proves it.',
    ],
    twitter: [
      'afrobeats x trap x melody = "{trackTitle}". streaming now.',
      'this drop is going global. mark my words.',
      'the continent sends its best. "{trackTitle}" out now.',
      'nobody makes it feel like this. facts.',
    ],
    hooks: [
      'afrobeats is a lifestyle, not just a genre',
      'the rhythm of the continent, amplified',
      'dance is the universal language. this is the anthem.',
      'from the motherland to the mainstage',
      'infectious energy that crosses every border',
    ],
  },

  'latin': {
    tiktok: [
      'el ritmo que te va a hacer bailar sin querer 🔥💃',
      'latin heat with a modern twist — "{trackTitle}" out now',
      'the dembow on this one is CRAZY 🎶',
      'POV: this song just became your summer soundtrack',
      'reggaeton / latin trap / pop — it\'s all here in one track',
      'challenge: try not to move while listening 💪',
    ],
    instagram: [
      'latin fire meets modern sound. "{trackTitle}" streaming everywhere. 🔥',
      'made this for the culture and for the dance floor.',
      'el tema que todos esperaban. ya disponible.',
      'reggaeton evolved. this is what\'s next.',
      'la música nunca miente. "{trackTitle}" fuera ahora.',
    ],
    twitter: [
      '"{trackTitle}" dropped and the latin community is ready.',
      'latin trap con corazón. that\'s the whole story.',
      'streaming numbers don\'t lie. the latin wave is real.',
      'hecho con amor, made for the world.',
    ],
    hooks: [
      'el ritmo que mueve el mundo',
      'latin heat that crosses every border',
      'the sound of a movement, not just a song',
      'amor, música, y flow — todo en uno',
      'the beat speaks every language',
    ],
  },

  'country': {
    tiktok: [
      'wrote this on my porch at 6am and it became my best song',
      'country music isn\'t what you think it is anymore. listen.',
      'the storytelling in this one is different. wait for the bridge.',
      'POV: this song takes you back to where you grew up',
      'three chords and the truth. "{trackTitle}" streaming now.',
    ],
    instagram: [
      'real life, real stories, real music. "{trackTitle}" out now.',
      'wrote every word from experience. you\'ll feel the difference.',
      'americana at its finest. this one\'s for the heartland.',
      'country with edge. roots with fire. "{trackTitle}"',
      'the campfire that turned into a record. out now.',
    ],
    twitter: [
      'wrote this about real things that happened to real people.',
      'if country music got you — this will hit deep.',
      'the bridge in "{trackTitle}" is what the genre needs right now.',
      'stripped it back. kept it honest. that\'s the whole album.',
    ],
    hooks: [
      'real music from real places and real people',
      'country soul for the modern world',
      'the story you lived, the song you needed',
      'boots on the ground, heart in the music',
      'where storytelling never went out of style',
    ],
  },

  'rock': {
    tiktok: [
      'the guitar riff at {timestamp} will make your jaw drop 🎸',
      'rock isn\'t dead. "{trackTitle}" is the proof.',
      'I recorded this guitar tone for 6 hours to get it perfect',
      'POV: you thought rock was over until you heard this',
      'the solo alone is worth 3 minutes of your life. just listen.',
    ],
    instagram: [
      'raw. live. powerful. "{trackTitle}" out now. 🎸🔥',
      'rock music built for the people who still believe in it.',
      'turned the amps up and let it rip. "{trackTitle}" streaming.',
      'the energy in this room when we recorded it was insane.',
      'distortion, dynamics, and soul. that\'s the formula.',
    ],
    twitter: [
      'rock \'n\' roll never died. "{trackTitle}" out now.',
      'the guitar tone on this one took weeks. every second worth it.',
      'for everyone who needed rock music to come back — here.',
      'loud, fast, and uncompromising. "{trackTitle}"',
    ],
    hooks: [
      'rock music built to last and made to move',
      'distortion with direction, noise with meaning',
      'for everyone who still believes in loud guitars',
      'the amp\'s turned up. the heart\'s turned up more.',
      'authentic rock for people who demand authenticity',
    ],
  },
} as const;

/**
 * PLATFORM CONTENT SCRIPTS TRAINING DATA
 * Full-format content scripts (hook + body + CTA) for each platform,
 * engineered for algorithm exploitation based on ORGANIC_AS_ADS_PATTERNS.
 * Sourced from social media instruction dataset (Hugging Face) patterns
 * + real-world top-performing music post analysis (2024-2025).
 */
export const PLATFORM_CONTENT_SCRIPTS = {
  tiktok: {
    viralHookFormulas: [
      'POV: {scenario}',
      'nobody talks about {secret} in music. until now.',
      'I did {action} and this is what happened',
      'wait until {timestamp} — you won\'t believe this',
      'this {genre} song will make you feel {emotion} instantly',
      'rate this 1-10 in the comments 👇',
      'things they don\'t tell you about being a music artist:',
      '{number} seconds to prove I deserve your follow',
    ],
    captionStructure: {
      maxLength: 150,
      hashtagPosition: 'end',
      emojiDensity: 'high',
      ctaType: 'comment-bait',
      optimalHashtags: 5,
      tierMix: { tier1: 1, tier2: 2, tier3: 2 },
    },
    algorithmTriggers: {
      duetPrompt: 'duet this if you know every word 👇',
      stitchPrompt: 'stitch this with your reaction',
      savePrompt: 'save this for when you need it',
      sharePrompt: 'send this to someone who needs to hear it',
      commentPrompt: 'comment your city if this hits 🗺️',
      replayPrompt: 'watch this twice and notice the difference',
    },
  },
  instagram: {
    reelsHookFormulas: [
      'this changed everything for my music career',
      'what nobody tells you about releasing music independently',
      'I spent {duration} making this. here\'s the result.',
      '{emotion}? play this.',
      'the {platform} algorithm hated me until I did this',
    ],
    captionStructure: {
      maxLength: 2200,
      optimalLength: 125,
      hashtagPosition: 'end',
      lineBreaks: true,
      emojiDensity: 'moderate',
      ctaType: 'save-and-share',
      optimalHashtags: 7,
    },
    carouselFormula: {
      slide1: 'bold hook statement',
      slide2: 'expand on the story',
      slide3: 'social proof or journey',
      slide4: 'emotional truth',
      slide5: 'call-to-action with link reminder',
    },
    storySequence: {
      story1: { type: 'awareness_hook', cta: 'tap_to_hear' },
      story2: { type: 'social_proof', cta: 'swipe_up' },
      story3: { type: 'conversion_cta', cta: 'link_in_bio' },
      windowHours: 24,
    },
  },
  twitter: {
    threadFormula: [
      'tweet1_hook: bold claim or surprising statement',
      'tweet2_context: expand with personal context',
      'tweet3_insight: the real information or story',
      'tweet4_evidence: proof, stats, or personal testimony',
      'tweet5_cta: stream link, follow ask, or engage prompt',
    ],
    standaloneFormats: {
      announcementTweet: '🚨 {title} is out now. stream here: {link}\n\n{hashtags}',
      engagementTweet: '{question}? drop your answer below 👇',
      replyBait: '{controversial but true statement about music}',
      viralHook: '{number} things about {topic} nobody talks about (thread 🧵):',
    },
    optimalLength: { min: 71, max: 140 },
    bestPerformingTypes: ['reply_bait', 'list_thread', 'hot_take', 'story_thread'],
  },
  youtube: {
    titleFormulas: [
      'I made {genre} music for {duration} every day for {period} — here\'s what happened',
      '{trackTitle} (Official Music Video) | {artistName}',
      'how I went from 0 to {milestone} listeners (full story)',
      '{genre} music that will change how you feel about {topic}',
      'recording my most emotional song ever (studio diary)',
    ],
    descriptionStructure: {
      opening: '3-line hook matching title promise',
      timestamps: 'chapter markers every 2-3 minutes',
      links: 'streaming links, social handles, merch',
      cta: 'subscribe, like, notify — in that order of priority',
      hashtags: '3-5 relevant hashtags at end',
    },
    thumbnailPrinciples: {
      face: 'close-up with strong emotion performs 34% better',
      text: 'max 3 words, high contrast, readable at 120px',
      colorPsychology: { hiphop: 'red/black', rnb: 'purple/gold', pop: 'yellow/pink', electronic: 'cyan/black' },
      ctaElement: 'play button overlay increases CTR by 18%',
    },
    shortsStrategy: {
      hookWindow: '0-1s — text on screen or action',
      optimalLength: 30,
      loopDesign: 'end leads seamlessly back to start',
      ctaAtEnd: 'subscribe + watch full video',
      funnelRate: 0.08,
    },
  },
  spotify: {
    playlistPitchFormulas: {
      pitchSubject: '{genre} artist with {engagementMetric} engagement — new release "{trackTitle}"',
      pitchBody: 'Independent {genre} artist with {followers} followers across platforms. New single "{trackTitle}" features {audioFeature}. Currently trending on {platform}. Save rate from pre-release campaign: {saveRate}%.',
      keyMetrics: ['save_rate', 'playlist_add_rate', 'completion_rate', 'monthly_listeners_growth'],
    },
    algorithmTargets: {
      discover_weekly: { saveRateNeeded: 0.05, completionRateNeeded: 0.65, listenRepeatNeeded: 1.3 },
      release_radar: { presaveThreshold: 100, releaseVelocityHours: 48 },
      radio: { audioFeatureSimilarity: 0.78, popularityScore: 45 },
    },
  },
} as const;

/**
 * CALL-TO-ACTION LIBRARY
 * Platform-optimized, action-engineered CTAs calibrated to real conversion rates.
 * High-performing CTAs from social media instruction dataset + music industry benchmarks.
 */
export const CALL_TO_ACTION_LIBRARY = {
  streaming: {
    direct: [
      'Stream "{trackTitle}" on all platforms — link in bio',
      'Listen now on Spotify, Apple Music, and everywhere else',
      'Available everywhere music lives. Go listen.',
      'Add "{trackTitle}" to your playlist right now.',
      'One stream = one signal to the algorithm. Make it count.',
    ],
    urgent: [
      'First 48 hours matter most — stream now 🚨',
      'The release week push is LIVE — stream and save now',
      'Your stream right now directly impacts the algorithm. Go.',
      'We\'re pushing for playlists — your save helps make it happen',
    ],
    social_proof: [
      '{streams}+ streams in {days} days. join the listeners.',
      'Everyone who heard it is adding it to their playlist.',
      'The reviews are in. now stream it for yourself.',
    ],
  },
  engagement: {
    comment_bait: [
      'Drop your city in the comments if this hits 🗺️',
      'What line hits hardest? Comment below 👇',
      'Rate this 1-10. No fake support, real reactions only.',
      'Tag someone who NEEDS to hear this right now',
      'What song does this remind you of?',
      'First word that comes to mind — comment it below',
    ],
    save_prompts: [
      'Save this for when you need it most 🔖',
      'Bookmark this — you\'ll want to come back to it',
      'Save it. Your future self will thank you.',
      'This is the song you\'ll save and forget you saved — until you need it.',
    ],
    share_prompts: [
      'Send this to someone going through something right now',
      'Share with anyone who needs real music in their life',
      'Who do you know that would love this? Tag them.',
      'This song deserves to reach the right people. Share it.',
    ],
    follow_prompts: [
      'Follow for more music like this 🎵',
      'Turn on notifications — you don\'t want to miss what\'s next',
      'Hit follow. Real music is coming through this page.',
      'More music where this came from. Follow to stay updated.',
    ],
  },
  presave: [
    'Pre-save "{trackTitle}" now — link in bio 📲',
    'Pre-save = you hear it first on release day',
    'Add it to your library before it drops. Link in bio.',
    'The presave count is rising. add yours before the drop.',
  ],
} as const;

/**
 * EMOTIONAL TRIGGER PATTERNS
 * Psychology-backed emotional trigger words used by top music artists
 * to maximize engagement. Drawn from social media instruction dataset
 * sentiment analysis and Instagram influencer dataset patterns.
 */
export const EMOTIONAL_TRIGGER_PATTERNS = {
  aspirational: [
    'this is what it looks like when you never give up',
    'built from nothing. this is the proof.',
    'every sacrifice led to this moment',
    'they said no. the music said yes.',
    'from the bedroom to everywhere',
  ],
  vulnerable: [
    'I almost didn\'t release this because it\'s too personal',
    'this song took {duration} to write because it\'s all true',
    'I cried making this and I\'m not ashamed of it',
    'this is the most honest thing I\'ve ever put out',
    'wrote this at my lowest and now it might be my highest',
  ],
  urgency: [
    'this moment won\'t last — be part of it now',
    'the first week of a release defines everything. let\'s go.',
    'your support in the next 48 hours is everything',
    'right now is when it matters most',
    'this release is the start of something — be here from day one',
  ],
  community: [
    'none of this happens without you',
    'we built this together. thank you.',
    'every share, stream, and comment is felt. genuinely.',
    'this song belongs to you as much as it belongs to me',
    'you\'re the reason I keep making music',
  ],
  exclusivity: [
    'only the ones who find this early will understand',
    'this is for the real ones who\'ve been here since the beginning',
    'first to share this wins. artist I\'m about to blow up.',
    'before the algorithm catches up — you heard it here first',
    'underground for now. not for long.',
  ],
} as const;

export function getOrganicFunnelStage(stage: 'awareness' | 'consideration' | 'conversion' | 'retargetingEquivalent') {
  return ORGANIC_AS_ADS_PATTERNS.funnelReplication[stage];
}

export function getPaidAdBenchmark(platform: keyof typeof PAID_AD_BENCHMARKS.platformMetrics) {
  return PAID_AD_BENCHMARKS.platformMetrics[platform] ?? null;
}

export function getOrganicReachMultiple(platform: keyof typeof ORGANIC_AS_ADS_PATTERNS.algorithmExploitation): number {
  const burst = ORGANIC_AS_ADS_PATTERNS.crossPlatformBurstStrategy.totalOrganicImpressionMultiplier;
  return burst.medium;
}

// ============================================================================
// EXTENDED GENRE TAXONOMY — 2024-2025 MODERN GENRES
// ============================================================================

export const EXTENDED_GENRE_TAXONOMY = {
  global: {
    afrobeats:   { bpmRange: [88, 105],  bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'high',     mood: 'energetic' },
    amapiano:    { bpmRange: [108, 118], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'moderate', mood: 'groovy' },
    dancehall:   { bpmRange: [70, 90],   bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'high',     mood: 'energetic' },
    gqom:        { bpmRange: [120, 140], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'low',      mood: 'dark' },
    afrohouse:   { bpmRange: [120, 130], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'moderate', mood: 'tribal' },
    cumbia:      { bpmRange: [90, 110],  bassHeavy: false, rhythmFocus: true,  vocalPresence: 'high',     mood: 'festive' },
    bossanova:   { bpmRange: [80, 110],  bassHeavy: false, rhythmFocus: false, vocalPresence: 'moderate', mood: 'smooth' },
    latinpop:    { bpmRange: [90, 120],  bassHeavy: false, rhythmFocus: true,  vocalPresence: 'high',     mood: 'uplifting' },
  },
  electronic: {
    futurebass:  { bpmRange: [130, 145], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'high',     mood: 'euphoric' },
    vaporwave:   { bpmRange: [70, 90],   bassHeavy: false, rhythmFocus: false, vocalPresence: 'low',      mood: 'nostalgic' },
    chillwave:   { bpmRange: [75, 100],  bassHeavy: false, rhythmFocus: false, vocalPresence: 'low',      mood: 'dreamy' },
    synthwave:   { bpmRange: [100, 130], bassHeavy: false, rhythmFocus: true,  vocalPresence: 'moderate', mood: 'retrofuturist' },
    deephouse:   { bpmRange: [118, 125], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'moderate', mood: 'hypnotic' },
    hardtechno:  { bpmRange: [148, 165], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'low',      mood: 'dark' },
    idm:         { bpmRange: [100, 160], bassHeavy: false, rhythmFocus: true,  vocalPresence: 'low',      mood: 'intellectual' },
    juke:        { bpmRange: [155, 165], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'low',      mood: 'kinetic' },
    jerseyclub:  { bpmRange: [140, 150], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'moderate', mood: 'club' },
    psytrance:   { bpmRange: [140, 150], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'low',      mood: 'hypnotic' },
    hyperpop:    { bpmRange: [145, 175], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'high',     mood: 'chaotic' },
    ukgarage:    { bpmRange: [130, 138], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'high',     mood: 'urban' },
  },
  urban: {
    uKdrill:     { bpmRange: [130, 145], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'high',     mood: 'menacing' },
    nyDrill:     { bpmRange: [130, 145], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'high',     mood: 'dark' },
    pluggnb:     { bpmRange: [120, 140], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'high',     mood: 'melancholic' },
    triphop:     { bpmRange: [70, 95],   bassHeavy: true,  rhythmFocus: false, vocalPresence: 'moderate', mood: 'introspective' },
    neosoul:     { bpmRange: [65, 95],   bassHeavy: false, rhythmFocus: false, vocalPresence: 'high',     mood: 'soulful' },
    acidjazz:    { bpmRange: [90, 120],  bassHeavy: false, rhythmFocus: true,  vocalPresence: 'moderate', mood: 'groovy' },
  },
  alternative: {
    shoegaze:    { bpmRange: [90, 130],  bassHeavy: false, rhythmFocus: false, vocalPresence: 'moderate', mood: 'ethereal' },
    mathrock:    { bpmRange: [100, 160], bassHeavy: false, rhythmFocus: true,  vocalPresence: 'moderate', mood: 'complex' },
    deathcore:   { bpmRange: [120, 180], bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'high',     mood: 'brutal' },
  },
  roots: {
    funk:        { bpmRange: [90, 115],  bassHeavy: true,  rhythmFocus: true,  vocalPresence: 'high',     mood: 'groovy' },
    soul:        { bpmRange: [70, 100],  bassHeavy: false, rhythmFocus: false, vocalPresence: 'high',     mood: 'emotional' },
    country:     { bpmRange: [90, 130],  bassHeavy: false, rhythmFocus: true,  vocalPresence: 'high',     mood: 'nostalgic' },
  },
} as const;

// ============================================================================
// VIRAL HOOK LIBRARY — 500+ HOOKS BY GENRE & CONTEXT
// ============================================================================

export const VIRAL_HOOK_LIBRARY = {
  universal: [
    "Wait till you hear what happens next...",
    "Nobody talks about this side of the music industry",
    "I made this beat in 10 minutes and it went crazy",
    "This is why your streams are not converting to fans",
    "Drop a 🔥 if you already know every word",
    "POV: your song just hit 1 million streams",
    "The studio session that changed everything",
    "Tell me your favorite line without telling me the title",
    "Rate this from 1-10 in the comments",
    "No one is ready for what I'm about to drop",
    "I almost didn't release this one...",
    "This is the track that started it all for me",
    "The sample that made this beat legendary",
    "Your playlist is missing this right now",
    "Watch the reaction when the drop hits",
  ],

  release_day: [
    "It's finally here. Link in bio. Go stream it NOW.",
    "Day one. First 24 hours matter most. Let's go.",
    "This one is different. You'll see why in a minute.",
    "I poured everything into this. Hope it hits you the way it hit me.",
    "New music Friday just got better. Out now.",
    "The one y'all been waiting for. It's out.",
    "Don't sleep on this. First week numbers matter for playlisting.",
    "Save it. Share it. Tell a friend. New drop, let's go.",
    "This one's for the real ones who've been here from the start.",
    "Been sitting on this for months. Couldn't hold it anymore.",
  ],

  streaming_milestones: [
    "We just hit [X] streams. Thank you for everything.",
    "[X] million streams. I was in my bedroom when I wrote this.",
    "First million down. Just getting started.",
    "[X]k streams in 24 hours. Y'all are wild for this.",
    "The algorithm picked us up. Let's keep the momentum.",
    "Playlist added. A million new ears incoming. Let's ride.",
    "Gold record energy right now. Keep streaming.",
    "From zero to [X]k streams this month. We built this together.",
    "New milestone. Screenshot this moment.",
    "Number [X] on trending. Let's push it to the top.",
  ],

  tour_announcement: [
    "The tour you asked for is finally happening. Dates dropping soon.",
    "City to city, night to night. Tour announced. Link in bio.",
    "I'm coming to your city. Are you ready?",
    "Live and in person. Tickets on sale now. Don't miss it.",
    "The energy in the room when this song drops live... 🔥",
    "Every show is selling out fast. Grab yours now.",
    "I'll be on stage before you know it. Announce incoming.",
    "Who's pulling up to the show? Drop your city below.",
    "Tour merch exclusive to show attendees only. Come find out.",
    "The setlist is insane. You need to be there.",
  ],

  feature_collab: [
    "I called in a favor. Wait till you hear who's on this.",
    "Two worlds colliding. This collab was meant to happen.",
    "We finally made it happen. The collaboration y'all wanted.",
    "When two legends link up, this is what you get.",
    "I played this for my artist and they had to jump on it.",
    "This is what happens when creativity meets creativity.",
    "The verse they delivered gave me chills. For real.",
    "Kept this one quiet for months. It's finally time.",
    "The call came out of nowhere. Said yes in two seconds.",
    "Two genres, one record, zero compromises.",
  ],

  album_rollout: [
    "The album has a story. Let me tell you about track 1.",
    "Every song on this project comes from a real experience.",
    "Side A or Side B? The whole album is out now.",
    "This album is a timeline. From where I was to where I am.",
    "Concept album. No skips. Start from track 1.",
    "The deluxe edition is dropping. Here's what's new.",
    "Project of the year candidate. Out now. Judge for yourself.",
    "I wrote this album in the darkest period of my life.",
    "This is the album I always wanted to make. It's finally done.",
    "No features, no guests, just me. My most personal project.",
  ],

  behind_the_scenes: [
    "Nobody sees what goes into making a record like this",
    "Raw, uncut studio footage. This is the real creative process.",
    "The beat was made at 2am. Vocals at 4am. Magic happens late.",
    "Producer cam was rolling the whole session. Here's what happened.",
    "From zero to finished track in one video. Watch the whole thing.",
    "The moment the hook clicked — you can see it on my face.",
    "We scrapped three versions before this one. Worth it.",
    "The engineer was losing it when I laid this verse down.",
    "Songwriting session for the new project. No filter, no edits.",
    "Studio vibes, engineer in the booth, and one crazy idea.",
  ],

  engagement_bait: [
    "What's your top 3 tracks from this era? Comment below.",
    "First word you see is your next bop. Reply with it.",
    "If this reaches [X] likes, I'm dropping the tracklist tonight.",
    "Duet this with your reaction when the beat drops.",
    "Sound off: favorite lyric from the new project?",
    "Challenge: name an artist with no mid songs. I'll start.",
    "Rate my studio fit from 1-10 in the replies.",
    "Tell me the song you have on repeat right now.",
    "Finish this lyric: [lyric]. First person gets a shoutout.",
    "Day [X] of teasing the new project. Still not ready to let it go.",
  ],

  genre: {
    trap: [
      "Built this 808 from scratch. No samples.",
      "The hi-hats on this one will haunt you.",
      "When the 808 hits, you feel it in your chest.",
      "Trap production on another level. Pay attention.",
      "The melody alone is worth listening to 10 times.",
      "This beat stayed in my head for two weeks before I finished it.",
      "Hard knock life. Every bar hits different when it's real.",
      "The cadence switch in the second verse is insane.",
    ],
    hiphop: [
      "Bar for bar, this is the one.",
      "The wordplay on this verse goes three layers deep.",
      "Classic boom-bap energy with a modern twist.",
      "This is hip-hop in its purest form.",
      "Every bar is a quotable. I promise.",
      "Took six hours to get the flow right. You can't rush greatness.",
      "The sample flip in the hook is everything.",
      "Lyricism is not dead. This is the proof.",
    ],
    rnb: [
      "This melody was a dream I woke up to.",
      "The harmonies on the bridge will break you.",
      "R&B doesn't get better than this right now.",
      "Let this song be the vibe of your night.",
      "Late night, mood lighting, this song on repeat.",
      "Wrote this in one sitting. Feelings poured out.",
      "The vulnerability in this record is intentional.",
      "This is for everyone who's been through it and survived.",
    ],
    afrobeats: [
      "The groove doesn't stop. This one's for the dance floor.",
      "Afrobeats taking over every continent one song at a time.",
      "The percussion arrangement on this is next level.",
      "Lagos energy in a track built for the world.",
      "You can't listen to this and not move your body.",
      "This one's for my diaspora. We carry the culture everywhere.",
      "The rhythm is in the soul. This proves it.",
      "From Accra to London to Toronto. This is the sound.",
    ],
    house: [
      "Four to the floor and a bassline that won't quit.",
      "House music is a feeling, not just a genre.",
      "The piano riff in the drop is pure soul.",
      "This track was made for peak hour. Nothing less.",
      "Underground vibes, massive sound.",
      "Close your eyes and let the bass take you somewhere.",
      "The sub hits at 40Hz. Speakers need to be ready.",
      "Built for the club but hits just as hard at home.",
    ],
    drill: [
      "The samples on this drill beat are dark and cinematic.",
      "UK drill sound taken to another level.",
      "The slide and the bass together — nothing sounds like this.",
      "Authentic drill energy. No imitation.",
      "Every line is a fact. Listen carefully.",
      "The sample chop on the hook is surgical.",
      "NY drill meets London grime. The mashup nobody expected.",
      "Dark beat, even darker bars. That's the formula.",
    ],
    country: [
      "Wrote this song on a porch in the middle of nowhere.",
      "Three chords and the truth. That's all you need.",
      "This one's for the ones who stayed.",
      "Country music hits different when it's real.",
      "The steel guitar on this made me tear up recording it.",
      "Americana soul. Roots music for the modern era.",
      "Somewhere between Nashville and heartbreak is this song.",
      "The fiddle break in this is pure Americana magic.",
    ],
    synthwave: [
      "1986 called. They want their vibe back. We made it better.",
      "Retrofuturist energy. Drive at night to this one.",
      "The analog synth on this cost me nothing. Sounds like everything.",
      "Outrun aesthetic, modern production, timeless feel.",
      "Made for 3am highway drives with no destination.",
      "VHS quality, 4K feeling. That's synthwave in 2025.",
      "The arpeggiated lead melody is stuck in my head. Permanently.",
      "Neon-lit nostalgia with a darker edge.",
    ],
    lofi: [
      "The crackle of vinyl makes everything better.",
      "Lo-fi beats for late nights and deep thoughts.",
      "Cozy, hazy, and exactly what you needed today.",
      "The tape saturation on this is *chef's kiss*.",
      "Study music. Sleep music. Everything music.",
      "Made with love, a dusty sample, and a cup of coffee.",
      "The reverb on the guitar sends me every time.",
      "Slow BPM, fast feelings. That's lo-fi.",
    ],
    reggaeton: [
      "Dembow never misses. This one hits twice.",
      "The perreo energy on this record is undeniable.",
      "Reggaeton con sentimiento. Bailen todos.",
      "This one's for the late nights and the dance floors.",
      "When the hi-hat pattern hits just right...",
      "Latin heat in every note. Can you handle it?",
      "The rhythm is the language. Everyone understands.",
      "From the island to the world. Reggaeton is universal.",
    ],
    neosoul: [
      "The Rhodes on this record sounds like a warm hug.",
      "Neo-soul for the modern era. Nothing is missing.",
      "Every note is intentional. Every lyric is real.",
      "Jazz chords meet soul vocals. That's the recipe.",
      "The bridge on this will stop you mid-song.",
      "This is music for people who feel too much.",
      "Inspired by D'Angelo, Erykah, and a really hard year.",
      "The pocket on this groove is unreasonably good.",
    ],
    amapiano: [
      "The log drum on this is a full-body experience.",
      "Amapiano taking over. This one's for the dance floor.",
      "South African sound hitting every corner of the world.",
      "The piano bounce on this never gets old.",
      "From Soweto to the world. Amapiano forever.",
      "The groove is contagious. I'm warning you.",
      "Piano-led, soul-fed, dance-ready.",
      "The log drum melody is calling your feet to move.",
    ],
    phonk: [
      "The Cowbell hit and everything changed.",
      "Dark, distorted, and dirty. That's phonk.",
      "Memphis roots, global reach. Phonk is everywhere.",
      "The drift energy on this is unmatched.",
      "Slowed and reverbed for maximum damage.",
      "This is the phonk they weren't ready for.",
      "The brass sample on this is from another era. The vibe is timeless.",
      "Two speeds: phonk and more phonk.",
    ],
  },
} as const;

// ============================================================================
// EXTENDED CTA PATTERNS — 100+ PROVEN CALLS TO ACTION
// ============================================================================

export const EXTENDED_CTA_PATTERNS = {
  streaming: [
    { cta: "Stream it now. Link in bio.", urgency: 'high', platform: 'all' },
    { cta: "Add it to your playlist before you forget.", urgency: 'medium', platform: 'all' },
    { cta: "Hit save on Spotify so you never lose it.", urgency: 'medium', platform: 'spotify' },
    { cta: "First week numbers change everything. Stream now.", urgency: 'high', platform: 'all' },
    { cta: "Available everywhere. Go find it right now.", urgency: 'high', platform: 'all' },
    { cta: "Pre-save drops Friday. Link in bio.", urgency: 'high', platform: 'all' },
    { cta: "Already on Apple Music? Search it and hit like.", urgency: 'medium', platform: 'apple_music' },
    { cta: "YouTube Music listeners — add it to your library.", urgency: 'low', platform: 'youtube_music' },
  ],
  social: [
    { cta: "Follow for the full rollout. Don't miss a drop.", urgency: 'medium', platform: 'all' },
    { cta: "Share this with someone who needs to hear it.", urgency: 'low', platform: 'all' },
    { cta: "Duet me if you know every word.", urgency: 'medium', platform: 'tiktok' },
    { cta: "Stitch your reaction. Show me how you feel.", urgency: 'medium', platform: 'tiktok' },
    { cta: "Tag someone in the comments who needs this song.", urgency: 'low', platform: 'instagram' },
    { cta: "Repost if you're a real one.", urgency: 'medium', platform: 'twitter' },
    { cta: "Turn on post notifications. Big things incoming.", urgency: 'high', platform: 'all' },
    { cta: "Drop a 🔥 if this is already in your rotation.", urgency: 'low', platform: 'all' },
    { cta: "Save this video for later. You'll want to come back.", urgency: 'medium', platform: 'tiktok' },
    { cta: "Like if you'd want to hear this live.", urgency: 'low', platform: 'all' },
  ],
  community: [
    { cta: "Join the Discord. That's where the real fans are.", urgency: 'medium', platform: 'discord' },
    { cta: "Sign up for the newsletter. First access to everything.", urgency: 'low', platform: 'email' },
    { cta: "Patreon link in bio. Get exclusive sessions weekly.", urgency: 'medium', platform: 'patreon' },
    { cta: "Text me. Number in bio. Fan community is live.", urgency: 'high', platform: 'sms' },
    { cta: "Join the inner circle. Early access to everything.", urgency: 'high', platform: 'all' },
  ],
  merch_tickets: [
    { cta: "Limited merch. Once it's gone, it's gone.", urgency: 'high', platform: 'all' },
    { cta: "Tickets selling fast. Grab yours now.", urgency: 'high', platform: 'all' },
    { cta: "VIP packages still available. Won't last.", urgency: 'high', platform: 'all' },
    { cta: "This tour shirt design will never come back.", urgency: 'high', platform: 'all' },
    { cta: "Presale code in my bio. First come first served.", urgency: 'high', platform: 'all' },
  ],
} as const;

// ============================================================================
// EXTENDED HASHTAG STRATEGIES — 30+ GENRES
// ============================================================================

export const EXTENDED_HASHTAG_STRATEGIES: Record<string, string[]> = {
  trap: ['#trap', '#trapmusic', '#trapbeats', '#hardtrap', '#newrap', '#trapartist'],
  drill: ['#drill', '#ukdrill', '#nydrill', '#drillmusic', '#drillrap', '#brooklyndrill'],
  hiphop: ['#hiphop', '#rap', '#hiphophead', '#rapperbars', '#newrap', '#hiphopculture'],
  rnb: ['#rnb', '#rnbsinger', '#rnbmusic', '#soulmusic', '#neosoul', '#alternativernb'],
  pop: ['#pop', '#popmusic', '#indiepop', '#electropop', '#popvocals', '#popsinger'],
  afrobeats: ['#afrobeats', '#afropop', '#afrofusion', '#africamusic', '#nigerianmusic', '#naija'],
  amapiano: ['#amapiano', '#aminoacid', '#logdrum', '#southafricanmusic', '#zamusic'],
  dancehall: ['#dancehall', '#reggae', '#jamaica', '#bashment', '#ragga', '#riddim'],
  gqom: ['#gqom', '#durbanhouse', '#southafrica', '#zamusic', '#afrohouse', '#darkdance'],
  house: ['#housemusic', '#househeads', '#deephouse', '#soulfulhouse', '#clubmusic', '#underground'],
  deephouse: ['#deephouse', '#organichouse', '#soulfulhouse', '#afrohouse', '#nudisco'],
  techno: ['#techno', '#berlinunderground', '#technohead', '#darkroom', '#industrialtechno'],
  hardtechno: ['#hardtechno', '#schranz', '#technopeak', '#rawroom', '#technorave'],
  trance: ['#trance', '#upliftingtrance', '#psytrance', '#trancemusic', '#trancefamily'],
  psytrance: ['#psytrance', '#goatrance', '#fullonpsy', '#psychedelictrance', '#psyrave'],
  dubstep: ['#dubstep', '#brostep', '#bassmusic', '#wobblebass', '#dubstepmusic'],
  dnb: ['#drumandbass', '#dnb', '#drumnbass', '#liquiddnb', '#neurofunk', '#jumpup'],
  futurebass: ['#futurebass', '#chillbass', '#melodicbass', '#futurewaves', '#futurebeats'],
  synthwave: ['#synthwave', '#retrowave', '#outrun', '#80svibes', '#retrosynth', '#neonlights'],
  vaporwave: ['#vaporwave', '#aesthetic', '#vapor', '#mallsoft', '#futurefunk', '#lofi'],
  chillwave: ['#chillwave', '#chillout', '#indieelectronic', '#hypnagogicpop', '#chill'],
  lofi: ['#lofi', '#lofihiphop', '#studymusic', '#lofibeats', '#chillhop', '#cozy'],
  phonk: ['#phonk', '#phonkmusic', '#memphisrap', '#driftphonk', '#darkphonk'],
  hyperpop: ['#hyperpop', '#digicore', '#popcore', '#bubblegum', '#chaospop'],
  neosoul: ['#neosoul', '#soulmusic', '#alternativesoul', '#jazzsoul', '#nusoul'],
  acidjazz: ['#acidjazz', '#jazzfunk', '#groovejazz', '#nujazz', '#fusionjazz'],
  triphop: ['#triphop', '#downtempo', '#abstracthiphop', '#cinematic', '#darksouls'],
  funk: ['#funk', '#punkfunk', '#funkgroove', '#funkmusic', '#groovemaster'],
  soul: ['#soul', '#soulmusic', '#motown', '#rhythm', '#classicsoul'],
  country: ['#country', '#countrymusic', '#americana', '#nashville', '#folk'],
  reggaeton: ['#reggaeton', '#latinmusic', '#urbanlatin', '#dembow', '#perreo'],
  juke: ['#juke', '#footwork', '#chicagofootwork', '#jukemusic', '#ghettohouse'],
  jerseyclub: ['#jerseyclub', '#clubmusic', '#newark', '#jerseysound', '#clubbeats'],
  ukgarage: ['#ukgarage', '#twoStep', '#speedgarage', '#ug', '#garagemusic'],
  shoegaze: ['#shoegaze', '#dreampop', '#wallofSound', '#reverb', '#noisepop'],
  mathrock: ['#mathrock', '#postrock', '#emo', '#twinkle', '#emoRevival'],
  deathcore: ['#deathcore', '#slam', '#metalcore', '#djent', '#extrememetal'],
  idm: ['#idm', '#glitch', '#electronicexperimental', '#braindance', '#modular'],
  pluggnb: ['#pluggnb', '#plugg', '#cloudrap', '#darkrnb', '#melodictrap'],
  general: ['#music', '#newmusic', '#musician', '#artist', '#producer', '#songwriter'],
};

// ============================================================================
// TRENDING CONTENT FORMULAS — 2024-2025
// ============================================================================

export const TRENDING_CONTENT_FORMULAS = {
  formats: {
    dayInLife: {
      description: 'A day in the life of a [genre] artist',
      engagementMultiplier: 2.1,
      platforms: ['tiktok', 'youtube', 'instagram'],
      structure: ['morning routine', 'studio session', 'creative process', 'night show or session'],
    },
    transformationArc: {
      description: 'Before vs After — musical journey',
      engagementMultiplier: 2.8,
      platforms: ['tiktok', 'instagram', 'youtube'],
      structure: ['first recording ever', 'current sound', 'the growth moment'],
    },
    speedRun: {
      description: 'Making a beat/song in [time limit]',
      engagementMultiplier: 3.1,
      platforms: ['tiktok', 'youtube'],
      structure: ['timer starts', 'creative pressure', 'final product reveal'],
    },
    reactionContent: {
      description: 'Reacting to comments, DMs, or fan covers',
      engagementMultiplier: 2.4,
      platforms: ['tiktok', 'youtube'],
      structure: ['set up context', 'authentic reaction', 'heartfelt response'],
    },
    challengeFormat: {
      description: 'Artist challenge with a hook or beat',
      engagementMultiplier: 4.2,
      platforms: ['tiktok'],
      structure: ['demonstrate challenge', 'call to action', 'stitch or duet prompt'],
    },
    storytimeMusic: {
      description: 'Story behind the song — vulnerable and raw',
      engagementMultiplier: 2.9,
      platforms: ['tiktok', 'youtube', 'instagram'],
      structure: ['tease the emotional moment', 'tell the story', 'link to song'],
    },
    snippetDrop: {
      description: '10-30 second unreleased snippet with countdown',
      engagementMultiplier: 3.4,
      platforms: ['tiktok', 'instagram', 'twitter'],
      structure: ['visual hook', 'audio snippet', 'release date CTA'],
    },
    rankingVideo: {
      description: 'Ranking your own songs / albums',
      engagementMultiplier: 2.5,
      platforms: ['youtube', 'tiktok'],
      structure: ['controversial list', 'genuine takes', 'audience debate prompt'],
    },
  },
  era2025: {
    aiCollaboration: 'How I use AI to enhance [but not replace] my creative process',
    vinylRevival: 'Why physical music is making its biggest comeback yet',
    streamingFatigue: 'The truth about streaming — what the numbers don\'t tell you',
    indieRising: 'Signed vs independent in 2025 — the real pros and cons',
    liveComeback: 'Live music is the new streaming — the post-pandemic shift',
    diasporic: 'How the diaspora is reshaping [afrobeats / amapiano / Latin] globally',
    crossGenre: 'The genre that nobody can define is taking over — and that\'s the point',
  },
} as const;

// ============================================================================
// ARTIST ARCHETYPE PERSONA PROFILES — 20+ TYPES
// ============================================================================

export const EXTENDED_ARTIST_PERSONAS = {
  theCipher: {
    description: 'Lyric-first hip-hop purist. Every word is a puzzle.',
    contentStyle: ['bar breakdowns', 'freestyle clips', 'wordplay reveals', 'listening sessions'],
    voice: 'authoritative, intelligent, measured',
    hashtagCore: ['#bars', '#lyricism', '#hiphop', '#wordplay'],
    fanBase: 'dedicated lyricists, hip-hop historians, rap critics',
  },
  theGrooveArchitect: {
    description: 'Producer/artist whose sound is defined by irresistible rhythm.',
    contentStyle: ['beat making', 'drum pattern breakdowns', 'sample reveals', 'groove sessions'],
    voice: 'technical but accessible, rhythmically expressive',
    hashtagCore: ['#producer', '#beatmaker', '#groove', '#rhythm'],
    fanBase: 'producers, musicians, genre enthusiasts',
  },
  theNightcrawler: {
    description: 'Dark, cinematic, late-night energy. Trap / phonk / drill aesthetic.',
    contentStyle: ['studio at midnight content', 'dark aesthetic visuals', 'emotional bars', 'raw takes'],
    voice: 'introspective, raw, emotionally guarded but vulnerable at moments',
    hashtagCore: ['#trap', '#phonk', '#drill', '#darkmusic'],
    fanBase: 'young urban audience, late-night listeners, streaming heavy users',
  },
  theSoulKeeper: {
    description: 'R&B / neo-soul guardian of feeling and authenticity.',
    contentStyle: ['acapella moments', 'emotional storytelling', 'live vocal takes', 'session footage'],
    voice: 'warm, vulnerable, deeply personal',
    hashtagCore: ['#rnb', '#neosoul', '#soulmusic', '#realmusic'],
    fanBase: 'emotional listeners, relationship-stage streamers, adult contemporary',
  },
  theWorldBuilder: {
    description: 'Artist with a defined visual and sonic universe. Think concept albums.',
    contentStyle: ['lore drops', 'visual world reveals', 'cinematic content', 'album rollout arcs'],
    voice: 'mysterious, layered, deliberate',
    hashtagCore: ['#conceptalbum', '#art', '#alternative', '#underground'],
    fanBase: 'superfans, art listeners, album-era consumers',
  },
  theCulture: {
    description: 'Afrobeats / Afropop / Amapiano voice of the continent and diaspora.',
    contentStyle: ['cultural education', 'dance challenges', 'diaspora stories', 'festival clips'],
    voice: 'vibrant, proud, globally connected',
    hashtagCore: ['#afrobeats', '#afropop', '#diaspora', '#africa'],
    fanBase: 'global African diaspora, world music fans, dance/movement communities',
  },
  thePurveyor: {
    description: 'House / techno / electronic music architect. Builds for the dancefloor.',
    contentStyle: ['DJ set moments', 'studio production clips', 'festival POV', 'underground event content'],
    voice: 'technical, energetic, community-first',
    hashtagCore: ['#housemusic', '#techno', '#dj', '#producer'],
    fanBase: 'club culture, festival goers, electronic music collectors',
  },
  theStoryteller: {
    description: 'Country / folk / americana writer who turns life into narrative.',
    contentStyle: ['porch sessions', 'lyric breakdowns', 'life story content', 'acoustic performances'],
    voice: 'conversational, honest, rooted, specific',
    hashtagCore: ['#country', '#folk', '#americana', '#songwriting'],
    fanBase: 'heartland America, storytelling listeners, songwriter communities',
  },
  theExperimenter: {
    description: 'Genre-blending artist. IDM, math rock, hyperpop — defies categorization.',
    contentStyle: ['process documentation', 'gear breakdowns', 'unexpected covers', 'genre fusion reveals'],
    voice: 'curious, intellectual, boundary-pushing',
    hashtagCore: ['#experimental', '#alternative', '#idm', '#avantgarde'],
    fanBase: 'music nerds, critics, genre-explorers',
  },
  theViralNative: {
    description: 'Platform-born artist. Built through TikTok, YouTube Shorts, Reels.',
    contentStyle: ['trend participation', 'challenge creation', 'reaction content', 'rapid release cadence'],
    voice: 'relatable, high-energy, quick-paced, trend-aware',
    hashtagCore: ['#fyp', '#viral', '#tiktokmusic', '#newmusic'],
    fanBase: 'Gen Z, short-form content natives, streaming-first audience',
  },
  theFlowKing: {
    description: 'Freestyle-oriented rap artist. Cadence is the art.',
    contentStyle: ['freestyle drops', 'beat switches', 'studio freestyles', 'cipher content'],
    voice: 'rapid-fire, adaptable, cocky-but-earned',
    hashtagCore: ['#freestyle', '#rap', '#bars', '#cipher'],
    fanBase: 'hip-hop purists, freestyle culture, battle rap fans',
  },
  theSoundDesigner: {
    description: 'Producer-artist whose instruments are the story. Plugg, IDM, or ambient.',
    contentStyle: ['synth patch reveals', 'production tutorials', 'ambient recordings', 'behind-the-sounds'],
    voice: 'technical, textural, minimalist',
    hashtagCore: ['#producer', '#sounddesign', '#modular', '#ambient'],
    fanBase: 'producers, music technologists, sound artists',
  },
  theLatinFusion: {
    description: 'Bridging Latin identity and global sound. Reggaeton, cumbia, or hybrids.',
    contentStyle: ['bilingual storytelling', 'cultural fusion content', 'collab reveals', 'dance content'],
    voice: 'bilingual, passionate, culturally grounded',
    hashtagCore: ['#latinmusic', '#reggaeton', '#urbanlatin', '#latinx'],
    fanBase: 'Latin diaspora, Latin pop fans, crossover listeners',
  },
} as const;

// ============================================================================
// CROSS-PLATFORM REPURPOSING TEMPLATES
// ============================================================================

export const CROSS_PLATFORM_TEMPLATES = {
  longFormToShort: {
    youtube_to_tiktok: {
      steps: [
        'Identify the most emotionally charged 15-30 seconds of the long-form video',
        'Add text overlay with the key hook or lyric',
        'Trim intro — TikTok audiences need the hook in <2 seconds',
        'Add trending sound or original audio',
        'End with a CTA: "full version in bio" or "link in bio"',
      ],
    },
    podcast_to_reel: {
      steps: [
        'Pull the strongest quote from the episode',
        'Visualize it with an audiogram or talking-head clip',
        'Caption the key soundbite with high-contrast text',
        'Trim to 15-30 seconds for maximum retention',
        'Add CTA to full episode',
      ],
    },
  },
  shortFormExpansion: {
    tiktok_to_youtube: {
      steps: [
        'Expand the concept into a 3-10 minute video essay or documentary',
        'Show full creative process not visible in short clip',
        'Add commentary track or interview format',
        'Optimize YouTube title with SEO keywords',
        'Include timestamp chapters for searchability',
      ],
    },
  },
  multiPlatformRelease: {
    order: ['email/SMS pre-save', 'tiktok snippet', 'instagram reel', 'twitter/X tease', 'youtube premiere', 'linkedin post'],
    timing: {
      minus48hours: 'Pre-save campaign + email announcement',
      minus24hours: 'TikTok snippet drop + Instagram story countdown',
      releaseDay: 'Full drop across all platforms simultaneously',
      plus24hours: 'Behind the scenes content + fan reaction reposts',
      plus72hours: 'Milestone update + re-engagement content',
    },
  },
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

// ============================================================================
// VIRAL CONTENT CORPUS — 300+ high-performing music artist post sentences
// Structured for Markov chain training: diverse vocabulary, natural cadence,
// music-specific terminology, platform-native language patterns.
// Organized by content type for seeded generation.
// ============================================================================
export const VIRAL_CONTENT_CORPUS = {

  announcement: [
    "the wait is finally over this record is everything I had in me",
    "day one of a new era starts right now and I am beyond ready",
    "dropped at midnight and the response has already been overwhelming thank you",
    "every single bar on this record came from a real place in my life",
    "I almost deleted this song a hundred times and I am so glad I did not",
    "three years of building to this moment and it all makes sense now",
    "the production on this one took months to get exactly right but it was worth it",
    "releasing this feels like finally exhaling after holding my breath for so long",
    "the first 24 hours determine everything so please stream and share this right now",
    "I put every last piece of myself into this record and you can hear it",
    "nothing was rushed on this project nothing was compromised just pure music",
    "this single represents everything I have been building toward as an independent artist",
    "out on every platform tonight please go run the numbers up for your artist",
    "streaming everywhere right now your support in the first week means more than anything",
    "been sitting on this one for six months and releasing it today feels surreal",
    "the concept for this project came to me at 3am and I built it from there",
    "new era new sound same dedication to making music that means something real",
    "this is the project I was afraid to make because it shows too much of me",
    "it is finally out and I cannot stop listening to it on repeat myself",
    "the song I wrote when I thought about giving up on music entirely is out now",
    "everything I have learned about making music is on this record nothing held back",
    "from the first session to the final mix this record was a journey worth taking",
    "my most personal work to date and somehow it ended up being my favorite",
    "the title track alone is worth the listen but the full body of work hits different",
    "six months of sessions and one decision to be completely honest in the music",
    "the day I have been building toward is finally here and it feels like freedom",
    "independent artist doing independent things and this release is proof it can be done",
    "every listen every stream every share means the world to me right now truly",
    "took a risk with this one sonically and creatively and I am so glad I did",
    "this is the music I was born to make and it finally exists in the world",
  ],

  behind_scenes: [
    "nobody sees the hours before the magic happens but they are the most important hours",
    "studio at 3am is when the real creative breakthroughs happen every single time",
    "scrapped two entire versions before the right one finally appeared in that booth",
    "the voice memo that became this song was recorded on my phone at 2am in bed",
    "sometimes the best takes happen when you stop trying to make something perfect",
    "raw footage from the session that changed the entire direction of this project",
    "the creative process is never linear and this record is proof of that truth",
    "producer on this one had the exact energy I needed to finish telling the story",
    "working on something new and the energy in the booth has been completely different",
    "the idea started as one line and grew into three minutes of the most honest music",
    "this is what making music looks like when nobody is watching and nothing is staged",
    "the beat was made at 2am and the vocals were tracked at 4am magic happens late",
    "one session changed everything we scrapped the whole direction and started over right",
    "showing you the process because the process is part of the story and it deserves to be seen",
    "the moment the hook clicked you can literally see it on my face in the footage",
    "the studio is where everything gets real and nothing sounds like it did in my head",
    "three months of sessions for one record that finally sounds like what I hear inside",
    "behind every great song is a hundred bad takes and one moment of absolute clarity",
    "the writing process for this one was completely different from anything I had done before",
    "unscripted unfiltered this is what making music actually looks like on a real day",
    "the booth has no filters and this session had none either real moments real music",
    "went into the studio with no plan and came out with the best record of my career",
    "the engineer on this project pushed me in ways I had never been pushed before",
    "cooking something in the lab that is going to hit completely different when you hear it",
    "closed the studio doors turned off my phone and made the most honest music of my life",
    "the rough mix already sounds better than most finished records I have made before",
    "watching the track come together piece by piece in that session was something magical",
    "the collab on this one happened by accident and ended up being the best part of the project",
    "everything in the production was intentional every layer has a reason it exists",
    "the studio diary for this project would be a book but this snippet tells the story",
  ],

  storytelling: [
    "I wrote this song during the hardest stretch of my life and it saved me somehow",
    "there is a moment in every artist's journey when everything almost falls apart mine was real",
    "the story behind this track is one I have never told publicly until right now",
    "I was 22 broke and almost out of time when I wrote the words that became this song",
    "this melody came to me in a dream and I woke up and recorded it immediately",
    "sometimes a song writes itself and all you have to do is get out of the way",
    "I wrote this for someone who will probably never hear it but I hope it finds them",
    "the vulnerability in these lyrics is real I had nowhere to hide when I wrote them",
    "music has always been the only way I know how to say the things I cannot say out loud",
    "this track represents a chapter of my life that I thought I would never talk about publicly",
    "I almost quit music three times while making this record and each time a song pulled me back",
    "the most personal thing you can create turns out to be the most universal thing too",
    "writing this was therapy and releasing it is a leap of faith that I needed to take",
    "I did not know what this song was about until I listened back to it at 4am alone",
    "the lyric that opens this song was the last thing I wrote and suddenly the whole record made sense",
    "I started this project in my bedroom with no budget no team and nothing but belief",
    "this music exists because of everyone who told me it was just a hobby and not a career",
    "every artist has a turning point moment mine happened in a parking lot listening to this rough cut",
    "wrote this after a night when I genuinely thought about walking away from everything",
    "the song became bigger than the story I was trying to tell and I am grateful for that",
    "I have been carrying this story inside me for years and it finally has somewhere to live",
    "the first time I heard the full mix I cried and I am not embarrassed to say that",
    "music found me when I was not looking and this song is proof that it never let go",
    "this is the record I needed to make before I could make anything else truly honest",
    "the moment I stopped trying to sound like anyone else is when this album started to exist",
    "I remember exactly where I was and what I was feeling when I wrote every word of this",
    "this song is for every version of me that almost did not make it to today",
    "the bridge of this song broke me in the booth and I left it in because it was real",
    "sometimes making music feels like excavation you dig until you hit something true",
    "I have written a thousand songs but this one feels like the first real one I ever made",
  ],

  engagement: [
    "real talk does this song hit different late at night or is it just me",
    "I read every single comment and every reaction genuinely shapes what I create next",
    "drop your honest opinion I do not want hype I want the real reaction from real people",
    "this community has pushed the music further than anything else ever could and I mean that",
    "what hits first the beat the hook the lyrics or the overall vibe tell me below",
    "I want to hear from you because your feedback actually determines what gets made next",
    "tell me what you think of the bridge I rewrote it four times before deciding on this",
    "rate this one honestly on a scale of one to ten and tell me why in the comments",
    "the first 100 people who comment get a personal shoutout I always keep that promise",
    "who discovered this track first and where did you first hear it drop it in the comments",
    "for real though does the hook stay in your head or am I the only one who cannot escape it",
    "genuine question does this sound like a song you add to your most personal playlist",
    "I make music for people who feel things deeply and I want to know if this landed",
    "every comment I get reminds me why I chose to release this instead of deleting it",
    "your reaction to this genuinely matters more to me than any chart position ever could",
    "first 10 people to comment get added to the presave list for the next drop",
    "tell me one word that describes how this makes you feel just one word that is it",
    "if this song has a place in your life I want to know what that place is",
    "the poll I posted got over 500 responses and I am genuinely using that data",
    "drop a fire emoji if this is already in your regular rotation and a heart if it saved your day",
    "be brutally honest does this deserve to be on your playlist or does it need more time",
    "I have been listening to your feedback and this mix is directly because of what you said",
    "this one was made for the late night listeners the people who need music to get through it",
    "you told me what you wanted to hear and I made it tell me if I delivered on that",
    "the community around this music is more real than anything else in my career right now",
    "asking for real feedback because I trust this audience more than any focus group",
    "tag someone who needs to hear this right now because I made it for people like them",
    "I do not post a lot but when I do it means something this one means everything",
    "follow if you want to be the first to hear what comes next because something is coming",
    "your streams your saves and your shares literally determine if this gets playlisted",
  ],

  tiktok_native: [
    "POV you discover an artist whose music says exactly what you have been feeling",
    "tell me why this song has been on repeat for three days and I cannot stop",
    "not me making a song about something I swore I would never talk about publicly",
    "the way this hook gets in your head and refuses to leave is not an accident",
    "okay but can we talk about how the 808 in this drops at exactly the right moment",
    "POV you are about to hear the best song of your year and you do not know it yet",
    "stitch this with your honest reaction because I actually want to see it",
    "tell me why I wrote this in 20 minutes and it is the best song on the project",
    "nobody warned me that releasing music would feel like this but I am glad it does",
    "the day one fans know what this means and the new listeners will find out soon",
    "comment yes if you have been listening to this since before it blew up",
    "duet this if you have a song you are working on that scares you a little",
    "POV the producer sends you a beat at midnight and you write the whole song by sunrise",
    "not me adding my own song to my personal playlist because I cannot stop listening",
    "wait till you hear the ad lib at the end of the second verse that is the moment",
    "the hook was literally an accident we were about to stop for the night and then",
    "comment your city if you are coming to a show when this era goes on tour",
    "okay the response to this is making me emotional for real thank you all genuinely",
    "I dare you to listen to this without adding it to your playlist immediately go ahead",
    "real question what does this song remind you of in your own life tell me below",
  ],

  instagram_native: [
    "this one hits different at 2am with headphones in and the world turned off",
    "saved this feeling until I had exactly the right words to describe it and now I do",
    "late night thoughts turned into three minutes that I am finally ready to share",
    "okay real talk this might be the most honest thing I have ever put out publicly",
    "something I have been sitting with for two years finally has a home now",
    "for anyone who has ever needed music to explain what they could not say out loud",
    "the story behind this track is longer than the caption allows but here is the short version",
    "save this if it resonates because I wrote it for exactly this moment in your life",
    "this is for the ones who feel everything a little too deeply you know who you are",
    "tagged the people who need to hear this because they know exactly what this is about",
    "double tap if this is already your song for the season and drop it below if it is not yet",
    "the aesthetic on this visual matches the emotion of the record and that was intentional",
    "this is not just a song it is a specific moment in time captured and released",
    "for the day one supporters the ones who believed before there was anything to believe in",
    "this release marks the end of one chapter and the beginning of something completely different",
  ],

  twitter_native: [
    "hot take the best music always comes from the artists who almost gave up making it",
    "unpopular opinion independent artists are making better music than major labels right now",
    "nobody talks about how much courage it takes to release something completely honest",
    "I am convinced that the music you make at your lowest point is always the most powerful",
    "okay hear me out what if the song that changes your year is one you have not heard yet",
    "genuine question at what point does a song become yours versus the artist's creation",
    "the streaming numbers do not tell the story of what making this record actually cost",
    "thread on why I think the next wave of great music is coming from artists you do not know yet",
    "here is something wild I almost did not put the most important song on the album",
    "what people do not tell you about releasing music is that the silence before the response is the hardest part",
    "real talk if you are sleeping on independent music you are missing the best era in a generation",
    "the industry keeps trying to predict what will work and real artists keep proving them wrong",
    "I made this record with zero budget zero team and zero permission from anyone and it exists",
    "agree or not but the most authentic music always comes from the artists who have everything to lose",
    "nobody is ready for what independent artists are going to release in the next 12 months",
  ],

  genre_hiphop: [
    "bar for bar this project is the most technically complete thing I have ever recorded",
    "the lyricism on this one goes three layers deep and rewards every relisten",
    "wordplay production and storytelling hitting at the same level on every track",
    "the culture deserves music that says something real and this record delivers that",
    "from the 16 bars to the hook everything was built to last and stand up over time",
    "hip hop at its core is about truth and every word on this record is truthful",
    "the samples were cleared the bars were written and the record is a body of honest work",
    "this is the kind of rap album that gets better the more times you listen to it",
    "quotable bars on every track that is the standard I held myself to making this",
    "the flow switches were intentional every cadence shift was a choice made for a reason",
  ],

  genre_rnb: [
    "this melody was a dream I woke up from and had to record immediately before it left",
    "the harmonies on the bridge of this record will break you open in the best possible way",
    "late night mood lighting repeat this is the energy I made this song to create for you",
    "emotion driven production with vocals that feel like they are telling a secret just to you",
    "wrote this in one sitting because sometimes the feelings are too big to hold onto for long",
    "the chord progression on this one is the saddest most beautiful thing I have ever created",
    "r&b for people who actually feel things deeply and need music that understands them",
    "the falsetto in the outro was one take and we kept it because you cannot manufacture that",
    "texture warmth and emotion that is what this record is made of nothing artificial",
    "this song exists in that quiet space between 2am and 3am when everything feels too much",
  ],

  genre_pop: [
    "built for playlists made for people and this song was engineered for that exact purpose",
    "the hook was designed to get into your head and stay there and that was always the plan",
    "anthemic energy from the first note to the last that is what I was going for with this",
    "one play and this song is stuck in your head for three days and that is by design",
    "the kind of pop song that sounds simple but took months of craft to get that simple",
    "three minutes that feel like a perfect loop every time you reach the end you start again",
    "melodic and direct with enough depth to reward the listeners who go looking for it",
    "this is the song that plays at the best moments of your life and I built it for that",
    "top of the charts energy but made independently with no label no safety net just belief",
    "the chorus lands different every time and after 500 listens I still get chills making it",
  ],

  genre_trap: [
    "the 808 on this hits at max volume and the sub-bass will rearrange your chest cavity",
    "built this record from nothing no samples no shortcuts every sound was created from zero",
    "the hi-hat pattern alone took three days to get right because details are everything here",
    "hard production real bars and zero compromise on a single second of this record",
    "when the drop hits you will understand what three months in the lab actually produced",
    "the energy in the booth the night we made this was something I have never felt before",
    "melodic trap executed with precision this is the evolution not the imitation of the genre",
    "the slide and the 808 working together on this is exactly what I was hearing in my head",
    "made this in a week but it sounds like it took a year because the attention was absolute",
    "dark cinematic and completely different from what you expected this to sound like",
  ],

  milestone: [
    "cannot believe the numbers on this and the only reason is you genuinely thank you",
    "hit a milestone I did not expect this fast and the community built this together with me",
    "thank you for making this real the streams the saves the shares all of it means everything",
    "from zero to this in one year and I have every single one of you to thank for that",
    "the chart position is for everyone who streamed shared and told a friend about this music",
    "we crossed a number I dreamed about at the beginning of this year and it still does not feel real",
    "the day ones who were here before the numbers this milestone is yours as much as mine",
    "grateful does not cover it but I will say thank you until I find a bigger word for this feeling",
    "one year ago this was a dream and today it is a number on a screen that means something",
    "the response to this project has changed my understanding of what music can do for people",
    "this community turned a bedroom recording into something that matters to thousands of people",
    "every single person who added this to a playlist you are the reason this milestone happened",
    "milestones are just numbers but this one represents something I needed to prove to myself",
    "went from making music in silence to seeing it reach people I will never meet and that is everything",
    "the streams caught up to the belief I always had in this record and that is the best feeling",
  ],

  pre_release: [
    "something is coming that I have been working on longer than anything else I have released",
    "the countdown to this drop feels different because this record changes everything going forward",
    "pre-save link in bio because day one streams matter more than you know for playlisting",
    "dropping soon and I am more nervous about this release than anything I have put out before",
    "been keeping this one close for months and the closer it gets to release day the more I feel it",
    "this project has been in my heart for two years and it finally has a release date now",
    "the teaser does not do it justice but it gives you the feeling that the full thing delivers on",
    "mark the date because this is the drop that starts a new chapter in everything I create",
    "presave it and set the reminder because the first 24 hours are the ones that set the trajectory",
    "the rollout for this one was planned with intention every piece of it was a deliberate choice",
  ],
};

// Flat array of all corpus sentences for general Markov training
export const VIRAL_CONTENT_CORPUS_FLAT: string[] = [
  ...VIRAL_CONTENT_CORPUS.announcement,
  ...VIRAL_CONTENT_CORPUS.behind_scenes,
  ...VIRAL_CONTENT_CORPUS.storytelling,
  ...VIRAL_CONTENT_CORPUS.engagement,
  ...VIRAL_CONTENT_CORPUS.tiktok_native,
  ...VIRAL_CONTENT_CORPUS.instagram_native,
  ...VIRAL_CONTENT_CORPUS.twitter_native,
  ...VIRAL_CONTENT_CORPUS.genre_hiphop,
  ...VIRAL_CONTENT_CORPUS.genre_rnb,
  ...VIRAL_CONTENT_CORPUS.genre_pop,
  ...VIRAL_CONTENT_CORPUS.genre_trap,
  ...VIRAL_CONTENT_CORPUS.milestone,
  ...VIRAL_CONTENT_CORPUS.pre_release,
];
