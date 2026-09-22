# Product/autonomous implementation — PA-3–PA-6

## Scope and status

Read `reports/readiness-audit/product-autonomous.md` and current engine, registry,
evolution health gate, middleware, session APIs, circuit API and autofix fixtures.
Implemented recommended typed in-process containment and consumer-specific
canary approaches, strengthening existing bounded posting/content consumers.
Application remained stopped. No provider calls, live database operations,
migrations applied, dependency installation, workflows, full typecheck or full
suite. PA-1/PA-2 belong to the client agent and are not assessed by this report.

| ID | Status | Actual result and release gate |
|---|---|---|
| PA-3 | **Partial; composition blocked** | Engine dispatches typed session, dependency and feature actions; refuses unacknowledged effects; includes effect scope/expiry/errors in existing threat audit JSON. New real process-local guards deny API traffic, feature access and dependency callback execution. Tests connect the engine to these guards. Production composition and authoritative session acknowledgement remain main/security owner work below. No fleet-wide containment claim. |
| PA-4 | **Partial existing-consumer strengthening; new capabilities blocked** | Posting scheduling, generator-request knobs and manual format selection now share executable production consumer functions with the canary. Distribution/compliance/feature categories remain advisory, not new capabilities. No trained model or missing policy engine was fabricated. |
| PA-5 | **Implemented for bounded request/scheduling contracts; deployment acceptance pending** | Post-apply gate now exercises production scheduling, content-request shaping and format mapping per upgrade/platform, persists observations in existing registry JSON and automatically deactivates only failed upgrade IDs. Healthy HTTP cannot override a broken consumer contract. Provider response quality, delivery and fleet integration remain release gates. |
| PA-6 | **Partial component evidence only; release gate blocked** | Added isolated adapter and connected-engine tests. Hermetic assembled deployment acceptance, restart and durable-state tests, real proxy identity and real build/autofix gates remain unexecuted under the stopped/no-services constraint. |

## Implemented enforcement

`server/services/securityContainment.ts` exports `SecurityContainment`,
`ContainmentAdapters`, `ContainmentEffect`, and `ContainmentDeniedError`.
Constructor options accept only trusted server-owned route-prefix bindings and
an injected session revoker returning `Promise<{ confirmed: true }>`.
Undefined/void revocation results fail rather than becoming success.
Do not use legacy `SessionTrackingService.revokeAllUserSessions` as proof:
its existing fallback may return zero after infrastructure failure.

Dependency and feature isolation are deliberately **process-scoped**. Default
duration is 60 seconds, allowed range 1–300000 ms; repeat delivery during an
active interval does not extend expiry. Explicit restoration and natural expiry
restore execution. Prefix matching uses path-segment boundaries. Binding
configuration is copied defensively. Unknown routes cannot request a target.
The guard returns 503 without forwarding isolated requests; dependency wrapper
never invokes its callback while blocked. This is real denial, not a metadata
toggle, but must be mounted at actual application boundaries.

Engine composition supports constructor injection or one-time
`selfHealingEngine.configureContainment(adapters)`. At threat level >=0.95,
only allowlisted matching routes propose dependency/feature isolation. Request
body/header target IDs are never used. Session kill requires the authenticated
event source user ID. User IDs now support existing string identities.
Acknowledged controls count as containment and are included in
`securityThreats.healingActions` and metadata, using the existing schema.
Audit persistence remains the existing best-effort engine path; its failure
does not undo enforcement. Durable audit reconciliation is still a release gate.
Automatic global route isolation can itself be abused for denial of service:
operators must approve narrow bindings before enabling it.

## Actual evolution consumers and canary

`evolutionConsumers.ts` contains production functions now used by
`autopilot-engine.ts` for scheduling and generator request construction, and by
`unifiedAIController.ts` for manual-generation format preference mapping.
The original caller's explicit content-type preference still wins. Defaults and
learned-hours precedence remain unchanged. Scheduling now honors midnight (0)
instead of treating it as absent, and orders twice-daily windows chronologically.

`evolutionCanary.ts` invokes these same functions, not a parallel mock
implementation. For candidate platform scopes it checks daily/twice-daily/weekly
future posting windows at midnight, noon and end-of-day; content variant bounds,
visual preferences, hashtag/caption/CTA passthrough, objective and format
mapping. Expectations are checked against independently read effective registry
state. It does not publish, call a provider or train/generate expensive models.
This is request-construction acceptance, not a claim of generated-content quality.

`monitorDeploymentHealth` runs candidate-specific checks before its existing
HTTP check. Failure deactivates that candidate through the existing durable
rollback path; remaining healthy candidates remain active. Missing durable
validation evidence attempts rollback and rejects rather than silently passing.
If persistence also prevents rollback, the error remains explicit and requires
operator remediation; restart/fleet recovery is not certified. Observations and
contract version `consumer-request-v1` persist on the existing registry entries
as optional `consumerValidation`, preserving old records without a DB migration.
The active/deactivated entry and its consumer result retain the candidate outcome.

## Required integration patches (main/security/domain owners)

No shared files were edited. No migration IDs; no new tables are required here.

1. In `server/index.ts` after authoritative auth setup, call
   `configureApplicationContainment(selfHealingEngine, confirmedSessionRevoker)`
   from `securityContainment.ts` exactly once and mount the returned
   `control.guard` before bound handlers. `getApplicationContainment()` retrieves
   that exact singleton and throws before composition. The helper binds only
   `/api/autopilot/predict-engagement` to `autopilot-prediction` and
   `/api/auto-updates/run-once` to `evolution-manual-cycle`. Start/stop, auth,
   readiness, recovery and unrelated routes remain outside these bindings.
   Main/security owner must approve these narrow controls. No second instance
   with disconnected state should be created.
2. Configure its `revokeSessions` callback through security owner's durable
   generation authority. Required contract: await authoritative user-generation
   advancement, read back/verify generation >= acknowledged generation, then
   return `{ confirmed: true }`; any write/read/verification failure rejects.
   A bare `await revokeUserSessions(userId); return {confirmed:true}` is **not**
   acceptable unless that function itself now guarantees durable verification.
   Main must integrate the authority into actual session issue/validate paths.
3. Ensure event `source.userId` is populated only from authenticated server
   identity after session/auth middleware. Never derive it from body/header.
   If current security middleware precedes authentication, retain early IP
   enforcement but add trusted identity-aware event reporting after auth.
4. At domain dependency call owners (including background workers), wrap calls
   with the same `control.executeDependency(target, operation)`. At non-HTTP
   feature authorization boundaries call `control.assertFeatureAllowed(target)`.
   HTTP guard alone does not certify background dependency isolation. Mounting
   and these consumer calls must be tested before claiming PA-3 complete.
5. Fleet/restart requirement: process-local isolation clears on restart and
   does not propagate to another replica. Agree durable control authority and
   expiry/reconciliation policy with security owner before claiming fleet
   containment. Do not mislabel the existing process acknowledgement.
6. PA-4: distribution owner must define bounded routing overrides; compliance
   owner must define monotonic non-weakening policy settings; feature owners must
   approve per-feature evaluation APIs. Only then add registry effective fields,
   revalidate legacy advisory records without implicitly activating them, and
   test apply/reload/rollback at those owners' real consumers.
7. PA-5 consumer contract is now wired. Before release, certify it in a hermetic
   assembled deployment with durable storage, provider-boundary compatibility,
   actual restart and concurrent registry writers. Provider failures and quality
   budgets remain separate from the implemented request-shaping contract.

## Evidence actually executed

Command:

`env -i PATH="$PATH" HOME=/tmp NODE_ENV=test node_modules/.bin/vitest run tests/unit/self-evolution-simulation.test.ts tests/unit/evolution-registry.test.ts tests/unit/security-containment.test.ts tests/unit/selfHealingSecurityEngine.test.ts --maxWorkers=1`

Final result: **4 files, 59 tests passed**. External database/logger boundaries
are mocked, session revoker is injected; no real credentials or services used.
Tests cover acknowledged/void/failed session revocation, callback denial,
segment-boundary scoping, bounded duration, duplicate expiry, feature/API denial,
restoration, engine action planning/dispatch, acknowledgement rejection, and
existing security regression coverage. Added healthy-HTTP/broken-consumer,
broken-scheduler, targeted rollback, midnight/twice-daily scheduling, persisted
validation reload and rollback-to-default coverage. Existing evolution tests
exercise actual generator inputs with provider calls mocked. A preexisting
isolated HTTP fixture verifies 503 rollback; the new HTTP-200 tests mock HTTP.
Seven changed production files also passed isolated esbuild TypeScript syntax
transforms. No full typecheck was run. Earlier iterations exposed an error-message
compatibility mismatch and a test helper naming mistake; both were corrected
before the recorded passing run.

These are component contracts, not deployed auth/provider acceptance.
No browser screenshot was attempted because the application is stopped and
this work has no UI changes. Existing autofix simulation still mocks PDIM/Lua
and fixture build commands; it was inspected, not promoted to real-build
evidence or rerun as a substitute for PA-6.