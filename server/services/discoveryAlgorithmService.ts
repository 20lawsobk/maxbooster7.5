import { db } from '../db';
import { eq, desc, and, gte, sql, inArray } from 'drizzle-orm';
import {
  userTasteProfiles,
  beatInteractions,
  beatDiscoveryScores,
  listings,
  users,
} from '@shared/schema';
import { logger } from '../logger.js';

const GENRE_LIST = ['Hip-Hop', 'Trap', 'R&B', 'Pop', 'EDM', 'Drill', 'Afrobeats', 'Lo-Fi', 'Jazz', 'Rock', 'Soul', 'Latin', 'Reggaeton'];
const MOOD_LIST = ['Dark', 'Energetic', 'Chill', 'Aggressive', 'Melodic', 'Uplifting', 'Sad', 'Happy', 'Moody', 'Bouncy'];

const INTERACTION_WEIGHTS = {
  purchase: 10,
  like: 3,
  repeat: 2.5,
  share: 2,
  add_to_cart: 1.5,
  play: 1,
  preview: 0.5,
  skip: -0.5,
};

export class DiscoveryAlgorithmService {
  async getOrCreateTasteProfile(userId: string) {
    try {
      const existing = await db.select().from(userTasteProfiles).where(eq(userTasteProfiles.userId, userId)).limit(1);
      
      if (existing.length > 0) {
        return existing[0];
      }

      const defaultGenreScores: Record<string, number> = {};
      GENRE_LIST.forEach(g => defaultGenreScores[g] = 0.5);
      
      const defaultMoodScores: Record<string, number> = {};
      MOOD_LIST.forEach(m => defaultMoodScores[m] = 0.5);

      const [newProfile] = await db.insert(userTasteProfiles).values({
        userId,
        genreScores: defaultGenreScores,
        moodScores: defaultMoodScores,
      }).returning();

      return newProfile;
    } catch (error) {
      logger.error('Error getting/creating taste profile:', error);
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

      await this.updateTasteProfileFromInteraction(data.userId, data.beatId, data.interactionType);

      return { success: true };
    } catch (error) {
      logger.error('Error recording interaction:', error);
      throw error;
    }
  }

  private async updateTasteProfileFromInteraction(userId: string, beatId: string, interactionType: string) {
    try {
      const weight = INTERACTION_WEIGHTS[interactionType as keyof typeof INTERACTION_WEIGHTS] || 0;
      if (weight === 0) return;

      const beatData = await db.select().from(listings).where(eq(listings.id, beatId)).limit(1);
      if (beatData.length === 0) return;

      const beat = beatData[0];
      const metadata = beat.metadata as any || {};
      const genre = metadata.genre || beat.category;
      const mood = metadata.mood;

      const profile = await this.getOrCreateTasteProfile(userId);
      const genreScores = (profile.genreScores as Record<string, number>) || {};
      const moodScores = (profile.moodScores as Record<string, number>) || {};

      const learningRate = 0.1;
      const normalizedWeight = weight / 10;

      if (genre && genreScores[genre] !== undefined) {
        genreScores[genre] = Math.min(1, Math.max(0, genreScores[genre] + (learningRate * normalizedWeight)));
      }

      if (mood && moodScores[mood] !== undefined) {
        moodScores[mood] = Math.min(1, Math.max(0, moodScores[mood] + (learningRate * normalizedWeight)));
      }

      await db.update(userTasteProfiles)
        .set({
          genreScores,
          moodScores,
          totalInteractions: sql`${userTasteProfiles.totalInteractions} + 1`,
          purchaseCount: interactionType === 'purchase' 
            ? sql`${userTasteProfiles.purchaseCount} + 1` 
            : userTasteProfiles.purchaseCount,
          lastUpdated: new Date(),
        })
        .where(eq(userTasteProfiles.userId, userId));

    } catch (error) {
      logger.error('Error updating taste profile:', error);
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
      const limit = options.limit || 20;
      const offset = options.offset || 0;

      const profile = await this.getOrCreateTasteProfile(userId);
      const genreScores = (profile.genreScores as Record<string, number>) || {};
      const moodScores = (profile.moodScores as Record<string, number>) || {};
      const followedProducers = profile.followedProducers || [];

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
      })
        .from(listings)
        .where(eq(listings.isPublished, true))
        .orderBy(desc(listings.createdAt))
        .limit(200);

      const now = new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const scoredBeats = allListings.map(beat => {
        const metadata = beat.metadata as any || {};
        const genre = metadata.genre || beat.category || '';
        const mood = metadata.mood || '';
        const tempo = metadata.bpm || metadata.tempo || 120;
        const producerId = beat.userId;
        const createdAt = beat.createdAt || new Date();

        let tasteScore = 0.5;
        if (genre && genreScores[genre]) {
          tasteScore = (tasteScore + genreScores[genre]) / 2;
        }
        if (mood && moodScores[mood]) {
          tasteScore = (tasteScore + moodScores[mood]) / 2;
        }

        const tempoMin = profile.preferredTempoMin || 80;
        const tempoMax = profile.preferredTempoMax || 150;
        let tempoScore = 1;
        if (tempo < tempoMin || tempo > tempoMax) {
          const distance = Math.min(Math.abs(tempo - tempoMin), Math.abs(tempo - tempoMax));
          tempoScore = Math.max(0, 1 - (distance / 50));
        }

        let freshnessScore = 0.3;
        if (createdAt >= oneDayAgo) {
          freshnessScore = 1.0;
        } else if (createdAt >= oneWeekAgo) {
          freshnessScore = 0.7;
        } else {
          const daysSinceUpload = (now.getTime() - createdAt.getTime()) / (24 * 60 * 60 * 1000);
          freshnessScore = Math.max(0.1, 0.5 * Math.exp(-daysSinceUpload / 30));
        }

        const producerScore = followedProducers.includes(producerId) ? 1.0 : 0.3;

        const discoveryScore = (
          tasteScore * 0.35 +
          freshnessScore * 0.30 +
          producerScore * 0.20 +
          tempoScore * 0.15
        );

        if (options.genre && genre !== options.genre) {
          return { beat, discoveryScore: discoveryScore * 0.1 };
        }
        if (options.mood && mood !== options.mood) {
          return { beat, discoveryScore: discoveryScore * 0.1 };
        }
        if (options.search) {
          const searchLower = options.search.toLowerCase();
          const titleMatch = beat.title?.toLowerCase().includes(searchLower);
          const descMatch = beat.description?.toLowerCase().includes(searchLower);
          if (!titleMatch && !descMatch) {
            return { beat, discoveryScore: discoveryScore * 0.05 };
          }
        }

        return { beat, discoveryScore };
      });

      scoredBeats.sort((a, b) => b.discoveryScore - a.discoveryScore);

      const paginatedResults = scoredBeats.slice(offset, offset + limit);

      return paginatedResults.map(({ beat, discoveryScore }) => {
        const metadata = beat.metadata as any || {};
        return {
          id: beat.id,
          title: beat.title,
          producer: 'Producer',
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
          plays: metadata.plays || 0,
          likes: metadata.likes || 0,
          isHot: discoveryScore > 0.7,
          isNew: beat.createdAt && beat.createdAt >= oneWeekAgo,
          discoveryScore,
          licenseOptions: metadata.licenses || [
            { type: 'basic', price: (beat.priceCents || 0) / 100, name: 'Basic License' },
            { type: 'premium', price: ((beat.priceCents || 0) / 100) * 2, name: 'Premium License' },
            { type: 'exclusive', price: ((beat.priceCents || 0) / 100) * 10, name: 'Exclusive Rights' },
          ],
        };
      });
    } catch (error) {
      logger.error('Error getting personalized feed:', error);
      throw error;
    }
  }

  async followProducer(userId: string, producerId: string) {
    try {
      const profile = await this.getOrCreateTasteProfile(userId);
      const followedProducers = [...(profile.followedProducers || [])];
      
      if (!followedProducers.includes(producerId)) {
        followedProducers.push(producerId);
        await db.update(userTasteProfiles)
          .set({ followedProducers, lastUpdated: new Date() })
          .where(eq(userTasteProfiles.userId, userId));
      }

      return { success: true, following: true };
    } catch (error) {
      logger.error('Error following producer:', error);
      throw error;
    }
  }

  async unfollowProducer(userId: string, producerId: string) {
    try {
      const profile = await this.getOrCreateTasteProfile(userId);
      const followedProducers = (profile.followedProducers || []).filter(id => id !== producerId);
      
      await db.update(userTasteProfiles)
        .set({ followedProducers, lastUpdated: new Date() })
        .where(eq(userTasteProfiles.userId, userId));

      return { success: true, following: false };
    } catch (error) {
      logger.error('Error unfollowing producer:', error);
      throw error;
    }
  }

  async getTasteInsights(userId: string) {
    try {
      const profile = await this.getOrCreateTasteProfile(userId);
      const genreScores = profile.genreScores as Record<string, number> || {};
      const moodScores = profile.moodScores as Record<string, number> || {};

      const topGenres = Object.entries(genreScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([genre, score]) => ({ genre, score }));

      const topMoods = Object.entries(moodScores)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([mood, score]) => ({ mood, score }));

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
        followedProducersCount: (profile.followedProducers || []).length,
        recentActivityCount: recentInteractions.length,
      };
    } catch (error) {
      logger.error('Error getting taste insights:', error);
      throw error;
    }
  }
}

export const discoveryAlgorithmService = new DiscoveryAlgorithmService();
