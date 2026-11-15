// @ts-nocheck
/**
 * Admin Audit Log Route
 *
 * Exposes the audit_logs table to admin users for real-time monitoring.
 * Mounted at /api/admin/audit-log (registered in routes.ts).
 */

import { Router } from "express";
import { requireAdmin, requireAuth, require2FA } from "../../middleware/auth.js";
import { db } from "../../db.js";
import { auditLogs } from "@shared/schema";
import { desc, and, eq, gte, ilike } from "drizzle-orm";
import { logger } from "../../logger.js";

const router = Router();
// Resolve either the session or the Bearer-token fallback before checking the
// privileged role. Audit records contain sensitive account and IP data, so
// apply the same 2FA requirement as the rest of the admin surface.
router.use(requireAuth, requireAdmin, require2FA);

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
    const rawLimit = parseInt(String(req.query.limit ?? "50"), 10);
    const rawPage = parseInt(String(req.query.page ?? "1"), 10);
    const limit =
      Number.isFinite(rawLimit) && rawLimit >= 1 ? Math.min(500, rawLimit) : 50;
    const page =
      Number.isFinite(rawPage) && rawPage >= 1 ? rawPage : 1;
    const offset = Math.min((page - 1) * limit, 100_000);

    const riskFilter =
      typeof req.query.risk === "string" ? req.query.risk : undefined;
    const actionFilter =
      typeof req.query.action === "string" ? req.query.action : undefined;
    const userIdFilter =
      typeof req.query.userId === "string" ? req.query.userId : undefined;
    const since =
      typeof req.query.since === "string" ? req.query.since : undefined;

    const conditions: ReturnType<typeof eq>[] = [];

    if (
      riskFilter &&
      !["low", "medium", "high", "critical"].includes(riskFilter)
    ) {
      return res.status(400).json({ error: "Invalid risk filter" });
    }
    if (riskFilter) {
      conditions.push(eq(auditLogs.risk, riskFilter));
    }
    if (userIdFilter) {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
          userIdFilter,
        )
      ) {
        return res.status(400).json({ error: "Invalid user ID filter" });
      }
      conditions.push(eq(auditLogs.userId, userIdFilter));
    }
    if (since) {
      const sinceDate = new Date(since);
      if (Number.isNaN(sinceDate.getTime())) {
        return res.status(400).json({ error: "Invalid since date" });
      }
      conditions.push(gte(auditLogs.timestamp, sinceDate));
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
