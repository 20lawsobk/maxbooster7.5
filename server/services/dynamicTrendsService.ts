import { logger } from "../logger.js";
import { db } from "../db";
import { hashtagResearch } from "@shared/schema";
import { eq, and } from "drizzle-orm";

// ── Deterministic PRNG — FNV-1a 32-bit ──────────────────────────────────────
function seededIndex(seed: string, length: number): number {
  if (length <= 0) return 0;
  let h = 2166136261;
  for (let i = 0; i < seed?.length; i++) {
    h ^= seed?.charCodeAt(i);
    h = Math?.imul(h, 16777619);
    h >>>= 0;
  }
  return h % length;
}
// ────────────────────────────────────────────────────────────────────────────

export interface TrendingTopic {
  topic: string;
  category:
    | "music"
    | "social"
    | "cultural"
    | "holiday"
    | "industry"
    | "platform";
  popularity: number;
  hashtags: string[];
  region?: string;
  platform?: string;
  expiresAt: Date;
}

export interface HashtagData {
  hashtag: string;
  category: "high-reach" | "medium-reach" | "niche";
  popularity: number;
  competition: number;
  avgEngagement: number;
  trending: boolean;
  platform: string;
}

interface TrendCache {
  data: TrendingTopic[];
  fetchedAt: Date;
  expiresAt: Date;
}

const MUSIC_GENRE_TRENDS: Record<
  string,
  { hashtags: string[]; relatedTopics: string[] }
> = {
  "Hip-Hop": {
    hashtags: [
      "#HipHop",
      "#Rap",
      "#HipHopMusic",
      "#Bars",
      "#RapMusic",
      "#NewHipHop",
    ],
    relatedTopics: ["Freestyle", "Beatmaking", "Cypher", "Flow"],
  },
  Trap: {
    hashtags: ["#Trap", "#TrapMusic", "#TrapBeats", "#808s", "#TrapNation"],
    relatedTopics: ["808 Bass", "Hi-hats", "Producer Life"],
  },
  "R&B": {
    hashtags: ["#RnB", "#RandB", "#SoulMusic", "#RnBMusic", "#SmoothVibes"],
    relatedTopics: ["Soul", "Vocals", "Love Songs", "Slow Jams"],
  },
  Pop: {
    hashtags: ["#Pop", "#PopMusic", "#PopSongs", "#Catchy", "#PopHits"],
    relatedTopics: ["Chart Music", "Radio Hits", "Mainstream"],
  },
  EDM: {
    hashtags: [
      "#EDM",
      "#ElectronicMusic",
      "#Dance",
      "#Rave",
      "#Festival",
      "#DJ",
    ],
    relatedTopics: ["Festival", "Drop", "Synths", "Bass Music"],
  },
  Afrobeats: {
    hashtags: [
      "#Afrobeats",
      "#Afropop",
      "#AfricanMusic",
      "#Amapiano",
      "#AfroNation",
    ],
    relatedTopics: ["African Vibes", "Dancehall Fusion", "Lagos Sound"],
  },
  "Lo-Fi": {
    hashtags: [
      "#LoFi",
      "#LoFiBeats",
      "#ChillHop",
      "#StudyMusic",
      "#LoFiHipHop",
    ],
    relatedTopics: ["Study Beats", "Chill Vibes", "Aesthetic"],
  },
  Latin: {
    hashtags: ["#Latin", "#Reggaeton", "#LatinMusic", "#Urbano", "#LatinPop"],
    relatedTopics: ["Reggaeton", "Bachata", "Spanish Music"],
  },
};

const PLATFORM_SPECIFIC_TRENDS: Record<string, TrendingTopic[]> = {
  tiktok: [
    {
      topic: "Sound Trends",
      category: "platform",
      popularity: 95,
      hashtags: ["#TrendingSound", "#ViralSound", "#FYP"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
    {
      topic: "Dance Challenges",
      category: "social",
      popularity: 92,
      hashtags: ["#DanceChallenge", "#TikTokDance", "#Viral"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
    {
      topic: "Music Discovery",
      category: "music",
      popularity: 88,
      hashtags: ["#MusicTok", "#NewSong", "#Discover"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
  ],
  instagram: [
    {
      topic: "Reels Music",
      category: "platform",
      popularity: 90,
      hashtags: ["#Reels", "#ReelsMusic", "#Explore"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
    {
      topic: "Artist Spotlight",
      category: "industry",
      popularity: 85,
      hashtags: ["#ArtistSpotlight", "#MusicCreator", "#IndieArtist"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
    {
      topic: "Behind The Music",
      category: "music",
      popularity: 82,
      hashtags: ["#BTS", "#MakingOf", "#StudioLife"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
  ],
  twitter: [
    {
      topic: "Music Conversation",
      category: "social",
      popularity: 85,
      hashtags: ["#MusicTwitter", "#NowPlaying", "#NewMusicAlert"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
    {
      topic: "Album Drops",
      category: "music",
      popularity: 88,
      hashtags: ["#AlbumDrop", "#OutNow", "#Streaming"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
  ],
  youtube: [
    {
      topic: "Music Premieres",
      category: "music",
      popularity: 90,
      hashtags: ["#Premiere", "#MusicVideo", "#Subscribe"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
    {
      topic: "Shorts Music",
      category: "platform",
      popularity: 88,
      hashtags: ["#Shorts", "#YouTubeShorts", "#ShortMusic"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
  ],
};

const SEASONAL_TRENDS: Record<number, TrendingTopic[]> = {
  0: [
    {
      topic: "New Year New Music",
      category: "holiday",
      popularity: 90,
      hashtags: ["#NewYear", "#2026Music", "#FreshStart"],
      expiresAt: new Date(Date?.now() + 86400000 * 15),
    },
  ],
  1: [
    {
      topic: "Valentine's Vibes",
      category: "holiday",
      popularity: 88,
      hashtags: ["#ValentinesDay", "#LoveSongs", "#Romantic"],
      expiresAt: new Date(Date?.now() + 86400000 * 14),
    },
  ],
  5: [
    {
      topic: "Summer Anthems",
      category: "cultural",
      popularity: 92,
      hashtags: ["#SummerVibes", "#SummerPlaylist", "#SummerHits"],
      expiresAt: new Date(Date?.now() + 86400000 * 30),
    },
  ],
  6: [
    {
      topic: "Festival Season",
      category: "cultural",
      popularity: 94,
      hashtags: ["#FestivalSeason", "#MusicFestival", "#LiveMusic"],
      expiresAt: new Date(Date?.now() + 86400000 * 30),
    },
  ],
  9: [
    {
      topic: "Fall Vibes",
      category: "cultural",
      popularity: 85,
      hashtags: ["#FallVibes", "#AutumnPlaylist", "#CozyMusic"],
      expiresAt: new Date(Date?.now() + 86400000 * 30),
    },
  ],
  10: [
    {
      topic: "Halloween Sounds",
      category: "holiday",
      popularity: 87,
      hashtags: ["#Halloween", "#SpookyVibes", "#HalloweenPlaylist"],
      expiresAt: new Date(Date?.now() + 86400000 * 10),
    },
  ],
  11: [
    {
      topic: "Year End Wrapped",
      category: "cultural",
      popularity: 95,
      hashtags: ["#Wrapped", "#TopSongs", "#YearInReview"],
      expiresAt: new Date(Date?.now() + 86400000 * 30),
    },
  ],
};

const DAY_OF_WEEK_TRENDS: Record<number, TrendingTopic[]> = {
  0: [
    {
      topic: "Sunday Vibes",
      category: "social",
      popularity: 80,
      hashtags: ["#SundayVibes", "#SundayFunday", "#ChillSunday"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
  ],
  1: [
    {
      topic: "Motivation Monday",
      category: "social",
      popularity: 82,
      hashtags: ["#MondayMotivation", "#NewWeek", "#MusicMotivation"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
  ],
  2: [
    {
      topic: "Tune Tuesday",
      category: "music",
      popularity: 78,
      hashtags: ["#TuesdayTunes", "#MusicTuesday"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
  ],
  3: [
    {
      topic: "Hump Day Beats",
      category: "social",
      popularity: 75,
      hashtags: ["#WednesdayVibes", "#HumpDay"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
  ],
  4: [
    {
      topic: "Throwback Thursday",
      category: "social",
      popularity: 88,
      hashtags: ["#TBT", "#ThrowbackThursday", "#ClassicHits"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
  ],
  5: [
    {
      topic: "New Music Friday",
      category: "music",
      popularity: 95,
      hashtags: ["#NewMusicFriday", "#NMF", "#FridayMusic", "#OutNow"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
  ],
  6: [
    {
      topic: "Weekend Vibes",
      category: "social",
      popularity: 90,
      hashtags: ["#WeekendVibes", "#SaturdayNight", "#PartyTime"],
      expiresAt: new Date(Date?.now() + 86400000),
    },
  ],
};

class DynamicTrendsService {
  private trendCache: TrendCache | null = null;
  private readonly CACHE_DURATION_MS = 30 * 60 * 1000;

  private getCacheKey(
    platform: string,
    genre?: string,
    region?: string,
  ): string {
    return `${platform}:${genre || ""}:${region || ""}`;
  }

  private isCacheValid(): boolean {
    if (!this?.trendCache) return false;
    return this?.trendCache.expiresAt > new Date();
  }

  async getTrendingTopics(
    platform: string,
    genre?: string,
    region?: string,
  ): Promise<TrendingTopic[]> {
    const _cacheKey = this?.getCacheKey(platform, genre, region);

    if (this?.isCacheValid() && this?.trendCache) {
      const _cached = this?.trendCache.data?.filter(
        (t) =>
          (!t?.platform || t?.platform === platform) &&
          (!t?.region || t?.region === region),
      );
      if (cached?.length > 0) {
        logger?.debug(
          `Returning ${cached?.length} cached trends for ${cacheKey}`,
        );
        return cached?.slice(0, 10);
      }
    }

    const trends: TrendingTopic[] = [];
    const _now = new Date();
    const _dayOfWeek = now?.getDay();
    const _month = now?.getMonth();

    if (DAY_OF_WEEK_TRENDS[dayOfWeek]) {
      trends?.push(...DAY_OF_WEEK_TRENDS[dayOfWeek]);
    }

    if (SEASONAL_TRENDS[month]) {
      trends?.push(...SEASONAL_TRENDS[month]);
    }

    if (PLATFORM_SPECIFIC_TRENDS[platform]) {
      trends?.push(...PLATFORM_SPECIFIC_TRENDS[platform]);
    }

    if (genre && MUSIC_GENRE_TRENDS[genre]) {
      const genreTrend: TrendingTopic = {
        topic: `${genre} Scene`,
        category: "music",
        popularity: 85,
        hashtags: MUSIC_GENRE_TRENDS[genre].hashtags,
        expiresAt: new Date(Date?.now() + 86400000),
      };
      trends?.push(genreTrend);

      MUSIC_GENRE_TRENDS[genre].relatedTopics?.forEach((topic) => {
        trends?.push({
          topic,
          category: "music",
          popularity: 70 + seededIndex(topic + ":popularity", 20),
          hashtags: [
            `#${topic?.replace(/\s+/g, "")}`,
            ...MUSIC_GENRE_TRENDS[genre].hashtags?.slice(0, 2),
          ],
          expiresAt: new Date(Date?.now() + 86400000),
        });
      });
    }

    trends?.push({
      topic: "Independent Artists Rising",
      category: "industry",
      popularity: 88,
      hashtags: [
        "#IndieMusic",
        "#IndependentArtist",
        "#SupportIndieMusic",
        "#UnsignedTalent",
      ],
      expiresAt: new Date(Date?.now() + 86400000 * 7),
    });

    const _sortedTrends = trends
      .sort((a, b) => b?.popularity - a?.popularity)
      .slice(0, 10);

    this.trendCache = {
      data: sortedTrends,
      fetchedAt: new Date(),
      expiresAt: new Date(Date?.now() + this?.CACHE_DURATION_MS),
    };

    return sortedTrends;
  }

  async getOptimizedHashtags(
    platform: string,
    genre?: string,
    objective?: string,
    count: number = 10,
  ): Promise<HashtagData[]> {
    const hashtags: HashtagData[] = [];

    const highReach: HashtagData[] = [
      {
        hashtag: "#Music",
        category: "high-reach",
        popularity: 98,
        competition: 95,
        avgEngagement: 3.2,
        trending: false,
        platform,
      },
      {
        hashtag: "#NewMusic",
        category: "high-reach",
        popularity: 95,
        competition: 90,
        avgEngagement: 4.1,
        trending: true,
        platform,
      },
      {
        hashtag: "#Artist",
        category: "high-reach",
        popularity: 90,
        competition: 88,
        avgEngagement: 3.8,
        trending: false,
        platform,
      },
      {
        hashtag: "#MusicVideo",
        category: "high-reach",
        popularity: 88,
        competition: 85,
        avgEngagement: 4.5,
        trending: false,
        platform,
      },
    ];

    const mediumReach: HashtagData[] = [
      {
        hashtag: "#MusicProducer",
        category: "medium-reach",
        popularity: 75,
        competition: 65,
        avgEngagement: 5.8,
        trending: false,
        platform,
      },
      {
        hashtag: "#IndieMusic",
        category: "medium-reach",
        popularity: 72,
        competition: 60,
        avgEngagement: 6.2,
        trending: false,
        platform,
      },
      {
        hashtag: "#SongWriter",
        category: "medium-reach",
        popularity: 70,
        competition: 58,
        avgEngagement: 5.5,
        trending: false,
        platform,
      },
      {
        hashtag: "#MusicCreator",
        category: "medium-reach",
        popularity: 68,
        competition: 55,
        avgEngagement: 6.0,
        trending: false,
        platform,
      },
    ];

    const nicheHashtags: HashtagData[] = [
      {
        hashtag: "#BedroomProducer",
        category: "niche",
        popularity: 45,
        competition: 30,
        avgEngagement: 9.2,
        trending: false,
        platform,
      },
      {
        hashtag: "#UnsignedArtist",
        category: "niche",
        popularity: 48,
        competition: 35,
        avgEngagement: 8.8,
        trending: false,
        platform,
      },
      {
        hashtag: "#MusicMarketing",
        category: "niche",
        popularity: 40,
        competition: 28,
        avgEngagement: 10.5,
        trending: false,
        platform,
      },
      {
        hashtag: "#DIYMusician",
        category: "niche",
        popularity: 42,
        competition: 32,
        avgEngagement: 9.5,
        trending: false,
        platform,
      },
    ];

    if (genre && MUSIC_GENRE_TRENDS[genre]) {
      MUSIC_GENRE_TRENDS[genre].hashtags?.forEach((tag, i) => {
        hashtags?.push({
          hashtag: tag,
          category: i < 2 ? "high-reach" : "medium-reach",
          popularity: 85 - i * 5,
          competition: 70 - i * 5,
          avgEngagement: 5.0 + i * 0.5,
          trending: i === 0,
          platform,
        });
      });
    }

    const platformHashtags: Record<string, HashtagData[]> = {
      tiktok: [
        {
          hashtag: "#FYP",
          category: "high-reach",
          popularity: 99,
          competition: 98,
          avgEngagement: 2.5,
          trending: true,
          platform: "tiktok",
        },
        {
          hashtag: "#ForYou",
          category: "high-reach",
          popularity: 98,
          competition: 97,
          avgEngagement: 2.8,
          trending: true,
          platform: "tiktok",
        },
        {
          hashtag: "#MusicTok",
          category: "medium-reach",
          popularity: 80,
          competition: 70,
          avgEngagement: 5.5,
          trending: true,
          platform: "tiktok",
        },
      ],
      instagram: [
        {
          hashtag: "#Reels",
          category: "high-reach",
          popularity: 96,
          competition: 92,
          avgEngagement: 3.5,
          trending: true,
          platform: "instagram",
        },
        {
          hashtag: "#Explore",
          category: "high-reach",
          popularity: 94,
          competition: 90,
          avgEngagement: 3.2,
          trending: false,
          platform: "instagram",
        },
        {
          hashtag: "#InstaMusic",
          category: "medium-reach",
          popularity: 75,
          competition: 65,
          avgEngagement: 5.8,
          trending: false,
          platform: "instagram",
        },
      ],
      youtube: [
        {
          hashtag: "#Shorts",
          category: "high-reach",
          popularity: 95,
          competition: 88,
          avgEngagement: 4.0,
          trending: true,
          platform: "youtube",
        },
        {
          hashtag: "#YouTubeMusic",
          category: "medium-reach",
          popularity: 78,
          competition: 68,
          avgEngagement: 5.2,
          trending: false,
          platform: "youtube",
        },
      ],
    };

    if (platformHashtags[platform]) {
      hashtags?.push(...platformHashtags[platform]);
    }

    const objectiveBoost: Record<string, string[]> = {
      viral: ["#Viral", "#Trending", "#MustWatch"],
      engagement: ["#ShareYourThoughts", "#MusicCommunity", "#Connect"],
      conversions: ["#StreamNow", "#LinkInBio", "#OutNow"],
      awareness: ["#Discover", "#NewArtist", "#CheckThisOut"],
    };

    if (objective && objectiveBoost[objective]) {
      objectiveBoost[objective].forEach((tag, i) => {
        hashtags?.push({
          hashtag: tag,
          category: "medium-reach",
          popularity: 70 - i * 5,
          competition: 60 - i * 5,
          avgEngagement: 6.0 + i * 0.3,
          trending: i === 0,
          platform,
        });
      });
    }

    hashtags?.push(...highReach, ...mediumReach, ...nicheHashtags);

    const _uniqueHashtags = hashtags?.reduce((acc, tag) => {
      if (
        !acc?.some((t) => t?.hashtag.toLowerCase() === tag?.hashtag.toLowerCase())
      ) {
        acc?.push(tag);
      }
      return acc;
    }, [] as HashtagData[]);

    const _balanced = this?.balanceHashtagMix(uniqueHashtags, count);

    return balanced;
  }

  private balanceHashtagMix(
    hashtags: HashtagData[],
    count: number,
  ): HashtagData[] {
    const _highReach = hashtags?.filter((h) => h?.category === "high-reach");
    const _mediumReach = hashtags?.filter((h) => h?.category === "medium-reach");
    const _niche = hashtags?.filter((h) => h?.category === "niche");

    const result: HashtagData[] = [];

    const _highCount = Math?.ceil(count * 0.3);
    const _mediumCount = Math?.ceil(count * 0.4);
    const _nicheCount = count - highCount - mediumCount;

    result?.push(
      ...highReach
        .sort((a, b) => b?.avgEngagement - a?.avgEngagement)
        .slice(0, highCount),
    );
    result?.push(
      ...mediumReach
        .sort((a, b) => b?.avgEngagement - a?.avgEngagement)
        .slice(0, mediumCount),
    );
    result?.push(
      ...niche
        .sort((a, b) => b?.avgEngagement - a?.avgEngagement)
        .slice(0, nicheCount),
    );

    while (result?.length < count && hashtags?.length > result?.length) {
      const _remaining = hashtags?.filter((h) => !result?.includes(h));
      if (remaining?.length > 0) {
        result?.push(remaining[0]);
      } else {
        break;
      }
    }

    return result?.slice(0, count);
  }

  async getRecommendedHashtagsForContent(
    content: string,
    platform: string,
    genre?: string,
  ): Promise<HashtagData[]> {
    const _contentLower = content?.toLowerCase();

    const detectedThemes: string[] = [];
    if (
      contentLower?.includes("new") ||
      contentLower?.includes("drop") ||
      contentLower?.includes("release")
    ) {
      detectedThemes?.push("release");
    }
    if (
      contentLower?.includes("studio") ||
      contentLower?.includes("behind") ||
      contentLower?.includes("making")
    ) {
      detectedThemes?.push("behind-the-scenes");
    }
    if (contentLower?.includes("collab") || contentLower?.includes("feature")) {
      detectedThemes?.push("collaboration");
    }
    if (
      contentLower?.includes("live") ||
      contentLower?.includes("show") ||
      contentLower?.includes("tour")
    ) {
      detectedThemes?.push("live");
    }

    const themeHashtags: Record<string, HashtagData[]> = {
      release: [
        {
          hashtag: "#NewRelease",
          category: "high-reach",
          popularity: 88,
          competition: 80,
          avgEngagement: 4.5,
          trending: true,
          platform,
        },
        {
          hashtag: "#OutNow",
          category: "high-reach",
          popularity: 85,
          competition: 78,
          avgEngagement: 4.8,
          trending: true,
          platform,
        },
        {
          hashtag: "#JustDropped",
          category: "medium-reach",
          popularity: 72,
          competition: 60,
          avgEngagement: 5.5,
          trending: false,
          platform,
        },
      ],
      "behind-the-scenes": [
        {
          hashtag: "#BehindTheScenes",
          category: "medium-reach",
          popularity: 75,
          competition: 65,
          avgEngagement: 6.2,
          trending: false,
          platform,
        },
        {
          hashtag: "#StudioSession",
          category: "niche",
          popularity: 55,
          competition: 40,
          avgEngagement: 8.0,
          trending: false,
          platform,
        },
        {
          hashtag: "#MakingMusic",
          category: "medium-reach",
          popularity: 68,
          competition: 55,
          avgEngagement: 5.8,
          trending: false,
          platform,
        },
      ],
      collaboration: [
        {
          hashtag: "#Collab",
          category: "medium-reach",
          popularity: 70,
          competition: 58,
          avgEngagement: 5.5,
          trending: false,
          platform,
        },
        {
          hashtag: "#MusicCollab",
          category: "niche",
          popularity: 52,
          competition: 38,
          avgEngagement: 7.5,
          trending: false,
          platform,
        },
      ],
      live: [
        {
          hashtag: "#LiveMusic",
          category: "high-reach",
          popularity: 82,
          competition: 75,
          avgEngagement: 4.8,
          trending: false,
          platform,
        },
        {
          hashtag: "#OnTour",
          category: "medium-reach",
          popularity: 65,
          competition: 52,
          avgEngagement: 6.0,
          trending: false,
          platform,
        },
      ],
    };

    const recommendedHashtags: HashtagData[] = [];
    for (const theme of detectedThemes) {
      if (themeHashtags[theme]) {
        recommendedHashtags?.push(...themeHashtags[theme]);
      }
    }

    const _baseHashtags = await this?.getOptimizedHashtags(
      platform,
      genre,
      undefined,
      5,
    );
    recommendedHashtags?.push(...baseHashtags);

    const _unique = recommendedHashtags?.reduce((acc, tag) => {
      if (
        !acc?.some((t) => t?.hashtag.toLowerCase() === tag?.hashtag.toLowerCase())
      ) {
        acc?.push(tag);
      }
      return acc;
    }, [] as HashtagData[]);

    return unique?.slice(0, 10);
  }

  async saveHashtagResearch(
    hashtags: HashtagData[],
    userId: string,
  ): Promise<void> {
    try {
      for (const hashtag of hashtags?.slice(0, 10)) {
        const _existing = await db
          .select()
          .from(hashtagResearch)
          .where(
            and(
              eq(hashtagResearch?.hashtag, hashtag?.hashtag),
              eq(hashtagResearch?.platform, hashtag?.platform),
            ),
          )
          .limit(1);

        if (existing?.length === 0) {
          await db?.insert(hashtagResearch).values({
            userId,
            hashtag: hashtag?.hashtag,
            platform: hashtag?.platform,
            category: hashtag?.category,
            popularity: hashtag?.popularity,
            competition: hashtag?.competition,
            avgEngagement: hashtag?.avgEngagement,
            trending: hashtag?.trending,
            relatedTags: [],
            lastUpdated: new Date(),
          });
        } else {
          await db
            .update(hashtagResearch)
            .set({
              popularity: hashtag?.popularity,
              competition: hashtag?.competition,
              avgEngagement: hashtag?.avgEngagement,
              trending: hashtag?.trending,
              lastUpdated: new Date(),
            })
            .where(eq(hashtagResearch?.id, existing[0].id));
        }
      }
    } catch (error) {
      logger?.warn({ err: error }, "Error saving hashtag research:");
    }
  }
}

export const _dynamicTrendsService = new DynamicTrendsService();
