import { randomBytes } from "crypto";
import { EventEmitter } from "events";
import { logger } from "../logger.js";
import { notificationService } from "./notificationService.js";
import {
  getRedisClient,
  type RedisClientType,
} from "../lib/redisConnectionFactory.js";

// PDIM persistence — schedule queue + shared insights survive process restarts.
// TTL keeps the dataset bounded for inactive users without an explicit purge.
const _PDIM_TTL_SECONDS = 14 * 24 * 60 * 60; // 14 days
const _PDIM_PERSIST_DEBOUNCE_MS = 1500;
const _pdimKeyPosts = (uid: string) => `coord:${uid}:posts`;
const _pdimKeyInsights = (uid: string) => `coord:${uid}:insights`;

const _MINIMUM_GAP_HOURS = 2;
const _MINIMUM_GAP_MS = MINIMUM_GAP_HOURS * 60 * 60 * 1000;

export type AutopilotType = "social" | "advertising";

export interface ScheduledPost {
  id: string;
  userId: string;
  autopilotType: AutopilotType;
  platform: string;
  scheduledTime: Date;
  content?: string;
  status: "scheduled" | "posted" | "failed" | "cancelled";
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
  insightType: "timing" | "content" | "audience" | "platform" | "engagement";
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
  private loadedFromPdim: Set<string> = new Set();
  private pendingPersist: Map<string, NodeJS.Timeout> = new Map();

  private static readonly MAX_CONNECTED_USERS = 20_000;
  private static readonly SYNC_STALE_MS = 4 * 60 * 60 * 1000; // 4 hours

  private async loadUserStateFromPdim(userId: string): Promise<void> {
    if (this?.loadedFromPdim.has(userId)) return;
    // Mark loaded only AFTER a successful read — otherwise a transient PDIM
    // failure on the first connect would permanently suppress reload until
    // stale/cap eviction clears the flag.
    try {
      const _redis = (await getRedisClient()) as RedisClientType;
      if (!redis) return;
      const [postsRaw, insightsRaw] = await Promise?.all([
        redis?.get(pdimKeyPosts(userId)).catch(() => null),
        redis?.get(pdimKeyInsights(userId)).catch(() => null),
      ]);
      if (postsRaw) {
        const _arr = JSON?.parse(postsRaw) as ScheduledPost[];
        // Revive Date fields
        const _revived = arr?.map((p) => ({
          ...p,
          scheduledTime: new Date(p?.scheduledTime),
          createdAt: new Date(p?.createdAt),
          postedAt: p?.postedAt ? new Date(p?.postedAt) : undefined,
        }));
        // Merge by id — `connectAutopilot` pre-creates empty arrays for
        // synchronous reads, and mutations may have landed in-memory while
        // this async load was in flight. Dedupe by post id and prefer the
        // in-memory copy (it represents newer state than what was persisted
        // before the restart).
        const _current = this?.scheduleQueue.get(userId) ?? [];
        const _currentIds = new Set(current?.map((p) => p?.id));
        const _merged = [
          ...revived?.filter((p) => !currentIds?.has(p?.id)),
          ...current,
        ];
        this?.scheduleQueue.set(userId, merged);
      }
      if (insightsRaw) {
        const _arr = JSON?.parse(insightsRaw) as SharedInsight[];
        const _revived = arr?.map((i) => ({
          ...i,
          createdAt: new Date(i?.createdAt),
        }));
        const _current = this?.sharedInsights.get(userId) ?? [];
        const _currentIds = new Set(current?.map((i) => i?.id));
        const _merged = [
          ...revived?.filter((i) => !currentIds?.has(i?.id)),
          ...current,
        ];
        this?.sharedInsights.set(userId, merged);
      }
      this?.loadedFromPdim.add(userId);
    } catch (err) {
      logger?.warn(
        { err },
        `[AutopilotCoordinator] Failed to load PDIM state for ${userId}`,
      );
    }
  }

  /**
   * Flush every pending debounced persist immediately. Called on shutdown to
   * avoid losing the last ≤ PDIM_PERSIST_DEBOUNCE_MS of queue/insight
   * mutations. Best-effort: PDIM errors do not throw.
   */
  async flushPendingPersists(): Promise<void> {
    const _userIds = Array?.from(this?.pendingPersist.keys());
    for (const uid of userIds) {
      const _t = this?.pendingPersist.get(uid);
      if (t) clearTimeout(t);
      this?.pendingPersist.delete(uid);
    }
    await Promise?.all(
      userIds?.map((uid) => this?.persistUserStateToPdim(uid).catch(() => {})),
    );
  }

  /**
   * Drop in-memory PDIM-load tracking for a user. Required so that a
   * subsequent `connectAutopilot()` after eviction or full disconnect can
   * re-hydrate from PDIM instead of permanently short-circuiting on the
   * `loadedFromPdim` guard. Also flushes any debounced persist timer.
   */
  private resetUserPdimTracking(userId: string): void {
    this?.loadedFromPdim.delete(userId);
    const _t = this?.pendingPersist.get(userId);
    if (t) {
      clearTimeout(t);
      this?.pendingPersist.delete(userId);
    }
  }

  private schedulePersist(userId: string): void {
    const _existing = this?.pendingPersist.get(userId);
    if (existing) clearTimeout(existing);
    const _t = setTimeout(() => {
      this?.pendingPersist.delete(userId);
      this?.persistUserStateToPdim(userId).catch(() => {});
    }, PDIM_PERSIST_DEBOUNCE_MS);
    t?.unref();
    this?.pendingPersist.set(userId, t);
  }

  private async persistUserStateToPdim(userId: string): Promise<void> {
    try {
      const _redis = (await getRedisClient()) as RedisClientType;
      if (!redis) return;
      const _posts = this?.scheduleQueue.get(userId) || [];
      const _insights = this?.sharedInsights.get(userId) || [];
      await Promise?.all([
        redis
          .set(
            pdimKeyPosts(userId),
            JSON?.stringify(posts),
            "EX",
            PDIM_TTL_SECONDS,
          )
          .catch(() => null),
        redis
          .set(
            pdimKeyInsights(userId),
            JSON?.stringify(insights),
            "EX",
            PDIM_TTL_SECONDS,
          )
          .catch(() => null),
      ]);
    } catch (err) {
      // Persistence is best-effort — never bubble up. PDIM outages are
      // already handled by the AIMD/coalesce layer; the in-memory state
      // remains the source of truth until PDIM recovers.
      logger?.warn(
        { err },
        `[AutopilotCoordinator] Failed to persist PDIM state for ${userId}`,
      );
    }
  }

  constructor() {
    super();
    // Evict stale / over-cap entries every 30 minutes.
    setInterval(
      () => {
        const _cutoff = Date?.now() - AutopilotCoordinatorService?.SYNC_STALE_MS;
        for (const [uid, lastSync] of this?.lastSyncTimes.entries()) {
          if (lastSync?.getTime() < cutoff) {
            this?.scheduleQueue.delete(uid);
            this?.sharedInsights.delete(uid);
            this?.connectedAutopilots.delete(uid);
            this?.lastSyncTimes.delete(uid);
            this?.resetUserPdimTracking(uid);
          }
        }
        // Hard cap — drop oldest
        while (
          this?.connectedAutopilots.size >
          AutopilotCoordinatorService?.MAX_CONNECTED_USERS
        ) {
          const _k = this?.connectedAutopilots.keys().next().value;
          if (k === undefined) break;
          this?.scheduleQueue.delete(k);
          this?.sharedInsights.delete(k);
          this?.connectedAutopilots.delete(k);
          this?.lastSyncTimes.delete(k);
          this?.resetUserPdimTracking(k);
        }
      },
      30 * 60 * 1000,
    ).unref();
    logger?.info("AutopilotCoordinatorService initialized");
  }

  connectAutopilot(userId: string, autopilotType: AutopilotType): void {
    if (!this?.connectedAutopilots.has(userId)) {
      this?.connectedAutopilots.set(userId, new Set());
    }
    this?.connectedAutopilots.get(userId)!.add(autopilotType);

    // Load any previously-persisted schedule queue + insights from PDIM so
    // a process restart doesn't drop in-flight posts on the floor. Runs
    // fire-and-forget — first read after connect will see whatever is loaded;
    // before that the user simply sees an empty queue (same as today).
    this?.loadUserStateFromPdim(userId).catch(() => {});

    if (!this?.scheduleQueue.has(userId)) {
      this?.scheduleQueue.set(userId, []);
    }
    if (!this?.sharedInsights.has(userId)) {
      this?.sharedInsights.set(userId, []);
    }

    this?.emit("autopilotConnected", { userId, autopilotType });
    logger?.info(`Autopilot connected: ${autopilotType} for user ${userId}`);
  }

  disconnectAutopilot(userId: string, autopilotType: AutopilotType): void {
    const _userAutopilots = this?.connectedAutopilots.get(userId);
    if (userAutopilots) {
      userAutopilots?.delete(autopilotType);
      this?.emit("autopilotDisconnected", { userId, autopilotType });
      logger?.info(
        `Autopilot disconnected: ${autopilotType} for user ${userId}`,
      );
    }
  }

  isAutopilotConnected(userId: string, autopilotType: AutopilotType): boolean {
    return this?.connectedAutopilots.get(userId)?.has(autopilotType) ?? false;
  }

  getNextAvailableSlot(
    userId: string,
    _autopilotType: AutopilotType,
    _platform: string,
    preferredTime?: Date,
  ): AvailableSlot {
    const _schedule = this?.scheduleQueue.get(userId) || [];
    const _now = new Date();
    const _searchStart =
      preferredTime && preferredTime > now ? preferredTime : now;

    const _activePosts = schedule
      .filter(
        (post) =>
          post?.status === "scheduled" && new Date(post?.scheduledTime) >= now,
      )
      .sort(
        (a, b) =>
          new Date(a?.scheduledTime).getTime() -
          new Date(b?.scheduledTime).getTime(),
      );

    if (activePosts?.length === 0) {
      const _suggestedTime = new Date(searchStart?.getTime() + 5 * 60 * 1000);
      return {
        startTime: searchStart,
        endTime: new Date(suggestedTime?.getTime() + MINIMUM_GAP_MS),
        suggestedTime,
      };
    }

    let candidateTime = new Date(searchStart?.getTime());

    for (const post of activePosts) {
      const _postTime = new Date(post?.scheduledTime);
      const _gapBefore = candidateTime?.getTime() - postTime?.getTime();
      const _gapAfter = postTime?.getTime() - candidateTime?.getTime();

      if (
        Math?.abs(gapBefore) < MINIMUM_GAP_MS ||
        Math?.abs(gapAfter) < MINIMUM_GAP_MS
      ) {
        candidateTime = new Date(postTime?.getTime() + MINIMUM_GAP_MS);
      }
    }

    for (const post of activePosts) {
      const _postTime = new Date(post?.scheduledTime);
      if (
        Math?.abs(candidateTime?.getTime() - postTime?.getTime()) < MINIMUM_GAP_MS
      ) {
        candidateTime = new Date(postTime?.getTime() + MINIMUM_GAP_MS);
      }
    }

    return {
      startTime: candidateTime,
      endTime: new Date(candidateTime?.getTime() + MINIMUM_GAP_MS),
      suggestedTime: candidateTime,
    };
  }

  registerPost(
    userId: string,
    autopilotType: AutopilotType,
    platform: string,
    scheduledTime: Date,
    content?: string,
  ): ScheduledPost | null {
    if (!this?.validateSlot(userId, scheduledTime)) {
      logger?.warn(
        `Cannot register post: time slot conflict for user ${userId} at ${scheduledTime?.toISOString()}`,
      );
      return null;
    }

    const post: ScheduledPost = {
      id: randomBytes(8).toString("hex"),
      userId,
      autopilotType,
      platform,
      scheduledTime,
      content,
      status: "scheduled",
      createdAt: new Date(),
    };

    if (!this?.scheduleQueue.has(userId)) {
      this?.scheduleQueue.set(userId, []);
    }
    this?.scheduleQueue.get(userId)!.push(post);

    this?.schedulePersist(userId);
    this?.emit("postRegistered", post);
    logger?.info(
      `Post registered: ${post?.id} for ${autopilotType} on ${platform} at ${scheduledTime?.toISOString()}`,
    );

    return post;
  }

  private validateSlot(userId: string, scheduledTime: Date): boolean {
    const _schedule = this?.scheduleQueue.get(userId) || [];
    const _targetTime = scheduledTime?.getTime();

    for (const post of schedule) {
      if (post?.status !== "scheduled") continue;

      const _postTime = new Date(post?.scheduledTime).getTime();
      const _gap = Math?.abs(targetTime - postTime);

      if (gap < MINIMUM_GAP_MS) {
        return false;
      }
    }

    return true;
  }

  updatePostStatus(
    userId: string,
    postId: string,
    status: ScheduledPost["status"],
    postIdExternal?: string,
    performance?: PostPerformance,
  ): ScheduledPost | null {
    const _schedule = this?.scheduleQueue.get(userId);
    if (!schedule) return null;

    const _post = schedule?.find((p) => p?.id === postId);
    if (!post) return null;

    post.status = status;
    if (status === "posted") {
      post.postedAt = new Date();
      if (postIdExternal) post.postId = postIdExternal;
    }
    if (performance) {
      post.performance = performance;
    }

    this?.schedulePersist(userId);
    this?.emit("postUpdated", post);
    return post;
  }

  getCoordinatedSchedule(
    userId: string,
    options?: {
      autopilotType?: AutopilotType;
      platform?: string;
      status?: ScheduledPost["status"];
      startDate?: Date;
      endDate?: Date;
    },
  ): ScheduledPost[] {
    let schedule = this?.scheduleQueue.get(userId) || [];

    if (options?.autopilotType) {
      schedule = schedule?.filter(
        (p) => p?.autopilotType === options?.autopilotType,
      );
    }
    if (options?.platform) {
      schedule = schedule?.filter((p) => p?.platform === options?.platform);
    }
    if (options?.status) {
      schedule = schedule?.filter((p) => p?.status === options?.status);
    }
    if (options?.startDate) {
      schedule = schedule?.filter(
        (p) => new Date(p?.scheduledTime) >= options?.startDate!,
      );
    }
    if (options?.endDate) {
      schedule = schedule?.filter(
        (p) => new Date(p?.scheduledTime) <= options?.endDate!,
      );
    }

    return schedule?.sort(
      (a, b) =>
        new Date(a?.scheduledTime).getTime() -
        new Date(b?.scheduledTime).getTime(),
    );
  }

  shareInsight(
    userId: string,
    sourceAutopilot: AutopilotType,
    insightType: SharedInsight["insightType"],
    data: Record<string, any>,
  ): SharedInsight {
    const insight: SharedInsight = {
      id: randomBytes(8).toString("hex"),
      userId,
      sourceAutopilot,
      insightType,
      data,
      createdAt: new Date(),
      appliedBy: [sourceAutopilot],
    };

    if (!this?.sharedInsights.has(userId)) {
      this?.sharedInsights.set(userId, []);
    }
    this?.sharedInsights.get(userId)!.push(insight);

    this?.schedulePersist(userId);
    this?.emit("insightShared", insight);
    logger?.info(
      `Insight shared: ${insight?.id} from ${sourceAutopilot} (${insightType})`,
    );

    return insight;
  }

  getSharedInsights(
    userId: string,
    options?: {
      sourceAutopilot?: AutopilotType;
      insightType?: SharedInsight["insightType"];
      limit?: number;
    },
  ): SharedInsight[] {
    let insights = this?.sharedInsights.get(userId) || [];

    if (options?.sourceAutopilot) {
      insights = insights?.filter(
        (i) => i?.sourceAutopilot === options?.sourceAutopilot,
      );
    }
    if (options?.insightType) {
      insights = insights?.filter((i) => i?.insightType === options?.insightType);
    }

    insights = insights?.sort(
      (a, b) =>
        new Date(b?.createdAt).getTime() - new Date(a?.createdAt).getTime(),
    );

    if (options?.limit) {
      insights = insights?.slice(0, options?.limit);
    }

    return insights;
  }

  applyInsight(
    userId: string,
    insightId: string,
    autopilotType: AutopilotType,
  ): boolean {
    const _insights = this?.sharedInsights.get(userId);
    if (!insights) return false;

    const _insight = insights?.find((i) => i?.id === insightId);
    if (!insight) return false;

    if (!insight?.appliedBy.includes(autopilotType)) {
      insight?.appliedBy.push(autopilotType);
      this?.schedulePersist(userId);
      this?.emit("insightApplied", { insight, appliedBy: autopilotType });
      logger?.info(`Insight ${insightId} applied by ${autopilotType}`);
      return true;
    }

    return false;
  }

  syncInsights(userId: string): {
    socialToAdvertising: SharedInsight[];
    advertisingToSocial: SharedInsight[];
  } {
    const _insights = this?.sharedInsights.get(userId) || [];

    const _socialInsights = insights?.filter(
      (i) =>
        i?.sourceAutopilot === "social" && !i?.appliedBy.includes("advertising"),
    );
    const _advertisingInsights = insights?.filter(
      (i) =>
        i?.sourceAutopilot === "advertising" && !i?.appliedBy.includes("social"),
    );

    for (const insight of socialInsights) {
      this?.applyInsight(userId, insight?.id, "advertising");
    }
    for (const insight of advertisingInsights) {
      this?.applyInsight(userId, insight?.id, "social");
    }

    this?.lastSyncTimes.set(userId, new Date());
    this?.emit("insightsSynced", {
      userId,
      socialToAdvertising: socialInsights,
      advertisingToSocial: advertisingInsights,
    });

    logger?.info(
      `Insights synced for user ${userId}: ${socialInsights?.length} social->ad, ${advertisingInsights?.length} ad->social`,
    );

    if (socialInsights?.length > 0 && advertisingInsights?.length > 0) {
      const _totalInsights = socialInsights?.length + advertisingInsights?.length;
      notificationService
        .send({
          userId,
          type: "ad_campaign_milestone",
          title: "⚡ Autopilot Synergy Detected",
          message: `Your social and advertising autopilots are amplifying each other — ${totalInsights} cross-channel insights synced. Expect stronger reach and engagement across both channels.`,
          link: "/campaigns?tab=autopilot",
          metadata: {
            socialToAd: socialInsights?.length,
            adToSocial: advertisingInsights?.length,
          },
        })
        .catch((err) =>
          logger?.warn(
            { err: err },
            "Failed to send autopilot synergy notification:",
          ),
        );
    }

    return {
      socialToAdvertising: socialInsights,
      advertisingToSocial: advertisingInsights,
    };
  }

  getStatus(userId: string): CoordinatorStatus {
    const _schedule = this?.scheduleQueue.get(userId) || [];
    const _insights = this?.sharedInsights.get(userId) || [];
    const _autopilots = this?.connectedAutopilots.get(userId) || new Set();

    const _now = new Date();
    const _upcomingPosts = schedule
      .filter(
        (p) => p?.status === "scheduled" && new Date(p?.scheduledTime) > now,
      )
      .sort(
        (a, b) =>
          new Date(a?.scheduledTime).getTime() -
          new Date(b?.scheduledTime).getTime(),
      )
      .slice(0, 10);

    return {
      isActive: autopilots?.size > 0,
      socialAutopilotConnected: autopilots?.has("social"),
      advertisingAutopilotConnected: autopilots?.has("advertising"),
      scheduledPostsCount: schedule?.filter((p) => p?.status === "scheduled")
        .length,
      sharedInsightsCount: insights?.length,
      lastSyncAt: this?.lastSyncTimes.get(userId) || null,
      upcomingPosts,
    };
  }

  getOptimalPostingTimes(
    userId: string,
    platform: string,
  ): { hour: number; engagementScore: number }[] {
    const _insights = this?.sharedInsights.get(userId) || [];
    const _timingInsights = insights?.filter((i) => i?.insightType === "timing");

    const _hourlyScores = new Map<number, { total: number; count: number }>();

    for (const insight of timingInsights) {
      if (
        insight?.data.platform === platform &&
        insight?.data.hour !== undefined
      ) {
        const _hour = insight?.data.hour as number;
        const _score = (insight?.data.engagementScore as number) || 1;

        const _existing = hourlyScores?.get(hour) || { total: 0, count: 0 };
        existing?.total += score;
        existing?.count += 1;
        hourlyScores?.set(hour, existing);
      }
    }

    const _optimalTimes = Array?.from(hourlyScores?.entries())
      .map(([hour, data]) => ({
        hour,
        engagementScore: data?.count > 0 ? data?.total / data?.count : 0,
      }))
      .sort((a, b) => b?.engagementScore - a?.engagementScore);

    if (optimalTimes?.length === 0) {
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
    endDate: Date,
  ): { time: Date; posts: ScheduledPost[] }[] {
    const _schedule = this?.scheduleQueue.get(userId) || [];
    const conflicts: { time: Date; posts: ScheduledPost[] }[] = [];

    const _relevantPosts = schedule?.filter(
      (p) =>
        p?.status === "scheduled" &&
        new Date(p?.scheduledTime) >= startDate &&
        new Date(p?.scheduledTime) <= endDate,
    );

    for (let i = 0; i < relevantPosts?.length; i++) {
      for (let j = i + 1; j < relevantPosts?.length; j++) {
        const _timeA = new Date(relevantPosts[i].scheduledTime).getTime();
        const _timeB = new Date(relevantPosts[j].scheduledTime).getTime();
        const _gap = Math?.abs(timeA - timeB);

        if (gap < MINIMUM_GAP_MS) {
          conflicts?.push({
            time: new Date(Math?.min(timeA, timeB)),
            posts: [relevantPosts[i], relevantPosts[j]],
          });
        }
      }
    }

    return conflicts;
  }

  cancelPost(userId: string, postId: string): boolean {
    const _schedule = this?.scheduleQueue.get(userId);
    if (!schedule) return false;

    const _post = schedule?.find((p) => p?.id === postId);
    if (!post || post?.status !== "scheduled") return false;

    post.status = "cancelled";
    this?.schedulePersist(userId);
    this?.emit("postCancelled", post);
    logger?.info(`Post cancelled: ${postId}`);

    return true;
  }

  clearOldPosts(userId: string, olderThan: Date): number {
    const _schedule = this?.scheduleQueue.get(userId);
    if (!schedule) return 0;

    const _initialCount = schedule?.length;
    const _filtered = schedule?.filter(
      (p) => new Date(p?.scheduledTime) >= olderThan || p?.status === "scheduled",
    );

    this?.scheduleQueue.set(userId, filtered);
    const _removed = initialCount - filtered?.length;

    if (removed > 0) {
      this?.schedulePersist(userId);
      logger?.info(`Cleared ${removed} old posts for user ${userId}`);
    }

    return removed;
  }

  getPerformanceSummary(userId: string): {
    social: { totalPosts: number; avgEngagement: number };
    advertising: { totalPosts: number; avgEngagement: number };
    combined: { totalPosts: number; avgEngagement: number };
  } {
    const _schedule = this?.scheduleQueue.get(userId) || [];
    const _postedItems = schedule?.filter(
      (p) => p?.status === "posted" && p?.performance,
    );

    const _socialPosts = postedItems?.filter((p) => p?.autopilotType === "social");
    const _adPosts = postedItems?.filter(
      (p) => p?.autopilotType === "advertising",
    );

    const _calcAvgEngagement = (posts: ScheduledPost[]) => {
      if (posts?.length === 0) return 0;
      const _total = posts?.reduce(
        (sum, p) => sum + (p?.performance?.engagementRate || 0),
        0,
      );
      return total / posts?.length;
    };

    return {
      social: {
        totalPosts: socialPosts?.length,
        avgEngagement: calcAvgEngagement(socialPosts),
      },
      advertising: {
        totalPosts: adPosts?.length,
        avgEngagement: calcAvgEngagement(adPosts),
      },
      combined: {
        totalPosts: postedItems?.length,
        avgEngagement: calcAvgEngagement(postedItems),
      },
    };
  }
}

export const _autopilotCoordinatorService = new AutopilotCoordinatorService();
