import { db } from '../db.js';
import {
  socialAutopilotContent,
  fanSegments,
  musicImpactMetrics,
  socialPatternAggregates,
  SocialAutopilotContent,
  FanSegment,
  MusicImpactMetric,
  SocialPatternAggregate,
} from '@shared/schema';
import { eq, and, gte, lte, desc, sql, lt } from 'drizzle-orm';
import { logger } from '../logger.js';
import { nanoid } from 'nanoid';
import { aiModelManager } from './aiModelManager.js';
import { createHash } from 'crypto';

const MUSIC_IMPACT_WEIGHTS = {
  saves: 3.0,
  playlistAdds: 4.0,
  profileVisits: 1.5,
  followerGrowth: 2.0,
  highIntentDms: 5.0,
};

const DEFAULT_EXPLORE_RATIO = 0.2;
const TOP_K_PATTERNS = 5;
const TIME_DECAY_HALF_LIFE_DAYS = 30;
const LONG_TERM_MEMORY_THRESHOLD_DAYS = 7;

interface PerformanceData {
  views?: number;
  likes?: number;
  comments?: number;
  shares?: number;
  saves?: number;
  profileVisits?: number;
  followerGain?: number;
  playlistAdds?: number;
  highIntentDms?: number;
}

interface ContentCandidate {
  id: string;
  type: string;
  format: string;
  hookType: string;
  tone: string;
  platform: string;
  trackUsed?: string;
  expectedImpact: number;
  isExplore: boolean;
  segment?: FanSegment;
  patternSource?: SocialPatternAggregate;
}

interface DailySchedule {
  userId: string;
  date: Date;
  candidates: ContentCandidate[];
  exploreCount: number;
  exploitCount: number;
}

interface BehavioralSignals {
  avgWatchTime?: number;
  commentFrequency?: number;
  saveRate?: number;
  dmIntentScore?: number;
}

interface PatternKey {
  hookType: string;
  tone: string;
  format: string;
  trackUsed?: string;
}

class SocialFanbaseService {
  computeMusicImpact(performance: PerformanceData): {
    savesWeighted: number;
    playlistAddsWeighted: number;
    profileVisitsWeighted: number;
    followerGrowthWeighted: number;
    highIntentDmsWeighted: number;
    totalScore: number;
  } {
    const savesWeighted = (performance.saves || 0) * MUSIC_IMPACT_WEIGHTS.saves;
    const playlistAddsWeighted = (performance.playlistAdds || 0) * MUSIC_IMPACT_WEIGHTS.playlistAdds;
    const profileVisitsWeighted = (performance.profileVisits || 0) * MUSIC_IMPACT_WEIGHTS.profileVisits;
    const followerGrowthWeighted = (performance.followerGain || 0) * MUSIC_IMPACT_WEIGHTS.followerGrowth;
    const highIntentDmsWeighted = (performance.highIntentDms || 0) * MUSIC_IMPACT_WEIGHTS.highIntentDms;

    const totalScore =
      savesWeighted +
      playlistAddsWeighted +
      profileVisitsWeighted +
      followerGrowthWeighted +
      highIntentDmsWeighted;

    return {
      savesWeighted,
      playlistAddsWeighted,
      profileVisitsWeighted,
      followerGrowthWeighted,
      highIntentDmsWeighted,
      totalScore,
    };
  }

  async getContents(userId: string, date: Date): Promise<SocialAutopilotContent[]> {
    try {
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);

      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      const contents = await db
        .select()
        .from(socialAutopilotContent)
        .where(
          and(
            eq(socialAutopilotContent.userId, userId),
            gte(socialAutopilotContent.postingTime, startOfDay),
            lte(socialAutopilotContent.postingTime, endOfDay)
          )
        )
        .orderBy(desc(socialAutopilotContent.postingTime));

      return contents;
    } catch (error) {
      logger.error('Error fetching contents', { userId, date, error });
      return [];
    }
  }

  async saveMusicImpact(
    userId: string,
    contentId: string,
    impactData: ReturnType<typeof this.computeMusicImpact>
  ): Promise<MusicImpactMetric | null> {
    try {
      const [inserted] = await db
        .insert(musicImpactMetrics)
        .values({
          id: nanoid(),
          userId,
          contentId,
          savesWeighted: impactData.savesWeighted,
          playlistAddsWeighted: impactData.playlistAddsWeighted,
          profileVisitsWeighted: impactData.profileVisitsWeighted,
          followerGrowthWeighted: impactData.followerGrowthWeighted,
          highIntentDmsWeighted: impactData.highIntentDmsWeighted,
          totalScore: impactData.totalScore,
        })
        .returning();

      logger.info('Saved music impact metric', { userId, contentId, totalScore: impactData.totalScore });
      return inserted;
    } catch (error) {
      logger.error('Error saving music impact', { userId, contentId, error });
      return null;
    }
  }

  async selectTopByImpact(
    contents: SocialAutopilotContent[],
    topK: number
  ): Promise<{ content: SocialAutopilotContent; impact: ReturnType<typeof this.computeMusicImpact> }[]> {
    const contentWithImpact = contents.map((content) => ({
      content,
      impact: this.computeMusicImpact((content.performance as PerformanceData) || {}),
    }));

    contentWithImpact.sort((a, b) => b.impact.totalScore - a.impact.totalScore);

    return contentWithImpact.slice(0, topK);
  }

  private generatePatternHash(pattern: PatternKey): string {
    const hashInput = `${pattern.hookType}|${pattern.tone}|${pattern.format}|${pattern.trackUsed || ''}`;
    return createHash('sha256').update(hashInput).digest('hex').substring(0, 16);
  }

  async savePatternAggregate(
    userId: string,
    pattern: PatternKey,
    impactScore: number
  ): Promise<SocialPatternAggregate | null> {
    try {
      const patternHash = this.generatePatternHash(pattern);

      const existing = await db
        .select()
        .from(socialPatternAggregates)
        .where(
          and(eq(socialPatternAggregates.userId, userId), eq(socialPatternAggregates.patternHash, patternHash))
        )
        .limit(1);

      if (existing.length > 0) {
        const current = existing[0];
        const newTotalPosts = (current.totalPosts || 0) + 1;
        const newTotalImpact = (current.totalImpact || 0) + impactScore;
        const newAvgImpact = newTotalImpact / newTotalPosts;

        const existingAvg = current.avgImpact || 0;
        const existingStd = current.impactStd || 0;
        const n = current.totalPosts || 1;
        const delta = impactScore - existingAvg;
        const newStd = Math.sqrt(((n - 1) * existingStd * existingStd + delta * delta) / n);

        const [updated] = await db
          .update(socialPatternAggregates)
          .set({
            totalPosts: newTotalPosts,
            totalImpact: newTotalImpact,
            avgImpact: newAvgImpact,
            impactStd: newStd,
            lastUpdated: new Date(),
          })
          .where(eq(socialPatternAggregates.id, current.id))
          .returning();

        return updated;
      } else {
        const [inserted] = await db
          .insert(socialPatternAggregates)
          .values({
            id: nanoid(),
            userId,
            patternHash,
            hookType: pattern.hookType,
            tone: pattern.tone,
            format: pattern.format,
            trackUsed: pattern.trackUsed,
            totalPosts: 1,
            totalImpact: impactScore,
            avgImpact: impactScore,
            impactStd: 0,
            timeDecayFactor: 1.0,
          })
          .returning();

        return inserted;
      }
    } catch (error) {
      logger.error('Error saving pattern aggregate', { userId, pattern, error });
      return null;
    }
  }

  async updateFanSegments(userId: string, events: { segmentId: string; signals: BehavioralSignals }[]): Promise<void> {
    try {
      for (const event of events) {
        await this.updateSegmentBehavior(event.segmentId, event.signals);
      }
      logger.info('Updated fan segments', { userId, segmentCount: events.length });
    } catch (error) {
      logger.error('Error updating fan segments', { userId, error });
    }
  }

  async derivePatterns(
    contents: SocialAutopilotContent[],
    userId: string
  ): Promise<SocialPatternAggregate[]> {
    try {
      for (const content of contents) {
        const performance = (content.performance as PerformanceData) || {};
        const impact = this.computeMusicImpact(performance);

        await this.saveMusicImpact(userId, content.id, impact);

        const pattern: PatternKey = {
          hookType: content.hookType,
          tone: content.tone,
          format: content.format,
          trackUsed: content.trackUsed || undefined,
        };

        await this.savePatternAggregate(userId, pattern, impact.totalScore);
      }

      const topPatterns = await db
        .select()
        .from(socialPatternAggregates)
        .where(eq(socialPatternAggregates.userId, userId))
        .orderBy(desc(socialPatternAggregates.avgImpact))
        .limit(TOP_K_PATTERNS);

      return topPatterns;
    } catch (error) {
      logger.error('Error deriving patterns', { userId, error });
      return [];
    }
  }

  async generateContentCandidates(
    userId: string,
    segment: FanSegment | null,
    patterns: SocialPatternAggregate[]
  ): Promise<ContentCandidate[]> {
    try {
      const candidates: ContentCandidate[] = [];

      for (const pattern of patterns) {
        const candidate: ContentCandidate = {
          id: nanoid(),
          type: 'generated',
          format: pattern.format,
          hookType: pattern.hookType,
          tone: pattern.tone,
          platform: 'tiktok',
          trackUsed: pattern.trackUsed || undefined,
          expectedImpact: pattern.avgImpact || 0,
          isExplore: false,
          segment: segment || undefined,
          patternSource: pattern,
        };
        candidates.push(candidate);
      }

      const exploreCandidates = await this.generateExploreCandidates(userId);
      candidates.push(...exploreCandidates);

      return candidates;
    } catch (error) {
      logger.error('Error generating content candidates', { userId, error });
      return [];
    }
  }

  private async generateExploreCandidates(userId: string): Promise<ContentCandidate[]> {
    const hookTypes = ['emotional', 'controversial', 'pov', 'storytelling', 'flex', 'transformation', 'process'];
    const tones = ['sad', 'hype', 'romantic', 'angry', 'nostalgic', 'inspirational'];
    const formats = ['text', 'image', 'short_video', 'long_video', 'audio'];

    const candidates: ContentCandidate[] = [];
    const exploreCount = 3;

    for (let i = 0; i < exploreCount; i++) {
      const candidate: ContentCandidate = {
        id: nanoid(),
        type: 'explore',
        format: formats[Math.floor(Math.random() * formats.length)],
        hookType: hookTypes[Math.floor(Math.random() * hookTypes.length)],
        tone: tones[Math.floor(Math.random() * tones.length)],
        platform: 'tiktok',
        expectedImpact: 0,
        isExplore: true,
      };
      candidates.push(candidate);
    }

    return candidates;
  }

  async predictExpectedImpact(userId: string, candidate: ContentCandidate): Promise<number> {
    try {
      const model = await aiModelManager.getSocialAutopilot(userId);

      const features = {
        platform: candidate.platform,
        contentLength: candidate.format === 'short_video' ? 30 : candidate.format === 'long_video' ? 180 : 100,
        hasHashtags: true,
        hasEmojis: true,
        hasLinks: false,
        hookType: candidate.hookType,
        tone: candidate.tone,
        format: candidate.format,
      };

      const prediction = await model.predictEngagement(features);

      if (prediction && typeof prediction.expectedEngagement === 'number') {
        return prediction.expectedEngagement;
      }

      if (candidate.patternSource) {
        return candidate.patternSource.avgImpact || 0;
      }

      return 0;
    } catch (error) {
      logger.error('Error predicting expected impact', { userId, candidateId: candidate.id, error });
      return candidate.patternSource?.avgImpact || 0;
    }
  }

  labelExploreOrExploit(candidate: ContentCandidate, avgImpact: number): 'explore' | 'exploit' {
    if (candidate.isExplore) {
      return 'explore';
    }

    if (candidate.expectedImpact > avgImpact * 0.8) {
      return 'exploit';
    }

    return 'explore';
  }

  async buildDailySchedule(
    userId: string,
    candidates: ContentCandidate[],
    exploreRatio: number = DEFAULT_EXPLORE_RATIO
  ): Promise<DailySchedule> {
    try {
      for (const candidate of candidates) {
        if (!candidate.isExplore) {
          candidate.expectedImpact = await this.predictExpectedImpact(userId, candidate);
        }
      }

      const avgImpact =
        candidates.reduce((sum, c) => sum + c.expectedImpact, 0) / Math.max(candidates.length, 1);

      const exploreCandidates = candidates.filter((c) => this.labelExploreOrExploit(c, avgImpact) === 'explore');
      const exploitCandidates = candidates.filter((c) => this.labelExploreOrExploit(c, avgImpact) === 'exploit');

      exploitCandidates.sort((a, b) => b.expectedImpact - a.expectedImpact);

      const totalSlots = Math.min(candidates.length, 10);
      const exploreSlots = Math.ceil(totalSlots * exploreRatio);
      const exploitSlots = totalSlots - exploreSlots;

      const selectedExploreCandidates = exploreCandidates.slice(0, exploreSlots);
      const selectedExploitCandidates = exploitCandidates.slice(0, exploitSlots);

      const finalCandidates = [...selectedExploitCandidates, ...selectedExploreCandidates];

      const schedule: DailySchedule = {
        userId,
        date: new Date(),
        candidates: finalCandidates,
        exploreCount: selectedExploreCandidates.length,
        exploitCount: selectedExploitCandidates.length,
      };

      logger.info('Built daily schedule', {
        userId,
        totalCandidates: finalCandidates.length,
        explore: schedule.exploreCount,
        exploit: schedule.exploitCount,
      });

      return schedule;
    } catch (error) {
      logger.error('Error building daily schedule', { userId, error });
      return {
        userId,
        date: new Date(),
        candidates: [],
        exploreCount: 0,
        exploitCount: 0,
      };
    }
  }

  async dailySocialLoop(userId: string, date: Date): Promise<DailySchedule> {
    try {
      logger.info('Starting daily social loop', { userId, date: date.toISOString() });

      // Step 1: Ingest yesterday's performance
      const yesterday = new Date(date);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayContents = await this.getContents(userId, yesterday);

      // Step 2: Compute MusicImpact for yesterday's content
      for (const content of yesterdayContents) {
        const performance = (content.performance as PerformanceData) || {};
        const impact = this.computeMusicImpact(performance);
        await this.saveMusicImpact(userId, content.id, impact);
      }

      // Step 3: Update fan segments from behavioral data
      const segments = await this.getFanSegments(userId);
      const primarySegment = segments.length > 0 ? segments[0] : null;

      // Step 4: Derive top patterns from high-performing content
      const topPatterns = await this.derivePatterns(yesterdayContents, userId);

      // Step 5: Apply time decay to old patterns
      await this.applyTimeDecay(userId);

      // Step 6: Generate content candidates based on segments and patterns
      const candidates = await this.generateContentCandidates(userId, primarySegment, topPatterns);

      // Step 7: Score & rank candidates, build schedule with explore/exploit balance
      const schedule = await this.buildDailySchedule(userId, candidates);

      // Step 8: Persist scheduled content to database for autopilot publishing
      const persistedContentIds: string[] = [];
      const platforms = ['tiktok', 'instagram', 'youtube', 'twitter', 'facebook', 'threads'];
      
      for (let i = 0; i < schedule.candidates.length; i++) {
        const candidate = schedule.candidates[i];
        const postingTime = new Date(date);
        postingTime.setHours(9 + Math.floor(i * 2), 0, 0, 0); // Space posts 2 hours apart starting at 9am
        
        const platform = candidate.platform || platforms[i % platforms.length];
        
        const [inserted] = await db
          .insert(socialAutopilotContent)
          .values({
            id: candidate.id,
            userId,
            type: candidate.type as any,
            format: candidate.format as any,
            hookType: candidate.hookType as any,
            tone: candidate.tone as any,
            platform: platform as any,
            trackUsed: candidate.trackUsed || null,
            postingTime,
            lengthSeconds: null,
            performance: {},
          })
          .returning();
        
        if (inserted) {
          persistedContentIds.push(inserted.id);
        }
      }

      // Step 9: Compress old content to long-term memory
      await this.compressToLongTermMemory(userId);

      logger.info('Completed daily social loop', {
        userId,
        scheduleSize: schedule.candidates.length,
        explore: schedule.exploreCount,
        exploit: schedule.exploitCount,
        persistedContent: persistedContentIds.length,
      });

      return schedule;
    } catch (error) {
      logger.error('Error in daily social loop', { userId, date, error });
      return {
        userId,
        date,
        candidates: [],
        exploreCount: 0,
        exploitCount: 0,
      };
    }
  }

  async compressToLongTermMemory(userId: string): Promise<void> {
    try {
      const thresholdDate = new Date();
      thresholdDate.setDate(thresholdDate.getDate() - LONG_TERM_MEMORY_THRESHOLD_DAYS);

      const oldContents = await db
        .select()
        .from(socialAutopilotContent)
        .where(
          and(
            eq(socialAutopilotContent.userId, userId),
            lt(socialAutopilotContent.createdAt, thresholdDate)
          )
        );

      if (oldContents.length === 0) {
        return;
      }

      for (const content of oldContents) {
        const performance = (content.performance as PerformanceData) || {};
        const impact = this.computeMusicImpact(performance);

        const pattern: PatternKey = {
          hookType: content.hookType,
          tone: content.tone,
          format: content.format,
          trackUsed: content.trackUsed || undefined,
        };

        await this.savePatternAggregate(userId, pattern, impact.totalScore);
      }

      logger.info('Compressed old content to long-term memory', { userId, contentCount: oldContents.length });
    } catch (error) {
      logger.error('Error compressing to long-term memory', { userId, error });
    }
  }

  async applyTimeDecay(userId: string): Promise<void> {
    try {
      const patterns = await db
        .select()
        .from(socialPatternAggregates)
        .where(eq(socialPatternAggregates.userId, userId));

      const now = new Date();

      for (const pattern of patterns) {
        const lastUpdated = pattern.lastUpdated || pattern.createdAt || now;
        const daysSinceUpdate = (now.getTime() - lastUpdated.getTime()) / (1000 * 60 * 60 * 24);

        const decayFactor = Math.pow(0.5, daysSinceUpdate / TIME_DECAY_HALF_LIFE_DAYS);

        await db
          .update(socialPatternAggregates)
          .set({
            timeDecayFactor: decayFactor,
            avgImpact: (pattern.avgImpact || 0) * decayFactor,
          })
          .where(eq(socialPatternAggregates.id, pattern.id));
      }

      logger.info('Applied time decay to patterns', { userId, patternCount: patterns.length });
    } catch (error) {
      logger.error('Error applying time decay', { userId, error });
    }
  }

  async createSegment(
    userId: string,
    name: string,
    tasteVector: { artists?: string[]; genres?: string[]; moods?: string[] }
  ): Promise<FanSegment | null> {
    try {
      const [inserted] = await db
        .insert(fanSegments)
        .values({
          id: nanoid(),
          userId,
          name,
          tasteVector,
          behavioralSignals: {},
          preferredContentPatterns: [],
        })
        .returning();

      logger.info('Created fan segment', { userId, segmentId: inserted.id, name });
      return inserted;
    } catch (error) {
      logger.error('Error creating fan segment', { userId, name, error });
      return null;
    }
  }

  async updateSegmentBehavior(segmentId: string, signals: BehavioralSignals): Promise<FanSegment | null> {
    try {
      const existing = await db
        .select()
        .from(fanSegments)
        .where(eq(fanSegments.id, segmentId))
        .limit(1);

      if (existing.length === 0) {
        logger.warn('Segment not found', { segmentId });
        return null;
      }

      const currentSignals = (existing[0].behavioralSignals as BehavioralSignals) || {};
      const mergedSignals = { ...currentSignals, ...signals };

      const [updated] = await db
        .update(fanSegments)
        .set({
          behavioralSignals: mergedSignals,
          updatedAt: new Date(),
        })
        .where(eq(fanSegments.id, segmentId))
        .returning();

      logger.info('Updated segment behavior', { segmentId });
      return updated;
    } catch (error) {
      logger.error('Error updating segment behavior', { segmentId, error });
      return null;
    }
  }

  async getPreferredPatterns(segmentId: string): Promise<SocialPatternAggregate[]> {
    try {
      const segment = await db
        .select()
        .from(fanSegments)
        .where(eq(fanSegments.id, segmentId))
        .limit(1);

      if (segment.length === 0) {
        return [];
      }

      const preferredPatterns = (segment[0].preferredContentPatterns as PatternKey[]) || [];
      const patterns: SocialPatternAggregate[] = [];

      for (const pattern of preferredPatterns) {
        const patternHash = this.generatePatternHash(pattern);
        const found = await db
          .select()
          .from(socialPatternAggregates)
          .where(
            and(
              eq(socialPatternAggregates.userId, segment[0].userId),
              eq(socialPatternAggregates.patternHash, patternHash)
            )
          )
          .limit(1);

        if (found.length > 0) {
          patterns.push(found[0]);
        }
      }

      return patterns;
    } catch (error) {
      logger.error('Error getting preferred patterns', { segmentId, error });
      return [];
    }
  }

  async getFanSegments(userId: string): Promise<FanSegment[]> {
    try {
      const segments = await db
        .select()
        .from(fanSegments)
        .where(eq(fanSegments.userId, userId))
        .orderBy(desc(fanSegments.updatedAt));

      return segments;
    } catch (error) {
      logger.error('Error fetching fan segments', { userId, error });
      return [];
    }
  }

  async getPatternAggregates(userId: string): Promise<SocialPatternAggregate[]> {
    try {
      const patterns = await db
        .select()
        .from(socialPatternAggregates)
        .where(eq(socialPatternAggregates.userId, userId))
        .orderBy(desc(socialPatternAggregates.avgImpact));

      return patterns;
    } catch (error) {
      logger.error('Error fetching pattern aggregates', { userId, error });
      return [];
    }
  }

  async getMusicImpactMetrics(userId: string, limit: number = 50): Promise<MusicImpactMetric[]> {
    try {
      const metrics = await db
        .select()
        .from(musicImpactMetrics)
        .where(eq(musicImpactMetrics.userId, userId))
        .orderBy(desc(musicImpactMetrics.createdAt))
        .limit(limit);

      return metrics;
    } catch (error) {
      logger.error('Error fetching music impact metrics', { userId, error });
      return [];
    }
  }

  async createContent(
    userId: string,
    data: {
      type: string;
      format: string;
      hookType: string;
      tone: string;
      platform: string;
      trackUsed?: string;
      postingTime?: Date;
      lengthSeconds?: number;
      performance?: PerformanceData;
    }
  ): Promise<SocialAutopilotContent | null> {
    try {
      const [inserted] = await db
        .insert(socialAutopilotContent)
        .values({
          id: nanoid(),
          userId,
          type: data.type,
          format: data.format,
          hookType: data.hookType,
          tone: data.tone,
          platform: data.platform,
          trackUsed: data.trackUsed,
          postingTime: data.postingTime,
          lengthSeconds: data.lengthSeconds,
          performance: data.performance || {},
        })
        .returning();

      logger.info('Created social autopilot content', { userId, contentId: inserted.id });
      return inserted;
    } catch (error) {
      logger.error('Error creating content', { userId, error });
      return null;
    }
  }

  async updateContentPerformance(
    contentId: string,
    performance: PerformanceData
  ): Promise<SocialAutopilotContent | null> {
    try {
      const [updated] = await db
        .update(socialAutopilotContent)
        .set({
          performance,
          updatedAt: new Date(),
        })
        .where(eq(socialAutopilotContent.id, contentId))
        .returning();

      logger.info('Updated content performance', { contentId });
      return updated;
    } catch (error) {
      logger.error('Error updating content performance', { contentId, error });
      return null;
    }
  }

  async deleteSegment(segmentId: string): Promise<boolean> {
    try {
      await db.delete(fanSegments).where(eq(fanSegments.id, segmentId));
      logger.info('Deleted fan segment', { segmentId });
      return true;
    } catch (error) {
      logger.error('Error deleting segment', { segmentId, error });
      return false;
    }
  }

  async getTopPerformingContent(userId: string, limit: number = 10): Promise<SocialAutopilotContent[]> {
    try {
      const contents = await db
        .select()
        .from(socialAutopilotContent)
        .where(eq(socialAutopilotContent.userId, userId))
        .orderBy(desc(socialAutopilotContent.createdAt))
        .limit(limit * 5);

      const sorted = contents
        .map((c) => ({
          content: c,
          impact: this.computeMusicImpact((c.performance as PerformanceData) || {}).totalScore,
        }))
        .sort((a, b) => b.impact - a.impact)
        .slice(0, limit);

      return sorted.map((s) => s.content);
    } catch (error) {
      logger.error('Error fetching top performing content', { userId, error });
      return [];
    }
  }
}

export const socialFanbaseService = new SocialFanbaseService();
