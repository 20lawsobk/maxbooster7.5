# External integrations readiness audit

Date: **2026-09-19**. Scope: distribution gateways, DSP identity/catalog import, social OAuth and external publishing, notification/email/SMS delivery. Read-only source review; only this report was written. No application execution, provider calls, database queries, secret inspection, dependency installation, or workflow changes.

## Blocker list

Priorities below apply to the affected release scope, not automatically to every platform feature. “CONFIRMED defect” means the unsafe implementation is visible, not that an incident was observed. “CAPABILITY GAP” means the advertised workflow lacks a necessary implementation. Live credentials, provider approvals, and actual delivery remain **VERIFICATION GATES**, not confirmed missing configuration. No P0 incident is established by this review.

| ID | Classification / priority | Blocker | Affected release scope | Confidence |
|---|---|---|---|---|
| I1 | CONFIRMED defect / P1 | LabelGrid submission/delivery claims exceed provider evidence: local drafts become submissions and unknown outlet states become processing | Spotify, Apple Music, YouTube Music direct-submit routes and configured LabelGrid delivery-status consumers | High |
| I2 | CONFIRMED defect / P1 | Distribution creation retries lack application-level idempotency and durable remote checkpoints | Too Lost primary submission and LabelGrid release creation | High on implementation; provider-side deduplication unverified |
| I3 | CONFIRMED defect / P1 | Catalog completeness is inferred independently of actual scanner termination | DSP catalog previews/imports, especially SoundCloud and Deezer | High |
| I4 | CAPABILITY GAP / P1 | Automatic artist discovery/import has no durable job handoff/checkpoint in this path | Automatic catalog import after artist creation and transfer-job progress | High |
| I5 | CONFIRMED defect / P1 | OAuth callbacks persist reusable social credentials in plaintext application columns | Connected social accounts, refresh and publishing credential boundary | High |
| I6 | CONFIRMED defect / P1 | Autopilot publishing has no recovery path for stranded `posting` records or ambiguous per-platform outcomes | Scheduled/manual/autopilot posts through AutoPostingServiceV2 | High on code; queue-server recovery semantics unverified |
| I7 | CONFIRMED defect / P1 | Notification delivery reads a different preference schema than the preference API writes | Release/social/other notifications through NotificationService; email and browser opt-ins | High |
| I8 | CAPABILITY GAP / P2 | SMS verification claims active notifications, but notification dispatch has no SMS channel | General SMS notification offering; P1 if SMS is a required security-alert channel | Medium-high; searched server TypeScript delivery paths |
| I9 | CAPABILITY GAP / P1 | Both mounted distributor payout actions call a method that always throws; a token cannot enable the absent provider endpoint | LabelGrid earnings/royalty payout execution, not internal balance accounting | High |

### I1 — Submission and delivery claims exceed provider evidence

**Entrypoint → provider → consumer:** `server/routes/distribution.ts:8022-8077`, `:8080-8135`, `:8140-8185` expose `/platform/spotify`, `/platform/apple`, `/platform/youtube`. Each calls the imported `labelgrid-service` (`:26`), records a provider release ID and “submitted at,” and returns `success: true` with an explicit submission/delivery message. `server/services/labelgrid-service.ts:1181-1191` instead returns `simulateCreateRelease` when not configured. That method now honestly returns `status: "draft"` and a locally generated `draft_` ID (`:2175-2188`).

**Impact:** the service-level draft status is not itself the defect; the live route wraps it in an external-submission success claim and persists misleading submission metadata. No real DSP acknowledgement is required. Existing draft-honesty work therefore does not close this route-level defect.

**Configured-path instance of the same root cause:** after a successful distribute call, `server/services/labelgrid-service.ts:1380-1388` fetches delivery status, but a failed lookup or empty parsed outlet list becomes the caller's requested platforms with invented `processing` statuses (`:1395-1405`). The preceding comment correctly notes that LabelGrid delivers to account-configured outlets, not necessarily the requested list (`:1375-1379`). Nonempty real parsed outlet results are preserved; the defect is the fallback, not replacement of every real response. Unknown overall and outlet status strings also normalize to `processing` (`:885-897`, `:900-923`). Therefore even a connected account can appear to be progressing at an outlet without evidence that the provider attempted it. Submission acknowledgement, requested outlet intent, observed provider delivery and unavailable/unknown status must remain separate, with source/time/raw-status provenance.

### I2 — Non-idempotent remote mutations and late persistence

**Entrypoint → provider:** primary submission calls Too Lost before creating dispatch records (`server/routes/distribution.ts:2072-2077`). Too Lost retries 429, 5xx, timeouts and network errors generically (`server/services/toolost-service.ts:708-737`), including `POST /releases` (`:1273-1288`) and submit (`:1371-1383`). The remote release ID lives inside the service while audio upload and subsequent stages execute (`:1288-1295`). LabelGrid similarly wraps create in generic retry (`server/services/labelgrid-service.ts:601-630`, `:1225-1240`); its catalog reference uses `Date.now()` inside the retried callback (`:1231`).

**Impact:** a response lost after remote acceptance can cause another creation; a later upload/validation/DB failure can leave an orphaned remote draft or submitted release, and retrying the route starts creation again. This is not a claim that providers never deduplicate: neither a durable application operation key nor a verified provider idempotency contract is established by these callers. LabelGrid's newly corrected endpoint/payload work and Too Lost's real submission implementation do not eliminate this failure window.

### I3 — Completion claims detached from scanner results

**Entrypoint → scanner → consumer:** artist import calls `scanReleasesFromProfileUrl` and returns its coverage to preview/import consumers (`server/services/artistProfileService.ts:2303-2310`, `:2330-2367`). Scanner selection attaches coverage after receiving only a release array (`server/services/distributionDataTransferService.ts:3230-3254`). SoundCloud stops after 100 pages even if `next_href` remains (`:2972-2989`), but coverage always reports complete (`:3361-3368`). Deezer catches scanner errors and returns `[]` (`:2881-2887`), while coverage categorically declares Spotify/Deezer complete (`:3340-3347`). A failed Deezer scan can consequently become “no releases” with complete coverage in the artist service (`server/services/artistProfileService.ts:2313-2329`).

**Impact:** users cannot distinguish an empty catalog from a failed scan or an exhausted cursor from a local cap. Separately, Spotify only enriches the first ten releases and one 50-track page in the examined enrichment block (`server/services/distributionDataTransferService.ts:2380-2387`); release coverage should not be presented as track/metadata completeness. The old 100-release Spotify cap is **not** reported as current: pagination now follows `next` (`:2374-2377`). Bandcamp/Audiomack already report partial coverage (`:3350-3358`); that honesty is not a defect.

### I4 — Volatile catalog orchestration

**Entrypoint → orchestration → progress:** artist creation starts an unawaited promise and immediately returns 201 (`server/routes/artistProfiles.ts:83-101`). Transfer jobs are process-local maps (`server/services/distributionDataTransferService.ts:490-494`); creation and lookup write/read that map (`:601-628`). Import creates and mutates that job before entering catalog DB work (`:3558-3574`).

**Impact:** a process replacement after profile creation can lose the scheduled discovery, and transfer progress cannot reliably survive restart or be read across replicas. Persisted profile/release rows are not the same as persisted pending work. Existing advisory locking and transaction/savepoint protections (`:3570-3589`) address duplicate writes, not durable scheduling; they should be preserved. This finding does not claim that all linked-profile persistence or every synchronization path is volatile.

### I5 — Plaintext OAuth credential lifecycle

**Entrypoint → persistence → consumer:** `/callback/:platform` (`server/routes/socialOAuth.ts:430`) stores effective access tokens and refresh tokens directly on updates/inserts (`:1046-1080`). The current comment explicitly explains that publishing/sync consumers require the plain representation (`:1048-1053`). `server/services/socialSyncService.ts:70-82` reads the column directly before refresh, and downstream calls use that token as Bearer credentials (`:472`, `:504`). Some other consumers support encrypted formats (`server/services/socialService.ts:32-56`), so changing only the callback would break a mixed ecosystem.

**Impact:** application/database reads, exports and backups of these columns expose reusable account credentials beyond the minimal publishing boundary. This is an application-level plaintext defect, not evidence that disk encryption is absent or that credentials have leaked. All callback platform instances share this root cause; access tokens, refresh tokens and platform-specific page-token overrides must be included in migration.

### I6 — External social action recovery gap

**Entrypoint → scheduler → provider:** autopilot schedules through V2 (`server/services/autopilotPublisher.ts:726-733`). Startup reloads only `pending` posts (`server/services/autoPostingServiceV2.ts:79-94`). Processing writes `posting`, executes external calls, and only afterwards saves results (`:113-124`). Worker reads use `queuePop`, with no acknowledgement/recovery protocol in this worker (`:201-234`). Per-platform provider errors become result objects (`:334-345`); exceptions mark the whole post failed (`:195-198`).

**Impact:** a restart after `posting` but before saved results leaves a record outside startup reload. A restart after provider acceptance but before local receipt storage creates an ambiguous action; blindly replaying the whole post can duplicate already-published platforms. Partial successes are persisted only after all calls finish. Whether the separate queue service internally redelivers is a verification gate, but that alone cannot reconcile remote acceptance or recover this DB state safely.

### I7 — Notification preference contract mismatch

**Entrypoint → preferences → delivery:** the registered API returns nested `email.enabled/categories`, `push.enabled/categories`, `muteAll`, quiet hours and SMS preferences (`server/routes.ts:3313-3405`), and writes the supplied preference object (`:3444-3453`). `NotificationService.send` instead checks flat `preferences.email && preferences[type]` and `preferences.browser && preferences[type]` (`server/services/notificationService.ts:67-81`). Producers use event names such as `release_submitted` (`:947-962`), not those flat default booleans. Sending then calls Resend/browser methods (`:96-110`) and records an in-app notification irrespective of those external-channel checks (`:83-94`).

**Impact:** normal nested preferences cannot reliably enable intended mail/push; legacy top-level event flags may allow an email even when nested `email.enabled` is false because an object is truthy. `muteAll`, category mapping and quiet hours are not consulted by this send path. The newer push dispatcher has preference handling; this does not automatically repair callers of NotificationService. Its explicit `emailSent` and provider-error checks (`:151-178`) are improvements and are not described as false-success defects here.

### I8 — SMS notification channel missing after verification

**Entrypoint → claim → missing dispatch:** SMS confirmation persists verified phone state and responds “SMS notifications are now active” (`server/routes.ts:3967-3984`). API defaults expose SMS category settings (`:3372-3379`). `NotificationService.send` exposes only in-app, email and browser results/branches (`server/services/notificationService.ts:50-55`, `:96-128`); `NotificationDispatcher` describes/routes web, desktop and mobile push (`server/services/notificationDispatcher.ts:1-13`, `:28-35`), not SMS. Server TypeScript searches found Twilio sends in phone-verification endpoints, not a business-notification SMS dispatcher.

**Impact:** successful verification is not SMS alert delivery. Treat general SMS notifications as incomplete, not Twilio Verify itself as broken. A separate unexamined deployment-side sender could change this conclusion; no such delivery consumer was established in the inspected source.

### I9 — No supported payout execution behind the mounted actions

**Entrypoint → service → provider boundary:** `POST /api/distribution/earnings/payout` validates the request and calls `requestPayout` (`server/routes/distribution.ts:7314-7338`); `POST /api/distribution/royalties/payout` does the same (`:7456-7474`). Configured `requestPayout` always throws because LabelGrid has no payout-request API endpoint and requires its dashboard (`server/services/labelgrid-service.ts:2032-2048`). The unconfigured branch calls `simulateRequestPayout`, which also always throws (`:2268-2275`). Its advice to set a token to enable payouts is contradicted by the configured branch. Both route error handlers turn these messages into an unavailable response (`server/routes/distribution.ts:7343-7351`, `:7486-7494`).

**Impact:** neither action can execute a payout with or without a token. This is an honest failure but an unfinished execution capability, not a missing-secret verification gate and not proof of an internal accounting defect. A supported external execution workflow must replace the impossible API call; a message-only change is not completion. Dashboard execution is the supported mechanism identified in current source. Any alternative provider-assisted or replacement-provider mechanism below requires documented contractual support before implementation; none assumes an undocumented LabelGrid endpoint exists.

## Repair playbooks

Each letter is an independent implementation alternative, not another phase of the preceding option. Each includes preparation, implementation/migration, testing and acceptance. Select one primary approach per finding; combinations require explicit ownership of overlapping state. None guarantees a first-attempt fix.

### I1 — Make submission responses reflect durable external acknowledgement

**A — Typed submission outcomes (recommended; least disruptive).**
1. Inventory direct-submit/status consumers; define draft, acknowledged submission, unknown/unavailable delivery and failure separately, including raw/source/time provenance.
2. Return provider-unavailable explicitly when disconnected; retain draft creation separately and replace invented outlet/unknown-status processing with unknown/unavailable results.
3. Write submission timestamps only for acknowledged acceptance; preserve real observed outlets separately from requested intent and reconcile unsupported historical draft/progress claims.
4. Test missing configuration, failed/empty delivery-status reads, unknown status strings, nonempty real outlet responses and duplicate requests.
5. Accept when no draft claims submission, no unknown outlet claims processing, and an authorized provider submission retains verifiable acknowledgement and delivery provenance.

**B — Durable submission command API (higher infrastructure cost; better resilience).**
1. Define shared command/status contracts separating requested outlets, submission receipts and observed delivery, with explicit unknown/unavailable states and provenance.
2. Persist submission intent transactionally and return a real operation ID, not a provider-submission claim.
3. Implement a worker that records acknowledgement and independently reconciles actual outlets; failed/empty/unknown status reads remain unknown/unavailable, not processing; migrate unsupported metadata.
4. Test outages, worker restart, delayed acknowledgements, unknown provider strings and real-versus-requested outlet differences through polling.
5. Accept when every submission claim resolves to a receipt, each delivery state retains observation provenance, and unknown outcomes recover without invented progress.

**C — Route consolidation through a shared distribution orchestrator (broader refactor).**
1. Map route metadata/provider-selection differences and define receipt/observation provenance and unknown/unavailable delivery states.
2. Implement a common orchestrator validating readiness and acceptance; remove requested-outlet fallback progress and unknown-to-processing normalization.
3. Route Spotify/Apple/YouTube handlers through it; migrate metadata into intent, acknowledgement and observed-outlet records without upgrading unsupported historical claims.
4. Test selected-store versus actual-store differences, failed/empty status reads, unknown status strings and legacy consumers of real outlet results.
5. Accept when all entrypoints show evidence-backed transitions, preserve unknown/unavailable outcomes and attach provenance to a verified provider delivery.

**D — Real draft-to-submit resource lifecycle (best draft UX; larger API migration).**
1. Specify local draft, provider draft, acknowledged submission and delivery-observation resources with identifiers, provenance and unknown/unavailable states.
2. Implement separate create/submit actions and provider-observation retrieval; never infer delivery progress from requested outlets or unrecognized provider states.
3. Migrate ambiguous records after checking actual provider resources; preserve real observations and update UI to distinguish unavailable status from processing.
4. Test lifecycle transitions, cancellation, interrupted creation, provider validation errors and failed/empty/unknown delivery observations.
5. Accept when only acknowledged submission produces a submitted timestamp and every outlet progress claim has actual provider provenance; missing evidence remains unknown/unavailable.

### I2 — Prevent duplicate/orphaned distribution operations

**A — Persistent saga with provider-supported idempotency (recommended where supported).**
1. Verify each provider's create/submit idempotency contract; define a stable local release-revision operation key.
2. Persist intent and every remote ID/stage; send stable provider idempotency keys where the real contract supports them.
3. Resume upload/validation/distribution from checkpoints; inventory and reconcile preexisting ambiguous remote drafts.
4. Inject response loss after each mutation and failures before each DB checkpoint; retry identical commands concurrently.
5. Accept when one revision produces one reconciled remote release and failed stages resume without another creation.

**B — Reconcile-before-retry protocol (works without provider idempotency; requires reliable lookup).**
1. Confirm provider lookup by a stable customer reference/catalog ID and its consistency delay.
2. Assign that reference before creation; replace generic mutation retries with lookup-and-reconcile handling.
3. Persist uncertain outcomes and remote IDs; reconcile legacy drafts by authenticated ownership and strong identifiers.
4. Test delayed indexing, lost responses, conflicting matches and lookup outages without re-creating blindly.
5. Accept when uncertainty remains visible until resolved and repeated requests never bypass reconciliation.

**C — Serialized delivery ledger and operator-assisted ambiguity resolution (more operational work).**
1. Design a per-release ledger, lease ownership and an operator queue for outcomes the provider cannot query reliably.
2. Serialize mutations; checkpoint known IDs and pause ambiguous commands pending actual provider-side evidence.
3. Implement authenticated operator recovery that links the verified remote object or authorizes a confirmed-not-created retry.
4. Test concurrent workers, lease expiry, human recovery authorization and partial-upload continuation.
5. Accept when every ambiguous action is actionable/audited and no automatic duplicate mutation is possible.

**D — Provider-draft-first resumable submission API (larger client change).**
1. Separate creation, media upload, metadata validation and submission into revisioned API operations.
2. Persist the provider draft immediately and make subsequent actions address that same remote draft.
3. Migrate existing releases to known draft IDs or a reconciliation queue; use a stable create reference and resolve create ambiguity.
4. Test repeated upload/submit actions, interrupted creation and revisions after rejection.
5. Accept when user retries operate on an existing reconciled draft and submit receipts persist before success is shown.

### I3 — Establish evidence-based catalog coverage

**A — Structured scanner result contract (recommended; preserves current adapters).**
1. Define release coverage, track coverage, cursor, stop reason, provider errors and limits separately.
2. Return this structure from every scanner; remove coverage decisions based only on scanner name or result count.
3. Propagate incomplete/error outcomes through previews/imports and mark historical “complete” runs lacking evidence as unverified.
4. Test empty-success versus failed-empty, SoundCloud page 100 with another cursor, and partially enriched Spotify albums.
5. Accept when complete requires exhausted pagination and all remaining metadata limitations remain visible.

**B — Durable cursor crawl engine (larger investment; supports large catalogs).**
1. Specify provider cursor adapters and termination proofs for releases and tracks.
2. Implement page work items, durable checkpoints and rate-limit-aware continuation rather than terminal page caps.
3. Migrate active scans to crawl jobs; aggregate coverage only from successful exhausted cursor trees.
4. Test retries, cursor expiry, very large catalogs, worker replacement and concurrent scan versions.
5. Accept when capped work resumes and completion is reproducible from the persisted page ledger.

**C — Authoritative catalog manifest ingestion (provider/export dependency).**
1. Identify supported artist-owned/provider exports with documented complete-catalog semantics and stable IDs.
2. Implement validated manifest ingestion with explicit version, scope, counts and track metadata.
3. Reconcile discovered entries against manifests; maintain uncovered platforms as incomplete until real manifests arrive.
4. Test malformed/partial manifests, edition differences, deleted items and reimports without duplicate releases.
5. Accept when completeness is supported by a validated authoritative manifest rather than inferred from search output.

**D — Reconciliation-based coverage certification (more API traffic; handles weak scanners).**
1. Identify independent authoritative totals/IDs or complete provider inventories for each supported source.
2. Build a reconciliation pass that compares discovered release/track IDs and schedules missing-detail fetches.
3. Store coverage certificates with scope, evidence and expiry; invalidate old unsupported complete labels.
4. Test missing pages, provider-side catalog changes, empty errors and mismatched edition identities.
5. Accept when mismatches trigger real recovery work and only reconciled inventories receive complete status.

### I4 — Make catalog work survive process replacement

**A — PostgreSQL job ledger and worker leases (recommended; reuses existing persistence).**
1. Define discovery/import jobs, per-platform checkpoints, lease expiry and ownership authorization.
2. Create the artist and discovery job in one transaction; workers claim jobs and persist progress.
3. Move transfer-job reads from maps to the ledger and backfill undiscovered profiles using explicit eligibility rules.
4. Test restart after 201, restart mid-scan/import, multiple replicas and repeated job claims.
5. Accept when every accepted profile has recoverable work and progress remains visible across replicas/restarts.

**B — Transactional outbox plus durable queue (more moving parts; scalable).**
1. Specify event keys, queue acknowledgement/redelivery semantics and outbox retention.
2. Write profile-created events transactionally; relay to a durable acknowledged queue with idempotent consumers.
3. Persist progress/checkpoints independently of the queue and drain/reconcile outstanding process-local work.
4. Test relay crashes, duplicate events, queue outages and mid-import worker termination.
5. Accept when no committed profile loses its discovery event and retries preserve catalog locking/deduplication.

**C — Durable workflow engine (operational dependency; strongest orchestration tooling).**
1. Select an engine with persistent timers/history and define one workflow per profile/discovery revision.
2. Convert discovery, platform scanning and import into retryable activities with real state checkpoints.
3. Start workflows through a transactional handoff; migrate existing unfinished profiles and expose workflow progress.
4. Test activity timeouts, provider rate limits, deployment upgrades and replay compatibility.
5. Accept when engine recovery resumes interrupted work with the same catalog identity and visible failure states.

**D — Desired-state reconciliation controller (less event dependence; slower convergence).**
1. Add desired discovery revision, observed revision, per-platform progress and lease fields to persistent profiles.
2. Implement a periodic controller that claims nonconverged profiles and scans/imports incrementally.
3. Replace fire-and-forget creation with desired-state updates; migrate profiles lacking an observed successful revision.
4. Test controller downtime, repeated passes, replica races and changes during an import.
5. Accept when every pending profile converges after recovery and progress is durable without relying on a single creation event.

### I5 — Protect reusable OAuth credentials without breaking consumers

**A — Shared versioned encryption envelope (recommended; manageable migration).**
1. Inventory all token writers/readers, page-token metadata and rotation paths; select a managed key boundary.
2. Implement one decrypt-on-use credential repository with authenticated encryption and key/version metadata.
3. Deploy compatible readers first, encrypt existing rows in controlled batches, then switch all writers and remove plain fallback after verification.
4. Test connect/refresh/publish/sync across platforms, key rotation, old/new rows and denied decrypt permissions.
5. Accept when no reusable token remains plaintext in application persistence and all consumers use the repository successfully.

**B — External secrets vault references (strong isolation; vault availability required).**
1. Define per-account vault paths, service identities, audit policy and rotation ownership.
2. Store tokens in the vault and references/expiry only in application tables; fetch short-lived access on demand.
3. Migrate existing credentials with rollback-safe references and remove plaintext columns after consumer cutover.
4. Test revoked access, vault outages, refresh races, token rotation and callback failure midway through writes.
5. Accept when DB-only access cannot retrieve provider credentials and supported publishing/refresh remains operational.

**C — OAuth credential broker (largest service change; narrows token exposure).**
1. Define broker APIs for connection, refresh and authenticated provider requests; map all current token consumers.
2. Implement isolated encrypted credential storage and broker-authorized provider operations.
3. Migrate callback ownership and replace direct token reads with broker handles; reconcile existing accounts.
4. Test tenant isolation, scope restrictions, broker outages, revocation and concurrent refresh.
5. Accept when main application workers no longer receive persistent reusable credentials and end-to-end provider actions succeed.

**D — Database cryptographic access boundary (DB/key-management complexity).**
1. Design encrypted columns and narrowly authorized decrypt functions with keys supplied outside ordinary DB exports.
2. Implement restricted credential access procedures and separate callback-write/worker-read roles.
3. Migrate columns and all consumers transactionally; remove general-role access to the old plaintext representation.
4. Test ordinary DB reads/exports, role escalation resistance, key rotation and each live consumer's refresh/publish path.
5. Accept when ordinary application/database readers cannot reveal tokens and permitted operations work with audited decrypt access.

### I6 — Recover social publishing without duplicating external posts

**A — Per-platform delivery ledger with leases (recommended; explicit remote state).**
1. Define platform attempts, prepared media IDs, provider IDs, lease expiry and ambiguous-result states.
2. Persist per-platform progress before/after calls; recover expired `posting` leases and reconcile provider outcomes before resending.
3. Migrate pending/failed/posting records into delivery attempts, preserving known successful results.
4. Kill workers before/after provider acceptance, test mixed platform success and expired leases.
5. Accept when recovered jobs neither lose successful posts nor republish acknowledged platforms.

**B — Durable workflow per scheduled post (workflow dependency; strong replay visibility).**
1. Model each provider's create/upload/publish/poll stages and reconciliation capabilities.
2. Implement separately checkpointed activities and durable scheduling timers with platform-scoped retry policy.
3. Import existing scheduled records and attach remote receipts; send uncertain records to reconciliation rather than fresh publish.
4. Test workflow replay, deployment changes, provider timeouts and accepted-but-unrecorded responses.
5. Accept when restart resumes the correct activity and every platform has a verified final or actionable uncertain state.

**C — Queue visibility/ack protocol plus recovery sweeper (queue work required).**
1. Verify queue semantics; design reservations, acknowledgements, visibility extension and a persisted delivery journal.
2. Replace destructive worker consumption with reservable jobs and acknowledge only after journal persistence.
3. Add a sweeper for stale DB `posting` records; resume only uncompleted platforms after remote reconciliation.
4. Test consumer crashes, delayed acknowledgements, duplicate delivery and queue/DB split failures.
5. Accept when no stale posting record escapes recovery and redelivery is safe against recorded/ambiguous provider outcomes.

**D — Provider-operation reconciliation scheduler (more polling; useful for asynchronous APIs).**
1. Identify provider operation IDs, status APIs and safe content-reference matching rules.
2. Persist initiation and operation IDs immediately; separate upload/initiation from polling/finalization jobs.
3. Replace one-shot completion with a reconciliation scheduler; migrate stranded posts using real provider evidence.
4. Test long processing, final rejection, response loss and providers without queryable ambiguous operations.
5. Accept when queryable actions converge automatically and unqueryable ambiguity enters an auditable recovery workflow without blind reposts.

### I7 — Align preference semantics across all notification producers

**A — Canonical preference evaluator (recommended; smallest architectural change).**
1. Map every event type to API categories and document mute/quiet-hours/urgency rules.
2. Implement a typed evaluator for nested preferences; use it in NotificationService and push dispatch.
3. Migrate legacy booleans with conservative opt-out preservation and version the stored schema.
4. Test the full event/category/channel matrix, nested disabled settings, mute-all and timezone boundaries.
5. Accept when eligible mail/push is sent and explicit opt-outs are respected across all producer paths.

**B — Central notification orchestration service (broader consolidation).**
1. Inventory all email/browser/push producers and define a single event/recipient contract.
2. Move preference decisions and channel dispatch into one orchestrator with durable per-channel outcomes.
3. Adapt NotificationService callers to events; migrate preferences and stop duplicate parallel dispatch paths.
4. Test each producer, retries, provider rejection and mixed channel opt-ins without duplicate notifications.
5. Accept when one central decision explains every attempted/skipped delivery and user settings match observed behavior.

**C — Normalized relational consent model (schema-heavy; strongest auditability).**
1. Define channel/category consent rows, event mappings, policy revisions and quiet-hour records.
2. Implement transactional preference reads/writes and a shared consent query for all senders.
3. Migrate nested and legacy settings preserving explicit denials; update API projections for existing clients.
4. Test concurrent preference changes versus sends, incomplete migrations and unknown event categories.
5. Accept when consent history and send records prove each channel's eligibility and no legacy object-truthiness checks remain.

**D — Versioned policy compilation (fast dispatch; cache invalidation burden).**
1. Specify canonical preference policy and a compiled event/channel eligibility representation.
2. Compile policies on updates, retaining quiet-hour evaluation at delivery time and explicit unknown-category handling.
3. Backfill policies, update all senders to require the current policy revision and preserve opt-outs on errors.
4. Test stale caches, concurrent updates, legacy migration and actual Resend/browser integrations.
5. Accept when every delivery cites the current policy revision and API changes take effect before subsequent sends.

### I8 — Implement real opt-in SMS notifications

**A — Twilio Messaging adapter in the existing notification pipeline (recommended; reuses verification provider).**
1. Define supported SMS events, jurisdiction/consent requirements, opt-out handling and verified-phone eligibility.
2. Add a real messaging adapter with durable attempts, provider message IDs and status callbacks separate from verification.
3. Wire category/quiet-hour preferences and STOP handling; migrate verified phones without assuming verification equals marketing consent.
4. Test delivery rejection, callbacks, opt-out, retries and verified/unverified recipients using approved test facilities.
5. Accept when an authorized real alert reaches a consented test handset and delivery/opt-out state is traceable.

**B — Dedicated SMS delivery worker and outbox (more infrastructure; isolates send reliability).**
1. Specify consented SMS event contracts, deduplication keys and delivery-service ownership.
2. Emit transactional outbox events; implement a worker using a real supported messaging provider and receipt ingestion.
3. Migrate SMS preferences into explicit subscriptions and update confirmation responses to reflect actual channel readiness.
4. Test duplicate events, provider downtime, expired consent and callback replay/signature validation.
5. Accept when eligible events survive outages and ineligible recipients never enter the send queue.

**C — Multi-channel provider orchestration (vendor coupling; centralized channel tooling).**
1. Select a provider supporting transactional SMS, consent controls, signed receipts and required regions.
2. Integrate real SMS workflows keyed to application notification events and stable recipient references.
3. Synchronize preferences/verified phone state and process provider opt-outs back into application consent.
4. Test preference synchronization failures, handset delivery, webhook ordering and tenant isolation.
5. Accept when application and provider consent agree and every SMS event has a durable delivery outcome.

**D — Owned SMS gateway service with multiple carriers (highest cost; resilience/control).**
1. Define regulatory requirements, carrier contracts, message classes, sender registration and routing ownership.
2. Implement a gateway with consent enforcement, encrypted recipient storage, idempotent submission and signed status normalization.
3. Connect the application dispatcher via stable message IDs; migrate opt-ins conservatively and establish compliant carrier routing.
4. Test carrier outage/failover without double sends, STOP propagation, receipts and approved handset delivery.
5. Accept when genuine messages deliver through the primary and approved recovery path with auditable consent and outcomes.

### I9 — Deliver a supported external payout execution workflow

**A — Account-holder dashboard execution with receipt reconciliation (recommended; uses the documented-in-source mechanism).**
1. Confirm LabelGrid dashboard payout permissions, request requirements, available receipt/status evidence and who owns the distributor account.
2. Replace both impossible API calls with a persistent payout-request workflow that guides the authorized account holder to the real dashboard and records a pending-external-action state.
3. Implement receipt/reference capture, authenticated account/amount matching and review/reconciliation into requested, rejected and settled states; migrate old failed attempts without claiming they executed.
4. Test an authorized dashboard request end to end, duplicate receipts, mismatched account evidence, rejection and interrupted handoff.
5. Accept when an actual provider request and its eventual outcome are linked to the application request, with no “requested/paid” claim based solely on clicking the local button.

**B — Delegated operations dashboard execution (staff accountability; operational throughput cost).**
1. Confirm contractual authority and provider-supported delegated access; define requester entitlement, approvers, operator roles and service-level targets.
2. Implement a durable approval/work queue behind both routes, assigning an accountable authorized operator rather than pretending to call a payout endpoint.
3. Have operators execute approved requests through the supported provider dashboard, attach provider references/receipts, and independently reconcile outcomes with an audit trail.
4. Test request approval, unauthorized/self-approval denial, operator reassignment, duplicate execution prevention and provider rejection using a real authorized pilot.
5. Accept when each completed item has provider execution evidence and reconciliation, and overdue or ambiguous items remain visible to the requester and responsible operator.

**C — Contracted provider-assisted payout instruction workflow (conditional on provider agreement; avoids inventing an API).**
1. Obtain written confirmation of a supported provider-assisted request mechanism, such as an authenticated support/account-management instruction process, including receipt and status terms; otherwise do not choose this option.
2. Implement approved instruction generation, requester authorization, durable transmission tracking and provider acknowledgement capture through that contracted channel.
3. Link both application actions to this workflow, assign an owner for rejected/ambiguous instructions and reconcile provider references/status evidence; migrate failed local attempts as unexecuted.
4. Run an approved real instruction pilot, testing duplicate instructions, authentication failure, provider acknowledgement delay and final outcome reconciliation.
5. Accept only when the provider actually executes an authorized instruction and supplies traceable request/outcome evidence; merely sending a support message is not payout completion.

**D — Migration to a distributor with a supported payout execution contract (largest migration; enables real automation where available).**
1. Select and contract a provider whose verified payout API or documented automated execution facility covers the business/account model; validate migration and legacy LabelGrid receivable constraints.
2. Implement its real request/status adapter with authorization, idempotency, durable operation records and authenticated receipt/status reconciliation.
3. Migrate eligible distributor relationships and route new payout actions by the actual provider; settle legacy LabelGrid obligations through its dashboard rather than assuming balances transfer.
4. Test a provider-approved end-to-end payout, lost responses, repeated requests, rejected eligibility and separation of migrated versus legacy obligations.
5. Accept when eligible requests execute through the contracted facility with verified outcomes and remaining LabelGrid requests have accountable dashboard execution/reconciliation.

## Examined-surface inventory and unexamined boundaries

**Examined source surfaces:** distribution direct-submit routes and primary Too Lost handoff; current `labelgrid-service` and Too Lost create/retry/status paths; the separate `labelGridService` implementation was located and searched but not assumed to be the direct-submit dependency; artist creation/discovery/import handoff; transfer job storage, scanner pagination/coverage and transactional import boundaries; social OAuth callback/token persistence, social sync credential consumption, V2 scheduling/worker/provider dispatch and queue entrypoints; notification API preference/SMS confirmation paths, NotificationService, push dispatcher and email-service retry references.

**Current-source corrections respected:** LabelGrid's draft helper is now honest about being a draft; Too Lost has real create/upload/submit code and must not be called a generic stub; Spotify release pagination follows provider cursors; catalog import uses an advisory lock on the transaction connection and per-release savepoints; artist auto-import scans the exact target profile URL rather than a different saved artist; Bandcamp/Audiomack coverage is explicitly partial; OAuth callback persistence intentionally remains publisher-compatible; notification email handling checks provider rejection/message IDs. These are not listed as historical unfixed bugs.

**Verification boundaries:** no live provider contract, app-review/scope approval, redirect registration, sender-domain reputation, SMS sender compliance, webhook receipt, queue-server acknowledgement behavior, or real DSP delivery was exercised. Consequently connection/readiness is not certified, but missing credentials/approvals are not alleged. Production acceptance for the selected playbooks must include authorized end-to-end evidence: connect/refresh/revoke, release create/validate/submit/status reconciliation, publish and remote receipt recovery, catalog coverage proof, and consented email/SMS delivery. No screenshots were needed for this source-only audit; app execution/visual testing was explicitly outside the assignment.

This is a domain report, not certification of the entire repository. Unexamined in depth: all alternate social/advertising automation engines, every route mount/overlap, mobile push vendor configuration, full email deliverability/webhook stack, every distribution update/takedown/smart-link path, all vendor SDK internals and deployment secrets/roles. MaxCore and money internals are excluded; I9 examines only the explicitly requested mounted distributor payout execution boundary, not balance, settlement-accounting or disbursement internals. The expanded review also inspected LabelGrid's configured delivery-status fallback/normalizers and both configured/unconfigured payout branches. No historical report, proposed/cancelled task, or configuration assumption was used as proof of a current defect.