import { EventEmitter } from "events";
import { promisify } from "util";
import { exec } from "child_process";
import { randomUUID } from "crypto";
import cron, { type ScheduledTask } from "./lib/cronScheduler.js";
import { logger } from "./logger.js";

promisify(exec);

// Lazy service loaders — avoid circular imports at module load time.
async function loadNotificationService() {
  const m = await import("./services/notificationService.js");
  return (
    (m as Record<string, unknown>).notificationService ??
    (m as Record<string, unknown>).default
  );
}
async function loadDistributionService() {
  const m = await import("./services/distributionService.js");
  return (
    (m as Record<string, unknown>).distributionService ??
    (m as Record<string, unknown>).default
  );
}
async function loadAutoPostingService() {
  try {
    const m = await import("./services/autoPostingServiceV2.js");
    return (
      (m as Record<string, unknown>).autoPostingServiceV2 ??
      (m as Record<string, unknown>).default
    );
  } catch {
    const m = await import("./services/autoPostingService.js");
    return (
      (m as Record<string, unknown>).autoPostingService ??
      (m as Record<string, unknown>).default
    );
  }
}
async function loadStorage() {
  const m = await import("./storage.js");
  return (m as Record<string, unknown>).storage;
}

// Comprehensive Automation System
export class AutomationSystem extends EventEmitter {
  private static instance: AutomationSystem;
  private workflows: Map<string, Workflow> = new Map();
  private triggers: Map<string, Trigger> = new Map();
  private actions: Map<string, Action> = new Map();
  private conditions: Map<string, Condition> = new Map();
  private automationMetrics: AutomationMetrics;
  private webhookHandlers: Map<
    string,
    Array<{ callback: Function; secret?: string }>
  > = new Map();

  /**
   * Public dispatcher invoked by the webhook HTTP route.
   * Returns the number of handlers fired (0 if no workflow listens on this id).
   */
  public async dispatchWebhook(
    webhookId: string,
    payload: unknown,
    headers: Record<string, string> = {},
  ): Promise<number> {
    const list = this.webhookHandlers.get(webhookId);
    if (!list || list?.length === 0) return 0;
    let fired = 0;
    for (const h of list) {
      try {
        await h?.callback({ webhookId, payload, headers });
        fired += 1;
      } catch (err: unknown) {
        logger.warn({ err, webhookId }, "[Automation] webhook handler threw");
      }
    }
    return fired;
  }

  private constructor() {
    super();
    this.automationMetrics = {
      totalWorkflows: 0,
      activeWorkflows: 0,
      completedWorkflows: 0,
      failedWorkflows: 0,
      totalExecutions: 0,
      averageExecutionTime: 0,
      successRate: 0,
      lastExecution: Date.now(),
      automationScore: 0,
    };

    this.initializeSystem();
  }

  public static getInstance(): AutomationSystem {
    if (!AutomationSystem?.instance) {
      AutomationSystem.instance = new AutomationSystem();
    }
    return AutomationSystem?.instance;
  }

  // Initialize automation system
  private async initializeSystem(): Promise<void> {
    try {
      // Register built-in actions
      this.registerBuiltInActions();

      // Register built-in conditions
      this.registerBuiltInConditions();

      // Register built-in triggers
      this.registerBuiltInTriggers();

      // Load saved workflows
      await this.loadWorkflows();

      // Start automation engine
      this.startAutomationEngine();

      logger.info("🤖 Automation system initialized");
    } catch (error: unknown) {
      logger.warn({ err: error }, "❌ Failed to initialize automation system:");
    }
  }

  // Register built-in actions
  private registerBuiltInActions(): void {
    // Email actions — routed through notificationService?.sendEmail
    this.registerAction("send-email", {
      name: "Send Email",
      description: "Send email notification",
      parameters: ["to", "userId", "subject", "body", "template", "link"],
      execute: async (params) => {
        logger.info(
          `📧 Sending email to ${params?.to ?? params?.userId}: ${params?.subject}`,
        );
        try {
          const notif = await loadNotificationService();
          if (!notif) throw new Error("notificationService unavailable");
          // notificationService is user-centric; resolve user when only an
          // address is supplied so we can hit its public sendEmail flow.
          let userId =
            typeof params?.userId === "string" ? params.userId : undefined;
          if (!userId && params?.to) {
            const storage = await loadStorage();
            const u = await (storage as any)?.getUserByEmail?.(params?.to);
            userId = u?.id;
          }
          if (!userId) throw new Error("no userId resolvable for email");
          if (typeof (notif as any)?.send !== "function") {
            throw new Error("notificationService.send unavailable");
          }
          const outcome = await (notif as any)?.send({
            userId,
            type: params.template || "system",
            title: params.subject,
            message: params.body,
            link: params.link,
          });
          // notificationService.send() now reports which channels actually
          // fired. This action specifically claims to send an EMAIL, so
          // success must require the email channel itself to have gone out —
          // a persisted in-app notification (or a no-op for an unknown user)
          // is not the same thing and must not be reported as "email sent".
          if (!outcome?.emailSent) {
            const reason =
              outcome?.reason ??
              (outcome?.delivered
                ? "email channel disabled by user preference or provider not configured"
                : "notification was not delivered");
            return {
              success: false,
              message: `Email not sent: ${reason}`,
            };
          }
          return { success: true, message: "Email sent successfully" };
        } catch (e) {
          logger.warn({ err: e }, "send-email action failed");
          return { success: false, message: (e as Error).message ?? "send-email failed" };
        }
      },
    });

    // Social media actions — routed through autoPostingService(V2)
    this.registerAction("post-social-media", {
      name: "Post to Social Media",
      description: "Post content to social media platforms",
      parameters: ["userId", "platforms", "content", "media", "schedule"],
      execute: async (params) => {
        const platforms = Array.isArray(params?.platforms)
          ? params?.platforms
          : [params?.platforms];
        logger.info(`📱 Posting to social media: ${platforms?.join(", ")}`);
        try {
          const svc = await loadAutoPostingService();
          if ((!svc as any)?.schedulePost) {
            throw new Error("autoPostingService.schedulePost unavailable");
          }
          // autoPostingServiceV2?.schedulePost signature:
          //   (userId, platforms[], content: PostContent, scheduledTime: Date, ...)
          const text =
            typeof params?.content === "string"
              ? params?.content
              : ((params?.content as any)?.text ?? (params?.content as any)?.caption ?? "");
          const postContent = {
            text,
            hashtags: (params.content as any)?.hashtags,
            mediaUrl: params.media ?? (params?.content as any)?.mediaUrl,
            mediaType: (params.content as any)?.mediaType,
          };
          const scheduledTime = params?.schedule
            ? new Date(params?.schedule as any)
            : new Date();
          const r = await (svc as any)?.schedulePost(
            params?.userId,
            platforms,
            postContent,
            scheduledTime,
          );
          // schedulePost only queues a pending post for the platform poster
          // to pick up later — it does NOT post to any platform itself. A
          // confirmed queue record is a real, verifiable side effect, but
          // claiming "Posted to social media" overstates it; be explicit that
          // this is a scheduled/queued record, not a confirmed platform post.
          if (!r) {
            return {
              success: false,
              message: "post-social-media failed: schedulePost returned no record",
            };
          }
          return {
            success: true,
            message: "Post scheduled for social media (not yet confirmed live on any platform)",
            result: r,
          };
        } catch (e) {
          logger.warn({ err: e }, "post-social-media action failed");
          return {
            success: false,
            message: (e as Error).message ?? "post-social-media failed",
          };
        }
      },
    });

    // Distribution actions — routed through distributionService?.distributeRelease
    this.registerAction("distribute-music", {
      name: "Distribute Music",
      description: "Distribute music to streaming platforms",
      parameters: ["userId", "releaseId", "platforms", "metadata"],
      execute: async (params) => {
        const platforms = Array.isArray(params?.platforms)
          ? params?.platforms
          : [params?.platforms];
        logger.info(`🎵 Distributing music to ${platforms?.join(", ")}`);
        try {
          const dist = await loadDistributionService();
          if ((!dist as any)?.distributeRelease)
            throw new Error("distributionService unavailable");
          const r = await (dist as any)?.distributeRelease(
            params?.releaseId,
            params?.userId,
          );
          // distributeRelease now reports its own honest success (only true
          // when at least one provider actually accepted the submission) —
          // propagate that instead of assuming success whenever it resolves.
          if (!r?.success) {
            return {
              success: false,
              message: "Music distribution failed — no provider accepted the release",
              detail: r,
            };
          }
          return {
            success: true,
            message: "Music distribution dispatched",
            detail: r,
          };
        } catch (e) {
          logger.warn({ err: e }, "distribute-music action failed");
          return {
            success: false,
            message: (e as Error).message ?? "distribute-music failed",
          };
        }
      },
    });

    // Analytics actions — routed through analyticsReportService, which pulls
    // real revenue/streaming/royalty/beat data and (when recipients are
    // given) delivers via notificationService.
    this.registerAction("generate-analytics-report", {
      name: "Generate Analytics Report",
      description: "Generate and send analytics report",
      parameters: ["userId", "reportType", "recipients", "format", "schedule"],
      execute: async (params) => {
        logger.info(
          `📊 Generating analytics report (${params?.reportType ?? "full"}) for user ${params?.userId}`,
        );
        try {
          if (!params?.userId) {
            throw new Error("generate-analytics-report requires a userId");
          }
          const { generateAndDeliverAnalyticsReport } = await import(
            "./services/analyticsReportService.js"
          );
          const recipients = Array.isArray(params?.recipients)
            ? params.recipients
            : params?.recipients
              ? [params.recipients]
              : [];
          const report = await generateAndDeliverAnalyticsReport({
            userId: params.userId,
            reportType: params?.reportType,
            format: params?.format,
            recipients,
          });
          if (!report.success) {
            return {
              success: false,
              message: `generate-analytics-report failed: ${report.error ?? "unknown error"}`,
            };
          }
          const deliveryNote =
            recipients.length > 0
              ? report.delivered
                ? ` — delivered to ${report.deliveredCount}/${recipients.length} recipient(s)`
                : " — generated but delivery failed (no recipient received it)"
              : "";
          return {
            success: true,
            message: `Analytics report generated (${report.reportType}, ${report.format})${deliveryNote}`,
            result: {
              summary: report.summary,
              periodStart: report.periodStart,
              periodEnd: report.periodEnd,
              delivered: report.delivered,
            },
          };
        } catch (e) {
          logger.warn({ err: e }, "generate-analytics-report action failed");
          return {
            success: false,
            message: (e as Error).message ?? "generate-analytics-report failed",
          };
        }
      },
    });

    // AI actions
    // NOT IMPLEMENTED: no mixing engine is wired to this generic workflow
    // action. See studio.ts /ai-mix for the user-facing equivalent, which is
    // also honestly gated to "not implemented" until a real job pipeline exists.
    // AI Mix action — routed through the real auto-mix engine (role-based
    // per-track EQ + leveling compression via ffmpeg, same pipeline behind
    // POST /api/studio/ai-mix/:projectId). `trackId` is the studio project id.
    this.registerAction("ai-mix-track", {
      name: "AI Mix Track",
      description: "Use AI to mix and master track",
      parameters: ["trackId", "style", "quality"],
      execute: async (params) => {
        logger.info(`🎛️ Auto-mixing project ${params?.trackId}`);
        try {
          if (!params?.trackId) {
            throw new Error("ai-mix-track requires trackId (studio project id)");
          }
          const { renderProjectMixdown } = await import(
            "./services/studioRenderService.js"
          );
          const rendered = await renderProjectMixdown(params.trackId, {
            format: "wav",
            sampleRate: 44100,
            bitDepth: 24,
            applyAutoMix: true,
          });
          return {
            success: true,
            message: "Auto-mix complete",
            result: { downloadUrl: rendered.downloadPath },
          };
        } catch (e) {
          logger.warn({ err: e }, "ai-mix-track action failed");
          return {
            success: false,
            message: (e as Error).message ?? "ai-mix-track failed",
          };
        }
      },
    });

    // AI Master action — routed through the real mastering pipeline
    // (renderProjectMixdown + IntelligentMasteringEngine) that already backs
    // POST /api/studio/ai-master/:projectId. `trackId` here is the studio
    // project id — the generic automation param name predates that route.
    this.registerAction("ai-master-track", {
      name: "AI Master Track",
      description: "Use AI to master track",
      parameters: ["trackId", "targetLoudness", "format"],
      execute: async (params) => {
        logger.info(`🎚️ Mastering project ${params?.trackId}`);
        try {
          if (!params?.trackId) {
            throw new Error("ai-master-track requires trackId (studio project id)");
          }
          const { renderProjectMixdown } = await import(
            "./services/studioRenderService.js"
          );
          const rendered = await renderProjectMixdown(params.trackId, {
            format: params?.format || "wav",
            applyMastering: true,
            targetLufs:
              typeof params?.targetLoudness === "number"
                ? params.targetLoudness
                : -14,
          });
          return {
            success: true,
            message: `Mastering complete — genre=${rendered.mastering?.genre ?? "auto"}`,
            result: {
              downloadUrl: rendered.downloadPath,
              genre: rendered.mastering?.genre,
              confidence: rendered.mastering?.confidence,
            },
          };
        } catch (e) {
          logger.warn({ err: e }, "ai-master-track action failed");
          return {
            success: false,
            message: (e as Error).message ?? "ai-master-track failed",
          };
        }
      },
    });

    // Marketplace actions
    // NOT IMPLEMENTED: beats are uploaded/listed via the storefront upload
    // flow (server/routes) and the Beat Money Loop service, not this generic
    // action, which never reads the beat data or writes anything.
    this.registerAction("upload-beat", {
      name: "Upload Beat to Marketplace",
      description: "Upload beat to marketplace",
      parameters: ["beatData", "pricing", "licenses"],
      execute: async (_params) => {
        logger.warn(
          `🎶 upload-beat action invoked but is not implemented — no beat was uploaded or listed`,
        );
        return { success: false, message: "upload-beat is not implemented" };
      },
    });

    // Payment actions
    // NOT IMPLEMENTED: payments run through the Stripe integration/webhooks,
    // not this generic action, which never calls a payment processor or
    // persists any transaction/ledger record.
    this.registerAction("process-payment", {
      name: "Process Payment",
      description: "Process payment transaction",
      parameters: ["amount", "currency", "method", "recipient"],
      execute: async (params) => {
        logger.warn(
          `💳 process-payment action invoked for ${params?.amount} ${params?.currency} but is not implemented — no payment was processed`,
        );
        return { success: false, message: "process-payment is not implemented" };
      },
    });

    // Notification actions — routed through notificationService?.notify
    this.registerAction("send-notification", {
      name: "Send Notification",
      description: "Send push notification",
      parameters: ["title", "message", "recipients", "type", "link"],
      execute: async (params) => {
        logger.info(`🔔 Sending notification: ${params?.title}`);
        try {
          const notif = await loadNotificationService();
          if ((!notif as any)?.send)
            throw new Error("notificationService.send unavailable");
          const recipients: string[] = Array.isArray(params?.recipients)
            ? params?.recipients
            : [params?.recipients].filter(Boolean);
          // An empty recipient list means nothing was actually sent — this
          // must not be reported as a successful notification.
          if (recipients.length === 0) {
            return {
              success: false,
              message: "send-notification failed: no recipients specified",
              count: 0,
            };
          }
          let deliveredCount = 0;
          for (const userId of recipients) {
            const outcome = await (notif as any)?.send({
              userId,
              type: params.type ?? "system",
              title: params.title,
              message: params.message,
              link: params.link,
            });
            if (outcome?.delivered) deliveredCount++;
          }
          // Success requires at least one recipient to have actually
          // received the notification — every recipient silently failing
          // (e.g. all unknown user IDs) must not be reported as success.
          if (deliveredCount === 0) {
            return {
              success: false,
              message: "send-notification failed: no recipient could be notified",
              count: 0,
            };
          }
          return {
            success: true,
            message: `Notification delivered to ${deliveredCount}/${recipients.length} recipient(s)`,
            count: deliveredCount,
          };
        } catch (e) {
          logger.warn({ err: e }, "send-notification action failed");
          return {
            success: false,
            message: (e as Error).message ?? "send-notification failed",
          };
        }
      },
    });

    // Data actions — routed through databaseBackupService, the same
    // full-database backup engine backing the admin /api/backup routes.
    this.registerAction("backup-data", {
      name: "Backup Data",
      description: "Backup user data",
      parameters: ["userId", "dataType", "destination"],
      execute: async (params) => {
        logger.info(
          `💾 Running backup-data for user ${params?.userId} (${params?.dataType ?? "database"})`,
        );
        try {
          const { databaseBackupService } = await import(
            "./services/backup/databaseBackupService.js"
          );
          const backupFile = await databaseBackupService.createBackup();
          if (!backupFile) {
            return {
              success: false,
              message: "backup-data failed: createBackup returned no file",
            };
          }
          return {
            success: true,
            message: `Backup created: ${backupFile}`,
            result: { backupFile },
          };
        } catch (e) {
          logger.warn({ err: e }, "backup-data action failed");
          return {
            success: false,
            message: (e as Error).message ?? "backup-data failed",
          };
        }
      },
    });

    // Video creation actions — routed through videoGeneratorService
    // (Python NumPy frame engine + FFmpeg compositor), the same real render
    // pipeline behind the live video-generation endpoints. Awareness-layer
    // trend context is fetched once per action and passed through so scene
    // mood/copy reflects current trending genres/moods, not static defaults.
    this.registerAction("create-promo-video", {
      name: "Create Promotional Video",
      description:
        "Generate promotional video content using AI-powered video studio",
      parameters: [
        "userId",
        "templateType",
        "platform",
        "contentText",
        "audioUrl",
        "aspectRatio",
        "colorPalette",
      ],
      execute: async (params) => {
        logger.info(
          `🎬 Rendering promo video for ${params?.platform ?? "tiktok"}`,
        );
        try {
          const { generateVideo } = await import(
            "./services/videoGeneratorService.js"
          );
          const r = await generateVideo({
            topic: params?.contentText || "New release",
            platform: params?.platform,
            template: params?.templateType,
            aspect_ratio: params?.aspectRatio,
            bg_color: params?.colorPalette,
            user_audio_path: params?.audioUrl,
            userId: params?.userId,
            awarenessMode: "advertising",
          });
          if (!r?.success) {
            return {
              success: false,
              message: `create-promo-video failed: ${r?.error ?? "render returned no video"}`,
            };
          }
          return {
            success: true,
            message: "Promotional video rendered",
            result: { url: r.url, filename: r.filename },
          };
        } catch (e) {
          logger.warn({ err: e }, "create-promo-video action failed");
          return {
            success: false,
            message: (e as Error).message ?? "create-promo-video failed",
          };
        }
      },
    });

    this.registerAction("create-social-video", {
      name: "Create Social Media Video",
      description: "Generate platform-optimized video for social media posts",
      parameters: [
        "userId",
        "platforms",
        "contentText",
        "audioUrl",
        "duration",
        "visualStyle",
      ],
      execute: async (params) => {
        const platforms = Array.isArray(params?.platforms)
          ? params?.platforms
          : [params?.platforms].filter(Boolean);
        logger.info(`📹 Rendering social video for: ${platforms.join(", ")}`);
        try {
          const { generateVideo } = await import(
            "./services/videoGeneratorService.js"
          );
          if (platforms.length === 0) {
            throw new Error("create-social-video requires at least one platform");
          }
          const results = [];
          for (const platform of platforms) {
            const r = await generateVideo({
              topic: params?.contentText || "New content",
              platform,
              duration: params?.duration,
              template: params?.visualStyle,
              user_audio_path: params?.audioUrl,
              userId: params?.userId,
              awarenessMode: "social",
            });
            results.push({ platform, success: r?.success, url: r?.url, error: r?.error });
          }
          const succeeded = results.filter((r) => r.success);
          if (succeeded.length === 0) {
            return {
              success: false,
              message: "create-social-video failed: no platform render succeeded",
              result: results,
            };
          }
          return {
            success: true,
            message: `Social video rendered for ${succeeded.length}/${platforms.length} platform(s)`,
            result: results,
          };
        } catch (e) {
          logger.warn({ err: e }, "create-social-video action failed");
          return {
            success: false,
            message: (e as Error).message ?? "create-social-video failed",
          };
        }
      },
    });

    this.registerAction("create-lyric-video", {
      name: "Create Lyric Video",
      description: "Generate animated lyric video with audio synchronization",
      parameters: [
        "userId",
        "audioUrl",
        "lyrics",
        "visualStyle",
        "colorPalette",
        "resolution",
      ],
      execute: async (params) => {
        logger.info(`🎤 Rendering lyric video (${params?.visualStyle ?? "default"})`);
        try {
          if (!params?.audioUrl) {
            throw new Error("create-lyric-video requires audioUrl");
          }
          const { generateVideo } = await import(
            "./services/videoGeneratorService.js"
          );
          const lyricsText =
            typeof params?.lyrics === "string"
              ? params.lyrics
              : Array.isArray(params?.lyrics)
                ? params.lyrics.join(" / ")
                : "";
          const r = await generateVideo({
            topic: lyricsText.slice(0, 80) || "Lyric video",
            body: lyricsText.slice(0, 120),
            template: params?.visualStyle,
            bg_color: params?.colorPalette,
            aspect_ratio: params?.resolution,
            user_audio_path: params?.audioUrl,
            userId: params?.userId,
            awarenessMode: "video_script",
          });
          if (!r?.success) {
            return {
              success: false,
              message: `create-lyric-video failed: ${r?.error ?? "render returned no video"}`,
            };
          }
          return {
            success: true,
            message: "Lyric video rendered",
            result: { url: r.url, filename: r.filename },
          };
        } catch (e) {
          logger.warn({ err: e }, "create-lyric-video action failed");
          return {
            success: false,
            message: (e as Error).message ?? "create-lyric-video failed",
          };
        }
      },
    });

    this.registerAction("create-visualizer-video", {
      name: "Create Audio Visualizer Video",
      description:
        "Generate audio-reactive visualizer video with custom effects",
      parameters: [
        "userId",
        "audioUrl",
        "visualizerType",
        "colorPalette",
        "shaderEffects",
        "duration",
      ],
      execute: async (params) => {
        logger.info(
          `🌊 Rendering visualizer video (${params?.visualizerType ?? "default"})`,
        );
        try {
          if (!params?.audioUrl) {
            throw new Error("create-visualizer-video requires audioUrl");
          }
          const { generateVideo } = await import(
            "./services/videoGeneratorService.js"
          );
          const r = await generateVideo({
            topic: params?.visualizerType || "Audio visualizer",
            scene_prompt: params?.visualizerType,
            bg_color: params?.colorPalette,
            duration: params?.duration,
            user_audio_path: params?.audioUrl,
            userId: params?.userId,
            awarenessMode: "video_script",
          });
          if (!r?.success) {
            return {
              success: false,
              message: `create-visualizer-video failed: ${r?.error ?? "render returned no video"}`,
            };
          }
          return {
            success: true,
            message: "Visualizer video rendered",
            result: { url: r.url, filename: r.filename },
          };
        } catch (e) {
          logger.warn({ err: e }, "create-visualizer-video action failed");
          return {
            success: false,
            message: (e as Error).message ?? "create-visualizer-video failed",
          };
        }
      },
    });
  }

  // Register built-in conditions
  private registerBuiltInConditions(): void {
    // Time-based conditions
    this.registerCondition("time-based", {
      name: "Time Based",
      description: "Check if current time matches condition",
      parameters: ["time", "timezone", "days"],
      evaluate: async (params) => {
        const now = new Date();
        const targetTime = new Date(params?.time);
        return (
          now?.getHours() === targetTime?.getHours() &&
          now?.getMinutes() === targetTime?.getMinutes()
        );
      },
    });

    // User-based conditions
    this.registerCondition("user-activity", {
      name: "User Activity",
      description: "Check user activity level",
      parameters: ["userId", "activityType", "threshold"],
      evaluate: async (_params) => {
        // Implement user activity check
        return true;
      },
    });

    // Performance-based conditions
    this.registerCondition("performance-threshold", {
      name: "Performance Threshold",
      description: "Check if performance metrics meet threshold",
      parameters: ["metric", "operator", "value"],
      evaluate: async (_params) => {
        // Implement performance check
        return true;
      },
    });

    // Revenue-based conditions
    this.registerCondition("revenue-threshold", {
      name: "Revenue Threshold",
      description: "Check if revenue meets threshold",
      parameters: ["amount", "period", "operator"],
      evaluate: async (_params) => {
        // Implement revenue check
        return true;
      },
    });

    // Stream-based conditions
    this.registerCondition("stream-threshold", {
      name: "Stream Threshold",
      description: "Check if stream count meets threshold",
      parameters: ["count", "period", "operator"],
      evaluate: async (_params) => {
        // Implement stream check
        return true;
      },
    });
  }

  // Register built-in triggers
  private registerBuiltInTriggers(): void {
    // Schedule trigger
    this.registerTrigger("schedule", {
      name: "Schedule",
      description: "Trigger based on schedule",
      parameters: ["cron", "timezone"],
      start: (params, callback) => {
        const task: ScheduledTask = cron.schedule(params?.cron, callback, {
          timezone: params.timezone,
        });
        task?.start();
        return task;
      },
      stop: (trigger) => {
        if (trigger && typeof (trigger as any)?.stop === "function") {
          (trigger as any)?.stop();
        }
      },
    });

    // Event trigger
    this.registerTrigger("event", {
      name: "Event",
      description: "Trigger based on events",
      parameters: ["eventType", "filters"],
      start: (params, callback) => {
        this.on(params?.eventType, callback);
        return { eventType: params.eventType, callback };
      },
      stop: (trigger) => {
        if (trigger && (trigger as any)?.eventType) {
          this.off((trigger as any)?.eventType, (trigger as any)?.callback);
        }
      },
    });

    // Webhook trigger — registers an in-process listener keyed by webhook id.
    // The HTTP route POST /api/automation/webhooks/:id (registered in routes?.ts)
    // looks up the registry and invokes every registered callback for that id.
    this.registerTrigger("webhook", {
      name: "Webhook",
      description: "Trigger based on webhook calls",
      parameters: ["webhookId", "secret"],
      start: (params, callback) => {
        const webhookId = String(params?.webhookId || params?.url || "").trim();
        if (!webhookId) {
          throw new Error("webhook trigger requires `webhookId` parameter");
        }
        const list = this.webhookHandlers.get(webhookId) || [];
        const handler = {
          callback,
          secret: params.secret as string | undefined,
        };
        list?.push(handler);
        this.webhookHandlers.set(webhookId, list);
        logger.info(
          `[Automation] Webhook trigger registered: ${webhookId} (${list?.length} handler[s])`,
        );
        return { webhookId, handler };
      },
      stop: (trigger) => {
        if ((!trigger as any)?.webhookId) return;
        const list = this.webhookHandlers.get((trigger as any)?.webhookId) || [];
        const next = list?.filter(
          (h: Record<string, unknown>) => h !== (trigger as any)?.handler,
        );
        if (next?.length === 0) this.webhookHandlers.delete((trigger as any)?.webhookId);
        else this.webhookHandlers.set((trigger as any)?.webhookId, next);
      },
    });
  }

  // Start automation engine
  private startAutomationEngine(): void {
    // Start monitoring workflows
    setInterval(() => {
      this.monitorWorkflows();
    }, 5000);

    // Start executing workflows
    setInterval(() => {
      this.executeWorkflows();
    }, 1000);

    logger.info("🚀 Automation engine started");
  }

  // Monitor workflows
  private monitorWorkflows(): void {
    for (const [_id, workflow] of this.workflows) {
      if (workflow?.status === "active") {
        this.checkWorkflowTriggers(workflow);
      }
    }
  }

  // Execute workflows
  private async executeWorkflows(): Promise<void> {
    for (const [_id, workflow] of this.workflows) {
      if (
        workflow?.status === "triggered" &&
        workflow?.nextAction < workflow?.actions.length
      ) {
        await this.executeWorkflowStep(workflow);
      }
    }
  }

  // Check workflow triggers
  private async checkWorkflowTriggers(workflow: Workflow): Promise<void> {
    for (const triggerConfig of workflow?.triggers) {
      const trigger = this.triggers.get(triggerConfig?.type);
      if (trigger) {
        if (typeof trigger.evaluate !== "function") {
          continue;
        }
        try {
          const shouldTrigger = await trigger.evaluate(triggerConfig?.parameters);
          if (shouldTrigger) {
            await this.triggerWorkflow(workflow);
            break;
          }
        } catch (error: unknown) {
          logger.warn(
            { err: error },
            `Trigger error for workflow ${workflow?.id}:`,
          );
        }
      }
    }
  }

  // Trigger workflow
  private async triggerWorkflow(workflow: Workflow): Promise<void> {
    workflow.status = "triggered";
    workflow.nextAction = 0;
    workflow.startTime = Date?.now();

    logger.info(`🎯 Workflow triggered: ${workflow?.name}`);

    // Emit workflow triggered event
    this.emit("workflow:triggered", workflow);
  }

  // Execute workflow step
  private async executeWorkflowStep(workflow: Workflow): Promise<void> {
    const actionConfig = workflow?.actions[workflow?.nextAction];
    const action = this.actions.get(actionConfig?.type);

    if (!action) {
      logger.warn(`Action not found: ${actionConfig?.type}`);
      workflow.status = "failed";
      return;
    }

    try {
      // Check conditions
      if (actionConfig?.conditions) {
        for (const conditionConfig of actionConfig?.conditions) {
          const condition = this.conditions.get(conditionConfig?.type);
          if (condition) {
            const conditionMet = await condition?.evaluate(
              conditionConfig?.parameters,
            );
            if (!conditionMet) {
              logger.info(`Condition not met for action: ${actionConfig?.type}`);
              workflow.nextAction++;
              return;
            }
          }
        }
      }

      // Execute action
      const startTime = Date?.now();
      const actionResult = await action?.execute(actionConfig?.parameters);
      const executionTime = Date?.now() - startTime;
      // Positive success contract: every built-in action now returns an
      // explicit { success: boolean } result reflecting its real side effect.
      // A workflow step only counts as done when success === true — missing,
      // malformed, or false results are ALL treated as failure so a broken or
      // legacy action can never silently be waved through as "completed".
      const success =
        !!actionResult &&
        typeof actionResult === "object" &&
        (actionResult as { success?: unknown }).success === true;
      if (!success) {
        const message =
          actionResult &&
          typeof actionResult === "object" &&
          typeof (actionResult as { message?: unknown }).message === "string"
            ? (actionResult as { message: string }).message
            : `Action ${actionConfig?.type} did not return a confirmed success result`;
        throw new Error(message);
      }

      // Update metrics
      this.automationMetrics.totalExecutions++;
      this.automationMetrics.averageExecutionTime =
        (this.automationMetrics.averageExecutionTime + executionTime) / 2;

      logger.info(
        `✅ Action executed: ${actionConfig?.type} in ${executionTime}ms`,
      );

      // Move to next action
      workflow.nextAction++;

      // Check if workflow is complete
      if (workflow?.nextAction >= workflow?.actions.length) {
        workflow.status = "completed";
        workflow.endTime = Date?.now();
        workflow.executionTime =
          workflow.endTime - (workflow.startTime ?? workflow.endTime);

        this.automationMetrics.completedWorkflows++;
        logger.info(`🎉 Workflow completed: ${workflow?.name}`);

        // Emit workflow completed event
        this.emit("workflow:completed", workflow);
      }
    } catch (error: unknown) {
      logger.warn(
        { err: error },
        `Action execution failed: ${actionConfig?.type}`,
      );
      workflow.status = "failed";
      workflow.endTime = Date?.now();
      workflow.error = error instanceof Error ? error?.message : String(error);

      this.automationMetrics.failedWorkflows++;

      // Emit workflow failed event
      this.emit("workflow:failed", workflow);
    }
  }

  // Create workflow
  public createWorkflow(config: WorkflowConfig): Workflow {
    const workflow: Workflow = {
      id: config.id || this.generateId(),
      name: config.name,
      description: config.description,
      triggers: config.triggers,
      actions: config.actions,
      status: "inactive",
      nextAction: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.workflows.set(workflow?.id, workflow);
    this.automationMetrics.totalWorkflows++;

    logger.info(`📋 Workflow created: ${workflow?.name}`);

    return workflow;
  }

  // Start workflow
  public startWorkflow(workflowId: string): boolean {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return false;

    workflow.status = "active";
    workflow.updatedAt = Date?.now();

    // Start triggers
    for (const triggerConfig of workflow?.triggers) {
      const trigger = this.triggers.get(triggerConfig?.type);
      if (trigger) {
        const triggerInstance = trigger?.start(triggerConfig?.parameters, () => {
          this.triggerWorkflow(workflow);
        });
        workflow.triggerInstances = workflow?.triggerInstances || [];
        workflow?.triggerInstances.push(triggerInstance);
      }
    }

    this.automationMetrics.activeWorkflows++;
    logger.info(`▶️ Workflow started: ${workflow?.name}`);

    return true;
  }

  // Stop workflow
  public stopWorkflow(workflowId: string): boolean {
    const workflow = this.workflows.get(workflowId);
    if (!workflow) return false;

    workflow.status = "inactive";
    workflow.updatedAt = Date?.now();

    // Stop triggers
    if (workflow?.triggerInstances) {
      for (const triggerInstance of workflow?.triggerInstances) {
        const trigger = this.triggers.get(workflow?.triggers[0].type);
        if (trigger) {
          trigger?.stop(triggerInstance);
        }
      }
      workflow.triggerInstances = [];
    }

    this.automationMetrics.activeWorkflows--;
    logger.info(`⏹️ Workflow stopped: ${workflow?.name}`);

    return true;
  }

  // Register action
  public registerAction(type: string, action: Action): void {
    this.actions.set(type, action);
    logger.info(`🔧 Action registered: ${action?.name}`);
  }

  // Register condition
  public registerCondition(type: string, condition: Condition): void {
    this.conditions.set(type, condition);
    logger.info(`🔍 Condition registered: ${condition?.name}`);
  }

  // Register trigger
  public registerTrigger(type: string, trigger: Trigger): void {
    this.triggers.set(type, trigger);
    logger.info(`🎯 Trigger registered: ${trigger?.name}`);
  }

  // Load workflows from storage
  private async loadWorkflows(): Promise<void> {
    try {
      // Implement workflow loading from database
      logger.info("📂 Loading workflows from storage...");
    } catch (error: unknown) {
      logger.warn({ err: error }, "Error loading workflows:");
    }
  }

  // Generate unique ID
  private generateId(): string {
    return randomUUID();
  }

  // Get automation metrics
  public getMetrics(): AutomationMetrics {
    return { ...this.automationMetrics };
  }

  // Get workflow by ID
  public getWorkflow(id: string): Workflow | undefined {
    return this.workflows.get(id);
  }

  // Get all workflows
  public getAllWorkflows(): Workflow[] {
    return Array.from(this.workflows.values());
  }

  // Delete workflow
  public deleteWorkflow(id: string): boolean {
    const workflow = this.workflows.get(id);
    if (!workflow) return false;

    this.stopWorkflow(id);
    this.workflows.delete(id);
    this.automationMetrics.totalWorkflows--;

    logger.info(`🗑️ Workflow deleted: ${workflow?.name}`);
    return true;
  }
}

// Pre-built workflow templates
export const WORKFLOW_TEMPLATES = {
  // Music release workflow
  "music-release": {
    name: "Music Release Workflow",
    description: "Automated workflow for releasing music",
    triggers: [
      { type: "schedule", parameters: { cron: "0 9 * * 1", timezone: "UTC" } },
    ],
    actions: [
      {
        type: "distribute-music",
        parameters: {
          releaseId: "{{releaseId}}",
          platforms: ["spotify", "apple-music"],
        },
        conditions: [
          {
            type: "time-based",
            parameters: { time: "09:00", days: ["monday"] },
          },
        ],
      },
      {
        type: "post-social-media",
        parameters: {
          platforms: ["instagram", "twitter"],
          content: "New release out now!",
        },
      },
      {
        type: "send-email",
        parameters: {
          to: "{{fanEmail}}",
          subject: "New Release!",
          template: "release",
        },
      },
    ],
  },

  // Analytics report workflow
  "analytics-report": {
    name: "Analytics Report Workflow",
    description: "Generate and send weekly analytics reports",
    triggers: [
      { type: "schedule", parameters: { cron: "0 8 * * 1", timezone: "UTC" } },
    ],
    actions: [
      {
        type: "generate-analytics-report",
        parameters: {
          reportType: "weekly",
          recipients: ["admin@maxbooster.ai"],
        },
      },
      {
        type: "send-email",
        parameters: {
          to: "{{adminEmail}}",
          subject: "Weekly Analytics Report",
          template: "analytics",
        },
      },
    ],
  },

  // AI processing workflow
  "ai-processing": {
    name: "AI Processing Workflow",
    description: "Automated AI mixing and mastering",
    triggers: [{ type: "event", parameters: { eventType: "track:uploaded" } }],
    actions: [
      {
        type: "ai-mix-track",
        parameters: {
          trackId: "{{trackId}}",
          style: "modern",
          quality: "high",
        },
      },
      {
        type: "ai-master-track",
        parameters: {
          trackId: "{{trackId}}",
          targetLoudness: -14,
          format: "wav",
        },
      },
      {
        type: "send-notification",
        parameters: {
          title: "AI Processing Complete",
          message: "Your track has been processed!",
        },
      },
    ],
  },

  // Revenue tracking workflow
  "revenue-tracking": {
    name: "Revenue Tracking Workflow",
    description: "Track and process revenue payments",
    triggers: [
      { type: "schedule", parameters: { cron: "0 0 1 * *", timezone: "UTC" } },
    ],
    actions: [
      {
        type: "process-payment",
        parameters: {
          amount: "{{revenue}}",
          currency: "USD",
          method: "stripe",
        },
      },
      {
        type: "send-email",
        parameters: {
          to: "{{userEmail}}",
          subject: "Revenue Payment",
          template: "payment",
        },
      },
    ],
  },
};

// Interfaces
interface Workflow {
  id: string;
  name: string;
  description: string;
  triggers: TriggerConfig[];
  actions: ActionConfig[];
  status: "inactive" | "active" | "triggered" | "completed" | "failed";
  nextAction: number;
  startTime?: number;
  endTime?: number;
  executionTime?: number;
  error?: string;
  createdAt: number;
  updatedAt: number;
  triggerInstances?: unknown[];
}

interface WorkflowConfig {
  id?: string;
  name: string;
  description: string;
  triggers: TriggerConfig[];
  actions: ActionConfig[];
}

interface TriggerConfig {
  type: string;
  parameters: Record<string, any>;
}

interface ActionConfig {
  type: string;
  parameters: Record<string, any>;
  conditions?: ConditionConfig[];
}

interface ConditionConfig {
  type: string;
  parameters: Record<string, any>;
}

interface Action {
  name: string;
  description: string;
  parameters: string[];
  execute: (params: Record<string, unknown>) => Promise<unknown>;
}

interface Condition {
  name: string;
  description: string;
  parameters: string[];
  evaluate: (params: Record<string, any>) => Promise<boolean>;
}

interface Trigger {
  name: string;
  description: string;
  parameters: string[];
  start: (params: Record<string, any>, callback: () => void) => any;
  stop: (trigger: unknown) => void;
  evaluate?: (params: Record<string, any>) => Promise<boolean>;
}

interface AutomationMetrics {
  totalWorkflows: number;
  activeWorkflows: number;
  completedWorkflows: number;
  failedWorkflows: number;
  totalExecutions: number;
  averageExecutionTime: number;
  successRate: number;
  lastExecution: number;
  automationScore: number;
}

export default AutomationSystem;
