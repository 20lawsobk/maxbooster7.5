import { EventEmitter } from 'events';
import { logger } from '../logger.js';
import { nanoid } from 'nanoid';

const MINIMUM_GAP_HOURS = 2;
const MINIMUM_GAP_MS = MINIMUM_GAP_HOURS * 60 * 60 * 1000;

export type AutopilotType = 'social' | 'advertising';

export interface ScheduledPost {
  id: string;
  userId: string;
  autopilotType: AutopilotType;
  platform: string;
  scheduledTime: Date;
  content?: string;
  status: 'scheduled' | 'posted' | 'failed' | 'cancelled';
  createdAt: Date;
  postedAt?: Date;
  postId?: string;
  performance?: PostPerformance;
}

export interface PostPerformance {
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  engagementRate: number;
  impressions: number;
}

export interface SharedInsight {
  id: string;
  userId: string;
  sourceAutopilot: AutopilotType;
  insightType: 'timing' | 'content' | 'audience' | 'platform' | 'engagement';
  data: Record<string, any>;
  createdAt: Date;
  appliedBy: AutopilotType[];
}

export interface CoordinatorStatus {
  isActive: boolean;
  socialAutopilotConnected: boolean;
  advertisingAutopilotConnected: boolean;
  scheduledPostsCount: number;
  sharedInsightsCount: number;
  lastSyncAt: Date | null;
  upcomingPosts: ScheduledPost[];
}

export interface AvailableSlot {
  startTime: Date;
  endTime: Date;
  suggestedTime: Date;
}

class AutopilotCoordinatorService extends EventEmitter {
  private scheduleQueue: Map<string, ScheduledPost[]> = new Map();
  private sharedInsights: Map<string, SharedInsight[]> = new Map();
  private connectedAutopilots: Map<string, Set<AutopilotType>> = new Map();
  private lastSyncTimes: Map<string, Date> = new Map();

  constructor() {
    super();
    logger.info('AutopilotCoordinatorService initialized');
  }

  connectAutopilot(userId: string, autopilotType: AutopilotType): void {
    if (!this.connectedAutopilots.has(userId)) {
      this.connectedAutopilots.set(userId, new Set());
    }
    this.connectedAutopilots.get(userId)!.add(autopilotType);
    
    if (!this.scheduleQueue.has(userId)) {
      this.scheduleQueue.set(userId, []);
    }
    if (!this.sharedInsights.has(userId)) {
      this.sharedInsights.set(userId, []);
    }
    
    this.emit('autopilotConnected', { userId, autopilotType });
    logger.info(`Autopilot connected: ${autopilotType} for user ${userId}`);
  }

  disconnectAutopilot(userId: string, autopilotType: AutopilotType): void {
    const userAutopilots = this.connectedAutopilots.get(userId);
    if (userAutopilots) {
      userAutopilots.delete(autopilotType);
      this.emit('autopilotDisconnected', { userId, autopilotType });
      logger.info(`Autopilot disconnected: ${autopilotType} for user ${userId}`);
    }
  }

  isAutopilotConnected(userId: string, autopilotType: AutopilotType): boolean {
    return this.connectedAutopilots.get(userId)?.has(autopilotType) ?? false;
  }

  getNextAvailableSlot(
    userId: string,
    autopilotType: AutopilotType,
    platform: string,
    preferredTime?: Date
  ): AvailableSlot {
    const schedule = this.scheduleQueue.get(userId) || [];
    const now = new Date();
    const searchStart = preferredTime && preferredTime > now ? preferredTime : now;
    
    const activePosts = schedule
      .filter(post => 
        post.status === 'scheduled' &&
        new Date(post.scheduledTime) >= now
      )
      .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime());

    if (activePosts.length === 0) {
      const suggestedTime = new Date(searchStart.getTime() + 5 * 60 * 1000);
      return {
        startTime: searchStart,
        endTime: new Date(suggestedTime.getTime() + MINIMUM_GAP_MS),
        suggestedTime,
      };
    }

    let candidateTime = new Date(searchStart.getTime());
    
    for (const post of activePosts) {
      const postTime = new Date(post.scheduledTime);
      const gapBefore = candidateTime.getTime() - postTime.getTime();
      const gapAfter = postTime.getTime() - candidateTime.getTime();

      if (Math.abs(gapBefore) < MINIMUM_GAP_MS || Math.abs(gapAfter) < MINIMUM_GAP_MS) {
        candidateTime = new Date(postTime.getTime() + MINIMUM_GAP_MS);
      }
    }

    for (const post of activePosts) {
      const postTime = new Date(post.scheduledTime);
      if (Math.abs(candidateTime.getTime() - postTime.getTime()) < MINIMUM_GAP_MS) {
        candidateTime = new Date(postTime.getTime() + MINIMUM_GAP_MS);
      }
    }

    return {
      startTime: candidateTime,
      endTime: new Date(candidateTime.getTime() + MINIMUM_GAP_MS),
      suggestedTime: candidateTime,
    };
  }

  registerPost(
    userId: string,
    autopilotType: AutopilotType,
    platform: string,
    scheduledTime: Date,
    content?: string
  ): ScheduledPost | null {
    if (!this.validateSlot(userId, scheduledTime)) {
      logger.warn(`Cannot register post: time slot conflict for user ${userId} at ${scheduledTime.toISOString()}`);
      return null;
    }

    const post: ScheduledPost = {
      id: nanoid(),
      userId,
      autopilotType,
      platform,
      scheduledTime,
      content,
      status: 'scheduled',
      createdAt: new Date(),
    };

    if (!this.scheduleQueue.has(userId)) {
      this.scheduleQueue.set(userId, []);
    }
    this.scheduleQueue.get(userId)!.push(post);

    this.emit('postRegistered', post);
    logger.info(`Post registered: ${post.id} for ${autopilotType} on ${platform} at ${scheduledTime.toISOString()}`);
    
    return post;
  }

  private validateSlot(userId: string, scheduledTime: Date): boolean {
    const schedule = this.scheduleQueue.get(userId) || [];
    const targetTime = scheduledTime.getTime();

    for (const post of schedule) {
      if (post.status !== 'scheduled') continue;
      
      const postTime = new Date(post.scheduledTime).getTime();
      const gap = Math.abs(targetTime - postTime);
      
      if (gap < MINIMUM_GAP_MS) {
        return false;
      }
    }

    return true;
  }

  updatePostStatus(
    userId: string,
    postId: string,
    status: ScheduledPost['status'],
    postIdExternal?: string,
    performance?: PostPerformance
  ): ScheduledPost | null {
    const schedule = this.scheduleQueue.get(userId);
    if (!schedule) return null;

    const post = schedule.find(p => p.id === postId);
    if (!post) return null;

    post.status = status;
    if (status === 'posted') {
      post.postedAt = new Date();
      if (postIdExternal) post.postId = postIdExternal;
    }
    if (performance) {
      post.performance = performance;
    }

    this.emit('postUpdated', post);
    return post;
  }

  getCoordinatedSchedule(
    userId: string,
    options?: {
      autopilotType?: AutopilotType;
      platform?: string;
      status?: ScheduledPost['status'];
      startDate?: Date;
      endDate?: Date;
    }
  ): ScheduledPost[] {
    let schedule = this.scheduleQueue.get(userId) || [];

    if (options?.autopilotType) {
      schedule = schedule.filter(p => p.autopilotType === options.autopilotType);
    }
    if (options?.platform) {
      schedule = schedule.filter(p => p.platform === options.platform);
    }
    if (options?.status) {
      schedule = schedule.filter(p => p.status === options.status);
    }
    if (options?.startDate) {
      schedule = schedule.filter(p => new Date(p.scheduledTime) >= options.startDate!);
    }
    if (options?.endDate) {
      schedule = schedule.filter(p => new Date(p.scheduledTime) <= options.endDate!);
    }

    return schedule.sort(
      (a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
    );
  }

  shareInsight(
    userId: string,
    sourceAutopilot: AutopilotType,
    insightType: SharedInsight['insightType'],
    data: Record<string, any>
  ): SharedInsight {
    const insight: SharedInsight = {
      id: nanoid(),
      userId,
      sourceAutopilot,
      insightType,
      data,
      createdAt: new Date(),
      appliedBy: [sourceAutopilot],
    };

    if (!this.sharedInsights.has(userId)) {
      this.sharedInsights.set(userId, []);
    }
    this.sharedInsights.get(userId)!.push(insight);

    this.emit('insightShared', insight);
    logger.info(`Insight shared: ${insight.id} from ${sourceAutopilot} (${insightType})`);
    
    return insight;
  }

  getSharedInsights(
    userId: string,
    options?: {
      sourceAutopilot?: AutopilotType;
      insightType?: SharedInsight['insightType'];
      limit?: number;
    }
  ): SharedInsight[] {
    let insights = this.sharedInsights.get(userId) || [];

    if (options?.sourceAutopilot) {
      insights = insights.filter(i => i.sourceAutopilot === options.sourceAutopilot);
    }
    if (options?.insightType) {
      insights = insights.filter(i => i.insightType === options.insightType);
    }

    insights = insights.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    if (options?.limit) {
      insights = insights.slice(0, options.limit);
    }

    return insights;
  }

  applyInsight(userId: string, insightId: string, autopilotType: AutopilotType): boolean {
    const insights = this.sharedInsights.get(userId);
    if (!insights) return false;

    const insight = insights.find(i => i.id === insightId);
    if (!insight) return false;

    if (!insight.appliedBy.includes(autopilotType)) {
      insight.appliedBy.push(autopilotType);
      this.emit('insightApplied', { insight, appliedBy: autopilotType });
      logger.info(`Insight ${insightId} applied by ${autopilotType}`);
      return true;
    }

    return false;
  }

  syncInsights(userId: string): {
    socialToAdvertising: SharedInsight[];
    advertisingToSocial: SharedInsight[];
  } {
    const insights = this.sharedInsights.get(userId) || [];
    
    const socialInsights = insights.filter(
      i => i.sourceAutopilot === 'social' && !i.appliedBy.includes('advertising')
    );
    const advertisingInsights = insights.filter(
      i => i.sourceAutopilot === 'advertising' && !i.appliedBy.includes('social')
    );

    for (const insight of socialInsights) {
      this.applyInsight(userId, insight.id, 'advertising');
    }
    for (const insight of advertisingInsights) {
      this.applyInsight(userId, insight.id, 'social');
    }

    this.lastSyncTimes.set(userId, new Date());
    this.emit('insightsSynced', { userId, socialToAdvertising: socialInsights, advertisingToSocial: advertisingInsights });
    
    logger.info(`Insights synced for user ${userId}: ${socialInsights.length} social->ad, ${advertisingInsights.length} ad->social`);

    return {
      socialToAdvertising: socialInsights,
      advertisingToSocial: advertisingInsights,
    };
  }

  getStatus(userId: string): CoordinatorStatus {
    const schedule = this.scheduleQueue.get(userId) || [];
    const insights = this.sharedInsights.get(userId) || [];
    const autopilots = this.connectedAutopilots.get(userId) || new Set();
    
    const now = new Date();
    const upcomingPosts = schedule
      .filter(p => p.status === 'scheduled' && new Date(p.scheduledTime) > now)
      .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime())
      .slice(0, 10);

    return {
      isActive: autopilots.size > 0,
      socialAutopilotConnected: autopilots.has('social'),
      advertisingAutopilotConnected: autopilots.has('advertising'),
      scheduledPostsCount: schedule.filter(p => p.status === 'scheduled').length,
      sharedInsightsCount: insights.length,
      lastSyncAt: this.lastSyncTimes.get(userId) || null,
      upcomingPosts,
    };
  }

  getOptimalPostingTimes(
    userId: string,
    platform: string
  ): { hour: number; engagementScore: number }[] {
    const insights = this.sharedInsights.get(userId) || [];
    const timingInsights = insights.filter(i => i.insightType === 'timing');
    
    const hourlyScores = new Map<number, { total: number; count: number }>();
    
    for (const insight of timingInsights) {
      if (insight.data.platform === platform && insight.data.hour !== undefined) {
        const hour = insight.data.hour as number;
        const score = insight.data.engagementScore as number || 1;
        
        const existing = hourlyScores.get(hour) || { total: 0, count: 0 };
        existing.total += score;
        existing.count += 1;
        hourlyScores.set(hour, existing);
      }
    }

    const optimalTimes = Array.from(hourlyScores.entries())
      .map(([hour, data]) => ({
        hour,
        engagementScore: data.count > 0 ? data.total / data.count : 0,
      }))
      .sort((a, b) => b.engagementScore - a.engagementScore);

    if (optimalTimes.length === 0) {
      return [
        { hour: 9, engagementScore: 0.8 },
        { hour: 12, engagementScore: 0.9 },
        { hour: 15, engagementScore: 0.85 },
        { hour: 18, engagementScore: 0.95 },
        { hour: 21, engagementScore: 0.7 },
      ];
    }

    return optimalTimes;
  }

  getPostingConflicts(
    userId: string,
    startDate: Date,
    endDate: Date
  ): { time: Date; posts: ScheduledPost[] }[] {
    const schedule = this.scheduleQueue.get(userId) || [];
    const conflicts: { time: Date; posts: ScheduledPost[] }[] = [];

    const relevantPosts = schedule.filter(
      p => p.status === 'scheduled' &&
        new Date(p.scheduledTime) >= startDate &&
        new Date(p.scheduledTime) <= endDate
    );

    for (let i = 0; i < relevantPosts.length; i++) {
      for (let j = i + 1; j < relevantPosts.length; j++) {
        const timeA = new Date(relevantPosts[i].scheduledTime).getTime();
        const timeB = new Date(relevantPosts[j].scheduledTime).getTime();
        const gap = Math.abs(timeA - timeB);

        if (gap < MINIMUM_GAP_MS) {
          conflicts.push({
            time: new Date(Math.min(timeA, timeB)),
            posts: [relevantPosts[i], relevantPosts[j]],
          });
        }
      }
    }

    return conflicts;
  }

  cancelPost(userId: string, postId: string): boolean {
    const schedule = this.scheduleQueue.get(userId);
    if (!schedule) return false;

    const post = schedule.find(p => p.id === postId);
    if (!post || post.status !== 'scheduled') return false;

    post.status = 'cancelled';
    this.emit('postCancelled', post);
    logger.info(`Post cancelled: ${postId}`);
    
    return true;
  }

  clearOldPosts(userId: string, olderThan: Date): number {
    const schedule = this.scheduleQueue.get(userId);
    if (!schedule) return 0;

    const initialCount = schedule.length;
    const filtered = schedule.filter(
      p => new Date(p.scheduledTime) >= olderThan || p.status === 'scheduled'
    );
    
    this.scheduleQueue.set(userId, filtered);
    const removed = initialCount - filtered.length;
    
    if (removed > 0) {
      logger.info(`Cleared ${removed} old posts for user ${userId}`);
    }
    
    return removed;
  }

  getPerformanceSummary(userId: string): {
    social: { totalPosts: number; avgEngagement: number };
    advertising: { totalPosts: number; avgEngagement: number };
    combined: { totalPosts: number; avgEngagement: number };
  } {
    const schedule = this.scheduleQueue.get(userId) || [];
    const postedItems = schedule.filter(p => p.status === 'posted' && p.performance);

    const socialPosts = postedItems.filter(p => p.autopilotType === 'social');
    const adPosts = postedItems.filter(p => p.autopilotType === 'advertising');

    const calcAvgEngagement = (posts: ScheduledPost[]) => {
      if (posts.length === 0) return 0;
      const total = posts.reduce((sum, p) => sum + (p.performance?.engagementRate || 0), 0);
      return total / posts.length;
    };

    return {
      social: {
        totalPosts: socialPosts.length,
        avgEngagement: calcAvgEngagement(socialPosts),
      },
      advertising: {
        totalPosts: adPosts.length,
        avgEngagement: calcAvgEngagement(adPosts),
      },
      combined: {
        totalPosts: postedItems.length,
        avgEngagement: calcAvgEngagement(postedItems),
      },
    };
  }
}

export const autopilotCoordinatorService = new AutopilotCoordinatorService();
