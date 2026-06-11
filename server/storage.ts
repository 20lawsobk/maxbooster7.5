import { logger } from "./logger";
import { randomBytes } from "crypto";
import {
  users,
  dspProviders,
  projects,
  releases,
  posts,
  socialAccounts,
  socialCampaigns,
  adCampaigns,
  adCreatives,
  contentCalendar,
  aiModels,
  notifications,
  analytics,
  pluginCatalog,
  pluginPresets,
  distroReleases,
  distroTracks,
  instantPayouts,
  royaltyTransactions,
  hyperFollowPages,
  jwtTokens,
  refreshTokens,
  listings,
  listingLicenseTiers,
  sessions,
  collabSnapshots,
  orders,
  autopilotLearningData,
  inferenceRuns,
  socialKeywords,
  socialMentions,
  socialAutopilotContent,
  systemSettings,
  workspaceAuditLog,
  contractTemplates,
  type User,
  type InsertUser,
  type DSPProvider,
  type InsertProject,
  type CollabSnapshot,
  type InsertCollabSnapshot,
} from "@shared/schema";
import { db, dbRead } from "./db";
import {
  eq,
  and,
  desc,
  gte,
  lte,
  sql,
  inArray,
  ilike,
  or,
  asc,
  lt,
  isNotNull,
} from "drizzle-orm";

type Project = typeof projects.$inferSelect;
type Release = typeof releases.$inferSelect;
type Post = typeof posts.$inferSelect;
type SocialAccount = typeof socialAccounts.$inferSelect;
type AdCampaign = typeof adCampaigns.$inferSelect;
type Notification = typeof notifications.$inferSelect;
type DistroRelease = typeof distroReleases.$inferSelect;
type DistroTrack = typeof distroTracks.$inferSelect;

export interface IStorage {
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByPasswordResetToken(token: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User | undefined>;
  deleteUser(id: string): Promise<boolean>;
  getDistributionProvider(slug: string): Promise<DSPProvider | undefined>;
  getProjectsByUserId(userId: string): Promise<Project[]>;
  createProject(project: InsertProject): Promise<Project>;
  getReleasesByUserId(userId: string): Promise<Release[]>;
  createJWTToken(data: Record<string, unknown>): Promise<string>;
  verifyJWTToken(jti: string): Promise<boolean>;
  revokeJWTToken(id: string, reason: string): Promise<void>;
  revokeAllJWTTokensForUser(userId: string, reason: string): Promise<void>;
  createRefreshToken(data: Record<string, unknown>): Promise<string>;
  getRefreshToken(token: string): Promise<unknown>;
  revokeRefreshToken(id: string, reason: string): Promise<void>;
  revokeAllRefreshTokensForUser(userId: string, reason: string): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  // Auth queries always use the primary db — replicas are for analytics/dashboard reads.
  // Authentication requires the latest committed data; replica lag cannot be tolerated here.
  private async _retryQuery<T>(
    fn: () => Promise<T>,
    label: string,
  ): Promise<T> {
    let lastErr: unknown;
    // 2 attempts (1 retry) with a 300 ms backoff.  Kept small so that a
    // congested Neon WebSocket connection doesn't stall foreground requests
    // for multiple seconds — the caller (attachUser, route handlers) must
    // respond within the HTTP client's AbortSignal budget.
    const _MAX_ATTEMPTS = 2;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const _msg = err?.message ?? "";
        const _causeMsg = err?.cause?.message ?? "";
        const _causeCode = err?.cause?.code ?? err?.code ?? "";
        const _permanentCodes = new Set([
          "42703",
          "42P01",
          "42601",
          "23505",
          "23503",
          "22001",
          "22P02",
        ]);
        const _isPermanent = permanentCodes?.has(causeCode);
        const _isTransient =
          !isPermanent &&
          (msg?.includes("Failed query") ||
            causeMsg?.includes("timeout") ||
            causeMsg?.includes("connection") ||
            causeMsg?.includes("ECONNRESET") ||
            causeMsg?.includes("WebSocket") ||
            causeMsg?.includes("closed"));
        if (isTransient && attempt < MAX_ATTEMPTS) {
          logger?.warn(
            `[Storage] ${label} transient DB error (attempt ${attempt}/${MAX_ATTEMPTS}), retrying in 300ms:`,
            msg,
            "| cause:",
            causeMsg || "none",
            "| code:",
            causeCode || "none",
          );
          await new Promise((r) => setTimeout(r, 300));
          continue;
        }
        logger?.warn(
          `[Storage] ${label} final DB error after ${attempt} attempts:`,
          msg,
          "| cause:",
          causeMsg || "none",
          "| code:",
          causeCode || "none",
          "| causeDetail:",
          JSON?.stringify(err?.cause ?? null),
        );
        throw err;
      }
    }
    throw lastErr;
  }

  async getUser(id: string): Promise<User | undefined> {
    const [user] = await this?._retryQuery(
      () => db?.select().from(users).where(eq(users?.id, id)).limit(1),
      "getUser",
    );
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await this?._retryQuery(
      () => db?.select().from(users).where(eq(users?.email, email)).limit(1),
      "getUserByEmail",
    );
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await this?._retryQuery(
      () =>
        db?.select().from(users).where(eq(users?.username, username)).limit(1),
      "getUserByUsername",
    );
    return user || undefined;
  }

  async getUserByPasswordResetToken(token: string): Promise<User | undefined> {
    const [user] = await this?._retryQuery(
      () =>
        db
          .select()
          .from(users)
          .where(eq(users?.passwordResetToken, token))
          .limit(1),
      "getUserByPasswordResetToken",
    );
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db?.insert(users).values(insertUser).returning();

    // Initialize Pocket Dimension storage for new user — fire-and-forget so
    // PDIM congestion never blocks or fails the user-creation response.
    import("./services/userPocketDimensionService.js")
      .then(({ userPocketService }) =>
        userPocketService?.initializeUserStorage(user?.id, user?.email),
      )
      .catch((error) =>
        logger?.warn(
          { err: error },
          `[Storage] Failed to initialize pocket dimension for user ${user?.id}:`,
        ),
      );

    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(data)
      .where(eq(users?.id, id))
      .returning();
    return user || undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    const _result = await db
      .delete(users)
      .where(eq(users?.id, id))
      .returning({ id: users?.id });
    return result?.length > 0;
  }

  async getDistributionProvider(
    slug: string,
  ): Promise<DSPProvider | undefined> {
    const [provider] = await dbRead
      .select()
      .from(dspProviders)
      .where(eq(dspProviders?.slug, slug));
    return provider || undefined;
  }

  async getProjectsByUserId(userId: string): Promise<Project[]> {
    return await dbRead
      .select()
      .from(projects)
      .where(eq(projects?.userId, userId))
      .orderBy(desc(projects?.updatedAt))
      .limit(500);
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db
      .insert(projects)
      .values(insertProject)
      .returning();
    return project;
  }

  async getReleasesByUserId(userId: string): Promise<Release[]> {
    return await dbRead
      .select()
      .from(releases)
      .where(eq(releases?.userId, userId))
      .orderBy(desc(releases?.createdAt))
      .limit(500);
  }

  async getAutopilotConfig(userId: string): Promise<any | undefined> {
    const [user] = await db
      .select({ preferences: users?.preferences })
      .from(users)
      .where(eq(users?.id, userId))
      .limit(1);

    if (!user) return undefined;
    return (
      (user?.preferences as Record<string, unknown>)?.autopilotConfig ||
      undefined
    );
  }

  async saveAutopilotConfig(
    userId: string,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const [user] = await dbRead
      .select({ preferences: users?.preferences })
      .from(users)
      .where(eq(users?.id, userId));
    const _prefs = (user?.preferences as Record<string, unknown>) || {};
    prefs.autopilotConfig = config;
    await db
      .update(users)
      .set({ preferences: prefs })
      .where(eq(users?.id, userId));
    return config;
  }

  async getAdvertisingAutopilotConfig(
    userId: string,
  ): Promise<any | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users?.id, userId))
      .limit(1);

    if (!user) return undefined;
    return (
      (user?.preferences as Record<string, unknown>)
        ?.advertisingAutopilotConfig || undefined
    );
  }

  async saveAdvertisingAutopilotConfig(
    userId: string,
    config: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const [user] = await dbRead
      .select({ preferences: users?.preferences })
      .from(users)
      .where(eq(users?.id, userId));
    const _prefs = (user?.preferences as Record<string, unknown>) || {};
    prefs.advertisingAutopilotConfig = config;
    await db
      .update(users)
      .set({ preferences: prefs })
      .where(eq(users?.id, userId));
    return config;
  }

  async getAllEnabledAutopilotConfigs(): Promise<any[]> {
    const _result = await dbRead?.execute(sql`
      SELECT id, preferences
      FROM users
      WHERE (preferences->>'autopilotConfig')::jsonb->>'enabled' = 'true'
      LIMIT 1000
    `);
    const _rows = (result as { rows?: unknown[] }).rows ?? result;
    return Array?.isArray(rows)
      ? rows?.map((user: Record<string, unknown>) => {
          const _prefs =
            typeof user?.preferences === "string"
              ? JSON?.parse(user?.preferences)
              : (user?.preferences ?? {});
          const _config = prefs?.autopilotConfig;
          return { userId: user?.id, ...config };
        })
      : [];
  }

  async getUserAIModel(
    userId: string,
    modelType: string,
  ): Promise<any | undefined> {
    const [model] = await db
      .select()
      .from(aiModels)
      .where(eq(aiModels?.modelName, `${userId}-${modelType}`))
      .limit(1);
    return model || undefined;
  }

  async saveUserAIModel(
    userId: string,
    modelType: string,
    weights: unknown,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const _existing = await this?.getUserAIModel(userId, modelType);
    if (existing) {
      await db
        .update(aiModels)
        .set({
          parameters: weights,
          performance: metadata,
          lastTrainedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(aiModels?.id, existing?.id));
    } else {
      await db?.insert(aiModels).values({
        modelName: `${userId}-${modelType}`,
        modelType,
        parameters: weights,
        performance: metadata,
        lastTrainedAt: new Date(),
      });
    }
  }

  async getAIModelByName(modelName: string): Promise<any | undefined> {
    const [model] = await db
      .select()
      .from(aiModels)
      .where(eq(aiModels?.modelName, modelName))
      .limit(1);
    return model || undefined;
  }

  async createInferenceRun(
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const [run] = await db?.insert(inferenceRuns).values(data).returning();
    return run;
  }

  async getSocialPosts(userId: string): Promise<Post[]> {
    return await db
      .select()
      .from(posts)
      .where(eq(posts?.userId, userId))
      .orderBy(desc(posts?.createdAt))
      .limit(100);
  }

  async getUserSocialPosts(userId: string): Promise<Post[]> {
    return this?.getSocialPosts(userId);
  }

  async getScheduledPosts(
    input: string | { userId?: string; status?: string },
  ): Promise<any[]> {
    const conditions: import("drizzle-orm").SQL<unknown>[] = [];
    if (typeof input === "string") {
      conditions?.push(eq(posts?.userId, input));
      conditions?.push(sql`${posts?.status} IN ('scheduled', 'pending')`);
    } else {
      if (input?.userId) conditions?.push(eq(posts?.userId, input?.userId));
      if (input?.status) {
        conditions?.push(eq(posts?.status, input?.status));
      } else {
        conditions?.push(sql`${posts?.status} IN ('scheduled', 'pending')`);
      }
    }
    return db
      .select()
      .from(posts)
      .where(conditions?.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(posts?.scheduledAt))
      .limit(500);
  }

  async createScheduledPost(
    post: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const { platforms, content, scheduledTime, viralPrediction, createdBy } =
      post;
    const [newPost] = await db
      .insert(posts)
      .values({
        id: post?.id,
        userId: post?.userId,
        platform:
          Array?.isArray(platforms) && platforms?.length > 0
            ? platforms[0]
            : "social",
        content:
          typeof content === "string" ? content : JSON?.stringify(content),
        scheduledAt: scheduledTime ? new Date(scheduledTime) : null,
        status: post?.status || "scheduled",
        mediaUrls: Array?.isArray(content?.mediaUrls) ? content?.mediaUrls : [],
        engagement: {
          _autopilotMeta: true,
          platforms: platforms || [],
          viralPrediction: viralPrediction || null,
          createdBy: createdBy || "social_autopilot",
          ...(typeof content !== "string" ? { content } : {}),
        },
      })
      .returning();
    return newPost;
  }

  async getScheduledPostById(id: string): Promise<any | null> {
    const [post] = await db
      .select()
      .from(posts)
      .where(eq(posts?.id, id))
      .limit(1);
    if (!post) return null;
    const _eng = (post?.engagement as Record<string, unknown>) || {};
    const _meta = eng?._autopilotMeta ? eng : {};
    return {
      ...post,
      platforms: meta?.platforms || [post?.platform].filter(Boolean),
      content: meta?.content || post?.content,
      scheduledTime: post?.scheduledAt,
      viralPrediction: meta?.viralPrediction || null,
      createdBy: meta?.createdBy || "manual",
      results: meta?._autopilotMeta ? [] : post?.engagement || [],
    };
  }

  async updateScheduledPost(
    id: string,
    updates: Partial<Record<string, unknown>>,
  ): Promise<unknown> {
    const {
      platforms,
      content,
      scheduledTime,
      viralPrediction,
      createdBy,
      results,
      ...rest
    } = updates;
    const updateValues: Record<string, unknown> = {
      ...(rest as Record<string, unknown>),
    };
    if (platforms)
      updateValues.platform = Array?.isArray(platforms)
        ? platforms[0]
        : platforms;
    if (content !== undefined)
      updateValues.content =
        typeof content === "string" ? content : JSON?.stringify(content);
    if (scheduledTime) updateValues.scheduledAt = new Date(scheduledTime);
    if (results !== undefined) updateValues.engagement = results;
    if (
      updateValues?.status === "completed" ||
      updateValues?.status === "published"
    ) {
      updateValues.publishedAt = new Date();
    }
    const [updated] = await db
      .update(posts)
      .set(updateValues)
      .where(eq(posts?.id, id))
      .returning();
    return updated;
  }

  async updateScheduledPostStatus(
    id: string,
    status: string,
    results?: unknown[],
  ): Promise<void> {
    const updateValues: Record<string, unknown> = { status };
    if (results !== undefined) updateValues.engagement = results;
    if (status === "completed" || status === "published")
      updateValues.publishedAt = new Date();
    await db?.update(posts).set(updateValues).where(eq(posts?.id, id));
  }

  async getSocialMetrics(userId: string): Promise<unknown> {
    const _thirtyDaysAgo = new Date(Date?.now() - 30 * 24 * 60 * 60 * 1000);
    const _sevenDaysAgo = new Date(Date?.now() - 7 * 24 * 60 * 60 * 1000);

    const [accounts, recentPosts, weekPosts, autopilotContent] =
      await Promise?.all([
        this?.getSocialAccounts(userId),
        db
          .select()
          .from(posts)
          .where(
            and(eq(posts?.userId, userId), gte(posts?.createdAt, thirtyDaysAgo)),
          )
          .limit(500),
        db
          .select()
          .from(posts)
          .where(
            and(eq(posts?.userId, userId), gte(posts?.createdAt, sevenDaysAgo)),
          )
          .limit(200),
        db
          .select()
          .from(socialAutopilotContent)
          .where(
            and(
              eq(socialAutopilotContent?.userId, userId),
              gte(socialAutopilotContent?.createdAt, thirtyDaysAgo),
            ),
          )
          .limit(500),
      ]);

    const _totalFollowers = accounts?.reduce(
      (sum, acc) => sum + (acc?.followerCount || 0),
      0,
    );

    let totalLikes = 0,
      totalComments = 0,
      totalShares = 0,
      totalViews = 0;
    let totalReach = 0,
      totalImpressions = 0;

    for (const post of recentPosts) {
      const _eng = post?.engagement as Record<string, unknown>;
      if (eng) {
        totalLikes += eng?.likes || 0;
        totalComments += eng?.comments || 0;
        totalShares += eng?.shares || eng?.retweets || 0;
        totalViews += eng?.views || 0;
        totalReach += eng?.reach || 0;
        totalImpressions += eng?.impressions || 0;
      }
    }

    for (const content of autopilotContent) {
      const _perf = content?.performance as Record<string, unknown>;
      if (perf) {
        totalLikes += perf?.likes || 0;
        totalComments += perf?.comments || 0;
        totalShares += perf?.shares || 0;
        totalViews += perf?.views || 0;
      }
    }

    const _totalEngagement = totalLikes + totalComments + totalShares;
    const _avgEngagementRate =
      totalViews > 0
        ? Math?.round((totalEngagement / totalViews) * 10000) / 100
        : 0;

    const _platformGrowth = accounts?.map((acc) => ({
      platform: acc?.platform,
      followers: acc?.followerCount || 0,
      username: acc?.username || "",
    }));

    // Compute follower growth as percentage change (using account-level data as proxy)
    const _accountsWithFollowers = accounts?.filter(
      (a) => (a?.followerCount || 0) > 0,
    );
    const _followersGrowth =
      accountsWithFollowers?.length > 0
        ? accountsWithFollowers?.map((acc) => ({
            platform: acc?.platform,
            followers: acc?.followerCount || 0,
            change: 0,
            changePercent: 0,
          }))
        : null;

    // Compute content performance from posts
    const _contentPerformance =
      recentPosts?.length > 0
        ? recentPosts?.slice(0, 5).map((p) => {
            const _eng = p?.engagement as Record<string, unknown>;
            return {
              id: p?.id,
              platform: p?.platform,
              content: (p?.content || "").substring(0, 80),
              likes: eng?.likes || 0,
              comments: eng?.comments || 0,
              shares: eng?.shares || 0,
              views: eng?.views || 0,
              publishedAt: p?.publishedAt || p?.createdAt,
            };
          })
        : null;

    return {
      totalFollowers,
      totalEngagement,
      totalReach: totalReach || totalViews,
      totalImpressions: totalImpressions || totalViews,
      postsThisWeek: weekPosts?.length,
      postsThisMonth: recentPosts?.length,
      avgEngagementRate,
      totalLikes,
      totalComments,
      totalShares,
      followersGrowth,
      contentPerformance,
      platformGrowth,
      aiRecommendation: null,
    };
  }

  async getSocialAccounts(userId: string): Promise<SocialAccount[]> {
    return await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts?.userId, userId))
      .limit(50);
  }

  async getUserSocialToken(
    userId: string,
    platform: string,
  ): Promise<string | null> {
    const _rows = await db
      .select({ accessToken: socialAccounts?.accessToken })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts?.userId, userId),
          eq(socialAccounts?.platform, platform),
          eq(socialAccounts?.isActive, true),
        ),
      )
      .limit(1);
    return rows[0]?.accessToken ?? null;
  }

  async updateUserSocialToken(
    userId: string,
    platform: string,
    tokenData: string,
  ): Promise<void> {
    const _existing = await db
      .select({ id: socialAccounts?.id })
      .from(socialAccounts)
      .where(
        and(
          eq(socialAccounts?.userId, userId),
          eq(socialAccounts?.platform, platform),
        ),
      )
      .limit(1);

    if (tokenData === "") {
      if (existing?.length > 0) {
        await db
          .update(socialAccounts)
          .set({ isActive: false, accessToken: null, refreshToken: null })
          .where(eq(socialAccounts?.id, existing[0].id));
      }
      return;
    }

    if (existing?.length > 0) {
      await db
        .update(socialAccounts)
        .set({ accessToken: tokenData, isActive: true })
        .where(eq(socialAccounts?.id, existing[0].id));
    } else {
      await db?.insert(socialAccounts).values({
        userId,
        platform,
        accessToken: tokenData,
        isActive: true,
      });
    }
  }

  async getSocialCalendarEvents(userId: string): Promise<any[]> {
    const [calendarEntries, scheduledPosts] = await Promise?.all([
      db
        .select()
        .from(contentCalendar)
        .where(eq(contentCalendar?.userId, userId))
        .orderBy(desc(contentCalendar?.scheduledAt))
        .limit(500),
      db
        .select()
        .from(posts)
        .where(
          and(
            eq(posts?.userId, userId),
            sql`${posts?.status} IN ('scheduled', 'pending', 'published', 'completed')`,
            isNotNull(posts?.scheduledAt),
          ),
        )
        .orderBy(desc(posts?.scheduledAt))
        .limit(500),
    ]);

    const _calendarIds = new Set(calendarEntries?.map((e) => e?.id));

    const _normalizedPosts = scheduledPosts
      .filter((p) => !calendarIds?.has(p?.id))
      .map((p) => {
        const _eng = (p?.engagement as Record<string, unknown>) || {};
        const _meta = eng?._autopilotMeta ? eng : {};
        const _rawContent =
          typeof p?.content === "string"
            ? p?.content
            : JSON?.stringify(p?.content ?? "");
        let parsedContent: Record<string, unknown> = {};
        try {
          parsedContent = JSON?.parse(rawContent);
        } catch {
          parsedContent = {};
        }
        const _contentObj = meta?.content || parsedContent || {};
        const _titleText =
          (typeof contentObj === "object"
            ? contentObj?.text || contentObj?.caption
            : null) ||
          rawContent ||
          "Autopilot post";
        const _title =
          String(titleText).slice(0, 80) +
          (String(titleText).length > 80 ? "…" : "");
        const _resolvedStatus =
          p?.status === "pending" || p?.status === "scheduled"
            ? "scheduled"
            : p?.status === "completed"
              ? "published"
              : (p?.status ?? "scheduled");
        return {
          id: p?.id,
          userId: p?.userId,
          title,
          contentType: contentObj?.mediaType || "text",
          platform: meta?.platforms?.[0] || p?.platform || "social",
          platforms: meta?.platforms || [p?.platform].filter(Boolean),
          scheduledAt: p?.scheduledAt,
          status: resolvedStatus,
          content: meta?.content || contentObj,
          mediaUrls: p?.mediaUrls || [],
          tags: [],
          campaignId: null,
          publishedAt: p?.publishedAt,
          createdAt: p?.createdAt,
          source: "autopilot",
          createdBy: meta?.createdBy || "social_autopilot",
        };
      });

    const _merged = [...calendarEntries, ...normalizedPosts].sort((a, b) => {
      const _aTime = a?.scheduledAt ? new Date(a?.scheduledAt).getTime() : 0;
      const _bTime = b?.scheduledAt ? new Date(b?.scheduledAt).getTime() : 0;
      return bTime - aTime;
    });

    return merged?.slice(0, 500);
  }

  async getSocialCalendarStats(userId: string): Promise<unknown> {
    const [calendarRows, postRows] = await Promise?.all([
      db
        .select({
          status: contentCalendar?.status,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(contentCalendar)
        .where(eq(contentCalendar?.userId, userId))
        .groupBy(contentCalendar?.status),
      db
        .select({
          status: posts?.status,
          count: sql<number>`COUNT(*)::int`,
        })
        .from(posts)
        .where(
          and(
            eq(posts?.userId, userId),
            sql`${posts?.status} IN ('scheduled', 'pending', 'published', 'completed')`,
          ),
        )
        .groupBy(posts?.status),
    ]);

    const _calendarCounts = Object?.fromEntries(
      calendarRows?.map((r) => [r?.status, r?.count]),
    );
    const postStatusMap: Record<string, string> = {
      scheduled: "scheduled",
      pending: "scheduled",
      published: "published",
      completed: "published",
    };
    const postCounts: Record<string, number> = {};
    for (const row of postRows) {
      const _mapped = postStatusMap[row?.status ?? ""] ?? "scheduled";
      postCounts[mapped] = (postCounts[mapped] ?? 0) + row?.count;
    }

    return {
      totalScheduled:
        (calendarCounts["scheduled"] ?? 0) + (postCounts["scheduled"] ?? 0),
      pendingApproval: calendarCounts["pending_approval"] ?? 0,
      published:
        (calendarCounts["published"] ?? 0) + (postCounts["published"] ?? 0),
      drafts: calendarCounts["draft"] ?? 0,
    };
  }

  async getSocialActivity(userId: string): Promise<any[]> {
    const _recentPosts = await db
      .select()
      .from(posts)
      .where(eq(posts?.userId, userId))
      .orderBy(desc(posts?.createdAt))
      .limit(20);

    return recentPosts?.map((post) => ({
      id: post?.id,
      type: "post",
      platform: post?.platform,
      content: post?.content,
      createdAt: post?.createdAt,
    }));
  }

  async getSocialWeeklyStats(userId: string): Promise<any[]> {
    const _sevenDaysAgo = new Date(Date?.now() - 7 * 24 * 60 * 60 * 1000);

    // Use SQL aggregation for both tables rather than fetching all rows into JS
    // and filtering — this avoids the 500-row truncation problem and is O(1) network.
    const [postRows, contentRows] = await Promise?.all([
      db?.execute(sql`
        SELECT
          DATE(created_at) AS day,
          COUNT(*)::int AS post_count,
          COALESCE(SUM(
            COALESCE((engagement->>'likes')::int, 0) +
            COALESCE((engagement->>'comments')::int, 0) +
            COALESCE((engagement->>'shares')::int, (engagement->>'retweets')::int, 0)
          ), 0)::int AS engagement,
          COALESCE(SUM(COALESCE((engagement->>'views')::int, 0)), 0)::int AS views,
          COALESCE(SUM(COALESCE((engagement->>'impressions')::int, 0)), 0)::int AS impressions
        FROM posts
        WHERE user_id = ${userId} AND created_at >= ${sevenDaysAgo}
        GROUP BY DATE(created_at)
      `),
      db?.execute(sql`
        SELECT
          DATE(created_at) AS day,
          COUNT(*)::int AS post_count,
          COALESCE(SUM(
            COALESCE((performance->>'likes')::int, 0) +
            COALESCE((performance->>'comments')::int, 0) +
            COALESCE((performance->>'shares')::int, 0)
          ), 0)::int AS engagement,
          COALESCE(SUM(COALESCE((performance->>'views')::int, 0)), 0)::int AS views
        FROM social_autopilot_content
        WHERE user_id = ${userId} AND created_at >= ${sevenDaysAgo}
        GROUP BY DATE(created_at)
      `),
    ]);

    // Index results by ISO date string for O(1) merge
    const _postMap = new Map<string, any>();
    for (const row of ((postRows as { rows?: unknown[] }).rows ??
      postRows) as Record<string, unknown>[]) {
      postMap?.set(String(row?.day).substring(0, 10), row);
    }
    const _contentMap = new Map<string, any>();
    for (const row of ((contentRows as { rows?: unknown[] }).rows ??
      contentRows) as Record<string, unknown>[]) {
      contentMap?.set(String(row?.day).substring(0, 10), row);
    }

    const stats: Record<string, unknown>[] = [];
    for (let i = 6; i >= 0; i--) {
      const _dayStart = new Date();
      dayStart?.setHours(0, 0, 0, 0);
      dayStart?.setDate(dayStart?.getDate() - i);
      const _dateKey = dayStart?.toISOString().split("T")[0];

      const _pr = postMap?.get(dateKey);
      const _cr = contentMap?.get(dateKey);

      stats?.push({
        date: dateKey,
        day: dayStart?.toLocaleDateString("en-US", { weekday: "short" }),
        posts: (Number(pr?.post_count) || 0) + (Number(cr?.post_count) || 0),
        engagement:
          (Number(pr?.engagement) || 0) + (Number(cr?.engagement) || 0),
        views: (Number(pr?.views) || 0) + (Number(cr?.views) || 0),
        impressions: Number(pr?.impressions) || 0,
      });
    }
    return stats;
  }

  async createAdCampaign(data: Record<string, unknown>): Promise<AdCampaign> {
    const [campaign] = await db
      .insert(adCampaigns)
      .values(data as typeof adCampaigns.$inferInsert)
      .returning();
    return campaign;
  }

  async getAdvertisingCampaigns(userId: string): Promise<AdCampaign[]> {
    return await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns?.userId, userId))
      .orderBy(desc(adCampaigns?.createdAt))
      .limit(200);
  }

  async getAdvertisingInsights(userId: string): Promise<unknown> {
    const _campaigns = await this?.getAdvertisingCampaigns(userId);
    if (campaigns?.length === 0) return null;

    const _totalSpend = campaigns?.reduce((sum, c) => sum + (c?.budget || 0), 0);
    return {
      totalCampaigns: campaigns?.length,
      totalSpend,
      activeCampaigns: campaigns?.filter((c) => c?.status === "active").length,
    };
  }

  async getAudienceSegments(userId: string): Promise<any[]> {
    const _campaigns = await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns?.userId, userId))
      .limit(200);
    const segments: Record<string, unknown>[] = [];
    campaigns?.forEach((c) => {
      const _ta = c?.targetAudience as Record<string, any> | null;
      if (ta && ta?.segment) {
        segments?.push({
          id: c?.id,
          name: ta?.segment,
          size: ta?.audienceSize || 0,
          campaignId: c?.id,
          platform: c?.platform,
        });
      } else if (ta) {
        segments?.push({
          id: c?.id,
          name: `${c?.platform} – ${c?.objective || "general"}`,
          size: ta?.audienceSize || 0,
          campaignId: c?.id,
          platform: c?.platform,
          ageMin: ta?.ageMin,
          ageMax: ta?.ageMax,
          interests: ta?.interests,
        });
      }
    });
    return segments;
  }

  async getCreativeFatigue(userId: string): Promise<any[]> {
    const _creatives = await db
      .select()
      .from(adCreatives)
      .where(eq(adCreatives?.userId, userId))
      .orderBy(desc(adCreatives?.createdAt))
      .limit(100);
    return creatives?.map((c) => {
      const _perf = c?.performance as Record<string, any> | null;
      const _impressions = perf?.impressions || 0;
      const _clicks = perf?.clicks || 0;
      const _ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
      const _daysSinceCreated = Math?.floor(
        (Date?.now() - new Date(c?.createdAt!).getTime()) / 86400000,
      );
      const _fatigueScore = Math?.min(
        100,
        daysSinceCreated * 2 +
          (impressions > 10000 ? 30 : 0) +
          (ctr < 0.5 && impressions > 1000 ? 20 : 0),
      );
      return {
        id: c?.id,
        name: c?.name,
        campaignId: c?.campaignId,
        impressions,
        ctr,
        fatigueScore,
        daysRunning: daysSinceCreated,
        status: c?.status,
      };
    });
  }

  async getBiddingStrategies(userId: string): Promise<any[]> {
    const _campaigns = await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns?.userId, userId))
      .limit(200);
    return campaigns?.map((c) => {
      const _meta = c?.metadata as Record<string, any> | null;
      const _perf = c?.performance as Record<string, any> | null;
      const _rawStrategy = meta?.biddingStrategy || "manual";
      const _validTypes = [
        "maximize_conversions",
        "target_roas",
        "target_cpa",
        "maximize_clicks",
        "manual",
      ];
      const _type = validTypes?.includes(rawStrategy) ? rawStrategy : "manual";
      const _clicks = perf?.clicks || 0;
      const _impressions = perf?.impressions || 1;
      const _ctr = clicks / impressions;
      const _currentPerformance = Math?.min(
        100,
        Math?.round(ctr * 10000 + (perf?.roas || 0) * 10),
      );
      return {
        id: c?.id,
        name: c?.name || "Unnamed Campaign",
        type,
        currentPerformance,
        recommendedAction:
          currentPerformance < 60
            ? "Switch to maximize_conversions for better ROI"
            : currentPerformance < 80
              ? "Optimise bid cap to improve CPA"
              : "Maintain current strategy",
        potentialImprovement: Math?.max(
          0,
          Math?.min(50, 90 - currentPerformance),
        ),
        confidence: Math?.min(95, 60 + Math?.round(clicks / 10)),
      };
    });
  }

  async getLookalikeAudiences(userId: string): Promise<any[]> {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings?.key, `lookalike_audiences:${userId}`))
      .limit(1);
    if (!row) return [];
    return (row?.value as unknown[]) || [];
  }

  async getAdvertisingForecasts(userId: string): Promise<unknown> {
    const _campaigns = await db
      .select()
      .from(adCampaigns)
      .where(
        and(eq(adCampaigns?.userId, userId), eq(adCampaigns?.status, "active")),
      )
      .limit(100);
    if (!campaigns?.length) return null;
    const _totalBudget = campaigns?.reduce((s, c) => s + (c?.budget || 0), 0);
    const _totalDailyBudget = campaigns?.reduce(
      (s, c) => s + (c?.dailyBudget || 0),
      0,
    );
    const _estReach = Math?.round(totalDailyBudget * 400);
    const _estImpressions = Math?.round(totalDailyBudget * 1200);
    return {
      activeCampaigns: campaigns?.length,
      totalBudget,
      totalDailyBudget,
      estimatedWeeklyReach: estReach * 7,
      estimatedWeeklyImpressions: estImpressions * 7,
      estimatedMonthlyCost: totalDailyBudget * 30,
      forecastConfidence:
        campaigns?.length >= 3
          ? "high"
          : campaigns?.length >= 1
            ? "medium"
            : "low",
    };
  }

  async getCompetitorInsights(userId: string): Promise<any[]> {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings?.key, `competitor_insights:${userId}`))
      .limit(1);
    if (!row) return [];
    return (row?.value as unknown[]) || [];
  }

  async getABTests(userId: string): Promise<any[]> {
    const _creatives = await db
      .select()
      .from(adCreatives)
      .where(and(eq(adCreatives?.userId, userId)))
      .orderBy(desc(adCreatives?.createdAt))
      .limit(100);
    const byCampaign: Record<string, any[]> = {};
    creatives?.forEach((c) => {
      const _key = c?.campaignId || "unassigned";
      if (!byCampaign[key]) byCampaign[key] = [];
      byCampaign[key].push(c);
    });
    return Object?.entries(byCampaign)
      .filter(([, variants]) => variants?.length >= 2)
      .map(([campaignId, variants]) => {
        variants?.map(
          (v) => (v?.performance as Record<string, any>) || {},
        );
        const _best = variants?.reduce((a, b) => {
          const _aRate =
            ((a?.performance as Record<string, unknown>)?.clicks || 0) /
            Math?.max(
              1,
              (a?.performance as Record<string, unknown>)?.impressions || 1,
            );
          const _bRate =
            ((b?.performance as Record<string, unknown>)?.clicks || 0) /
            Math?.max(
              1,
              (b?.performance as Record<string, unknown>)?.impressions || 1,
            );
          return bRate > aRate ? b : a;
        });
        return {
          id: campaignId,
          campaignId,
          name: `A/B Test – ${variants[0].name}`,
          variants: variants?.map((v) => ({
            id: v?.id,
            name: v?.name,
            status: v?.status,
            performance: v?.performance,
          })),
          winnerVariantId: best?.id,
          status: "running",
          createdAt: variants[0].createdAt,
        };
      });
  }

  async getCreativeVariants(userId: string): Promise<any[]> {
    const _creatives = await db
      .select()
      .from(adCreatives)
      .where(eq(adCreatives?.userId, userId))
      .orderBy(desc(adCreatives?.createdAt))
      .limit(100);
    return creatives?.map((c) => ({
      id: c?.id,
      campaignId: c?.campaignId,
      name: c?.name,
      type: c?.type,
      headline: c?.headline,
      description: c?.description,
      mediaUrl: c?.mediaUrl,
      thumbnailUrl: c?.thumbnailUrl,
      callToAction: c?.callToAction,
      status: c?.status,
      performance: c?.performance,
      variants: c?.variants,
      createdAt: c?.createdAt,
    }));
  }

  async getRoasCampaigns(userId: string): Promise<any[]> {
    return this?.getAdvertisingCampaigns(userId);
  }

  async getRoasAudienceSegments(userId: string): Promise<any[]> {
    return this?.getAudienceSegments(userId);
  }

  async getRoasForecast(userId: string): Promise<any[]> {
    const _campaigns = await db
      .select()
      .from(adCampaigns)
      .where(
        and(eq(adCampaigns?.userId, userId), eq(adCampaigns?.status, "active")),
      )
      .limit(100);
    return campaigns?.map((c) => {
      const _perf = c?.performance as Record<string, any> | null;
      const _roas = perf?.roas || 0;
      const _spend = c?.budget || 0;
      return {
        campaignId: c?.id,
        campaignName: c?.name,
        platform: c?.platform,
        currentRoas: roas,
        forecastedRoas: roas * 1.1,
        spend,
        forecastedRevenue: spend * roas * 1.1,
        confidence: perf ? "medium" : "low",
      };
    });
  }

  async getBudgetOptimization(userId: string): Promise<any[]> {
    const _campaigns = await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns?.userId, userId))
      .limit(200);
    return campaigns?.map((c) => {
      const _perf = c?.performance as Record<string, any> | null;
      const _roas = perf?.roas || 0;
      const _spend = c?.budget || 0;
      const _efficiency = roas > 0 ? roas / Math?.max(1, spend / 100) : 0;
      const _recommendation =
        roas > 3
          ? "increase"
          : roas < 1 && spend > 50
            ? "decrease"
            : "maintain";
      return {
        campaignId: c?.id,
        campaignName: c?.name,
        platform: c?.platform,
        currentBudget: spend,
        recommendedBudget:
          recommendation === "increase"
            ? spend * 1.2
            : recommendation === "decrease"
              ? spend * 0.7
              : spend,
        roas,
        efficiency,
        recommendation,
      };
    });
  }

  async getOrganicCampaigns(userId: string): Promise<any[]> {
    const _campaigns = await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns?.userId, userId))
      .limit(200);
    return campaigns?.filter((c) => !c?.budget || c?.budget === 0);
  }

  async getCreativeFatigueAnalysis(userId: string): Promise<any[]> {
    return this?.getCreativeFatigue(userId);
  }

  async getBudgetPacingCampaigns(userId: string): Promise<any[]> {
    return this?.getAdvertisingCampaigns(userId);
  }

  async getBudgetPacingHistory(userId: string): Promise<any[]> {
    const _campaigns = await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns?.userId, userId))
      .orderBy(desc(adCampaigns?.createdAt))
      .limit(10);
    const history: Record<string, unknown>[] = [];
    campaigns?.forEach((c) => {
      const _perf = c?.performance as Record<string, any> | null;
      if (c?.startDate) {
        history?.push({
          campaignId: c?.id,
          campaignName: c?.name,
          date: c?.startDate,
          budget: c?.budget || 0,
          spend: perf?.spend || 0,
          pacing: perf?.spend && c?.budget ? (perf?.spend / c?.budget) * 100 : 0,
        });
      }
    });
    return history;
  }

  async getAttributionData(userId: string): Promise<any[]> {
    const _analyticsRows = await db
      .select()
      .from(analytics)
      .where(eq(analytics?.userId, userId))
      .orderBy(desc(analytics?.date))
      .limit(90);
    return analyticsRows?.map((a) => {
      const _meta = a?.metadata as Record<string, any> | null;
      return {
        date: a?.date,
        platform: a?.platform || "unknown",
        streams: a?.streams || 0,
        revenue: a?.revenue || 0,
        source: meta?.source || "organic",
        campaign: meta?.campaign || null,
      };
    });
  }

  async getCrossChannelAttribution(userId: string): Promise<any[]> {
    const _analyticsRows = await db
      .select({
        platform: analytics?.platform,
        streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
        revenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
      })
      .from(analytics)
      .where(eq(analytics?.userId, userId))
      .groupBy(analytics?.platform);
    const _total = analyticsRows?.reduce((s, r) => s + (r?.streams || 0), 0);
    return analyticsRows
      .filter((r) => r?.platform)
      .map((r) => ({
        platform: r?.platform!,
        streams: r?.streams,
        revenue: r?.revenue,
        attributionShare:
          total > 0 ? Math?.round((r?.streams / total) * 1000) / 10 : 0,
      }));
  }

  async getSocialListeningKeywords(userId: string): Promise<any[]> {
    return await db
      .select()
      .from(socialKeywords)
      .where(eq(socialKeywords?.userId, userId))
      .orderBy(desc(socialKeywords?.createdAt))
      .limit(100);
  }

  async getSocialListeningTrending(userId: string): Promise<any[]> {
    return await db
      .select()
      .from(socialMentions)
      .where(eq(socialMentions?.userId, userId))
      .orderBy(desc(socialMentions?.engagement))
      .limit(20);
  }

  async getSocialListeningInfluencers(userId: string): Promise<any[]> {
    return await db
      .select()
      .from(socialMentions)
      .where(
        and(
          eq(socialMentions?.userId, userId),
          eq(socialMentions?.isInfluencer, true),
        ),
      )
      .orderBy(desc(socialMentions?.authorFollowers))
      .limit(20);
  }

  async getSocialListeningAlerts(userId: string): Promise<any[]> {
    return await db
      .select()
      .from(socialMentions)
      .where(
        and(
          eq(socialMentions?.userId, userId),
          eq(socialMentions?.sentiment, "negative"),
        ),
      )
      .orderBy(desc(socialMentions?.createdAt))
      .limit(20);
  }

  async getSocialAIInsights(userId: string): Promise<any[]> {
    const _accounts = await this?.getSocialAccounts(userId);
    const _recentContent = await db
      .select()
      .from(socialAutopilotContent)
      .where(eq(socialAutopilotContent?.userId, userId))
      .orderBy(desc(socialAutopilotContent?.createdAt))
      .limit(10);

    if (accounts?.length === 0 && recentContent?.length === 0) return [];

    const insights: Record<string, unknown>[] = [];
    if (recentContent?.length > 0) {
      const _topPerforming = recentContent?.filter((c) => {
        const _perf = c?.performance as Record<string, unknown>;
        return perf && (perf?.views > 0 || perf?.likes > 0);
      });
      if (topPerforming?.length > 0) {
        insights?.push({
          type: "content_performance",
          title: "Top performing content identified",
          description: `${topPerforming?.length} pieces of content showing strong engagement`,
          priority: "medium",
          createdAt: new Date(),
        });
      }
    }
    return insights;
  }

  async getUserSocialStats(userId: string): Promise<any | null> {
    const _accounts = await this?.getSocialAccounts(userId);
    if (accounts?.length === 0) return null;

    const _totalFollowers = accounts?.reduce(
      (sum, acc) => sum + (acc?.followerCount || 0),
      0,
    );
    const _recentPosts = await db
      .select()
      .from(posts)
      .where(eq(posts?.userId, userId))
      .orderBy(desc(posts?.createdAt))
      .limit(50);

    const _totalEngagements = recentPosts?.reduce((sum, p) => {
      const _meta = p?.metadata as Record<string, any> | null;
      return (
        sum +
        (meta?.likes || 0) +
        (meta?.comments || 0) +
        (meta?.shares || 0) +
        (meta?.reactions || 0)
      );
    }, 0);
    const _totalReach = recentPosts?.reduce((sum, p) => {
      const _meta = p?.metadata as Record<string, any> | null;
      return sum + (meta?.reach || meta?.impressions || 0);
    }, 0);
    const _engagementRate =
      recentPosts?.length > 0 && totalFollowers > 0
        ? (totalEngagements /
            recentPosts?.length /
            Math?.max(1, totalFollowers)) *
          100
        : 0;

    return {
      followers: totalFollowers,
      posts: recentPosts?.length,
      engagement: Math?.round(engagementRate * 100) / 100,
      reach: totalReach,
      totalEngagements,
    };
  }

  async getCompetitors(userId: string): Promise<any[]> {
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings?.key, `competitors:${userId}`))
      .limit(1);
    if (!row) return [];
    return (row?.value as unknown[]) || [];
  }

  async getRecentAnalyzedContent(
    userId: string,
    limit: number,
  ): Promise<any[]> {
    // posts table has no metadata column — engagement (JSONB) is the only structured field.
    // Return recent posts; callers check features and handle empty gracefully.
    const _recentPosts = await db
      .select()
      .from(posts)
      .where(eq(posts?.userId, userId))
      .orderBy(desc(posts?.createdAt))
      .limit(limit || 20);
    return recentPosts?.map((p) => {
      const _eng = p?.engagement as Record<string, any> | null;
      return {
        id: p?.id,
        content: p?.content,
        platform: p?.platform,
        analyzedAt: p?.createdAt,
        features: eng?.features || {},
        performance: eng || {},
      };
    });
  }

  async saveAnalyzedContentFeatures(
    userId: string,
    features: Record<string, unknown>,
  ): Promise<string> {
    const _id = `feature-${Date?.now()}-${userId?.slice(0, 8)}`;
    try {
      await db
        .insert(systemSettings)
        .values({
          key: `analyzed_content:${id}`,
          value: { userId, features, createdAt: new Date().toISOString() },
          description: `Analyzed content features for user ${userId}`,
        })
        .onConflictDoNothing();
    } catch {
      // Non-critical; log silently
    }
    return id;
  }

  async getAllPosts(userId: string): Promise<Post[]> {
    return this?.getSocialPosts(userId);
  }

  async getAllCampaigns(userId: string): Promise<any[]> {
    const _results = await db
      .select()
      .from(socialCampaigns)
      .where(eq(socialCampaigns?.userId, userId))
      .orderBy(desc(socialCampaigns?.createdAt))
      .limit(200);
    return results;
  }

  async getAnalyzedContentForTraining(userId: string): Promise<any[]> {
    const _results = await db
      .select()
      .from(autopilotLearningData)
      .where(eq(autopilotLearningData?.userId, userId))
      .orderBy(desc(autopilotLearningData?.createdAt))
      .limit(1000);
    return results;
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications?.userId, userId))
      .orderBy(desc(notifications?.createdAt))
      .limit(50);
  }

  async createNotification(data: {
    userId: string;
    type: string;
    title: string;
    message?: string;
    actionUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values({
        userId: data?.userId,
        type: data?.type,
        title: data?.title,
        message: data?.message,
        actionUrl: data?.actionUrl,
        metadata: data?.metadata,
        isRead: false,
      })
      .returning();
    return notification;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications?.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications?.userId, userId));
  }

  async getNotificationById(id: string): Promise<Notification | undefined> {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications?.id, id))
      .limit(1);
    return notification || undefined;
  }

  async deleteNotification(id: string): Promise<void> {
    await db?.delete(notifications).where(eq(notifications?.id, id));
  }

  async deleteAllNotifications(userId: string): Promise<void> {
    await db?.delete(notifications).where(eq(notifications?.userId, userId));
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const _result = await db
      .delete(sessions)
      .where(eq(sessions?.id, sessionId))
      .returning({ id: sessions?.id });
    return result?.length > 0;
  }

  async deleteSessionByToken(sessionToken: string): Promise<boolean> {
    const _result = await db
      .delete(sessions)
      .where(eq(sessions?.sessionToken, sessionToken))
      .returning({ id: sessions?.id });
    return result?.length > 0;
  }

  async getSessionById(
    sessionId: string,
  ): Promise<{ id: string; userId: string } | undefined> {
    const [session] = await db
      .select({ id: sessions?.id, userId: sessions?.userId })
      .from(sessions)
      .where(eq(sessions?.id, sessionId))
      .limit(1);
    return session || undefined;
  }

  async getSessionsByUserId(userId: string): Promise<any[]> {
    return await db
      .select({
        id: sessions?.id,
        lastActivity: sessions?.lastActivity,
        userAgent: sessions?.userAgent,
      })
      .from(sessions)
      .where(eq(sessions?.userId, userId))
      .orderBy(desc(sessions?.lastActivity))
      .limit(20);
  }

  async getAnalytics(
    userId: string,
    _startDate?: Date,
    _endDate?: Date,
  ): Promise<any[]> {
    let query = dbRead
      .select()
      .from(analytics)
      .where(eq(analytics?.userId, userId));
    return await query?.orderBy(desc(analytics?.date)).limit(100);
  }

  async seedPluginCatalog(): Promise<void> {
    const { ALL_PLUGINS } = await import("./services/plugins/index");
    const { buildFactoryPresetRows } = await import(
      "./services/plugins/pluginEnrichment.js"
    );

    // Bumped whenever the enrichment layer ships new reference parameters or
    // genre presets. Forces an upsert across all rows (presets?._rev mismatch).
    const _MANIFEST_REV = "rev-enrich-v1";

    // Bulk upsert via single round-trip. parameters/presets are jsonb columns.
    const _pluginRows = ALL_PLUGINS?.map((plugin) => ({
      id: plugin?.id,
      name: plugin?.name,
      slug: plugin?.slug,
      type: plugin?.type,
      category: plugin?.category,
      vendor: plugin?.author || "Max Booster",
      version: plugin?.version,
      description: plugin?.description,
      parameters: plugin?.parameters as unknown as Record<string, unknown>,
      presets: {
        _rev: MANIFEST_REV,
        defaultPreset: plugin?.defaultPreset ?? {},
        genrePresets: plugin?.genrePresets ?? {},
        referenceNote: plugin?.referenceNote ?? null,
      } as Record<string, unknown>,
      isBuiltIn: true,
      isActive: true,
    }));

    const _existingRows = await dbRead
      .select({ slug: pluginCatalog?.slug, presets: pluginCatalog?.presets })
      .from(pluginCatalog);
    const _existingBySlug = new Map<string, { presets: unknown }>(
      existingRows?.map((r) => [r?.slug, { presets: r?.presets }]),
    );

    const toInsert: typeof pluginRows = [];
    const toUpdate: typeof pluginRows = [];
    for (const row of pluginRows) {
      const _existing = existingBySlug?.get(row?.slug);
      if (!existing) {
        toInsert?.push(row);
        continue;
      }
      const _currentRev = (existing?.presets as { _rev?: string } | null)?._rev;
      if (currentRev !== MANIFEST_REV) toUpdate?.push(row);
    }

    if (toInsert?.length > 0) {
      await db?.insert(pluginCatalog).values(toInsert).onConflictDoNothing();
    }
    for (const row of toUpdate) {
      await db
        .update(pluginCatalog)
        .set({
          name: row?.name,
          type: row?.type,
          category: row?.category,
          vendor: row?.vendor,
          version: row?.version,
          description: row?.description,
          parameters: row?.parameters,
          presets: row?.presets,
          isBuiltIn: true,
          isActive: true,
        })
        .where(eq(pluginCatalog?.slug, row?.slug));
    }

    if (toInsert?.length > 0 || toUpdate?.length > 0) {
      logger?.info(
        `   ✓ Plugin catalog: ${toInsert?.length} inserted, ${toUpdate?.length} updated (rev ${MANIFEST_REV})`,
      );
    }

    // Seed factory genre presets. pluginPresets?.pluginId stores the catalog
    // slug for portability across environments.
    const _presetRows = buildFactoryPresetRows(ALL_PLUGINS);
    if (presetRows?.length === 0) return;

    const _existingPresets = await dbRead
      .select({
        id: pluginPresets?.id,
        pluginId: pluginPresets?.pluginId,
        name: pluginPresets?.name,
        metadata: pluginPresets?.metadata,
      })
      .from(pluginPresets)
      .where(eq(pluginPresets?.isFactory, true));
    const _presetKey = (slug: string, name: string) => `${slug}::${name}`;
    const _existingPresetMap = new Map<
      string,
      { id: string; metadata: unknown }
    >();
    for (const p of existingPresets) {
      existingPresetMap?.set(presetKey(p?.pluginId, p?.name), {
        id: p?.id,
        metadata: p?.metadata,
      });
    }

    const presetInserts: Array<{
      pluginId: string;
      userId: string | null;
      name: string;
      isFactory: boolean;
      parameters: Record<string, unknown>;
      metadata: Record<string, unknown>;
    }> = [];
    let presetRefreshed = 0;
    for (const row of presetRows) {
      const _metadata = { ...row?.metadata, _rev: MANIFEST_REV };
      const _existing = existingPresetMap?.get(
        presetKey(row?.pluginSlug, row?.name),
      );
      if (!existing) {
        presetInserts?.push({
          pluginId: row?.pluginSlug,
          userId: null,
          name: row?.name,
          isFactory: true,
          parameters: row?.parameters as Record<string, unknown>,
          metadata,
        });
      } else {
        const _currentRev = (existing?.metadata as { _rev?: string } | null)
          ?._rev;
        if (currentRev !== MANIFEST_REV) {
          await db
            .update(pluginPresets)
            .set({
              parameters: row?.parameters as Record<string, unknown>,
              metadata,
              isFactory: true,
            })
            .where(eq(pluginPresets?.id, existing?.id));
          presetRefreshed++;
        }
      }
    }
    if (presetInserts?.length > 0) {
      // Insert in chunks to keep the parameterised statement size reasonable.
      const _CHUNK = 200;
      for (let i = 0; i < presetInserts?.length; i += CHUNK) {
        await db
          .insert(pluginPresets)
          .values(presetInserts?.slice(i, i + CHUNK));
      }
    }
    if (presetInserts?.length > 0 || presetRefreshed > 0) {
      logger?.info(
        `   ✓ Factory genre presets: ${presetInserts?.length} inserted, ${presetRefreshed} refreshed (rev ${MANIFEST_REV})`,
      );
    }
  }

  async getProducers(): Promise<any[]> {
    try {
      const _result = await dbRead?.execute(sql`
        SELECT
          u?.id,
          u?.first_name,
          u?.last_name,
          u?.username,
          u?.artist_name,
          u?.avatar_url,
          u?.bio,
          u?.location,
          u?.website,
          u?.role,
          u?.subscription_tier,
          COALESCE(l?.beats_count, 0)::int        AS beats_count,
          COALESCE(o?.sales_count, 0)::int        AS sales_count,
          COALESCE(sf?.followers_count, 0)::int   AS followers_count,
          COALESCE(ROUND(sr?.avg_rating::numeric, 1), 0) AS avg_rating
        FROM users u
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS beats_count FROM listings WHERE user_id = u?.id
        ) l ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS sales_count FROM orders WHERE seller_id = u?.id AND status = 'completed'
        ) o ON true
        LEFT JOIN LATERAL (
          SELECT COUNT(*) AS followers_count
          FROM storefront_follows sf2
          JOIN storefronts s ON sf2.storefront_id = s?.id
          WHERE s.user_id = u?.id
        ) sf ON true
        LEFT JOIN LATERAL (
          SELECT COALESCE(AVG(sr2?.rating), 0) AS avg_rating
          FROM storefront_ratings sr2
          JOIN storefronts s ON sr2.storefront_id = s?.id
          WHERE s.user_id = u?.id
        ) sr ON true
        WHERE l?.beats_count > 0
           OR EXISTS (SELECT 1 FROM storefronts st WHERE st.user_id = u?.id)
        ORDER BY l?.beats_count DESC, o?.sales_count DESC
        LIMIT 50
      `);

      const _rows = (result as { rows?: unknown[] }).rows ?? result;
      if (!Array?.isArray(rows)) return [];

      return rows?.map((u: Record<string, unknown>) => {
        const _displayName =
          (u?.artist_name as string) ||
          `${u?.first_name || ""} ${u?.last_name || ""}`.trim() ||
          (u?.username as string) ||
          "Producer";
        return {
          id: u?.id,
          username: u?.username || displayName,
          displayName,
          avatar: u?.avatar_url || "",
          avatarUrl: u?.avatar_url || "",
          bio: u?.bio || "",
          location: u?.location || "",
          website: u?.website || "",
          verified: u?.role === "admin" || u?.subscription_tier === "lifetime",
          followers: Number(u?.followers_count) || 0,
          following: 0,
          sales: Number(u?.sales_count) || 0,
          beats: Number(u?.beats_count) || 0,
          rating: Number(u?.avg_rating) || 0,
          joinedAt: "",
          socialLinks: {},
        };
      });
    } catch (error) {
      logger?.warn({ err: error }, "Error getting producers:");
      return [];
    }
  }

  async createDistroRelease(
    data: Record<string, unknown>,
  ): Promise<DistroRelease> {
    const [release] = await db?.insert(distroReleases).values(data).returning();
    return release;
  }

  async getDistroReleasesByArtist(artistId: string): Promise<DistroRelease[]> {
    return await db
      .select()
      .from(distroReleases)
      .where(eq(distroReleases?.artistId, artistId))
      .orderBy(desc(distroReleases?.createdAt))
      .limit(200);
  }

  async getDistroRelease(id: string): Promise<DistroRelease | undefined> {
    const [release] = await db
      .select()
      .from(distroReleases)
      .where(eq(distroReleases?.id, id))
      .limit(1);
    return release || undefined;
  }

  async updateDistroRelease(
    id: string,
    data: Record<string, unknown>,
  ): Promise<DistroRelease | undefined> {
    const [release] = await db
      .update(distroReleases)
      .set(data)
      .where(eq(distroReleases?.id, id))
      .returning();
    return release || undefined;
  }

  async getDistroTracksByRelease(releaseId: string): Promise<DistroTrack[]> {
    return await db
      .select()
      .from(distroTracks)
      .where(eq(distroTracks?.releaseId, releaseId))
      .limit(50);
  }

  async createDistroTrack(data: Record<string, unknown>): Promise<DistroTrack> {
    const [track] = await db?.insert(distroTracks).values(data).returning();
    return track;
  }

  async getDistroTracks(releaseId: string): Promise<DistroTrack[]> {
    return this?.getDistroTracksByRelease(releaseId);
  }

  async updateDistroTrack(
    trackId: string,
    releaseId: string,
    data: Record<string, unknown>,
  ): Promise<DistroTrack | undefined> {
    const [track] = await db
      .update(distroTracks)
      .set(data)
      .where(
        and(
          eq(distroTracks?.id, trackId),
          eq(distroTracks?.releaseId, releaseId),
        ),
      )
      .returning();
    return track || undefined;
  }

  async deleteDistroTrack(
    trackId: string,
    releaseId: string,
  ): Promise<boolean> {
    try {
      const _deleted = await db
        .delete(distroTracks)
        .where(
          and(
            eq(distroTracks?.id, trackId),
            eq(distroTracks?.releaseId, releaseId),
          ),
        )
        .returning({ id: distroTracks?.id });
      return deleted?.length > 0;
    } catch (error) {
      logger?.warn({ err: error }, "Error deleting distro track:");
      return false;
    }
  }

  async deleteDistroRelease(id: string): Promise<boolean> {
    try {
      await db?.delete(distroTracks).where(eq(distroTracks?.releaseId, id));
      await db?.delete(distroReleases).where(eq(distroReleases?.id, id));
      return true;
    } catch (error) {
      logger?.warn({ err: error }, "Error deleting distro release:");
      return false;
    }
  }

  async getDSPProviderBySlug(slug: string): Promise<any | null> {
    try {
      const [provider] = await db
        .select()
        .from(dspProviders)
        .where(eq(dspProviders?.slug, slug))
        .limit(1);
      return provider || null;
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching DSP provider by slug:");
      return null;
    }
  }

  async getAllDSPProviders(): Promise<any[]> {
    try {
      const _providers = await dbRead?.select().from(dspProviders).limit(100);
      return providers;
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching all DSP providers:");
      return [];
    }
  }

  async createDSPProvider(data: {
    name: string;
    slug: string;
    isActive?: boolean;
    logoUrl?: string;
    metadata?: Record<string, unknown>;
  }): Promise<unknown> {
    try {
      const [provider] = await db
        .insert(dspProviders)
        .values({
          id: `dsp_${Date?.now()}_${randomBytes(4).toString("hex")}`,
          name: data?.name,
          slug: data?.slug,
          isActive: data?.isActive ?? true,
          logoUrl: data?.logoUrl,
          metadata: data?.metadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return provider;
    } catch (error) {
      logger?.warn({ err: error }, "Error creating DSP provider:");
      throw error;
    }
  }

  async updateDSPProvider(
    id: string,
    data: {
      name?: string;
      isActive?: boolean;
      metadata?: Record<string, unknown>;
    },
  ): Promise<any | null> {
    try {
      const [provider] = await db
        .update(dspProviders)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(dspProviders?.id, id))
        .returning();
      return provider || null;
    } catch (error) {
      logger?.warn({ err: error }, "Error updating DSP provider:");
      return null;
    }
  }

  async deleteHyperFollowPage(id: string): Promise<boolean> {
    try {
      await db?.delete(hyperFollowPages).where(eq(hyperFollowPages?.id, id));
      return true;
    } catch (error) {
      logger?.warn({ err: error }, "Error deleting hyperfollow page:");
      return false;
    }
  }

  private _dispatchSettingKey(releaseId: string) {
    return `distro_dispatch:${releaseId}`;
  }

  private async _loadDispatches(releaseId: string): Promise<any[]> {
    const _key = this?._dispatchSettingKey(releaseId);
    const [row] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings?.key, key))
      .limit(1);
    return (row?.value as unknown[]) || [];
  }

  private async _saveDispatches(
    releaseId: string,
    dispatches: unknown[],
  ): Promise<void> {
    const _key = this?._dispatchSettingKey(releaseId);
    const [existing] = await db
      .select({ id: systemSettings?.id })
      .from(systemSettings)
      .where(eq(systemSettings?.key, key))
      .limit(1);
    if (existing) {
      await db
        .update(systemSettings)
        .set({ value: dispatches, updatedAt: new Date() })
        .where(eq(systemSettings?.key, key));
    } else {
      await db.insert(systemSettings).values({
        key,
        value: dispatches,
        description: `Distribution dispatches for release ${releaseId}`,
      });
    }
  }

  async createDistroDispatch(data: Record<string, unknown>): Promise<unknown> {
    const _dispatch = {
      id: `dispatch_${Date?.now()}_${randomBytes(4).toString("hex")}`,
      ...data,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const _releaseDispatches = await this?._loadDispatches(data?.releaseId);
    releaseDispatches?.push(dispatch);
    await this?._saveDispatches(data?.releaseId, releaseDispatches);
    return dispatch;
  }

  async getDistroDispatchStatuses(releaseId: string): Promise<any[]> {
    return this?._loadDispatches(releaseId);
  }

  async updateDistroDispatchStatus(
    releaseId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const _dispatches = await this?._loadDispatches(releaseId);
    if (data?.platform) {
      const _dispatch = dispatches?.find(
        (d: Record<string, unknown>) => d?.platform === data?.platform,
      );
      if (dispatch) {
        Object?.assign(dispatch, data, { updatedAt: new Date().toISOString() });
        await this?._saveDispatches(releaseId, dispatches);
        return dispatch;
      }
    }
    return null;
  }

  async updateDistroDispatch(
    dispatchId: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    const _rows = await db
      .select()
      .from(systemSettings)
      .where(sql`${systemSettings?.key} like ${"distro_dispatch:%"}`)
      .limit(200);
    for (const row of rows) {
      const _dispatches = (row?.value as Record<string, unknown>[]) || [];
      const _dispatch = dispatches?.find(
        (d: Record<string, unknown>) => d?.id === dispatchId,
      );
      if (dispatch) {
        Object?.assign(dispatch, data, { updatedAt: new Date().toISOString() });
        const _releaseId = row?.key.replace("distro_dispatch:", "");
        await this?._saveDispatches(releaseId, dispatches);
        return dispatch;
      }
    }
    return null;
  }

  async createAuditLog(data: Record<string, unknown>): Promise<unknown> {
    try {
      const [entry] = await db
        .insert(workspaceAuditLog)
        .values({
          workspaceId: data?.workspaceId || data?.userId || "default",
          userId: data?.userId,
          action: data?.action,
          resourceType: data?.resourceType || null,
          resourceId: data?.resourceId || null,
          details: data?.details || null,
          changes: data?.changes || null,
          previousValues: data?.previousValues || null,
          newValues: data?.newValues || null,
          ipAddress: data?.ipAddress || null,
          userAgent: data?.userAgent || null,
        })
        .returning();
      return entry;
    } catch (error) {
      logger?.warn({ err: error }, "Failed to persist audit log entry:");
      return { id: `audit_${Date?.now()}`, ...data, createdAt: new Date() };
    }
  }

  async getDistroAnalytics(userId: string): Promise<unknown> {
    const _now = new Date();
    const _thisMonthStart = new Date(now?.getFullYear(), now?.getMonth(), 1);
    const _prevMonthStart = new Date(now?.getFullYear(), now?.getMonth() - 1, 1);
    const _threeMonthsAgo = new Date(now?.getFullYear(), now?.getMonth() - 3, 1);

    const [allTimeAgg, thisMonthAgg, prevMonthAgg, txRow, recentAnalytics] =
      await Promise?.all([
        db
          .select({
            totalStreams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
            totalListeners: sql<number>`COALESCE(SUM(${analytics?.totalListeners}), 0)`,
            totalRevenue: sql<number>`COALESCE(SUM(${analytics?.revenue}), 0)`,
          })
          .from(analytics)
          .where(eq(analytics?.userId, userId)),

        db
          .select({
            streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
          })
          .from(analytics)
          .where(
            and(
              eq(analytics?.userId, userId),
              gte(analytics?.date, thisMonthStart),
            ),
          ),

        db
          .select({
            streams: sql<number>`COALESCE(SUM(${analytics?.streams}), 0)`,
          })
          .from(analytics)
          .where(
            and(
              eq(analytics?.userId, userId),
              gte(analytics?.date, prevMonthStart),
              lt(analytics?.date, thisMonthStart),
            ),
          ),

        db
          .select({
            totalRevenue: sql<number>`COALESCE(SUM(${royaltyTransactions?.amount}), 0)`,
            totalStreams: sql<number>`COALESCE(SUM(${royaltyTransactions?.streamCount}), 0)`,
          })
          .from(royaltyTransactions)
          .where(eq(royaltyTransactions?.userId, userId)),

        db
          .select()
          .from(analytics)
          .where(
            and(
              eq(analytics?.userId, userId),
              gte(analytics?.date, threeMonthsAgo),
            ),
          )
          .orderBy(desc(analytics?.date))
          .limit(90),
      ]);

    const _txRevenue = Number(txRow[0]?.totalRevenue ?? 0);
    const _txStreams = Number(txRow[0]?.totalStreams ?? 0);
    const _totalStreams = Number(allTimeAgg[0]?.totalStreams ?? 0) + txStreams;
    const _totalListeners = Number(allTimeAgg[0]?.totalListeners ?? 0);
    const _analyticsRevenue = Number(allTimeAgg[0]?.totalRevenue ?? 0);
    const _combinedRevenue = txRevenue || analyticsRevenue;

    if (totalStreams === 0 && txStreams === 0 && txRevenue === 0) {
      return null;
    }

    const _thisMonthStreams = Number(thisMonthAgg[0]?.streams ?? 0);
    const _prevMonthStreams = Number(prevMonthAgg[0]?.streams ?? 0);
    const _streamGrowth =
      prevMonthStreams > 0
        ? Math?.round(
            ((thisMonthStreams - prevMonthStreams) / prevMonthStreams) * 100,
          )
        : 0;

    return {
      totalStreams,
      streamGrowth,
      monthlyListeners: totalListeners,
      listenerGrowth: 0,
      saves: 0,
      saveGrowth: 0,
      playlistAdds: 0,
      playlistGrowth: 0,
      totalRevenue: combinedRevenue,
      downloads: 0,
      revenue: combinedRevenue,
      growth: streamGrowth,
      rawData: recentAnalytics,
    };
  }

  async getStreamingTrends(userId: string): Promise<any[]> {
    const _trends = await db
      .select()
      .from(analytics)
      .where(eq(analytics?.userId, userId))
      .orderBy(desc(analytics?.date))
      .limit(90);

    return trends?.map((t) => ({
      date: t?.date,
      streams: t?.streams || 0,
      listeners: t?.listeners || 0,
      saves: t?.saves || 0,
    }));
  }

  async getGeographicData(userId: string): Promise<any[]> {
    const _data = await db
      .select()
      .from(analytics)
      .where(eq(analytics?.userId, userId))
      .limit(1);

    if (data?.length === 0 || !data[0].topCountries) {
      return [];
    }

    return (data[0].topCountries as unknown[]) || [];
  }

  async getPayoutHistory(userId: string): Promise<any[]> {
    try {
      const _payouts = await db
        .select()
        .from(instantPayouts)
        .where(eq(instantPayouts?.userId, userId))
        .orderBy(desc(instantPayouts?.createdAt))
        .limit(50);

      return payouts || [];
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching payout history:");
      return [];
    }
  }

  async getHyperFollowPages(userId: string): Promise<any[]> {
    try {
      const _pages = await db
        .select()
        .from(hyperFollowPages)
        .where(eq(hyperFollowPages?.userId, userId))
        .orderBy(desc(hyperFollowPages?.createdAt))
        .limit(50);
      return pages || [];
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching hyperfollow pages:");
      return [];
    }
  }

  async getHyperFollowPage(id: string): Promise<any | null> {
    try {
      const _pages = await db
        .select()
        .from(hyperFollowPages)
        .where(eq(hyperFollowPages?.id, id))
        .limit(1);
      return pages[0] || null;
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching hyperfollow page:");
      return null;
    }
  }

  async getHyperFollowPageBySlug(slug: string): Promise<any | null> {
    try {
      const _pages = await db
        .select()
        .from(hyperFollowPages)
        .where(eq(hyperFollowPages?.slug, slug))
        .limit(1);
      return pages[0] || null;
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching hyperfollow page by slug:");
      return null;
    }
  }

  async getDSPProviders(): Promise<any[]> {
    try {
      const _providers = await db
        .select()
        .from(dspProviders)
        .orderBy(dspProviders?.name)
        .limit(100);
      return providers || [];
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching DSP providers:");
      return [];
    }
  }

  async createHyperFollowPage(
    data: Record<string, unknown>,
  ): Promise<any | null> {
    try {
      const [page] = await db
        .insert(hyperFollowPages)
        .values({
          userId: data?.userId,
          title: data?.title,
          slug: data?.slug,
          imageUrl: data?.imageUrl || null,
          links: data?.links || {},
        })
        .returning();
      return page;
    } catch (error) {
      logger?.warn({ err: error }, "Error creating hyperfollow page:");
      return null;
    }
  }

  async updateHyperFollowPage(
    id: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    try {
      const [page] = await db
        .update(hyperFollowPages)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(hyperFollowPages?.id, id))
        .returning();
      return page || null;
    } catch (error) {
      logger?.warn({ err: error }, "Error updating hyperfollow page:");
      return null;
    }
  }

  async createListing(data: {
    userId: string;
    title: string;
    description?: string;
    priceCents: number;
    category?: string;
    audioUrl?: string;
    artworkUrl?: string;
    previewUrl?: string;
    isPublished?: boolean;
    metadata?: Record<string, unknown>;
    tags?: string[];
  }): Promise<unknown> {
    try {
      const [listing] = await db
        .insert(listings)
        .values({
          userId: data?.userId,
          title: data?.title,
          description: data?.description,
          priceCents: data?.priceCents,
          category: data?.category,
          audioUrl: data?.audioUrl,
          artworkUrl: data?.artworkUrl,
          previewUrl: data?.previewUrl,
          isPublished: data?.isPublished ?? true,
          metadata: data?.metadata,
        })
        .returning();
      return listing;
    } catch (error) {
      logger?.warn({ err: error }, "Error creating listing:");
      throw error;
    }
  }

  async getBeatListings(filters?: {
    search?: string;
    genre?: string;
    minPrice?: number;
    maxPrice?: number;
    bpm?: number;
    key?: string;
    tags?: string[];
    sortBy?: "recent" | "popular" | "price_low" | "price_high";
    limit?: number;
    offset?: number;
    userId?: string;
  }): Promise<any[]> {
    try {
      const conditions: import("drizzle-orm").SQL<unknown>[] = [];

      if (filters?.userId) {
        conditions?.push(eq(listings?.userId, filters?.userId));
      } else {
        conditions?.push(eq(listings?.isPublished, true));
      }

      if (filters?.search) {
        const _searchTerm = `%${filters?.search}%`;
        conditions?.push(
          or(
            ilike(listings?.title, searchTerm),
            ilike(listings?.description, searchTerm),
            ilike(listings?.category, searchTerm),
            sql`${listings?.metadata}::text ilike ${searchTerm}`,
          ),
        );
      }

      if (filters?.genre) {
        conditions?.push(
          or(
            ilike(listings?.category, `%${filters?.genre}%`),
            sql`${listings?.metadata}->>'genre' ilike ${`%${filters?.genre}%`}`,
          ),
        );
      }

      if (filters?.minPrice != null) {
        conditions?.push(
          gte(listings?.priceCents, Math?.round(filters?.minPrice * 100)),
        );
      }
      if (filters?.maxPrice != null) {
        conditions?.push(
          lte(listings?.priceCents, Math?.round(filters?.maxPrice * 100)),
        );
      }

      if (filters?.bpm != null) {
        conditions?.push(
          sql`(${listings?.metadata}->>'bpm')::int = ${filters?.bpm}`,
        );
      }

      if (filters?.key) {
        conditions?.push(
          sql`${listings?.metadata}->>'key' ilike ${`%${filters?.key}%`}`,
        );
      }

      const _whereClause =
        conditions?.length > 0 ? and(...conditions) : undefined;

      let orderBy: import("drizzle-orm").SQL<unknown> | undefined;
      switch (filters?.sortBy) {
        case "popular":
          orderBy = [desc(sql`(${listings?.metadata}->>'plays')::int`)];
          break;
        case "price_low":
          orderBy = [asc(listings?.priceCents)];
          break;
        case "price_high":
          orderBy = [desc(listings?.priceCents)];
          break;
        default:
          orderBy = [desc(listings?.createdAt)];
      }

      const _limit = filters?.limit ?? 50;
      const _offset = filters?.offset ?? 0;

      // Owner reads (My Beats) need read-your-writes consistency, so they go
      // to the primary. Public reads can use the replica for scale.
      const _reader = filters?.userId ? db : dbRead;

      const _results = await reader
        .select()
        .from(listings)
        .where(whereClause)
        .orderBy(...orderBy)
        .limit(limit)
        .offset(offset);

      const _userIds = [...new Set(results?.map((l) => l?.userId))];
      const _userRows =
        userIds?.length > 0
          ? await dbRead
              .select({
                id: users?.id,
                username: users?.username,
                firstName: users?.firstName,
                lastName: users?.lastName,
              })
              .from(users)
              .where(inArray(users?.id, userIds))
          : [];
      const _userMap = new Map(userRows?.map((u) => [u?.id, u]));

      return results?.map((listing) => {
        const _meta = (listing?.metadata as Record<string, unknown>) || {};
        const _owner = userMap?.get(listing?.userId);
        const _producerName =
          owner?.username ||
          `${owner?.firstName || ""} ${owner?.lastName || ""}`.trim() ||
          "Producer";
        return {
          id: listing?.id,
          userId: listing?.userId,
          producerId: listing?.userId,
          producer: producerName,
          title: listing?.title,
          description: listing?.description || "",
          price: (listing?.priceCents || 0) / 100,
          currency: listing?.currency || "usd",
          category: listing?.category,
          genre: meta?.genre || listing?.category || "",
          mood: meta?.mood || "",
          tempo: meta?.bpm || 0,
          bpm: meta?.bpm || 0,
          key: meta?.key || "",
          duration: meta?.duration || 0,
          audioUrl: listing?.audioUrl,
          artworkUrl: listing?.artworkUrl,
          coverArt: listing?.artworkUrl,
          previewUrl: listing?.previewUrl,
          isPublished: listing?.isPublished,
          status: listing?.isPublished ? "active" : "inactive",
          isExclusive: meta?.isExclusive || false,
          isLease: meta?.isLease !== false,
          licenseType: meta?.licenseType || "basic",
          metadata: listing?.metadata,
          avgRating: meta?.avgRating || 0,
          ratingCount: meta?.ratingCount || 0,
          likes: meta?.likes || 0,
          plays: meta?.plays || 0,
          downloads: meta?.downloads || 0,
          tags: meta?.tags || [],
          waveformData: meta?.waveformData || [],
          createdAt: listing?.createdAt,
          updatedAt: listing?.updatedAt ?? listing?.createdAt,
          licenses: [
            { type: "basic", price: (listing?.priceCents || 0) / 100 },
            { type: "premium", price: ((listing?.priceCents || 0) / 100) * 2 },
            { type: "exclusive", price: ((listing?.priceCents || 0) / 100) * 5 },
          ],
        };
      });
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching beat listings:");
      return [];
    }
  }

  async getBeatListing(id: string): Promise<any | null> {
    try {
      const [listing] = await db
        .select()
        .from(listings)
        .where(eq(listings?.id, id))
        .limit(1);

      if (!listing) return null;

      return {
        id: listing?.id,
        userId: listing?.userId,
        title: listing?.title,
        description: listing?.description,
        price: (listing?.priceCents || 0) / 100,
        currency: listing?.currency || "usd",
        category: listing?.category,
        audioUrl: listing?.audioUrl,
        artworkUrl: listing?.artworkUrl,
        coverArt: listing?.artworkUrl,
        previewUrl: listing?.previewUrl,
        isPublished: listing?.isPublished,
        metadata: listing?.metadata,
        createdAt: listing?.createdAt,
        licenses: await (async () => {
          const _tiers = await db
            .select()
            .from(listingLicenseTiers)
            .where(
              and(
                eq(listingLicenseTiers?.listingId, id),
                eq(listingLicenseTiers?.isActive, true),
              ),
            )
            .orderBy(asc(listingLicenseTiers?.sortOrder))
            .limit(20);
          if (tiers?.length > 0)
            return tiers?.map((t) => ({
              id: t?.id,
              type: t?.licenseType,
              label: t?.label,
              price: (t?.priceCents || 0) / 100,
              discountType: t?.discountType,
              discountPercent: t?.discountPercent,
              discountPrice: t?.discountPriceCents
                ? t?.discountPriceCents / 100
                : null,
              bogoEnabled: t?.bogoEnabled,
              fileFormats: t?.fileFormats,
            }));
          const _base = (listing?.priceCents || 0) / 100;
          return [
            { type: "basic", label: "Basic", price: base },
            { type: "premium", label: "Premium", price: base * 2 },
            { type: "exclusive", label: "Exclusive", price: base * 5 },
          ];
        })(),
      };
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching beat listing:");
      return null;
    }
  }

  async updateListing(
    id: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    try {
      const [listing] = await db
        .update(listings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(listings?.id, id))
        .returning();

      if (!listing) return null;

      return {
        id: listing?.id,
        userId: listing?.userId,
        title: listing?.title,
        description: listing?.description,
        priceCents: listing?.priceCents,
        currency: listing?.currency || "usd",
        category: listing?.category,
        audioUrl: listing?.audioUrl,
        artworkUrl: listing?.artworkUrl,
        previewUrl: listing?.previewUrl,
        isPublished: listing?.isPublished,
        metadata: listing?.metadata,
        createdAt: listing?.createdAt,
      };
    } catch (error) {
      logger?.warn({ err: error }, "Error updating listing:");
      throw error;
    }
  }

  async deleteListing(id: string): Promise<boolean> {
    try {
      await db?.delete(listings).where(eq(listings?.id, id));
      return true;
    } catch (error) {
      logger?.warn({ err: error }, "Error deleting listing:");
      throw error;
    }
  }

  async getContractTemplates(userId: string): Promise<any[]> {
    try {
      const _results = await db
        .select()
        .from(contractTemplates)
        .where(eq(contractTemplates?.userId, userId))
        .orderBy(desc(contractTemplates?.createdAt))
        .limit(100);
      return results;
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching contract templates:");
      return [];
    }
  }

  async getContractTemplate(id: string): Promise<any | null> {
    try {
      const [template] = await db
        .select()
        .from(contractTemplates)
        .where(eq(contractTemplates?.id, id))
        .limit(1);
      return template || null;
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching contract template:");
      return null;
    }
  }

  async getContractTemplateByUser(
    id: string,
    userId: string,
  ): Promise<any | null> {
    try {
      const [template] = await db
        .select()
        .from(contractTemplates)
        .where(
          and(
            eq(contractTemplates?.id, id),
            eq(contractTemplates?.userId, userId),
          ),
        )
        .limit(1);
      return template || null;
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching contract template by user:");
      return null;
    }
  }

  async createContractTemplate(data: {
    userId: string;
    name: string;
    description?: string;
    content: string;
    category?: string;
    variables?: Record<string, unknown>[];
  }): Promise<unknown> {
    try {
      const [template] = await db
        .insert(contractTemplates)
        .values({
          userId: data?.userId,
          name: data?.name,
          description: data?.description || "",
          content: data?.content,
          category: data?.category || "custom",
          variables: data?.variables || [],
          isDefault: false,
        })
        .returning();
      return template;
    } catch (error) {
      logger?.warn({ err: error }, "Error creating contract template:");
      throw error;
    }
  }

  async updateContractTemplate(
    id: string,
    data: Record<string, unknown>,
  ): Promise<Record<string, unknown> | null> {
    try {
      const [template] = await db
        .update(contractTemplates)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(contractTemplates?.id, id))
        .returning();
      return template || null;
    } catch (error) {
      logger?.warn({ err: error }, "Error updating contract template:");
      throw error;
    }
  }

  async deleteContractTemplate(id: string): Promise<boolean> {
    try {
      await db?.delete(contractTemplates).where(eq(contractTemplates?.id, id));
      return true;
    } catch (error) {
      logger?.warn({ err: error }, "Error deleting contract template:");
      throw error;
    }
  }

  async getUserOrders(userId: string): Promise<any[]> {
    try {
      const _results = await db
        .select({
          id: orders?.id,
          userId: orders?.userId,
          sellerId: orders?.sellerId,
          listingId: orders?.listingId,
          amount: orders?.amount,
          currency: orders?.currency,
          status: orders?.status,
          licenseType: orders?.licenseType,
          licenseSnapshot: orders?.licenseSnapshot,
          licenseDocumentUrl: orders?.licenseDocumentUrl,
          stripePaymentIntentId: orders?.stripePaymentIntentId,
          metadata: orders?.metadata,
          createdAt: orders?.createdAt,
          beatTitle: listings?.title,
          beatArtworkUrl: listings?.artworkUrl,
          beatAudioUrl: listings?.audioUrl,
          beatMetadata: listings?.metadata,
          sellerName: users?.username,
        })
        .from(orders)
        .leftJoin(listings, eq(orders?.listingId, listings?.id))
        .leftJoin(users, eq(orders?.sellerId, users?.id))
        .where(eq(orders?.userId, userId))
        .orderBy(desc(orders?.createdAt));
      return results;
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching user orders:");
      return [];
    }
  }

  async getSellerOrders(sellerId: string): Promise<any[]> {
    try {
      const _results = await db
        .select()
        .from(orders)
        .where(eq(orders?.sellerId, sellerId))
        .orderBy(desc(orders?.createdAt))
        .limit(200);
      return results;
    } catch (error) {
      logger?.warn({ err: error }, "Error fetching seller orders:");
      return [];
    }
  }

  // ============================================================================
  // COLLABORATION SNAPSHOTS - Real-time Yjs document persistence
  // ============================================================================

  async saveCollabSnapshot(
    data: InsertCollabSnapshot,
  ): Promise<CollabSnapshot> {
    const [snapshot] = await db
      .insert(collabSnapshots)
      .values(data)
      .returning();
    return snapshot;
  }

  async getLatestCollabSnapshot(
    projectId: string,
  ): Promise<CollabSnapshot | null> {
    const [snapshot] = await db
      .select()
      .from(collabSnapshots)
      .where(eq(collabSnapshots?.projectId, projectId))
      .orderBy(desc(collabSnapshots?.createdAt))
      .limit(1);
    return snapshot || null;
  }

  async getCollabSnapshots(
    projectId: string,
    limit: number = 10,
  ): Promise<CollabSnapshot[]> {
    return await db
      .select()
      .from(collabSnapshots)
      .where(eq(collabSnapshots?.projectId, projectId))
      .orderBy(desc(collabSnapshots?.createdAt))
      .limit(limit);
  }

  async deleteOldCollabSnapshots(
    projectId: string,
    keepCount: number = 10,
  ): Promise<void> {
    const _snapshots = await db
      .select({ id: collabSnapshots?.id })
      .from(collabSnapshots)
      .where(eq(collabSnapshots?.projectId, projectId))
      .orderBy(desc(collabSnapshots?.createdAt))
      .limit(500);

    if (snapshots?.length > keepCount) {
      const _idsToDelete = snapshots?.slice(keepCount).map((s) => s?.id);
      // Single bulk DELETE instead of N separate round-trips.
      await db
        .delete(collabSnapshots)
        .where(inArray(collabSnapshots?.id, idsToDelete));
    }
  }

  async createJWTToken(data: Record<string, unknown>): Promise<unknown> {
    const [token] = await db?.insert(jwtTokens).values(data).returning();
    return token;
  }

  async verifyJWTToken(jti: string): Promise<boolean> {
    const [token] = await db
      .select({
        id: jwtTokens?.id,
        revoked: jwtTokens?.revoked,
        expiresAt: jwtTokens?.expiresAt,
      })
      .from(jwtTokens)
      .where(eq(jwtTokens?.id, jti))
      .limit(1);
    if (!token) return false;
    if (token?.revoked) return false;
    if (token?.expiresAt < new Date()) return false;
    return true;
  }

  async revokeJWTToken(id: string, reason: string): Promise<void> {
    await db
      .update(jwtTokens)
      .set({ revoked: true, revokedAt: new Date(), revokedReason: reason })
      .where(eq(jwtTokens?.id, id));
  }

  async revokeAllJWTTokensForUser(
    userId: string,
    reason: string,
  ): Promise<void> {
    await db
      .update(jwtTokens)
      .set({ revoked: true, revokedAt: new Date(), revokedReason: reason })
      .where(and(eq(jwtTokens?.userId, userId), eq(jwtTokens?.revoked, false)));
  }

  async createRefreshToken(data: Record<string, unknown>): Promise<unknown> {
    const [token] = await db?.insert(refreshTokens).values(data).returning();
    return token;
  }

  async getRefreshToken(token: string): Promise<unknown> {
    const [rt] = await db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens?.token, token))
      .limit(1);
    return rt || null;
  }

  async revokeRefreshToken(id: string, reason: string): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revoked: true, revokedAt: new Date(), revokedReason: reason })
      .where(eq(refreshTokens?.id, id));
  }

  async revokeAllRefreshTokensForUser(
    userId: string,
    reason: string,
  ): Promise<void> {
    await db
      .update(refreshTokens)
      .set({ revoked: true, revokedAt: new Date(), revokedReason: reason })
      .where(
        and(eq(refreshTokens?.userId, userId), eq(refreshTokens?.revoked, false)),
      );
  }
}

export const _storage = new DatabaseStorage();
