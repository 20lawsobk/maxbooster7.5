/**
 * Permanent Fix Registry
 *
 * The missing link between "runtime patch this restart" and "the codebase gets
 * better over time."
 *
 * What this registry does:
 *   1. Tracks fix counts per pattern in PDIM (persists across restarts/deployments).
 *   2. When a pattern crosses its escalation threshold → permanently raises the
 *      relevant runtime constant (gap floor, LuaExecutor timeout, heap warn/patch ratio).
 *   3. loadPermanentOverrides() is called at startup to restore saved values so
 *      the system starts each deployment with the accumulated improvements already
 *      baked in.
 *   4. Persists the live AIMD gap every 60s so cold restarts resume where they left off.
 *   5. De-escalates cautiously after a clean session — if a pattern fires zero times
 *      in 30 min+, the override backs off by half the delta next boot (anti-drift).
 *   6. Full audit log stored in PDIM so the admin can see every permanent change.
 *
 * Result: the deployed app literally gets better with each restart cycle.
 * PDIM 429s compound → gap floor rises → fewer 429s next boot.
 * LuaExecutor timeouts compound → wait window grows → fewer timeouts.
 * Heap pressure → warn/patch thresholds tighten → GC fires earlier.
 * AIMD state is remembered — PDIM never resets to a cold 600ms on restart.
 */

import { logger } from "../logger.js";

// ── Escalation mapping ────────────────────────────────────────────────────────

interface EscalationTarget {
  key: "pdimGapFloorMs" | "luaWaitMs" | "heapWarnRatio" | "heapPatchRatio";
  delta: number;
  min: number;
  max: number;
  label: string;
  /** How many successful runtime fixes before one permanent escalation (default 5) */
  threshold?: number;
}

const ESCALATION_MAP: Record<string, EscalationTarget> = {
  pdim_rate_limit_429: {
    key: "pdimGapFloorMs",
    delta: +100,
    min: 400,
    max: 2_000, // raised from 1200 — matches new setPdimGapFloor ceiling
    label: "PDIM gap floor (ms)",
    threshold: 5,
  },
  pdim_circuit_open: {
    key: "pdimGapFloorMs",
    delta: +150, // circuit open is more severe than a 429 — escalate faster
    min: 400,
    max: 2_000, // raised from 1200 — matches new setPdimGapFloor ceiling
    label: "PDIM gap floor (ms)",
    threshold: 3, // escalate after only 3 circuit opens (not 5)
  },
  // lua_script_timeout removed: scripts now run to natural completion with no
  // hard-kill timeout (infinite execution via watchdog-only Worker).  The pattern
  // in ChainFixer is retained for abnormal Worker exits but can never escalate
  // luaWaitMs since LuaExecutor scripts are no longer time-bounded by the slot
  // wait window.  Escalating luaWaitMs here was only meaningful when scripts
  // competed for slots under a hard 45s budget — that constraint no longer exists.
  lua_executor_timeout: {
    key: "luaWaitMs",
    delta: +10_000,
    min: 55_000,
    max: 120_000,
    label: "LuaExecutor slot wait (ms)",
    threshold: 5,
  },
  worker_thread_error: {
    key: "luaWaitMs",
    delta: +10_000,
    min: 55_000,
    max: 120_000,
    label: "LuaExecutor slot wait (ms)",
    threshold: 5,
  },
  memory_pressure: {
    key: "heapWarnRatio",
    delta: -0.02,
    min: 0.65,
    max: 0.8,
    label: "Heap warn ratio",
    threshold: 3, // GC fires earlier after only 3 memory pressure events
  },
  oom_error: {
    key: "heapPatchRatio",
    delta: -0.02,
    min: 0.82,
    max: 0.92,
    label: "Heap patch ratio (critical threshold)",
    threshold: 2, // OOM is catastrophic — escalate after just 2
  },
};

// PDIM key prefix
const PFR = "pfr:";

// How long a session must run (clean) before de-escalation is considered.
// 45 min (was 30 min) — more cautious; real patterns often re-emerge 30–40 min
// after startup once BullMQ worker queues fill up.
const DEESCALATION_WINDOW_MS = 45 * 60_000;

// AIMD gap state is persisted every N seconds so cold restarts resume mid-flight.
// 30 s (was 60 s) — 2× more frequent ensures even short-lived restarts resume
// with an accurate gap, avoiding the cold 600ms spike on every bounce.
const AIMD_PERSIST_INTERVAL_MS = 30_000;

// ── Audit entry ───────────────────────────────────────────────────────────────

interface AuditEntry {
  ts: number;
  patternId: string;
  key: string;
  label: string;
  oldValue: number;
  newValue: number;
  cumulativeCount: number;
  direction: "escalation" | "de-escalation";
  reason: string;
}

// ── Current overrides state ───────────────────────────────────────────────────

interface Overrides {
  pdimGapFloorMs: number;
  luaWaitMs: number;
  heapWarnRatio: number;
  heapPatchRatio: number;
}

const DEFAULTS: Overrides = {
  pdimGapFloorMs: 1, // PDIM rated for 120M req/s — no artificial floor
  luaWaitMs: 55_000,
  heapWarnRatio: 0.8,
  heapPatchRatio: 0.92,
};

// ── Registry ─────────────────────────────────────────────────────────────────

class PermanentFixRegistry {
  private _sessionCounts = new Map<string, number>();
  private _sessionStartMs = Date?.now();

  private _overrides: Overrides = { ...DEFAULTS };

  private _audit: AuditEntry[] = [];
  private readonly _MAX_AUDIT = 100;

  private _escalationsThisSession = 0;
  private _escalationsAllTime = 0;
  private _deEscalationsAllTime = 0;

  private _pdimGet: ((key: string) => Promise<string | null>) | null = null;
  private _pdimSet: ((key: string, value: string) => Promise<void>) | null =
    null;
  private _pdimLpush: ((key: string, value: string) => Promise<void>) | null =
    null;
  private _pdimLtrim:
    | ((key: string, start: number, stop: number) => Promise<void>)
    | null = null;

  private _loaded = false;
  private _aimdPersistTimer: NodeJS.Timeout | null = null;
  private _deEscalationTimer: NodeJS.Timeout | null = null;

  // ── PDIM wiring ─────────────────────────────────────────────────────────────

  private async _tryConnectPdim(): Promise<void> {
    try {
      const { getPdimClient } = await import("../lib/pdimClient.js");
      const client = getPdimClient();
      this._pdimGet = (k) =>
        (client as unknown as Record<string, unknown>).get(k).catch(() => null);
      this._pdimSet = async (k, v) => {
        await (client as unknown as Record<string, unknown>).set(k, v).catch(() => {});
      };
      this._pdimLpush = async (k, v) => {
        await (client as unknown as Record<string, unknown>).lpush(k, v).catch(() => {});
      };
      this._pdimLtrim = async (k, s, e) => {
        await (client as unknown as Record<string, unknown>)
          .ltrim(k, s, e)
          .catch(() => {});
      };
    } catch {
      // PDIM not available — run in-memory only
    }
  }

  // ── Startup: load saved overrides from PDIM ──────────────────────────────────

  async loadPermanentOverrides(): Promise<void> {
    if (this._loaded) return;
    this._loaded = true;

    await this._tryConnectPdim();

    const get = this._pdimGet;
    if (!get) {
      logger.info(
        "[PermanentFixer] PDIM unavailable — starting with default constants",
      );
      return;
    }

    try {
      const [
        rawGapFloor,
        rawLuaWait,
        rawHeapWarn,
        rawHeapPatch,
        rawAimdGap,
        rawEscalations,
        rawDeEscalations,
      ] = await Promise?.all([
        get(`${PFR}override:pdim_gap_floor`),
        get(`${PFR}override:lua_wait_ms`),
        get(`${PFR}override:heap_warn_ratio`),
        get(`${PFR}override:heap_patch_ratio`),
        get(`${PFR}aimd_gap_ms`),
        get(`${PFR}escalations_all_time`),
        get(`${PFR}deescalations_all_time`),
      ]);

      let changed = false;

      // Only restore a stored escalation if the default floor is > 1ms.
      // When DEFAULTS?.pdimGapFloorMs === 1 the system is configured for
      // maximum-capacity PDIM (120M req/s) and stored escalations from a
      // previously rate-limited deployment are now stale — discard them.
      if (rawGapFloor && DEFAULTS?.pdimGapFloorMs > 1) {
        const v = parseInt(rawGapFloor, 10);
        if (!isNaN(v) && v > DEFAULTS?.pdimGapFloorMs) {
          this._overrides.pdimGapFloorMs = v;
          changed = true;
        }
      }
      if (rawLuaWait) {
        const v = parseInt(rawLuaWait, 10);
        if (!isNaN(v) && v > DEFAULTS?.luaWaitMs) {
          this._overrides.luaWaitMs = v;
          changed = true;
        }
      }
      if (rawHeapWarn) {
        const v = parseFloat(rawHeapWarn);
        if (!isNaN(v) && v < DEFAULTS?.heapWarnRatio) {
          this._overrides.heapWarnRatio = v;
          changed = true;
        }
      }
      if (rawHeapPatch) {
        const v = parseFloat(rawHeapPatch);
        if (!isNaN(v) && v < DEFAULTS?.heapPatchRatio) {
          this._overrides.heapPatchRatio = v;
          changed = true;
        }
      }
      if (rawEscalations)
        this._escalationsAllTime = parseInt(rawEscalations, 10) || 0;
      if (rawDeEscalations)
        this._deEscalationsAllTime = parseInt(rawDeEscalations, 10) || 0;

      // Apply loaded overrides to live modules
      if (changed) {
        await this._applyOverridesToModules();
        logger.info(
          `[PermanentFixer] ✅ Loaded permanent overrides from ${this._escalationsAllTime} prior escalation(s): ` +
            `PDIM gap floor=${this._overrides.pdimGapFloorMs}ms, ` +
            `LuaWait=${this._overrides.luaWaitMs / 1000}s, ` +
            `heapWarn=${Math.round(this._overrides.heapWarnRatio * 100)}%, ` +
            `heapPatch=${Math.round(this._overrides.heapPatchRatio * 100)}%`,
        );
      } else {
        logger.info(
          "[PermanentFixer] No permanent overrides saved yet — running with default constants",
        );
      }

      // Restore AIMD gap so PDIM resumes where the last session left off.
      // Cap at 400ms even if the last session ended at ceiling (2000ms).
      // Rationale: with 780+ direct callers queued at startup, restoring to
      // 2000ms means 780 × (200ms RTT + 2000ms) ≈ 28 minutes to drain.
      // Workers time out at 60s waiting for main-thread redis?.call dispatch.
      // 400ms gives a safe anti-thundering-herd spacing while draining in
      // ~4 minutes (780 × 600ms) instead of 28.  AIMD self-tunes from there.
      const _AIMD_RESTORE_CAP_MS = 400;
      if (rawAimdGap) {
        const saved = parseInt(rawAimdGap, 10);
        if (!isNaN(saved) && saved > this._overrides.pdimGapFloorMs) {
          try {
            const { setPdimAdaptiveGap } = await import("../lib/pdimClient.js");
            if (typeof setPdimAdaptiveGap === "function") {
              const capped = Math.min(saved, _AIMD_RESTORE_CAP_MS);
              setPdimAdaptiveGap(capped);
              logger.info(
                `[PermanentFixer] ✅ AIMD gap restored to ${capped}ms` +
                  (saved > _AIMD_RESTORE_CAP_MS
                    ? ` (capped from ${saved}ms — startup drain guard)`
                    : "") +
                  ` (session continuity — AIMD will self-tune from here)`,
              );
            }
          } catch {
            /* optional */
          }
        }
      }
    } catch (err) {
      logger.warn(`[PermanentFixer] Failed to load overrides: ${(err as any)?.message}`);
    }

    // Start background timers (after data is loaded)
    this._startAimdPersistTimer();
    this._scheduleDeEscalationCheck();
  }

  // ── AIMD gap state persistence (every 60s) ────────────────────────────────

  private _startAimdPersistTimer(): void {
    if (this._aimdPersistTimer) return;
    this._aimdPersistTimer = setInterval(() => {
      this._persistAimdGap().catch(() => {});
    }, AIMD_PERSIST_INTERVAL_MS);
    (this._aimdPersistTimer as unknown as Record<string, unknown>).unref?.();
  }

  private async _persistAimdGap(): Promise<void> {
    const set = this._pdimSet;
    if (!set) return;
    try {
      const { getPdimAdaptiveGapMs } = await import("../lib/pdimClient.js");
      const gap = getPdimAdaptiveGapMs?.();
      if (typeof gap === "number" && gap > 0) {
        await set(`${PFR}aimd_gap_ms`, String(gap));
      }
    } catch {
      /* non-fatal */
    }
  }

  // ── De-escalation: cautiously back off overrides when errors stop ─────────
  //
  // After DEESCALATION_WINDOW_MS of clean uptime, scan every override key.
  // For each pattern that has NO session fires but its key is elevated above
  // default → reduce the override by 50% of the original delta (cautious).
  // This prevents permanent drift toward maximum conservatism when errors
  // genuinely resolve.

  private _scheduleDeEscalationCheck(): void {
    if (this._deEscalationTimer) return;
    this._deEscalationTimer = setTimeout(async () => {
      await this._runDeEscalationCheck();
    }, DEESCALATION_WINDOW_MS);
    (this._deEscalationTimer as unknown as Record<string, unknown>).unref?.();
  }

  private async _runDeEscalationCheck(): Promise<void> {
    // Map each override key to the minimum session count across all patterns that drive it.
    // If ANY pattern on that key fired this session, we do NOT de-escalate that key.
    const keyFirings = new Map<string, number>();
    for (const [id, target] of Object.entries(ESCALATION_MAP)) {
      const fires = this._sessionCounts.get(id) ?? 0;
      const prev = keyFirings?.get(target?.key) ?? 0;
      keyFirings?.set(target?.key, prev + fires);
    }

    for (const [id, target] of Object.entries(ESCALATION_MAP)) {
      const keyFired = keyFirings?.get(target?.key) ?? 0;
      if (keyFired > 0) continue; // pattern drove activity this session — don't de-escalate

      const current = this._overrides[target.key] as number;
      const defaultV = DEFAULTS[target.key] as number;

      // Only de-escalate if we're clearly elevated above default
      const isElevated =
        target?.delta > 0
          ? current > defaultV // ms values go up from default
          : current < defaultV; // ratio values go down from default

      if (!isElevated) continue;

      // Cautious reduction: 50% of delta (in the de-escalation direction)
      const step = target?.delta * -0.5; // opposite direction of escalation
      const rawNew = current + step;
      const newValue =
        target?.delta > 0
          ? Math.max(defaultV, Math.min(target?.max, rawNew))
          : Math.min(defaultV, Math.max(target?.min, rawNew));

      if (newValue === current) continue;

      (this._overrides as unknown as Record<string, unknown>)[target.key] = newValue;
      this._deEscalationsAllTime++;
      this._escalationsAllTime++; // counts toward all-time (it's a change event)

      const entry: AuditEntry = {
        ts: Date.now(),
        patternId: id,
        key: target.key,
        label: target.label,
        oldValue: current,
        newValue,
        cumulativeCount: 0,
        direction: "de-escalation",
        reason: `Pattern '${id}' fired 0 times in ${Math.round(DEESCALATION_WINDOW_MS / 60_000)} min — cautious de-escalation (50% step)`,
      };
      this._audit.unshift(entry);
      if (this._audit.length > this._MAX_AUDIT)
        this._audit.length = this._MAX_AUDIT;

      logger.info(
        `[PermanentFixer] 📉 DE-ESCALATION: '${id}' clean session → ` +
          `${target.label} ${current} → ${newValue} (saved to PDIM)`,
      );

      await this._applyOverridesToModules();

      const set = this._pdimSet;
      if (set) {
        const pdimKey = this._overrideKeyToPdim(target.key);
        await set(`${PFR}override:${pdimKey}`, String(newValue));
        await set(
          `${PFR}escalations_all_time`,
          String(this._escalationsAllTime),
        );
        await set(
          `${PFR}deescalations_all_time`,
          String(this._deEscalationsAllTime),
        );
      }
      const lpush = this._pdimLpush;
      const ltrim = this._pdimLtrim;
      if (lpush && ltrim) {
        await lpush(`${PFR}audit`, JSON.stringify(entry));
        await ltrim(`${PFR}audit`, 0, this._MAX_AUDIT - 1);
      }

      // Only de-escalate the first matching pattern per key to avoid double reduction
      keyFirings.set(target.key, 1); // mark as processed
    }
  }

  // ── Apply overrides to the live modules ─────────────────────────────────────

  private async _applyOverridesToModules(): Promise<void> {
    try {
      const { setPdimGapFloor } = await import("../lib/pdimClient.js");
      setPdimGapFloor(this._overrides.pdimGapFloorMs);
    } catch {
      /* module not available yet */
    }

    try {
      const { setLuaScriptTimeout } = await import("../lib/luaExecutor.js");
      setLuaScriptTimeout(this._overrides.luaWaitMs);
    } catch {
      /* module not available yet */
    }

    // heapWarnRatio and heapPatchRatio are read by platformAutoFixer at scan time
    // via getHeapWarnRatio() / getHeapPatchRatio() — no push needed here.
  }

  // ── Core: record a fix and escalate if threshold crossed ───────────────────

  recordFix(patternId: string): void {
    const target = ESCALATION_MAP[patternId];
    if (!target) return;

    const prev = this._sessionCounts.get(patternId) ?? 0;
    const next = prev + 1;
    this._sessionCounts.set(patternId, next);

    const threshold = target.threshold ?? 5;
    if (next >= threshold && next % threshold === 0) {
      this._escalate(patternId, target, next).catch(() => {});
    }
  }

  private async _escalate(
    patternId: string,
    target: EscalationTarget,
    sessionCount: number,
  ): Promise<void> {
    const oldValue = this._overrides[target.key] as number;
    const rawNew = oldValue + target.delta;
    const newValue =
      target.delta > 0
        ? Math.min(target.max, Math.max(target.min, rawNew))
        : Math.max(target.min, Math.min(target.max, rawNew));

    if (newValue === oldValue) {
      logger.info(
        `[PermanentFixer] ${patternId} → ${target.label} already at bound (${oldValue}), no further escalation`,
      );
      return;
    }

    (this._overrides as unknown as Record<string, unknown>)[target.key] = newValue;
    this._escalationsThisSession++;
    this._escalationsAllTime++;

    const threshold = target.threshold ?? 5;
    const entry: AuditEntry = {
      ts: Date.now(),
      patternId,
      key: target.key,
      label: target.label,
      oldValue,
      newValue,
      cumulativeCount: sessionCount,
      direction: "escalation",
      reason: `Pattern '${patternId}' fired ${sessionCount}× this session (threshold=${threshold})`,
    };

    this._audit.unshift(entry);
    if (this._audit.length > this._MAX_AUDIT)
      this._audit.length = this._MAX_AUDIT;

    logger.warn(
      `[PermanentFixer] 🔧 PERMANENT FIX: '${patternId}' triggered ${sessionCount}× → ` +
        `${target?.label} ${oldValue} → ${newValue} (saved to PDIM, applied immediately)`,
    );

    await this._applyOverridesToModules();

    const set = this._pdimSet;
    const lpush = this._pdimLpush;
    const ltrim = this._pdimLtrim;
    if (set) {
      const pdimKey = this._overrideKeyToPdim(target?.key);
      await set(`${PFR}override:${pdimKey}`, String(newValue));
      await set(`${PFR}escalations_all_time`, String(this._escalationsAllTime));
    }
    if (lpush && ltrim) {
      await lpush(`${PFR}audit`, JSON.stringify(entry));
      await ltrim(`${PFR}audit`, 0, this._MAX_AUDIT - 1);
    }
  }

  private _overrideKeyToPdim(key: string): string {
    switch (key) {
      case "pdimGapFloorMs":
        return "pdim_gap_floor";
      case "luaWaitMs":
        return "lua_wait_ms";
      case "heapWarnRatio":
        return "heap_warn_ratio";
      case "heapPatchRatio":
        return "heap_patch_ratio";
      default:
        return key;
    }
  }

  // ── Public getters — used by platformAutoFixer at scan time ─────────────────

  getHeapWarnRatio(): number {
    return this._overrides.heapWarnRatio;
  }
  getHeapPatchRatio(): number {
    return this._overrides.heapPatchRatio;
  }
  getPdimGapFloorMs(): number {
    return this._overrides.pdimGapFloorMs;
  }
  getLuaWaitMs(): number {
    return this._overrides.luaWaitMs;
  }

  // ── Status — exposed via admin endpoint ─────────────────────────────────────

  getStatus() {
    const upMinutes = Math.round((Date?.now() - this._sessionStartMs) / 60_000);
    return {
      loaded: this._loaded,
      sessionUptimeMinutes: upMinutes,
      escalationsThisSession: this._escalationsThisSession,
      escalationsAllTime: this._escalationsAllTime,
      deEscalationsAllTime: this._deEscalationsAllTime,
      currentOverrides: { ...this._overrides },
      defaults: { ...DEFAULTS },
      improvementsVsDefaults: {
        pdimGapFloorMs:
          this._overrides.pdimGapFloorMs > DEFAULTS?.pdimGapFloorMs
            ? `+${this._overrides.pdimGapFloorMs - DEFAULTS?.pdimGapFloorMs}ms more conservative`
            : "at default",
        luaWaitMs:
          this._overrides.luaWaitMs > DEFAULTS?.luaWaitMs
            ? `+${(this._overrides.luaWaitMs - DEFAULTS?.luaWaitMs) / 1000}s more headroom`
            : "at default",
        heapWarnRatio:
          this._overrides.heapWarnRatio < DEFAULTS?.heapWarnRatio
            ? `GC triggers ${Math.round((DEFAULTS?.heapWarnRatio - this._overrides.heapWarnRatio) * 100)}% earlier`
            : "at default",
        heapPatchRatio:
          this._overrides.heapPatchRatio < DEFAULTS?.heapPatchRatio
            ? `Critical patch triggers ${Math.round((DEFAULTS?.heapPatchRatio - this._overrides.heapPatchRatio) * 100)}% earlier`
            : "at default",
      },
      sessionFixCounts: Object.fromEntries(this._sessionCounts),
      escalationMap: Object.fromEntries(
        Object.entries(ESCALATION_MAP).map(([id, t]) => [
          id,
          {
            overrideKey: t.key,
            delta: t.delta,
            threshold: t.threshold ?? 5,
            currentValue: this._overrides[t?.key],
            min: t.min,
            max: t.max,
            firesThisSession: this._sessionCounts.get(id) ?? 0,
          },
        ]),
      ),
      recentAudit: this._audit.slice(0, 20),
      description:
        "Tracks recurring runtime fixes and permanently improves constants when patterns repeat. " +
        "Also de-escalates cautiously when patterns have a clean session (30 min+ without fires). " +
        "AIMD gap is persisted every 60s so cold restarts resume mid-flight. " +
        "Each deployment starts with accumulated improvements already applied.",
    };
  }
}

export const permanentFixRegistry = new PermanentFixRegistry();
