import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { releaseCountdownService } from "../services/releaseCountdownService";
import { logger } from "../logger";
import { z } from "zod";

const router = Router();

const validDateTime = (value: string) => Number.isFinite(Date.parse(value));

const createCountdownSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(500),
  releaseDate: z
    .string()
    .refine(validDateTime, "Release date must be a valid date and time")
    .transform((val) => new Date(val)),
  releaseId: z.string().optional(),
  artworkUrl: z.string().url().max(2000).optional(),
  presaveUrl: z.string().url().max(2000).optional(),
});

const updateCountdownSchema = z
  .object({
    title: z.string().trim().min(1).max(500).optional(),
    releaseDate: z
      .string()
      .refine(validDateTime, "Release date must be a valid date and time")
      .transform((val) => new Date(val))
      .optional(),
    artworkUrl: z.string().url().max(2000).nullable().optional(),
    presaveUrl: z.string().url().max(2000).nullable().optional(),
  })
  .strict();

const addTaskSchema = z.object({
  task: z.string().trim().min(1, "Task description is required").max(1_000),
  dueDate: z
    .string()
    .refine(validDateTime, "Due date must be a valid date and time")
    .transform((val) => new Date(val))
    .optional(),
  category: z.string().trim().max(100).optional(),
});

const updateTaskSchema = z.object({
  completed: z.boolean(),
});

const analyticsSchema = z
  .object({
    presaves: z.number().int().min(0).max(1_000_000).optional(),
    shares: z.number().int().min(0).max(1_000_000).optional(),
    pageViews: z.number().int().min(0).max(1_000_000).optional(),
  })
  .refine(
    (data) =>
      data.presaves !== undefined ||
      data.shares !== undefined ||
      data.pageViews !== undefined,
    "At least one analytics value is required",
  );

router.get(
  "/",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    try {
      const userId = req.user!.id;
      const { status } = req.query;

      logger.info(`Fetching countdowns for user ${userId}`);

      let countdowns;
      if (status === "active") {
        countdowns = await releaseCountdownService?.getActiveCountdowns(userId);
      } else {
        countdowns = await releaseCountdownService?.getAllCountdowns(userId);
      }

      const countdownIds = countdowns?.map((c) => c?.id);
      const tasksByCountdown =
        await releaseCountdownService?.getTasksForCountdowns(countdownIds);

      const countdownsWithProgress = countdowns?.map((countdown) => {
        const tasks = tasksByCountdown?.get(countdown?.id) ?? [];
        const progress = releaseCountdownService?.calculateProgress(tasks);
        const timeRemaining = releaseCountdownService?.calculateTimeRemaining(
          new Date(countdown?.releaseDate),
        );

        return {
          ...countdown,
          progress,
          timeRemaining,
          taskCount: tasks.length,
        };
      });

      res.json({
        success: true,
        data: countdownsWithProgress,
      });
    } catch (error) {
      logger.warn("Error in get countdowns:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.post(
  "/",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    try {
      const userId = req.user!.id;
      const parsed = createCountdownSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          details: parsed.error.flatten(),
        });
      }
      const data = parsed.data;

      logger.info(`Creating countdown for user ${userId}: ${data?.title}`);

      const countdown = await releaseCountdownService?.createCountdown(
        userId,
        data,
      );
      const tasks = await releaseCountdownService?.getTasks(countdown?.id);

      res.status(201).json({
        success: true,
        data: {
          countdown,
          tasks,
        },
      });
    } catch (error) {
      logger.warn("Error in create countdown:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    try {
      const userId = req.user!.id;
      const countdownId = req.params.id;

      logger.info(`Fetching countdown ${countdownId} for user ${userId}`);

      const result = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );

      if (!result) {
        return res.status(404).json({
          success: false,
          message: "Countdown not found",
        });
      }

      const progress = releaseCountdownService?.calculateProgress(result?.tasks);
      const timeRemaining = releaseCountdownService?.calculateTimeRemaining(
        new Date(result?.countdown.releaseDate),
      );
      const analytics =
        await releaseCountdownService?.getAnalyticsSummary(countdownId);

      res.json({
        success: true,
        data: {
          ...result?.countdown,
          tasks: result.tasks,
          progress,
          timeRemaining,
          analytics,
        },
      });
    } catch (error) {
      logger.warn("Error in get countdown by id:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    try {
      const userId = req.user!.id;
      const countdownId = req.params.id;

      logger.info(`Updating countdown ${countdownId} for user ${userId}`);

      const parsed = updateCountdownSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          details: parsed.error.flatten(),
        });
      }

      const countdown = await releaseCountdownService?.updateCountdown(
        countdownId,
        userId,
        parsed.data,
      );
      if (!countdown) {
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });
      }

      res.json({
        success: true,
        data: countdown,
      });
    } catch (error) {
      logger.warn("Error in update countdown:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.post(
  "/:id/tasks",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    try {
      const userId = req.user!.id;
      const countdownId = req.params.id;
      const ownership = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );
      if (!ownership)
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });
      const parsed = addTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          details: parsed.error.flatten(),
        });
      }
      const data = parsed.data;

      logger.info(`Adding task to countdown ${countdownId}`);

      const task = await releaseCountdownService?.addTask(countdownId, data);

      res.status(201).json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger.warn("Error in add task:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.get(
  "/:id/tasks",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    try {
      const userId = req.user!.id;
      const countdownId = req.params.id;
      const ownership = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );
      if (!ownership)
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });

      logger.info(`Fetching tasks for countdown ${countdownId}`);

      const tasks = await releaseCountdownService?.getTasks(countdownId);
      const progress = releaseCountdownService?.calculateProgress(tasks);

      res.json({
        success: true,
        data: tasks,
        meta: {
          progress,
        },
      });
    } catch (error) {
      logger.warn("Error in get tasks:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.patch(
  "/:id/tasks/:taskId",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    try {
      const userId = req.user!.id;
      const countdownId = req.params.id;
      const taskId = req.params.taskId;
      const ownership = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );
      if (!ownership)
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });
      const parsed = updateTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          details: parsed.error.flatten(),
        });
      }
      const data = parsed.data;

      logger.info(`Updating task ${taskId} for countdown ${countdownId}`);

      let task;
      if (data.completed) {
        task = await releaseCountdownService?.completeTask(
          countdownId,
          taskId,
        );
      } else {
        task = await releaseCountdownService?.uncompleteTask(
          countdownId,
          taskId,
        );
      }

      res.json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger.warn("Error in update task:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.get(
  "/:id/analytics",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    try {
      const userId = req.user!.id;
      const countdownId = req.params.id;
      const ownership = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );
      if (!ownership)
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });

      logger.info(`Fetching analytics for countdown ${countdownId}`);

      const analytics =
        await releaseCountdownService?.getAnalyticsSummary(countdownId);

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger.warn("Error in get analytics:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.post(
  "/:id/analytics/track",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    try {
      const userId = req.user!.id;
      const countdownId = req.params.id;
      const ownership = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );
      if (!ownership)
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });
      const parsed = analyticsSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: "Validation error",
          details: parsed.error.flatten(),
        });
      }

      logger.info(`Recording analytics for countdown ${countdownId}`);

      const analytics = await releaseCountdownService?.recordAnalytics(
        countdownId,
        parsed.data,
      );

      res.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger.warn("Error in track analytics:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router.post(
  "/:id/generate-checklist",
  requireAuth,
  asyncHandler(async (req: any, res: any) => {
    try {
      const userId = req.user!.id;
      const countdownId = req.params.id;
      const ownership = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );
      if (!ownership)
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });
      const { genre, targetAudience } = req.body;

      logger.info(`Generating AI checklist for countdown ${countdownId}`);

      const tasks = await releaseCountdownService?.generateAISuggestedTasks(
        countdownId,
        genre,
        targetAudience,
      );
      const addedTasks = await releaseCountdownService?.bulkAddTasks(
        countdownId,
        tasks,
      );

      res.json({
        success: true,
        data: addedTasks,
      });
    } catch (error) {
      logger.warn("Error in generate checklist:", (error as any)?.message);
      res.status(500).json({ error: "Failed to process request" });
    }
  }),
);

export default router;
