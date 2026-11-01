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
  | "performance"
  | "payments"
  | "media"
  | "realtime"
  | "session"
  | "notification"
  | "deployment"
  | "cache"
  | "validation"
  | "scheduling";

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
 * PLATFORM — payments, media, realtime, sessions, notifications, deployment,
 * caching, validation, scheduling. The error surface of the full artist
 * lifecycle: creation → distribution → monetization → payout.
 * ──────────────────────────────────────────────────────────────────────────*/

const PLATFORM: KnowledgeEntry[] = [
  // ── Payments / billing ────────────────────────────────────────────────────
  {
    id: "stripe_charge_without_booking",
    title: "Stripe charge succeeded but earnings were never booked",
    category: "payments",
    severity: "critical",
    matchers: [
      /payment.*(succeeded|captured).*(earnings|booking|ledger).*(fail|error|missing)/i,
      /webhook.*checkout\.session\.completed.*(error|failed)/i,
    ],
    rootCause:
      "The charge and the internal earnings booking are not one atomic unit: if the post-payment handler throws (DB error, missing column, crash), Stripe keeps the money but the seller's balance never updates.",
    impact:
      "Buyer paid, seller sees nothing. The most trust-destroying failure the marketplace can have.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Make booking idempotent and driven by the Stripe webhook with retry; reconcile daily: every succeeded PaymentIntent must map to a ledger row, alert on orphans.",
    verifyBy:
      "Reconciliation query: succeeded charges without a matching earnings row = 0.",
  },
  {
    id: "stripe_webhook_signature_invalid",
    title: "Stripe webhook signature verification failed",
    category: "payments",
    severity: "high",
    matchers: [
      /webhook signature verification failed/i,
      /No signatures found matching the expected signature/i,
    ],
    rootCause:
      "STRIPE_WEBHOOK_SECRET is stale (rotated endpoint), or a proxy/body-parser consumed the raw body before verification.",
    impact:
      "ALL payment lifecycle events are dropped — subscriptions don't activate, sales don't book.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Re-copy the endpoint secret from the Stripe dashboard into secrets; ensure the webhook route uses express.raw() before any JSON parser.",
  },
  {
    id: "double_notification_on_sale",
    title: "Seller notified twice for one completed sale",
    category: "payments",
    severity: "medium",
    matchers: [/duplicate notification.*(sale|purchase|order)/i],
    rootCause:
      "Both the synchronous purchase path and the webhook path send the notification; retries multiply it further without an idempotency key.",
    impact: "Sellers mistrust sale counts; support load.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Single notification source (webhook), keyed by an idempotency key (event id) checked before send.",
    verifyBy: "One notifications row per order id under webhook retry.",
  },
  {
    id: "payout_balance_drift",
    title: "Payout total disagrees with the earnings ledger",
    category: "payments",
    severity: "critical",
    matchers: [/payout.*(mismatch|drift|negative balance)/i],
    rootCause:
      "Balance is computed from mutable state instead of an append-only ledger, so concurrent sales/refunds race.",
    impact: "Over- or under-payment of artists; financial liability.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Derive balances only from an append-only earnings/deductions ledger inside one transaction; never UPDATE a balance column from application math.",
  },
  // ── Media / audio ─────────────────────────────────────────────────────────
  {
    id: "media_job_stuck_pending",
    title: "Audio/video generation job never leaves pending",
    category: "media",
    severity: "high",
    matchers: [/job.*(stuck|pending).*(audio|video|render)/i, /poll.*audio-job.*timeout/i],
    rootCause:
      "MaxCore accepted the job (job_id issued) but crashed or recycled before completion; the poller has no terminal timeout so the client spins forever.",
    impact: "User waits indefinitely on a spinner; retries pile duplicate jobs.",
    remediation: "runtime_action",
    autoRemediable: true,
    fix: "Poller must enforce a hard terminal deadline, mark the job failed, and surface a retry affordance. Runtime action: expire jobs older than the deadline.",
    verifyBy: "No jobs in pending older than the deadline.",
  },
  {
    id: "unservable_audio_artifact",
    title: "Listing points at audio that 404s or is clipped/corrupt",
    category: "media",
    severity: "high",
    matchers: [/(preview|audio).*(404|not found|unservable)/i],
    rootCause:
      "Listing rows persist URLs from a storage location that was retired or a render that failed after the row was written — status said 'complete' but no one verified the artifact is fetchable.",
    impact: "Buyers hit dead players; sales lost silently.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Verify servability (HTTP 200 + duration probe) BEFORE publishing the listing; periodic sweep flags dead URLs and unpublishes.",
    verifyBy: "HEAD/range request on every published preview URL returns 200.",
  },
  {
    id: "ffmpeg_nonzero_exit",
    title: "ffmpeg exited non-zero during trim/transcode",
    category: "media",
    severity: "medium",
    matchers: [/ffmpeg.*(exit(ed)? (code )?[1-9]|SIGKILL|error)/i],
    rootCause:
      "Corrupt/truncated input, unsupported codec, or the container OOM-killed ffmpeg under memory pressure.",
    impact: "Preview/trim missing for that upload.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Validate input with ffprobe first; run ffmpeg with bounded memory and treat non-zero exit as a user-visible upload error, never a silent skip.",
  },
  // ── Realtime / websocket ─────────────────────────────────────────────────
  {
    id: "ws_reconnect_storm",
    title: "WebSocket clients reconnect in a tight storm",
    category: "realtime",
    severity: "high",
    matchers: [/(websocket|socket).*(reconnect|storm|thundering)/i],
    rootCause:
      "Server restart disconnects all clients at once and the client backoff is constant, so they all return simultaneously and knock the server over again.",
    impact: "Collab sessions drop repeatedly right after every deploy.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Jittered exponential backoff on the client; server accepts connections before heavy boot work completes.",
  },
  {
    id: "ws_message_after_close",
    title: "Send attempted on a closed WebSocket",
    category: "realtime",
    severity: "low",
    matchers: [/WebSocket is not open/i, /Cannot send.*closed (socket|connection)/i],
    rootCause:
      "Broadcast loops hold stale socket references; the close event pruned the registry after the loop snapshot.",
    impact: "Log noise; the message was undeliverable anyway.",
    remediation: "self_heals",
    autoRemediable: true,
    fix: "Guard sends with readyState check; prune registry on close. Acknowledge and suppress the flood.",
  },
  // ── Session / auth ────────────────────────────────────────────────────────
  {
    id: "session_store_unavailable",
    title: "Session store backend unreachable — logins fail platform-wide",
    category: "session",
    severity: "critical",
    matchers: [/session store.*(unavailable|timeout|error)/i, /failed to (get|set) session/i],
    rootCause:
      "Sessions live in PDIM; when the PDIM seam is down or misconfigured every request deserializes to anonymous.",
    impact: "Everyone is logged out; writes that require auth 401.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Restore the PDIM seam (see pdim entries). Never fall back to MemoryStore in production — it silently forks session state per worker.",
    verifyBy: "Login round-trip: set-cookie then authenticated /api/auth/user 200.",
  },
  {
    id: "csrf_token_rejected",
    title: "Legitimate requests rejected by CSRF double-submit",
    category: "session",
    severity: "medium",
    matchers: [/invalid csrf token/i, /csrf.*(mismatch|missing)/i],
    rootCause:
      "Client omitted the X-CSRF-Token header or the csrf-token cookie was rotated mid-session; API tests often forget the double-submit pair.",
    impact: "Mutating requests 403 for real users/tests.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Client must echo the csrf-token cookie value in X-CSRF-Token. For curl tests: read the cookie, send it as the header.",
  },
  // ── Notifications / email ────────────────────────────────────────────────
  {
    id: "email_provider_rejection",
    title: "Transactional email rejected by provider",
    category: "notification",
    severity: "medium",
    matchers: [/(sendgrid|resend|smtp|email).*(401|403|rejected|bounce|invalid api key)/i],
    rootCause: "Stale/revoked email API key or unverified sender domain.",
    impact: "Receipts, replies, and verification emails silently not delivered.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Rotate the provider key in secrets; verify the sender domain. Queue-and-retry so messages are not lost while credentials are fixed.",
  },
  {
    id: "notification_write_failed_after_action",
    title: "Action committed but its notification write failed",
    category: "notification",
    severity: "low",
    matchers: [/notification.*(failed|error).*(after|post)/i],
    rootCause:
      "Notification insert runs after the main transaction, unprotected — any DB hiccup loses it while the action stands.",
    impact: "User misses an event they should have seen.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Enqueue notification jobs transactionally with the action (outbox pattern) so delivery retries.",
  },
  // ── Deployment / boot ─────────────────────────────────────────────────────
  {
    id: "boot_route_registration_window",
    title: "Mixed 200/404 responses right after restart",
    category: "deployment",
    severity: "medium",
    matchers: [/404.*(during|after) (boot|restart)/i],
    rootCause:
      "Route registration takes minutes; requests landing mid-registration hit routes that exist yet as 404.",
    impact: "Looks like broken endpoints; it is a boot window.",
    remediation: "self_heals",
    autoRemediable: true,
    fix: "Wait for the '[Boot] Routes registered' marker; readiness endpoint must stay 503 until registration completes.",
    verifyBy: "'[Boot] Routes registered' logged, then the same path returns 200.",
  },
  {
    id: "port_bind_conflict",
    title: "EADDRINUSE — port already bound at startup",
    category: "deployment",
    severity: "high",
    matchers: [/EADDRINUSE/i],
    rootCause:
      "A previous process (or a supervised child like local MaxCore) survived the restart and still owns the port.",
    impact: "Server cannot start; preview dead.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Kill the stale process group on shutdown (sweep children); supervisors must own child lifecycles.",
  },
  {
    id: "env_secret_missing_at_boot",
    title: "Required secret/env var missing at boot",
    category: "deployment",
    severity: "critical",
    matchers: [/(env|secret|variable).*(missing|not set|undefined).*(required|boot|startup)/i],
    rootCause:
      "Deploy environment lacks a secret the dev workspace had; the app either crashes or silently disables the feature.",
    impact: "Feature dead in production only.",
    remediation: "report_only",
    autoRemediable: false,
    escalate: true,
    fix: "Fail fast with an explicit named-variable error at boot; keep a boot-time manifest of required env keys per subsystem.",
  },
  // ── Cache ─────────────────────────────────────────────────────────────────
  {
    id: "stale_cache_after_shape_change",
    title: "Cache serves an old response shape after a code change",
    category: "cache",
    severity: "high",
    matchers: [/cannot read propert.*(cache|cached)/i],
    rootCause:
      "Response shape changed but the cache key version didn't, so consumers parse yesterday's shape.",
    impact: "Crashes that only reproduce until TTL expiry, then vanish.",
    remediation: "runtime_action",
    autoRemediable: true,
    fix: "Bump the cache key version in lockstep with shape changes. Runtime action: invalidate the affected prefix.",
  },
  {
    id: "cache_stampede",
    title: "Cache expiry triggers a stampede of identical upstream calls",
    category: "cache",
    severity: "medium",
    matchers: [/stampede|thundering herd/i],
    rootCause:
      "Hot key expires and every concurrent request recomputes; no single-flight coalescing.",
    impact: "Latency spike + upstream rate-limit burn every TTL.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Single-flight (in-flight promise map) per key + jittered TTLs.",
  },
  // ── Validation / input ────────────────────────────────────────────────────
  {
    id: "unvalidated_body_crash",
    title: "Handler crashes on bare access to optional request body fields",
    category: "validation",
    severity: "high",
    matchers: [
      /Cannot read propert(y|ies) .* of (undefined|null).*req\.body/i,
      /TypeError.*(undefined|null).*(handler|route)/i,
    ],
    rootCause:
      "Route handlers dereference nested optional body/context fields without a schema gate; generation endpoints are the historical hot spot.",
    impact: "500s on malformed or partial client payloads.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Zod-parse the body at the route boundary and 400 on failure; never deep-access unparsed input.",
  },
  {
    id: "jsonb_shape_assumption",
    title: "Code assumes a JSONB column's internal shape that rows don't have",
    category: "validation",
    severity: "medium",
    matchers: [/(is not iterable|not a function).*(metadata|jsonb|prefs)/i],
    rootCause:
      "JSONB columns accumulate rows written by older code versions; new code assumes arrays/objects that old rows lack.",
    impact: "Crashes only for users with old data — invisible in fresh tests.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Treat every JSONB read as untrusted: Array.isArray/typeof guards with defaults, exactly like external input.",
  },
  // ── Scheduling ────────────────────────────────────────────────────────────
  {
    id: "scheduler_silent_stall",
    title: "Recurring loop silently stops rescheduling",
    category: "scheduling",
    severity: "high",
    matchers: [/(loop|cycle|scheduler).*(stall|stopped|no longer)/i],
    rootCause:
      "A throw between 'work done' and 'schedule next' kills the chain; setTimeout chains have no watchdog, and backoff states (e.g. 12h offline backoff) may never be rewound on recovery.",
    impact: "Autonomous revenue/maintenance loops quietly stop; nobody notices for days.",
    remediation: "runtime_action",
    autoRemediable: true,
    fix: "Heartbeat timestamp per loop + watchdog that reschedules when heartbeat age exceeds 2× cadence. Reconnect callbacks must rewind backoff.",
    verifyBy: "Heartbeat age < 2× cadence for every registered loop.",
  },
  {
    id: "orphaned_cycle_double_kill",
    title: "Orphan recovery kills cycles started by the current process",
    category: "scheduling",
    severity: "medium",
    matchers: [/orphan.*(recover|kill).*(live|current|active)/i],
    rootCause:
      "Recovery treats any in-flight cycle as orphaned without checking whether it belongs to this process's lifetime.",
    impact: "Healthy work is aborted ~75s after every boot.",
    remediation: "report_only",
    autoRemediable: false,
    fix: "Exclude cycles with startedAt >= process start cutoff from orphan recovery.",
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
  ...PLATFORM,
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
