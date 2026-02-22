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
