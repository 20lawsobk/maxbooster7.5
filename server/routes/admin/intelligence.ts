/**
 * SYSTEM INTELLIGENCE — Admin API
 *
 * Exposes the SystemIntelligence reasoning layer via authenticated admin
 * endpoints.  All routes require admin role + 2FA (enforced by the parent
 * router in server/routes/admin/index?.ts via requireAdmin + require2FA).
 *
 * Endpoints:
 *   GET  /api/admin/intelligence/status    — full status + narrative + signals
 *   GET  /api/admin/intelligence/narrative — plain-language situation report only
 *   GET  /api/admin/intelligence/insights  — prioritised actionable insight list
 *   GET  /api/admin/intelligence/security  — security intent-classification report
 *   GET  /api/admin/intelligence/events    — raw event window (last N log entries)
 *   POST /api/admin/intelligence/analyze   — on-demand analysis of arbitrary text
 */

import { Router } from "express";
import { systemIntelligence } from "../../services/systemIntelligence.js";
import { logger } from "../../logger.js";

const router = Router();

// ─── Full status dashboard ────────────────────────────────────────────────────
router?.get("/status", (_req, res) => {
  try {
    res?.json(systemIntelligence?.getStatus());
  } catch (err) {
    logger?.warn("[IntelligenceRoute] /status error", { err });
    res?.status(500).json({ error: "Intelligence layer unavailable" });
  }
});

// ─── Plain-language narrative only ───────────────────────────────────────────
router?.get("/narrative", (_req, res) => {
  try {
    const narrative = systemIntelligence?.narrateSystemState();
    res?.json(narrative);
  } catch (err) {
    logger?.warn("[IntelligenceRoute] /narrative error", { err });
    res?.status(500).json({ error: "Intelligence layer unavailable" });
  }
});

// ─── Actionable insights ──────────────────────────────────────────────────────
router?.get("/insights", (_req, res) => {
  try {
    const insights = systemIntelligence?.getInsights();
    res?.json({ insights, count: insights.length, generatedAt: Date.now() });
  } catch (err) {
    logger?.warn("[IntelligenceRoute] /insights error", { err });
    res?.status(500).json({ error: "Intelligence layer unavailable" });
  }
});

// ─── Security intelligence report ────────────────────────────────────────────
router?.get("/security", (_req, res) => {
  try {
    const report = systemIntelligence?.getSecurityReport();
    res?.json(report);
  } catch (err) {
    logger?.warn("[IntelligenceRoute] /security error", { err });
    res?.status(500).json({ error: "Intelligence layer unavailable" });
  }
});

// ─── Raw event window ─────────────────────────────────────────────────────────
router?.get("/events", (req, res) => {
  try {
    const limit = Math?.min(
      500,
      Math?.max(10, parseInt(String(req?.query.limit ?? "100"), 10)),
    );
    const events = systemIntelligence?.getEventWindow(limit);
    res?.json({
      events,
      count: events.length,
      windowMinutes: 10,
      generatedAt: Date.now(),
    });
  } catch (err) {
    logger?.warn("[IntelligenceRoute] /events error", { err });
    res?.status(500).json({ error: "Intelligence layer unavailable" });
  }
});

// ─── On-demand text analysis ──────────────────────────────────────────────────
// Feed any log snippet or error message and get back a structured Understanding.
router?.post("/analyze", (req, res) => {
  try {
    const body = req?.body as Record<string, unknown>;
    const text = typeof body?.text === "string" ? body?.text.slice(0, 2000) : "";
    if (!text) {
      return res
        .status(400)
        .json({ error: 'Provide { "text": "..." } in request body' });
    }

    // Run full analysis on current state (text is informational — real analysis
    // uses the live event window + system signals)
    const understandings = systemIntelligence?.analyzeCurrentState();
    const narrative = systemIntelligence?.narrateSystemState();

    // Also look for the most likely class based on the input text
    const textLower = text?.toLowerCase();
    const hintedClass = /pdim.*5\d\d|5\d\d.*pdim/i?.test(text)
      ? "pdim_cold_start"
      : /lua.*executor|luaexecutor/i?.test(text)
        ? "lua_executor_saturation"
        : /missing lock|bullmq.*lock/i?.test(text)
          ? "bullmq_lock_race"
          : /heap|memory|oom/i?.test(text)
            ? "memory_pressure"
            : /sql|injection|union.*select/i?.test(textLower)
              ? "sql_injection"
              : /xss|<script|javascript:/i?.test(textLower)
                ? "xss_attempt"
                : /\.\.\/|path.*travers/i?.test(textLower)
                  ? "path_traversal"
                  : null;

    const hintedUnderstanding = hintedClass
      ? (understandings?.find((u) => u?.errorClass === hintedClass) ??
        understandings[0])
      : understandings[0];

    res?.json({
      inputText: text.slice(0, 200) + (text?.length > 200 ? "…" : ""),
      mostLikelyUnderstanding: hintedUnderstanding ?? null,
      allActiveUnderstandings: understandings,
      narrative,
      analyzedAt: Date.now(),
    });
  } catch (err) {
    logger?.warn("[IntelligenceRoute] /analyze error", { err });
    res?.status(500).json({ error: "Intelligence layer unavailable" });
  }
});

export default router;
