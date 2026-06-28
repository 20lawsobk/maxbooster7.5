/**
 * Silent Deployment Service
 *
 * Hooks into the Self-Evolution Engine to apply generated code changes to the
 * live server with zero user-visible downtime and no end-user notifications.
 *
 * Deployment flow:
 *  1. SelfEvolutionEngine writes new files atomically (tmp → rename)
 *  2. Engine emits 'filesDeployed' with upgrade metadata
 *  3. SilentDeploymentService receives event and queues a deployment window
 *  4. Pre-deploy health baseline is captured
 *  5. 30-second grace period drains in-flight requests
 *  6. Rolling cluster restart triggered via IPC to primary process
 *     – Primary cycles workers one at a time (old exits → new forks → shift traffic)
 *     – Single-process mode: scheduled restart after event loop drains
 *  7. 60-second health watch (polling every 5s) after restart
 *  8. If health degrades → automatic rollback + second restart to restore .bak files
 *  9. Full audit entry written to admin log — zero end-user notifications
 */

import { EventEmitter } from "events";
import http from "http";
import { randomBytes } from "crypto";
import { logger } from "../logger.js";
import { selfEvolution } from "../self-evolution-engine.js";
import { storage } from "../storage.js";

interface DeploymentRecord {
  id: string;
  upgradeId: string;
  upgradeType: string;
  filesModified: number;
  startedAt: Date;
  completedAt?: Date;
  restartTriggered: boolean;
  healthCheckPassed?: boolean;
  rolledBack: boolean;
  rollbackReason?: string;
  preHealthMs?: number;
  postHealthMs?: number;
}

interface HealthSnapshot {
  responseTimeMs: number;
  ok: boolean;
  checkedAt: Date;
}

const GRACE_PERIOD_MS = 30_000;
const HEALTH_POLL_MS = 5_000;
const HEALTH_TIMEOUT_MS = 60_000;
const SLOW_THRESHOLD_MS = 2_000;
const PORT = process?.env.PORT || "5000";

class SilentDeploymentService extends EventEmitter {
  private enabled: boolean = false;
  private deploymentQueue: Array<{
    upgradeId: string;
    upgradeType: string;
    filesModified: number;
  }> = [];
  private isDeploying: boolean = false;
  private history: DeploymentRecord[] = [];
  private readonly MAX_HISTORY = 100;

  constructor() {
    super();
    this?.attachToEvolutionEngine();
  }

  enable(): void {
    this.enabled = true;
    logger?.info("[SilentDeploy] Silent deployment system ENABLED");
  }

  disable(): void {
    this.enabled = false;
    logger?.info("[SilentDeploy] Silent deployment system DISABLED");
  }

  isEnabled(): boolean {
    return this?.enabled;
  }

  getHistory(limit = 20): DeploymentRecord[] {
    return this?.history.slice(-limit).reverse();
  }

  getStatus(): Record<string, unknown> {
    const last = this?.history[this?.history.length - 1];
    return {
      enabled: this.enabled,
      isDeploying: this.isDeploying,
      queueDepth: this.deploymentQueue.length,
      totalDeployments: this.history.length,
      rolledBack: this.history.filter((d) => d?.rolledBack).length,
      lastDeployment: last
        ? {
            id: last.id,
            upgradeType: last.upgradeType,
            startedAt: last.startedAt,
            completedAt: last.completedAt,
            healthCheckPassed: last.healthCheckPassed,
            rolledBack: last.rolledBack,
          }
        : null,
    };
  }

  private attachToEvolutionEngine(): void {
    selfEvolution?.on(
      "filesDeployed",
      (payload: {
        upgradeId: string;
        upgradeType: string;
        filesModified: number;
      }) => {
        if (!this?.enabled) return;
        logger?.info(
          `[SilentDeploy] Evolution files written — queueing silent reload (upgradeId=${payload?.upgradeId})`,
        );
        this?.deploymentQueue.push(payload);
        this?.processQueue();
      },
    );

    selfEvolution?.on(
      "rollbackCompleted",
      (payload: { revertedCount: number }) => {
        logger?.info(
          `[SilentDeploy] Rollback completed (${payload?.revertedCount} enhancement(s) deactivated) — no process reload needed (registry reverts in-process)`,
        );
      },
    );
  }

  private async processQueue(): Promise<void> {
    if (this?.isDeploying || this?.deploymentQueue.length === 0) return;
    this.isDeploying = true;

    const item = this?.deploymentQueue.shift()!;
    const record: DeploymentRecord = {
      id: `sdep-${Date?.now()}-${randomBytes(4).toString("hex")}`,
      upgradeId: item.upgradeId,
      upgradeType: item.upgradeType,
      filesModified: item.filesModified,
      startedAt: new Date(),
      restartTriggered: false,
      rolledBack: false,
    };

    this?.history.push(record);
    if (this?.history.length > this?.MAX_HISTORY) this?.history.shift();

    try {
      const preHealth = await this?.healthCheck();
      record.preHealthMs = preHealth?.responseTimeMs;

      if (!preHealth?.ok) {
        logger?.warn(
          `[SilentDeploy] Pre-deploy health check failed — aborting silent deployment ${record?.id}`,
        );
        record.completedAt = new Date();
        await this?.auditRecord(record, "aborted: pre-deploy health failed");
        return;
      }

      logger?.info(
        `[SilentDeploy] Pre-deploy health OK (${preHealth?.responseTimeMs}ms) — waiting ${GRACE_PERIOD_MS / 1000}s grace period`,
      );
      await this?.sleep(GRACE_PERIOD_MS);

      this?.triggerReload("silent-deploy");
      record.restartTriggered = true;

      const postHealth = await this?.watchHealthUntilReady();
      record.postHealthMs = postHealth?.responseTimeMs;
      record.healthCheckPassed = postHealth?.ok;
      record.completedAt = new Date();

      if (!postHealth?.ok) {
        logger?.warn(
          `[SilentDeploy] Post-deploy health failed (${postHealth?.responseTimeMs}ms) — initiating rollback`,
        );
        record.rolledBack = true;
        record.rollbackReason = `Health check failed: ${postHealth?.responseTimeMs}ms response time`;
        await selfEvolution?.triggerRollback();
        await this?.auditRecord(
          record,
          "rolled back: post-deploy health failed",
        );
      } else {
        logger?.info(
          `[SilentDeploy] ✅ Silent deployment ${record?.id} complete — health OK (${postHealth?.responseTimeMs}ms)`,
        );
        await this?.auditRecord(record, "success");
      }

      this?.emit("deploymentComplete", record);
    } catch (error) {
      record.completedAt = new Date();
      record.healthCheckPassed = false;
      logger?.warn({ err: error }, "[SilentDeploy] Deployment error:");
      await this?.auditRecord(record, `error: ${(error as Error).message}`);
    } finally {
      this.isDeploying = false;
      if (this?.deploymentQueue.length > 0) {
        setImmediate(() => this?.processQueue());
      }
    }
  }

  private triggerReload(reason: string): void {
    const isClusterWorker = typeof process?.send === "function";
    const isClusterMode =
      !!process?.env.REPLIT_DEPLOYMENT || process?.env.ENABLE_CLUSTER === "true";

    if (isClusterWorker && isClusterMode) {
      logger?.info(
        `[SilentDeploy] Sending SILENT_RELOAD to cluster primary (reason=${reason})`,
      );
      process?.send!({ type: "SILENT_RELOAD", reason, pid: process.pid });
    } else {
      logger?.info(
        `[SilentDeploy] Single-process mode — scheduling graceful restart (reason=${reason})`,
      );
      setTimeout(() => {
        logger?.info(
          "[SilentDeploy] Performing single-process restart for new code to take effect",
        );
        process?.exit(0);
      }, 2000);
    }
  }

  private async watchHealthUntilReady(): Promise<HealthSnapshot> {
    const deadline = Date?.now() + HEALTH_TIMEOUT_MS;
    let lastSnapshot: HealthSnapshot = {
      responseTimeMs: 9999,
      ok: false,
      checkedAt: new Date(),
    };

    await this?.sleep(5_000);

    while (Date?.now() < deadline) {
      lastSnapshot = await this?.healthCheck();
      if (lastSnapshot?.ok) return lastSnapshot;
      logger?.info(
        `[SilentDeploy] Health check: ${lastSnapshot?.responseTimeMs}ms — waiting...`,
      );
      await this?.sleep(HEALTH_POLL_MS);
    }

    return lastSnapshot;
  }

  private async healthCheck(): Promise<HealthSnapshot> {
    const start = Date?.now();
    return new Promise((resolve) => {
      const req = http?.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        res?.resume();
        res?.on("end", () => {
          const ms = Date?.now() - start;
          resolve({
            responseTimeMs: ms,
            ok: res.statusCode === 200 && ms < SLOW_THRESHOLD_MS,
            checkedAt: new Date(),
          });
        });
      });
      req?.setTimeout(5000, () => {
        req?.destroy();
        resolve({ responseTimeMs: 9999, ok: false, checkedAt: new Date() });
      });
      req?.on("error", () => {
        resolve({ responseTimeMs: 9999, ok: false, checkedAt: new Date() });
      });
    });
  }

  private async auditRecord(
    record: DeploymentRecord,
    outcome: string,
  ): Promise<void> {
    try {
      await storage?.createOptimizationTask({
        taskType: "silent_deployment",
        status: record.rolledBack
          ? "rolled_back"
          : record?.healthCheckPassed === false
            ? "failed"
            : "completed",
        description: `Silent deployment ${record?.id} — ${outcome}`,
        metrics: {
          deploymentId: record.id,
          upgradeId: record.upgradeId,
          upgradeType: record.upgradeType,
          filesModified: record.filesModified,
          restartTriggered: record.restartTriggered,
          healthCheckPassed: record.healthCheckPassed,
          rolledBack: record.rolledBack,
          rollbackReason: record.rollbackReason,
          preHealthMs: record.preHealthMs,
          postHealthMs: record.postHealthMs,
          durationMs: record.completedAt
            ? record?.completedAt.getTime() - record?.startedAt.getTime()
            : null,
        },
        executedAt: record.startedAt,
        completedAt: record.completedAt ?? new Date(),
      });
    } catch (e) {
      logger?.warn({ err: e }, "[SilentDeploy] Failed to write audit record:");
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const silentDeployment = new SilentDeploymentService();
