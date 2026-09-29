# MaxCore server hardening evidence

Date: 2026-09-29 UTC

## Decision

**Operational fixes verified; overall production acceptance NOT established.**
Native Redis remains the BullMQ backend. No Redis migration/cutover,
training, weight promotion, or publishing was performed.

## Implemented

- Python startup reconciliation now closes interrupted legacy generation jobs,
  including audio `rendering` heartbeats, with explicit restart errors.
  Existing dedicated delivery recovery remains authoritative; no duplicate
  recovery engine or automatic inference replay was introduced.
- Journal filename identity is validated before recovery and garbage collection.
  Malformed and symlink journals cannot redirect recovery to a different job.
- Scratch cleanup uses ownership validation. Failed or unsafe owned cleanup
  retains its journal for retry; unrelated files and symlink targets are untouched.
  Retryable delivery journals are retained rather than expired prematurely.
- Node readiness consults Python `/ready`, exposes serving-release status,
  and bounds/drains each upstream probe. Optional warm states remain diagnostic,
  not new mandatory serving dependencies.
- Job event streams authenticate before opening, cancel on response disconnect,
  prevent overlapping polls, and distinguish transport errors from genuine 404s.
  Poll and cancellation attempts have bounded upstream deadlines.
- Multimodal generation binds server-authenticated fan-out to the trusted
  channel's owner; synchronous audio polling retains a finite wait budget.

## Verification

- Python combined isolated-persistence suite: **32 passed**, covering restart
  reconciliation, durable delivery, release selection and artifact delivery.
- Subsequent symlink-cleanup retention adjustment: affected regression passed;
  all three affected Python files compiled. The entire combined suite was not
  rerun after that narrow adjustment.
- Node focused route suite: **12 passed**, exercising actual mounted routes
  for readiness, disabled warm state, rejected readiness, stream/cancel auth,
  404s, dropped sockets, hanging upstream deadlines and owner forwarding.
- Independent review identified defects in initial changes; targeted fixes and
  regression checks addressed them.
- `git diff --check` passed. Existing Node subsystem TypeScript errors remain;
  this is not a clean whole-project typecheck claim.
- Restarted the app workflow once after changes. Initially unavailable Python
  yielded Node readiness false. Subsequently `/api/system/readiness` returned
  HTTP 200 with `ready=true`, `generation_ready=true`, `model_blocked=false`,
  and breaker `closed`, even with optional deep warm still pending.
- Running release reports `legacy-explicit-release`, candidate quality
  `not_selected`, backend exclusivity `not_verified`.
- App preview rendered and hydrated without browser errors. Startup logs
  confirm native ioredis remains selected for BullMQ.

Tests use isolated journals and controlled transport/renderer fixtures.
They do not prove model output quality, instance-loss recovery, or production load.

## Remaining production blockers

The latest existing frozen evaluation is
`reports/maxcore-fused/live-1790386655338/quality-assessment.json`
(2026-09-26). It records **12/12 requests returning 503**, no model text and no
media artifacts. This evaluation was inspected, not rerun in this change.

- Text conditioning exceeds the active checkpoint's unknown-token threshold.
  Loadable numerical weights do not establish usable learned text generation.
- The selected legacy release explicitly lacks learned audio/video generation.
  Procedural controls are a separate capability, not a substitute.
- No accepted candidate-quality/backend-exclusivity result establishes full
  production capability.
- Live delivery outage/recovery, instance-loss restoration, representative
  throughput and published cold-boot acceptance remain unverified here.

Do not loosen rejection gates, fabricate artifacts, or call health/readiness
success a quality pass to clear these blockers.