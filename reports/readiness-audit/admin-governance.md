# Admin, support and governance readiness — 2026-09-19

## Blocker list

Read-only source audit; only this report was written. No live database/provider access, secret inspection, application execution, configuration changes or heavy tests. Findings describe current source, not production observations. Priority applies to the named release scope, not necessarily every platform launch.

| ID | Classification | Priority / affected release scope | Finding | Confidence |
|---|---|---|---|---|
| AG-1 | CONFIRMED defect | P1 / moderation operations | Removal and warning endpoints acknowledge effects they do not perform; review actions also misrepresent completion. | High |
| AG-2 | CONFIRMED defect | P1 / operator maintenance, registration and rate-limit controls | Settings persist but have no corresponding runtime enforcement consumer. | High |
| AG-3 | CONFIRMED defect | P1 / applicant KYC onboarding | Status crashes when a required document has not yet been uploaded. | High |
| AG-4 | CONFIRMED defect | P1 / internally verified identity assertions | Approval is not bound to reviewed evidence; approved identity information remains editable without invalidation. | High |
| AG-5 | CONFIRMED defect | P1 / multi-agent support operations | Concurrent message/tag mutations overwrite each other's JSONB state. | High |
| AG-6 | CAPABILITY GAP with confirmed broken link | P1 / customer support conversation lifecycle | Reply notifications point to an absent customer ticket page; detail/reply APIs are admin-only. | High |

### Entrypoints, evidence and impact

**AG-1 — Acknowledged moderation without the promised action.** `/api/admin` mounts the primary router at `server/routes.ts:7037`; its role and 2FA guards are at `server/routes/admin.ts:51-62`. The live `/admin` page is registered at `client/src/App.tsx:232`; it submits review actions at `client/src/pages/Admin.tsx:435-450` and displays successful processing.

`POST /moderation/content/:contentId/remove` only logs and returns success, including `notifiedUser: notifyUser`; it neither removes content nor sends a notification (`server/routes/admin.ts:690-705`). `POST /moderation/users/:userId/warn` similarly only logs/echoes (`:712-728`). The UI-used review handler accepts `approve`, `warn_user`, `ban_user`, `remove_content`, and `dismiss`; only ban writes a user value, and only remove/dismiss close the queue status. Approve/warn return success but leave `flagged`, and warn sends no warning (`:636-682`). Review notes/action/reviewer are returned but not durably stored in this handler. The listing synthesizes reports from posts and labels every item “Automated moderation” rather than loading reporting provenance (`:557-617`). These are not authorization bypass claims: privileged access is guarded. The direct ban handler does write `subscriptionStatus`; its broader enforcement is not asserted here. Content removal through the review handler does write `posts.status="removed"`—do not confuse that real local mutation with the separate no-op removal endpoint or infer remote-platform deletion.

**AG-2 — Control plane disconnected from enforcement.** Primary settings GET reads `platform.*` values and returns maintenance, registration and rate-limit defaults (`server/routes/admin.ts:975-999`); maintenance/registration POSTs only persist them (`:1039-1057`). The later admin router is lazy-mounted at `server/routes.ts:7438-7442`, guards requests at `server/routes/admin/index.ts:10-20`, and supports generic PUT plus a rate-limit writer (`:65-97`). `/admin` maintenance UI reads and updates this state (`client/src/pages/Admin.tsx:2080-2097`). Current server-wide searches for these setting names find writers/readback, not runtime consumers. Actual global/API limiters are constructed from the fixed 1,200/minute constant (`server/middleware/scalableRateLimiter.ts:489-501`); the global limiter is installed at `server/index.ts:939-940`. Registration completion is separately implemented at `server/routes.ts:8227-8327`, with no read of this registration switch. Impact: an operator can see maintenance enabled or registration disabled while traffic/admission is unchanged, and editing the displayed API limit does not change the actual limiter. Other allowlisted settings are not automatically declared defective without tracing their consumers.

**AG-3 — Ordinary incomplete KYC checklist throws.** The KYC router is registered at `server/routes.ts:7236`. `/status` uses the authenticated user's ID (`server/routes/kyc.ts:155-161`); `client/src/pages/Verification.tsx:169` consumes it. In `getVerificationStatus`, required types are mapped and `documents.find` can return undefined (`server/services/kycService.ts:627-628`). Status/file metadata handle missing documents, but `uploadedAt: doc.createdAt` dereferences that missing value (`:635-646`). Starting a verification before submitting every required type therefore makes the status endpoint fail instead of reporting `not_uploaded`. This does not affect users with no verification record in the same way; the defect is the existing-but-incomplete checklist path.

**AG-4 — Verification decision lacks an immutable subject/evidence boundary.** Applicant routes authenticate and the entire `/admin` subtree requires admin (`server/routes/kyc.ts:21-25`); admin UI calls `/admin/review/:verificationId` and document-review separately (`client/src/pages/admin/KYCReview.tsx:136,182-189`). Overall approval delegates from `server/routes/kyc.ts:783-810` to `approveVerification`, which checks only existence, then unconditionally stamps verified/expiry/reviewer (`server/services/kycService.ts:513-542`). It does not verify required approved documents or legal transitions. Separately, applicant-owned `updateIndividualInfo` and `updateBusinessInfo` check ownership/type but update metadata without rejecting verified state or resetting approval (`:317-390`); routes expose these at `server/routes/kyc.ts:257-338`. Consequently an authorized applicant can change the subject information attached to a still-verified record, and an authorized reviewer can approve incomplete/rejected evidence without an explicit exceptional-decision record. `getVerificationStatus` treats verified/unexpired as payout eligible (`server/services/kycService.ts:671,1149-1150`); the separate eligibility helper also checks thresholds/tax metadata (`:952-1002`). Search found that helper called by the KYC eligibility endpoint only, not a payout executor: this report does **not** claim these internal decisions currently gate all real-money payouts or confer regulatory compliance.

**AG-5 — Lost support records under concurrent writes.** `/api/support` lazy mount is at `server/routes.ts:7427-7429`; admin detail/reply/tag operations require auth, admin and 2FA (`server/routes/support.ts:125,154-160,195-202,237-244`). UI reply/tag writes originate in `client/src/pages/admin/SupportTicketDetail.tsx:107-125,145,213-214`. `addMessage` reads the ticket then replaces its entire metadata object containing the appended array (`server/services/supportTicketService.ts:255-293`). `addTags` does the same (`:339-355`); route-level tag deletion also reads/replaces metadata (`server/routes/support.ts:247-262`). Two replies, reply plus tag, or add versus delete can both succeed while the later stale write erases the earlier change. This is a concurrency defect, not an assertion that replies are wholly unimplemented: sequential replies really persist.

**AG-6 — Customer conversation has no complete return path.** Customer creation/listing exist (`server/routes/support.ts:13-30,345`), while detail and message POST require admin+2FA (`:125,154-160`). The staff-reply service sends notification links to `/support/tickets/:id` (`server/services/supportTicketService.ts:312-317`); ticket status notifications use the same path (`:237-242`). The actual application routes only register `/admin/support` and `/admin/support/tickets/:ticketId` (`client/src/App.tsx:222-226`); current App source contains no customer support-ticket route. Customers may receive reply text by email (`server/services/supportTicketService.ts:295-309`) and may retrieve metadata in their own list, but that is not a routed read/reply conversation. Do not fix by pointing customers at privileged pages or relaxing the admin route's guard globally.

## Repair playbooks

Each alternative is a distinct implementation strategy, with preparation, implementation/migration, testing and acceptance. Recommendations are starting points, not guaranteed first-attempt fixes. Scope acceptance to the actual local and external effects promised in the UI.

### AG-1 — Effective moderation

**A — Transactional internal case/action service (recommended).** Lowest architectural overhead; remote actions still require separate completion tracking.
1. Inventory every review/direct endpoint and define action effects, case states and affected content types.
2. Add case, decision and warning records; migrate flagged posts into cases without inventing reporter identities.
3. Route all handlers through one transactional action service; persist local removal, warning delivery outbox and reviewer decision.
4. Test each action, missing targets, repeated requests, worker failures and status-to-queue mappings.
5. Accept only when durable state and recipient evidence match responses, with pending delivery distinct from completion.

**B — Durable moderation workflow engine.** Strong retry/remote-effect semantics; greater operational complexity.
1. Specify workflows for local restriction, external takedown, warning delivery and appeals.
2. Create persisted workflows and migrate open flags with stable content references.
3. Execute idempotent activities with retries, compensations and reviewer history; expose pending/completed/failed separately.
4. Exercise crashes between every activity and repeated approvals across workers.
5. Accept after local and external effect receipts reconcile with every completed workflow.

**C — Integrated specialist moderation/case provider.** Faster case tooling; vendor cost and data-sharing obligations.
1. Select a provider that supports required decisions, evidence custody and notification semantics.
2. Map local posts/users/cases to provider IDs and migrate open cases with provenance.
3. Implement authenticated case commands/webhooks plus local enforcement adapters and delivery reconciliation.
4. Test duplicate/out-of-order webhooks, provider outages, decisions and notification failures.
5. Accept only reconciled cases whose local restrictions and delivered warnings match provider outcomes.

**D — Human-reviewed command ledger and fulfillment queue.** Useful for low-volume operations; slower response, explicit staffing required.
1. Define staff responsibilities, deadlines and proof required for each action.
2. Add immutable requested/approved/executed records and import pending flags into the ledger.
3. Build an operator fulfillment console with real local mutation controls and external action receipts; return queued until fulfilled.
4. Test two-person handoff, unfulfilled tasks, mistaken targets, appeals and duplicate fulfillment.
5. Accept after a staffed drill demonstrates completed removals/warnings and escalation of overdue requests.

### AG-2 — Operational controls that take effect

**A — Typed runtime policy service (recommended).** Reuses existing storage; requires careful cache consistency.
1. Define maintenance exemptions, all registration entrypoints and limiter units/defaults.
2. Migrate existing string values to validated versioned policies with explicit malformed-value handling.
3. Wire middleware, registration producers and dynamic limiters to a shared policy reader with bounded refresh.
4. Test multi-worker updates, stale caches, malformed writes, exempt operator recovery and requests already in flight.
5. Accept when UI shows applied version and traffic tests demonstrate each policy within the stated propagation bound.

**B — Distributed configuration/event control plane.** Fast fleet propagation; additional infrastructure.
1. Specify consistency and acknowledgement requirements per control.
2. Provision versioned configuration and migrate existing settings into it.
3. Publish updates, subscribe every API/worker consumer and expose per-consumer applied versions.
4. Test disconnected subscribers, replay, competing updates and recovery.
5. Accept only after all serving instances enforce the selected version and failed propagation is visible.

**C — Gateway enforcement plus registration admission service.** Central traffic controls; bypass paths must be eliminated.
1. Map public/worker ingress and all account-creation routes.
2. Move maintenance/rate policies to a managed gateway and registration policy to a central admission contract.
3. Connect admin updates to actual gateway deployment and require admission tokens for account creation.
4. Test direct-origin bypass, checkout callbacks, OAuth registration and gateway deployment failures.
5. Accept on observed ingress enforcement and rejected unauthorized registration across every producer.

**D — Versioned deploy-time policy artifacts.** Simpler consistency model; slower operational changes.
1. Establish an approved change/deploy process and expected rollout latency.
2. Convert stored settings into validated signed policy artifacts with migration of current values.
3. Make admin changes create real deployment jobs; load artifacts in middleware/registration/limiter consumers and distinguish requested from active.
4. Test failed deployment, mixed-version rollout, rollback and operator access during maintenance.
5. Accept only when the reported active version matches all running consumers and behavioral probes pass.

### AG-3 — Total KYC checklist construction

**A — Explicit optional-document mapping (recommended).** Small targeted change; retains current storage model.
1. Define checklist response semantics for absent dates and absent documents.
2. Guard missing documents explicitly and type `uploadedAt` as optional/null consistently.
3. Update applicant rendering and API types without manufacturing upload timestamps; migrate only incompatible cached response formats.
4. Test zero, partial, complete, rejected and resubmitted document sets through `/status`.
5. Accept when every valid incomplete application returns a usable checklist and no undefined dereference.

**B — Materialized requirement rows.** Stronger relational integrity; schema migration cost.
1. Model one required-document slot per verification, type and policy version.
2. Backfill slots for existing verifications, allowing empty document references.
3. Populate/update slots transactionally and build checklist responses from slot state.
4. Test backfill, empty slots, replacement documents and policy upgrades.
5. Accept after every verification has the expected slots and incomplete onboarding works end to end.

**C — Database left-join projection.** Centralized read semantics; more complex SQL.
1. Specify requirement-set and document-selection ordering rules.
2. Add a requirement relation/view and backfill policy associations.
3. Left-join latest documents into a typed status projection with nullable upload dates.
4. Test no-match rows, multiple versions, null dates and supported database query plans.
5. Accept when API/UI fixtures and migrated applications agree with the projection for all missing-document states.

**D — Dedicated validated status read model.** Scales complex KYC views; eventual consistency must be explicit.
1. Define a status DTO and event/rebuild contract covering not-uploaded slots.
2. Backfill a read model from existing applications and documents with validation errors surfaced.
3. Update it on application/document changes and serve the DTO rather than raw optional entities.
4. Test replay, delayed events, empty applications and rebuild equivalence.
5. Accept once status freshness and all incomplete-state responses meet the declared contract.

### AG-4 — Evidence-bound approval

**A — Immutable revision plus transactional state machine (recommended).** Clear assurance boundary; requires revision migration.
1. Define required evidence, legal transitions and when subject changes require renewed review.
2. Create application revisions and decision references; mark legacy decisions for explicit reconciliation rather than fabricating evidence.
3. Approve only the reviewed revision with validated requirements; edits create a new pending revision and invalidate dependent assertions appropriately.
4. Test approval without documents, rejected evidence, concurrent edits, expired decisions and business/individual changes.
5. Accept when no verified response refers to unreviewed current identity data and all legacy decisions have explicit provenance.

**B — Identity provider authoritative decisions.** Outsourced verification capability; cost, integration and custody tradeoffs.
1. Select provider capabilities matching actual identity/business evidence needs.
2. Map existing applications to provider sessions and plan re-verification for unsupported legacy decisions.
3. Derive verified status only from authenticated provider outcomes tied to immutable submitted identity revisions.
4. Test replayed events, changed applicant data, provider revocation and session mismatch.
5. Accept after provider evidence and local subject revisions reconcile; do not label this alone regulatory certification.

**C — Dual-review evidence case management.** Strong manual accountability; staffing and latency costs.
1. Define evidence checklist and independent reviewer responsibilities, including exception policy.
2. Introduce locked case snapshots, evidence manifests and signed decision records; migrate legacy approvals to review queues.
3. Require two authorized decisions on the same snapshot; route all identity edits to new cases.
4. Test reviewer separation, snapshot tampering, incomplete cases and edit/review races.
5. Accept after a staffed drill proves unsupported approvals cannot publish and exceptions retain explicit rationale/evidence.

**D — Separate attestations from editable profiles.** Preserves profile flexibility; consumers must adopt new semantics.
1. Identify every consumer of “verified” and define attestation subject, scope, expiry and evidence requirements.
2. Add immutable identity attestations and migrate only substantiated decisions; keep unverifiable history explicitly unknown.
3. Make approval issue validated attestations; profile changes do not rewrite their subject and consumers check subject match.
4. Test changed names/business identity, mismatched profile revisions, expired attestations and missing required evidence.
5. Accept when no consumer interprets a historical attestation as approval of an altered current profile.

### AG-5 — Lossless support mutations

**A — Normalize messages and tags (recommended).** Strong constraints and growth properties; migration required.
1. Inventory existing JSONB shapes and define stable message IDs and unique ticket/tag keys.
2. Backfill child tables and reconcile counts without dropping original metadata.
3. Replace array rewrites with inserts/deletes in transactions; cut reads over after reconciliation.
4. Race replies and tag changes across workers, including duplicate retries and rollback.
5. Accept only when every acknowledged message persists exactly once and tag changes never erase messages.

**B — Atomic JSONB SQL mutations.** Minimal schema change; JSON arrays remain less scalable.
1. Define atomic append/set/delete semantics and idempotency keys.
2. Normalize malformed legacy metadata through an audited migration.
3. Use database-side JSONB updates preserving unrelated keys for all three mutation paths.
4. Test simultaneous appends, tag add/delete conflicts and repeated request IDs.
5. Accept after concurrent runs conserve all accepted messages and enforce documented tag ordering.

**C — Row locking within transactions.** Straightforward correctness; contention on busy tickets.
1. Define per-ticket lock ordering, timeout and retry behavior.
2. Reconcile malformed metadata and ensure every writer uses the shared repository.
3. Perform locked read-modify-write transactions for messages and both tag paths.
4. Test concurrent writers, deadlocks, transaction cancellation and notification retries.
5. Accept when no successful mutation is lost and lock contention remains within support latency objectives.

**D — Optimistic versioned writes.** Avoids blocking; conflicts need retry UX.
1. Define ticket version/CAS contract and bounded merge rules.
2. Backfill version numbers for all existing tickets.
3. Update metadata only against the read version; reload/merge or return explicit conflict without acknowledging uncommitted changes.
4. Test stale replies, tag removal versus addition, exhausted retries and duplicate submits.
5. Accept after every acknowledged write is durable and unresolved conflicts are visible rather than silently discarded.

### AG-6 — Complete customer support loop

**A — First-party owner-scoped portal (recommended).** Best integrated experience; new UI/API work.
1. Specify customer read/reply/attachment permissions separately from administrative actions.
2. Add owner-scoped detail and reply endpoints plus the advertised `/support/tickets/:id` page.
3. Reuse existing persisted history, reconcile author identity and route notifications to the customer page.
4. Test owner/non-owner/admin access, notification navigation, closed tickets and replies from mobile.
5. Accept when a customer opens a staff notification, reads history and replies without any admin privilege.

**B — Inbound-email conversation channel.** Familiar experience; sender verification and threading complexity.
1. Select authenticated inbound email routing and define sender/thread validation.
2. Add stable thread/reply tokens and map existing tickets to threads.
3. Persist verified inbound replies and deliver staff responses; replace dead links with functioning email reply instructions and history access.
4. Test spoofed senders, forwarded threads, attachments, duplicates and delivery failures.
5. Accept after a real controlled customer/staff email exchange produces a complete durable ticket history.

**C — Integrated helpdesk portal.** Mature customer tooling; vendor dependency and data migration.
1. Select a helpdesk with customer identity isolation, exports and bidirectional APIs.
2. Migrate tickets/messages with local-to-provider mappings and reconcile ownership.
3. Implement SSO/deep links, staff workflow integration and idempotent synchronization.
4. Test tenant isolation, link expiry, sync outages and replies created on either side.
5. Accept when notified customers can read/reply and both systems reconcile without lost or duplicated history.

**D — Authenticated in-app support inbox.** Avoids separate ticket-page UX; requires notification-to-thread routing.
1. Define a support-thread model inside the existing authenticated assistant/support shell.
2. Migrate ticket histories into owner-visible threads while preserving ticket references.
3. Add owner-scoped thread read/reply APIs and route notifications to a selected support thread.
4. Test conversation resumption, cross-account thread IDs, new staff responses and closed-thread behavior.
5. Accept after the complete create→staff reply→notification→customer reply cycle works without administrative routes.

## Examined-surface inventory and unexamined boundaries

- **Mounts/UI:** reviewed primary/lazy admin, support and KYC registrations in `server/routes.ts`, application admin/support/KYC routing, moderation/settings actions, KYC review and applicant-status consumers, support detail actions.
- **Backend effects:** inspected admin moderation/settings handlers, KYC service ownership/decisions/checklist/eligibility, support service persistence and route-level authorization. Guards are acknowledged; this report intentionally does not repeat authentication, session revocation, logging or privacy-erasure findings from `security.md`/`scanners.md`.
- **Historical reports:** compared blocker lists in all existing readiness reports; excluded token lifecycle 501 (`coverage-gaps.md`), autonomous healing/evolution adapters (`product-autonomous.md`), commerce and deployment/runtime findings. Existing comments/tasks were search leads only, not runtime evidence. Current KYC upload ownership checks, admin subtree role guard and sequential support persistence were not misreported as missing.
- **Consent/compliance/legal:** inspected `server/services/consentService.ts`, `server/services/complianceService.ts`, `client/src/components/CookieConsentBanner.tsx`, `client/src/components/settings/PrivacySettings.tsx`, public Terms/Privacy source and policy-file inventory. Searches found no external callers of the consent/compliance services; therefore their report language/internal scores are not presented as evidence of a live compliance dashboard or certification. The banner itself describes essential cookies and stores a local choice; no proven optional-tracker contradiction is asserted from that fact alone. No demonstrable new legal/billing contradiction was established in this pass; jurisdiction-specific legal adequacy was not assessed.
- **Incident/security governance:** inventoried admin security, audit-log and platform-fixer incident surfaces and policy document paths. Did not validate incident drills, alert routing, decision-log retention, staff operating procedures or external certifications. These remain operational evidence boundaries, not fabricated failures.
- **Other unexamined boundaries:** no deployed behavior, provider delivery, live schema/data completeness, KYC file custody penetration test, all payment eligibility consumers, external social takedown confirmation, ban enforcement across every session/API path, all training/admin-dashboard controls, exhaustive policy/version-consent acceptance capture, DMCA processing, jurisdiction-specific obligations or complete accessibility audit. No screenshots were necessary for this source-only report and no application was run. An entire-platform release decision must combine the parallel domain reports and explicit acceptance evidence; this report does not certify production readiness.