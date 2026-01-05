import { db } from '../db.js';
import { userOnboarding, onboardingTasks, users } from '../../shared/schema.js';
import { eq, asc, and, sql, desc } from 'drizzle-orm';
import { logger } from '../logger.js';

export interface OnboardingProgress {
  userId: string;
  currentStep: number;
  totalSteps: number;
  completionPercentage: number;
  completedSteps: string[];
  totalPoints: number;
  dayStreak: number;
  startedAt: Date | null;
  completedAt: Date | null;
  skippedAt: Date | null;
  tasks: OnboardingTaskWithStatus[];
  recommendedNextStep: OnboardingTaskWithStatus | null;
}

export interface OnboardingTaskWithStatus {
  id: string;
  name: string;
  description: string | null;
  category: string;
  points: number;
  order: number;
  isRequired: boolean;
  actionUrl: string | null;
  icon: string | null;
  completed: boolean;
}

class OnboardingService {
  async getOnboardingProgress(userId: string): Promise<OnboardingProgress> {
    try {
      const tasks = await db
        .select()
        .from(onboardingTasks)
        .orderBy(asc(onboardingTasks.order));

      let userProgress = await db
        .select()
        .from(userOnboarding)
        .where(eq(userOnboarding.userId, userId))
        .limit(1);

      if (userProgress.length === 0) {
        const [newProgress] = await db
          .insert(userOnboarding)
          .values({
            userId,
            currentStep: 0,
            completedSteps: [],
            totalPoints: 0,
            startedAt: new Date(),
          })
          .returning();
        userProgress = [newProgress];
      }

      const progress = userProgress[0];
      const completedSteps = (progress.completedSteps as string[]) || [];
      const completedCount = completedSteps.length;
      const totalSteps = tasks.length;
      const completionPercentage = totalSteps > 0 ? Math.round((completedCount / totalSteps) * 100) : 0;

      const tasksWithStatus: OnboardingTaskWithStatus[] = tasks.map(task => ({
        id: task.id,
        name: task.name,
        description: task.description,
        category: task.category,
        points: task.points || 0,
        order: task.order || 0,
        isRequired: task.isRequired || false,
        actionUrl: task.actionUrl,
        icon: task.icon,
        completed: completedSteps.includes(task.id),
      }));

      const recommendedNextStep = await this.getRecommendedNextStep(userId, tasksWithStatus);

      return {
        userId,
        currentStep: progress.currentStep || 0,
        totalSteps,
        completionPercentage,
        completedSteps,
        totalPoints: progress.totalPoints || 0,
        dayStreak: progress.dayStreak || 0,
        startedAt: progress.startedAt,
        completedAt: progress.completedAt,
        skippedAt: progress.skippedAt,
        tasks: tasksWithStatus,
        recommendedNextStep,
      };
    } catch (error) {
      logger.error('Error getting onboarding progress:', error);
      throw new Error('Failed to get onboarding progress');
    }
  }

  async completeStep(userId: string, stepId: string): Promise<{
    success: boolean;
    pointsAwarded: number;
    totalPoints: number;
    allCompleted: boolean;
    message: string;
  }> {
    try {
      const task = await db
        .select()
        .from(onboardingTasks)
        .where(eq(onboardingTasks.id, stepId))
        .limit(1);

      if (task.length === 0) {
        return {
          success: false,
          pointsAwarded: 0,
          totalPoints: 0,
          allCompleted: false,
          message: 'Task not found',
        };
      }

      let userProgress = await db
        .select()
        .from(userOnboarding)
        .where(eq(userOnboarding.userId, userId))
        .limit(1);

      if (userProgress.length === 0) {
        const [newProgress] = await db
          .insert(userOnboarding)
          .values({
            userId,
            currentStep: 0,
            completedSteps: [],
            totalPoints: 0,
            startedAt: new Date(),
          })
          .returning();
        userProgress = [newProgress];
      }

      const progress = userProgress[0];
      const completedSteps = (progress.completedSteps as string[]) || [];

      if (completedSteps.includes(stepId)) {
        return {
          success: true,
          pointsAwarded: 0,
          totalPoints: progress.totalPoints || 0,
          allCompleted: false,
          message: 'Step already completed',
        };
      }

      const pointsAwarded = task[0].points || 0;
      const newCompletedSteps = [...completedSteps, stepId];
      const newTotalPoints = (progress.totalPoints || 0) + pointsAwarded;

      const allTasks = await db.select().from(onboardingTasks);
      const allCompleted = allTasks.every(t => newCompletedSteps.includes(t.id));

      const today = new Date();
      const lastActivity = progress.lastActivityAt;
      let newDayStreak = progress.dayStreak || 0;

      if (lastActivity) {
        const daysDiff = Math.floor((today.getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff === 1) {
          newDayStreak++;
        } else if (daysDiff > 1) {
          newDayStreak = 1;
        }
      } else {
        newDayStreak = 1;
      }

      await db
        .update(userOnboarding)
        .set({
          completedSteps: newCompletedSteps,
          totalPoints: newTotalPoints,
          currentStep: newCompletedSteps.length,
          dayStreak: newDayStreak,
          lastActivityAt: today,
          completedAt: allCompleted ? today : null,
          updatedAt: today,
        })
        .where(eq(userOnboarding.userId, userId));

      if (allCompleted) {
        await db
          .update(users)
          .set({
            onboardingCompleted: true,
            onboardingStep: newCompletedSteps.length,
          })
          .where(eq(users.id, userId));
      }

      return {
        success: true,
        pointsAwarded,
        totalPoints: newTotalPoints,
        allCompleted,
        message: allCompleted
          ? 'Congratulations! You completed all onboarding tasks!'
          : `Task completed! +${pointsAwarded} points`,
      };
    } catch (error) {
      logger.error('Error completing onboarding step:', error);
      throw new Error('Failed to complete step');
    }
  }

  async skipOnboarding(userId: string): Promise<{ success: boolean; message: string }> {
    try {
      const existing = await db
        .select()
        .from(userOnboarding)
        .where(eq(userOnboarding.userId, userId))
        .limit(1);

      if (existing.length === 0) {
        await db.insert(userOnboarding).values({
          userId,
          currentStep: 0,
          completedSteps: [],
          totalPoints: 0,
          startedAt: new Date(),
          skippedAt: new Date(),
        });
      } else {
        await db
          .update(userOnboarding)
          .set({
            skippedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(userOnboarding.userId, userId));
      }

      await db
        .update(users)
        .set({
          onboardingCompleted: true,
        })
        .where(eq(users.id, userId));

      return {
        success: true,
        message: 'Onboarding skipped. You can always complete tasks later!',
      };
    } catch (error) {
      logger.error('Error skipping onboarding:', error);
      throw new Error('Failed to skip onboarding');
    }
  }

  async getRecommendedNextStep(
    userId: string,
    tasksWithStatus?: OnboardingTaskWithStatus[]
  ): Promise<OnboardingTaskWithStatus | null> {
    try {
      let tasks = tasksWithStatus;

      if (!tasks) {
        const allTasks = await db
          .select()
          .from(onboardingTasks)
          .orderBy(asc(onboardingTasks.order));

        const userProgress = await db
          .select()
          .from(userOnboarding)
          .where(eq(userOnboarding.userId, userId))
          .limit(1);

        const completedSteps = (userProgress[0]?.completedSteps as string[]) || [];

        tasks = allTasks.map(task => ({
          id: task.id,
          name: task.name,
          description: task.description,
          category: task.category,
          points: task.points || 0,
          order: task.order || 0,
          isRequired: task.isRequired || false,
          actionUrl: task.actionUrl,
          icon: task.icon,
          completed: completedSteps.includes(task.id),
        }));
      }

      const incompleteTasks = tasks.filter(t => !t.completed);

      if (incompleteTasks.length === 0) {
        return null;
      }

      const requiredTasks = incompleteTasks.filter(t => t.isRequired);
      if (requiredTasks.length > 0) {
        return requiredTasks.sort((a, b) => a.order - b.order)[0];
      }

      const categoryPriority: Record<string, number> = {
        'Profile Setup': 1,
        'First Release': 2,
        'Connect Socials': 3,
        'Explore Features': 4,
      };

      const sortedByPriorityAndPoints = incompleteTasks.sort((a, b) => {
        const priorityA = categoryPriority[a.category] || 99;
        const priorityB = categoryPriority[b.category] || 99;
        if (priorityA !== priorityB) return priorityA - priorityB;
        if (b.points !== a.points) return b.points - a.points;
        return a.order - b.order;
      });

      return sortedByPriorityAndPoints[0] || null;
    } catch (error) {
      logger.error('Error getting recommended next step:', error);
      return null;
    }
  }

  async getTasks(): Promise<OnboardingTaskWithStatus[]> {
    try {
      const tasks = await db
        .select()
        .from(onboardingTasks)
        .orderBy(asc(onboardingTasks.order));

      return tasks.map(task => ({
        id: task.id,
        name: task.name,
        description: task.description,
        category: task.category,
        points: task.points || 0,
        order: task.order || 0,
        isRequired: task.isRequired || false,
        actionUrl: task.actionUrl,
        icon: task.icon,
        completed: false,
      }));
    } catch (error) {
      logger.error('Error getting onboarding tasks:', error);
      throw new Error('Failed to get tasks');
    }
  }

  async seedDefaultTasks(): Promise<void> {
    try {
      const existingTasks = await db.select().from(onboardingTasks);
      if (existingTasks.length > 0) {
        logger.info('Onboarding tasks already seeded, skipping...');
        return;
      }

      const defaultTasks = [
        {
          name: 'Complete your profile',
          description: 'Add your bio, profile picture, and social links to let fans know who you are',
          category: 'Profile Setup',
          points: 50,
          order: 1,
          isRequired: true,
          actionUrl: '/settings',
          icon: 'User',
        },
        {
          name: 'Upload first track',
          description: 'Upload your first music track to the studio and start creating',
          category: 'First Release',
          points: 100,
          order: 2,
          isRequired: true,
          actionUrl: '/studio',
          icon: 'Music',
        },
        {
          name: 'Connect a social account',
          description: 'Link your Instagram, TikTok, or Twitter to enable automated posting',
          category: 'Connect Socials',
          points: 75,
          order: 3,
          isRequired: false,
          actionUrl: '/social-media',
          icon: 'Share2',
        },
        {
          name: 'Set up your beat store',
          description: 'Configure your storefront to start selling beats and licenses',
          category: 'First Release',
          points: 100,
          order: 4,
          isRequired: false,
          actionUrl: '/storefront',
          icon: 'ShoppingBag',
        },
        {
          name: 'Schedule first post',
          description: 'Create and schedule your first social media post using AI',
          category: 'Connect Socials',
          points: 75,
          order: 5,
          isRequired: false,
          actionUrl: '/social-media',
          icon: 'Calendar',
        },
        {
          name: 'Explore analytics',
          description: 'Check out your analytics dashboard to understand your audience',
          category: 'Explore Features',
          points: 50,
          order: 6,
          isRequired: false,
          actionUrl: '/analytics',
          icon: 'BarChart3',
        },
        {
          name: 'Invite a collaborator',
          description: 'Invite a fellow artist or collaborator to work on projects together',
          category: 'Explore Features',
          points: 100,
          order: 7,
          isRequired: false,
          actionUrl: '/settings',
          icon: 'UserPlus',
        },
      ];

      await db.insert(onboardingTasks).values(defaultTasks);
      logger.info(`Seeded ${defaultTasks.length} default onboarding tasks`);
    } catch (error) {
      logger.error('Error seeding onboarding tasks:', error);
      throw new Error('Failed to seed onboarding tasks');
    }
  }
}

export const onboardingService = new OnboardingService();
