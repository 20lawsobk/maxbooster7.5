import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";

const f = vi.hoisted(() => ({
  rows: [] as Array<Array<{ status: string; total: number }>>,
  predicates: [] as unknown[],
  get: vi.fn(),
  add: vi.fn(),
  schedule: vi.fn(),
}));
vi.mock("../../server/lib/redisClient.js", () => ({ newBullMQRedisConnection: () => ({}) }));
vi.mock("bullmq", () => ({
  Queue: class {
    add = f.add;
    close = vi.fn();
  },
}));
vi.mock("../../server/lib/boosterStateClient.js", () => ({
  getBoosterStateClient: async () => ({ get: f.get }),
}));
vi.mock("../../server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: (predicate: unknown) => {
          f.predicates.push(predicate);
          return { groupBy: async () => f.rows.shift() };
        },
      }),
    }),
  },
}));
vi.mock("../../server/storage.js", () => ({ storage: {} }));
vi.mock("../../server/services/autoPostingServiceV2.js", () => ({
  autoPostingServiceV2: { scheduleExistingPost: f.schedule },
  normalizePublishingPlatform: (platform: string) => platform,
}));
import { BoosterQueue } from "../../server/services/queueService";
import { socialQueueService } from "../../server/services/socialQueueService";

describe("shared social work integrity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    f.rows = [];
    f.predicates = [];
    f.get.mockReset();
    f.add.mockResolvedValue({ id: "durable-job-id" });
    f.schedule.mockReset();
  });
  it("enqueues when optional options are omitted", async () => {
    const queue = new BoosterQueue("test");
    const data = { postId: "p1" };
    expect(await queue.add("publish", data)).toEqual({
      id: "durable-job-id", name: "publish", data,
    });
    expect(f.add).toHaveBeenCalledTimes(1);
  });
  it("preserves caller idempotency, delay and priority", async () => {
    await new BoosterQueue("test").add("publish", {}, {
      jobId: "stable-id", delay: 1200, priority: 2,
    });
    expect(f.add).toHaveBeenCalledWith("publish", {}, {
      jobId: "stable-id", delay: 1200, priority: 2,
    });
  });
  it("reports durable counts and scopes BOTH tables to the requesting user", async () => {
    f.rows = [
      [{ status: "scheduled", total: 4 }, { status: "publishing", total: 2 },
        { status: "published", total: 7 }, { status: "failed", total: 1 },
        { status: "draft", total: 30 }],
      [{ status: "pending", total: 3 }, { status: "completed", total: 2 }],
    ];
    expect(await socialQueueService.getQueueStats("owner-a")).toEqual({
      socialPosts: { waiting: 4, active: 2, completed: 7, failed: 1 },
      batches: { waiting: 3, active: 0, completed: 2, failed: 0 },
    });
    expect(f.predicates).toHaveLength(2);
    for (const predicate of f.predicates) {
      const query = new PgDialect().sqlToQuery(predicate as any);
      expect(query.sql).toContain('"user_id"');
      expect(query.params).toEqual(["owner-a"]);
    }
  });
  it("rejects an ownerless statistics query before reading either table", async () => {
    await expect(socialQueueService.getQueueStats("")).rejects.toThrow("user is required");
    expect(f.predicates).toHaveLength(0);
  });
  it("does not interpret unavailable backoff storage as permission to publish", async () => {
    f.get.mockRejectedValue(new Error("storage offline"));
    await expect(socialQueueService.isInBackoff("twitter", "account"))
      .rejects.toThrow("backoff state is unavailable");
    await expect(socialQueueService.checkRateLimit("twitter", "account"))
      .rejects.toThrow("rate-limit state is unavailable");
  });
  it("propagates queue outages instead of manufacturing a job", async () => {
    f.add.mockRejectedValue(new Error("queue offline"));
    await expect(new BoosterQueue("test").add("publish", {})).rejects.toThrow("queue offline");
  });
  it("delegates scheduling without changing persisted delivery state first", async () => {
    const scheduledAt = new Date("2027-01-01T10:00:00Z");
    await socialQueueService.schedulePost("p1", scheduledAt);
    expect(f.schedule).toHaveBeenCalledWith("p1", { scheduledAt });
    expect(f.predicates).toHaveLength(0);
  });
  it.each(["Scheduled post not found", "Delivery already completed", "Uncertain delivery"])(
    "propagates the shared scheduling guard: %s", async message => {
      f.schedule.mockRejectedValue(new Error(message));
      await expect(socialQueueService.schedulePost("p1", new Date()))
        .rejects.toThrow(message);
      expect(f.predicates).toHaveLength(0);
    },
  );
});
