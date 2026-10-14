import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  pendingRows: [] as Array<{ id: string }>,
  posts: new Map<string, any>(),
  addAttempts: [] as Array<{
    queueName: string;
    jobName: string;
    data: any;
    options: any;
  }>,
  queuedJobs: new Map<string, any>(),
  queues: [] as any[],
  workers: [] as any[],
  queueCloseCount: 0,
  recoverStrandedSocialPosts: vi.fn(),
  getScheduledPosts: vi.fn(),
  getScheduledPostById: vi.fn(),
  updateScheduledPost: vi.fn(),
  claimSocialPost: vi.fn(),
  checkpointSocialPost: vi.fn(),
  recordPerformance: vi.fn(),
}));

vi.mock("bullmq", () => {
  class FakeWorker {
    queueName: string;
    processor: (job: any) => Promise<void>;
    closed = false;
    processCalls = 0;

    constructor(
      queueName: string,
      processor: (job: any) => Promise<void>,
    ) {
      this.queueName = queueName;
      this.processor = processor;
      state.workers.push(this);
    }

    on() {
      return this;
    }

    async pause() {}

    async resume() {}

    async close() {
      this.closed = true;
    }
  }

  return { Worker: FakeWorker };
});

vi.mock("../../server/lib/redisClient.js", () => ({
  newBullMQRedisConnection: vi.fn(() => ({ isolated: true })),
}));

vi.mock("../../server/services/queueService.js", () => {
  class FakeBoosterQueue {
    name: string;

    constructor(name: string) {
      this.name = name;
      state.queues.push(this);
    }

    async add(jobName: string, data: any, options: any = {}) {
      const attempt = {
        queueName: this.name,
        jobName,
        data,
        options,
      };
      state.addAttempts.push(attempt);

      const jobId = String(options.jobId);
      if (!state.queuedJobs.has(jobId)) {
        state.queuedJobs.set(jobId, attempt);
      }
      return { id: jobId, name: jobName, data };
    }

    async close() {
      state.queueCloseCount += 1;
    }
  }

  return { BoosterQueue: FakeBoosterQueue };
});

vi.mock("../../server/storage.js", () => ({
  storage: {
    getScheduledPosts: state.getScheduledPosts,
    getScheduledPostById: state.getScheduledPostById,
    updateScheduledPost: state.updateScheduledPost,
  },
}));

vi.mock("../../server/logger.js", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("axios", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

vi.mock("../../server/services/autopilotLearningService.js", () => ({
  autopilotLearningService: { recordPerformance: state.recordPerformance },
}));

vi.mock("../../server/services/postingUtils.js", () => ({
  detectHookPattern: vi.fn(),
}));

vi.mock("../../server/services/notificationService.js", () => ({
  notificationService: {},
}));

vi.mock("../../server/services/socialPostingRepository.js", () => ({
  claimSocialPost: state.claimSocialPost,
  checkpointSocialPost: state.checkpointSocialPost,
  recoverStrandedSocialPosts: state.recoverStrandedSocialPosts,
}));

vi.mock("../../server/services/socialOAuthService.js", () => ({
  socialOAuth: {},
}));

vi.mock("../../server/db", () => ({
  db: {
    update: () => { throw new Error("Scheduling wrapper must not overwrite delivery state"); },
    select: () => { throw new Error("Scheduling wrapper must use the shared publisher"); },
  },
}));
vi.mock("../../server/lib/boosterStateClient.js", () => ({
  getBoosterStateClient: () => { throw new Error("No external cache in delivery guard tests"); },
}));

const POST_ID = "scheduled-post-1";
const NOW = Date.parse("2026-10-01T18:00:00.000Z");
const SCHEDULED_AT = new Date(NOW + 5 * 60_000);
const activeServices = new Set<any>();

async function loadService() {
  const { autoPostingServiceV2 } = await import(
    "../../server/services/autoPostingServiceV2.js"
  );
  activeServices.add(autoPostingServiceV2);
  return autoPostingServiceV2;
}

async function shutDownService(service: any) {
  await service.shutdown();
  activeServices.delete(service);
}

function resetFakes() {
  state.pendingRows = [{ id: POST_ID }];
  state.posts.clear();
  state.posts.set(POST_ID, {
    id: POST_ID,
    userId: "user-1",
    platforms: ["x"],
    content: { text: "Scheduled copy" },
    mediaUrls: [],
    scheduledTime: new Date(SCHEDULED_AT),
    status: "pending",
  });
  state.addAttempts.length = 0;
  state.queuedJobs.clear();
  state.queues.length = 0;
  state.workers.length = 0;
  state.queueCloseCount = 0;
  state.updateScheduledPost.mockReset().mockResolvedValue(undefined);
  state.claimSocialPost.mockReset().mockResolvedValue({ id: POST_ID });
  state.checkpointSocialPost.mockReset().mockResolvedValue(undefined);
  state.recordPerformance.mockReset().mockResolvedValue(undefined);
  state.recoverStrandedSocialPosts.mockReset().mockResolvedValue([]);
  state.getScheduledPosts
    .mockReset()
    .mockImplementation(async () => state.pendingRows);
  state.getScheduledPostById
    .mockReset()
    .mockImplementation(async (id: string) => state.posts.get(id) ?? null);
}

describe("scheduled social post recovery", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    resetFakes();
  });

  it("repairs a persisted-but-unqueued idempotent post without creating another job", async () => {
    state.pendingRows = [];
    const row = { ...state.posts.get(POST_ID), id: "post_retry", platforms: ["twitter"], createdBy: "manual" };
    state.posts.set(row.id, row);
    const service = await loadService();
    await service.schedulePost("user-1", ["twitter"], row.content, row.scheduledTime, "manual", undefined, "retry");
    await service.schedulePost("user-1", ["twitter"], row.content, row.scheduledTime, "manual", undefined, "retry");
    expect(state.queuedJobs.size).toBe(1);
    expect(state.queuedJobs.has("post_retry")).toBe(true);
  });

  it("does not repair an idempotent post with an uncertain delivery receipt", async () => {
    state.pendingRows = [];
    const row = { ...state.posts.get(POST_ID), id: "post_retry", platforms: ["twitter"],
      results: [{ outcome: "unknown" }] };
    state.posts.set(row.id, row);
    const service = await loadService();
    await expect(service.schedulePost("user-1", ["twitter"], row.content, row.scheduledTime,
      "manual", undefined, "retry")).rejects.toThrow("uncertain delivery");
    expect(state.queuedJobs.size).toBe(0);
  });

  it("retains successful delivery without a nonexistent secondary storage write", async () => {
    state.pendingRows = [];
    const service = await loadService();
    const receipt = { platform: "twitter", success: true, outcome: "confirmed", postId: "provider-receipt" };
    vi.spyOn(service as any, "executePost").mockResolvedValue([receipt]);
    await (service as any).processSinglePost(state.posts.get(POST_ID));
    expect(state.checkpointSocialPost).toHaveBeenCalledWith(POST_ID, [receipt], "completed");
    expect(state.updateScheduledPost).not.toHaveBeenCalled();
  });

  it("does not relabel confirmed delivery as failed when a follow-up throws", async () => {
    state.pendingRows = [];
    const service = await loadService();
    const receipt = { platform: "twitter", success: true, outcome: "confirmed", postId: "provider-receipt" };
    vi.spyOn(service as any, "executePost").mockResolvedValue([receipt]);
    state.recordPerformance.mockImplementation(() => { throw new Error("Follow-up unavailable"); });
    await (service as any).processSinglePost(state.posts.get(POST_ID));
    expect(state.checkpointSocialPost).toHaveBeenCalledWith(POST_ID, [receipt], "completed");
    expect(state.updateScheduledPost).not.toHaveBeenCalled();
    const { logger } = await import("../../server/logger.js");
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ deliveryCheckpointed: true }),
      expect.stringContaining("preserved durable delivery outcome"),
    );
  });

  it.each([
    { status: "published", results: [] },
    { status: "completed", results: [] },
    { status: "posting", results: [] },
    { status: "pending", results: [{ outcome: "unknown", success: false }] },
    { status: "pending", results: [{ outcome: "started", success: false }] },
    { status: "pending", results: [{ outcome: "confirmed", success: true }] },
  ])("autonomous wrapper preserves the real delivery guard for %j", async delivery => {
    state.pendingRows = [];
    state.posts.set(POST_ID, { ...state.posts.get(POST_ID), ...delivery });
    await loadService();
    const { socialQueueService } = await import("../../server/services/socialQueueService");
    await expect(socialQueueService.schedulePost(POST_ID, SCHEDULED_AT))
      .rejects.toThrow(/delivery has started|provider receipt or an uncertain delivery/);
    expect(state.addAttempts).toHaveLength(0);
    expect(state.posts.get(POST_ID).status).toBe(delivery.status);
  });

  it("autonomous wrapper rejects a missing persisted post", async () => {
    state.pendingRows = [];
    state.posts.clear();
    await loadService();
    const { socialQueueService } = await import("../../server/services/socialQueueService");
    await expect(socialQueueService.schedulePost(POST_ID, SCHEDULED_AT))
      .rejects.toThrow("Scheduled post not found");
    expect(state.addAttempts).toHaveLength(0);
  });

  afterEach(async () => {
    for (const service of [...activeServices]) {
      await shutDownService(service);
    }
    vi.useRealTimers();
    vi.resetModules();
  });

  it("reloads a persisted pending post after a restart with its scheduled time and stable job ID", async () => {
    const firstProcessService = await loadService();
    await firstProcessService.initialize();

    expect(state.addAttempts).toHaveLength(1);
    expect(state.addAttempts[0]).toMatchObject({
      queueName: "scheduled-posts",
      jobName: "auto-post",
      data: { id: POST_ID, scheduledTime: SCHEDULED_AT },
      options: { jobId: POST_ID, delay: 5 * 60_000 },
    });
    expect(state.recoverStrandedSocialPosts).toHaveBeenCalledTimes(1);

    await shutDownService(firstProcessService);
    vi.resetModules();

    const restartedService = await loadService();
    await restartedService.initialize();

    expect(state.addAttempts).toHaveLength(2);
    expect(state.addAttempts[1]).toMatchObject({
      queueName: "scheduled-posts",
      jobName: "auto-post",
      data: { id: POST_ID, scheduledTime: SCHEDULED_AT },
      options: { jobId: POST_ID, delay: 5 * 60_000 },
    });
    expect(state.queuedJobs.size).toBe(1);
    expect(state.queuedJobs.get(POST_ID)).toMatchObject({
      data: { id: POST_ID, scheduledTime: SCHEDULED_AT },
      options: { jobId: POST_ID, delay: 5 * 60_000 },
    });
    expect(state.recoverStrandedSocialPosts).toHaveBeenCalledTimes(2);
    expect(state.workers).toHaveLength(2);
    expect(state.workers.every((worker) => worker.processCalls === 0)).toBe(true);
  });

  it("coalesces repeated initialization without adding a second job or worker", async () => {
    const service = await loadService();

    await Promise.all([
      service.initialize(),
      service.initialize(),
      service.initialize(),
    ]);
    await service.initialize();

    expect(state.workers).toHaveLength(1);
    expect(state.addAttempts).toHaveLength(1);
    expect(state.queuedJobs.size).toBe(1);
    expect(state.recoverStrandedSocialPosts).toHaveBeenCalledTimes(1);
    expect(state.getScheduledPosts).toHaveBeenCalledTimes(1);
  });

  it("closes the worker, queue, and recovery interval during shutdown", async () => {
    const timerCountBeforeInitialize = vi.getTimerCount();
    const service = await loadService();
    await service.initialize();

    expect(vi.getTimerCount()).toBe(timerCountBeforeInitialize + 1);
    expect(state.workers).toHaveLength(1);
    expect(state.workers[0].closed).toBe(false);

    await shutDownService(service);

    expect(state.workers[0].closed).toBe(true);
    expect(state.queueCloseCount).toBe(1);
    expect(vi.getTimerCount()).toBe(timerCountBeforeInitialize);
  });
});