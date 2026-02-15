import { Router } from "express";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/errorHandler";
import { releaseCountdownService } from "../services/releaseCountdownService";
import { logger } from "../logger";
import { z } from "zod";

const router = Router();

const createCountdownSchema = z.object({
  title: z.string().min(1, "Title is required"),
  releaseDate: z.string().transform((val) => new Date(val)),
  releaseId: z.string().optional(),
  artworkUrl: z.string().optional(),
  presaveUrl: z.string().optional(),
});

const addTaskSchema = z.object({
  task: z.string().min(1, "Task description is required"),
  dueDate: z.string().transform((val) => new Date(val)).optional(),
  category: z.string().optional(),
});

const updateTaskSchema = z.object({
  completed: z.boolean().optional(),
  task: z.string().optional(),
  dueDate: z.string().transform((val) => new Date(val)).optional(),
});

router.get("/", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const { status } = req.query;

  logger.info(`Fetching countdowns for user ${userId}`);

  let countdowns;
  if (status === "active") {
    countdowns = await releaseCountdownService.getActiveCountdowns(userId);
  } else {
    countdowns = await releaseCountdownService.getAllCountdowns(userId);
  }

  const countdownsWithProgress = await Promise.all(
    countdowns.map(async (countdown) => {
      const tasks = await releaseCountdownService.getTasks(countdown.id);
      const progress = releaseCountdownService.calculateProgress(tasks);
      const timeRemaining = releaseCountdownService.calculateTimeRemaining(new Date(countdown.releaseDate));

      return {
        ...countdown,
        progress,
        timeRemaining,
        taskCount: tasks.length,
      };
    })
  );

  res.json({
    success: true,
    data: countdownsWithProgress,
  });
}));

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const data = createCountdownSchema.parse(req.body);

  logger.info(`Creating countdown for user ${userId}: ${data.title}`);

  const countdown = await releaseCountdownService.createCountdown(userId, data);
  const tasks = await releaseCountdownService.getTasks(countdown.id);

  res.status(201).json({
    success: true,
    data: {
      countdown,
      tasks,
    },
  });
}));

router.get("/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const countdownId = req.params.id;

  logger.info(`Fetching countdown ${countdownId} for user ${userId}`);

  const result = await releaseCountdownService.getCountdownWithTasks(countdownId, userId);

  if (!result) {
    return res.status(404).json({
      success: false,
      message: "Countdown not found",
    });
  }

  const progress = releaseCountdownService.calculateProgress(result.tasks);
  const timeRemaining = releaseCountdownService.calculateTimeRemaining(new Date(result.countdown.releaseDate));
  const analytics = await releaseCountdownService.getAnalyticsSummary(countdownId);

  res.json({
    success: true,
    data: {
      ...result.countdown,
      tasks: result.tasks,
      progress,
      timeRemaining,
      analytics,
    },
  });
}));

router.patch("/:id", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.id;
  const countdownId = req.params.id;

  logger.info(`Updating countdown ${countdownId} for user ${userId}`);

  const countdown = await releaseCountdownService.updateCountdown(countdownId, userId, req.body);

  res.json({
    success: true,
    data: countdown,
  });
}));

router.post("/:id/tasks", requireAuth, asyncHandler(async (req, res) => {
  const countdownId = req.params.id;
  const data = addTaskSchema.parse(req.body);

  logger.info(`Adding task to countdown ${countdownId}`);

  const task = await releaseCountdownService.addTask(countdownId, data);

  res.status(201).json({
    success: true,
    data: task,
  });
}));

router.get("/:id/tasks", requireAuth, asyncHandler(async (req, res) => {
  const countdownId = req.params.id;

  logger.info(`Fetching tasks for countdown ${countdownId}`);

  const tasks = await releaseCountdownService.getTasks(countdownId);
  const progress = releaseCountdownService.calculateProgress(tasks);

  res.json({
    success: true,
    data: tasks,
    meta: {
      progress,
    },
  });
}));

router.patch("/:id/tasks/:taskId", requireAuth, asyncHandler(async (req, res) => {
  const countdownId = req.params.id;
  const taskId = req.params.taskId;
  const data = updateTaskSchema.parse(req.body);

  logger.info(`Updating task ${taskId} for countdown ${countdownId}`);

  let task;
  if (data.completed !== undefined) {
    if (data.completed) {
      task = await releaseCountdownService.completeTask(countdownId, taskId);
    } else {
      task = await releaseCountdownService.uncompleteTask(countdownId, taskId);
    }
  } else {
    task = await releaseCountdownService.completeTask(countdownId, taskId);
  }

  res.json({
    success: true,
    data: task,
  });
}));

router.get("/:id/analytics", requireAuth, asyncHandler(async (req, res) => {
  const countdownId = req.params.id;

  logger.info(`Fetching analytics for countdown ${countdownId}`);

  const analytics = await releaseCountdownService.getAnalyticsSummary(countdownId);

  res.json({
    success: true,
    data: analytics,
  });
}));

router.post("/:id/analytics/track", requireAuth, asyncHandler(async (req, res) => {
  const countdownId = req.params.id;
  const { presaves, shares, pageViews } = req.body;

  logger.info(`Recording analytics for countdown ${countdownId}`);

  const analytics = await releaseCountdownService.recordAnalytics(countdownId, {
    presaves,
    shares,
    pageViews,
  });

  res.json({
    success: true,
    data: analytics,
  });
}));

router.post("/:id/generate-checklist", requireAuth, asyncHandler(async (req, res) => {
  const countdownId = req.params.id;
  const { genre, targetAudience } = req.body;

  logger.info(`Generating AI checklist for countdown ${countdownId}`);

  const tasks = await releaseCountdownService.generateAISuggestedTasks(countdownId, genre, targetAudience);
  const addedTasks = await releaseCountdownService.bulkAddTasks(countdownId, tasks);

  res.json({
    success: true,
    data: addedTasks,
  });
}));

export default router;
