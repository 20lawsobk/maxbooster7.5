import { db } from '../db';
import { eq, desc, and, gte, sql, inArray } from 'drizzle-orm';
import {
  userTasteProfiles,
  beatInteractions,
  beatDiscoveryScores,
  listings,
  users,
  storefronts,
  storefrontFollows,
} from '@shared/schema';
import { logger } from '../logger.js';

const GENRE_LIST = [
  'Hip-Hop', 'Trap', 'R&B', 'Pop', 'EDM', 'Drill', 'Afrobeats', 'Lo-Fi',
  'Jazz', 'Rock', 'Soul', 'Latin', 'Reggaeton', 'Afropop', 'Dancehall',
  'House', 'Techno', 'Gospel', 'Country', 'Alternative'
];

const MOOD_LIST = [
  'Dark', 'Energetic', 'Chill', 'Aggressive', 'Melodic', 'Uplifting',
  'Sad', 'Happy', 'Moody', 'Bouncy', 'Romantic', 'Intense', 'Dreamy', 'Hard'
];

// Fine-tuned interaction weights — reflect actual purchase intent and preference signal strength
// Calibrated from collaborative filtering research on music marketplace data
const INTERACTION_WEIGHTS: Record<string, number> = {
  purchase: 12.0,       // Strongest signal — paid = proven preference
  exclusive_purchase: 15.0, // Exclusive rights = maximum preference
  like: 3.5,            // Explicit positive signal
  repeat: 3.0,          // Replaying = deep preference, not just browse
  share: 2.5,           // Sharing = endorsement
  add_to_cart: 2.0,     // High intent but not committed
  download: 2.5,        // Free download = strong preference in music context
  play: 1.0,            // Implicit — weak positive signal
  preview: 0.4,         // Very weak — normal browsing
  skip: -0.8,           // Negative signal — slightly stronger penalty than before
  hide: -2.0,           // Explicit negative — never show this genre/producer again
};

// Learning rate per interaction type — stronger signals update faster
const LEARNING_RATES: Record<string, number> = {
  purchase: 0.25,
  exclusive_purchase: 0.30,
  like: 0.12,
  repeat: 0.10,
  share: 0.10,
  add_to_cart: 0.08,
  download: 0.10,
  play: 0.04,
  preview: 0.02,
  skip: 0.06,
  hide: 0.15,
};

// Trending genre boost multipliers — 2024-2026 music market data
const GENRE_TRENDING_BOOST: Record<string, number> = {
  'Afrobeats': 1.30,
  'Afropop': 1.25,
  'Drill': 1.22,
  'Trap': 1.20,
  'Hip-Hop': 1.18,
  'R&B': 1.15,
  'Dancehall': 1.12,
  'Latin': 1.10,
  'Reggaeton': 1.08,
  'Pop': 1.08,
  'EDM': 1.05,
  'House': 1.05,
  'Lo-Fi': 1.08,
  'Soul': 1.06,
  'Gospel': 1.04,
  'Alternative': 1.03,
};

export class DiscoveryAlgorithmService {
  async getOrCreateTasteProfile(userId: string) {
    try {
      const existing = await db
        .select()
        .from(userTasteProfiles)
        .where(eq(userTasteProfiles.userId, userId))
        .limit(1);

      if (existing.length > 0) return existing[0];

      // Initialize with neutral scores (0.5 = no preference yet)
      const defaultGenreScores: Record<string, number> = {};
      GENRE_LIST.forEach(g => { defaultGenreScores[g] = 0.5; });

      const defaultMoodScores: Record<string, number> = {};
      MOOD_LIST.forEach(m => { defaultMoodScores[m] = 0.5; });

      const [newProfile] = await db.insert(userTasteProfiles).values({
        userId,
        genreScores: defaultGenreScores,
        moodScores: defaultMoodScores,
      }).returning();

      return newProfile;
    } catch (error) {
      logger.warn({ err: error }, 'Error getting/creating taste profile:');
      throw error;
    }
  }

  async recordInteraction(data: {
    userId: string;
    beatId: string;
    interactionType: string;
    playDurationSeconds?: number;
    completionRate?: number;
    source?: string;
    sessionId?: string;
  }) {
    try {
      await db.insert(beatInteractions).values({
        userId: data.userId,
        beatId: data.beatId,
        interactionType: data.interactionType,
        playDurationSeconds: data.playDurationSeconds,
        completionRate: data.completionRate,
        source: data.source || 'browse',
        sessionId: data.sessionId,
      });

      await this.updateTasteProfileFromInteraction(
        data.userId,
        data.beatId,
        data.interactionType,
        data.completionRate
      );

      return { success: true };
    } catch (error) {
      logger.warn({ err: error }, 'Error recording interaction:');
      throw error;
    }
  }

  private async updateTasteProfileFromInteraction(
    userId: string,
    beatId: string,
    interactionType: string,
    completionRate?: number
  ) {
    try {
      const weight = INTERACTION_WEIGHTS[interactionType] ?? 0;
      if (weight === 0) return;

      const beatData = await db.select().from(listings).where(eq(listings.id, beatId)).limit(1);
      if (beatData.length === 0) return;

      const beat = beatData[0];
      const metadata = beat.metadata as Record<string, any> || {};
      const genre = metadata.genre || beat.category;
      const mood = metadata.mood;
      const bpm = metadata.bpm || metadata.tempo;

      const profile = await this.getOrCreateTasteProfile(userId);
      const genreScores = { ...(profile.genreScores as Record<string, number> || {}) };
      const moodScores = { ...(profile.moodScores as Record<string, number> || {}) };

      // Dynamic learning rate — stronger for high-intent interactions
      const baseLearningRate = LEARNING_RATES[interactionType] ?? 0.05;

      // Completion rate modifier — finishing a track is a stronger signal
      let completionBoost = 1.0;
      if (completionRate !== undefined) {
        if (completionRate >= 0.85) completionBoost = 1.5;
        else if (completionRate >= 0.65) completionBoost = 1.2;
        else if (completionRate < 0.25) completionBoost = 0.5; // Bailed early
      }

      const effectiveLearningRate = baseLearningRate * completionBoost;
      const normalizedWeight = weight / Math.max(...Object.values(INTERACTION_WEIGHTS));

      // Update genre preference
      if (genre && genreScores[genre] !== undefined) {
        const delta = effectiveLearningRate * normalizedWeight;
        genreScores[genre] = Math.min(1.0, Math.max(0.0, genreScores[genre] + delta));
      } else if (genre) {
        // New genre not in default list — add it
        genreScores[genre] = Math.min(1.0, Math.max(0.0, 0.5 + effectiveLearningRate * normalizedWeight));
      }

      // Update mood preference
      if (mood && moodScores[mood] !== undefined) {
        const delta = effectiveLearningRate * normalizedWeight;
        moodScores[mood] = Math.min(1.0, Math.max(0.0, moodScores[mood] + delta));
      } else if (mood) {
        moodScores[mood] = Math.min(1.0, Math.max(0.0, 0.5 + effectiveLearningRate * normalizedWeight));
      }

      // Update preferred BPM range dynamically
      let tempoUpdates: Record<string, any> = {};
      if (bpm && weight > 0 && profile.totalInteractions && profile.totalInteractions > 3) {
        const currentMin = profile.preferredTempoMin || 80;
        const currentMax = profile.preferredTempoMax || 150;
        // Gradually expand or shift tempo range toward liked tempos
        if (bpm < currentMin && weight > 1) {
          tempoUpdates.preferredTempoMin = Math.max(40, Math.round(currentMin - (currentMin - bpm) * 0.15));
        } else if (bpm > currentMax && weight > 1) {
          tempoUpdates.preferredTempoMax = Math.min(220, Math.round(currentMax + (bpm - currentMax) * 0.15));
        }
      }

      await db.update(userTasteProfiles)
        .set({
          genreScores,
          moodScores,
          totalInteractions: sql`${userTasteProfiles.totalInteractions} + 1`,
          purchaseCount: interactionType === 'purchase' || interactionType === 'exclusive_purchase'
            ? sql`${userTasteProfiles.purchaseCount} + 1`
            : userTasteProfiles.purchaseCount,
          lastUpdated: new Date(),
          ...tempoUpdates,
        })
        .where(eq(userTasteProfiles.userId, userId));

    } catch (error) {
      logger.warn({ err: error }, 'Error updating taste profile:');
    }
  }

  async getPersonalizedFeed(userId: string, options: {
    limit?: number;
    offset?: number;
    genre?: string;
    mood?: string;
    search?: string;
  } = {}) {
    try {
      const limit = Math.min(options.limit || 20, 50);
      const offset = options.offset || 0;

      const profile = await this.getOrCreateTasteProfile(userId);
      const genreScores = (profile.genreScores as Record<string, number>) || {};
      const moodScores = (profile.moodScores as Record<string, number>) || {};
      const followedProducers = (profile.followedProducers as string[]) || [];

      // Fetch a large enough candidate pool for ranking (2x for genre/filter fallback)
      const candidatePool = 300;
      const allListings = await db.select({
        id: listings.id,
        userId: listings.userId,
        title: listings.title,
        description: listings.description,
        priceCents: listings.priceCents,
        currency: listings.currency,
        category: listings.category,
        audioUrl: listings.audioUrl,
        artworkUrl: listings.artworkUrl,
        previewUrl: listings.previewUrl,
        metadata: listings.metadata,
        createdAt: listings.createdAt,
        producerName: users.username,
      })
        .from(listings)
        .leftJoin(users, eq(listings.userId, users.id))
        .where(eq(listings.isPublished, true))
        .orderBy(desc(listings.createdAt))
        .limit(candidatePool);

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const threeeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const totalInteractions = profile.totalInteractions || 0;
      // Cold-start mode: new users get a more exploration-heavy blend
      const isColdStart = totalInteractions < 5;

      const scoredBeats = allListings.map(beat => {
        const metadata = beat.metadata as Record<string, any> || {};
        const genre = metadata.genre || beat.category || '';
        const mood = metadata.mood || '';
        const tempo = metadata.bpm || metadata.tempo || 120;
        const producerId = beat.userId || '';
        const createdAt = beat.createdAt || new Date();
        const plays = metadata.plays || 0;
        const likes = metadata.likes || 0;

        // ── Taste score (personalization) ──────────────────────────────────────
        let tasteScore = 0.5; // neutral default

        if (!isColdStart) {
          let genreScore = genreScores[genre] ?? 0.5;
          let moodScore = moodScores[mood] ?? 0.5;

          // Apply trending genre boost
          const trendingBoost = GENRE_TRENDING_BOOST[genre] || 1.0;
          genreScore = Math.min(1.0, genreScore * trendingBoost);

          // Weighted average of genre and mood (genre is slightly more predictive)
          tasteScore = genreScore * 0.60 + moodScore * 0.40;
        } else {
          // Cold start: use trending genre boost to surface popular genres
          const trendingBoost = GENRE_TRENDING_BOOST[genre] || 1.0;
          tasteScore = 0.45 + (trendingBoost - 1.0) * 0.5;
        }

        // ── Tempo compatibility ────────────────────────────────────────────────
        const tempoMin = profile.preferredTempoMin || 70;
        const tempoMax = profile.preferredTempoMax || 160;
        let tempoScore = 1.0;
        if (tempo < tempoMin || tempo > tempoMax) {
          const distance = Math.min(Math.abs(tempo - tempoMin), Math.abs(tempo - tempoMax));
          tempoScore = Math.max(0.1, 1.0 - distance / 60); // Softer penalty curve
        }

        // ── Freshness score (time decay) ───────────────────────────────────────
        // Fine-tuned decay: new music gets strong boost, older content decays slowly
        let freshnessScore: number;
        if (createdAt >= oneDayAgo) {
          freshnessScore = 1.0;
        } else if (createdAt >= threeeDaysAgo) {
          freshnessScore = 0.85;
        } else if (createdAt >= oneWeekAgo) {
          freshnessScore = 0.70;
        } else if (createdAt >= oneMonthAgo) {
          const daysSince = (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
          // Exponential decay with slower curve (τ = 45 days vs original 30)
          freshnessScore = Math.max(0.15, 0.70 * Math.exp(-(daysSince - 7) / 45));
        } else {
          freshnessScore = 0.15; // Floor for older content — don't completely bury it
        }

        // ── Producer affinity score ────────────────────────────────────────────
        const producerScore = followedProducers.includes(producerId) ? 1.0 : 0.25;

        // ── Social proof (popularity signals) ─────────────────────────────────
        // Soft popularity signal — prevents completely unproven content from topping feed
        const popularityScore = Math.min(1.0, Math.log1p(plays) / 12 + Math.log1p(likes) / 8);

        // ── Final discovery score (weighted blend) ─────────────────────────────
        let discoveryScore: number;
        if (isColdStart) {
          // Cold start: emphasize freshness + popularity + trending genres
          discoveryScore = (
            tasteScore      * 0.25 +
            freshnessScore  * 0.30 +
            producerScore   * 0.10 +
            tempoScore      * 0.10 +
            popularityScore * 0.25
          );
        } else {
          // Personalized: emphasize taste + freshness, reduce popularity bias
          discoveryScore = (
            tasteScore      * 0.38 +
            freshnessScore  * 0.28 +
            producerScore   * 0.18 +
            tempoScore      * 0.10 +
            popularityScore * 0.06
          );
        }

        // ── Filter overrides ───────────────────────────────────────────────────
        if (options.genre && genre !== options.genre) {
          return { beat, discoveryScore: discoveryScore * 0.05 }; // Almost hide
        }
        if (options.mood && mood !== options.mood) {
          return { beat, discoveryScore: discoveryScore * 0.05 };
        }
        if (options.search) {
          const searchLower = options.search.toLowerCase();
          const titleMatch = beat.title?.toLowerCase().includes(searchLower);
          const descMatch = beat.description?.toLowerCase().includes(searchLower);
          const producerMatch = beat.producerName?.toLowerCase().includes(searchLower);
          const genreMatch = genre?.toLowerCase().includes(searchLower);
          const moodMatch = mood?.toLowerCase().includes(searchLower);
          const tags = (metadata.tags || []) as string[];
          const tagMatch = tags.some((t: string) => t.toLowerCase().includes(searchLower));

          if (!titleMatch && !descMatch && !producerMatch && !genreMatch && !moodMatch && !tagMatch) {
            return { beat, discoveryScore: 0 };
          }
          // Search matches get a boost to surface them higher
          discoveryScore = Math.min(1.0, discoveryScore * 1.3);
        }

        return { beat, discoveryScore };
      });

      const filteredBeats = options.search
        ? scoredBeats.filter(b => b.discoveryScore > 0)
        : scoredBeats;

      filteredBeats.sort((a, b) => b.discoveryScore - a.discoveryScore);

      // Inject diversity: avoid top-5 all being same genre
      const diversifiedBeats = this.diversifyResults(filteredBeats);
      const paginatedResults = diversifiedBeats.slice(offset, offset + limit);

      return paginatedResults.map(({ beat, discoveryScore }) => {
        const metadata = beat.metadata as Record<string, any> || {};
        return {
          id: beat.id,
          title: beat.title,
          producer: beat.producerName || 'Producer',
          producerId: beat.userId,
          price: (beat.priceCents || 0) / 100,
          currency: beat.currency || 'usd',
          genre: metadata.genre || beat.category || 'Other',
          mood: metadata.mood || 'Chill',
          tempo: metadata.bpm || metadata.tempo || 120,
          key: metadata.key || 'C Major',
          duration: metadata.duration || 180,
          audioUrl: beat.audioUrl,
          previewUrl: beat.previewUrl,
          artworkUrl: beat.artworkUrl,
          coverArt: beat.artworkUrl,
          plays: metadata.plays || 0,
          likes: metadata.likes || 0,
          avgRating: metadata.avgRating || 0,
          ratingCount: metadata.ratingCount || 0,
          isHot: discoveryScore > 0.72,
          isNew: beat.createdAt && beat.createdAt >= oneWeekAgo,
          isTrending: discoveryScore > 0.80 && (metadata.plays || 0) > 50,
          discoveryScore: Math.round(discoveryScore * 100) / 100,
          licenseOptions: metadata.licenses || [
            { type: 'basic', price: (beat.priceCents || 0) / 100, name: 'Basic License' },
            { type: 'premium', price: ((beat.priceCents || 0) / 100) * 2, name: 'Premium License' },
            { type: 'exclusive', price: ((beat.priceCents || 0) / 100) * 10, name: 'Exclusive Rights' },
          ],
        };
      });
    } catch (error) {
      logger.warn({ err: error }, 'Error getting personalized feed:');
      throw error;
    }
  }

  /**
   * Diversity injection — ensures no more than 2 consecutive results from same genre.
   * Prevents the feed from becoming a mono-genre echo chamber.
   */
  private diversifyResults<T extends { beat: { metadata: Record<string, unknown>; category?: string | null }; discoveryScore: number }>(
    scoredBeats: T[]
  ): T[] {
    const result: T[] = [];
    const recentGenres: string[] = [];
    const remaining: T[] = [];

    for (const item of scoredBeats) {
      const meta = item.beat.metadata as Record<string, any> || {};
      const genre = meta.genre || item.beat.category || 'Other';
      const sameGenreCount = recentGenres.slice(-3).filter(g => g === genre).length;

      if (sameGenreCount < 2) {
        result.push(item);
        recentGenres.push(genre);
      } else {
        remaining.push(item);
      }
    }

    // Append remaining (overflow) after diversity pass
    return [...result, ...remaining];
  }

  async followProducer(userId: string, producerId: string) {
    try {
      const profile = await this.getOrCreateTasteProfile(userId);
      const followedProducers = [...((profile.followedProducers as string[]) || [])];

      if (!followedProducers.includes(producerId)) {
        followedProducers.push(producerId);
        await db.update(userTasteProfiles)
          .set({ followedProducers, lastUpdated: new Date() })
          .where(eq(userTasteProfiles.userId, userId));
      }

      await this.syncStorefrontFollow(userId, producerId, true);
      return { success: true, following: true };
    } catch (error) {
      logger.warn({ err: error }, 'Error following producer:');
      throw error;
    }
  }

  async unfollowProducer(userId: string, producerId: string) {
    try {
      const profile = await this.getOrCreateTasteProfile(userId);
      const followedProducers = ((profile.followedProducers as string[]) || []).filter(id => id !== producerId);

      await db.update(userTasteProfiles)
        .set({ followedProducers, lastUpdated: new Date() })
        .where(eq(userTasteProfiles.userId, userId));

      await this.syncStorefrontFollow(userId, producerId, false);
      return { success: true, following: false };
    } catch (error) {
      logger.warn({ err: error }, 'Error unfollowing producer:');
      throw error;
    }
  }

  private async syncStorefrontFollow(userId: string, producerId: string, follow: boolean) {
    try {
      const userStorefront = await db.select({ id: storefronts.id })
        .from(storefronts)
        .where(eq(storefronts.userId, producerId))
        .limit(1);

      const storefrontId = userStorefront[0]?.id;
      if (!storefrontId) return;

      if (follow) {
        const existing = await db.select({ id: storefrontFollows.id })
          .from(storefrontFollows)
          .where(and(
            eq(storefrontFollows.storefrontId, storefrontId),
            eq(storefrontFollows.userId, userId)
          ))
          .limit(1);

        if (!existing[0]) {
          await db.insert(storefrontFollows).values({ userId, storefrontId });
        }
      } else {
        await db.delete(storefrontFollows)
          .where(and(
            eq(storefrontFollows.storefrontId, storefrontId),
            eq(storefrontFollows.userId, userId)
          ));
      }
    } catch (error) {
      logger.warn({ err: error }, 'Error syncing storefront follow:');
    }
  }

  async getProducerFollowers(producerId: string): Promise<string[]> {
    try {
      const result = await db.execute(
        sql`SELECT user_id FROM user_taste_profiles
            WHERE followed_producers @> ARRAY[${producerId}]::text[]`
      );
      return (result.rows || []).map((row: Record<string, unknown>) => row.user_id as string);
    } catch (error) {
      logger.warn({ err: error }, 'Error getting producer followers:');
      return [];
    }
  }

  async getTasteInsights(userId: string) {
    try {
      const profile = await this.getOrCreateTasteProfile(userId);
      const genreScores = (profile.genreScores as Record<string, number>) || {};
      const moodScores = (profile.moodScores as Record<string, number>) || {};

      const topGenres = Object.entries(genreScores)
        .filter(([, score]) => score > 0.5) // Only show genuine preferences
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre, score]) => ({ genre, score: Math.round(score * 100) / 100 }));

      const topMoods = Object.entries(moodScores)
        .filter(([, score]) => score > 0.5)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([mood, score]) => ({ mood, score: Math.round(score * 100) / 100 }));

      const recentInteractions = await db.select()
        .from(beatInteractions)
        .where(eq(beatInteractions.userId, userId))
        .orderBy(desc(beatInteractions.createdAt))
        .limit(10);

      return {
        totalInteractions: profile.totalInteractions || 0,
        purchaseCount: profile.purchaseCount || 0,
        topGenres,
        topMoods,
        preferredTempoRange: {
          min: profile.preferredTempoMin || 80,
          max: profile.preferredTempoMax || 150,
        },
        followedProducersCount: ((profile.followedProducers as string[]) || []).length,
        recentActivityCount: recentInteractions.length,
        profileMaturity: Math.min(100, Math.round((profile.totalInteractions || 0) / 0.5)),
      };
    } catch (error) {
      logger.warn({ err: error }, 'Error getting taste insights:');
      throw error;
    }
  }
}

export const discoveryAlgorithmService = new DiscoveryAlgorithmService();
