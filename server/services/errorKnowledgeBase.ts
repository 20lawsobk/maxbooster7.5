/**
 * ERROR KNOWLEDGE BASE
 *
 * A declarative catalogue of error classes Max Booster has actually
 * encountered (or can concretely encounter given how this codebase is wired),
 * together with the *verified* remediation for each.
 *
 * Design principles — these matter more than the entry count:
 *
 *  1. HONESTY OVER COVERAGE.  Every entry is either
 *       - `autoRemediable: true`  → there is a real, side-effecting recovery
 *         action the process can take at runtime that a live consumer observes,
 *       - `autoRemediable: false` → the correct response is to surface the
 *         problem (diagnose + report), because the real fix is a code, schema,
 *         credential, or infrastructure change that a running process must not
 *         invent for itself.
 *     An entry NEVER claims "fixed" for something it merely logged.
 *
 *  2. NO SILENT MASKING.  Entries that describe a genuine defect (data loss,
 *     auth bypass, money movement) are deliberately marked non-remediable with
 *     `escalate: true`, so the fixer reports them loudly instead of swallowing
 *     the symptom and reporting green.
 *
 *  3. CHAIN AWARENESS.  `precursorOf` records error classes that empirically
 *     follow this one, so the fixer can pre-arm downstream recovery instead of
 *     waiting for the cascade.
 *
 * This module holds *knowledge only* — no timers, no side effects at import.
 * chainErrorAutoFixer (reactive/log-driven) and platformAutoFixer (proactive/
 * probe-driven) consume it; post-deploy self-test uses it to explain failures.
 */

export type ErrorSeverity = "critical" | "high" | "medium" | "low";

export type ErrorCategory =
  | "queue"
  | "database"
  | "storage"
  | "memory"
  | "network"
  | "external"
  | "filesystem"
  | "rate_limiting"
  | "auth"
  | "data_integrity"
  | "concurrency"
  | "type_safety"
  | "config"
  | "security"
  | "performance";

/**
 * What a *running process* is allowed to do about an error class.
 *
 *  - `self_heals`      the subsystem recovers on its own; the only correct
 *                      action is to acknowledge and suppress log flooding.
 *  - `runtime_action`  a real recovery action exists (reset a semaphore, force
 *                      GC, reopen a breaker, re-register a job).
 *  - `report_only`     the fix is a code/schema/credential change. The process
 *                      must diagnose and escalate, never "repair" it.
 */
export type RemediationKind = "self_heals" | "runtime_action" | "report_only";

export interface KnowledgeEntry {
  /** Stable id. Where a chainErrorAutoFixer pattern already exists, ids match. */
  id: string;
  title: string;
  category: ErrorCategory;
  severity: ErrorSeverity;
  /** Regexes matched against log text to recognise this class. */
  matchers: RegExp[];
  /** Why this happens in THIS codebase — not generic advice. */
  rootCause: string;
  /** What the user or operator actually experiences when it happens. */
  impact: string;
  remediation: RemediationKind;
  /** True only when a runtime action produces an effect a live consumer reads. */
  autoRemediable: boolean;
  /** The concrete fix. For report_only entries this is the human instruction. */
  fix: string;
  /** Error classes that historically follow this one. */
  precursorOf?: string[];
  /** Escalate to operators even when suppressed/handled. */
  escalate?: boolean;
  /** How to confirm the fix worked — a real observable, not a status field. */
  verifyBy?: string;
}

/* ────────────────────────────────────────────────────────────────────────────
 * QUEUE / BULLMQ / LUA
 * ──────────────────────────────────────────────────────────────────────────*/

const QUEUE: KnowledgeEntry[] = [
  {
    id: "bullmq_missing_lock",
    title: "BullMQ job lock expired during moveToFinished",
    category: "queue",
    severity: "low",
    matchers: [/Missing lock for job \d+/i, /Missing lock.*moveToFinished/i],
    rootCause:
      "The Lua round-trip through PDIM is slower than the BullMQ lock duration, so the lock expires before moveToFinished commits.",
    impact:
      "The job is re-queued and runs again. Harmless for idempotent jobs; DUPLICATES side effects for non-idempotent ones.",
    remediation: "runtime_action",
    autoRemediable: true,
    fix: "Clear the LuaExecutor semaphore so the next lock acquires promptly. If chronic, raise lockDuration or lower LuaExecutor concurrency — and make the affected job handler idempotent.",
    precursorOf: ["lua_executor_timeout"],
    verifyBy:
      "Job completes once: check the job's own side effect (row written / message sent), not the queue status.",
  },
  {
    id: "bullmq_queue_attributes_nil",
    title: "Lua error: attempt to index a nil value (local 'queueAttributes')",
    category: "queue",
    severity: "high",
    matchers: [
      /attempt to index a nil value \(local 'queueAttributes'\)/i,
      /unpack = table\.unpack.*queueAttributes/i,
    ],
    rootCause:
      "A BullMQ Lua script performs HMGET against the queue's meta key, but the PDIM-backed store answers HTTP 404 for that command, so the script receives nil where it expects a table.",
    impact:
      "Worker ticks fail continuously. Scheduled/repeatable jobs do not run, and the log floods, hiding real errors.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "The backing store must implement the HMGET/queue-meta commands BullMQ requires (or BullMQ must point at a store that does). This is a storage-capability gap — do not paper over it by suppressing the log, because scheduled work is genuinely not running.",
    verifyBy:
      "A repeatable job's side effect appears on schedule (a row/post/notification), not merely 'worker started'.",
  },
  {
    id: "bullmq_stalled_foreach",
    title: "stalled.forEach is not a function",
    category: "queue",
    severity: "medium",
    matchers: [/stalled\.forEach is not a function/i],
    rootCause:
      "The stalled-job Lua script returned a non-array (nil/scalar) from the PDIM/wasmoon bridge, so BullMQ's array contract is violated.",
    impact:
      "Stalled-job detection is skipped for that tick; genuinely stuck jobs stay stuck longer.",
    remediation: "runtime_action",
    autoRemediable: true,
    fix: "Reset the LuaExecutor semaphore to release stuck slots. Durable fix is store-side command coverage.",
    precursorOf: ["bullmq_null_then"],
  },
  {
    id: "lua_executor_timeout",
    title: "LuaExecutor round-trip timeout",
    category: "queue",
    severity: "high",
    matchers: [/LuaExecutor.*timeout/i, /lua executor.*timed out/i],
    rootCause:
      "The wasmoon worker or PDIM chain did not answer within the execution budget, usually because the adaptive gap is pinned high or a slot leaked.",
    impact:
      "Queue operations stall; BullMQ lock operations start failing behind it.",
    remediation: "runtime_action",
    autoRemediable: true,
    fix: "Reset the semaphore to reclaim leaked slots; if the adaptive gap is pinned at ceiling, allow passive decay to pull it back toward the floor.",
    precursorOf: ["bullmq_missing_lock", "bullmq_stalled_foreach"],
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * DATABASE / SCHEMA / DATA INTEGRITY
 * ──────────────────────────────────────────────────────────────────────────*/

const DATABASE: KnowledgeEntry[] = [
  {
    id: "db_column_does_not_exist",
    title: 'PostgreSQL: column "x" does not exist',
    category: "database",
    severity: "critical",
    matchers: [
      /column "[^"]+" does not exist/i,
      /relation "[^"]+" does not exist/i,
    ],
    rootCause:
      "Code references a column/table that is present in the ORM schema but absent from the live database — schema drift between the app schema and the actual database.",
    impact:
      "The query fails outright, taking the feature with it. In production this is a hard 500 on whatever path touches it.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Reconcile schema against the LIVE database the app actually connects to, then migrate deliberately. Never have a running process add columns to production on its own.",
    verifyBy: "Re-run the failing query and read a row back.",
  },
  {
    id: "silent_dropped_write",
    title: "Write to a column that does not exist (silently dropped)",
    category: "data_integrity",
    severity: "critical",
    matchers: [], // structural: detected by schema diffing, not by log text
    rootCause:
      "Drizzle silently discards object keys that do not map to a real column, so an insert/update 'succeeds' while part of the payload is thrown away.",
    impact:
      "The worst failure mode in the system: the app reports success, the user believes their data was saved, and it never existed. No error is ever logged.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Diff every write-site's object keys against live database columns. For each mismatch either add the column deliberately (schema + migration) or remove the dead key and fix the feature honestly.",
    verifyBy:
      "Write a record, then SELECT it back and assert the specific field round-trips.",
  },
  {
    id: "sustained_slow_queries",
    title: "Sustained slow queries",
    category: "performance",
    severity: "medium",
    matchers: [/slow query/i, /query took \d{4,}ms/i],
    rootCause:
      "Unbounded result sets, missing indexes on hot filter columns, or serverless cold starts.",
    impact: "Request latency climbs; connection pool saturates under load.",
    remediation: "runtime_action",
    autoRemediable: true,
    fix: "Pre-warm the pool for cold starts. Durable fix: add LIMIT/pagination to unbounded queries and index the filter columns.",
  },
  {
    id: "unbounded_query_no_limit",
    title: "Query with no LIMIT on a user-growth table",
    category: "performance",
    severity: "high",
    matchers: [],
    rootCause:
      "A findMany/select on a table that grows with user activity has no limit, so response size and memory scale with the account's history.",
    impact:
      "Latency and memory grow silently with the heaviest users — the accounts you least want to degrade.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Add cursor/limit pagination with a hard maximum; compute counts separately rather than fetching all rows to count them.",
  },
  {
    id: "missing_ownership_before_query",
    title: "Resource query runs before ownership/existence check",
    category: "security",
    severity: "high",
    matchers: [],
    rootCause:
      "The handler queries child rows by a path parameter and only rejects when the parent exists but belongs to someone else — a nonexistent parent falls through.",
    impact:
      "Nonexistent ids produce 500s instead of 404s, and in the worst case cross-resource data is returned.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Load the parent first, 404 when missing, verify ownership, and only then query children.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * MEMORY / PROCESS
 * ──────────────────────────────────────────────────────────────────────────*/

const MEMORY: KnowledgeEntry[] = [
  {
    id: "memory_pressure",
    title: "Heap approaching limit",
    category: "memory",
    severity: "high",
    matchers: [/heap.*(\d{2,3})%/i, /memory pressure/i],
    rootCause:
      "Retained caches, unbounded Maps, or large in-flight buffers push heap toward the V8 ceiling.",
    impact: "GC thrash, latency spikes, eventually OOM and a hard restart.",
    remediation: "runtime_action",
    autoRemediable: true,
    fix: "Force GC when exposed and shed retained caches. Durable fix: cap every long-lived Map with size-based eviction.",
    precursorOf: ["oom_error"],
  },
  {
    id: "oom_error",
    title: "Out of memory / heap allocation failure",
    category: "memory",
    severity: "critical",
    matchers: [
      /JavaScript heap out of memory/i,
      /FATAL ERROR:.*allocation failed/i,
    ],
    rootCause:
      "Heap exhausted. In this workspace it is frequently additive pressure: a full typecheck or build running alongside the app.",
    impact: "Process dies; in-flight requests and queue jobs are lost.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Never run heavy tooling in the same memory space as the server. Split typechecks, and cap per-process old-space explicitly.",
  },
  {
    id: "unbounded_map_growth",
    title: "Unbounded in-memory Map used as a cache or fallback",
    category: "memory",
    severity: "medium",
    matchers: [],
    rootCause:
      "A Map keyed by user/IP/session grows without a size cap, and cleanup only runs opportunistically during requests.",
    impact:
      "Memory grows fastest during the exact incident (dependency outage, traffic spike) when headroom matters most.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Give every long-lived Map a hard entry cap with eviction, and prune on a timer independent of request traffic.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * CONCURRENCY / SCHEDULING
 * ──────────────────────────────────────────────────────────────────────────*/

const CONCURRENCY: KnowledgeEntry[] = [
  {
    id: "overlapping_interval_tick",
    title: "setInterval task re-enters before the previous run finishes",
    category: "concurrency",
    severity: "high",
    matchers: [],
    rootCause:
      "An async job is scheduled with setInterval and has no in-flight guard, so a slow run overlaps with the next tick.",
    impact:
      "Duplicate external calls and last-write-wins persistence. For token refresh this can revoke a user's integration; for verification it double-counts failures.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Guard with an in-flight flag, or self-schedule with setTimeout only after the previous run settles.",
    verifyBy:
      "Force a run slower than the interval and confirm exactly one execution proceeds.",
  },
  {
    id: "unowned_interval_handle",
    title: "Interval created without a retained handle or shutdown path",
    category: "concurrency",
    severity: "medium",
    matchers: [],
    rootCause:
      "A timer is started during initialization but never stored, so it cannot be cleared and re-initialization stacks duplicates.",
    impact:
      "Duplicate background work, leaked handles in tests, and background activity continuing after shutdown.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Retain every timer handle, guard startup against double-start, unref it, and clear it on shutdown.",
  },
  {
    id: "readiness_waiter_never_resolved",
    title: "Readiness waiters never resolved on the failure path",
    category: "concurrency",
    severity: "high",
    matchers: [],
    rootCause:
      "Queued waiters are only released on the success path, so an unexpected rejection strands everyone waiting for startup.",
    impact: "Requests that wait for readiness hang forever instead of failing.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Release the waiter queue in a finally block so success, degraded, failure, and rejection all resolve it.",
  },
  {
    id: "probe_amplification",
    title: "Timed-out probe keeps running and stacks with the next request",
    category: "performance",
    severity: "medium",
    matchers: [],
    rootCause:
      "A health probe races a timeout but is never cancelled, and concurrent callers each start their own probe.",
    impact:
      "A slow dependency turns each health request into extra load on that dependency — amplifying the outage.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Single-flight the probe per subsystem so concurrent callers share one in-flight run.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * AUTH / SECURITY
 * ──────────────────────────────────────────────────────────────────────────*/

const SECURITY: KnowledgeEntry[] = [
  {
    id: "revocation_fails_open",
    title: "Session revocation check fails open during store outage",
    category: "auth",
    severity: "critical",
    matchers: [],
    rootCause:
      "When the revocation store errors, the check returns 'not revoked' and fallback stores serve the cached session.",
    impact:
      "Logout, password change, suspension, and role downgrade stop being enforced during exactly the outage an attacker would exploit.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Fail closed for authenticated reads when revocation state cannot be verified, or replicate revocation to every fallback store.",
  },
  {
    id: "missing_ownership_check",
    title: "Authenticated endpoint without an ownership check (IDOR)",
    category: "security",
    severity: "critical",
    matchers: [],
    rootCause:
      "The route requires a logged-in user but never verifies that the requested resource belongs to that user.",
    impact:
      "Any user can read or mutate another user's data by changing an id in the URL.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Resolve the resource owner server-side and require owner === requester, with an explicit admin exception.",
    verifyBy:
      "Authenticate as user A and request user B's resource id; expect 403/404.",
  },
  {
    id: "proxy_ownership_delegated",
    title: "Proxy route delegates ownership enforcement to an upstream service",
    category: "security",
    severity: "high",
    matchers: [],
    rootCause:
      "A proxy authenticates the caller but forwards resource ids without checking that the caller owns them, assuming upstream enforces it.",
    impact:
      "If upstream does not enforce ownership, authenticated users can reach other users' jobs and generated media.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Resolve ownership locally before proxying; never assume an upstream service enforces your authorization model.",
  },
  {
    id: "unvalidated_credential_storage",
    title: "Third-party credentials accepted and stored without validation",
    category: "security",
    severity: "high",
    matchers: [],
    rootCause:
      "An endpoint persists user-supplied access/refresh tokens without verifying them against the provider or bounding expiry.",
    impact:
      "Attacker-controlled credentials can be planted, and stored plaintext secrets raise breach impact.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Validate tokens against the provider before persisting, bound expiry values, encrypt at rest, and never log token material.",
  },
  {
    id: "ineffective_rate_limit",
    title: "Rate limit configured so high it cannot bind",
    category: "rate_limiting",
    severity: "medium",
    matchers: [],
    rootCause:
      "A limit is set to a value far above any achievable request rate, so the control exists on paper only.",
    impact:
      "Abuse controls appear present in review but never trigger; expensive endpoints stay unprotected.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Set limits from measured legitimate usage, and enforce quota atomically where it guards a resource.",
  },
  {
    id: "error_detail_disclosure",
    title: "Raw dependency error text returned to unauthenticated callers",
    category: "security",
    severity: "medium",
    matchers: [],
    rootCause:
      "A health/readiness or error handler serialises the underlying exception message straight into the response.",
    impact:
      "Leaks internal hostnames, driver details, and schema hints to anyone who can reach the endpoint.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Return a stable public error string and keep the detail in logs.",
  },
  {
    id: "unbounded_bulk_mutation",
    title: "Bulk endpoint fans out hundreds of concurrent operations",
    category: "performance",
    severity: "medium",
    matchers: [],
    rootCause:
      "A bulk route maps over a large id array with unbounded Promise concurrency and no request-level rate limit.",
    impact:
      "One authenticated request can saturate the DB pool and storage backend; partial failures leave inconsistent state.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Bound concurrency, prefer a single ownership-filtered bulk statement, and rate-limit mutating routes.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * EXTERNAL SERVICES / NETWORK
 * ──────────────────────────────────────────────────────────────────────────*/

const EXTERNAL: KnowledgeEntry[] = [
  {
    id: "circuit_probe_accepts_any_200",
    title: "Circuit breaker force-closes on any HTTP 200",
    category: "external",
    severity: "high",
    matchers: [],
    rootCause:
      "The recovery probe treats a 200 status as proof of health without validating the response body, so a proxy or error page reopens the circuit.",
    impact:
      "Traffic is released to a backend that is still unavailable, restarting the failure loop.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Validate the expected content type and payload shape before closing the breaker.",
  },
  {
    id: "upstream_failure_returned_as_200",
    title: "Upstream failure reported as HTTP 200 by a readiness route",
    category: "external",
    severity: "high",
    matchers: [],
    rootCause:
      "A readiness endpoint catches the upstream error and still answers 200 with a ready:false body.",
    impact:
      "Load balancers and monitors treat an unavailable dependency as healthy, so nothing alerts and nothing sheds traffic.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Map upstream non-2xx to 502 and transport failure to 503; keep the diagnostic body.",
  },
  {
    id: "stale_readiness_cache",
    title: "Readiness cache still reports ready after the subsystem exits",
    category: "external",
    severity: "medium",
    matchers: [],
    rootCause:
      "A TTL-cached readiness flag is not invalidated when the supervised child exits or is stopped.",
    impact:
      "Health output claims ready for the length of the TTL after the dependency is already gone.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Reset the cached flag and its timestamp on both stop and unexpected exit.",
  },
  {
    id: "api_credential_expired",
    title: "Third-party credential expired or rejected",
    category: "external",
    severity: "high",
    matchers: [/401 Unauthorized/i, /invalid[_ ]api[_ ]key/i, /token expired/i],
    rootCause:
      "A stored credential rotated, was revoked, or was never valid for the header scheme the client sends.",
    impact: "Every call to that provider fails until the credential is fixed.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Surface which provider and which credential failed. A process must never invent credentials — request a rotation.",
  },
  {
    id: "silent_catch_swallow",
    title: "Recurring background failure caught and discarded",
    category: "config",
    severity: "medium",
    matchers: [],
    rootCause:
      "A periodic task wraps its work in an empty catch, so a persistent failure produces no signal.",
    impact:
      "Buffered work is silently lost while the app reports healthy — invisible until data is missing.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Log with context and expose a failure counter that readiness can read.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * TYPE SAFETY / CODE HEALTH
 * ──────────────────────────────────────────────────────────────────────────*/

const TYPE_SAFETY: KnowledgeEntry[] = [
  {
    id: "optional_chain_in_string_literal",
    title: "Optional-chaining debris inside a string literal",
    category: "type_safety",
    severity: "high",
    matchers: [],
    rootCause:
      "A bulk codemod rewrote `.` to `?.` inside embedded non-JavaScript text (SQL, shell, GLSL, URLs, file paths).",
    impact:
      "The embedded language breaks at runtime only when that path executes — invisible to the type checker.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Scan string literals for `?.` and repair by embedded language. Treat any automated rewrite that edits string contents as suspect.",
  },
  {
    id: "unused_param_masks_missing_impl",
    title: "Underscore-prefixed parameter hiding unimplemented behavior",
    category: "type_safety",
    severity: "medium",
    matchers: [],
    rootCause:
      "An unused-parameter warning was silenced by renaming rather than by asking why the input is accepted but never processed.",
    impact:
      "The endpoint advertises a capability it does not implement; callers pass a value that is ignored.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Audit each silenced parameter for accepted-but-unprocessed inputs, especially where sibling handlers do use it.",
  },
  {
    id: "nonexistent_property_access",
    title: "Property access on a row shape that lacks it",
    category: "type_safety",
    severity: "high",
    matchers: [/is not assignable/i, /Property '[^']+' does not exist/i],
    rootCause:
      "Either genuine drift (the column exists in the database but not the schema) or an unbuilt feature (neither has it).",
    impact:
      "Adding the field to the schema when the database lacks it converts a compile error into a runtime crash — strictly worse.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Check the live database per table first. Add to schema only when the column truly exists; otherwise fix the call site.",
  },
];

/* ────────────────────────────────────────────────────────────────────────────
 * REGISTRY
 * ──────────────────────────────────────────────────────────────────────────*/

export const ERROR_KNOWLEDGE_BASE: KnowledgeEntry[] = [
  ...QUEUE,
  ...DATABASE,
  ...MEMORY,
  ...CONCURRENCY,
  ...SECURITY,
  ...EXTERNAL,
  ...TYPE_SAFETY,
];

const BY_ID = new Map(ERROR_KNOWLEDGE_BASE.map((e) => [e.id, e]));

export function getKnowledgeEntry(id: string): KnowledgeEntry | undefined {
  return BY_ID.get(id);
}

/**
 * Recognise an error class from raw log text.
 * Returns only entries with real matchers — structural entries (detected by
 * schema diffing or code review, not log text) are never returned here.
 */
export function classifyError(message: string): KnowledgeEntry[] {
  if (!message) return [];
  return ERROR_KNOWLEDGE_BASE.filter(
    (e) => e.matchers.length > 0 && e.matchers.some((m) => m.test(message)),
  );
}

/**
 * The honest question the auto-fixer must ask before claiming a repair:
 * is there actually a runtime action available for this class?
 */
export function isAutoRemediable(id: string): boolean {
  return BY_ID.get(id)?.autoRemediable === true;
}

/** Error classes that should page a human even when the symptom is suppressed. */
export function getEscalationClasses(): KnowledgeEntry[] {
  return ERROR_KNOWLEDGE_BASE.filter((e) => e.escalate === true);
}

/** Downstream classes to pre-arm when `id` fires. */
export function getDownstreamClasses(id: string): KnowledgeEntry[] {
  const entry = BY_ID.get(id);
  if (!entry?.precursorOf) return [];
  return entry.precursorOf
    .map((d) => BY_ID.get(d))
    .filter((e): e is KnowledgeEntry => Boolean(e));
}

/**
 * Explain an unrecognised error against the knowledge base.
 *
 * Deliberately returns guidance, NOT an action. A novel error must never be
 * "fixed" by speculatively applying the nearest known remediation — that is how
 * an unrelated fix gets credited for a problem it did not solve.
 */
export function explainUnknownError(message: string): {
  recognised: false;
  guidance: string;
  nearestCategory: ErrorCategory | null;
} {
  const text = (message || "").toLowerCase();
  const hints: Array<[ErrorCategory, RegExp]> = [
    ["database", /column|relation|postgres|drizzle|sql/],
    ["queue", /queue|bullmq|job|lua|worker/],
    ["memory", /heap|memory|allocation/],
    ["network", /econnrefused|etimedout|socket|dns/],
    ["auth", /unauthor|forbidden|session|token/],
    ["filesystem", /enoent|eio|eacces/],
  ];
  const hit = hints.find(([, re]) => re.test(text));
  return {
    recognised: false,
    guidance:
      "No knowledge-base entry matches this error. Capture it with full context and diagnose it — do not apply the nearest known fix speculatively, because a successful-looking unrelated action will mask the real cause.",
    nearestCategory: hit ? hit[0] : null,
  };
}

/** Summary for the admin dashboard. */
export function getKnowledgeBaseSummary(): {
  total: number;
  autoRemediable: number;
  reportOnly: number;
  escalation: number;
  byCategory: Record<string, number>;
} {
  const byCategory: Record<string, number> = {};
  for (const e of ERROR_KNOWLEDGE_BASE) {
    byCategory[e.category] = (byCategory[e.category] ?? 0) + 1;
  }
  return {
    total: ERROR_KNOWLEDGE_BASE.length,
    autoRemediable: ERROR_KNOWLEDGE_BASE.filter((e) => e.autoRemediable).length,
    reportOnly: ERROR_KNOWLEDGE_BASE.filter((e) => !e.autoRemediable).length,
    escalation: ERROR_KNOWLEDGE_BASE.filter((e) => e.escalate).length,
    byCategory,
  };
}
