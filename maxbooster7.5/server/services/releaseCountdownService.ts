import { db } from "../db";
import { eq, and, desc, gte } from "drizzle-orm";
import {
  releaseCountdowns,
  countdownTasks,
  countdownAnalytics,
  type ReleaseCountdown,
  type CountdownTask,
  type CountdownAnalytic,
  type InsertReleaseCountdown,
  type InsertCountdownTask,
} from "@shared/schema";
import { logger } from "../logger";

interface PreReleaseChecklistItem {
  task: string;
  dueOffset: number;
  category: string;
}

const PRE_RELEASE_CHECKLIST_TEMPLATES: PreReleaseChecklistItem[] = [
  { task: "Finalize album artwork and promotional images", dueOffset: -28, category: "4_weeks" },
  { task: "Confirm final release date with distributor", dueOffset: -28, category: "4_weeks" },
  { task: "Write release bio and press materials", dueOffset: -28, category: "4_weeks" },
  { task: "Submit to digital streaming platforms (DSPs)", dueOffset: -21, category: "3_weeks" },
  { task: "Create press kit with photos, bio, and assets", dueOffset: -21, category: "3_weeks" },
  { task: "Reach out to music blogs and press contacts", dueOffset: -21, category: "3_weeks" },
  { task: "Tease release on social media with snippets", dueOffset: -14, category: "2_weeks" },
  { task: "Pitch to playlist curators and editors", dueOffset: -14, category: "2_weeks" },
  { task: "Create countdown content for stories/posts", dueOffset: -14, category: "2_weeks" },
  { task: "Launch pre-save campaign link", dueOffset: -7, category: "1_week" },
  { task: "Reach out to influencers for collaboration", dueOffset: -7, category: "1_week" },
  { task: "Schedule release day announcement posts", dueOffset: -7, category: "1_week" },
  { task: "Send email newsletter to fans about release", dueOffset: -3, category: "1_week" },
  { task: "Announce release across all platforms", dueOffset: 0, category: "release_day" },
  { task: "Engage with fan comments and reactions", dueOffset: 0, category: "release_day" },
  { task: "Go live on social media to celebrate", dueOffset: 0, category: "release_day" },
  { task: "Share first streaming milestone with fans", dueOffset: 1, category: "post_release" },
  { task: "Thank fans for support with personal message", dueOffset: 1, category: "post_release" },
  { task: "Share user-generated content and reactions", dueOffset: 3, category: "post_release" },
  { task: "Analyze first week streaming data", dueOffset: 7, category: "post_release" },
];

class ReleaseCountdownService {
  async createCountdown(
    userId: string,
    releaseData: Omit<InsertReleaseCountdown, "userId">
  ): Promise<ReleaseCountdown> {
    try {
      const [countdown] = await db
        .insert(releaseCountdowns)
        .values({
          userId,
          ...releaseData,
        })
        .returning();

      const tasks = this.generatePreReleaseChecklist(new Date(releaseData.releaseDate));
      await this.bulkAddTasks(countdown.id, tasks);

      logger.info(`Created countdown ${countdown.id} for user ${userId}`);
      return countdown;
    } catch (error) {
      logger.error("Error creating countdown:", error);
      throw new Error("Failed to create countdown");
    }
  }

  async getCountdown(countdownId: string, userId: string): Promise<ReleaseCountdown | undefined> {
    try {
      const [countdown] = await db
        .select()
        .from(releaseCountdowns)
        .where(and(eq(releaseCountdowns.id, countdownId), eq(releaseCountdowns.userId, userId)));
      return countdown;
    } catch (error) {
      logger.error("Error fetching countdown:", error);
      throw new Error("Failed to fetch countdown");
    }
  }

  async getActiveCountdowns(userId: string): Promise<ReleaseCountdown[]> {
    try {
      const countdowns = await db
        .select()
        .from(releaseCountdowns)
        .where(and(eq(releaseCountdowns.userId, userId), eq(releaseCountdowns.status, "active")))
        .orderBy(releaseCountdowns.releaseDate);
      return countdowns;
    } catch (error) {
      logger.error("Error fetching active countdowns:", error);
      throw new Error("Failed to fetch active countdowns");
    }
  }

  async getAllCountdowns(userId: string): Promise<ReleaseCountdown[]> {
    try {
      const countdowns = await db
        .select()
        .from(releaseCountdowns)
        .where(eq(releaseCountdowns.userId, userId))
        .orderBy(desc(releaseCountdowns.createdAt));
      return countdowns;
    } catch (error) {
      logger.error("Error fetching countdowns:", error);
      throw new Error("Failed to fetch countdowns");
    }
  }

  async updateCountdown(
    countdownId: string,
    userId: string,
    data: Partial<InsertReleaseCountdown>
  ): Promise<ReleaseCountdown> {
    try {
      const [updated] = await db
        .update(releaseCountdowns)
        .set(data)
        .where(and(eq(releaseCountdowns.id, countdownId), eq(releaseCountdowns.userId, userId)))
        .returning();
      return updated;
    } catch (error) {
      logger.error("Error updating countdown:", error);
      throw new Error("Failed to update countdown");
    }
  }

  async addTask(countdownId: string, taskData: Omit<InsertCountdownTask, "countdownId">): Promise<CountdownTask> {
    try {
      const existingTasks = await this.getTasks(countdownId);
      const maxOrder = existingTasks.reduce((max, t) => Math.max(max, t.order || 0), 0);

      const [task] = await db
        .insert(countdownTasks)
        .values({
          countdownId,
          order: maxOrder + 1,
          ...taskData,
        })
        .returning();

      logger.info(`Added task ${task.id} to countdown ${countdownId}`);
      return task;
    } catch (error) {
      logger.error("Error adding task:", error);
      throw new Error("Failed to add task");
    }
  }

  async bulkAddTasks(
    countdownId: string,
    tasks: Array<Omit<InsertCountdownTask, "countdownId">>
  ): Promise<CountdownTask[]> {
    try {
      if (tasks.length === 0) return [];

      const tasksToInsert = tasks.map((task, index) => ({
        countdownId,
        order: index,
        ...task,
      }));

      const insertedTasks = await db.insert(countdownTasks).values(tasksToInsert).returning();

      logger.info(`Added ${insertedTasks.length} tasks to countdown ${countdownId}`);
      return insertedTasks;
    } catch (error) {
      logger.error("Error bulk adding tasks:", error);
      throw new Error("Failed to add tasks");
    }
  }

  async getTasks(countdownId: string): Promise<CountdownTask[]> {
    try {
      const tasks = await db
        .select()
        .from(countdownTasks)
        .where(eq(countdownTasks.countdownId, countdownId))
        .orderBy(countdownTasks.order);
      return tasks;
    } catch (error) {
      logger.error("Error fetching tasks:", error);
      throw new Error("Failed to fetch tasks");
    }
  }

  async completeTask(countdownId: string, taskId: string): Promise<CountdownTask> {
    try {
      const [task] = await db
        .update(countdownTasks)
        .set({ completedAt: new Date() })
        .where(and(eq(countdownTasks.id, taskId), eq(countdownTasks.countdownId, countdownId)))
        .returning();

      logger.info(`Completed task ${taskId} for countdown ${countdownId}`);
      return task;
    } catch (error) {
      logger.error("Error completing task:", error);
      throw new Error("Failed to complete task");
    }
  }

  async uncompleteTask(countdownId: string, taskId: string): Promise<CountdownTask> {
    try {
      const [task] = await db
        .update(countdownTasks)
        .set({ completedAt: null })
        .where(and(eq(countdownTasks.id, taskId), eq(countdownTasks.countdownId, countdownId)))
        .returning();

      logger.info(`Uncompleted task ${taskId} for countdown ${countdownId}`);
      return task;
    } catch (error) {
      logger.error("Error uncompleting task:", error);
      throw new Error("Failed to uncomplete task");
    }
  }

  async getCountdownAnalytics(countdownId: string): Promise<CountdownAnalytic[]> {
    try {
      const analytics = await db
        .select()
        .from(countdownAnalytics)
        .where(eq(countdownAnalytics.countdownId, countdownId))
        .orderBy(desc(countdownAnalytics.date));
      return analytics;
    } catch (error) {
      logger.error("Error fetching analytics:", error);
      throw new Error("Failed to fetch analytics");
    }
  }

  async recordAnalytics(
    countdownId: string,
    data: { presaves?: number; shares?: number; pageViews?: number }
  ): Promise<CountdownAnalytic> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [existing] = await db
        .select()
        .from(countdownAnalytics)
        .where(and(eq(countdownAnalytics.countdownId, countdownId), gte(countdownAnalytics.date, today)));

      if (existing) {
        const [updated] = await db
          .update(countdownAnalytics)
          .set({
            presaves: (existing.presaves || 0) + (data.presaves || 0),
            shares: (existing.shares || 0) + (data.shares || 0),
            pageViews: (existing.pageViews || 0) + (data.pageViews || 0),
          })
          .where(eq(countdownAnalytics.id, existing.id))
          .returning();
        return updated;
      }

      const [newRecord] = await db
        .insert(countdownAnalytics)
        .values({
          countdownId,
          date: today,
          ...data,
        })
        .returning();

      return newRecord;
    } catch (error) {
      logger.error("Error recording analytics:", error);
      throw new Error("Failed to record analytics");
    }
  }

  async getAnalyticsSummary(countdownId: string): Promise<{
    totalPresaves: number;
    totalShares: number;
    totalPageViews: number;
    dailyData: CountdownAnalytic[];
  }> {
    try {
      const analytics = await this.getCountdownAnalytics(countdownId);

      const totals = analytics.reduce(
        (acc, record) => ({
          totalPresaves: acc.totalPresaves + (record.presaves || 0),
          totalShares: acc.totalShares + (record.shares || 0),
          totalPageViews: acc.totalPageViews + (record.pageViews || 0),
        }),
        { totalPresaves: 0, totalShares: 0, totalPageViews: 0 }
      );

      return {
        ...totals,
        dailyData: analytics,
      };
    } catch (error) {
      logger.error("Error getting analytics summary:", error);
      throw new Error("Failed to get analytics summary");
    }
  }

  generatePreReleaseChecklist(releaseDate: Date): Array<Omit<InsertCountdownTask, "countdownId">> {
    return PRE_RELEASE_CHECKLIST_TEMPLATES.map((template) => {
      const dueDate = new Date(releaseDate);
      dueDate.setDate(dueDate.getDate() + template.dueOffset);

      return {
        task: template.task,
        dueDate,
        category: template.category,
        order: 0,
      };
    });
  }

  async generateAISuggestedTasks(
    countdownId: string,
    genre?: string,
    targetAudience?: string
  ): Promise<Array<Omit<InsertCountdownTask, "countdownId">>> {
    const baseTasks = PRE_RELEASE_CHECKLIST_TEMPLATES;

    const genreSpecificTasks: PreReleaseChecklistItem[] = [];

    if (genre?.toLowerCase().includes("hip-hop") || genre?.toLowerCase().includes("rap")) {
      genreSpecificTasks.push(
        { task: "Submit to hip-hop focused playlists on Spotify", dueOffset: -14, category: "2_weeks" },
        { task: "Connect with hip-hop blogs for premiere", dueOffset: -10, category: "2_weeks" }
      );
    } else if (genre?.toLowerCase().includes("electronic") || genre?.toLowerCase().includes("edm")) {
      genreSpecificTasks.push(
        { task: "Submit to EDM-focused YouTube channels", dueOffset: -14, category: "2_weeks" },
        { task: "Reach out to dance music podcasts", dueOffset: -10, category: "2_weeks" }
      );
    } else if (genre?.toLowerCase().includes("indie") || genre?.toLowerCase().includes("alternative")) {
      genreSpecificTasks.push(
        { task: "Pitch to indie music blogs and magazines", dueOffset: -14, category: "2_weeks" },
        { task: "Submit to college radio stations", dueOffset: -10, category: "2_weeks" }
      );
    }

    const allTasks = [...baseTasks, ...genreSpecificTasks];

    const countdown = await db
      .select()
      .from(releaseCountdowns)
      .where(eq(releaseCountdowns.id, countdownId))
      .limit(1);

    if (!countdown[0]) {
      throw new Error("Countdown not found");
    }

    const releaseDate = new Date(countdown[0].releaseDate);

    return allTasks.map((template) => {
      const dueDate = new Date(releaseDate);
      dueDate.setDate(dueDate.getDate() + template.dueOffset);

      return {
        task: template.task,
        dueDate,
        category: template.category,
        order: 0,
      };
    });
  }

  async getCountdownWithTasks(
    countdownId: string,
    userId: string
  ): Promise<{ countdown: ReleaseCountdown; tasks: CountdownTask[] } | null> {
    try {
      const countdown = await this.getCountdown(countdownId, userId);
      if (!countdown) return null;

      const tasks = await this.getTasks(countdownId);
      return { countdown, tasks };
    } catch (error) {
      logger.error("Error fetching countdown with tasks:", error);
      throw new Error("Failed to fetch countdown with tasks");
    }
  }

  calculateProgress(tasks: CountdownTask[]): { completed: number; total: number; percentage: number } {
    const total = tasks.length;
    const completed = tasks.filter((t) => t.completedAt !== null).length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { completed, total, percentage };
  }

  calculateTimeRemaining(releaseDate: Date): {
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
    isReleased: boolean;
  } {
    const now = new Date();
    const diff = releaseDate.getTime() - now.getTime();

    if (diff <= 0) {
      return { days: 0, hours: 0, minutes: 0, seconds: 0, isReleased: true };
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return { days, hours, minutes, seconds, isReleased: false };
  }
}

export const releaseCountdownService = new ReleaseCountdownService();
