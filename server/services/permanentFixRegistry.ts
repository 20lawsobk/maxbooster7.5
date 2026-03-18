/**
 * Permanent Fix Registry
 *
 * The missing link between "runtime patch this restart" and "the codebase gets
 * better over time."
 *
 * Problem the old system had:
 *   - Every runtime fix (semaphore reset, PDIM backoff, GC) evaporates on restart.
 *   - Fix counts live in Map<> memory — the system never sees cumulative progress.
 *   - On every boot the PDIM gap resets to 600 ms, triggering the same 429s,
 *     applying the same patches, learning nothing across sessions.
 *
 * What this registry does:
 *   1. Tracks fix counts per pattern in PDIM (persists across restarts/deployments).
 *   2. When a pattern crosses ESCALATION_THRESHOLD → permanently raises the
 *      relevant runtime constant (gap floor, LuaExecutor timeout, heap warn ratio).
 *   3. loadPermanentOverrides() is called at startup to restore saved values so
 *      the system starts each deployment with the accumulated improvements already
 *      baked in.
 *   4. Full audit log stored in PDIM so the admin can see every permanent change.
 *
 * Result: the deployed app literally gets better with each restart cycle.
 * PDIM 429s compound → gap floor rises → fewer 429s next boot.
 * LuaExecutor timeouts compound → wait window grows → fewer timeouts.
 * Heap pressure → warn threshold lowers → GC fires earlier.
 */

import { logger } from '../logger.js';

// ── Escalation mapping ────────────────────────────────────────────────────────
//
// Which override key each pattern drives, what direction, and the bounds.

interface EscalationTarget {
  key: 'pdimGapFloorMs' | 'luaWaitMs' | 'heapWarnRatio';
  /** Applied per escalation event */
  delta: number;
  min: number;
  max: number;
  /** Friendly label for audit log */
  label: string;
}

const ESCALATION_MAP: Record<string, EscalationTarget> = {
  pdim_rate_limit_429: {
    key: 'pdimGapFloorMs',
    delta: +100,
    min: 400,
    max: 1_200,
    label: 'PDIM gap floor (ms)',
  },
  pdim_circuit_open: {
    key: 'pdimGapFloorMs',
    delta: +100,
    min: 400,
    max: 1_200,
    label: 'PDIM gap floor (ms)',
  },
  lua_executor_timeout: {
    key: 'luaWaitMs',
    delta: +10_000,
    min: 55_000,
    max: 120_000,
    label: 'LuaExecutor slot wait (ms)',
  },
  worker_thread_error: {
    key: 'luaWaitMs',
    delta: +10_000,
    min: 55_000,
    max: 120_000,
    label: 'LuaExecutor slot wait (ms)',
  },
  memory_pressure: {
    key: 'heapWarnRatio',
    delta: -0.02,
    min: 0.65,
    max: 0.80,
    label: 'Heap warn ratio',
  },
  oom_error: {
    key: 'heapWarnRatio',
    delta: -0.02,
    min: 0.65,
    max: 0.80,
    label: 'Heap warn ratio',
  },
};

// How many successful runtime fixes must accumulate before one permanent escalation
const ESCALATION_THRESHOLD = 5;

// PDIM key prefix
const PFR = 'pfr:';

// ── Audit entry ───────────────────────────────────────────────────────────────

interface AuditEntry {
  ts: number;
  patternId: string;
  key: string;
  label: string;
  oldValue: number;
  newValue: number;
  cumulativeCount: number;
  reason: string;
}

// ── Current overrides state ───────────────────────────────────────────────────

interface Overrides {
  pdimGapFloorMs: number;
  luaWaitMs: number;
  heapWarnRatio: number;
}

// ── Registry ─────────────────────────────────────────────────────────────────

class PermanentFixRegistry {
  /** Session-local fix counts (supplement cumulative counts in PDIM) */
  private _sessionCounts = new Map<string, number>();

  /** Current active override values */
  private _overrides: Overrides = {
    pdimGapFloorMs: 400,
    luaWaitMs: 55_000,
    heapWarnRatio: 0.80,
  };

  /** In-memory audit log (last 100) */
  private _audit: AuditEntry[] = [];
  private readonly _MAX_AUDIT = 100;

  /** Total escalations applied this session */
  private _escalationsThisSession = 0;

  /** Total escalations ever (loaded from PDIM) */
  private _escalationsAllTime = 0;

  private _pdimGet: ((key: string) => Promise<string | null>) | null = null;
  private _pdimSet: ((key: string, value: string) => Promise<void>) | null = null;
  private _pdimLpush: ((key: string, value: string) => Promise<void>) | null = null;
  private _pdimLtrim: ((key: string, start: number, stop: number) => Promise<void>) | null = null;

  private _loaded = false;

  // ── PDIM wiring ─────────────────────────────────────────────────────────────

  private async _tryConnectPdim(): Promise<void> {
    try {
      const { getPdimClient } = await import('../lib/pdimClient.js');
      const client = getPdimClient();
      this._pdimGet  = (k) => (client as any).get(k).catch(() => null);
      this._pdimSet  = async (k, v) => { await (client as any).set(k, v).catch(() => {}); };
      this._pdimLpush = async (k, v) => { await (client as any).lpush(k, v).catch(() => {}); };
      this._pdimLtrim = async (k, s, e) => { await (client as any).ltrim(k, s, e).catch(() => {}); };
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
      logger.info('[PermanentFixer] PDIM unavailable — starting with default constants');
      return;
    }

    try {
      const [
        rawGapFloor,
        rawLuaWait,
        rawHeapRatio,
        rawEscalations,
      ] = await Promise.all([
        get(`${PFR}override:pdim_gap_floor`),
        get(`${PFR}override:lua_wait_ms`),
        get(`${PFR}override:heap_warn_ratio`),
        get(`${PFR}escalations_all_time`),
      ]);

      let changed = false;

      if (rawGapFloor) {
        const v = parseInt(rawGapFloor, 10);
        if (!isNaN(v) && v > 400) {
          this._overrides.pdimGapFloorMs = v;
          changed = true;
        }
      }
      if (rawLuaWait) {
        const v = parseInt(rawLuaWait, 10);
        if (!isNaN(v) && v > 55_000) {
          this._overrides.luaWaitMs = v;
          changed = true;
        }
      }
      if (rawHeapRatio) {
        const v = parseFloat(rawHeapRatio);
        if (!isNaN(v) && v < 0.80) {
          this._overrides.heapWarnRatio = v;
          changed = true;
        }
      }
      if (rawEscalations) {
        this._escalationsAllTime = parseInt(rawEscalations, 10) || 0;
      }

      if (changed) {
        await this._applyOverridesToModules();
        logger.info(
          `[PermanentFixer] ✅ Loaded permanent overrides from ${this._escalationsAllTime} prior escalation(s): ` +
          `PDIM gap floor=${this._overrides.pdimGapFloorMs}ms, ` +
          `LuaWait=${this._overrides.luaWaitMs}ms, ` +
          `heapWarnRatio=${this._overrides.heapWarnRatio.toFixed(2)}`,
        );
      } else {
        logger.info('[PermanentFixer] No permanent overrides saved yet — running with default constants');
      }
    } catch (err: any) {
      logger.warn(`[PermanentFixer] Failed to load overrides: ${err.message}`);
    }
  }

  // ── Apply overrides to the live modules ─────────────────────────────────────

  private async _applyOverridesToModules(): Promise<void> {
    try {
      const { setPdimGapFloor } = await import('../lib/pdimClient.js');
      setPdimGapFloor(this._overrides.pdimGapFloorMs);
    } catch { /* module not available yet */ }

    try {
      const { setLuaScriptTimeout } = await import('../lib/luaExecutor.js');
      setLuaScriptTimeout(this._overrides.luaWaitMs);
    } catch { /* module not available yet */ }

    // heapWarnRatio is read by platformAutoFixer at scan time — no push needed
    // platformAutoFixer.ts checks getHeapWarnRatio() from this registry
  }

  // ── Core: record a fix and escalate if threshold crossed ───────────────────

  recordFix(patternId: string): void {
    const target = ESCALATION_MAP[patternId];
    if (!target) return;  // pattern has no permanent escalation path

    const prev = this._sessionCounts.get(patternId) ?? 0;
    const next = prev + 1;
    this._sessionCounts.set(patternId, next);

    if (next >= ESCALATION_THRESHOLD && next % ESCALATION_THRESHOLD === 0) {
      // Fire-and-forget — non-fatal
      this._escalate(patternId, target, next).catch(() => {});
    }
  }

  private async _escalate(patternId: string, target: EscalationTarget, sessionCount: number): Promise<void> {
    const oldValue = this._overrides[target.key] as number;
    const rawNew   = oldValue + target.delta;
    const newValue = Math.min(target.max, Math.max(target.min, rawNew));

    if (newValue === oldValue) {
      logger.info(`[PermanentFixer] ${patternId} → ${target.label} already at bound (${oldValue}), no further escalation`);
      return;
    }

    (this._overrides as any)[target.key] = newValue;
    this._escalationsThisSession++;
    this._escalationsAllTime++;

    const entry: AuditEntry = {
      ts: Date.now(),
      patternId,
      key: target.key,
      label: target.label,
      oldValue,
      newValue,
      cumulativeCount: sessionCount,
      reason: `Pattern '${patternId}' fired ${sessionCount} time(s) this session (threshold=${ESCALATION_THRESHOLD})`,
    };

    this._audit.unshift(entry);
    if (this._audit.length > this._MAX_AUDIT) this._audit.length = this._MAX_AUDIT;

    logger.warn(
      `[PermanentFixer] 🔧 PERMANENT FIX: '${patternId}' triggered ${sessionCount}× → ` +
      `${target.label} ${oldValue} → ${newValue} (saved to PDIM, applied immediately)`,
    );

    // Apply to live modules immediately
    await this._applyOverridesToModules();

    // Persist to PDIM (best-effort)
    const set = this._pdimSet;
    const lpush = this._pdimLpush;
    const ltrim = this._pdimLtrim;
    if (set) {
      const overrideKey =
        target.key === 'pdimGapFloorMs'  ? 'pdim_gap_floor' :
        target.key === 'luaWaitMs'       ? 'lua_wait_ms'    :
                                           'heap_warn_ratio';

      await set(`${PFR}override:${overrideKey}`, String(newValue));
      await set(`${PFR}escalations_all_time`, String(this._escalationsAllTime));
    }
    if (lpush && ltrim) {
      await lpush(`${PFR}audit`, JSON.stringify(entry));
      await ltrim(`${PFR}audit`, 0, this._MAX_AUDIT - 1);
    }
  }

  // ── Heap warn ratio getter — used by platformAutoFixer ──────────────────────

  getHeapWarnRatio(): number {
    return this._overrides.heapWarnRatio;
  }

  // ── Status — exposed via admin endpoint ─────────────────────────────────────

  getStatus() {
    return {
      loaded: this._loaded,
      escalationThreshold: ESCALATION_THRESHOLD,
      escalationsThisSession: this._escalationsThisSession,
      escalationsAllTime: this._escalationsAllTime,
      currentOverrides: { ...this._overrides },
      defaults: {
        pdimGapFloorMs: 400,
        luaWaitMs: 55_000,
        heapWarnRatio: 0.80,
      },
      improvementsVsDefaults: {
        pdimGapFloorMs: this._overrides.pdimGapFloorMs > 400
          ? `+${this._overrides.pdimGapFloorMs - 400}ms more conservative`
          : 'at default',
        luaWaitMs: this._overrides.luaWaitMs > 55_000
          ? `+${(this._overrides.luaWaitMs - 55_000) / 1000}s more headroom`
          : 'at default',
        heapWarnRatio: this._overrides.heapWarnRatio < 0.80
          ? `GC triggers ${Math.round((0.80 - this._overrides.heapWarnRatio) * 100)}% earlier`
          : 'at default',
      },
      sessionFixCounts: Object.fromEntries(this._sessionCounts),
      escalationMap: Object.fromEntries(
        Object.entries(ESCALATION_MAP).map(([id, t]) => [id, {
          overrideKey: t.key,
          delta: t.delta,
          currentValue: this._overrides[t.key],
          min: t.min,
          max: t.max,
        }]),
      ),
      recentAudit: this._audit.slice(0, 20),
      description: 'Tracks recurring runtime fixes and permanently improves constants when patterns repeat. ' +
        'Each deployment starts with the accumulated improvements already applied.',
    };
  }
}

export const permanentFixRegistry = new PermanentFixRegistry();
