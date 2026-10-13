import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";

const fixture = vi.hoisted(() => ({ db: null as any }));
// Only infrastructure wiring is replaced: the query implementation executes
// unchanged against an actual, newly initialized private PostgreSQL database.
vi.mock("../../server/db", () => ({
  db: { select: (...args: any[]) => fixture.db.select(...args) },
}));
vi.mock("../../server/services/queueService.js", () => ({
  BoosterQueue: class {},
}));
vi.mock("../../server/services/autoPostingServiceV2.js", () => ({
  autoPostingServiceV2: {},
  normalizePublishingPlatform: (p: string) => p,
}));
vi.mock("../../server/lib/boosterStateClient.js", () => ({
  getBoosterStateClient: () => { throw new Error("No cache permitted in statistics tests"); },
}));
vi.mock("../../server/storage.js", () => ({ storage: {} }));
import { socialQueueService } from "../../server/services/socialQueueService";

describe("social work statistics: real PostgreSQL isolation", () => {
  let directory: string;
  let postgres: ChildProcess | undefined;
  let client: Client | undefined;
  let stopped: Promise<void> | undefined;
  beforeAll(async () => {
    directory = mkdtempSync(join(tmpdir(), "social-statistics-pg-"));
    const initialized = spawnSync("initdb", [
      "-D", directory, "-U", "fixture", "--auth=trust", "--no-locale", "--encoding=UTF8",
    ], { encoding: "utf8", timeout: 30000 });
    if (initialized.status !== 0) throw new Error(`Fixture initdb failed: ${initialized.stderr}`);
    const port = await new Promise<number>((resolve, reject) => {
      const socket = createServer();
      socket.once("error", reject);
      socket.listen(0, "127.0.0.1", () => {
        const value = (socket.address() as { port: number }).port;
        socket.close(() => resolve(value));
      });
    });
    postgres = spawn("postgres", ["-D", directory, "-h", "127.0.0.1",
      "-k", directory, "-p", String(port)], { stdio: ["ignore", "ignore", "pipe"] });
    stopped = new Promise(resolve => postgres!.once("exit", () => resolve()));
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Private PostgreSQL startup timed out")), 15000);
      let output = "";
      postgres!.once("error", error => { clearTimeout(timer); reject(error); });
      postgres!.once("exit", code => {
        clearTimeout(timer);
        reject(new Error(`Private PostgreSQL exited: ${code}`));
      });
      postgres!.stderr!.on("data", chunk => {
        output += chunk.toString();
        if (output.includes("database system is ready to accept connections")) {
          clearTimeout(timer);
          resolve();
        }
      });
    });
    // Explicit connection fields: no workspace database URL or provider secret
    // is read or inherited into this client configuration.
    client = new Client({ host: "127.0.0.1", port, user: "fixture", database: "postgres", ssl: false });
    await client.connect();
    fixture.db = drizzle(client);
    await client.query(`
      CREATE TABLE posts (user_id varchar NOT NULL, status text);
      CREATE TABLE scheduled_post_batches (user_id varchar NOT NULL, status text);
      INSERT INTO posts VALUES
        ('owner-a','scheduled'),('owner-a','pending'),('owner-a','posting'),
        ('owner-a','published'),('owner-a','failed'),('owner-a','draft'),
        ('owner-b','scheduled'),('owner-b','scheduled'),('owner-b','scheduled');
      INSERT INTO scheduled_post_batches VALUES
        ('owner-a','processing'),('owner-a','completed'),
        ('owner-b','pending'),('owner-b','failed');
    `);
  }, 60000);

  afterAll(async () => {
    await client?.end();
    postgres?.kill("SIGINT");
    if (stopped) await stopped;
    if (directory) rmSync(directory, { recursive: true, force: true });
  });

  it("counts only the owner's durable post and batch states", async () => {
    expect(await socialQueueService.getQueueStats("owner-a")).toEqual({
      socialPosts: { waiting: 2, active: 1, completed: 1, failed: 1 },
      batches: { waiting: 0, active: 1, completed: 1, failed: 0 },
    });
    expect(await socialQueueService.getQueueStats("owner-b")).toEqual({
      socialPosts: { waiting: 3, active: 0, completed: 0, failed: 0 },
      batches: { waiting: 1, active: 0, completed: 0, failed: 1 },
    });
  });
  it("returns measured zeros for an account with no work", async () => {
    expect(await socialQueueService.getQueueStats("empty-owner")).toEqual({
      socialPosts: { waiting: 0, active: 0, completed: 0, failed: 0 },
      batches: { waiting: 0, active: 0, completed: 0, failed: 0 },
    });
  });
  it("does not convert a real database query failure into zero statistics", async () => {
    await client!.query("DROP TABLE scheduled_post_batches");
    await expect(socialQueueService.getQueueStats("owner-a")).rejects.toThrow();
  });
});
