# Max Booster senior engineering team playbook

Active release: **admin-private**. Full use by the existing administrator; public general availability is deferred. This document is generated from the reviewed task catalog, not from completed product acceptance.

The deterministic expansion contains 625 assignments. Each broad task must be further bound to exact observed routes, controls, entities and files during discovery. No finite static catalog proves that every undiscovered interaction has been enumerated.

## Organization and ownership

### product — Senior product manager

Turn the Max Booster mission into observable artist and business outcomes.

1. Inventory actors, tenant boundaries, and supported subscription plans.
2. Write one acceptance scenario for every discovered user action and failure outcome.
3. Separate contractual release scope from hypotheses and preserve unresolved requirements.
4. Rank defects by user harm, severity, dependency, and measurable launch impact.
5. Resolve requirements disputes with recorded evidence and hand accepted specifications to the architect.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### techlead — Staff engineering lead

Own task decomposition, integration order, and the technical decision trail.

1. Break every broad assignment into bounded changes with concrete file ownership.
2. Resolve dependency cycles and coordinate overlapping source edits serially.
3. Require independent review for every delivered artifact and source change.
4. Keep failed and unverified work visible; never trade away a release gate.
5. Integrate narrow candidate changes and route cross-domain failures to the accountable specialist.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### architect — Senior systems architect

Specify contracts and failure boundaries before implementation.

1. Trace each page through its API, service, store, worker, and provider.
2. Define entities, state transitions, transaction boundaries, and ownership invariants.
3. Document compatibility, migration, cache, queue, and deployment decisions.
4. Evaluate scale using measured workloads and explicit capacity assumptions.
5. Review changes for coupling, correctness, and recoverability.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### ux — Senior product designer

Make critical workflows understandable and recoverable.

1. Map each persona journey and annotate every decision and irreversible action.
2. Specify loading, empty, validation, failure, permission, and success states.
3. Define keyboard focus, responsive behavior, content hierarchy, and action labels.
4. Measure task completion with observed user or browser evidence.
5. Hand exact interaction contracts to frontend and accessibility specialists.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### frontend — Senior frontend engineer

Implement reliable browser interactions against verified contracts.

1. Trace route registration, component state, API requests, and cache invalidation.
2. Implement typed forms, useful errors, and durable success states.
3. Handle retries, cancellation, stale data, offline recovery, and route transitions.
4. Preserve semantic HTML, keyboard access, focus, and responsive layouts.
5. Diagnose client render, hydration, memory, and request performance from traces.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### backend — Senior backend engineer

Implement truthful, authorized, durable application behavior.

1. Validate requests and derive user and tenant identity from the session.
2. Enforce business state transitions at the service and storage boundary.
3. Use transactions, idempotency, and durable job handoff for side effects.
4. Bound payloads, pagination, retries, timeouts, and resource usage.
5. Return typed errors and observable outcomes without leaking internal data.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### data — Senior database engineer

Preserve data integrity and make data operations measurable and reversible.

1. Map entities, foreign keys, tenant keys, constraints, and retention policies.
2. Design migration expansion, backfill, validation, contraction, and rollback plans.
3. Inspect query plans, indexes, lock contention, and connection consumption.
4. Verify transaction isolation, race handling, and uniqueness under concurrent requests.
5. Exercise backup restoration and reconciliation only in disposable environments.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### integrations — Senior integration engineer

Make external-service outcomes truthful and replay-safe.

1. Inventory provider contracts, version assumptions, scopes, and callback endpoints.
2. Separate test fixtures, provider sandbox evidence, and production evidence.
3. Implement timeout, retry, rate-limit, idempotency, and partial-failure handling.
4. Verify signed webhooks, replay protection, reconciliation, and revocation.
5. Expose actionable unconfigured or unavailable states instead of simulated success.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### ai — Senior AI application engineer

Bound model-mediated behavior and evaluate it against real tasks.

1. Map prompts, retrieval sources, tool permissions, and model/provider dependencies.
2. Define structured outputs, grounding requirements, refusal and escalation conditions.
3. Keep untrusted content separate from tool authority and user intent.
4. Evaluate task success, prompt injection, leakage, cost, latency, and cancellation.
5. Version evaluation fixtures and route uncertain or unavailable capabilities honestly.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### qa — Senior quality engineer

Produce reproducible evidence for behavior and regression risk.

1. Trace every acceptance criterion to executable tests and retained raw evidence.
2. Design boundary, negative, role, tenant, concurrency, and recovery cases.
3. Use disposable services and deterministic fixtures; label mocks and skips explicitly.
4. Generate proposed tests outside protected validation code for independent review.
5. Reproduce failures on the old behavior, verify fixes, and report coverage gaps without lowering thresholds.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### security — Senior application security engineer

Identify and verify exploitable application and agent failures.

1. Threat-model authentication, authorization, payments, uploads, webhooks, and AI tools.
2. Exercise tenant and role denial cases and inspect request-to-data trust boundaries.
3. Review session, token, secret, logging, dependency, and supply-chain exposure.
4. Validate injection, XSS, CSRF, SSRF, path traversal, replay, and abuse defenses in isolation.
5. Block release on unresolved critical or high findings and distinguish compliance evidence from certification.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### accessibility — Senior accessibility engineer

Verify that supported workflows are operable across input and assistive modes.

1. Inspect landmarks, names, labels, roles, headings, and announcement behavior.
2. Exercise keyboard navigation, focus containment, recovery, and shortcuts.
3. Measure contrast, zoom, reflow, touch target, and reduced-motion behavior.
4. Combine automated checks with explicit manual or assistive-technology observations.
5. Record page, state, reproduction, severity, and verified remediation for every violation.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### performance — Senior performance engineer

Meet measured responsiveness and resource budgets under representative workloads.

1. Define realistic data sizes, concurrency, workload mix, and environment limits.
2. Measure API percentiles, page timings, bundle sizes, queries, memory, and saturation.
3. Attribute bottlenecks using profiles and query plans before changing code.
4. Run bounded load, soak, spike, and recovery tests against disposable targets.
5. Compare before and after under identical conditions and reject correctness regressions.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### sre — Senior site reliability engineer

Make the deployment observable, recoverable, and operable.

1. Trace runtime startup, dependency readiness, graceful shutdown, and health semantics.
2. Verify bounded retries, worker recovery, job replay, and infrastructure failure behavior.
3. Define service-level objectives, actionable alerts, dashboards, and ownership.
4. Exercise backups, restore, rollback, and incident drills in an isolated environment.
5. Prepare operational artifacts without granting this loop deployment authority.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### release — Senior release engineer

Decide whether source, artifact, and deployment evidence justify release.

1. Bind every result to source, policy, environment, tool version, and artifact hashes.
2. Verify build reproducibility, provenance, dependency locks, and runtime packaging.
3. Collect the exact PASS, FAIL, and UNVERIFIED state for every required gate.
4. Require startup, provider, recovery, monitoring, and rollback evidence for the target.
5. Prepare a reviewed release package and keep deployment authorization separate from task completion.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### docs — Senior technical writer

Make product and operations behavior understandable and reproducible.

1. Document actual supported workflows with prerequisites and truthful outcomes.
2. Publish API request, response, error, pagination, and webhook contracts.
3. Record setup, testing, troubleshooting, migration, backup, and recovery procedures.
4. Check examples against the tested revision and identify unsupported or missing integrations.
5. Make known limitations and support escalation paths discoverable.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### analytics — Senior product analytics engineer

Measure product outcomes without fabricating business facts.

1. Define event meanings, actor and tenant identity, consent, and retention.
2. Separate intent, checkout initiation, payment confirmation, refund, and earned revenue.
3. Reconcile aggregates to authoritative event and financial records.
4. Instrument funnels, retention, activation, and failures without sensitive payloads.
5. Validate deduplication, late events, timezone, currency, and partial-data presentation.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

### incident — Senior incident and defect investigator

Turn observed failures into narrow, reproducible corrective work.

1. Preserve the original symptom, command, environment, and source identity.
2. Reduce failures to a minimal reproduction and identify the first broken invariant.
3. Compare competing causes using traces, logs, and controlled experiments.
4. Route the root cause to its owner and propose a regression test before repair.
5. Record recurrence, fix effectiveness, and escalation when repeated attempts make no progress.

**Boundaries:** Never treat a worker narrative or file existence as execution evidence. Never weaken requirements, thresholds, permission boundaries, or existing tests. Never modify production, publish, send customer communications, spend money, or create provider resources from this loop. Never read or reproduce credentials; use only explicitly provisioned disposable test capabilities.

## Domain acceptance inventory

### Artist management

1. Artist registers, verifies identity, completes onboarding, saves profile, reloads it, and updates the public press kit.
2. Manager joins an artist workspace with limited rights, edits permitted profile fields, and loses access after revocation.
3. Artist uploads profile artwork, replaces it, sees the durable public version, and removes the asset without orphaned storage.
4. Artist exports or erases account data while contractual and financial retention rules remain explicit.

**Risks:** Cross-tenant profile exposure; Public versus private field leakage; Broken onboarding and identity recovery; Deletion that leaves public assets behind

**Discovery path hints:** `client/src/pages/Onboarding.tsx`, `client/src/pages/PressKit.tsx`, `client/src/pages/PublicPressKit.tsx`, `server/routes/artistProfiles.ts`, `server/services/artistProfileService.ts`, `server/routes/onboarding.ts`, `server/routes/accountErasure.ts`

### Fan management

1. Artist imports fan contacts with consent and deduplication, creates a segment, and verifies persisted membership.
2. Fan opts into a membership, changes preferences, unsubscribes, and stops receiving eligible future messages.
3. Artist drafts a fan campaign, previews recipient eligibility, schedules a sandbox delivery, and observes genuine delivery failures.
4. Manager searches, paginates, exports, and deletes authorized fan data without seeing another artist's fans.

**Risks:** Unconsented messaging; Duplicate or cross-tenant recipients; Unsubscribe race conditions; Personal-data export leakage

**Discovery path hints:** `client/src/pages/FanHub.tsx`, `client/src/pages/FanMemberships.tsx`, `server/routes/fanHub.ts`, `server/routes/fanMemberships.ts`, `server/routes/fanCampaigns.ts`, `server/services/fanDeliveryService.ts`, `server/services/fanMailAdapter.ts`

### Project management

1. Artist creates a project, assigns a collaborator and tasks, attaches files, changes status, and reloads all durable records.
2. Collaborator edits an allowed task while a second actor edits concurrently; conflicts are explained without lost updates.
3. Artist duplicates a project and verifies new ownership and independent assets; deleting a project cleans only its owned resources.
4. Manager manages project budgets, deadlines, search, filtering, and export across authorized workspaces.

**Risks:** Lost updates; Asset duplication and deletion ownership; Task permission bypass; Budget precision and timezone errors

**Discovery path hints:** `client/src/pages/Projects.tsx`, `client/src/pages/ProjectsPageImpl.tsx`, `server/routes/projectBudgets.ts`, `server/services/projectDuplicationService.ts`, `server/services/projectOwnedDeletionCleanup.ts`, `server/routes/workspace.ts`

### DAW studio

1. Producer opens a saved session, imports audio, edits tracks and regions, saves, closes, and reopens the same arrangement.
2. Producer records or creates MIDI, changes tempo, edits markers and automation, and verifies playback timing.
3. Producer renders or exports a mix, observes progress and cancellation, and retrieves the genuine output asset.
4. Collaborator lacking edit or export permission is denied; an interrupted save or render resumes without corrupting the session.

**Risks:** Audio clock drift and browser restrictions; Corrupt or oversized media; Nondurable edits and render jobs; Unauthorized stem or project access

**Discovery path hints:** `client/src/pages/Studio.tsx`, `server/routes/studio.ts`, `server/routes/studioMidi.ts`, `server/routes/studioMarkers.ts`, `server/routes/studioGeneration.ts`, `server/services/studioService.ts`, `server/services/studioRenderService.ts`, `server/services/studioProjectAccess.ts`

### Content distribution

1. Artist creates a release, enters credits and rights, uploads valid masters and artwork, and reviews validation errors.
2. Artist submits a release through the authorized provider sandbox and tracks genuine pending, accepted, rejected, and retry states.
3. Artist retries a timed-out submission without duplicate releases, reconciles provider status, and handles signed callbacks.
4. Artist requests a supported update or takedown and sees explicit provider and contractual constraints.

**Risks:** Rights and ownership mistakes; False provider success; Duplicate release submission; Partial chunk upload or callback replay

**Discovery path hints:** `client/src/pages/Distribution.tsx`, `server/routes/distribution.ts`, `server/routes/distribution-toolost-submission.ts`, `server/routes/distribution-release-schemas.ts`, `server/services/distributionSubmissionRepository.ts`, `server/services/distributionChunkedUploadService.ts`, `server/services/distributionService.ts`

### Marketing automation

1. Artist connects a sandbox channel with least privilege, drafts campaign content, previews it, and schedules delivery in the correct timezone.
2. Manager reviews an automated proposal, approves only the intended action, and sees the resulting delivery receipt.
3. Artist pauses or cancels a campaign before execution; workers respect consent, rate limits, and revocation.
4. Artist inspects attribution and failure metrics and reconnects an expired integration without losing drafts.

**Risks:** Unauthorized publishing or spending; Timezone and duplicate scheduling errors; Token revocation; Unverifiable conversion attribution

**Discovery path hints:** `client/src/pages/SocialMedia.tsx`, `client/src/pages/Advertisement.tsx`, `server/routes/socialApprovals.ts`, `server/routes/autonomousSocial.ts`, `server/routes/socialBulk.ts`, `server/routes/promotionalTools.ts`, `server/routes/autopilotPreferences.ts`

### Revenue analytics

1. Artist imports or syncs a royalty statement, maps releases and splits, and reconciles totals to the source.
2. Manager filters revenue by period, currency, source, and project; the UI distinguishes missing data from zero income.
3. Artist records refunds or corrections and verifies historical reports, payouts, and exports without double counting.
4. Collaborator views only entitled royalty shares and disputes a mismatch through a documented workflow.

**Risks:** Floating-point currency errors; Checkout intent counted as revenue; Duplicate or late statement imports; Unauthorized financial disclosure

**Discovery path hints:** `client/src/pages/Royalties.tsx`, `client/src/pages/analytics/RevenueAnalytics.tsx`, `server/services/royaltyEngine.ts`, `server/services/royaltyExports.ts`, `server/services/royaltySplitOwnership.ts`, `server/services/royaltiesCSVImportService.ts`, `server/routes/revenueForecast.ts`

### AI assistant

1. Artist asks a question grounded in authorized project data and receives a traceable answer or an explicit uncertainty response.
2. Artist requests an action, reviews the proposed side effects, and sees only authorized tools execute.
3. A retrieved document or user message tries to override permissions; the assistant keeps tenant data and tool authority isolated.
4. Artist cancels a generation, reaches a rate or budget limit, or encounters a provider outage and gets a recoverable state.

**Risks:** Prompt injection and data leakage; Unbounded model cost and loops; Fabricated completed actions; Tool calls crossing tenant or consent boundaries

**Discovery path hints:** `client/src/pages/Assistant.tsx`, `client/src/pages/CareerCoach.tsx`, `server/routes/assistant.ts`, `server/routes/ai.ts`, `server/services/maxAssistantService.ts`, `server/routes/maxcoreProxy.ts`

### Collaboration tools

1. Artist invites a collaborator, collaborator accepts once, and both see the correct project and role.
2. Members exchange comments or messages, edit concurrently, reconnect after a network loss, and reconcile durable state.
3. Owner changes or revokes permissions while a session is active; subsequent reads, writes, and subscriptions enforce the change.
4. Members review a contribution, resolve a conflict, and access only licensed shared files.

**Risks:** Invitation replay and escalation; Stale realtime authorization; Lost updates and conflict handling; Private message or file leakage

**Discovery path hints:** `client/src/pages/Collaborations.tsx`, `server/routes/collaborations.ts`, `server/routes/collaboration.ts`, `server/services/collaborationService.ts`, `server/routes/sync.ts`

### Marketplace systems

1. Seller creates a licensed listing, uploads assets, previews public metadata, and publishes only a valid listing.
2. Buyer starts sandbox checkout and receives the checkout session without the platform claiming a paid purchase.
3. A verified payment event creates one order and one entitlement; repeated callbacks or retries never duplicate revenue or access.
4. Buyer downloads only entitled assets, requests a supported refund, and seller sees reconciled order and payout status.

**Risks:** Fabricated purchases; Duplicate orders and entitlements; Unauthorized paid-asset access; License, refund, and revenue inconsistency

**Discovery path hints:** `client/src/pages/Marketplace.tsx`, `client/src/pages/Storefront.tsx`, `server/routes/marketplace.ts`, `server/services/marketplaceService.ts`, `server/services/commerce/marketplaceCheckout.ts`, `server/services/marketplaceStemAccess.ts`, `server/routes/webhooks/stripe.ts`

### Subscription management

1. User selects a plan, starts sandbox checkout, and receives entitlements only after authoritative payment confirmation.
2. Subscriber upgrades, downgrades, cancels, or restores an eligible plan with explicit effective dates and proration behavior.
3. Payment failure, retry, refund, chargeback, or out-of-order webhook updates the subscription once and reconciles stale state.
4. User inspects invoices and billing history while another tenant cannot access them; disabled providers surface a truthful unavailable state.

**Risks:** Payment bypass or premature entitlement; Out-of-order webhook state corruption; Plan and price drift; Invoice exposure and double billing

**Discovery path hints:** `client/src/pages/Subscribe.tsx`, `client/src/pages/Pricing.tsx`, `client/src/pages/RegisterPayment.tsx`, `server/routes/billing.ts`, `server/services/subscriptionCheckoutService.ts`, `server/routes/webhooks/stripe.ts`, `server/routes/paymentBypass.ts`

### Administrative controls

1. Authorized administrator completes required authentication, opens scoped dashboards, and sees current source-backed status.
2. Administrator investigates a support or moderation case using least-privilege access and records an attributable action.
3. Administrator changes a permitted control, previews its impact, and can identify or roll back the change through an audit trail.
4. Non-admin, revoked admin, and cross-tenant users are denied both UI and direct API access; bulk actions are bounded and idempotent.

**Risks:** Privilege escalation; Unaudited destructive controls; Sensitive data in dashboards or logs; Misleading readiness and health status

**Discovery path hints:** `client/src/pages/Admin.tsx`, `client/src/pages/AdminDashboard.tsx`, `client/src/pages/AdminAutonomy.tsx`, `client/src/pages/admin/*`, `server/routes/admin.ts`, `server/routes/admin/*`, `server/routes/security.ts`, `server/routes/recoveryCodes.ts`

## Task execution contracts

Platform tasks run once; each domain task expands independently for all twelve domains. Analysis delivers reviewable evidence in the private task directory. Change tasks operate only in the isolated candidate. Dependency receipts are explicit handoffs; a reviewer and trusted check are required for completion. Global release gates run after the final candidate changes.

### p_inventory — Inventory the actual repository and execution environment

**Owner:** techlead; **reviewer:** architect; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** None.

**Inputs**

1. Pinned source revision and source digest
2. Tracked file inventory and package scripts

**Ordered tasks**

1. Record runtime and package-manager versions from actual commands.
2. Enumerate frontend entrypoints, server entrypoints, shared schemas, workers, and deployment manifests.
3. Record environment-variable names and service prerequisites without reading values.
4. Identify owned commands for build, check, tests, startup, and artifact validation.
5. List absent tooling and blocked capabilities with their effects on verification.

**Deliverables**

1. Repository and runtime inventory with exact paths
2. Capability and prerequisite register

**Acceptance**

1. Every claimed component has an observed path or command source.
2. Missing capabilities remain blocked or unverified.

**Independent verification**

1. Reviewer traces a sample of each component class to pinned source.
2. Command availability is distinguished from successful execution.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** techlead. **Related gates:** build, types, start.

### p_scope — Reconcile mission scope with the existing launch ledger

**Owner:** product; **reviewer:** techlead; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_inventory.

**Inputs**

1. Mission and twelve domain journeys
2. Existing launch and page-acceptance ledgers

**Ordered tasks**

1. Apply the user-authorized admin-private release scope; keep all twelve domains usable by the existing administrator and retain public launch items as deferred.
2. Read the existing launch scope without deleting outstanding items.
3. List personas, tenants, subscription levels, and supported environments.
4. Map each requested domain to current journeys and unresolved assumptions.
5. Define explicit launch-critical outcomes and defer only with recorded product authority.
6. Record missing decisions as blockers with an owner and the smallest clarification needed.

**Deliverables**

1. Versioned scope matrix
2. Assumption and decision register

**Acceptance**

1. All twelve domains remain represented.
2. Prior unaccepted pages are not silently accepted by template expansion.
3. Admin readiness and public readiness are separate explicit decisions; public onboarding and high concurrency cannot block unrelated admin workflow fixes.

**Independent verification**

1. Compare catalog journeys and existing ledger identifiers.
2. Reviewer checks that missing information has a blocker rather than an invented requirement.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** product. **Related gates:** features, documentation.

### p_routes — Build the page-to-service dependency inventory

**Owner:** architect; **reviewer:** qa; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_inventory.

**Inputs**

1. Registered frontend and API routes
2. Tracked services, schemas, workers, and tests

**Ordered tasks**

1. Enumerate route declarations and dynamic route parameters.
2. Trace route components through API calls into handlers and storage operations.
3. Record authentication and subscription gates at each layer.
4. Link existing tests and observability to each observed route.
5. Mark untraced edges explicitly and create follow-up discovery work.

**Deliverables**

1. Route and dependency matrix
2. Unmapped-edge backlog

**Acceptance**

1. Every discovered route has an owner and mapped or explicitly unknown dependencies.
2. A rendered page is not recorded as a completed business workflow.

**Independent verification**

1. Sample public, authenticated, and admin routes end to end.
2. Reconcile counts against route registration rather than directory names.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** architect. **Related gates:** features, e2e, integration.

### p_architecture — Specify system boundaries and cross-domain invariants

**Owner:** architect; **reviewer:** techlead; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_scope, p_routes.

**Inputs**

1. Scope matrix
2. Route dependency matrix

**Ordered tasks**

1. Map service and data ownership across domains.
2. Define identity, tenancy, assets, payments, and event invariants shared across domains.
3. Identify transaction and asynchronous handoff boundaries.
4. Record deployment and scale assumptions with explicit unknowns.
5. Write decisions for consistency, compatibility, and failure isolation.

**Deliverables**

1. Architecture decision record
2. Cross-domain invariant register

**Acceptance**

1. Every shared entity and side effect has one authoritative owner.
2. Capacity assumptions are labeled assumptions until measured.

**Independent verification**

1. Reviewer follows one upload, payment, and collaboration flow across boundaries.
2. Contradictions become blocking design tasks.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** architect. **Related gates:** features, operations, performance.

### p_critical_paths — Prioritize complete launch journeys and defect severity

**Owner:** product; **reviewer:** qa; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_scope, p_routes.

**Inputs**

1. Scope and route matrices
2. Current failed and unverified gate report

**Ordered tasks**

1. List the complete actor-to-durable-outcome sequence for each launch journey.
2. Identify where payment, rights, privacy, or data loss can harm users.
3. Rank confirmed defects before speculative enhancements.
4. Record dependency order, user impact, and effort assumptions.
5. Assign a responsible specialist and a measurable completion check to each priority.

**Deliverables**

1. Prioritized journey backlog
2. Severity and impact rubric

**Acceptance**

1. No critical path ends at a button click or HTTP 200 without durable outcome evidence.
2. Severity is supported by a concrete failure or explicit verification need.

**Independent verification**

1. Reviewer verifies the highest-priority journeys have positive and negative acceptance scenarios.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** product. **Related gates:** features, e2e.

### p_identity — Audit authentication, session, and account-recovery contracts

**Owner:** security; **reviewer:** backend; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_architecture.

**Inputs**

1. Auth and recovery routes
2. Session stores and middleware

**Ordered tasks**

1. Trace registration, login, logout, session renewal, MFA, recovery, and revocation.
2. Identify cookie, token, CSRF, rate-limit, and redirect handling.
3. Map sensitive actions requiring reauthentication.
4. Define expired, stolen, revoked, replayed, and cross-origin test cases.
5. Record exploitable findings with exact source and reproduction conditions.

**Deliverables**

1. Identity threat model
2. Authentication verification matrix

**Acceptance**

1. Every identity transition has success and denial cases.
2. No secret or live session value appears in the artifact.

**Independent verification**

1. Run approved isolated auth checks through the trusted verifier.
2. Manual analysis remains separate from actual executed evidence.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** security. **Related gates:** security, integration.

### p_tenancy — Map tenant isolation and role enforcement

**Owner:** security; **reviewer:** data; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_architecture.

**Inputs**

1. Identity ownership model
2. All route and storage dependencies

**Ordered tasks**

1. List roles and their read, create, modify, delete, export, and admin capabilities.
2. Trace tenant derivation from authenticated identity into each store query.
3. Identify object identifiers accepted from clients and jobs.
4. Specify horizontal and vertical escalation probes for each resource family.
5. Map stale role, invitation, and realtime-session invalidation cases.

**Deliverables**

1. Role and tenant capability matrix
2. Isolation test case register

**Acceptance**

1. Every resource family has explicit allow and deny rules.
2. Client-supplied tenant IDs are never assumed authoritative.

**Independent verification**

1. Reviewer selects one resource per domain and traces its enforcement.
2. Trusted tests retain actual denial responses and unchanged-store checks.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** security. **Related gates:** security, integration, features.

### p_data_map — Inventory persistent data, constraints, and retention

**Owner:** data; **reviewer:** architect; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_architecture.

**Inputs**

1. Shared schemas and persistence adapters
2. Cross-domain invariants

**Ordered tasks**

1. Map entity keys, tenant keys, relationships, nullable fields, and uniqueness constraints.
2. Identify source-of-truth records versus derived caches and analytics.
3. Record asset ownership and cascade or cleanup behavior.
4. List personal, financial, and rights-sensitive fields with retention requirements.
5. Document existing migrations and rollback constraints.

**Deliverables**

1. Entity relationship and ownership inventory
2. Retention and migration-risk register

**Acceptance**

1. Every critical entity has an authoritative store and ownership key.
2. Retention and deletion assumptions remain explicit.

**Independent verification**

1. Reviewer traces artist, project, order, subscription, and asset lifecycles.
2. Schema declarations are checked against actual migrations where available.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** data. **Related gates:** features, security, operations.

### p_provider_map — Inventory providers and sandbox acceptance requirements

**Owner:** integrations; **reviewer:** security; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_architecture.

**Inputs**

1. Provider adapters and callback routes
2. Existing provider configuration names

**Ordered tasks**

1. List provider purpose, API version, required scopes, and callback contract.
2. Distinguish absent configuration, local fixture, provider sandbox, and production evidence.
3. Define valid, rejected, rate-limited, expired, and unavailable responses.
4. Record signed-event, retry, reconciliation, and revocation requirements.
5. List missing sandbox capabilities without requesting secrets in reports.

**Deliverables**

1. Provider capability matrix
2. Sandbox verification plan

**Acceptance**

1. No provider is marked functional solely because a mock passed.
2. Every irreversible external action has an explicit execution boundary.

**Independent verification**

1. Reviewer traces each configured provider to a real adapter and test source.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** integrations. **Related gates:** integration, features, security.

### p_test_strategy — Define independent verification layers and evidence contracts

**Owner:** qa; **reviewer:** release; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_critical_paths, p_tenancy, p_data_map, p_provider_map.

**Inputs**

1. Critical journeys and invariants
2. Existing test commands and coverage policy

**Ordered tasks**

1. Map each acceptance criterion to unit, integration, browser, contract, or operational evidence.
2. Specify disposable services, deterministic fixtures, cleanup, and network boundaries.
3. Require fresh source-bound raw results and explicit skip counts.
4. Define old-behavior failure checks for bug regressions.
5. Preserve existing coverage thresholds and identify uncovered code rather than excluding it.

**Deliverables**

1. Verification traceability matrix
2. Fixture and evidence contract

**Acceptance**

1. Each release criterion has a producer or a visible unverified blocker.
2. Mock results are labeled and do not satisfy provider or deployment acceptance.

**Independent verification**

1. Reviewer checks schema, command, exit, source hash, and artifact freshness requirements.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** qa. **Related gates:** unit, integration, e2e, regression, coverage.

### p_ci — Diagnose build and CI execution prerequisites

**Owner:** release; **reviewer:** techlead; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_inventory, p_test_strategy.

**Inputs**

1. Package scripts and workflows
2. Observed CI annotations and local command receipts

**Ordered tasks**

1. Separate jobs that never started from actual command failures.
2. Record account, runner, network, dependency, and resource blockers.
3. Reproduce owned build and check commands with documented runtime limits.
4. Compare lockfiles, package scripts, and nested dependency installation requirements.
5. Prepare a narrow repair proposal without modifying protected workflow or package files automatically.

**Deliverables**

1. CI and build diagnosis
2. Protected configuration change proposal

**Acceptance**

1. Account billing or missing runners are not represented as code failures.
2. Configuration edits require the separate review path.

**Independent verification**

1. Trusted commands capture actual exits and logs.
2. Reviewer compares local execution environment with declared CI environment.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** release. **Related gates:** build, types, lint, regression.

### p_build_contract — Verify source-to-artifact provenance and packaging

**Owner:** release; **reviewer:** sre; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_ci.

**Inputs**

1. Production builder and launcher
2. Current artifact manifest contract

**Ordered tasks**

1. Identify all generated artifact roots and expected deployment assets.
2. Inspect how source, dependencies, and environment influence the build.
3. Run the configured build only through the trusted verification interface.
4. Validate manifest source binding and required asset hashes.
5. Record packaging omissions, stale assets, and runtime dependency gaps.

**Deliverables**

1. Build provenance assessment
2. Artifact validation receipt references

**Acceptance**

1. Artifact existence alone never passes the gate.
2. A changed source or artifact invalidates earlier readiness evidence.

**Independent verification**

1. Invoke the configured final artifact validator and retain its actual result.
2. Reviewer checks missing and tampered asset cases.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** release. **Related gates:** build, artifact_contract.

### p_runtime — Verify production startup, readiness, and shutdown semantics

**Owner:** sre; **reviewer:** release; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_build_contract.

**Inputs**

1. Production launch command
2. Disposable dependency environment

**Ordered tasks**

1. Define cold startup prerequisites and dependency failure cases.
2. Start the packaged production artifact in isolation and observe actual readiness endpoints.
3. Exercise degraded dependencies and verify readiness is truthful.
4. Send graceful shutdown signals and inspect draining, cleanup, and exit behavior.
5. Record startup duration, resource use, logs, and remaining processes.

**Deliverables**

1. Startup and shutdown scenario specification
2. Trusted runtime receipt references

**Acceptance**

1. Simulation output cannot satisfy real startup acceptance.
2. All owned processes and disposable resources are cleaned up.

**Independent verification**

1. Trusted harness must retain process lifecycle and health observations.
2. Missing production-start harness leaves start unverified.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** sre. **Related gates:** start, operations.

### p_observability — Specify logs, metrics, traces, and alert ownership

**Owner:** sre; **reviewer:** security; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_architecture, p_critical_paths.

**Inputs**

1. Critical paths and existing instrumentation
2. Privacy and tenancy requirements

**Ordered tasks**

1. Define service-level indicators for success, latency, availability, and job age.
2. Map correlation identifiers across request, transaction, job, and provider boundaries.
3. Specify log redaction and bounded error metadata.
4. Define alert thresholds, routing ownership, and actionable runbook links.
5. Identify missing monitors with exact instrumentation points.

**Deliverables**

1. Observability specification
2. Alert and runbook ownership matrix

**Acceptance**

1. No sensitive payload is required for diagnosis.
2. Each alert has an owner, trigger, and next action.

**Independent verification**

1. Reviewer checks a success, denial, provider outage, and worker failure trace.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** sre. **Related gates:** operations, documentation.

### p_recovery — Design and rehearse backup, restore, and rollback evidence

**Owner:** sre; **reviewer:** data; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_data_map, p_runtime.

**Inputs**

1. Store and asset ownership inventory
2. Deployment and migration constraints

**Ordered tasks**

1. Define recovery objectives and the data required to verify them.
2. Identify backup creation, integrity, retention, and restoration procedures.
3. Plan restore into an isolated environment with no production writes.
4. Verify application consistency and asset references after restoration.
5. Document deployment and migration rollback limits and reconciliation steps.

**Deliverables**

1. Recovery drill plan and result references
2. Rollback feasibility register

**Acceptance**

1. A backup file is not proof of successful restoration.
2. Unperformed drills remain unverified.

**Independent verification**

1. Trusted drill checks restored rows, ownership, assets, and service behavior.
2. Reviewer verifies recovery time and data-loss claims against observations.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** sre. **Related gates:** operations.

### p_security_baseline — Audit application and supply-chain exposure

**Owner:** security; **reviewer:** techlead; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_identity, p_tenancy, p_provider_map.

**Inputs**

1. Dependency locks and trusted audit command
2. Threat model and deployment boundaries

**Ordered tasks**

1. Run dependency audit through the configured trusted gate.
2. Inspect risky request parsing, file access, redirects, outbound fetch, and command execution.
3. Map XSS, CSRF, SSRF, injection, replay, and API-abuse test targets.
4. Check secrets handling and redaction without printing credential values.
5. Classify findings by confirmed exploitability and required mitigation.

**Deliverables**

1. Security findings register
2. Exploit and remediation verification plan

**Acceptance**

1. Zero dependency advisories is not equivalent to secure application behavior.
2. Critical and high unresolved findings block release.

**Independent verification**

1. Each confirmed finding retains a safe isolated reproduction.
2. Reviewer checks false positives and mitigation acceptance.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** security. **Related gates:** security.

### p_a11y_baseline — Define accessibility coverage for every critical interaction state

**Owner:** accessibility; **reviewer:** ux; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_routes, p_critical_paths.

**Inputs**

1. Route matrix and interaction designs
2. Supported viewport and input modes

**Ordered tasks**

1. List every form, modal, menu, table, editor, upload, and status interaction.
2. Specify accessible name, role, label, description, and announcement expectations.
3. Define keyboard order, focus restoration, zoom, reflow, and reduced-motion checks.
4. Separate automated checks from assistive-technology and manual observations.
5. Map uncovered states to explicit accessibility tasks.

**Deliverables**

1. Accessibility state matrix
2. Measurement and review protocol

**Acceptance**

1. Route render coverage cannot substitute for state-level accessibility.
2. Unsupported or untested input modes stay visible.

**Independent verification**

1. Reviewer checks keyboard completion of representative artist and admin journeys.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** accessibility. **Related gates:** accessibility, e2e.

### p_perf_baseline — Define realistic capacity and responsiveness experiments

**Owner:** performance; **reviewer:** sre; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_architecture, p_critical_paths.

**Inputs**

1. Runtime limits and critical paths
2. Observed data volumes and product targets

**Ordered tasks**

1. Use measured private-admin workload and real asset sizes first; record massive public concurrency targets as later work.
2. Specify workload mix, payload sizes, data cardinality, and concurrency increments.
3. Set an isolated target, resource budget, maximum duration, and abort criteria.
4. Measure baseline API p95 and page-load distributions with sample counts.
5. Record query, CPU, memory, queue, and browser traces at saturation.
6. Separate extrapolated capacity from directly measured capacity.

**Deliverables**

1. Performance experiment contract
2. Baseline measurement references

**Acceptance**

1. No production or public host is load-tested by this loop.
2. Claims of scale include workload, environment, duration, and sample count.

**Independent verification**

1. Trusted producer supplies fresh api_p95_ms and page_load_seconds values.
2. Reviewer checks warmup, errors, and measurement bias.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** performance. **Related gates:** performance.

### p_ai_boundaries — Specify agent and model authority boundaries

**Owner:** ai; **reviewer:** security; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_architecture, p_provider_map.

**Inputs**

1. Assistant tools and retrieval sources
2. Provider capability matrix

**Ordered tasks**

1. Enumerate model inputs, retrieved content, tool names, and side effects.
2. Specify structured outputs and deterministic validation before tool execution.
3. Map tenant filtering, user confirmation, budget, cancellation, and escalation requirements.
4. Define prompt-injection and data-exfiltration adversarial cases.
5. Record unavailable models or tools as blocked capability.

**Deliverables**

1. AI authority and data-flow specification
2. Agent adversarial evaluation matrix

**Acceptance**

1. Untrusted repository, provider, or retrieved text never grants tool authority.
2. A model claim never proves a side effect happened.

**Independent verification**

1. Reviewer traces one read-only answer and one proposed mutation.
2. Trusted evaluations retain actual tool calls and denial outcomes.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** ai. **Related gates:** security, features.

### p_event_contracts — Define truthful product and financial event semantics

**Owner:** analytics; **reviewer:** data; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_data_map, p_critical_paths.

**Inputs**

1. Authoritative state and payment ownership
2. Existing event emitters and aggregate readers

**Ordered tasks**

1. Define unique event identity, actor, tenant, timestamp, and origin.
2. Separate requested, scheduled, submitted, accepted, paid, refunded, and failed outcomes.
3. Identify duplication, late arrival, timezone, and currency behavior.
4. Specify consent, retention, redaction, and access controls.
5. Map every revenue metric to authoritative financial records.

**Deliverables**

1. Event dictionary
2. Financial reconciliation invariants

**Acceptance**

1. Checkout creation never counts as a paid purchase.
2. Missing or stale data is distinguishable from a genuine zero.

**Independent verification**

1. Reviewer traces one metric backward to its authoritative record.
2. Trusted tests cover replay and out-of-order events.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** analytics. **Related gates:** features, integration.

### p_docs_map — Map product, API, and operational documentation needs

**Owner:** docs; **reviewer:** product; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_scope, p_routes, p_provider_map.

**Inputs**

1. Accepted scope and provider limits
2. Existing documentation tree

**Ordered tasks**

1. List user onboarding and task guides required for each domain.
2. Map API contracts and error behavior to documentation sources.
3. List setup, testing, recovery, incident, and release runbooks.
4. Identify examples that disagree with current source.
5. Record owner, reviewer, and freshness rules for every required document.

**Deliverables**

1. Documentation coverage matrix
2. Stale or missing example backlog

**Acceptance**

1. Unsupported features are not documented as available.
2. Each launch-critical document has an observed location or explicit gap.

**Independent verification**

1. Reviewer follows a setup and a user journey using the draft instructions.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** docs. **Related gates:** documentation.

### p_incident_protocol — Define defect reproduction, triage, and escalation protocol

**Owner:** incident; **reviewer:** qa; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_test_strategy, p_observability.

**Inputs**

1. Verification and observability contracts
2. Historical failures and repair outcomes

**Ordered tasks**

1. Specify minimal failure packets with source, command, environment, and raw evidence.
2. Require a failing invariant and competing root-cause hypotheses.
3. Define severity, owner, regression test, and rollback criteria.
4. Set repeated-failure and no-progress escalation rules.
5. Define how lessons change ordering or prompts without weakening acceptance.

**Deliverables**

1. Defect investigation contract
2. Learning and escalation rules

**Acceptance**

1. Repeated identical failures stop or change investigation strategy.
2. A narrative root cause without reproduction remains a hypothesis.

**Independent verification**

1. Reviewer applies the protocol to one previously observed failure.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** incident. **Related gates:** regression, operations.

### p_decomposition — Expand broad work into exact member assignments

**Owner:** techlead; **reviewer:** product; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_critical_paths, p_test_strategy, p_docs_map.

**Inputs**

1. Domain templates and discovered route matrix
2. Acceptance and documentation matrices

**Ordered tasks**

1. Create an instance for each concrete route, entity, transition, integration, and acceptance scenario in scope.
2. Bind every instance to exact observed file paths and one accountable role.
3. List prerequisites, permitted edits, expected artifacts, reviewer, and verification producer.
4. Split tasks exceeding the time budget or spanning unrelated state transitions.
5. Keep undiscovered behavior and unresolved source mappings in a visible discovery backlog.

**Deliverables**

1. Exact work-package expansion
2. Assignment and dependency ledger

**Acceptance**

1. Template instantiation is not claimed to enumerate undiscovered behavior.
2. No task starts without bounded inputs, scope, completion criteria, and ownership.

**Independent verification**

1. Reviewer checks one fully expanded journey per domain.
2. Dependency and path-overlap checks reject conflicting concurrent edits.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** techlead. **Related gates:** features, documentation.

### p_contract_review — Review shared contracts before cross-domain integration

**Owner:** architect; **reviewer:** security; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_decomposition, p_event_contracts, p_ai_boundaries.

**Inputs**

1. Domain contract artifacts
2. Shared identity, event, and data invariants

**Ordered tasks**

1. Compare field names, versions, errors, and tenant identity across producer and consumer boundaries.
2. Identify incompatible state transitions and duplicate source-of-truth ownership.
3. Check event delivery and retry assumptions.
4. Route contradictions to the exact owning task.
5. Record accepted contracts and unresolved integration blockers.

**Deliverables**

1. Cross-domain contract review
2. Conflict and ownership resolution register

**Acceptance**

1. No contradictory contract is silently selected by the coordinator.
2. Dependent implementation remains blocked until the contract is accepted.

**Independent verification**

1. Reviewer traces producer and consumer behavior for payments, assets, and collaboration.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** architect. **Related gates:** integration, security.

### p_fault_plan — Design fault injection and degraded-operation acceptance

**Owner:** sre; **reviewer:** qa; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_runtime, p_provider_map, p_test_strategy.

**Inputs**

1. Critical paths and dependency map
2. Disposable execution capabilities

**Ordered tasks**

1. Select controlled database, cache, queue, storage, provider, and network failures.
2. Define expected timeout, retry, circuit, user message, and recovery behavior.
3. Set blast-radius, cleanup, and abort limits for each experiment.
4. Specify durable-state checks after interruption and replay.
5. Identify faults that cannot be safely reproduced in the current environment.

**Deliverables**

1. Fault-injection scenario pack
2. Recovery assertions and cleanup checks

**Acceptance**

1. All experiments are confined to disposable resources.
2. Missing fault capability remains unverified.

**Independent verification**

1. Trusted harness records injected fault timing and observed recovery.
2. Reviewer checks no hidden loss, duplicate side effect, or false success.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** sre. **Related gates:** operations, integration, regression.

### p_release_matrix — Compile release gates without converting unknowns into passes

**Owner:** release; **reviewer:** qa; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_build_contract, p_runtime, p_recovery, p_security_baseline, p_a11y_baseline, p_perf_baseline, p_contract_review.

**Inputs**

1. Fresh source-bound gate report
2. Domain completion and evidence ledger

**Ordered tasks**

1. List every required gate with exact source, policy, command, exit, and evidence path.
2. Separate failed checks, unexecuted checks, provider skips, and invalid stale evidence.
3. Verify source and artifact identity after all checks.
4. Record launch-blocking gaps and their accountable specialists.
5. Prepare a GO or NO-GO recommendation without granting release authority.

**Deliverables**

1. Release readiness matrix
2. Source and artifact evidence index

**Acceptance**

1. All required gates must pass; a high score cannot hide a blocker.
2. Task completion and review prose cannot override verifier output.

**Independent verification**

1. Reviewer independently resolves each evidence link and freshness constraint.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** release. **Related gates:** build, types, lint, unit, integration, e2e, regression, security, coverage, accessibility, performance, features, operations, documentation, start, artifact_contract.

### p_handoff — Prepare the operational and product handoff package

**Owner:** docs; **reviewer:** sre; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_release_matrix, p_docs_map, p_incident_protocol.

**Inputs**

1. Release matrix and known limitations
2. Recovery and incident artifacts

**Ordered tasks**

1. Assemble setup, user, support, API, incident, and recovery references.
2. State current release decision and outstanding blockers plainly.
3. List ownership and the next action for each operational alert.
4. Provide disable and rollback instructions for the loop itself.
5. Record the exact candidate revision and artifact references for handoff.

**Deliverables**

1. Reviewable handoff package
2. Known limitations and next-owner list

**Acceptance**

1. No deployment or readiness claim exceeds retained evidence.
2. A new operator can identify how to stop the loop and recover.

**Independent verification**

1. Reviewer follows the handoff links and checks command prerequisites.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** docs. **Related gates:** documentation, operations.

### p_failure_review — Turn repeated failures into evaluated workflow improvements

**Owner:** incident; **reviewer:** techlead; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_incident_protocol.

**Inputs**

1. Prior attempt outcomes and timing
2. Accepted and rejected fix records

**Ordered tasks**

1. Group failures by verified cause rather than message similarity alone.
2. Compare repair success, regression, latency, and no-progress rates.
3. Propose a narrower task, better evidence, changed ordering, or improved prompt.
4. Evaluate the proposal against retained adversarial and regression cases.
5. Keep failed experiments and never reduce gates or budgets silently.

**Deliverables**

1. Workflow improvement proposal
2. Before and after evaluation plan

**Acceptance**

1. A claimed improvement has a measurable baseline and evaluation.
2. Runner or policy changes require their own reviewed code change.

**Independent verification**

1. Reviewer checks that optimization preserves mandatory gates and review independence.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** incident. **Related gates:** regression, operations.

### p_privacy — Map privacy requests and data lifecycle evidence

**Owner:** security; **reviewer:** docs; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_data_map, p_scope.

**Inputs**

1. Personal-data inventory
2. Export, erasure, consent, and retention routes

**Ordered tasks**

1. Map collection purpose, consent, access, retention, export, and erasure for each personal-data class.
2. Trace copies in assets, logs, caches, analytics, backups, and providers.
3. Define identity verification for privacy requests.
4. Record retention conflicts and legal-policy questions without inventing legal conclusions.
5. Specify executable export and deletion acceptance scenarios.

**Deliverables**

1. Privacy lifecycle matrix
2. Request verification and retention-gap register

**Acceptance**

1. Technical checks are not represented as GDPR, CCPA, or SOC2 certification.
2. Every claimed deletion identifies retained exceptions.

**Independent verification**

1. Reviewer traces one user export and erasure across stores and providers.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** security. **Related gates:** security, documentation, features.

### p_supply_chain — Review dependency installation and artifact trust boundaries

**Owner:** security; **reviewer:** release; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_inventory, p_build_contract.

**Inputs**

1. Lockfiles and installation scripts
2. Generated artifact inventory

**Ordered tasks**

1. Inventory package sources, install hooks, binaries, and nested workspaces.
2. Check that reproducible installs use the committed locks.
3. Identify executable content downloaded at build or runtime.
4. Record provenance gaps and safe remediation proposals.
5. Validate that generated artifacts do not unexpectedly contain secrets or source-only files.

**Deliverables**

1. Supply-chain review artifact
2. Dependency provenance gaps

**Acceptance**

1. No dependency upgrade is applied blindly by an automatic audit fix.
2. Protected manifest or lockfile changes follow separate review.

**Independent verification**

1. Reviewer compares declared and observed installation paths and build inputs.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** security. **Related gates:** security, build, artifact_contract.

### p_resource_budget — Define coordinator and worker resource budgets

**Owner:** techlead; **reviewer:** sre; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_inventory, p_decomposition.

**Inputs**

1. Execution capability register
2. Task sizes and historical duration

**Ordered tasks**

1. Set finite task, cycle, elapsed-time, and worker limits.
2. Define cancellation propagation and cleanup responsibilities.
3. Schedule only independent work with nonoverlapping edit ownership.
4. Set memory, disk, command-output, and provider-budget limits for the executor environment.
5. Specify blocked-capability and no-progress termination outcomes.

**Deliverables**

1. Execution budget and cancellation contract
2. Scheduling constraints

**Acceptance**

1. No unbounded recursion or spawn loop is authorized.
2. Path checks are described as coordination protections rather than a hostile-code sandbox.

**Independent verification**

1. Reviewer tests cancellation, exhaustion, and overlapping-task rejection through runner tests.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** techlead. **Related gates:** operations, performance.

### p_coverage_gap — Build a source-level coverage gap queue

**Owner:** qa; **reviewer:** techlead; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_test_strategy.

**Inputs**

1. Fresh coverage summary and file details
2. Existing threshold configuration

**Ordered tasks**

1. Verify coverage source identity, parser completeness, and instrumentation scope.
2. List uncovered executable branches and functions by file.
3. Prioritize uncovered authorization, payment, persistence, and failure paths.
4. Create behavior-focused test proposals rather than line-execution filler.
5. Keep generated test proposals outside protected existing tests until reviewed integration.

**Deliverables**

1. Coverage gap queue by source location
2. Prioritized independent test proposals

**Acceptance**

1. No source exclusion or threshold reduction is used to improve the score.
2. Passing tests and coverage attainment are reported separately.

**Independent verification**

1. Reviewer checks branch expectations against actual behavior and coverage raw data.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** qa. **Related gates:** coverage, unit, integration.

### p_operational_self_heal — Specify bounded detection and remediation runbooks

**Owner:** sre; **reviewer:** security; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_fault_plan, p_observability, p_recovery.

**Inputs**

1. Observed fault signatures
2. Recovery and rollback contracts

**Ordered tasks**

1. Map each supported symptom to deterministic evidence and a bounded diagnosis.
2. Define reversible candidate remedies and their preconditions.
3. Require isolated validation and regression checks before proposing production action.
4. Specify stop, escalation, rollback, and repeated-failure behavior.
5. Document unsupported symptoms and missing monitoring capabilities.

**Deliverables**

1. Self-healing runbook proposals
2. Remediation eligibility and stop conditions

**Acceptance**

1. This task does not install a production remediation daemon.
2. A health alert cannot authorize arbitrary code or database mutation.

**Independent verification**

1. Reviewer walks a latency, worker crash, and provider outage scenario.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** sre. **Related gates:** operations, regression.

### p_reconcile_scope — Reconcile final discoveries back into the mission ledger

**Owner:** product; **reviewer:** release; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_handoff, p_privacy, p_coverage_gap.

**Inputs**

1. Exact task ledger and remaining discoveries
2. Release and domain acceptance evidence

**Ordered tasks**

1. Compare completed tasks with every launch requirement and discovered user action.
2. Reopen requirements whose source changed after acceptance.
3. Record explicit unsupported paths, untested states, and provider gaps.
4. Assign new concrete tasks for newly discovered behavior.
5. Preserve the release NO-GO until all mandatory evidence is current.

**Deliverables**

1. Final scope reconciliation
2. Remaining exact assignments

**Acceptance**

1. No task count or percent complete substitutes for feature acceptance.
2. The discovery backlog cannot be silently dropped at cycle exhaustion.

**Independent verification**

1. Reviewer samples accepted and unaccepted requirements against current source and receipts.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** product. **Related gates:** features, documentation.

### d_discover — Trace {domain} from UI action to durable result

**Owner:** architect; **reviewer:** qa; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** None.
**Platform handoffs:** p_architecture, p_identity, p_test_strategy.

**Inputs**

1. Domain journeys and path hints
2. Observed tracked source inventory

**Ordered tasks**

1. Locate the actual routes, components, handlers, services, schemas, jobs, and provider adapters for {domain}.
2. Trace every declared journey action to its durable state or explicit missing implementation.
3. List duplicate, legacy, disconnected, and unreachable code paths.
4. Record permissions, dependencies, and current tests for each path.
5. Create a gap entry for every unresolved edge instead of guessing a source path.

**Deliverables**

1. Domain dependency trace
2. Concrete unknown and missing-feature register

**Acceptance**

1. Each claimed implementation has an exact observed path and symbol.
2. Path hints are discovery aids, not permission or proof.

**Independent verification**

1. Reviewer independently follows one complete journey and one denial path.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** architect. **Related gates:** features, integration.

### d_acceptance — Specify exact {domain} acceptance scenarios

**Owner:** product; **reviewer:** qa; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_discover.

**Inputs**

1. Domain journeys and risks
2. Actual implementation and gap register

**Ordered tasks**

1. Use the existing administrator as the primary actor and enumerate every admin-visible action, including actions shared with ordinary artist accounts.
2. Enumerate actor, tenant, preconditions, action, expected state, and visible result for every journey.
3. Add invalid input, denied role, missing dependency, interrupted operation, and retry outcomes.
4. Identify irreversible or financial effects and their acceptance requirements.
5. Separate present behavior from required behavior.
6. Assign a stable criterion identifier to every scenario.

**Deliverables**

1. Scenario-level acceptance specification
2. Requirement-to-source mapping

**Acceptance**

1. Every scenario has an observable durable outcome and failure expectation.
2. Unanswered product decisions remain blocking assumptions.

**Independent verification**

1. Reviewer rejects vague criteria such as works correctly or page loads.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** product. **Related gates:** features, e2e.

### d_tasks — Expand {domain} into bounded concrete work packages

**Owner:** techlead; **reviewer:** product; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_acceptance.

**Inputs**

1. Criterion identifiers and concrete source map
2. Platform task-decomposition contract

**Ordered tasks**

1. Split each route, entity, transition, integration, and scenario into separate concrete assignments.
2. Name exact files, symbols, fixtures, and expected artifact locations.
3. Assign one owner, a different reviewer, and upstream dependencies.
4. Bound each work package to the configured time and path scope.
5. Preserve new discoveries as child work rather than claiming exhaustive coverage.

**Deliverables**

1. Domain work-package index
2. Exact file ownership and handoff map

**Acceptance**

1. Every implementation package names its acceptance criteria and verification producer.
2. Unrelated changes are separated even when they share an owner.

**Independent verification**

1. Reviewer checks dependency completeness and edit-scope overlap.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** techlead. **Related gates:** features, documentation.

### d_states — Define {domain} business state transitions

**Owner:** architect; **reviewer:** backend; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_tasks.

**Inputs**

1. Acceptance scenarios
2. Entity and provider dependencies

**Ordered tasks**

1. List valid states and permitted transitions for each domain resource.
2. Define the actor and precondition required for each transition.
3. Specify invalid, repeated, concurrent, delayed, and reversed transitions.
4. Identify authoritative records and transaction boundaries.
5. Define how UI, jobs, and providers reconcile divergent states.

**Deliverables**

1. State-transition table
2. Invariant and reconciliation specification

**Acceptance**

1. Every transition has an observable success and rejection outcome.
2. Provider intent is not confused with completed work.

**Independent verification**

1. Reviewer traces the domain's highest-risk concurrent or financial transition.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** architect. **Related gates:** features, integration.

### d_permissions — Specify {domain} role and tenant access

**Owner:** security; **reviewer:** backend; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_tasks.

**Inputs**

1. Platform capability matrix
2. Domain route and entity inventory

**Ordered tasks**

1. Enumerate read, create, edit, delete, export, share, and privileged actions.
2. Define actor-to-resource ownership checks for every action.
3. Trace direct API, background job, websocket, and download access paths.
4. Specify revoked access, stale sessions, and cross-tenant identifier probes.
5. Record missing enforcement as concrete defects.

**Deliverables**

1. Domain authorization matrix
2. Denial and unchanged-state assertions

**Acceptance**

1. All entrypoints enforce the same ownership invariant.
2. Hiding a UI control is not authorization.

**Independent verification**

1. Reviewer checks one horizontal and one vertical escalation case per resource family.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** security. **Related gates:** security, integration.

### d_data — Design {domain} persistence and integrity constraints

**Owner:** data; **reviewer:** architect; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_states, d_permissions.

**Inputs**

1. State and authorization specifications
2. Observed tables, adapters, and migrations

**Ordered tasks**

1. Map each required field to type, default, nullability, and ownership.
2. Specify foreign keys, uniqueness, and transaction constraints.
3. Define pagination, sorting, time, currency, and retention semantics.
4. Plan backward-compatible migration and rollback for missing structures.
5. Record migration proposals outside protected execution until independently reviewed.

**Deliverables**

1. Entity and constraint specification
2. Migration and rollback proposal

**Acceptance**

1. Business invariants have database or transactional enforcement where appropriate.
2. No production migration is executed by this task.

**Independent verification**

1. Reviewer checks duplicate, orphan, null, boundary, and rollback behavior.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** data. **Related gates:** features, integration.

### d_api — Define {domain} request and response contracts

**Owner:** backend; **reviewer:** architect; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_states, d_permissions, d_data.

**Inputs**

1. Domain state and entity specifications
2. Observed routes and consumers

**Ordered tasks**

1. Specify method, path, authenticated actor, request schema, and response schema.
2. Define validation and domain error codes with stable client meaning.
3. Bound payload sizes, pagination, filtering, and sorting.
4. Define idempotency, retry, timeout, and cancellation behavior.
5. Record compatibility requirements for existing clients and providers.

**Deliverables**

1. API contract and error catalog
2. Consumer compatibility notes

**Acceptance**

1. Every mutation defines authorization, validation, and durable success semantics.
2. Internal errors and sensitive fields are not exposed as public contracts.

**Independent verification**

1. Reviewer compares contract to frontend requests and service signatures.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** backend. **Related gates:** integration, types.

### d_ux — Specify every {domain} interaction and recovery state

**Owner:** ux; **reviewer:** accessibility; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_acceptance, d_api.

**Inputs**

1. Acceptance scenarios and API errors
2. Current page and component inventory

**Ordered tasks**

1. Map screen entry, navigation, task actions, confirmation, and completion.
2. Specify loading, empty, validation, denied, failed, partial, and success states.
3. Define focus movement, keyboard shortcuts, announcements, and responsive layout.
4. Explain destructive or financial consequences before the action.
5. Provide recovery steps for interrupted, offline, or unavailable dependencies.

**Deliverables**

1. Interaction state specification
2. Keyboard and responsive behavior notes

**Acceptance**

1. Every API failure has a useful visible response.
2. Success messaging reflects authoritative completion state.

**Independent verification**

1. Reviewer walks each journey with keyboard-only and narrow-screen assumptions.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** ux. **Related gates:** features, accessibility, e2e.

### d_threats — Threat-model {domain} assets and side effects

**Owner:** security; **reviewer:** architect; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_permissions, d_api.

**Inputs**

1. Domain API and ownership contracts
2. Domain risks and provider boundaries

**Ordered tasks**

1. Identify valuable data, assets, privileges, money, and external actions.
2. Map untrusted input to parsing, storage, rendering, fetching, and tool boundaries.
3. Define safe isolated attack cases for relevant injection, traversal, replay, and abuse risks.
4. Prioritize exploitability and impact using source evidence.
5. Attach a mitigation and verification criterion to every confirmed finding.

**Deliverables**

1. Domain threat model
2. Security defect and attack-case register

**Acceptance**

1. Speculative concerns are distinguished from reproduced failures.
2. No public or production target is attacked.

**Independent verification**

1. Reviewer checks coverage of all identified trust boundaries.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** security. **Related gates:** security.

### d_validation — Implement {domain} request validation and truthful errors

**Owner:** backend; **reviewer:** security; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_api, d_threats.

**Inputs**

1. Accepted request schema
2. Concrete validation defect and owned file list
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Locate the earliest trusted request boundary for the selected endpoint.
2. Validate required fields, types, lengths, ranges, enums, and unknown input.
3. Normalize only documented safe values and reject ambiguous values.
4. Map failures to stable client errors without internal details.
5. Return success only after the promised durable operation has completed.

**Deliverables**

1. Narrow request-validation patch
2. Behavior and edge-case explanation

**Acceptance**

1. Malformed, oversized, and unauthorized requests do not mutate state.
2. Error messages identify recoverable user input without leaking data.

**Independent verification**

1. Trusted tests cover empty, malformed, boundary, and valid requests.
2. Independent reviewer inspects actual changed handlers.

**Permitted source scopes:** `server/routes/*`, `server/services/*`, `shared/*`.

**Failure owner:** backend. **Related gates:** types, integration, security.

### d_authorize — Implement {domain} authorization at every entrypoint

**Owner:** backend; **reviewer:** security; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_validation, d_permissions.

**Inputs**

1. Concrete authorization defect
2. Domain allow and deny matrix
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Derive actor and tenant identity from trusted authentication context.
2. Check resource ownership and action permission before reads or mutations.
3. Apply the same rule to jobs, downloads, exports, and realtime entrypoints in scope.
4. Handle revoked or missing membership deterministically.
5. Keep denial responses and audit events free of sensitive resource details.

**Deliverables**

1. Authorization patch
2. Entry-point coverage notes

**Acceptance**

1. Cross-tenant and insufficient-role requests are denied without side effects.
2. Client-supplied ownership does not override trusted context.

**Independent verification**

1. Trusted negative tests assert denied responses and unchanged stores.
2. Reviewer traces direct API bypass attempts.

**Permitted source scopes:** `server/routes/*`, `server/services/*`, `server/middleware/*`.

**Failure owner:** backend. **Related gates:** security, integration.

### d_persist — Implement durable {domain} writes and integrity checks

**Owner:** backend; **reviewer:** data; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_authorize, d_data.

**Inputs**

1. Accepted persistence contract
2. Concrete storage and service paths
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Replace selected ephemeral or simulated success with the authoritative persistence operation.
2. Enclose related writes in the appropriate transaction boundary.
3. Enforce uniqueness, references, ownership, and expected current state.
4. Return persisted identifiers and values rather than invented client echoes.
5. Handle rollback and partial failure without orphaned records.

**Deliverables**

1. Persistence and transaction patch
2. Failure and rollback explanation

**Acceptance**

1. Reload and independent read return the promised durable result.
2. Failed operations do not leave inconsistent records or false success.

**Independent verification**

1. Trusted integration tests use actual disposable persistence.
2. Reviewer inspects transaction and rollback boundaries.

**Permitted source scopes:** `server/services/*`, `server/routes/*`, `server/storage*`, `shared/*`.

**Failure owner:** backend. **Related gates:** integration, features.

### d_idempotency — Implement replay-safe {domain} mutations

**Owner:** backend; **reviewer:** data; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_persist, d_states.

**Inputs**

1. Mutation and event contracts
2. Concrete replay or concurrency defect
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Choose the authoritative operation identity and scope it to the actor and resource.
2. Enforce duplicate detection atomically at the persistence boundary.
3. Return consistent results for safe repeated requests.
4. Reject conflicting reuse and handle interrupted operations explicitly.
5. Record retry and reconciliation outcomes for diagnosis.

**Deliverables**

1. Idempotency patch
2. Replay and conflict behavior notes

**Acceptance**

1. Parallel or repeated requests do not duplicate business side effects.
2. Idempotency is not implemented only in process-local memory.

**Independent verification**

1. Trusted tests issue duplicate, concurrent, and interrupted retries.
2. Reviewer verifies state and side-effect counts.

**Permitted source scopes:** `server/services/*`, `server/routes/*`, `server/storage*`.

**Failure owner:** backend. **Related gates:** integration, regression.

### d_queries — Implement bounded and correct {domain} reads

**Owner:** backend; **reviewer:** data; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_persist, d_api.

**Inputs**

1. Read contract and tenant rules
2. Concrete query paths and observed plans
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Apply ownership filters before pagination and aggregation.
2. Bound page size and validate stable sorting and cursor semantics.
3. Avoid fetching entire collections for server-side filtering.
4. Remove confirmed N+1 access or redundant reads using measured evidence.
5. Preserve accurate empty, partial, and missing-resource semantics.

**Deliverables**

1. Query and pagination patch
2. Before and after query evidence references

**Acceptance**

1. Pagination is stable and does not leak cross-tenant counts.
2. Optimizations preserve correctness under changing data.

**Independent verification**

1. Trusted tests cover empty sets, page boundaries, ties, and tenant isolation.
2. Reviewer compares measured query plans where available.

**Permitted source scopes:** `server/services/*`, `server/routes/*`, `server/storage*`.

**Failure owner:** backend. **Related gates:** integration, performance.

### d_assets — Implement safe {domain} asset lifecycle behavior

**Owner:** backend; **reviewer:** security; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_authorize, d_persist, d_threats.

**Inputs**

1. Asset ownership and media requirements
2. Concrete upload, download, replace, and delete paths
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Validate file size, type, naming, and storage destination at the trusted boundary.
2. Bind uploaded assets to the authorized owner and operation.
3. Handle partial upload, cancellation, retries, and cleanup.
4. Authorize downloads and derived or paid assets independently.
5. Implement replacement or deletion without removing resources owned elsewhere.

**Deliverables**

1. Asset lifecycle patch or explicit not-applicable evidence
2. Ownership and cleanup notes

**Acceptance**

1. A task may be not applicable only with reviewed source evidence; it cannot silently skip a required journey.
2. Corrupt, empty, oversized, or unauthorized assets fail safely.

**Independent verification**

1. Trusted tests inspect storage and metadata after failures and retries.
2. Reviewer verifies path traversal and ownership denial.

**Permitted source scopes:** `server/routes/*`, `server/services/*`.

**Failure owner:** backend. **Related gates:** security, integration, features.

### d_jobs — Implement durable {domain} background work

**Owner:** backend; **reviewer:** sre; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_idempotency, d_states.

**Inputs**

1. Job and state-transition contract
2. Concrete worker and enqueue paths
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Persist job intent atomically with the triggering business state.
2. Use bounded retry, timeout, lease, and deduplication semantics.
3. Record progress, terminal failure, cancellation, and reconciliation.
4. Recover interrupted or abandoned work without duplicated external effects.
5. Expose truthful pending and failure states to the API.

**Deliverables**

1. Background job patch or explicit not-applicable evidence
2. Retry and recovery behavior notes

**Acceptance**

1. In-memory scheduling does not promise durable completion.
2. Worker restart and retry preserve business invariants.

**Independent verification**

1. Trusted tests interrupt and restart an isolated worker.
2. Reviewer checks dead-letter and exhausted-retry behavior.

**Permitted source scopes:** `server/services/*`, `server/routes/*`, `server/workers/*`, `server/jobs/*`.

**Failure owner:** backend. **Related gates:** integration, operations.

### d_provider_contract — Verify the {domain} provider integration contract

**Owner:** integrations; **reviewer:** backend; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_api, d_threats.

**Inputs**

1. Provider inventory and domain journey
2. Observed provider adapter and version

**Ordered tasks**

1. Identify exact requests, responses, scopes, callbacks, and supported operations.
2. Compare adapter assumptions with available authoritative provider documentation or sandbox observations.
3. Define unavailable, rejected, rate-limited, expired, and partial-success behavior.
4. Mark fixture-only evidence and missing sandbox capabilities.
5. Write a concrete compatibility and acceptance contract.

**Deliverables**

1. Domain provider contract or reviewed no-provider finding
2. Sandbox scenario and limitation register

**Acceptance**

1. No live provider outcome is inferred from fixtures.
2. Unknown or unsupported operations return explicit limitations.

**Independent verification**

1. Reviewer checks each required provider operation against available evidence.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** integrations. **Related gates:** integration, features.

### d_provider_fix — Implement truthful and resilient {domain} provider behavior

**Owner:** integrations; **reviewer:** security; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_provider_contract, d_idempotency.

**Inputs**

1. Accepted provider contract
2. Concrete adapter defect and sandbox boundary
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Validate outbound payload and minimize transmitted data.
2. Apply bounded timeout, retry, rate-limit, and idempotency behavior.
3. Parse provider responses and preserve genuine rejection or pending states.
4. Handle token expiry and revocation without leaking credentials.
5. Reconcile partial outcomes before retrying irreversible actions.

**Deliverables**

1. Provider adapter patch or explicit not-applicable evidence
2. Failure and reconciliation notes

**Acceptance**

1. Provider outage never yields a fabricated successful action.
2. Only provisioned sandbox capabilities are exercised.

**Independent verification**

1. Trusted contract and sandbox tests record actual provider boundaries.
2. Reviewer distinguishes mock behavior from provider evidence.

**Permitted source scopes:** `server/services/*`, `server/routes/*`.

**Failure owner:** integrations. **Related gates:** integration, features, security.

### d_webhooks — Implement authenticated and replay-safe {domain} callbacks

**Owner:** integrations; **reviewer:** security; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_provider_fix, d_states.

**Inputs**

1. Callback contract and authoritative state machine
2. Concrete webhook handler and storage paths
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Verify signatures and timestamps over the correct raw payload.
2. Bind callback identity to the correct tenant and provider account.
3. Persist event identity and apply state transitions atomically.
4. Handle duplicates, out-of-order delivery, retries, and unknown events.
5. Return truthful acknowledgements and retain safe reconciliation metadata.

**Deliverables**

1. Callback handler patch or reviewed no-callback finding
2. Replay and ordering behavior notes

**Acceptance**

1. Unsigned or mismatched callbacks cannot change state.
2. Duplicate callbacks do not duplicate orders, revenue, messages, or entitlements.

**Independent verification**

1. Trusted tests cover signature failures, replay, ordering, and transaction failure.
2. Reviewer checks canonical raw-body handling.

**Permitted source scopes:** `server/routes/*`, `server/services/*`.

**Failure owner:** integrations. **Related gates:** security, integration, regression.

### d_frontend — Implement {domain} route and component behavior

**Owner:** frontend; **reviewer:** ux; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_ux, d_validation, d_authorize.

**Inputs**

1. Interaction state specification
2. Concrete frontend file ownership and API contract
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Connect the selected route and component to the accepted API contract.
2. Implement semantic layout and clear action labels.
3. Render loading, empty, denied, failed, partial, and success states.
4. Preserve navigation and route parameter handling.
5. Reflect actual server state and make incomplete capabilities explicit.

**Deliverables**

1. Frontend behavior patch
2. Interaction-to-contract mapping

**Acceptance**

1. Visible success reflects server-confirmed outcomes.
2. No required interaction remains a dead or placeholder control.

**Independent verification**

1. Trusted browser checks exercise the selected interaction states.
2. Reviewer compares implementation with the design contract.

**Permitted source scopes:** `client/src/pages/*`, `client/src/components/*`, `client/src/hooks/*`, `client/src/lib/*`.

**Failure owner:** frontend. **Related gates:** features, types, e2e.

### d_forms — Implement robust {domain} forms and client validation

**Owner:** frontend; **reviewer:** accessibility; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_frontend, d_api.

**Inputs**

1. Form field and error specification
2. Server validation contract
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Use labeled controls with appropriate input types and constraints.
2. Keep client validation consistent with server requirements.
3. Preserve user input across recoverable failures.
4. Prevent accidental duplicate submission while handling legitimate retry.
5. Focus and announce the error summary or completed action appropriately.

**Deliverables**

1. Form and error-recovery patch
2. Validation behavior notes

**Acceptance**

1. Users can identify and correct each invalid field using keyboard and screen reader semantics.
2. Client validation never replaces server validation.

**Independent verification**

1. Trusted browser tests cover invalid, valid, duplicate, and failed submission.
2. Reviewer checks focus and accessible error relationships.

**Permitted source scopes:** `client/src/pages/*`, `client/src/components/*`, `client/src/hooks/*`.

**Failure owner:** frontend. **Related gates:** features, accessibility, e2e.

### d_client_state — Implement {domain} state synchronization and cancellation

**Owner:** frontend; **reviewer:** backend; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_frontend, d_persist, d_idempotency.

**Inputs**

1. Durable API contract
2. Concrete client cache and async paths
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Define the authoritative cache keys by tenant and resource.
2. Invalidate or update dependent state only after confirmed outcomes.
3. Cancel or ignore stale responses during navigation and identity changes.
4. Handle concurrent edits and offline or reconnect behavior explicitly.
5. Roll back optimistic state on rejection without hiding the error.

**Deliverables**

1. Client state and recovery patch
2. Race and cancellation behavior notes

**Acceptance**

1. Tenant switching never reuses another tenant's cached data.
2. Stale responses cannot overwrite newer confirmed state.

**Independent verification**

1. Trusted tests simulate delayed responses, logout, tenant switch, and failed mutation.
2. Reviewer checks cache identity and cleanup.

**Permitted source scopes:** `client/src/pages/*`, `client/src/components/*`, `client/src/hooks/*`, `client/src/lib/*`.

**Failure owner:** frontend. **Related gates:** features, regression, e2e.

### d_realtime — Implement authorized {domain} realtime synchronization

**Owner:** backend; **reviewer:** security; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_client_state, d_authorize, d_states.

**Inputs**

1. Realtime need and accepted event contract
2. Concrete subscription and reconnect paths
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Authenticate and authorize subscription and publication separately.
2. Bind channels and event payloads to tenant and resource ownership.
3. Handle revocation, disconnect, heartbeat, and reconnect.
4. Reconcile missed or duplicate events against durable state.
5. Bound queues and payloads and expose degraded operation truthfully.

**Deliverables**

1. Realtime patch or reviewed no-realtime finding
2. Reconnect and revocation notes

**Acceptance**

1. A stale connection cannot preserve revoked access.
2. Realtime delivery is not the sole source of durable state.

**Independent verification**

1. Trusted tests cover cross-tenant subscription, revocation, duplicate events, and reconnect.
2. Reviewer verifies event ordering assumptions.

**Permitted source scopes:** `server/routes/*`, `server/services/*`, `server/websocket*`, `client/src/hooks/*`, `client/src/lib/*`.

**Failure owner:** backend. **Related gates:** integration, security, regression.

### d_responsive — Implement responsive {domain} interactions

**Owner:** frontend; **reviewer:** ux; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_forms, d_client_state.

**Inputs**

1. Supported viewport and interaction specification
2. Concrete components and styles
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Inspect task completion at narrow, tablet, desktop, and wide layouts.
2. Fix overflow, obscured controls, truncation, and unusable touch targets.
3. Preserve content order and keyboard access across responsive variants.
4. Handle zoom and reflow without requiring unnecessary horizontal scrolling.
5. Check menus, dialogs, tables, and editors in their expanded states.

**Deliverables**

1. Responsive layout patch
2. Viewport and state coverage notes

**Acceptance**

1. Critical actions remain reachable and comprehensible in every supported layout.
2. Screenshots alone do not prove interaction success.

**Independent verification**

1. Trusted browser checks record viewport and completed task behavior.
2. Reviewer inspects zoom and touch target evidence.

**Permitted source scopes:** `client/src/pages/*`, `client/src/components/*`, `client/src/styles/*`, `client/src/index.css`.

**Failure owner:** frontend. **Related gates:** features, accessibility, e2e.

### d_accessibility_fix — Repair concrete {domain} accessibility violations

**Owner:** frontend; **reviewer:** accessibility; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_responsive, d_ux.

**Inputs**

1. Observed violation with route and state
2. Accessible interaction contract
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Reproduce the exact keyboard, semantic, contrast, or announcement failure.
2. Implement the smallest semantic or interaction correction.
3. Preserve focus, name, role, state, and error relationships.
4. Check the neighboring loading, empty, and failure states.
5. Record residual limitations and the exact retest scenario.

**Deliverables**

1. Accessibility repair patch
2. Violation and retest mapping

**Acceptance**

1. Each claimed fix corresponds to a reproduced violation.
2. Automated zero violations does not claim unperformed assistive-technology validation.

**Independent verification**

1. Trusted scanner and interaction checks run on the changed state.
2. Independent accessibility reviewer checks keyboard completion.

**Permitted source scopes:** `client/src/pages/*`, `client/src/components/*`, `client/src/styles/*`, `client/src/hooks/*`, `client/src/index.css`.

**Failure owner:** frontend. **Related gates:** accessibility, e2e.

### d_observability — Instrument meaningful {domain} operational outcomes

**Owner:** backend; **reviewer:** sre; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_jobs, d_provider_fix, d_persist.

**Inputs**

1. Platform observability specification
2. Concrete request, job, and provider paths
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Add correlation across the selected request, transaction, job, and provider boundary.
2. Record success, denial, retry, failure, and reconciliation outcomes.
3. Emit bounded latency and outcome metrics without sensitive payloads.
4. Ensure failures surface through the documented health or alert signal.
5. Keep logging and metrics from changing business success semantics.

**Deliverables**

1. Operational instrumentation patch
2. Signal and runbook mapping

**Acceptance**

1. Telemetry failure cannot strand an already completed business result.
2. Logs avoid secrets and unnecessary personal data.

**Independent verification**

1. Trusted tests verify representative signals and failure isolation.
2. Reviewer checks redaction and cardinality.

**Permitted source scopes:** `server/routes/*`, `server/services/*`, `server/workers/*`, `server/jobs/*`.

**Failure owner:** backend. **Related gates:** operations, integration.

### d_events — Implement truthful {domain} product and revenue events

**Owner:** analytics; **reviewer:** backend; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_persist, d_webhooks.

**Inputs**

1. Accepted event dictionary
2. Authoritative domain completion records
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Locate the authoritative event-emission point for the selected outcome.
2. Emit stable identity and tenant-scoped event metadata.
3. Separate initiation, pending, completed, paid, refunded, and failed events.
4. Deduplicate retries and reconcile delayed provider confirmations.
5. Present missing or stale aggregates honestly in downstream consumers.

**Deliverables**

1. Event and aggregate correction patch
2. Authoritative-source mapping

**Acceptance**

1. User-submitted interaction labels cannot forge financial completion.
2. Analytics failure does not roll back unrelated completed user actions.

**Independent verification**

1. Trusted tests compare events and aggregates against authoritative records.
2. Reviewer checks duplicate, refund, and late-arrival behavior.

**Permitted source scopes:** `server/routes/*`, `server/services/*`, `client/src/pages/*`, `client/src/components/*`.

**Failure owner:** analytics. **Related gates:** features, integration, regression.

### d_ai_contract — Specify bounded {domain} AI behavior and evaluations

**Owner:** ai; **reviewer:** security; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_acceptance, d_threats, d_permissions.

**Inputs**

1. Observed model or agent paths
2. Platform AI authority contract

**Ordered tasks**

1. Identify whether the domain actually invokes models or tools and document evidence.
2. Define grounded inputs, structured outputs, and uncertainty behavior.
3. Specify role and tenant filtering before retrieval or tool execution.
4. List side-effect confirmation, cancellation, budget, and unavailable-provider behavior.
5. Create domain-specific injection, hallucination, leakage, and task-success evaluations.

**Deliverables**

1. AI behavior contract or reviewed no-AI finding
2. Reproducible evaluation case proposals

**Acceptance**

1. Absence of AI is justified by traced source rather than assumed.
2. Model-generated text does not prove actions or authoritative facts.

**Independent verification**

1. Reviewer checks one allowed and one adversarial scenario for each tool class.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** ai. **Related gates:** features, security.

### d_ai_fix — Implement bounded and truthful {domain} AI execution

**Owner:** ai; **reviewer:** security; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_ai_contract, d_provider_fix.

**Inputs**

1. Accepted AI contract and evaluation cases
2. Concrete model, retrieval, and tool paths
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Validate structured model outputs before consuming them.
2. Filter retrieval and tool arguments using trusted actor and tenant identity.
3. Separate untrusted content from system authority and side-effect authorization.
4. Enforce bounded turns, timeouts, cancellation, and configured budgets.
5. Return explicit uncertainty or unavailable states when evidence or capability is missing.

**Deliverables**

1. AI boundary correction patch or reviewed no-AI finding
2. Tool and output validation notes

**Acceptance**

1. No model output can directly bypass authorization or invoke arbitrary commands.
2. Unsupported generation is not replaced with fake completed output.

**Independent verification**

1. Trusted evaluation harness records actual outputs, tool calls, and denials.
2. Reviewer checks prompt-injection and cancellation cases.

**Permitted source scopes:** `server/routes/*`, `server/services/*`, `client/src/components/*`, `client/src/pages/*`.

**Failure owner:** ai. **Related gates:** features, security, integration.

### d_unit_proposals — Author independent {domain} business-rule test proposals

**Owner:** qa; **reviewer:** backend; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_validation, d_authorize, d_states.

**Inputs**

1. Accepted domain invariants
2. Exact changed symbols and current test gaps

**Ordered tasks**

1. Select observable business rules and failure boundaries in the changed code.
2. Write deterministic positive, negative, boundary, and state-transition cases.
3. Avoid assertions that merely mirror implementation details.
4. Prove a bug regression case fails against the old behavior when available.
5. Write proposed test artifacts to the private task directory for reviewed integration.

**Deliverables**

1. Executable unit-test proposals outside protected source
2. Fixture, old-behavior, and expected-result notes

**Acceptance**

1. Test proposals do not count as executed passing tests.
2. Existing tests and thresholds remain unchanged.

**Independent verification**

1. Independent reviewer checks expected results against requirements.
2. Trusted verifier executes only separately approved test integration.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** qa. **Related gates:** unit, coverage, regression.

### d_integration_proposals — Author {domain} persistence and API integration test proposals

**Owner:** qa; **reviewer:** data; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_persist, d_idempotency, d_queries, d_assets, d_jobs.

**Inputs**

1. Domain API and data contracts
2. Disposable service fixtures

**Ordered tasks**

1. Specify actual HTTP and persistence boundaries for each case.
2. Create actor, tenant, entity, and asset fixtures with deterministic cleanup.
3. Assert durable state after success, denial, rollback, retry, and restart.
4. Include concurrent mutation and duplicate-side-effect cases.
5. Write executable proposals and dependency requirements outside protected source.

**Deliverables**

1. Integration test proposals
2. Fixture and cleanup specification

**Acceptance**

1. Mock-only tests are labeled and cannot prove real persistence behavior.
2. Every mutation case asserts resulting state, not only response status.

**Independent verification**

1. Reviewer traces assertions to authoritative stores.
2. Trusted execution retains raw results and cleanup evidence.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** qa. **Related gates:** integration, regression.

### d_provider_proposals — Author {domain} provider and callback acceptance test proposals

**Owner:** qa; **reviewer:** integrations; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_provider_fix, d_webhooks.

**Inputs**

1. Accepted provider contract
2. Sandbox capability and callback fixtures

**Ordered tasks**

1. Define contract fixtures for success, rejection, throttling, expiry, and timeout.
2. Define real sandbox cases separately from controlled local cases.
3. Cover signature failures, duplicates, ordering, and reconciliation.
4. Assert only genuine provider-supported outcomes and retained receipts.
5. Write executable proposals with explicit missing-capability and skip rules.

**Deliverables**

1. Provider test proposals
2. Sandbox and fixture evidence classification

**Acceptance**

1. A skipped sandbox case remains unverified.
2. Live credentials are never placed in artifacts.

**Independent verification**

1. Reviewer checks mock and sandbox results cannot be confused.
2. Trusted verifier reports every skip and missing provider capability.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** qa. **Related gates:** integration, security, regression.

### d_browser_proposals — Author {domain} role-based end-to-end journey tests

**Owner:** qa; **reviewer:** ux; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_forms, d_client_state, d_responsive, d_acceptance.

**Inputs**

1. Scenario-level acceptance specification
2. Disposable actor and data fixtures

**Ordered tasks**

1. For each critical persona, start from a realistic logged-in or public state.
2. Perform real UI actions through the complete journey.
3. Assert durable outcomes after reload and independent read.
4. Exercise denied roles, error recovery, interrupted actions, and session expiry.
5. Write executable browser proposals with stable semantic selectors and cleanup.

**Deliverables**

1. Browser journey test proposals
2. Criterion-to-assertion traceability

**Acceptance**

1. Page render or button visibility alone cannot satisfy a business journey.
2. Fixtures do not pre-create the outcome the journey is supposed to produce.

**Independent verification**

1. Reviewer follows every acceptance criterion to a concrete assertion.
2. Trusted execution records browser failures and actual persisted results.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** qa. **Related gates:** e2e, features, regression.

### d_adversarial — Create {domain} boundary and abuse experiments

**Owner:** security; **reviewer:** qa; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_threats, d_authorize, d_assets, d_ai_fix.

**Inputs**

1. Threat and invariant register
2. Bounded isolated test capabilities

**Ordered tasks**

1. Prepare empty, malformed, huge, corrupt, duplicate, and unexpected inputs relevant to the domain.
2. Define unauthorized actor, tenant, and subscription combinations.
3. Include traversal, replay, concurrency, and prompt-injection cases where applicable.
4. Set resource and duration bounds and cleanup expectations.
5. Record exact expected denial and unchanged-state assertions.

**Deliverables**

1. Adversarial experiment pack
2. Expected invariant and cleanup checks

**Acceptance**

1. Experiments target only disposable authorized resources.
2. Absence of a crash is not proof of correct rejection.

**Independent verification**

1. Independent reviewer checks input limits and authoritative-state assertions.
2. Trusted execution retains actual results, not worker conclusions.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** security. **Related gates:** security, regression.

### d_race_tests — Create {domain} concurrency and recovery experiments

**Owner:** qa; **reviewer:** data; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_idempotency, d_realtime, d_jobs.

**Inputs**

1. Concurrency and state-transition invariants
2. Disposable database and worker capabilities

**Ordered tasks**

1. Identify simultaneous actions that can conflict over the same resource.
2. Synchronize requests at the relevant race boundary.
3. Inject timeout, disconnect, worker crash, and retry during mutation.
4. Assert uniqueness, ownership, ordering, and final durable state.
5. Bound request counts and document cleanup and expected recovery.

**Deliverables**

1. Concurrency and recovery experiment pack
2. Invariant and replay assertions

**Acceptance**

1. Sequential repetitions are not presented as concurrency evidence.
2. Every experiment has a known final-state oracle.

**Independent verification**

1. Reviewer checks synchronization and fault placement.
2. Trusted harness retains all attempts and state checks.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** qa. **Related gates:** integration, regression, operations.

### d_accessibility_audit — Verify {domain} accessibility across interaction states

**Owner:** accessibility; **reviewer:** qa; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_accessibility_fix, d_browser_proposals.

**Inputs**

1. Accessibility state matrix
2. Changed frontend and browser scenarios

**Ordered tasks**

1. Run configured automated checks for each required page and state through the trusted verifier.
2. Exercise keyboard navigation, dialogs, errors, and focus restoration.
3. Inspect zoom, reflow, contrast, motion, and touch behavior.
4. Record assistive-technology checks actually performed and those still missing.
5. Link every violation to a precise reproduction and owning frontend task.

**Deliverables**

1. Accessibility result references
2. Violation and untested-state register

**Acceptance**

1. Zero automated violations is reported only from actual fresh output.
2. Untested states remain explicit release gaps.

**Independent verification**

1. Reviewer independently reproduces selected findings and fixed interactions.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** accessibility. **Related gates:** accessibility, e2e.

### d_load_plan — Specify {domain} load and latency acceptance

**Owner:** performance; **reviewer:** sre; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_queries, d_jobs, d_browser_proposals.

**Inputs**

1. Platform performance contract
2. Concrete domain request and browser paths

**Ordered tasks**

1. Choose realistic records, payloads, actor mix, and concurrency increments.
2. Identify cold and warm scenarios and success/error classification.
3. Set disposable target, maximum duration, resource caps, and abort criteria.
4. Measure API p95, page load, throughput, errors, memory, and queue delay.
5. Plan recovery checks after load is removed.

**Deliverables**

1. Domain load scenario pack
2. Measurement and abort criteria

**Acceptance**

1. Capacity claims are limited to the measured environment and workload.
2. No public production target is exercised.

**Independent verification**

1. Reviewer checks sample sizes, warmup, error inclusion, and reproducibility.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** performance. **Related gates:** performance.

### d_performance_fix — Repair measured {domain} performance bottlenecks

**Owner:** performance; **reviewer:** architect; **mode:** change; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_load_plan, d_queries, d_client_state.

**Inputs**

1. Observed profile or query bottleneck
2. Baseline and target under identical conditions
3. Accepted exact file/route/action breakdown from d_tasks; broad path scopes are an upper bound, not permission to rewrite unrelated files.

**Ordered tasks**

1. Reproduce the measured bottleneck and identify its dominant cost.
2. Choose the smallest query, caching, batching, rendering, or resource fix.
3. Preserve authorization, freshness, ordering, and error semantics.
4. Compare before and after using the same workload and environment.
5. Run correctness and regression checks for the changed path.

**Deliverables**

1. Measured performance patch
2. Before and after experiment references

**Acceptance**

1. Optimization is justified by measured cost rather than speculation.
2. Cache changes cannot leak tenants or hide invalidation failures.

**Independent verification**

1. Trusted measurements retain latency distribution and error counts.
2. Reviewer checks correctness under load and cold state.

**Permitted source scopes:** `server/routes/*`, `server/services/*`, `client/src/pages/*`, `client/src/components/*`, `client/src/hooks/*`, `client/src/lib/*`.

**Failure owner:** performance. **Related gates:** performance, regression.

### d_privacy — Verify {domain} retention, export, and erasure behavior

**Owner:** security; **reviewer:** data; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_data, d_assets, d_events.

**Inputs**

1. Domain personal-data and asset inventory
2. Platform privacy lifecycle matrix

**Ordered tasks**

1. Trace where the domain stores personal and sensitive data.
2. Specify and inspect authorized export and erasure behavior.
3. Identify retained financial, rights, audit, provider, and backup exceptions.
4. Verify cleanup and access revocation across derived stores and assets.
5. Record unsupported requests and policy questions explicitly.

**Deliverables**

1. Domain privacy verification plan
2. Retention and deletion exceptions

**Acceptance**

1. Deletion claims identify exact stores and explicit exceptions.
2. Technical verification is not represented as legal certification.

**Independent verification**

1. Reviewer checks export isolation and erase ownership.
2. Trusted tests inspect durable post-request state.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** security. **Related gates:** security, features, integration.

### d_security_review — Independently review {domain} security changes and residual risks

**Owner:** security; **reviewer:** techlead; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_adversarial, d_provider_proposals, d_privacy, d_ai_fix.

**Inputs**

1. Changed source and adversarial results
2. Domain threat model and unresolved findings

**Ordered tasks**

1. Review the actual diff and affected trust boundaries.
2. Reconcile each finding with mitigation and trusted test evidence.
3. Inspect new inputs, permissions, logs, dependencies, and side effects introduced by the fix.
4. Reproduce high-impact denial and replay cases through approved checks.
5. Return pass, fail, or unverified with concrete residual findings.

**Deliverables**

1. Independent security review artifact
2. Residual risk and remediation assignments

**Acceptance**

1. No owner self-approval satisfies independent review.
2. Critical and high findings remain release blockers.

**Independent verification**

1. Reviewer must reference exact changed paths and current source identity.
2. Narrative approval alone cannot override a failing security gate.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** security. **Related gates:** security, regression.

### d_api_docs — Write accurate {domain} API and integration documentation

**Owner:** docs; **reviewer:** backend; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_api, d_provider_contract, d_webhooks.

**Inputs**

1. Accepted API and provider contracts
2. Verified implementation behavior

**Ordered tasks**

1. Document request, response, authentication, permission, and error examples.
2. Explain pagination, idempotency, retries, timeouts, and callbacks.
3. Identify sandbox prerequisites and unsupported provider operations.
4. Cross-check every example against current types and actual handler behavior.
5. Write documentation proposals in the private task directory for reviewed placement.

**Deliverables**

1. API documentation proposal
2. Example verification and limitation notes

**Acceptance**

1. Examples do not contain secrets or invented successful responses.
2. Unsupported behavior is clearly labeled.

**Independent verification**

1. Reviewer validates examples against the accepted contract and trusted tests.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** docs. **Related gates:** documentation.

### d_user_docs — Write {domain} user guidance and recovery instructions

**Owner:** docs; **reviewer:** ux; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_browser_proposals, d_accessibility_audit.

**Inputs**

1. Actual interaction specification
2. Verified journeys and known limitations

**Ordered tasks**

1. Describe prerequisites and step-by-step user actions for each supported journey.
2. Explain visible success, pending, rejected, and unavailable states.
3. Document error recovery, cancellation, permissions, and support escalation.
4. Use actual labels and avoid promising unverified integrations.
5. Write proposed accessible guidance with source and evidence references.

**Deliverables**

1. User guide and troubleshooting proposal
2. Known limitation disclosures

**Acceptance**

1. Instructions match current UI labels and real behavior.
2. A reader can distinguish a completed action from a pending request.

**Independent verification**

1. Reviewer follows the instructions through the trusted browser scenario.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** docs. **Related gates:** documentation, features.

### d_runbook — Write {domain} operational diagnosis and recovery runbooks

**Owner:** sre; **reviewer:** docs; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_observability, d_race_tests, d_provider_proposals.

**Inputs**

1. Domain telemetry and fault evidence
2. Platform incident and recovery contracts

**Ordered tasks**

1. Map symptoms to logs, metrics, traces, and authoritative state checks.
2. Define safe diagnosis for unavailable providers, stuck jobs, stale data, and failed mutations.
3. Specify bounded retry, reconciliation, rollback, and escalation steps.
4. List required capabilities and prohibited production actions for this loop.
5. Record evidence needed to declare the incident resolved.

**Deliverables**

1. Domain incident and recovery runbook
2. Escalation and verification checklist

**Acceptance**

1. Runbooks do not grant arbitrary production mutation authority.
2. Recovery requires state and user-outcome evidence, not only a healthy process.

**Independent verification**

1. Reviewer walks a provider outage and interrupted mutation using the runbook.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** sre. **Related gates:** operations, documentation.

### d_acceptance_review — Reconcile {domain} criteria with trusted execution evidence

**Owner:** qa; **reviewer:** product; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_unit_proposals, d_integration_proposals, d_browser_proposals, d_provider_proposals, d_race_tests, d_accessibility_audit, d_security_review, d_performance_fix.

**Inputs**

1. Criterion matrix and current source identity
2. Trusted gate results and raw artifacts

**Ordered tasks**

1. Resolve every acceptance criterion to actual current evidence.
2. Mark proposed, unexecuted, skipped, stale, failed, and passing cases separately.
3. Check that tests exercise real required dependencies and durable outcomes.
4. Reopen criteria affected by later source changes.
5. Route each unresolved criterion to its concrete owner and next task.

**Deliverables**

1. Domain acceptance matrix
2. Exact failed and unverified criterion backlog

**Acceptance**

1. Worker claims and test proposals cannot mark a criterion passed.
2. All required scenarios remain represented after retries or cycle exhaustion.

**Independent verification**

1. Independent reviewer resolves the evidence references and samples authoritative outcomes.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** qa. **Related gates:** unit, integration, e2e, regression, security, coverage, accessibility, performance, features.

### d_release_packet — Prepare the {domain} release evidence packet

**Owner:** release; **reviewer:** techlead; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_acceptance_review, d_api_docs, d_user_docs, d_runbook.

**Inputs**

1. Domain acceptance matrix and documentation proposals
2. Current build and runtime evidence

**Ordered tasks**

1. Bind accepted work to exact source, policy, runtime, and artifact identity.
2. List all changed files, independent review results, and verification commands.
3. Include rollback, migration, provider, monitoring, and recovery prerequisites.
4. Record remaining blockers and release recommendation.
5. Hand the packet to the platform release matrix without merging or deploying.

**Deliverables**

1. Domain release evidence packet
2. Source-bound handoff and remaining assignments

**Acceptance**

1. A completed packet is not a deployment or production-readiness claim.
2. Any required missing evidence produces NO-GO or unverified status.

**Independent verification**

1. Reviewer reconciles packet entries with current trusted reports and source hashes.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** release. **Related gates:** features, operations, documentation, start, artifact_contract.

### d_defect_reproduce — Reproduce a concrete {domain} defect before repair

**Owner:** incident; **reviewer:** qa; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_discover.

**Inputs**

1. Observed failed gate or user scenario
2. Exact source and environment identity

**Ordered tasks**

1. Preserve the failing input, command, logs, and observable symptom.
2. Reduce the case while preserving the failed business invariant.
3. Determine whether the cause is product code, fixture, environment, provider, or missing capability.
4. Demonstrate the failure repeatedly or record why it is intermittent.
5. Assign a concrete repair hypothesis and regression scenario to the owning role.

**Deliverables**

1. Minimal defect reproduction
2. Root-cause hypothesis and routing packet

**Acceptance**

1. An environment blocker is not mislabeled as an application defect.
2. Root cause remains a hypothesis until controlled evidence supports it.

**Independent verification**

1. Independent reviewer reruns the reproduction when capability is available.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** incident. **Related gates:** regression, features.

### d_fix_review — Review {domain} patch correctness and maintainability

**Owner:** techlead; **reviewer:** architect; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_validation, d_authorize, d_persist, d_frontend.

**Inputs**

1. Exact patch and original failure
2. Accepted contracts and path ownership

**Ordered tasks**

1. Inspect the actual diff and every changed call site.
2. Check business invariants, compatibility, error handling, and failure cleanup.
3. Look for unrelated changes, duplicate implementations, and hidden configuration dependencies.
4. Verify claimed tests exist as evidence rather than proposed prose.
5. Return actionable findings or a source-bound review conclusion.

**Deliverables**

1. Independent technical review artifact
2. Required correction and regression list

**Acceptance**

1. Approval refers to the actual candidate source hash.
2. Changes to protected validation are routed outside automatic repair.

**Independent verification**

1. Reviewer checks at least the original defect and one adjacent regression risk.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** techlead. **Related gates:** types, lint, regression.

### d_learn — Evaluate {domain} repair effectiveness and update the next assignment

**Owner:** incident; **reviewer:** techlead; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_defect_reproduce, d_fix_review.

**Inputs**

1. Attempt history and current failed criteria
2. Trusted verification outcomes and timings

**Ordered tasks**

1. Compare the intended fix with actual gate and invariant outcomes.
2. Identify new regressions, repeated patches, unchanged failures, and wasted checks.
3. Record which hypothesis was disproved and what evidence is still missing.
4. Propose the next smallest task or escalation with a different investigation approach.
5. Preserve all requirements and thresholds while improving ordering or task precision.

**Deliverables**

1. Repair effectiveness record
2. Next bounded assignment or escalation

**Acceptance**

1. A failed attempt cannot improve readiness by relabeling evidence.
2. No-progress and repeated failures remain visible termination reasons.

**Independent verification**

1. Reviewer compares the next task against the prior failed hypothesis and raw results.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** incident. **Related gates:** regression, operations.

### p_admin_boundary — Specify and verify private admin access

**Owner:** security; **reviewer:** qa; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_identity, p_scope.

**Inputs**

1. User-authorized admin-private scope
2. Observed routes, admin entitlement checks and release evidence

**Ordered tasks**

1. Identify the configured admin identity and authoritative role derivation without exposing credentials.
2. Enumerate all page, API, socket, download, worker trigger and registration entry points.
3. Require anonymous and non-admin denial where private launch access is required, including direct requests.
4. Specify login, MFA, session expiry, revocation and recovery acceptance with lockout recovery.
5. Document intentionally public static, health and owner-published sharing surfaces; prove none disclose private application data or confer account access.

**Deliverables**

1. Source-linked findings and narrow patch or reviewable proposal
2. Criterion-to-check evidence matrix

**Acceptance**

1. Private access cannot be bypassed by hiding navigation only.
2. Admin access recovery and denial tests have real evidence.

**Independent verification**

1. Trusted fixture tests admin success, anonymous denial, non-admin denial and expired/revoked sessions.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** security. **Related gates:** features, security, operations, e2e.

### p_admin_entitlements — Audit full admin feature entitlements

**Owner:** backend; **reviewer:** security; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_admin_boundary, p_provider_map.

**Inputs**

1. User-authorized admin-private scope
2. Observed routes, admin entitlement checks and release evidence

**Ordered tasks**

1. Inventory feature, subscription, quota and plan checks across frontend, API and job handlers.
2. Map every admin workflow to required entitlements and identify artificial paywalls on the owner account.
3. Specify centrally derived admin entitlement behavior while preserving financial, provider and resource constraints.
4. Verify that request parameters or client state cannot confer admin capabilities.
5. Keep payment creation, refund and provider spending outcomes real and permission checked.

**Deliverables**

1. Source-linked findings and narrow patch or reviewable proposal
2. Criterion-to-check evidence matrix

**Acceptance**

1. The administrator can reach every requested feature without buying a public plan.
2. Non-admin identity cannot obtain the same access by forged role or plan inputs.

**Independent verification**

1. Positive admin and negative forged-role/paywall regression checks run against actual handlers.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** backend. **Related gates:** features, security, operations, e2e.

### p_admin_release — Assemble independent private-release decision

**Owner:** release; **reviewer:** qa; **mode:** analysis; **scope:** platform; **owner budget:** 20 minutes.

**Prerequisites:** p_admin_boundary, p_admin_entitlements, p_recovery, p_runtime.
**Required from every domain:** d_admin_journey, d_release_packet.

**Inputs**

1. User-authorized admin-private scope
2. Observed routes, admin entitlement checks and release evidence

**Ordered tasks**

1. Collect source-bound admin criteria and all twelve domain journey results.
2. Verify production build, actual startup, health, shutdown, persistence across restart and configured providers.
3. Require recoverable backups, restoration proof, monitoring and a tested rollback path.
4. Separate private-admin blockers from deferred public-launch work; never convert skipped integrations to passing.
5. Record GO only for the tested admin release when every required admin criterion has evidence; otherwise record exact blockers.

**Deliverables**

1. Source-linked findings and narrow patch or reviewable proposal
2. Criterion-to-check evidence matrix

**Acceptance**

1. Private admin release and public general availability are reported separately.
2. No deployment is authorized by a task completion count.

**Independent verification**

1. Run the trusted admin acceptance producer and final source-to-artifact validation.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** release. **Related gates:** features, security, operations, e2e.

### d_admin_journey — Exercise every admin action in {domain}

**Owner:** qa; **reviewer:** product; **mode:** analysis; **scope:** domain; **owner budget:** 20 minutes.

**Prerequisites:** d_acceptance_review.

**Inputs**

1. User-authorized admin-private scope
2. Observed routes, admin entitlement checks and release evidence

**Ordered tasks**

1. Enumerate every admin-visible action and link it to an accepted scenario, actual route, handler and durable record.
2. Perform create/read/update/delete or the domain-equivalent workflow through the browser as the administrator.
3. Reload, sign out/in and restart the isolated runtime; confirm the result and uploaded artifacts survive.
4. Exercise invalid inputs, permission denial, interrupted requests, retries and provider failures.
5. Verify exports, collaboration, publishing and financial effects against their authoritative destination where applicable.
6. Record any missing integration or dead control as a blocker with the exact reproduction and owner.

**Deliverables**

1. Source-linked findings and narrow patch or reviewable proposal
2. Criterion-to-check evidence matrix

**Acceptance**

1. All admin workflow outcomes are real, durable and observable.
2. Each required domain journey has positive, failure, reload and authorization evidence.

**Independent verification**

1. Source-bound browser/API checks verify all four catalog journeys and every discovered admin control.

**Permitted source scopes:** None; private task artifacts only.

**Failure owner:** qa. **Related gates:** features, security, operations, e2e.

## Private admin release criteria

All criteria require current-source measured evidence. No live credentials or production data belong in the artifacts.

- **private_access**: Private application entry points deny anonymous and non-admin access; public registration is closed by default. Intentionally published fan/share content has explicit owner permission and exposes no private data.
- **admin_session**: Admin login, MFA, logout, expiry, revocation and account recovery work.
- **admin_entitlements**: The administrator can use all features without buying a public subscription; forged roles fail.
- **admin_inventory**: Every admin-visible action is inventoried and mapped to tested scenarios; there are no unmapped or skipped actions.
- **persistence**: Changes, uploads and jobs survive reload, logout/login and service restart.
- **startup_health**: Production artifact starts, becomes ready, handles requests and shuts down cleanly.
- **backup_restore**: An actual isolated backup restoration recovers records and referenced assets.
- **rollback**: A tested rollback restores a working version without losing accepted data.
- **monitoring**: Failures, latency and job status are observable and alert delivery is tested.
- **provider_truth**: Required integrations return authentic provider outcomes and failures; no mocks are presented as live acceptance.
- **financial_integrity**: Checkouts, refunds, royalties and subscriptions reflect settled authoritative events without duplicates.
- **security_findings**: No unresolved critical or high finding affects the private admin release.
- **admin_accessibility**: Admin critical workflows work by keyboard with zero blocking accessibility violations.
- **admin_performance**: Measured admin workload meets API p95 <=250ms and page load <=2s with realistic media assets.
- **owner_runbook**: The administrator can operate, diagnose, recover and disable the system using tested instructions.
- **artist.journey_1**: Artist registers, verifies identity, completes onboarding, saves profile, reloads it, and updates the public press kit.
- **artist.journey_2**: Manager joins an artist workspace with limited rights, edits permitted profile fields, and loses access after revocation.
- **artist.journey_3**: Artist uploads profile artwork, replaces it, sees the durable public version, and removes the asset without orphaned storage.
- **artist.journey_4**: Artist exports or erases account data while contractual and financial retention rules remain explicit.
- **fans.journey_1**: Artist imports fan contacts with consent and deduplication, creates a segment, and verifies persisted membership.
- **fans.journey_2**: Fan opts into a membership, changes preferences, unsubscribes, and stops receiving eligible future messages.
- **fans.journey_3**: Artist drafts a fan campaign, previews recipient eligibility, schedules a sandbox delivery, and observes genuine delivery failures.
- **fans.journey_4**: Manager searches, paginates, exports, and deletes authorized fan data without seeing another artist's fans.
- **projects.journey_1**: Artist creates a project, assigns a collaborator and tasks, attaches files, changes status, and reloads all durable records.
- **projects.journey_2**: Collaborator edits an allowed task while a second actor edits concurrently; conflicts are explained without lost updates.
- **projects.journey_3**: Artist duplicates a project and verifies new ownership and independent assets; deleting a project cleans only its owned resources.
- **projects.journey_4**: Manager manages project budgets, deadlines, search, filtering, and export across authorized workspaces.
- **studio.journey_1**: Producer opens a saved session, imports audio, edits tracks and regions, saves, closes, and reopens the same arrangement.
- **studio.journey_2**: Producer records or creates MIDI, changes tempo, edits markers and automation, and verifies playback timing.
- **studio.journey_3**: Producer renders or exports a mix, observes progress and cancellation, and retrieves the genuine output asset.
- **studio.journey_4**: Collaborator lacking edit or export permission is denied; an interrupted save or render resumes without corrupting the session.
- **distribution.journey_1**: Artist creates a release, enters credits and rights, uploads valid masters and artwork, and reviews validation errors.
- **distribution.journey_2**: Artist submits a release through the authorized provider sandbox and tracks genuine pending, accepted, rejected, and retry states.
- **distribution.journey_3**: Artist retries a timed-out submission without duplicate releases, reconciles provider status, and handles signed callbacks.
- **distribution.journey_4**: Artist requests a supported update or takedown and sees explicit provider and contractual constraints.
- **marketing.journey_1**: Artist connects a sandbox channel with least privilege, drafts campaign content, previews it, and schedules delivery in the correct timezone.
- **marketing.journey_2**: Manager reviews an automated proposal, approves only the intended action, and sees the resulting delivery receipt.
- **marketing.journey_3**: Artist pauses or cancels a campaign before execution; workers respect consent, rate limits, and revocation.
- **marketing.journey_4**: Artist inspects attribution and failure metrics and reconnects an expired integration without losing drafts.
- **revenue.journey_1**: Artist imports or syncs a royalty statement, maps releases and splits, and reconciles totals to the source.
- **revenue.journey_2**: Manager filters revenue by period, currency, source, and project; the UI distinguishes missing data from zero income.
- **revenue.journey_3**: Artist records refunds or corrections and verifies historical reports, payouts, and exports without double counting.
- **revenue.journey_4**: Collaborator views only entitled royalty shares and disputes a mismatch through a documented workflow.
- **assistant.journey_1**: Artist asks a question grounded in authorized project data and receives a traceable answer or an explicit uncertainty response.
- **assistant.journey_2**: Artist requests an action, reviews the proposed side effects, and sees only authorized tools execute.
- **assistant.journey_3**: A retrieved document or user message tries to override permissions; the assistant keeps tenant data and tool authority isolated.
- **assistant.journey_4**: Artist cancels a generation, reaches a rate or budget limit, or encounters a provider outage and gets a recoverable state.
- **collaboration.journey_1**: Artist invites a collaborator, collaborator accepts once, and both see the correct project and role.
- **collaboration.journey_2**: Members exchange comments or messages, edit concurrently, reconnect after a network loss, and reconcile durable state.
- **collaboration.journey_3**: Owner changes or revokes permissions while a session is active; subsequent reads, writes, and subscriptions enforce the change.
- **collaboration.journey_4**: Members review a contribution, resolve a conflict, and access only licensed shared files.
- **marketplace.journey_1**: Seller creates a licensed listing, uploads assets, previews public metadata, and publishes only a valid listing.
- **marketplace.journey_2**: Buyer starts sandbox checkout and receives the checkout session without the platform claiming a paid purchase.
- **marketplace.journey_3**: A verified payment event creates one order and one entitlement; repeated callbacks or retries never duplicate revenue or access.
- **marketplace.journey_4**: Buyer downloads only entitled assets, requests a supported refund, and seller sees reconciled order and payout status.
- **subscriptions.journey_1**: User selects a plan, starts sandbox checkout, and receives entitlements only after authoritative payment confirmation.
- **subscriptions.journey_2**: Subscriber upgrades, downgrades, cancels, or restores an eligible plan with explicit effective dates and proration behavior.
- **subscriptions.journey_3**: Payment failure, retry, refund, chargeback, or out-of-order webhook updates the subscription once and reconciles stale state.
- **subscriptions.journey_4**: User inspects invoices and billing history while another tenant cannot access them; disabled providers surface a truthful unavailable state.
- **administration.journey_1**: Authorized administrator completes required authentication, opens scoped dashboards, and sees current source-backed status.
- **administration.journey_2**: Administrator investigates a support or moderation case using least-privilege access and records an attributable action.
- **administration.journey_3**: Administrator changes a permitted control, previews its impact, and can identify or roll back the change through an audit trail.
- **administration.journey_4**: Non-admin, revoked admin, and cross-tenant users are denied both UI and direct API access; bulk actions are bounded and idempotent.

## Deferred public work

- Public self-service registration and mass onboarding
- General availability for every persona and subscription tier
- Large-scale multiuser capacity and public growth experiments
