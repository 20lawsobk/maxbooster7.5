import { 
  users, 
  dspProviders, 
  projects,
  releases,
  posts,
  socialAccounts,
  adCampaigns,
  adCreatives,
  contentCalendar,
  aiModels,
  notifications,
  analytics,
  pluginCatalog,
  distroReleases,
  distroTracks,
  instantPayouts,
  hyperFollowPages,
  listings,
  sessions,
  collabSnapshots,
  storefronts,
  storefrontFollows,
  storefrontRatings,
  orders,
  trendEvents,
  modelVersions,
  optimizationTasks,
  aiModelsCatalog,
  aiModelVersions,
  inferenceRuns,
  canaryDeployments,
  retrainingSchedules,
  retrainingRuns,
  deploymentHistory,
  healthChecks,
  systemBackups,
  rollbackHistory,
  upgradeAlerts,
  type User, 
  type InsertUser, 
  type DSPProvider,
  type InsertProject,
  type CollabSnapshot,
  type InsertCollabSnapshot,
  type TrendEvent,
  type InsertTrendEvent,
  type ModelVersion,
  type InsertModelVersion,
  type OptimizationTask,
  type InsertOptimizationTask,
  type AIModelCatalog,
  type InsertAIModelCatalog,
  type AIModelVersion,
  type InsertAIModelVersion,
  type InferenceRun,
  type InsertInferenceRun,
  type CanaryDeployment,
  type InsertCanaryDeployment,
  type RetrainingSchedule,
  type InsertRetrainingSchedule,
  type RetrainingRun,
  type InsertRetrainingRun,
  type DeploymentHistory,
  type InsertDeploymentHistory,
  type HealthCheck,
  type InsertHealthCheck,
  type SystemBackup,
  type InsertSystemBackup,
  type RollbackHistory,
  type InsertRollbackHistory,
  type UpgradeAlert,
  type InsertUpgradeAlert
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, sql, inArray } from "drizzle-orm";

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
}

export class DatabaseStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user || undefined;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user || undefined;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user || undefined;
  }

  async getUserByPasswordResetToken(token: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.passwordResetToken, token));
    return user || undefined;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    
    // Initialize Pocket Dimension storage for new user
    try {
      const { userPocketService } = await import('./services/userPocketDimensionService.js');
      await userPocketService.initializeUserStorage(user.id, user.email);
    } catch (error) {
      console.error(`[Storage] Failed to initialize pocket dimension for user ${user.id}:`, error);
      // Don't fail user creation if storage init fails
    }
    
    return user;
  }

  async updateUser(id: string, data: Partial<User>): Promise<User | undefined> {
    const [user] = await db
      .update(users)
      .set(data)
      .where(eq(users.id, id))
      .returning();
    return user || undefined;
  }

  async deleteUser(id: string): Promise<boolean> {
    const result = await db.delete(users).where(eq(users.id, id));
    return true;
  }

  async getDistributionProvider(slug: string): Promise<DSPProvider | undefined> {
    const [provider] = await db.select().from(dspProviders).where(eq(dspProviders.slug, slug));
    return provider || undefined;
  }

  async getProjectsByUserId(userId: string): Promise<Project[]> {
    return await db.select().from(projects).where(eq(projects.userId, userId));
  }

  async createProject(insertProject: InsertProject): Promise<Project> {
    const [project] = await db
      .insert(projects)
      .values(insertProject)
      .returning();
    return project;
  }

  async getReleasesByUserId(userId: string): Promise<Release[]> {
    return await db.select().from(releases).where(eq(releases.userId, userId));
  }

  async getAutopilotConfig(userId: string): Promise<any | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user) return undefined;
    return (user as any).autopilotConfig || undefined;
  }

  async saveAutopilotConfig(userId: string, config: any): Promise<any> {
    await db
      .update(users)
      .set({ autopilotConfig: config } as any)
      .where(eq(users.id, userId));
    return config;
  }

  async getAdvertisingAutopilotConfig(userId: string): Promise<any | undefined> {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId));
    
    if (!user) return undefined;
    return (user as any).advertisingAutopilotConfig || undefined;
  }

  async saveAdvertisingAutopilotConfig(userId: string, config: any): Promise<any> {
    await db
      .update(users)
      .set({ advertisingAutopilotConfig: config } as any)
      .where(eq(users.id, userId));
    return config;
  }

  async getAllEnabledAutopilotConfigs(): Promise<any[]> {
    const allUsers = await db.select().from(users);
    return allUsers
      .filter((user: any) => {
        const config = user.advertisingAutopilotConfig;
        return config && config.enabled === true;
      })
      .map((user: any) => ({
        userId: user.id,
        ...user.advertisingAutopilotConfig,
      }));
  }

  async getUserAIModel(userId: string, modelType: string): Promise<any | undefined> {
    const [model] = await db
      .select()
      .from(aiModels)
      .where(eq(aiModels.modelType, modelType));
    return model || undefined;
  }

  async saveUserAIModel(userId: string, modelType: string, weights: any, metadata?: any): Promise<void> {
    const existing = await this.getUserAIModel(userId, modelType);
    if (existing) {
      await db
        .update(aiModels)
        .set({ 
          parameters: weights,
          performance: metadata,
          lastTrainedAt: new Date(),
          updatedAt: new Date()
        })
        .where(eq(aiModels.id, existing.id));
    } else {
      await db.insert(aiModels).values({
        modelName: `${userId}-${modelType}`,
        modelType,
        parameters: weights,
        performance: metadata,
        lastTrainedAt: new Date(),
      });
    }
  }

  async getSocialPosts(userId: string): Promise<Post[]> {
    return await db
      .select()
      .from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt))
      .limit(100);
  }

  async getUserSocialPosts(userId: string): Promise<Post[]> {
    return this.getSocialPosts(userId);
  }

  async getSocialMetrics(userId: string): Promise<any> {
    const accounts = await this.getSocialAccounts(userId);
    const postsThisWeek = await db
      .select()
      .from(posts)
      .where(and(
        eq(posts.userId, userId),
        gte(posts.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
      ));

    const totalFollowers = accounts.reduce((sum, acc) => sum + (acc.followerCount || 0), 0);
    
    return {
      totalFollowers,
      totalEngagement: 0,
      totalReach: 0,
      totalImpressions: 0,
      postsThisWeek: postsThisWeek.length,
      avgEngagementRate: 0,
      followersGrowth: null,
      contentPerformance: null,
      platformGrowth: null,
      aiRecommendation: null,
    };
  }

  async getSocialAccounts(userId: string): Promise<SocialAccount[]> {
    return await db
      .select()
      .from(socialAccounts)
      .where(eq(socialAccounts.userId, userId));
  }

  async getSocialCalendarEvents(userId: string): Promise<any[]> {
    const events = await db
      .select()
      .from(contentCalendar)
      .where(eq(contentCalendar.userId, userId))
      .orderBy(desc(contentCalendar.scheduledAt));
    return events;
  }

  async getSocialCalendarStats(userId: string): Promise<any> {
    const events = await this.getSocialCalendarEvents(userId);
    return {
      totalScheduled: events.filter(e => e.status === 'scheduled').length,
      pendingApproval: events.filter(e => e.status === 'pending_approval').length,
      published: events.filter(e => e.status === 'published').length,
      drafts: events.filter(e => e.status === 'draft').length,
    };
  }

  async getSocialActivity(userId: string): Promise<any[]> {
    const recentPosts = await db
      .select()
      .from(posts)
      .where(eq(posts.userId, userId))
      .orderBy(desc(posts.createdAt))
      .limit(20);
    
    return recentPosts.map(post => ({
      id: post.id,
      type: 'post',
      platform: post.platform,
      content: post.content,
      createdAt: post.createdAt,
    }));
  }

  async getSocialWeeklyStats(userId: string): Promise<any[]> {
    return [];
  }

  async getAdvertisingCampaigns(userId: string): Promise<AdCampaign[]> {
    return await db
      .select()
      .from(adCampaigns)
      .where(eq(adCampaigns.userId, userId))
      .orderBy(desc(adCampaigns.createdAt));
  }

  async getAdvertisingInsights(userId: string): Promise<any> {
    const campaigns = await this.getAdvertisingCampaigns(userId);
    if (campaigns.length === 0) return null;
    
    const totalSpend = campaigns.reduce((sum, c) => sum + (c.budget || 0), 0);
    return {
      totalCampaigns: campaigns.length,
      totalSpend,
      activeCampaigns: campaigns.filter(c => c.status === 'active').length,
    };
  }

  async getAudienceSegments(userId: string): Promise<any[]> {
    return [];
  }

  async getCreativeFatigue(userId: string): Promise<any[]> {
    return [];
  }

  async getBiddingStrategies(userId: string): Promise<any[]> {
    return [];
  }

  async getLookalikeAudiences(userId: string): Promise<any[]> {
    return [];
  }

  async getAdvertisingForecasts(userId: string): Promise<any> {
    return null;
  }

  async getCompetitorInsights(userId: string): Promise<any[]> {
    return [];
  }

  async getABTests(userId: string): Promise<any[]> {
    return [];
  }

  async getCreativeVariants(userId: string): Promise<any[]> {
    return [];
  }

  async getRoasCampaigns(userId: string): Promise<any[]> {
    return this.getAdvertisingCampaigns(userId);
  }

  async getRoasAudienceSegments(userId: string): Promise<any[]> {
    return [];
  }

  async getRoasForecast(userId: string): Promise<any[]> {
    return [];
  }

  async getBudgetOptimization(userId: string): Promise<any[]> {
    return [];
  }

  async getCreativeFatigueAnalysis(userId: string): Promise<any[]> {
    return [];
  }

  async getBudgetPacingCampaigns(userId: string): Promise<any[]> {
    return this.getAdvertisingCampaigns(userId);
  }

  async getBudgetPacingHistory(userId: string): Promise<any[]> {
    return [];
  }

  async getAttributionData(userId: string): Promise<any[]> {
    return [];
  }

  async getCrossChannelAttribution(userId: string): Promise<any[]> {
    return [];
  }

  async getSocialListeningKeywords(userId: string): Promise<any[]> {
    return [];
  }

  async getSocialListeningTrending(userId: string): Promise<any[]> {
    return [];
  }

  async getSocialListeningInfluencers(userId: string): Promise<any[]> {
    return [];
  }

  async getSocialListeningAlerts(userId: string): Promise<any[]> {
    return [];
  }

  async getCompetitors(userId: string): Promise<any[]> {
    return [];
  }

  async getRecentAnalyzedContent(userId: string, limit: number): Promise<any[]> {
    return [];
  }

  async saveAnalyzedContentFeatures(userId: string, features: any): Promise<string> {
    return 'feature-' + Date.now();
  }

  async getAllPosts(userId: string): Promise<Post[]> {
    return this.getSocialPosts(userId);
  }

  async getNotifications(userId: string): Promise<Notification[]> {
    return await db
      .select()
      .from(notifications)
      .where(eq(notifications.userId, userId))
      .orderBy(desc(notifications.createdAt))
      .limit(50);
  }

  async createNotification(data: {
    userId: string;
    type: string;
    title: string;
    message?: string;
    actionUrl?: string;
    metadata?: any;
  }): Promise<Notification> {
    const [notification] = await db
      .insert(notifications)
      .values({
        userId: data.userId,
        type: data.type,
        title: data.title,
        message: data.message,
        actionUrl: data.actionUrl,
        metadata: data.metadata,
        isRead: false,
      })
      .returning();
    return notification;
  }

  async markNotificationRead(id: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.id, id));
  }

  async markAllNotificationsRead(userId: string): Promise<void> {
    await db
      .update(notifications)
      .set({ isRead: true })
      .where(eq(notifications.userId, userId));
  }

  async getNotificationById(id: string): Promise<Notification | undefined> {
    const [notification] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, id));
    return notification || undefined;
  }

  async deleteNotification(id: string): Promise<void> {
    await db
      .delete(notifications)
      .where(eq(notifications.id, id));
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const result = await db
      .delete(sessions)
      .where(eq(sessions.id, sessionId))
      .returning({ id: sessions.id });
    return result.length > 0;
  }

  async deleteSessionByToken(sessionToken: string): Promise<boolean> {
    const result = await db
      .delete(sessions)
      .where(eq(sessions.sessionToken, sessionToken))
      .returning({ id: sessions.id });
    return result.length > 0;
  }

  async getSessionById(sessionId: string): Promise<{ id: string; userId: string } | undefined> {
    const [session] = await db
      .select({ id: sessions.id, userId: sessions.userId })
      .from(sessions)
      .where(eq(sessions.id, sessionId));
    return session || undefined;
  }

  async getSessionsByUserId(userId: string): Promise<any[]> {
    return await db
      .select({ id: sessions.id, lastActivity: sessions.lastActivity, userAgent: sessions.userAgent })
      .from(sessions)
      .where(eq(sessions.userId, userId))
      .orderBy(desc(sessions.lastActivity))
      .limit(20);
  }

  async getAnalytics(userId: string, startDate?: Date, endDate?: Date): Promise<any[]> {
    let query = db.select().from(analytics).where(eq(analytics.userId, userId));
    return await query.orderBy(desc(analytics.date)).limit(100);
  }

  async seedPluginCatalog(): Promise<void> {
    const existingPlugins = await db.select().from(pluginCatalog).limit(1);
    if (existingPlugins.length > 0) return;

    const { ALL_PLUGINS } = await import('./services/plugins/index');
    
    console.log(`🎹 Seeding ${ALL_PLUGINS.length} studio plugins...`);
    
    for (const plugin of ALL_PLUGINS) {
      await db.insert(pluginCatalog).values({
        id: plugin.id,
        name: plugin.name,
        slug: plugin.slug,
        type: plugin.type,
        category: plugin.category,
        vendor: plugin.author || 'Max Booster',
        version: plugin.version,
        description: plugin.description,
        isBuiltIn: true,
        isActive: true,
      }).onConflictDoNothing();
    }
    
    console.log(`   ✓ Seeded ${ALL_PLUGINS.length} studio plugins`);
  }

  async getProducers(): Promise<any[]> {
    try {
      const allUsers = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        username: users.username,
        avatarUrl: users.avatarUrl,
        bio: users.bio,
        location: users.location,
        website: users.website,
        role: users.role,
        subscriptionTier: users.subscriptionTier,
      }).from(users).limit(50);
      
      const producerData = await Promise.all(allUsers.map(async (u) => {
        const userBeats = await db.select().from(listings).where(eq(listings.userId, u.id));
        const beatsCount = userBeats.length;

        const userStorefront = await db.select({ id: storefronts.id })
          .from(storefronts)
          .where(eq(storefronts.userId, u.id))
          .limit(1);
        const storefrontId = userStorefront[0]?.id;

        let followersCount = 0;
        let avgRating = 0;
        let salesCount = 0;

        if (storefrontId) {
          const [followResult] = await db.select({ count: sql<number>`count(*)::int` })
            .from(storefrontFollows)
            .where(eq(storefrontFollows.storefrontId, storefrontId));
          followersCount = followResult?.count || 0;

          const [ratingResult] = await db.select({ avg: sql<number>`coalesce(avg(${storefrontRatings.rating}), 0)` })
            .from(storefrontRatings)
            .where(eq(storefrontRatings.storefrontId, storefrontId));
          avgRating = Math.round((Number(ratingResult?.avg) || 0) * 10) / 10;
        }

        const [salesResult] = await db.select({ count: sql<number>`count(*)::int` })
          .from(orders)
          .where(and(eq(orders.sellerId, u.id), eq(orders.status, 'completed')));
        salesCount = salesResult?.count || 0;
        
        const displayName = u.username || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Producer';
        return {
          id: u.id,
          username: u.username || displayName,
          displayName,
          avatar: u.avatarUrl || '',
          avatarUrl: u.avatarUrl || '',
          bio: u.bio || '',
          location: u.location || '',
          website: u.website || '',
          verified: u.role === 'admin' || u.subscriptionTier === 'lifetime',
          followers: followersCount,
          following: 0,
          sales: salesCount,
          beats: beatsCount,
          rating: avgRating,
          joinedAt: '',
          socialLinks: {},
        };
      }));
      
      return producerData;
    } catch (error) {
      console.error('Error getting producers:', error);
      return [];
    }
  }

  async createDistroRelease(data: any): Promise<DistroRelease> {
    const [release] = await db
      .insert(distroReleases)
      .values(data)
      .returning();
    return release;
  }

  async getDistroReleasesByArtist(artistId: string): Promise<DistroRelease[]> {
    return await db
      .select()
      .from(distroReleases)
      .where(eq(distroReleases.artistId, artistId))
      .orderBy(desc(distroReleases.createdAt));
  }

  async getDistroRelease(id: string): Promise<DistroRelease | undefined> {
    const [release] = await db
      .select()
      .from(distroReleases)
      .where(eq(distroReleases.id, id));
    return release || undefined;
  }

  async updateDistroRelease(id: string, data: any): Promise<DistroRelease | undefined> {
    const [release] = await db
      .update(distroReleases)
      .set(data)
      .where(eq(distroReleases.id, id))
      .returning();
    return release || undefined;
  }

  async getDistroTracksByRelease(releaseId: string): Promise<DistroTrack[]> {
    return await db
      .select()
      .from(distroTracks)
      .where(eq(distroTracks.releaseId, releaseId));
  }

  async createDistroTrack(data: any): Promise<DistroTrack> {
    const [track] = await db
      .insert(distroTracks)
      .values(data)
      .returning();
    return track;
  }

  async getDistroTracks(releaseId: string): Promise<DistroTrack[]> {
    return this.getDistroTracksByRelease(releaseId);
  }

  async updateDistroTrack(trackId: string, data: any): Promise<DistroTrack | undefined> {
    const [track] = await db
      .update(distroTracks)
      .set(data)
      .where(eq(distroTracks.id, trackId))
      .returning();
    return track || undefined;
  }

  async deleteDistroTrack(trackId: string): Promise<boolean> {
    try {
      await db.delete(distroTracks).where(eq(distroTracks.id, trackId));
      return true;
    } catch (error) {
      console.error('Error deleting distro track:', error);
      return false;
    }
  }

  async deleteDistroRelease(id: string): Promise<boolean> {
    try {
      await db.delete(distroTracks).where(eq(distroTracks.releaseId, id));
      await db.delete(distroReleases).where(eq(distroReleases.id, id));
      return true;
    } catch (error) {
      console.error('Error deleting distro release:', error);
      return false;
    }
  }

  async getDSPProviderBySlug(slug: string): Promise<any | null> {
    try {
      const [provider] = await db
        .select()
        .from(dspProviders)
        .where(eq(dspProviders.slug, slug));
      return provider || null;
    } catch (error) {
      console.error('Error fetching DSP provider by slug:', error);
      return null;
    }
  }

  async getAllDSPProviders(): Promise<any[]> {
    try {
      const providers = await db.select().from(dspProviders);
      return providers;
    } catch (error) {
      console.error('Error fetching all DSP providers:', error);
      return [];
    }
  }

  async createDSPProvider(data: {
    name: string;
    slug: string;
    isActive?: boolean;
    logoUrl?: string;
    metadata?: any;
  }): Promise<any> {
    try {
      const [provider] = await db
        .insert(dspProviders)
        .values({
          id: `dsp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: data.name,
          slug: data.slug,
          isActive: data.isActive ?? true,
          logoUrl: data.logoUrl,
          metadata: data.metadata,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();
      return provider;
    } catch (error) {
      console.error('Error creating DSP provider:', error);
      throw error;
    }
  }

  async updateDSPProvider(id: string, data: {
    name?: string;
    isActive?: boolean;
    metadata?: any;
  }): Promise<any | null> {
    try {
      const [provider] = await db
        .update(dspProviders)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(dspProviders.id, id))
        .returning();
      return provider || null;
    } catch (error) {
      console.error('Error updating DSP provider:', error);
      return null;
    }
  }

  async deleteHyperFollowPage(id: string): Promise<boolean> {
    try {
      await db.delete(hyperFollowPages).where(eq(hyperFollowPages.id, id));
      return true;
    } catch (error) {
      console.error('Error deleting hyperfollow page:', error);
      return false;
    }
  }

  private distroDispatchStore: Map<string, any[]> = new Map();

  async createDistroDispatch(data: any): Promise<any> {
    const dispatch = {
      id: `dispatch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const releaseDispatches = this.distroDispatchStore.get(data.releaseId) || [];
    releaseDispatches.push(dispatch);
    this.distroDispatchStore.set(data.releaseId, releaseDispatches);
    return dispatch;
  }

  async getDistroDispatchStatuses(releaseId: string): Promise<any[]> {
    return this.distroDispatchStore.get(releaseId) || [];
  }

  async updateDistroDispatchStatus(releaseId: string, data: any): Promise<any | null> {
    const dispatches = this.distroDispatchStore.get(releaseId) || [];
    if (data.platform) {
      const dispatch = dispatches.find((d: any) => d.platform === data.platform);
      if (dispatch) {
        Object.assign(dispatch, data, { updatedAt: new Date() });
        return dispatch;
      }
    }
    return null;
  }

  async updateDistroDispatch(dispatchId: string, data: any): Promise<any | null> {
    for (const [releaseId, dispatches] of this.distroDispatchStore.entries()) {
      const dispatch = dispatches.find((d: any) => d.id === dispatchId);
      if (dispatch) {
        Object.assign(dispatch, data, { updatedAt: new Date() });
        return dispatch;
      }
    }
    return null;
  }

  async createAuditLog(data: any): Promise<any> {
    return {
      id: `audit_${Date.now()}`,
      ...data,
      createdAt: new Date(),
    };
  }

  async getDistroAnalytics(userId: string): Promise<any> {
    const userAnalytics = await db
      .select()
      .from(analytics)
      .where(eq(analytics.userId, userId))
      .orderBy(desc(analytics.date))
      .limit(30);
    
    if (userAnalytics.length === 0) {
      return null;
    }
    
    const totalStreams = userAnalytics.reduce((sum, a) => sum + (a.streams || 0), 0);
    const totalListeners = userAnalytics.reduce((sum, a) => sum + (a.listeners || 0), 0);
    const totalSaves = userAnalytics.reduce((sum, a) => sum + (a.saves || 0), 0);
    const totalPlaylists = userAnalytics.reduce((sum, a) => sum + (a.playlistAdds || 0), 0);
    
    return {
      totalStreams,
      streamGrowth: 0,
      monthlyListeners: totalListeners,
      listenerGrowth: 0,
      saves: totalSaves,
      saveGrowth: 0,
      playlistAdds: totalPlaylists,
      playlistGrowth: 0,
      rawData: userAnalytics,
    };
  }

  async getStreamingTrends(userId: string): Promise<any[]> {
    const trends = await db
      .select()
      .from(analytics)
      .where(eq(analytics.userId, userId))
      .orderBy(desc(analytics.date))
      .limit(90);
    
    return trends.map(t => ({
      date: t.date,
      streams: t.streams || 0,
      listeners: t.listeners || 0,
      saves: t.saves || 0,
    }));
  }

  async getGeographicData(userId: string): Promise<any[]> {
    const data = await db
      .select()
      .from(analytics)
      .where(eq(analytics.userId, userId))
      .limit(1);
    
    if (data.length === 0 || !data[0].topCountries) {
      return [];
    }
    
    return data[0].topCountries as any[] || [];
  }

  async getPayoutHistory(userId: string): Promise<any[]> {
    try {
      const payouts = await db
        .select()
        .from(instantPayouts)
        .where(eq(instantPayouts.userId, userId))
        .orderBy(desc(instantPayouts.createdAt))
        .limit(50);
      
      return payouts || [];
    } catch (error) {
      console.error('Error fetching payout history:', error);
      return [];
    }
  }

  async getHyperFollowPages(userId: string): Promise<any[]> {
    try {
      const pages = await db
        .select()
        .from(hyperFollowPages)
        .where(eq(hyperFollowPages.userId, userId))
        .orderBy(desc(hyperFollowPages.createdAt));
      return pages || [];
    } catch (error) {
      console.error('Error fetching hyperfollow pages:', error);
      return [];
    }
  }

  async getHyperFollowPage(id: string): Promise<any | null> {
    try {
      const pages = await db
        .select()
        .from(hyperFollowPages)
        .where(eq(hyperFollowPages.id, id))
        .limit(1);
      return pages[0] || null;
    } catch (error) {
      console.error('Error fetching hyperfollow page:', error);
      return null;
    }
  }

  async getHyperFollowPageBySlug(slug: string): Promise<any | null> {
    try {
      const pages = await db
        .select()
        .from(hyperFollowPages)
        .where(eq(hyperFollowPages.slug, slug))
        .limit(1);
      return pages[0] || null;
    } catch (error) {
      console.error('Error fetching hyperfollow page by slug:', error);
      return null;
    }
  }

  async getDSPProviders(): Promise<any[]> {
    try {
      const providers = await db
        .select()
        .from(dspProviders)
        .orderBy(dspProviders.name);
      return providers || [];
    } catch (error) {
      console.error('Error fetching DSP providers:', error);
      return [];
    }
  }

  async createHyperFollowPage(data: any): Promise<any | null> {
    try {
      const [page] = await db
        .insert(hyperFollowPages)
        .values({
          ...data,
          createdAt: data.createdAt || new Date(),
          updatedAt: data.updatedAt || new Date(),
        })
        .returning();
      return page;
    } catch (error) {
      console.error('Error creating hyperfollow page:', error);
      return null;
    }
  }

  async updateHyperFollowPage(id: string, data: any): Promise<any | null> {
    try {
      const [page] = await db
        .update(hyperFollowPages)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(hyperFollowPages.id, id))
        .returning();
      return page || null;
    } catch (error) {
      console.error('Error updating hyperfollow page:', error);
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
    metadata?: any;
    tags?: string[];
  }): Promise<any> {
    try {
      const [listing] = await db
        .insert(listings)
        .values({
          userId: data.userId,
          title: data.title,
          description: data.description,
          priceCents: data.priceCents,
          category: data.category,
          audioUrl: data.audioUrl,
          artworkUrl: data.artworkUrl,
          previewUrl: data.previewUrl,
          isPublished: data.isPublished ?? true,
          metadata: data.metadata,
        })
        .returning();
      return listing;
    } catch (error) {
      console.error('Error creating listing:', error);
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
    sortBy?: 'recent' | 'popular' | 'price_low' | 'price_high';
    limit?: number;
    offset?: number;
    userId?: string;
  }): Promise<any[]> {
    try {
      let query = db.select().from(listings).where(eq(listings.isPublished, true));
      
      if (filters?.userId) {
        query = db.select().from(listings).where(eq(listings.userId, filters.userId));
      }
      
      let results = await query.orderBy(desc(listings.createdAt)).limit(filters?.limit || 50);
      
      const userIds = [...new Set(results.map(l => l.userId))];
      const userRows = userIds.length > 0
        ? await db.select({ id: users.id, username: users.username, firstName: users.firstName, lastName: users.lastName })
            .from(users)
            .where(inArray(users.id, userIds))
        : [];
      const userMap = new Map(userRows.map(u => [u.id, u]));

      const mapped = results.map(listing => {
        const meta = (listing.metadata as any) || {};
        const owner = userMap.get(listing.userId);
        const producerName = owner?.username || `${owner?.firstName || ''} ${owner?.lastName || ''}`.trim() || 'Producer';
        return {
          id: listing.id,
          userId: listing.userId,
          producerId: listing.userId,
          producer: producerName,
          title: listing.title,
          description: listing.description || '',
          price: (listing.priceCents || 0) / 100,
          currency: listing.currency || 'usd',
          category: listing.category,
          genre: meta.genre || listing.category || '',
          mood: meta.mood || '',
          tempo: meta.bpm || 0,
          bpm: meta.bpm || 0,
          key: meta.key || '',
          duration: meta.duration || 0,
          audioUrl: listing.audioUrl,
          artworkUrl: listing.artworkUrl,
          coverArt: listing.artworkUrl,
          previewUrl: listing.previewUrl,
          isPublished: listing.isPublished,
          status: listing.isPublished ? 'active' : 'inactive',
          isExclusive: meta.isExclusive || false,
          isLease: meta.isLease !== false,
          licenseType: meta.licenseType || 'basic',
          metadata: listing.metadata,
          avgRating: meta.avgRating || 0,
          ratingCount: meta.ratingCount || 0,
          likes: meta.likes || 0,
          plays: meta.plays || 0,
          downloads: meta.downloads || 0,
          tags: meta.tags || [],
          waveformData: meta.waveformData || [],
          createdAt: listing.createdAt,
          updatedAt: listing.createdAt,
          licenses: [
            { type: 'basic', price: (listing.priceCents || 0) / 100 },
            { type: 'premium', price: ((listing.priceCents || 0) / 100) * 2 },
            { type: 'exclusive', price: ((listing.priceCents || 0) / 100) * 5 },
          ],
        };
      });

      if (filters?.search) {
        const q = filters.search.toLowerCase();
        return mapped.filter(b =>
          b.title?.toLowerCase().includes(q) ||
          b.description?.toLowerCase().includes(q) ||
          b.producer?.toLowerCase().includes(q) ||
          b.genre?.toLowerCase().includes(q) ||
          b.mood?.toLowerCase().includes(q) ||
          (b.tags as string[]).some((t: string) => t.toLowerCase().includes(q))
        );
      }

      return mapped;
    } catch (error) {
      console.error('Error fetching beat listings:', error);
      return [];
    }
  }

  async getBeatListing(id: string): Promise<any | null> {
    try {
      const [listing] = await db
        .select()
        .from(listings)
        .where(eq(listings.id, id));
      
      if (!listing) return null;
      
      return {
        id: listing.id,
        userId: listing.userId,
        title: listing.title,
        description: listing.description,
        price: (listing.priceCents || 0) / 100,
        currency: listing.currency || 'usd',
        category: listing.category,
        audioUrl: listing.audioUrl,
        artworkUrl: listing.artworkUrl,
        coverArt: listing.artworkUrl,
        previewUrl: listing.previewUrl,
        isPublished: listing.isPublished,
        metadata: listing.metadata,
        createdAt: listing.createdAt,
        licenses: [
          { type: 'basic', price: (listing.priceCents || 0) / 100 },
          { type: 'premium', price: ((listing.priceCents || 0) / 100) * 2 },
          { type: 'exclusive', price: ((listing.priceCents || 0) / 100) * 5 },
        ],
      };
    } catch (error) {
      console.error('Error fetching beat listing:', error);
      return null;
    }
  }

  async updateListing(id: string, data: any): Promise<any | null> {
    try {
      const [listing] = await db
        .update(listings)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(listings.id, id))
        .returning();
      
      if (!listing) return null;
      
      return {
        id: listing.id,
        userId: listing.userId,
        title: listing.title,
        description: listing.description,
        priceCents: listing.priceCents,
        currency: listing.currency || 'usd',
        category: listing.category,
        audioUrl: listing.audioUrl,
        artworkUrl: listing.artworkUrl,
        previewUrl: listing.previewUrl,
        isPublished: listing.isPublished,
        metadata: listing.metadata,
        createdAt: listing.createdAt,
      };
    } catch (error) {
      console.error('Error updating listing:', error);
      throw error;
    }
  }

  async deleteListing(id: string): Promise<boolean> {
    try {
      await db.delete(listings).where(eq(listings.id, id));
      return true;
    } catch (error) {
      console.error('Error deleting listing:', error);
      throw error;
    }
  }

  async getContractTemplates(userId: string): Promise<any[]> {
    try {
      const { contractTemplates } = await import("@shared/schema");
      const results = await db
        .select()
        .from(contractTemplates)
        .where(eq(contractTemplates.userId, userId))
        .orderBy(desc(contractTemplates.createdAt));
      return results;
    } catch (error) {
      console.error('Error fetching contract templates:', error);
      return [];
    }
  }

  async getContractTemplate(id: string): Promise<any | null> {
    try {
      const { contractTemplates } = await import("@shared/schema");
      const [template] = await db
        .select()
        .from(contractTemplates)
        .where(eq(contractTemplates.id, id))
        .limit(1);
      return template || null;
    } catch (error) {
      console.error('Error fetching contract template:', error);
      return null;
    }
  }

  async getContractTemplateByUser(id: string, userId: string): Promise<any | null> {
    try {
      const { contractTemplates } = await import("@shared/schema");
      const { and } = await import("drizzle-orm");
      const [template] = await db
        .select()
        .from(contractTemplates)
        .where(and(eq(contractTemplates.id, id), eq(contractTemplates.userId, userId)))
        .limit(1);
      return template || null;
    } catch (error) {
      console.error('Error fetching contract template by user:', error);
      return null;
    }
  }

  async createContractTemplate(data: {
    userId: string;
    name: string;
    description?: string;
    content: string;
    category?: string;
    variables?: any[];
  }): Promise<any> {
    try {
      const { contractTemplates } = await import("@shared/schema");
      const [template] = await db
        .insert(contractTemplates)
        .values({
          userId: data.userId,
          name: data.name,
          description: data.description || '',
          content: data.content,
          category: data.category || 'custom',
          variables: data.variables || [],
          isDefault: false,
        })
        .returning();
      return template;
    } catch (error) {
      console.error('Error creating contract template:', error);
      throw error;
    }
  }

  async updateContractTemplate(id: string, data: any): Promise<any | null> {
    try {
      const { contractTemplates } = await import("@shared/schema");
      const [template] = await db
        .update(contractTemplates)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(contractTemplates.id, id))
        .returning();
      return template || null;
    } catch (error) {
      console.error('Error updating contract template:', error);
      throw error;
    }
  }

  async deleteContractTemplate(id: string): Promise<boolean> {
    try {
      const { contractTemplates } = await import("@shared/schema");
      await db.delete(contractTemplates).where(eq(contractTemplates.id, id));
      return true;
    } catch (error) {
      console.error('Error deleting contract template:', error);
      throw error;
    }
  }

  async getUserOrders(userId: string): Promise<any[]> {
    try {
      const { orders, listings, users } = await import("@shared/schema");
      const results = await db
        .select({
          id: orders.id,
          userId: orders.userId,
          sellerId: orders.sellerId,
          listingId: orders.listingId,
          amount: orders.amount,
          currency: orders.currency,
          status: orders.status,
          licenseType: orders.licenseType,
          licenseSnapshot: orders.licenseSnapshot,
          licenseDocumentUrl: orders.licenseDocumentUrl,
          stripePaymentIntentId: orders.stripePaymentIntentId,
          metadata: orders.metadata,
          createdAt: orders.createdAt,
          beatTitle: listings.title,
          beatArtworkUrl: listings.artworkUrl,
          beatAudioUrl: listings.audioUrl,
          beatMetadata: listings.metadata,
          sellerName: users.displayName,
          sellerUsername: users.username,
        })
        .from(orders)
        .leftJoin(listings, eq(orders.listingId, listings.id))
        .leftJoin(users, eq(orders.sellerId, users.id))
        .where(eq(orders.userId, userId))
        .orderBy(desc(orders.createdAt));
      return results;
    } catch (error) {
      console.error('Error fetching user orders:', error);
      return [];
    }
  }

  async getSellerOrders(sellerId: string): Promise<any[]> {
    try {
      const { orders } = await import("@shared/schema");
      const results = await db
        .select()
        .from(orders)
        .where(eq(orders.sellerId, sellerId))
        .orderBy(desc(orders.createdAt));
      return results;
    } catch (error) {
      console.error('Error fetching seller orders:', error);
      return [];
    }
  }

  // ============================================================================
  // COLLABORATION SNAPSHOTS - Real-time Yjs document persistence
  // ============================================================================

  async saveCollabSnapshot(data: InsertCollabSnapshot): Promise<CollabSnapshot> {
    const [snapshot] = await db
      .insert(collabSnapshots)
      .values(data)
      .returning();
    return snapshot;
  }

  async getLatestCollabSnapshot(projectId: string): Promise<CollabSnapshot | null> {
    const [snapshot] = await db
      .select()
      .from(collabSnapshots)
      .where(eq(collabSnapshots.projectId, projectId))
      .orderBy(desc(collabSnapshots.createdAt))
      .limit(1);
    return snapshot || null;
  }

  async getCollabSnapshots(projectId: string, limit: number = 10): Promise<CollabSnapshot[]> {
    return await db
      .select()
      .from(collabSnapshots)
      .where(eq(collabSnapshots.projectId, projectId))
      .orderBy(desc(collabSnapshots.createdAt))
      .limit(limit);
  }

  async deleteOldCollabSnapshots(projectId: string, keepCount: number = 10): Promise<void> {
    const snapshots = await db
      .select({ id: collabSnapshots.id })
      .from(collabSnapshots)
      .where(eq(collabSnapshots.projectId, projectId))
      .orderBy(desc(collabSnapshots.createdAt));

    if (snapshots.length > keepCount) {
      const idsToDelete = snapshots.slice(keepCount).map(s => s.id);
      for (const id of idsToDelete) {
        await db.delete(collabSnapshots).where(eq(collabSnapshots.id, id));
      }
    }
  }

  // ============================================================================
  // AUTO-UPGRADE SYSTEM METHODS
  // ============================================================================

  async createTrendEvent(data: InsertTrendEvent): Promise<TrendEvent> {
    const [event] = await db.insert(trendEvents).values(data).returning();
    return event;
  }

  async getRecentTrendEvents(days: number): Promise<TrendEvent[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    
    return await db
      .select()
      .from(trendEvents)
      .where(gte(trendEvents.createdAt, cutoffDate))
      .orderBy(desc(trendEvents.createdAt));
  }

  async getTrendEvents(limit: number, source?: string): Promise<TrendEvent[]> {
    let query = db.select().from(trendEvents);
    
    if (source) {
      query = query.where(eq(trendEvents.source, source)) as any;
    }
    
    return await query.orderBy(desc(trendEvents.createdAt)).limit(limit);
  }

  async createModelVersion(data: InsertModelVersion): Promise<ModelVersion> {
    const [version] = await db.insert(modelVersions).values(data).returning();
    return version;
  }

  async getActiveModelVersion(modelType: string): Promise<ModelVersion | undefined> {
    const [version] = await db
      .select()
      .from(modelVersions)
      .where(and(
        eq(modelVersions.modelType, modelType),
        eq(modelVersions.isActive, true)
      ))
      .limit(1);
    
    return version;
  }

  async activateModelVersion(versionId: string, modelType: string): Promise<void> {
    await db.transaction(async (tx) => {
      await tx
        .update(modelVersions)
        .set({ 
          isActive: false, 
          deactivatedAt: new Date() 
        })
        .where(and(
          eq(modelVersions.modelType, modelType),
          eq(modelVersions.isActive, true)
        ));

      await tx
        .update(modelVersions)
        .set({ 
          isActive: true, 
          activatedAt: new Date() 
        })
        .where(eq(modelVersions.id, versionId));
    });
  }

  async createOptimizationTask(data: InsertOptimizationTask): Promise<OptimizationTask> {
    const [task] = await db.insert(optimizationTasks).values(data).returning();
    return task;
  }

  async updateOptimizationTask(taskId: string, data: Partial<OptimizationTask>): Promise<OptimizationTask | undefined> {
    const [task] = await db
      .update(optimizationTasks)
      .set(data)
      .where(eq(optimizationTasks.id, taskId))
      .returning();
    
    return task;
  }

  async getOptimizationTasks(status?: string): Promise<OptimizationTask[]> {
    let query = db.select().from(optimizationTasks);
    
    if (status) {
      query = query.where(eq(optimizationTasks.status, status)) as any;
    }
    
    return await query.orderBy(desc(optimizationTasks.createdAt));
  }

  async createAIModel(data: InsertAIModelCatalog): Promise<AIModelCatalog> {
    const [model] = await db.insert(aiModelsCatalog).values(data).returning();
    return model;
  }

  async getAIModelByName(name: string): Promise<AIModelCatalog | undefined> {
    const [model] = await db
      .select()
      .from(aiModelsCatalog)
      .where(and(
        eq(aiModelsCatalog.name, name),
        eq(aiModelsCatalog.isActive, true)
      ))
      .limit(1);
    
    return model;
  }

  async createAIModelVersion(data: InsertAIModelVersion): Promise<AIModelVersion> {
    const [version] = await db.insert(aiModelVersions).values(data).returning();
    return version;
  }

  async createInferenceRun(data: InsertInferenceRun): Promise<InferenceRun> {
    const [run] = await db.insert(inferenceRuns).values(data).returning();
    return run;
  }

  async updateInferenceRun(runId: string, data: Partial<InferenceRun>): Promise<InferenceRun | undefined> {
    const [run] = await db
      .update(inferenceRuns)
      .set(data)
      .where(eq(inferenceRuns.id, runId))
      .returning();
    
    return run;
  }

  async createCanaryDeployment(data: InsertCanaryDeployment): Promise<CanaryDeployment> {
    const [deployment] = await db.insert(canaryDeployments).values(data).returning();
    return deployment;
  }

  async updateCanaryDeployment(deploymentId: string, data: Partial<CanaryDeployment>): Promise<CanaryDeployment | undefined> {
    const [deployment] = await db
      .update(canaryDeployments)
      .set(data)
      .where(eq(canaryDeployments.id, deploymentId))
      .returning();
    
    return deployment;
  }

  async getCanaryDeployment(deploymentId: string): Promise<CanaryDeployment | undefined> {
    const [deployment] = await db
      .select()
      .from(canaryDeployments)
      .where(eq(canaryDeployments.id, deploymentId))
      .limit(1);
    
    return deployment;
  }

  async createRetrainingSchedule(data: InsertRetrainingSchedule): Promise<RetrainingSchedule> {
    const [schedule] = await db.insert(retrainingSchedules).values(data).returning();
    return schedule;
  }

  async updateRetrainingSchedule(scheduleId: string, data: Partial<RetrainingSchedule>): Promise<RetrainingSchedule | undefined> {
    const [schedule] = await db
      .update(retrainingSchedules)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(retrainingSchedules.id, scheduleId))
      .returning();
    
    return schedule;
  }

  async getRetrainingSchedule(scheduleId: string): Promise<RetrainingSchedule | undefined> {
    const [schedule] = await db
      .select()
      .from(retrainingSchedules)
      .where(eq(retrainingSchedules.id, scheduleId))
      .limit(1);
    
    return schedule;
  }

  async createRetrainingRun(data: InsertRetrainingRun): Promise<RetrainingRun> {
    const [run] = await db.insert(retrainingRuns).values(data).returning();
    return run;
  }

  async updateRetrainingRun(runId: string, data: Partial<RetrainingRun>): Promise<RetrainingRun | undefined> {
    const [run] = await db
      .update(retrainingRuns)
      .set(data)
      .where(eq(retrainingRuns.id, runId))
      .returning();
    
    return run;
  }

  async getRetrainingRun(runId: string): Promise<RetrainingRun | undefined> {
    const [run] = await db
      .select()
      .from(retrainingRuns)
      .where(eq(retrainingRuns.id, runId))
      .limit(1);
    
    return run;
  }

  async createDeploymentHistory(data: InsertDeploymentHistory): Promise<DeploymentHistory> {
    const [deployment] = await db.insert(deploymentHistory).values(data).returning();
    return deployment;
  }

  async updateDeploymentHistory(deploymentId: string, data: Partial<DeploymentHistory>): Promise<DeploymentHistory | undefined> {
    const [deployment] = await db
      .update(deploymentHistory)
      .set(data)
      .where(eq(deploymentHistory.id, deploymentId))
      .returning();
    
    return deployment;
  }

  async getDeploymentHistory(limit: number = 50): Promise<DeploymentHistory[]> {
    return await db
      .select()
      .from(deploymentHistory)
      .orderBy(desc(deploymentHistory.deployedAt))
      .limit(limit);
  }

  async createHealthCheck(data: InsertHealthCheck): Promise<HealthCheck> {
    const [check] = await db.insert(healthChecks).values(data).returning();
    return check;
  }

  async getRecentHealthChecks(component: string, hours: number = 24): Promise<HealthCheck[]> {
    const cutoffDate = new Date();
    cutoffDate.setHours(cutoffDate.getHours() - hours);
    
    return await db
      .select()
      .from(healthChecks)
      .where(and(
        eq(healthChecks.component, component),
        gte(healthChecks.checkedAt, cutoffDate)
      ))
      .orderBy(desc(healthChecks.checkedAt));
  }

  async getLatestHealthCheck(component: string): Promise<HealthCheck | undefined> {
    const [check] = await db
      .select()
      .from(healthChecks)
      .where(eq(healthChecks.component, component))
      .orderBy(desc(healthChecks.checkedAt))
      .limit(1);
    
    return check;
  }

  async createSystemBackup(data: InsertSystemBackup): Promise<SystemBackup> {
    const [backup] = await db.insert(systemBackups).values(data).returning();
    return backup;
  }

  async updateSystemBackup(backupId: string, data: Partial<SystemBackup>): Promise<SystemBackup | undefined> {
    const [backup] = await db
      .update(systemBackups)
      .set(data)
      .where(eq(systemBackups.id, backupId))
      .returning();
    
    return backup;
  }

  async getSystemBackup(backupId: string): Promise<SystemBackup | undefined> {
    const [backup] = await db
      .select()
      .from(systemBackups)
      .where(eq(systemBackups.id, backupId))
      .limit(1);
    
    return backup;
  }

  async getLatestBackup(component: string, backupType?: string): Promise<SystemBackup | undefined> {
    let query = db
      .select()
      .from(systemBackups)
      .where(and(
        eq(systemBackups.component, component),
        eq(systemBackups.status, 'completed')
      ));
    
    if (backupType) {
      query = query.where(eq(systemBackups.backupType, backupType)) as any;
    }
    
    const [backup] = await query.orderBy(desc(systemBackups.createdAt)).limit(1);
    return backup;
  }

  async createRollbackHistory(data: InsertRollbackHistory): Promise<RollbackHistory> {
    const [rollback] = await db.insert(rollbackHistory).values(data).returning();
    return rollback;
  }

  async updateRollbackHistory(rollbackId: string, data: Partial<RollbackHistory>): Promise<RollbackHistory | undefined> {
    const [rollback] = await db
      .update(rollbackHistory)
      .set(data)
      .where(eq(rollbackHistory.id, rollbackId))
      .returning();
    
    return rollback;
  }

  async getRollbackHistory(targetId: string): Promise<RollbackHistory[]> {
    return await db
      .select()
      .from(rollbackHistory)
      .where(eq(rollbackHistory.targetId, targetId))
      .orderBy(desc(rollbackHistory.startedAt));
  }

  async createUpgradeAlert(data: InsertUpgradeAlert): Promise<UpgradeAlert> {
    const [alert] = await db.insert(upgradeAlerts).values(data).returning();
    return alert;
  }

  async updateUpgradeAlert(alertId: string, data: Partial<UpgradeAlert>): Promise<UpgradeAlert | undefined> {
    const [alert] = await db
      .update(upgradeAlerts)
      .set(data)
      .where(eq(upgradeAlerts.id, alertId))
      .returning();
    
    return alert;
  }

  async getUnacknowledgedAlerts(severity?: string): Promise<UpgradeAlert[]> {
    let query = db
      .select()
      .from(upgradeAlerts)
      .where(sql`${upgradeAlerts.acknowledgedAt} IS NULL`);
    
    if (severity) {
      query = query.where(eq(upgradeAlerts.severity, severity)) as any;
    }
    
    return await query.orderBy(desc(upgradeAlerts.createdAt));
  }
}

export const storage = new DatabaseStorage();
