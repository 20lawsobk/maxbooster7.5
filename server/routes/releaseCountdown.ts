import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { releaseCountdownService } from "../services/releaseCountdownService";
import { logger } from "../logger";
import { z } from "zod";

const _router = Router();

const _createCountdownSchema = z?.object({
  title: z?.string().min(1, "Title is required"),
  releaseDate: z?.string().transform((val) => new Date(val)),
  releaseId: z?.string().optional(),
  artworkUrl: z?.string().optional(),
  presaveUrl: z?.string().optional(),
});

const _addTaskSchema = z?.object({
  task: z?.string().min(1, "Task description is required"),
  dueDate: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
  category: z?.string().optional(),
});

const _updateTaskSchema = z?.object({
  completed: z?.boolean().optional(),
  task: z?.string().optional(),
  dueDate: z
    .string()
    .transform((val) => new Date(val))
    .optional(),
});

router?.get(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const _userId = req?.user!.id;
      const { status } = req?.query;

      logger?.info(`Fetching countdowns for user ${userId}`);

      let countdowns;
      if (status === "active") {
        countdowns = await releaseCountdownService?.getActiveCountdowns(userId);
      } else {
        countdowns = await releaseCountdownService?.getAllCountdowns(userId);
      }

      const _countdownIds = countdowns?.map((c) => c?.id);
      const _tasksByCountdown =
        await releaseCountdownService?.getTasksForCountdowns(countdownIds);

      const _countdownsWithProgress = countdowns?.map((countdown) => {
        const _tasks = tasksByCountdown?.get(countdown?.id) ?? [];
        const _progress = releaseCountdownService?.calculateProgress(tasks);
        const _timeRemaining = releaseCountdownService?.calculateTimeRemaining(
          new Date(countdown?.releaseDate),
        );

        return {
          ...countdown,
          progress,
          timeRemaining,
          taskCount: tasks?.length,
        };
      });

      res?.json({
        success: true,
        data: countdownsWithProgress,
      });
    } catch (error) {
      logger?.warn("Error in get countdowns:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.post(
  "/",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const _userId = req?.user!.id;
      const _data = createCountdownSchema?.parse(req?.body);

      logger?.info(`Creating countdown for user ${userId}: ${data?.title}`);

      const _countdown = await releaseCountdownService?.createCountdown(
        userId,
        data,
      );
      const _tasks = await releaseCountdownService?.getTasks(countdown?.id);

      res?.status(201).json({
        success: true,
        data: {
          countdown,
          tasks,
        },
      });
    } catch (error) {
      logger?.warn("Error in create countdown:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.get(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const _userId = req?.user!.id;
      const _countdownId = req?.params.id;

      logger?.info(`Fetching countdown ${countdownId} for user ${userId}`);

      const _result = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );

      if (!result) {
        return res?.status(404).json({
          success: false,
          message: "Countdown not found",
        });
      }

      const _progress = releaseCountdownService?.calculateProgress(result?.tasks);
      const _timeRemaining = releaseCountdownService?.calculateTimeRemaining(
        new Date(result?.countdown.releaseDate),
      );
      const _analytics =
        await releaseCountdownService?.getAnalyticsSummary(countdownId);

      res?.json({
        success: true,
        data: {
          ...result?.countdown,
          tasks: result?.tasks,
          progress,
          timeRemaining,
          analytics,
        },
      });
    } catch (error) {
      logger?.warn("Error in get countdown by id:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.patch(
  "/:id",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const _userId = req?.user!.id;
      const _countdownId = req?.params.id;

      logger?.info(`Updating countdown ${countdownId} for user ${userId}`);

      const _countdown = await releaseCountdownService?.updateCountdown(
        countdownId,
        userId,
        req?.body,
      );

      res?.json({
        success: true,
        data: countdown,
      });
    } catch (error) {
      logger?.warn("Error in update countdown:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.post(
  "/:id/tasks",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const _userId = req?.user!.id;
      const _countdownId = req?.params.id;
      const _ownership = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );
      if (!ownership)
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });
      const _data = addTaskSchema?.parse(req?.body);

      logger?.info(`Adding task to countdown ${countdownId}`);

      const _task = await releaseCountdownService?.addTask(countdownId, data);

      res?.status(201).json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger?.warn("Error in add task:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.get(
  "/:id/tasks",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const _userId = req?.user!.id;
      const _countdownId = req?.params.id;
      const _ownership = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );
      if (!ownership)
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });

      logger?.info(`Fetching tasks for countdown ${countdownId}`);

      const _tasks = await releaseCountdownService?.getTasks(countdownId);
      const _progress = releaseCountdownService?.calculateProgress(tasks);

      res?.json({
        success: true,
        data: tasks,
        meta: {
          progress,
        },
      });
    } catch (error) {
      logger?.warn("Error in get tasks:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.patch(
  "/:id/tasks/:taskId",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const _userId = req?.user!.id;
      const _countdownId = req?.params.id;
      const _taskId = req?.params.taskId;
      const _ownership = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );
      if (!ownership)
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });
      const _data = updateTaskSchema?.parse(req?.body);

      logger?.info(`Updating task ${taskId} for countdown ${countdownId}`);

      let task;
      if (data?.completed !== undefined) {
        if (data?.completed) {
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
      } else {
        task = await releaseCountdownService?.completeTask(countdownId, taskId);
      }

      res?.json({
        success: true,
        data: task,
      });
    } catch (error) {
      logger?.warn("Error in update task:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.get(
  "/:id/analytics",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const _userId = req?.user!.id;
      const _countdownId = req?.params.id;
      const _ownership = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );
      if (!ownership)
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });

      logger?.info(`Fetching analytics for countdown ${countdownId}`);

      const _analytics =
        await releaseCountdownService?.getAnalyticsSummary(countdownId);

      res?.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger?.warn("Error in get analytics:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.post(
  "/:id/analytics/track",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const _userId = req?.user!.id;
      const _countdownId = req?.params.id;
      const _ownership = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );
      if (!ownership)
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });
      const { presaves, shares, pageViews } = req?.body;

      logger?.info(`Recording analytics for countdown ${countdownId}`);

      const _analytics = await releaseCountdownService?.recordAnalytics(
        countdownId,
        {
          presaves,
          shares,
          pageViews,
        },
      );

      res?.json({
        success: true,
        data: analytics,
      });
    } catch (error) {
      logger?.warn("Error in track analytics:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

router?.post(
  "/:id/generate-checklist",
  requireAuth,
  asyncHandler(async (req, res) => {
    try {
      const _userId = req?.user!.id;
      const _countdownId = req?.params.id;
      const _ownership = await releaseCountdownService?.getCountdownWithTasks(
        countdownId,
        userId,
      );
      if (!ownership)
        return res
          .status(404)
          .json({ success: false, message: "Countdown not found" });
      const { genre, targetAudience } = req?.body;

      logger?.info(`Generating AI checklist for countdown ${countdownId}`);

      const _tasks = await releaseCountdownService?.generateAISuggestedTasks(
        countdownId,
        genre,
        targetAudience,
      );
      const _addedTasks = await releaseCountdownService?.bulkAddTasks(
        countdownId,
        tasks,
      );

      res?.json({
        success: true,
        data: addedTasks,
      });
    } catch (error) {
      logger?.warn("Error in generate checklist:", error?.message);
      res?.status(500).json({ error: "Failed to process request" });
    }
  }),
);

export default router;
