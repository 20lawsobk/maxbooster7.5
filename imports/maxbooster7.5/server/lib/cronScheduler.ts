/**
 * Custom Cron Scheduler — production-grade, zero 3rd-party dependencies.
 *
 * Implements a standard 5-field cron expression parser and setTimeout-based
 * scheduler that is more accurate than setInterval because each tick
 * recomputes the next fire time from wall-clock time, preventing drift.
 *
 * Supported cron field syntax:
 *   *          any value
 *   n          specific value
 *   n,m,k      comma-separated list
 *   n-m        inclusive range
 *   * /n        every n steps from field minimum  (no space in actual usage)
 *   n-m/k      every k steps through range n–m
 *
 * Field order (5 fields, space-separated):
 *   minute  [0-59]
 *   hour    [0-23]
 *   dom     [1-31]  day of month
 *   month   [1-12]
 *   dow     [0-6]   day of week (0 = Sunday, 6 = Saturday)
 *
 * Timezone support via IANA timezone strings (e.g. "America/New_York", "UTC").
 */

export interface ScheduledTask {
  start(): void;
  stop(): void;
}

export interface ScheduleOptions {
  /** IANA timezone string. Defaults to "UTC". */
  timezone?: string;
  /**
   * If false, the task is created but not started automatically.
   * Call task.start() explicitly.  Defaults to true.
   */
  scheduled?: boolean;
}

type CronCallback = () => void | Promise<void>;

// ── Field parsing ─────────────────────────────────────────────────────────────

type CronField = Set<number>;

function parseField(field: string, min: number, max: number): CronField {
  const result = new Set<number>();

  for (const part of field.split(",")) {
    const trimmed = part.trim();
    if (trimmed === "") continue;

    // */n or range/n
    const stepMatch = trimmed.match(/^(\*|\d+(?:-\d+)?)\/(\d+)$/);
    if (stepMatch) {
      const rangeStr = stepMatch[1];
      const step = parseInt(stepMatch[2], 10);
      if (step <= 0) throw new Error(`Invalid cron step "${trimmed}"`);
      let start = min;
      let end = max;
      if (rangeStr !== "*") {
        const dash = rangeStr.indexOf("-");
        if (dash >= 0) {
          start = parseInt(rangeStr.slice(0, dash), 10);
          end = parseInt(rangeStr.slice(dash + 1), 10);
        } else {
          start = parseInt(rangeStr, 10);
          end = max;
        }
      }
      if (start < min || end > max || start > end) {
        throw new Error(`Cron range out of bounds "${trimmed}" (${min}-${max})`);
      }
      for (let v = start; v <= end; v += step) result.add(v);
      continue;
    }

    // n-m range
    const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/);
    if (rangeMatch) {
      const from = parseInt(rangeMatch[1], 10);
      const to = parseInt(rangeMatch[2], 10);
      if (from > to || from < min || to > max) {
        throw new Error(`Cron range out of bounds "${trimmed}" (${min}-${max})`);
      }
      for (let v = from; v <= to; v++) result.add(v);
      continue;
    }

    // *
    if (trimmed === "*") {
      for (let v = min; v <= max; v++) result.add(v);
      continue;
    }

    // plain number
    const n = parseInt(trimmed, 10);
    if (isNaN(n) || n < min || n > max) {
      throw new Error(
        `Invalid cron value "${trimmed}" for field (valid range ${min}-${max})`,
      );
    }
    result.add(n);
  }

  return result;
}

interface ParsedCron {
  minute: CronField;
  hour: CronField;
  dom: CronField;
  month: CronField;
  dow: CronField;
}

function parseCron(expression: string): ParsedCron {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(
      `Invalid cron expression "${expression}" — expected 5 space-separated fields`,
    );
  }
  const [minuteStr, hourStr, domStr, monthStr, dowStr] = parts as [
    string,
    string,
    string,
    string,
    string,
  ];
  return {
    minute: parseField(minuteStr, 0, 59),
    hour: parseField(hourStr, 0, 23),
    dom: parseField(domStr, 1, 31),
    month: parseField(monthStr, 1, 12),
    dow: parseField(dowStr, 0, 6),
  };
}

// ── Timezone-aware local field extraction ─────────────────────────────────────

// Abbreviated weekday names as emitted by 'en-US' Intl weekday:'short'
const WEEKDAY_SHORT: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

// Cache Intl.DateTimeFormat instances keyed by timezone — avoids constructing
// a new formatter per tick (which is the hot path when computing the next run).
const _fmtCache = new Map<string, { numeric: Intl.DateTimeFormat; weekday: Intl.DateTimeFormat }>();

function getFormatters(tz: string) {
  let fmt = _fmtCache.get(tz);
  if (!fmt) {
    fmt = {
      numeric: new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        minute: "2-digit",
        hour: "2-digit",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour12: false,
      }),
      weekday: new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        weekday: "short",
      }),
    };
    _fmtCache.set(tz, fmt);
  }
  return fmt;
}

interface LocalFields {
  minute: number;
  hour: number;
  dom: number;
  month: number;
  dow: number;
}

function getLocalFields(date: Date, tz: string): LocalFields {
  const { numeric, weekday } = getFormatters(tz);

  const parts = numeric.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") map[p.type] = p.value;
  }

  const wdayStr = weekday.format(date);
  const dow = WEEKDAY_SHORT[wdayStr] ?? 0;

  return {
    minute: parseInt(map.minute ?? "0", 10),
    // hour12:false can emit "24" for midnight in some Intl implementations
    hour: parseInt(map.hour ?? "0", 10) % 24,
    dom: parseInt(map.day ?? "1", 10),
    month: parseInt(map.month ?? "1", 10),
    dow,
  };
}

// ── Next execution computation ────────────────────────────────────────────────

/**
 * Return the next Date (after afterDate) at which the cron expression fires.
 *
 * Searches minute-by-minute from the start of the next minute up to
 * 2 years (1 051 200 minutes) ahead.  Returns null if no match is found
 * (which can only happen for pathological expressions like "31 2 30 2 *").
 */
function nextExecution(
  fields: ParsedCron,
  afterDate: Date,
  tz: string,
): Date | null {
  // Snap to the start of the next whole minute
  const startMs =
    Math.floor(afterDate.getTime() / 60_000) * 60_000 + 60_000;

  for (let i = 0; i < 1_051_200; i++) {
    const candidate = new Date(startMs + i * 60_000);
    const local = getLocalFields(candidate, tz);

    // Fast-reject: check coarser fields first to minimise inner work
    if (!fields.month.has(local.month)) {
      // Skip to the start of the next month (rough: advance by 28 days at a time)
      i += 28 * 24 * 60 - 1;
      continue;
    }
    if (!fields.dom.has(local.dom) && !fields.dow.has(local.dow)) {
      // Skip to next day
      i += 24 * 60 - 1;
      continue;
    }
    if (!fields.hour.has(local.hour)) {
      // Skip to next hour
      i += 60 - 1;
      continue;
    }
    if (!fields.minute.has(local.minute)) continue;

    // dom/dow uses OR semantics (standard cron): at least one must match.
    // The fast-reject above already guarantees at least one matches, so
    // reaching here means all five fields are satisfied.
    return candidate;
  }

  return null;
}

// ── ScheduledTask implementation ──────────────────────────────────────────────

class CronTask implements ScheduledTask {
  private readonly fields: ParsedCron;
  private readonly callback: CronCallback;
  private readonly tz: string;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private active = false;

  constructor(expression: string, callback: CronCallback, tz: string) {
    this.fields = parseCron(expression);
    this.callback = callback;
    this.tz = tz;
  }

  start(): void {
    if (this.active) return;
    this.active = true;
    this._scheduleNext();
  }

  stop(): void {
    this.active = false;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private _scheduleNext(): void {
    if (!this.active) return;

    const next = nextExecution(this.fields, new Date(), this.tz);
    if (!next) return; // no future execution (pathological expression)

    const delayMs = Math.max(0, next.getTime() - Date.now());

    this.timer = setTimeout(() => {
      if (!this.active) return;
      // Reschedule BEFORE executing so the next interval starts from when
      // this tick fires, not from when the callback returns — prevents drift.
      this._scheduleNext();
      Promise.resolve().then(() => this.callback()).catch(() => {});
    }, delayMs);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Schedule a callback on a cron expression.
 *
 * @param expression  5-field cron expression  ("0 9 * * 1")
 * @param callback    Function called on each tick (may be async)
 * @param opts        Optional { timezone, scheduled }
 * @returns           ScheduledTask with start() / stop()
 *
 * @example
 *   const task = schedule("0 9 * * 1", () => sendWeeklyEmail(), { timezone: "America/New_York" });
 *   // task is already running — call task.stop() to cancel
 */
export function schedule(
  expression: string,
  callback: CronCallback,
  opts: ScheduleOptions = {},
): ScheduledTask {
  const tz = opts.timezone ?? "UTC";
  const task = new CronTask(expression, callback, tz);
  if (opts.scheduled !== false) task.start();
  return task;
}

/**
 * Validate a cron expression without scheduling anything.
 * Returns true if the expression is syntactically valid, false otherwise.
 */
export function validate(expression: string): boolean {
  try {
    parseCron(expression);
    return true;
  } catch {
    return false;
  }
}

// Default export with node-cron-compatible API surface
// so existing imports of the form `import cron from "…/cronScheduler"` work.
export default { schedule, validate };
