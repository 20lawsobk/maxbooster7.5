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
  type User, 
  type InsertUser, 
  type DSPProvider,
  type InsertProject
} from "@shared/schema";
import { db } from "./db";
import { eq, and, desc, gte, lte, sql } from "drizzle-orm";

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

    const defaultPlugins = [
      { id: 'mb-eq8', name: 'EQ-8', slug: 'eq-8', type: 'eq', category: 'effect', vendor: 'Max Booster', version: '1.0.0', description: '8-band parametric EQ', isBuiltIn: true, isActive: true },
      { id: 'mb-compressor', name: 'Compressor Pro', slug: 'compressor-pro', type: 'compressor', category: 'effect', vendor: 'Max Booster', version: '1.0.0', description: 'Professional compressor', isBuiltIn: true, isActive: true },
      { id: 'mb-reverb', name: 'Reverb Space', slug: 'reverb-space', type: 'reverb', category: 'effect', vendor: 'Max Booster', version: '1.0.0', description: 'Algorithmic reverb', isBuiltIn: true, isActive: true },
      { id: 'mb-delay', name: 'Delay Lab', slug: 'delay-lab', type: 'delay', category: 'effect', vendor: 'Max Booster', version: '1.0.0', description: 'Multi-tap delay', isBuiltIn: true, isActive: true },
      { id: 'mb-limiter', name: 'Limiter Max', slug: 'limiter-max', type: 'limiter', category: 'effect', vendor: 'Max Booster', version: '1.0.0', description: 'Transparent limiter', isBuiltIn: true, isActive: true },
      { id: 'mb-piano', name: 'MB Piano', slug: 'mb-piano', type: 'piano', category: 'instrument', vendor: 'Max Booster', version: '1.0.0', description: 'Virtual acoustic piano', isBuiltIn: true, isActive: true },
      { id: 'mb-strings', name: 'MB Strings', slug: 'mb-strings', type: 'strings', category: 'instrument', vendor: 'Max Booster', version: '1.0.0', description: 'Lush string ensemble', isBuiltIn: true, isActive: true },
      { id: 'mb-drums', name: 'MB Drums', slug: 'mb-drums', type: 'drums', category: 'instrument', vendor: 'Max Booster', version: '1.0.0', description: 'Punchy drum kit', isBuiltIn: true, isActive: true },
      { id: 'mb-bass', name: 'MB Bass', slug: 'mb-bass', type: 'bass', category: 'instrument', vendor: 'Max Booster', version: '1.0.0', description: 'Deep bass synthesizer', isBuiltIn: true, isActive: true },
      { id: 'mb-pad', name: 'MB Synth Pad', slug: 'mb-synth-pad', type: 'pad', category: 'instrument', vendor: 'Max Booster', version: '1.0.0', description: 'Atmospheric pad synthesizer', isBuiltIn: true, isActive: true },
    ];

    for (const plugin of defaultPlugins) {
      await db.insert(pluginCatalog).values(plugin).onConflictDoNothing();
    }
  }

  async getProducers(): Promise<any[]> {
    try {
      const allUsers = await db.select({
        id: users.id,
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
        username: users.username,
      }).from(users).limit(50);
      
      return allUsers.map(u => ({
        id: u.id,
        name: u.username || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Producer',
        avatarUrl: null,
        verified: false,
        followers: 0,
        sales: 0,
      }));
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
      
      const results = await query.orderBy(desc(listings.createdAt)).limit(filters?.limit || 50);
      
      return results.map(listing => ({
        id: listing.id,
        userId: listing.userId,
        title: listing.title,
        description: listing.description,
        price: (listing.priceCents || 0) / 100,
        currency: listing.currency || 'usd',
        category: listing.category,
        audioUrl: listing.audioUrl,
        artworkUrl: listing.artworkUrl,
        previewUrl: listing.previewUrl,
        isPublished: listing.isPublished,
        metadata: listing.metadata,
        createdAt: listing.createdAt,
        licenses: [
          { type: 'basic', price: (listing.priceCents || 0) / 100 },
          { type: 'premium', price: ((listing.priceCents || 0) / 100) * 2 },
          { type: 'exclusive', price: ((listing.priceCents || 0) / 100) * 5 },
        ],
      }));
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

  async getUserOrders(userId: string): Promise<any[]> {
    try {
      const { orders } = await import("@shared/schema");
      const results = await db
        .select()
        .from(orders)
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
}

export const storage = new DatabaseStorage();
