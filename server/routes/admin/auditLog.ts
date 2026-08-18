// @ts-nocheck
/**
 * Admin Audit Log Route
 *
 * Exposes the audit_logs table to admin users for real-time monitoring.
 * Mounted at /api/admin/audit-log (registered in routes.ts).
 */

import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import { db } from "../../db.js";
import { auditLogs } from "@shared/schema";
import { desc, and, eq, gte, ilike, or, inArray } from "drizzle-orm";
import { logger } from "../../logger.js";

const router = Router();
router.use(requireAdmin);

/**
 * GET /api/admin/audit-log
 *
 * Query params:
 *   limit   (default 50, max 500)
 *   page    (default 1)
 *   risk    "low" | "medium" | "high" | "critical"
 *   action  filter by action substring
 *   userId  filter by user ID
 *   since   ISO-8601 date string
 */
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(String(req.query.limit ?? "50"), 10)));
    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
    const offset = (page - 1) * limit;

    const riskFilter = req.query.risk as string | undefined;
    const actionFilter = req.query.action as string | undefined;
    const userIdFilter = req.query.userId as string | undefined;
    const since = req.query.since as string | undefined;

    const conditions: ReturnType<typeof eq>[] = [];

    if (riskFilter && ["low", "medium", "high", "critical"].includes(riskFilter)) {
      conditions.push(eq(auditLogs.risk, riskFilter));
    }
    if (userIdFilter) {
      conditions.push(eq(auditLogs.userId, userIdFilter));
    }
    if (since) {
      try {
        conditions.push(gte(auditLogs.timestamp, new Date(since)));
      } catch {
        // invalid date — ignore filter
      }
    }
    if (actionFilter) {
      conditions.push(ilike(auditLogs.action, `%${actionFilter.slice(0, 64)}%`));
    }

    const rows = await db
      .select()
      .from(auditLogs)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditLogs.timestamp))
      .limit(limit)
      .offset(offset);

    res.json({ logs: rows, page, limit });
  } catch (err) {
    logger.warn({ err }, "[AuditLog] GET / failed");
    res.status(500).json({ error: "Failed to fetch audit log" });
  }
});

/**
 * GET /api/admin/audit-log/summary
 *
 * Returns count by risk level + top actions in the last 24 hours.
 */
router.get("/summary", async (_req, res) => {
  try {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const all = await db
      .select({
        risk: auditLogs.risk,
        action: auditLogs.action,
        result: auditLogs.result,
      })
      .from(auditLogs)
      .where(gte(auditLogs.timestamp, since))
      .limit(5000);

    const riskCounts: Record<string, number> = {};
    const actionCounts: Record<string, number> = {};
    let failures = 0;

    for (const row of all) {
      riskCounts[row.risk] = (riskCounts[row.risk] ?? 0) + 1;
      actionCounts[row.action] = (actionCounts[row.action] ?? 0) + 1;
      if (row.result === "failure" || row.result === "error") failures++;
    }

    const topActions = Object.entries(actionCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([action, count]) => ({ action, count }));

    res.json({
      period: "last_24h",
      total: all.length,
      failures,
      byRisk: riskCounts,
      topActions,
    });
  } catch (err) {
    logger.warn({ err }, "[AuditLog] GET /summary failed");
    res.status(500).json({ error: "Failed to fetch audit summary" });
  }
});

export default router;
