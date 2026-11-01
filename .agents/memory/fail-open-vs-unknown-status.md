---
name: Fail-open triage framework for broken gating checks
description: How to decide the correct fix when a check that gates a risky action (security, money, user preference) throws/errors — never fabricate a safe verdict.
---

## The rule

When a function whose job is to gate a risky action (block an IP, approve a payout, verify a webhook, respect a user's opt-out) hits an internal error (DB down, query fails, config missing), the catch block must never fabricate the *most permissive* verdict just to let execution continue. Two legitimate patterns instead:

1. **One-time startup-cache load** (e.g. loading a blocklist into memory at boot): retry with backoff, escalate to loud `logger.error` only after exhaustion, and add periodic re-sync so the process self-heals without a restart. Do not `throw` (can crash boot) and do not silently populate an empty/default cache.
2. **Per-request/per-action gating check** (payout risk, webhook signature, notification preference): return a *distinguishable* "unknown"/failure status, and make the caller treat "unknown" at least as cautiously as the worst real-world case (fail closed) — never as the best case. Log the real error at error/warn level with enough context (which entity, what error) to debug the underlying outage.

**Why:** A fabricated "safe" verdict is indistinguishable from a real safe verdict to every downstream consumer and to operators reading normal logs — it converts an infrastructure outage into a silent policy bypass (fraud slips through, forged webhooks get accepted, muted users get spammed) with no signal that anything went wrong. Severity scales with what the check protects: money and security controls (payout risk, IP blacklist, webhook auth) are more serious than a UX preference (push notification opt-out), but the *shape* of the correct fix is the same.

**How to apply:** When you find a catch block that returns a hardcoded permissive/safe-looking value, ask "what does this value mean to the caller, and is it true right now?" If the honest answer is "we don't know," the return value must say "unknown," not "safe." Then check every real caller and update it to branch on "unknown" the same direction as the worst case, with a message that lets a human tell a real flag apart from a broken check (e.g. "HELD — risk check unavailable" vs "HELD — suspicious payout detected"). Applies even to dead code with zero current callers — fix it prophylactically so nothing wires up the unsafe version later.

Concrete instances fixed under this framework in this project: `security-system.ts isIpBlacklisted` (re-throw, don't return false), `selfHealingSecurityEngine.ts loadBlockedIps` (retry+backoff+periodic re-sync), `suspiciousPayoutDetector.ts checkPayoutRisk` (return `risk:"unknown"`, caller `royaltySplitsDispatcher.ts` holds on unknown same as high), `notificationDispatcher.ts getUserPushPrefs` (fail closed to disabled/muted on DB error instead of assuming full opt-in — note the codebase's own `skipCategoryCheck` dispatch option is the correct escape hatch for genuinely critical/urgent notifications, not a permissive default), `labelgrid-service.ts verifyWebhookSignature` (return false when secret unconfigured, was dead code).
