import { db } from "../db";
import { eq, and, desc, sql, gte, count } from "drizzle-orm";
import { 
  achievements, 
  userAchievements, 
  userStreaks,
  users,
  type Achievement,
  type UserAchievement,
  type UserStreak 
} from "../../shared/schema";

export interface AchievementRequirement {
  type: string;
  threshold: number;
  eventType?: string;
}

export interface AchievementWithProgress extends Achievement {
  progress: number;
  unlocked: boolean;
  unlockedAt: Date | null;
}

export interface LeaderboardEntry {
  userId: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarUrl: string | null;
  totalPoints: number;
  achievementCount: number;
}

class AchievementService {
  async checkAndAwardAchievements(
    userId: string,
    eventType: string,
    eventData: Record<string, any>
  ): Promise<Achievement[]> {
    const allAchievements = await db
      .select()
      .from(achievements)
      .where(eq(achievements.isActive, true));
    
    const userAchievementRecords = await db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId));
    
    const unlockedIds = new Set(
      userAchievementRecords
        .filter(ua => ua.unlockedAt !== null)
        .map(ua => ua.achievementId)
    );
    
    const newlyUnlocked: Achievement[] = [];
    
    for (const achievement of allAchievements) {
      if (unlockedIds.has(achievement.id)) continue;
      
      const requirement = achievement.requirement as AchievementRequirement;
      if (!requirement) continue;
      
      if (requirement.eventType && requirement.eventType !== eventType) continue;
      
      const progress = this.calculateProgress(eventType, eventData, requirement);
      const existingProgress = userAchievementRecords.find(
        ua => ua.achievementId === achievement.id
      );
      
      if (progress >= 1) {
        if (existingProgress) {
          await db
            .update(userAchievements)
            .set({
              progress: 1,
              unlockedAt: new Date(),
              notified: false,
            })
            .where(eq(userAchievements.id, existingProgress.id));
        } else {
          await db.insert(userAchievements).values({
            userId,
            achievementId: achievement.id,
            progress: 1,
            unlockedAt: new Date(),
            notified: false,
          });
        }
        newlyUnlocked.push(achievement);
      } else if (progress > 0) {
        if (existingProgress) {
          await db
            .update(userAchievements)
            .set({ progress })
            .where(eq(userAchievements.id, existingProgress.id));
        } else {
          await db.insert(userAchievements).values({
            userId,
            achievementId: achievement.id,
            progress,
          });
        }
      }
    }
    
    return newlyUnlocked;
  }
  
  private calculateProgress(
    eventType: string,
    eventData: Record<string, any>,
    requirement: AchievementRequirement
  ): number {
    const threshold = requirement.threshold || 1;
    
    switch (requirement.type) {
      case "streams":
        return Math.min(1, (eventData.totalStreams || 0) / threshold);
      case "uploads":
        return Math.min(1, (eventData.totalUploads || 0) / threshold);
      case "sales":
        return Math.min(1, (eventData.totalSales || 0) / threshold);
      case "streak":
        return Math.min(1, (eventData.currentStreak || 0) / threshold);
      case "collabs":
        return Math.min(1, (eventData.totalCollabs || 0) / threshold);
      case "socials":
        return Math.min(1, (eventData.connectedSocials || 0) / threshold);
      case "viral":
        return eventData.isViral ? 1 : 0;
      case "first":
        return eventData.isFirst ? 1 : 0;
      default:
        return 0;
    }
  }
  
  async getUserAchievements(userId: string): Promise<AchievementWithProgress[]> {
    const allAchievements = await db
      .select()
      .from(achievements)
      .where(eq(achievements.isActive, true))
      .orderBy(achievements.sortOrder);
    
    const userAchievementRecords = await db
      .select()
      .from(userAchievements)
      .where(eq(userAchievements.userId, userId));
    
    const progressMap = new Map<string, UserAchievement>();
    for (const ua of userAchievementRecords) {
      progressMap.set(ua.achievementId, ua);
    }
    
    return allAchievements.map(achievement => {
      const userProgress = progressMap.get(achievement.id);
      return {
        ...achievement,
        progress: userProgress?.progress || 0,
        unlocked: !!userProgress?.unlockedAt,
        unlockedAt: userProgress?.unlockedAt || null,
      };
    });
  }
  
  async getUnnotifiedAchievements(userId: string): Promise<Achievement[]> {
    const unnotified = await db
      .select({
        achievement: achievements,
      })
      .from(userAchievements)
      .innerJoin(achievements, eq(userAchievements.achievementId, achievements.id))
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.notified, false),
          sql`${userAchievements.unlockedAt} IS NOT NULL`
        )
      );
    
    return unnotified.map(r => r.achievement);
  }
  
  async markAchievementNotified(userId: string, achievementId: string): Promise<void> {
    await db
      .update(userAchievements)
      .set({ notified: true })
      .where(
        and(
          eq(userAchievements.userId, userId),
          eq(userAchievements.achievementId, achievementId)
        )
      );
  }
  
  async updateStreak(
    userId: string,
    streakType: string
  ): Promise<UserStreak> {
    const today = new Date().toISOString().split("T")[0];
    
    const existingStreak = await db
      .select()
      .from(userStreaks)
      .where(
        and(
          eq(userStreaks.userId, userId),
          eq(userStreaks.streakType, streakType)
        )
      )
      .limit(1);
    
    if (existingStreak.length === 0) {
      const [newStreak] = await db
        .insert(userStreaks)
        .values({
          userId,
          streakType,
          currentStreak: 1,
          longestStreak: 1,
          lastActivityDate: today,
        })
        .returning();
      
      await this.checkAndAwardAchievements(userId, "streak", {
        streakType,
        currentStreak: 1,
      });
      
      return newStreak;
    }
    
    const streak = existingStreak[0];
    const lastActivity = streak.lastActivityDate;
    
    if (lastActivity === today) {
      return streak;
    }
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split("T")[0];
    
    let newCurrentStreak = 1;
    
    if (lastActivity === yesterdayStr) {
      newCurrentStreak = (streak.currentStreak || 0) + 1;
    }
    
    const newLongestStreak = Math.max(
      streak.longestStreak || 0,
      newCurrentStreak
    );
    
    const [updatedStreak] = await db
      .update(userStreaks)
      .set({
        currentStreak: newCurrentStreak,
        longestStreak: newLongestStreak,
        lastActivityDate: today,
        updatedAt: new Date(),
      })
      .where(eq(userStreaks.id, streak.id))
      .returning();
    
    await this.checkAndAwardAchievements(userId, "streak", {
      streakType,
      currentStreak: newCurrentStreak,
    });
    
    return updatedStreak;
  }
  
  async getUserStreaks(userId: string): Promise<UserStreak[]> {
    return db
      .select()
      .from(userStreaks)
      .where(eq(userStreaks.userId, userId));
  }
  
  async getLeaderboard(
    category?: string,
    limit: number = 10
  ): Promise<LeaderboardEntry[]> {
    let query = db
      .select({
        id: achievements.id,
        category: achievements.category,
        points: achievements.points,
      })
      .from(achievements)
      .where(eq(achievements.isActive, true));
    
    const achievementList = await query;
    
    const filteredAchievements = category
      ? achievementList.filter(a => a.category === category)
      : achievementList;
    
    const achievementIds = filteredAchievements.map(a => a.id);
    const pointsMap = new Map<string, number>();
    for (const a of filteredAchievements) {
      pointsMap.set(a.id, a.points || 0);
    }
    
    if (achievementIds.length === 0) {
      return [];
    }
    
    const userStats = await db
      .select({
        userId: userAchievements.userId,
        achievementId: userAchievements.achievementId,
      })
      .from(userAchievements)
      .where(sql`${userAchievements.unlockedAt} IS NOT NULL`);
    
    const userPointsMap = new Map<string, { points: number; count: number }>();
    
    for (const stat of userStats) {
      if (!achievementIds.includes(stat.achievementId)) continue;
      
      const existing = userPointsMap.get(stat.userId) || { points: 0, count: 0 };
      existing.points += pointsMap.get(stat.achievementId) || 0;
      existing.count += 1;
      userPointsMap.set(stat.userId, existing);
    }
    
    const userIds = Array.from(userPointsMap.keys());
    
    if (userIds.length === 0) {
      return [];
    }
    
    const userRecords = await db
      .select({
        id: users.id,
        username: users.username,
        firstName: users.firstName,
        lastName: users.lastName,
        avatarUrl: users.avatarUrl,
      })
      .from(users)
      .where(sql`${users.id} IN (${sql.join(userIds.map(id => sql`${id}`), sql`, `)})`);
    
    const userMap = new Map<string, typeof userRecords[0]>();
    for (const u of userRecords) {
      userMap.set(u.id, u);
    }
    
    const leaderboard: LeaderboardEntry[] = [];
    
    for (const [userId, stats] of userPointsMap.entries()) {
      const user = userMap.get(userId);
      if (!user) continue;
      
      leaderboard.push({
        userId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        avatarUrl: user.avatarUrl,
        totalPoints: stats.points,
        achievementCount: stats.count,
      });
    }
    
    leaderboard.sort((a, b) => b.totalPoints - a.totalPoints);
    
    return leaderboard.slice(0, limit);
  }
  
  async getAllAchievements(): Promise<Achievement[]> {
    return db
      .select()
      .from(achievements)
      .where(eq(achievements.isActive, true))
      .orderBy(achievements.sortOrder);
  }
}

export const achievementService = new AchievementService();
