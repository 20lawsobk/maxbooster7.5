# Product UX and autonomous-systems readiness audit

Date: 2026-09-19. Method: current-source, read-only inspection; no application changes, executions of simulations, browser tests, service calls, secret inspection, or live database access. This is the product/autonomous portion of a platform audit, not a certification of every route. Historical simulation results below are reported results, not newly reproduced results. Task proposals/cancellations are not evidence.

## Blocker list

| ID | Finding / classification | Priority; release scope; confidence |
|---|---|---|
| PA-1 | Settings theme selector persists a different state from the actual theme consumer. **CONFIRMED defect** | P2; settings/appearance release; high |
| PA-2 | Concurrent preference edits can restore a stale whole-form snapshot after a failure. **CONFIRMED defect** | P2; settings preference editing; high |
| PA-3 | Security healing cannot execute session invalidation, circuit breaking, or feature isolation. **CAPABILITY GAP** | P1; autonomous security containment claims, not every platform release; high |
| PA-4 | Evolution only has live consumers for posting/content knobs, not its other declared enhancement categories. **CAPABILITY GAP** | P1; broad autonomous feature/distribution/compliance evolution claims; high |
| PA-5 | Evolution post-apply validation measures local liveness, not the changed consumer's correctness. **CAPABILITY GAP** | P1; unattended evolution promotion; high |
| PA-6 | Latest simulations are component/fixture evidence, not deployment integration acceptance. **VERIFICATION GATE** | P1; production promotion of evolution, security healing and autofix; high for evidence boundary, unknown live outcome |

No P0 defect established in this domain. P2 items should be fixed for the advertised UX; they do not imply the entire platform must stop serving. Capability gaps block the named capability claims until implemented and accepted. None of the alternatives below is a guaranteed first-attempt fix.

### PA-1 evidence and impact

Entrypoint `/settings`: `client/src/App.tsx:233`. The Appearance selector calls `handlePreferenceChange("theme", value)` (`client/src/pages/Settings.tsx:1276-1306`). That handler updates page-local state and PUTs the account preference, then invalidates the preference query (`client/src/pages/Settings.tsx:431-455`). The server really persists it (`server/routes.ts:913-961`), so this is not a fake save.

Actual rendering instead uses `ThemeProvider`, mounted at `client/src/main.tsx:81-122`. It initializes exclusively from localStorage and changes DOM classes from its own state (`client/src/contexts/ThemeContext.tsx:15-53`); its setter writes that localStorage key (`:69-72`). The Settings path does not call this setter. Result: a successful Appearance save need not change the displayed theme, and reload still reads the unrelated local value. This is an inert *effect*, not an unhandled button. Cross-device account preference and local theme can disagree.

### PA-2 evidence and impact

Active Studio Preferences controls invoke an unrestricted async handler (`client/src/pages/Settings.tsx:1276-1280,1328-1334,1401-1404`). Each call captures the entire `preferences` object, optimistically changes one key, and on failure reinstates the whole captured object (`:431-455`). Query results also replace the object (`:351-362`). With edits A then B, successful B followed by failing A can overwrite B's displayed success after B's refetch has completed; repeated same-key writes can also complete out of intent order. This establishes a frontend race, not a claim that database JSON merge is broken: `server/routes.ts:955-961` merges supplied preferences.

The similarly shaped notification handler at `client/src/pages/Settings.tsx:403-428` is not counted as a second active defect: the notifications tab mounts `NotificationPreferences` at `:1256-1258`, rather than proving that handler is reachable. Scope here is the active preference controls only.

### PA-3 evidence and impact

`SelfHealingSecurityEngine` explicitly throws unsupported errors for `session_kill`, `circuit_break`, and `feature_disable` (`server/services/selfHealingSecurityEngine.ts:749-770`). Session kill is actually proposed in the response plan (`:654`); the other two are declared action types (`:63-65`) and unsupported dispatch cases, not proven reachable automatic plans. They are grouped because the root cause is missing enforcement adapters. Operator consumer is `/admin/autonomy` (`client/src/App.tsx:251`), whose self-healing queries are at `client/src/pages/AdminAutonomy.tsx:422-435`.

IP blocking and finite rate limiting exist (`server/services/selfHealingSecurityEngine.ts:720-747`); do not describe all security healing as a stub. Current unsupported actions honestly fail, rather than falsely claiming completion. Remaining impact: a compromised session cannot be revoked through this engine and affected features/dependencies cannot be isolated through these action types. Security provider/authentication implementation details belong to the primary security audit; this finding is the autonomous enforcement contract.

### PA-4 evidence and impact

`server/services/evolutionRegistry.ts:27-43` declares five categories but marks only `posting_optimization` and `content_optimization` consumed. `:45-76` enumerates effective fields. `distribution_config`, `platform_compliance`, and `feature_flag` are therefore advisory, not live enhancements. Genuine consumers exist at `server/autopilot-engine.ts:361,684,721` and `server/autonomous-autopilot.ts:410,610`. Deployment differentiates application from advisory recording (`server/self-evolution-engine.ts:2257-2325`).

Entrypoint/consumer: `/admin/autonomy` and the evolution deploy path. Impact: a release promising autonomous distribution, compliance or feature delivery exceeds implemented behavior. This is not the historical false-applied-count bug, nor proof that arbitrary generated source is deployed. AI/provider availability belongs to its primary domain and is not duplicated here.

### PA-5 evidence and impact

`monitorDeploymentHealth(appliedUpgradeIds)` makes one loopback `/api/health` request, accepts any 2xx, discards the body, and records `errorRate: 0` (`server/self-evolution-engine.ts:2384-2417`). Fast responses return true (`:2429-2431`); slow/error paths invoke rollback analysis (`:2419-2440`), whose thresholds are error rate >5% or latency >3000ms (`:2445-2456`).

The server can remain healthy while newly changed posting hours/content knobs are unsuitable or generation fails. This gate contains no check of those outcomes. The status handling and canary-ID rollback are improvements, not regressions to relist. Impact is insufficient autonomous promotion evidence, not proof that a particular applied upgrade harmed production.

### PA-6 evidence and impact

Current tests corroborate the historical reports' isolation:

* Evolution uses Map-backed storage and mocks optimization storage, industry monitoring, learned data, publishing and generation boundaries (`tests/unit/self-evolution-simulation.test.ts:4-18,26-72`).
* Security uses an injected chain-compatible fake database and the real middleware factory (`tests/unit/selfHealingSecurityEngine.test.ts:3-29,43-60`). This is useful connected component coverage, not a real database/proxy deployment.
* Autofix mocks PDIM and Lua control functions (`tests/unit/autofix-simulation.test.ts:7-30`), substitutes remediation callbacks (`:53-59`), and replaces `npx` with a fixture command (`:265-271`).

Historical reports examined: `reports/self-evolution-simulation.md`, `reports/security-self-healing-simulation.md`, `reports/autofix-simulation.md`. Their reported passes should not be upgraded to production passes. Their fixes for false application credit, failed persistence handling, inappropriate private-IP bypass, and rollback targeting are not listed as open defects here. Missing acceptance evidence spans durable restart, real adapter contracts, deployed proxy identity and real build gates. No claim is made that such integration necessarily fails, or that no other tests exist anywhere.

## Repair playbooks

Each A–D is a distinct end-to-end implementation route, not one step of a shared four-step plan. Acceptance should be recorded against an immutable revision with rollback ownership.

### PA-1 — unify appearance state

**A — Account-authoritative theme provider (recommended).** Best cross-device consistency; requires a loading/anonymous policy.
1. Define account-versus-anonymous theme precedence and audit existing saved values.
2. Make ThemeProvider subscribe to the authenticated preference query and expose its mutation.
3. Route Settings and the theme toggle through that provider; migrate valid local values only when no account value exists.
4. Test save failure, reload, login/logout, system preference changes and two devices.
5. Accept when selector, DOM class and persisted account value agree without refresh; retain rollback for preference migration.

**B — Explicit local device appearance.** Fast, predictable offline behavior; sacrifices account-wide theme synchronization.
1. Establish that appearance is device-local and identify obsolete server theme values.
2. Connect Settings directly to `useTheme().setTheme` and label the setting as device-local.
3. Migrate the account value once into an empty device store and retire the redundant server field through a versioned migration.
4. Test existing/new devices, localStorage errors and system changes.
5. Accept when every local appearance control changes the actual DOM and the documented device scope is accurate.

**C — Shared preference store with synchronization.** Supports offline use; more conflict-resolution complexity.
1. Define versioned theme records and conflict precedence for local/server updates.
2. Introduce a single store consumed by Settings and ThemeProvider.
3. Hydrate legacy values and queue authenticated synchronization with explicit failure status.
4. Test offline edits, reconnection, concurrent devices and stale server replies.
5. Accept deterministic convergence and visible unsynced state, with no divergent theme display.

**D — Server-rendered/bootstrap preference authority.** Avoids initial theme flash; adds bootstrap coupling.
1. Specify a sanitized theme bootstrap payload and anonymous fallback.
2. Load account preference before app mounting and initialize ThemeProvider from that payload.
3. Make the Settings save update both authoritative bootstrap cache and provider state; migrate existing local overrides.
4. Test bootstrap failure, authenticated reload and post-save navigation.
5. Accept matching first-paint and post-save theme behavior plus a tested bootstrap rollback.

### PA-2 — make preference writes ordered and conflict-safe

**A — Serialized mutation queue (recommended).** Smallest behavioral change; a slow request delays subsequent saves.
1. Define last-user-intent semantics and capture the overlapping-edit regression.
2. Queue preference writes through one mutation coordinator, maintaining pending per-key values.
3. Replace whole-object rollback with server baseline plus remaining queued edits.
4. Test reordered completion, first/middle failure and refresh while pending.
5. Accept that final displayed and persisted values match the last acknowledged intent with explicit failed edits.

**B — Versioned compare-and-set API.** Strong multi-device safety; needs schema/API evolution.
1. Define preference revision and conflict response contracts.
2. Add revision-checked atomic writes and return the accepted canonical object.
3. Backfill revisions and make the client rebase pending changes after conflicts.
4. Test concurrent tabs/devices, stale revisions and failure recovery.
5. Accept no silent overwrite and deterministic conflict resolution under adversarial ordering.

**C — Explicit draft-and-save form.** Easier transactional UX; removes instant saving.
1. Specify draft, dirty-state and navigation-warning behavior.
2. Replace per-control network calls with a validated draft and one save operation.
3. Return canonical preferences after the atomic save and preserve failed drafts for retry.
4. Test multiple edits, double submission, validation errors and navigation.
5. Accept one coherent saved snapshot and a visible unsaved state on failure.

**D — Per-key sequenced optimistic mutations.** Responsive independent controls; more client bookkeeping.
1. Define a per-key request sequence and authoritative baseline.
2. Assign sequence IDs and ignore stale responses; rollback only the failed key's still-current intent.
3. Merge query refreshes with pending keys rather than replacing the entire object.
4. Test same-key rapid toggles, different-key failures and late refetches.
5. Accept isolation between controls and a reconciliation check proving server/UI agreement.

### PA-3 — implement actual security containment

All alternatives must cover session revocation, dependency isolation and feature isolation, not merely relabel unsupported actions.

**A — In-process typed enforcement adapters (recommended).** Reuses existing infrastructure; tightly couples engine and consumers.
1. Inventory session ownership, circuit owners and feature authorization boundaries.
2. Implement idempotent adapters with authorization, scoped target IDs and explicit results.
3. Wire engine actions and durable audit records; migrate action payloads to the typed contracts.
4. Test real test-session rejection, dependency-call refusal and feature-access refusal, plus restoration/failure cases.
5. Accept only when each action changes its real consumer and the audit state matches enforcement.

**B — Durable remediation worker.** Better retry/restart handling; adds queue latency.
1. Define action schemas, deadlines, deduplication keys and reversal policy.
2. Publish authenticated remediation jobs and implement workers for the three control families.
3. Persist pending/applied/failed status and reconcile interrupted jobs.
4. Test duplicate delivery, worker crash and actual protected-resource behavior.
5. Accept bounded completion time, restart-safe enforcement and accurately reported failures.

**C — External policy control plane.** Centralized fleet enforcement; operationally heavier.
1. Select a control plane supporting session deny lists, dependency policy and feature policy.
2. Build authenticated engine adapters and consumer policy subscriptions.
3. Migrate policy state with versioned acknowledgments and expiry/reversal handling.
4. Test multi-instance propagation, partitions and session/dependency/feature denial.
5. Accept measured propagation bounds and fail-safe recovery without indefinite accidental isolation.

**D — Approval-mediated security operations.** Safer for high-impact actions; not fully unattended.
1. Define responder roles, approval thresholds and incident deadlines.
2. Implement durable action requests with approve/reject and scoped execution APIs.
3. Add real adapters behind approval and migrate unsupported plans to pending approval, never success.
4. Test end-to-end responder execution, permission abuse and rollback for each action family.
5. Accept actual enforcement and truthful pending states; advertise human-approved rather than autonomous containment.

### PA-4 — extend evolution beyond the currently consumed knobs

**A — Typed runtime consumers (recommended for bounded settings).** Direct and auditable; unsuitable for arbitrary new features.
1. Define allowed distribution, compliance and feature schemas with domain owners.
2. Add validated consumers at their real routing/policy/feature evaluation boundaries.
3. Migrate advisory records only through revalidation; activate no legacy advisory implicitly.
4. Test before/apply/restart/rollback behavior for every newly supported effective field.
5. Accept applied credit only for demonstrable consumer changes, with per-category rollback.

**B — GitOps evolution delivery.** Strong review/build guarantees; slower delivery.
1. Define proposal-to-patch contracts and repository approval policies.
2. Generate versioned configuration/code changes as reviewable pull requests.
3. Deploy accepted proposals through real CI and record revision-to-upgrade mappings.
4. Test compilation, domain integration, canary deployment and revert.
5. Accept only deployed verified revisions as applied; preserve advisory history separately.

**C — Domain command orchestration.** Uses existing business workflows; requires idempotent domain APIs.
1. Specify typed commands for distribution configuration, compliance policy and feature activation.
2. Implement domain-owned command handlers and an evolution orchestrator.
3. Migrate registry state to command/result references with compensating actions.
4. Test partial execution, retries, authorization and compensation at the real consumer.
5. Accept applied status only after domain acknowledgment plus outcome verification.

**D — Versioned policy bundle engine.** Unified declarative approach; requires a new policy evaluator.
1. Design a bounded policy language covering the three missing categories.
2. Implement signed bundles, schema validation and consumer evaluation hooks.
3. Convert approved advisory proposals to versioned bundles with staged activation.
4. Test evaluator compatibility, stale bundles, restart and bundle rollback.
5. Accept consistent behavior across consumers and an auditable active-bundle identity.

### PA-5 — validate changed behavior before promotion

**A — Consumer-specific canary gate (recommended).** Targeted evidence; requires representative acceptance contracts.
1. Define invariants for posting windows and generated-content requests with measurable failure budgets.
2. Add post-apply probes exercising the affected consumer, not just `/api/health`.
3. Associate observations with upgrade IDs and persist promotion/rollback decisions.
4. Inject healthy-server/broken-consumer cases and verify only the failing canary is reverted.
5. Accept promotion only when consumer invariants and liveness both pass.

**B — Cohort rollout with outcome telemetry.** Measures real effects; slower and needs adequate sample sizes.
1. Define eligible cohorts, minimum sample size and safety thresholds.
2. Apply upgrades to a small cohort and collect consumer error/outcome metrics.
3. Persist cohort assignment and automate expansion or rollback against a baseline.
4. Test metric loss, low sample size and harmful-but-fast consumer behavior.
5. Accept promotion only after the observation window and statistically justified safety criteria.

**C — Shadow execution and replay gate.** Avoids initial user exposure; shadow equivalence needs maintenance.
1. Build a consent-safe representative input corpus and expected invariants.
2. Execute baseline and proposed consumer configurations in isolated shadow paths.
3. Store comparison evidence and promote only approved configuration hashes.
4. Test replay determinism, invalid content knobs and behavior divergence.
5. Accept invariant-preserving comparisons plus a small real-consumer smoke check after activation.

**D — Approval-gated evidence workflow.** Lowest unattended risk; adds operator work.
1. Define review checklists and responsible domain approvers.
2. Keep validated proposals pending until consumer-specific evidence is attached.
3. Implement approval-linked application and immediate reversible deployment.
4. Test missing/stale evidence, rejected proposals and rollback after approval.
5. Accept signed evidence for the exact applied version; describe operation as supervised evolution.

### PA-6 — establish deployment integration acceptance

Each option retains the useful simulations and adds real adapter/build evidence. Mocks may remain in unit tests but are not substitutes for this acceptance.

**A — Hermetic integration environment (recommended).** Reproducible and safe; requires infrastructure matching.
1. Define real database/storage/PDIM contracts, proxy topology and split build commands.
2. Provision isolated compatible services and run actual lint/type gates on the candidate revision.
3. Exercise real security middleware through the proxy and real persistence adapters across process restart.
4. Run evolution apply/rollback and autofix remediation/failure scenarios with actual adapter effects.
5. Accept archived gate results, durable state verification and teardown proof for the exact revision.

**B — Dedicated deployed staging acceptance.** Closest topology match; higher cost and drift risk.
1. Provision a production-shaped staging deployment with nonproduction credentials and synthetic identities.
2. Deploy the candidate through the real release pipeline.
3. Execute scoped security, evolution and autofix journeys using real staging backing services.
4. Exercise restart, persistence outage, proxy identity and rollback under controlled faults.
5. Accept observed consumer outcomes and a passing real build, with staging drift documented.

**C — Adapter certification plus ephemeral assembled system.** Parallelizes ownership; requires disciplined versioning.
1. Assign contracts and compatibility versions to each persistence/control/proxy adapter.
2. Certify each against its real isolated service, including timeouts and durable read-after-restart.
3. Assemble certified versions with the candidate app in an ephemeral deployment.
4. Run cross-adapter lifecycle tests and actual repository lint/type gates.
5. Accept only the tested version matrix and end-to-end state transitions, not isolated certificates alone.

**D — Controlled internal canary deployment.** Highest environment fidelity; needs strict authorization and blast-radius limits.
1. Obtain explicit operational approval and define internal-only identities, scopes, backups and stop criteria.
2. Require actual build gates before deploying the canary to an isolated internal slice.
3. Exercise real adapters and proxy paths without customer traffic or external publishing side effects.
4. Verify restart persistence and scoped fault/recovery behavior while observing real consumer outcomes.
5. Accept signed evidence and cleanup/reversal completion before gradual release; stop rather than infer success on missing telemetry.

## Examined-surface inventory and unexamined boundaries

Inspected route registration in `client/src/App.tsx`; targeted Settings handlers/controls and theme provider/bootstrap; searched Dashboard, Admin, AdminDashboard, AdminAutonomy, Workspaces, DeveloperApi and MusicWorkflowAutomations for inert/stub indicators; traced AdminAutonomy error/status queries; inspected preference persistence in `server/routes.ts`; examined evolution registry categories, consumer references and post-deployment gate; security healing action dispatch; autofix implementation references; and current simulation test setup against the three historical simulation reports.

Search hits alone were not treated as defects. In particular, current admin error handling and working profile persistence were not called broken, and a placeholder attribute is not an unimplemented feature. The inspected theme mismatch is actionable without inventing an inert button.

Not exhaustively examined: every component/form, studio/DAW, accessibility and responsive rendering, all public marketing claims, every admin permission boundary, billing/distribution/provider operations, database migrations, multi-region convergence, actual frontend runtime, deployed proxy configuration, or live durable services. No browser/visual check was performed because this assignment is a source-only report, not an application change. No heavy tests were run. Primary AI/provider, payments, infrastructure and security findings should be supplied by their owning audit domains; this report does not duplicate their root causes or assert platform-wide production readiness.