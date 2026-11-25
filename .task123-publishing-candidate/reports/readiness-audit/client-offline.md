# Client, offline and device readiness — 2026-09-19

## Blocker list

Read-only source audit. No application code/configuration changed; no browser, runtime tests, provider calls, database queries, or secret inspection performed. Prior report headings were checked for overlap, then current source was inspected. Task proposals are not evidence. Priorities below apply to the specified release scope, not an assertion that every dormant utility currently affects every page.

### CO-1 — Browser-private state is not bound to the authenticated account

**CONFIRMED defect · P1 · high confidence. Scope:** production browser/PWA account switching, logout and offline reads; queue/draft isolation also blocks enabling those utilities broadly.

**Entrypoint/consumer and evidence:** `client/src/main.tsx:63-74` registers `/sw.js`; `server/index.ts:275-287` serves `client/public` before session middleware, and `vite.config.ts:21-24` also builds from `client`. Thus the relevant worker is **`client/public/sw.js`**, not the separate push-only `public/sw.js`.

**Environment qualification:** the active worker bypasses GET caching on `localhost`, `127.0.0.1`, `*.replit.dev` (including the explicitly listed `*.picard.replit.dev`) through `IS_DEV` and the early fetch return (`client/public/sw.js:28-32,121-128`). This is a production-domain cache defect, not a defect reproduced in a development preview. No runtime reproduction was performed.

* The worker caches successful GET responses even for API paths outside its explicit list: `client/public/sw.js:154-162,207-223`. Those responses enter a shared dynamic cache and can be returned on network failure without TTL. The listed private project/studio/settings/analytics/release paths use URL-only cache keys: `client/public/sw.js:49-59,228-251`. Neither path establishes an account namespace or honors response `no-store` before writing.
* Logout clears the React Query client, but not worker CacheStorage or offline databases: `client/src/components/auth/AuthProvider.tsx:83-92`. Clearing memory is a real existing protection, not complete browser-data erasure.
* Query persistence uses a global database/key (`client/src/lib/idbPersister.ts:7-10,26-48`), mounted outside authentication (`client/src/main.tsx:85-115`), with a denylist rather than an authenticated namespace. This is an additional isolation gate; unlike the worker defect, a specific post-logout query rehydration race was **not** reproduced.
* Other instances of the same unscoped ownership model: queue record/schema/database `client/src/lib/offline/OfflineQueue.ts:17-59`; draft IDs derived only from form ID `client/src/lib/offline/DraftStorage.ts:141-177`; offline cache database/key `client/src/lib/offline/OfflineCache.ts:44,85-88`; background sync entries contain data/time, not owner, and replay with current cookies `client/public/sw.js:300-317,329-339`.

**Impact:** on a shared browser, a subsequent account or logged-out client can receive another account's cached private response during an outage. Old pending work can be submitted under a later session; server rejection/authorization is a separate question, not a protection against disclosure from local caches. No live cross-account exploit or actual private record was accessed.

### CO-2 — The local outbox does not have a recoverable, exclusive scheduler

**CONFIRMED scheduler defect · P1 for existing/future queued actions · high confidence. Scope:** the generic offline scheduler and any pre-existing or subsequently enrolled queued work. **No current mounted mutation producer was established.** Initialization proves scheduler reachability, not that a current page enqueues mutations; this finding does not assert current queued Projects data loss.

**Entrypoint/consumer:** root `OfflineProvider` → `initOfflineSystem` → auto-starting `SyncManager` (`client/src/main.tsx:85`; `client/src/lib/offline/index.ts:32-39`; `client/src/lib/offline/SyncManager.ts:81-96`).

**Producer boundary (also applies to CO-3):** enqueue calls were established only in reusable hooks/facades: `client/src/hooks/useOfflineQueue.ts:139`, `client/src/hooks/useOffline.ts:197`, `client/src/hooks/useSyncQueue.ts:174`, and `client/src/lib/offlineStorage.ts:115,193`. These do not establish a mounted mutation producer. Actual existing queue contents were not inspected. CO-6 separately identifies the live global saving assurance, regardless of whether any actions are queued.

**Evidence/instances of the scheduler state-machine defect:**

* An action is persisted as `syncing` before transmission (`client/src/lib/offline/SyncManager.ts:250-260`), but initialization only opens the stores (`client/src/lib/offline/OfflineQueue.ts:90-118`). Selection reads only pending records (`client/src/lib/offline/OfflineQueue.ts:226-228,367-387`); there is no startup lease expiry/reconciliation for interrupted `syncing` work.
* Exclusivity is only a JS-instance status flag (`client/src/lib/offline/SyncManager.ts:190-195`). Selection and marking are separate operations, with no atomic claim or cross-tab lease. Two tabs can select the same work.
* Failed work becomes immediately pending (`client/src/lib/offline/OfflineQueue.ts:268-279`); the while-loop immediately selects again (`client/src/lib/offline/SyncManager.ts:210-224`), bypassing the intended retry delay (`:301-318`).
* Dependency readiness means “not present among pending actions,” not “completed successfully” (`client/src/lib/offline/OfflineQueue.ts:375-379`). Failed/conflicted/in-flight prerequisites therefore do not reliably block descendants.

**Impact:** stranded changes after restart, duplicate sends, retries exhausted during one transient failure, and child operations attempted without successful prerequisites. Actual server-side duplication depends on the action contract; this finding does not claim all endpoints lack deduplication.

### CO-3 — Background queue acceptance is confused with completed business synchronization

**CONFIRMED transport defect · P1 for existing/future queued actions · high confidence. Scope:** PWA background sync on browsers supporting the Sync API, and local sync-status UX when generic queued work exists. **No current mounted mutation producer was established.** The initialization path is not evidence of a producer, and this finding does not assert current queued Projects data loss.

**Evidence:** on fetch rejection the worker returns HTTP 202 with `{queued:true}` (`client/public/sw.js:277-291`). The foreground manager expects `results/conflicts`, returns `data.results`, and spreads that result in its outer loop (`client/src/lib/offline/SyncManager.ts:255-283,215-216`). A 202 body therefore leaves actions in `syncing` and throws rather than recording a durable handoff.

During later replay, `response.ok` deletes the entire background entry without checking per-action results (`client/public/sw.js:329-340`). The actual batch endpoint returns HTTP-success JSON containing both successful and failed action results (`server/routes/sync.ts:329-348,363-370`); this evidence is about response semantics, **not CG-3 authorization**. The worker then announces completion even with retained/failed work (`client/public/sw.js:342-347`). Independently, foreground `sync-complete` is emitted after processing even if results failed (`client/src/lib/offline/SyncManager.ts:218-230`), while the provider says “All your changes have been saved” (`client/src/components/offline/OfflineProvider.tsx:153-160`).

**Impact:** false saved indicators, discarded background retry records for rejected actions, and inconsistent ownership between two queues. This is distinct from scheduler leasing (CO-2): the transport acknowledgment contract must also be repaired.

### CO-4 — Worker activation discards old application generations before open clients are safe

**CONFIRMED lifecycle defect · P1 · high confidence in code, conditional user impact. Scope:** deployed PWA upgrades with open tabs/offline navigation and lazy chunks.

**Evidence:** install unconditionally calls `skipWaiting`, tolerates failed pre-cache, and activation deletes all other `max-booster-*` caches before claiming clients (`client/public/sw.js:78-113`). There is no open-client build/dirty-state acknowledgment in that path. Route modules are lazy (`client/src/App.tsx:109-166`), so a running old page may need an old chunk after takeover. The app registration only requests an update (`client/src/main.tsx:63-74`); a source search found no client sender for the worker's `PRECACHE_APP_CHUNKS` handler (`client/public/sw.js:626-656`) or client `controllerchange`/`updatefound` recovery flow.

**Impact:** an old tab can lose the cached assets it still needs when it goes offline or a deployment no longer serves old hashes. This is not proof that the current hosting layer deletes old hashes immediately. Activation's deletion predicate also includes the names declared for draft/media caches (`client/public/sw.js:72-73,102-108`); no active writer to those two caches was established, so **actual draft/media loss is not asserted**. IndexedDB draft stores are not deleted by this worker code.

### CO-5 — First-save draft storage dereferences an absent draft

**CONFIRMED defect · P2 for present reachability; P1 before promising draft-backed forms · high confidence. Scope:** reusable draft API and any form enrolled through it, not every current form.

**Evidence:** `getDraft()` returns `undefined` for absent or expired drafts (`client/src/lib/offline/DraftStorage.ts:175-182`); `saveDraft()` correctly makes version conditional but reads `existingDraft.createdAt` unconditionally before writing (`:153-168`). First save, or save following expiry/deletion, throws. Consumer contracts include `client/src/hooks/useDraft.ts:75-94` and the draft facade in `client/src/lib/offlineStorage.ts:131-147`. Current page/component searches did **not** establish a mounted caller of `useDraft`, `useDraftSave`, or the generic save facade; exposing a helper is not evidence of complete form integration.

**Impact:** a new integration cannot save its first recoverable draft. Separately from this bug, root offline wording currently promises saving without those integrations (CO-6). Existing saved records do not prove first-save correctness.

### CO-6 — Global offline assurance exceeds actual persistence capability

**CAPABILITY GAP, with confirmed state-reporting defect · P1 · high confidence. Scope:** all pages under the root offline provider, especially project editing and storage-restricted devices.

**Evidence:** the globally mounted provider promises “Your changes will be saved locally and synced when you reconnect” on every offline event (`client/src/main.tsx:85`; `client/src/components/offline/OfflineProvider.tsx:107-118`). Yet the concrete Projects edit/delete/duplicate contracts are direct requests and error toasts, not a draft or outbox write (`client/src/pages/Projects.tsx:114-210`); the root message is not conditioned on a mutation's enrollment.

Storage initialization failure is only logged (`client/src/components/offline/OfflineProvider.tsx:58-69`). Its online/offline listeners are installed only after `isInitialized` (`:85-86,121-122`), so IndexedDB failure also freezes this provider's initial network state. The separate capability helper reports drafts as fully available offline without checking persistence readiness (`client/src/hooks/useOfflineCapable.ts:49-84`). The query persister silently tolerates storage write failures (`client/src/lib/idbPersister.ts:36-42`); that is acceptable for an expendable query cache, not evidence that edits have been saved.

**Impact:** users can trust a global saving assurance even though a particular form has no durable write path, or local persistence is unavailable. Existing direct mutation error toasts are credited; this is not a claim that every form silently reports success. Repair must implement durable editing behavior and accurate per-operation status, not merely remove offline UI.

### CO-7 — Projects renders a failed initial fetch as an empty account

**CONFIRMED defect · P2 · high confidence. Scope:** authenticated `/projects` initial-load failure/no cached data.

**Evidence:** the page extracts only data/loading, defaults missing data to `[]` (`client/src/pages/Projects.tsx:106-112`), then renders “No projects yet” and an upload action when not loading (`:587-607`). It has no error branch there. Global query error handling already produces a toast (`client/src/lib/queryClient.ts:661-689`), so this is **not** “errors are entirely swallowed”; the persistent page content remains false after the toast.

**Impact:** outages/auth failures look like missing user work, prompt unnecessary uploads, and give no contextual retry on the list. Edit/delete success invalidation and mutation error handling exist (`client/src/pages/Projects.tsx:114-210`) and are not being reported as missing.

### CO-8 — Cross-device, accessible and reconnect-safe critical journeys remain an acceptance gate

**VERIFICATION GATE · P1 for full platform/browser release · high confidence that this audit does not establish acceptance; unknown incidence of additional defects.**

**Evidence anchoring the gate, not proof of universal failure:** route inventory and lazy navigation at `client/src/App.tsx:175-278,560-570`; root persistence and auth ordering at `client/src/main.tsx:85-115`; Projects labeled edit controls and dialogs at `client/src/pages/Projects.tsx:470-548`; reconnect/send behavior at `client/src/hooks/useWebSocket.ts:51-80,92-116`, consumed by `client/src/pages/Analytics.tsx:1589-1615` and `client/src/components/notifications/NotificationCenter.tsx:110-132`. The socket sends only while open; reconnect alone does not establish event replay or missed-update recovery. Analytics already includes polling fallback—do not report that as absent.

**Impact/release scope:** source cannot certify keyboard/screen-reader completion, touch/mobile audio behavior, quota/eviction survival, deployed lazy-route recovery, or reconciliation after disconnect/multiple tabs. No major accessibility barrier was conclusively established in this pass; lack of a browser run is not itself proof of an accessibility defect. Full release requires demonstrated contracts across the unexamined pages below, not an inference from shared components.

## Repair playbooks

Each option below is a genuinely different implementation/validation approach, with preparation, delivery/migration, tests and acceptance. Alternatives can share safety requirements but are not four steps of one proposed fix. Recommendations are provisional; none guarantees first-time success. Execute runtime tests later in an approved environment, not as part of this read-only audit.

### CO-1 alternatives — principal-bound browser data

**A — Account-and-session namespaces (recommended; preserves offline UX, requires migration).**
1. Classify cache/query/draft/outbox data and define a non-secret opaque principal plus session-epoch namespace.
2. Bind the worker and storage services to the authenticated epoch; refuse private reads/replay until identity is established.
3. Migrate only records whose owner is provable; quarantine legacy pending edits for explicit recovery, purge legacy private response caches, and await coordinated logout acknowledgment across tabs.
4. Test account A → logout → account B online/offline, in-flight fetch completion after logout, restart and background replay.
5. Accept only when no A response/edit is readable or replayable as B and rightful-owner pending work remains recoverable.

**B — Public worker cache plus authenticated encrypted local repository (strong privacy boundary, more key management).**
1. Define a public asset allowlist and identify which private entities genuinely need offline access.
2. Move private persistence into an account-keyed encrypted repository; keep worker caching for public immutable assets and route private reads through that repository.
3. Provide account unlock/recovery and key disposal on logout; migrate verified data and invalidate legacy plaintext caches.
4. Test locked-device reads, alternate-account login, interrupted key rotation, offline edit recovery and correct cache-control handling.
5. Accept when private offline access requires the correct unlock identity and public caching still supports the shell; document unrecoverable-key consequences.

**C — Isolated per-account application origins (large hosting/auth cost, strong browser isolation).**
1. Design account-specific origins, cookie boundaries, redirect validation and data-retention policy.
2. Serve the authenticated app/worker/storage only within the assigned account origin while keeping a separate public/login origin.
3. Migrate owned pending data through an authenticated export/import handshake; clear legacy shared-origin private caches only after recovery.
4. Test origin switching, shared-browser login, deep links, logout, offline reopening and cross-origin message rejection.
5. Accept with evidence that a second account cannot address the first origin's private data or replay queue; maintain origin lifecycle operations.

**D — Encrypted session vault with explicit recoverable handoff (privacy-first, less seamless offline relogin).**
1. Specify a vault lifecycle covering active session, locked session, logout and account recovery.
2. Store all private cached responses, query data and edits behind one session-vault API with owner checks; expose only public worker caches directly.
3. Implement a logout barrier that locks writes/replay, exports or preserves owner-encrypted pending work and clears in-memory/session keys.
4. Test logout during save, two tabs, browser crash, revoked session and rightful-owner reauthentication.
5. Accept when locked vault contents never render and legitimate pending edits can be resumed without assigning them to another identity.

### CO-2 alternatives — recoverable exclusive scheduling

**A — Transactional IndexedDB leases (recommended; incremental but careful schema work).**
1. Define action states, owner/lease expiry, `nextAttemptAt`, and durable prerequisite receipts.
2. Atomically select-and-claim actions in one transaction; recover expired leases, schedule by due time and require successful prerequisite receipts.
3. Migrate old syncing records to reconciliation-needed state, not blindly to pending; coordinate with server operation IDs before resending.
4. Test kill-after-claim, two-tab contention, timeout-after-commit, failed prerequisite and retry timing using controlled clocks.
5. Accept when each operation converges to one authoritative outcome, no action is permanently stranded and retries respect due times.

**B — Single worker-owned outbox (one client authority, worker lifecycle complexity).**
1. Define page-to-worker enqueue/status RPC and a versioned durable queue schema.
2. Move scheduling into the worker with atomic persisted claims, recovery timers and prerequisite acknowledgments.
3. Transfer legacy page-queue records transactionally, preserving operation IDs; switch producers only after worker import acknowledgment.
4. Test worker termination/restart, page closure, multiple tabs, unavailable Background Sync and server ambiguity.
5. Accept when foreground and background triggers drive the same recoverable state machine rather than competing schedulers.

**C — Server-coordinated operation journal (strong authoritative recovery, larger backend change).**
1. Define idempotent operation IDs, dependency graph semantics and durable receipt lookup.
2. Keep a local upload journal, but have the server claim/process accepted operations and expose terminal/retryable state.
3. Reconcile old local actions against server receipts before uploading; retain local payloads until durable acceptance is verified.
4. Test repeated uploads, interrupted acknowledgments, parent rejection, reconnect and server processing restart.
5. Accept when server receipts reconstruct every pending outcome and local restart cannot cause extra business effects.

**D — Local-first command log and deterministic materialization (best offline model, highest redesign cost).**
1. Model edits as immutable commands with causal prerequisites and explicit conflict rules.
2. Persist an append-only account-scoped log, project it into UI state and sync commands with stable IDs and acknowledgment cursors.
3. Translate legacy queued payloads into validated commands; quarantine untranslatable records for user recovery.
4. Test duplicate delivery, reordered dependencies, concurrent tabs, crash recovery and bounded backoff.
5. Accept only after projections converge with the server and rejected commands remain visible/recoverable rather than silently disappearing.

### CO-3 alternatives — distinguish queued, acknowledged and applied

**A — Versioned handoff/receipt protocol (recommended; least disruption to dual-context design).**
1. Specify distinct response types for queued handoff, per-action applied results and retryable/conflicted results.
2. Persist a handoff token in foreground records and retain worker entries until every action has an explicit terminal receipt.
3. Add reconciliation for legacy 202-handoff and orphaned syncing records; aggregate UI status from receipts, not HTTP success.
4. Test 202, mixed-result 200, malformed/missing results, token loss and replay while a page is closed.
5. Accept when “saved” means applied, failed actions remain recoverable and both contexts display the same operation outcomes.

**B — Eliminate dual ownership with foreground durable outbox (simpler protocol, background trigger still required).**
1. Identify all worker-intercepted batch sends and define one shared outbox status API.
2. Make foreground scheduling own enqueue/receipt transitions; use the worker only to wake or execute that same repository, never synthesize a second queue.
3. Import worker queue entries into the shared outbox and deduplicate by stable action ID before changing interception.
4. Test no-tab execution, subsequent page reconciliation, partial results and loss of the network after server commit.
5. Accept when one durable record owns each action and neither a transport 202 nor empty result array can mark it applied.

**C — Durable server batch jobs (clear asynchronous contract, needs backend storage).**
1. Define batch job IDs, per-action outcome schema and authenticated polling/events.
2. Return 202 only after durable server acceptance; clients retain upload-pending state when no server receipt exists.
3. Convert local/worker queues into job submissions and migrate legacy entries through operation-ID reconciliation.
4. Test server acceptance followed by client crash, mixed job outcomes, polling outage and job re-delivery.
5. Accept when UI distinguishes local pending, server queued, applied and failed, with actionable recovery for every non-success.

**D — Individually acknowledged command transport (more requests, simpler partial-failure semantics).**
1. Specify a stable idempotency key and terminal acknowledgment for each supported mutation.
2. Replay commands separately, persist each result and retain only retryable/unacknowledged commands.
3. Split legacy batches preserving IDs and dependencies; replace global completion with a summary of individual outcomes.
4. Test duplicate command delivery, authorization rejection, dependency failure and transport timeout after commit.
5. Accept when no successful HTTP envelope can delete an unsuccessful command and saved indicators match durable receipts.

### CO-4 alternatives — safe application generation upgrades

**A — Waiting worker plus dirty-state handshake (recommended; extra update UX).**
1. Define build IDs, client readiness and recoverable dirty-session requirements.
2. Install and verify the new manifest without immediate takeover; prompt/coordinate open clients before activating.
3. Retain previous generation caches until clients acknowledge migration or expire under an explicit recovery policy.
4. Test deploy during unsaved edits, lazy navigation offline, multiple tabs and failed pre-cache.
5. Accept when old clients retain needed chunks and update acceptance restores all committed/drafted work.

**B — Multi-generation worker and asset retention (seamless updates, higher storage cost).**
1. Record the build generation of every controlled client and set bounded retention rules.
2. Route asset requests against their immutable manifest generation; allow worker takeover without deleting live generations.
3. Migrate cache names/indexes and garbage-collect only generations with no clients or recoverable sessions.
4. Test N/N+1 tabs, storage pressure, old lazy chunks and hosting removal of historical assets.
5. Accept when each live build remains complete offline and cache collection cannot invalidate active references.

**C — Stable compatibility worker with versioned app shells (less worker churn, more protocol design).**
1. Separate worker protocol version from UI build version and define compatibility guarantees.
2. Keep a stable worker router, stage complete versioned shells/manifests and atomically select a shell for each navigation.
3. Introduce manifest validation, generation rollback and explicit upgrade migration for persisted drafts.
4. Test incomplete deploys, backward-compatible worker rollout, shell rollback and offline restart.
5. Accept when navigations choose only verified complete shells and old active clients retain their dependencies.

**D — Atomic snapshot update with recoverable session restart (more interruption, clear boundary).**
1. Define a serializable edit/session checkpoint and snapshot completeness criteria.
2. Stage all required new assets, persist/checksum active work and offer a coordinated reload after checkpoint acknowledgment.
3. Restore the session into the new build, keeping the old snapshot until restoration is acknowledged.
4. Test interrupted checkpoint, failed restore, multi-tab refusal and loss of network during restart.
5. Accept when every update either restores the session completely or rolls back to a working old snapshot, without claiming an unverified save.

### CO-5 alternatives — correct first-save draft contract

**A — Safe transactional upsert (recommended; smallest change, last-writer policy needs definition).**
1. Specify timestamp/version behavior for new, existing, deleted and expired drafts.
2. Implement a transaction that reads the draft, safely derives creation time and writes the next version.
3. Validate existing draft shapes on read; preserve valid creation times and explicitly quarantine invalid records.
4. Test first save, second save, expiry, deletion/recreation, quota failure and simultaneous saves.
5. Accept when all new-draft paths persist and reopen correctly, and no save confirmation precedes commit.

**B — Explicit create/update repository methods (clear invariants, more caller changes).**
1. Define separate create and update contracts, including expected version for updates.
2. Implement create with a new timestamp and update with required existing record/version checks.
3. Adapt hooks/facade to select the correct operation and migrate legacy drafts to the versioned schema.
4. Test create collision, update of missing/expired draft, concurrent update and transaction abort.
5. Accept when each invalid transition yields recoverable UI feedback and all valid transitions preserve draft history.

**C — Append-only draft revisions (strong recovery history, storage/compaction overhead).**
1. Define revision IDs, form/account identity and retention limits.
2. Append each committed revision independently; derive creation time from the earliest revision rather than dereferencing an optional current draft.
3. Import existing drafts as initial revisions and provide bounded compaction with recovery safeguards.
4. Test first revision, interrupted append, concurrent revision, expiry and restore of previous content.
5. Accept when newest committed content is recoverable after restart and compaction does not discard the only valid revision.

**D — Replace the draft module with a shared transactional entity repository (larger refactor, removes duplicated persistence rules).**
1. Specify a common account-scoped entity schema for drafts and local edits with create/update invariants.
2. Implement an audited transactional repository and route draft hooks through typed commands.
3. Migrate the legacy draft store with validation and a reversible migration receipt.
4. Test repository create/update invariants plus actual form save/recover/error behavior before enrolling forms.
5. Accept when the replacement passes first-save and migration tests and every caller reports committed versus unsaved accurately.

### CO-6 alternatives — real, operation-specific offline editing

**A — Enroll explicit commands in the durable outbox (recommended; incremental per-feature work).**
1. Inventory each form/mutation and specify offline support, payload validation and conflict policy.
2. Wire supported edits to a durable local command write before optimistic UI; show per-operation pending/applied/failed state.
3. Expose storage readiness independently from connectivity, attach connectivity listeners even if storage fails and recover/export unsaved input on failure.
4. Test Projects create/edit/delete, persistence denial, quota exhaustion, restart and reconnect against the repaired CO-1/2/3 contracts.
5. Accept only enrolled operations as offline-capable and verify actual recovery of user-entered data; unsupported operations must preserve input and explain required online completion.

**B — Local-first entity workspace (broad offline capability, substantial domain migration).**
1. Define local project/form entity schemas and server reconciliation rules.
2. Make edits commit to the local repository first, deriving UI from local state while synchronization applies remotely.
3. Migrate remote caches into validated owned entities and add storage-health/eviction recovery indicators.
4. Test complete offline edit sessions, concurrent remote changes, quota failure and reconnect convergence.
5. Accept when all promised edit journeys survive restart and show unresolved conflicts rather than generic saved assurances.

**C — Durable draft plus explicit online publish (simpler than offline deletion, an extra user step).**
1. Separate “save draft” from “publish/apply/delete” contracts for every critical form.
2. Implement durable local drafts, recovery prompts and validated online publishing; model deletion as a pending intent requiring confirmed application.
3. Add storage capability checks, downloadable recovery and migration of existing drafts before showing saved status.
4. Test new/edited form recovery, rejected publish, account switch and denied storage.
5. Accept when offline input is recoverable and the UI clearly separates locally saved content from server-applied changes.

**D — File-backed portable working documents (user-controlled durability, permission/support cost).**
1. Specify a versioned portable project/form document and supported file APIs with an explicit export fallback.
2. Implement acknowledged file commits, import/recovery and online submission from the same validated document.
3. Migrate draft data into portable documents, retain backups until reopen succeeds and expose actual storage permission state.
4. Test permission revocation, device restart, missing files, malformed imports and online submission failure.
5. Accept when users can reopen their offline work on supported devices and failures preserve an actionable recovery artifact, not just a warning.

### CO-7 alternatives — truthful project list error state

**A — Explicit query-state rendering (recommended; small local change).**
1. Specify loading, genuine empty, error-without-data and stale-data-with-error states.
2. Consume query error/refetch state and render contextual retry/auth recovery; reserve the empty state for a successful empty response.
3. Keep existing project cards during refetch errors with a stale/error banner; preserve mutation feedback.
4. Test initial 401/403/500/offline, successful empty response and failed background refetch.
5. Accept when an outage never states that the account has no projects and retry recovers without duplicate creation.

**B — Shared resource-state component (wider reuse, migration work).**
1. Inventory list pages and agree a typed resource-state API.
2. Implement reusable loading/error/empty/stale states with accessible recovery controls and integrate Projects.
3. Migrate lists deliberately, retaining feature-specific authorization and empty-state copy.
4. Test component state transitions and Projects fetch/mutation integration, including screen-reader announcements.
5. Accept when every migrated list distinguishes absence from inability to load; do not assume unmigrated pages are fixed.

**C — Route-loader error boundary (central navigation recovery, architectural change).**
1. Define typed route-loading errors and return-navigation/input-preservation behavior.
2. Load Projects through a route data boundary with durable error UI and retry/revalidate actions.
3. Adapt the query cache and route shell so successful stale data can render separately from fatal initial failures.
4. Test deep links, session expiry, offline navigation, back/forward and recovery without a full app crash.
5. Accept when loading failures stay at the correct route and successful empty results remain semantically distinct.

**D — Discriminated domain repository results (strong API contract, more layers).**
1. Define `loaded`, `empty`, `unavailable`, `unauthorized` and `stale` repository outcomes.
2. Normalize HTTP/cache results into those outcomes before they reach page rendering.
3. Convert Projects consumers and cached response migration to the domain contract rather than defaulting undefined data to a list.
4. Test malformed payloads, failures, cache-only responses and successful refresh after outage.
5. Accept when all repository outcomes produce truthful UI and recoverable actions, without suppressing global error reporting.

### CO-8 alternatives — establish release acceptance

**A — Risk-ranked cross-browser journey suite (recommended; repeatable regression gate).**
1. Create a route/role/device matrix and explicit create/edit/delete, error, accessibility and reconnect acceptance criteria.
2. Implement browser journeys against an isolated real application stack with controlled failure injection and non-production test accounts.
3. Add deterministic fixtures/migrations for the test environment, keyboard/screen-reader checks and artifact capture; do not put fake data in production paths.
4. Run supported Chromium/Firefox/WebKit and mobile coverage, including storage denial, account switch, offline upgrade and duplicate/reordered events; repair actual failures.
5. Accept only after required matrix cells pass with retained traces and named owners for remaining release exclusions.

**B — Independent manual accessibility/device qualification (strong assistive-tech coverage, less regression automation).**
1. Commission a protocol covering critical routes, supported assistive technologies, mobile input and unreliable networks.
2. Prepare safe test accounts and production-equivalent deployed artifacts, and instrument client outcomes without private payload logging.
3. Execute end-to-end keyboard/screen-reader/device sessions and record reproducible defects with expected contracts.
4. Implement and retest each confirmed barrier, including storage/reconnect recovery and destructive action confirmation.
5. Accept with signed journey evidence and an explicit supported-device matrix; schedule regression checks for subsequent releases.

**C — Model-based state-transition qualification (best concurrency depth, greater setup cost).**
1. Model auth, navigation, edits, persistence, socket reconnect and worker generations as explicit states/invariants.
2. Build a harness that drives real browser clients through generated transitions and checks server/local convergence.
3. Seed migration/legacy-storage states and minimized failure sequences; connect accessibility checks to each reachable UI state.
4. Exercise crashes, reordered events, multiple tabs, storage eviction and user switching; implement fixes for violated invariants.
5. Accept when defined invariants hold across supported engines and a separate human assistive-tech pass confirms critical workflows.

**D — Controlled beta with instrumented acceptance and specialist audit (real device diversity, slower and requires strong containment).**
1. Define opt-in beta scope, privacy-safe telemetry, stop criteria and a route/device acceptance checklist before broad release.
2. Deploy the candidate to a controlled cohort after mandatory isolation/data-loss fixes, with real recoverable workflows and responsive support.
3. Collect explicit success/failure evidence for critical actions and pair it with specialist accessibility sessions; migrate/fix reproducible defects.
4. Re-run affected journeys on impacted devices and validate recovery of any interrupted work without exposing private payloads.
5. Accept broad release only after the checklist and defect retests pass; usage counts or absence of complaints are not substitutes for evidence.

## Examined-surface inventory and boundaries

### Examined source and functional contracts

* **Root registration/routing:** `main.tsx`, `App.tsx`, worker source selection in `server/index.ts`/`vite.config.ts`, both worker files. Contract: install/open/update/deep-link with compatible assets; development-domain worker caching bypass is present, so a development preview would not prove production cache behavior.
* **Worker data paths:** private/public response caches, fallback reads, batch interception/replay, cache cleanup and update messages. Push URL sanitization is present and is not reported as a missing protection. Full push permission/provider delivery was not audited.
* **Persistence:** IndexedDB query adapter, query persistence filter, auth logout, offline queue/cache/draft stores, initialization and provider status, draft/sync hooks and facade. Contract: identity isolation, durable commit acknowledgment, restart recovery and truthful capability/error status.
* **Projects (partial page audit):** fetch/list/error-state rendering, edit/delete/duplicate request wiring and invalidation, sampled labeled edit form. Contract: list truthfulness; successful operations reconcile visible state; failures preserve actionable feedback. Upload/audio/create internals were not traced end to end.
* **Realtime (sampled):** generic socket hook, Analytics reconnect consumer, NotificationCenter invalidation consumer. Contract: reconnect/subscription and eventual authoritative state after missed events. Collaboration server method/authorization is already CG-4 and excluded here; no realtime end-to-end convergence certification is made.
* **Navigation/errors/accessibility (sampled):** lazy routes, root/route error boundaries, global query/mutation error feedback, Projects form/loading semantics. Existing error boundaries, labeled controls and error toasts are credited; their presence alone does not establish functional accessibility.
* Existing blocker lists in security, deployment, data-runtime, commerce, integrations, AI-media, product-autonomous, scanners and coverage-gaps were reviewed for overlap. This report does not repeat CG-3 offline server authorization, CG-4 collaboration storage-method mismatch, CG-5 modulation persistence, themes/preference race, payment/provider defects or deployment artifact findings. The legacy root worker is not confused with the active client worker.

### Client pages not substantively audited in this report

The route inventory at `client/src/App.tsx:175-278` is a surface map, not a pass result. The following **source pages were inventoried but not audited end to end here** (other domain reports may cover their backend contracts):

* **Account/onboarding/purchase:** Login, Register, RegisterPayment, RegisterSuccess, ForgotPassword, ResetPassword, Onboarding, Pricing, Subscribe, Verification, Settings.
* **Creation/business:** Studio, Dashboard, SimplifiedDashboard, Marketplace, SocialMedia, Advertisement, Distribution, Royalties, Contracts, Workspaces, Collaborations, CareerCoach, Assistant, ReleaseCountdown, Invoices, HandleLink, MusicWorkflowAutomations, Shows, ShowPage, FanHub, FanMemberships, ARIntelligence, OutreachCRM, MerchStore, PressKit, PlaylistPitching, Publishing, SyncLicensing, ProducerProfilePage, Storefront, PublicPressKit, VideoGeneratorPage.
* **Communication/analytics:** Notifications, NotificationDetail, Analytics beyond the socket sample; every `pages/analytics` module: AIDashboard, ARDiscoveryPanel, AudienceInsights, CrossPlatformComparison, ExportAnalytics, GlobalRankingDashboard, HistoricalAnalyticsView, NaturalLanguageQuery, PlaylistJourneysVisualization, PlaylistTracking, RevenueAnalytics, StreamingAnalytics.
* **Administration/developer:** Admin, AdminAutonomy, AdminDashboard, DeveloperApi, API, DesktopApp; `pages/admin` AuditLog, ContentSampler, KYCReview, SecurityDashboard, SupportDashboard, SupportTicketDetail, TrainingDashboard.
* **Public/help/legal/navigation:** About, Blog, BlogPost, DMCA, Documentation, Features, Help, Landing, Privacy, SecurityPage, SoloFounderStory, Terms, not-found. File existence does not mean every page is a mounted route.

Required functional contracts for those unexamined surfaces: role-correct entry/deep links; initial load versus genuinely empty versus failure; validated create/edit/delete with pending/error/confirmation state; preserved unsaved input; no duplicate effects on retry; authoritative refresh after mutation/reconnect; identity-isolated recovery; keyboard/touch/assistive-tech completion; narrow-screen/zoom operation; explicit permissions and storage failures. Page-specific backend/provider acceptance belongs to its domain report, not this client-only sampling.

### Unexamined boundaries / evidence still required

No runtime reproduction, browser console inspection, screenshot, installed-app update, native/Electron/Capacitor validation, audio device permission test, real quota/eviction test, assistive-technology session, or multi-client race experiment was performed. No live records were inspected. CSP/cookie/header effectiveness, backend idempotency coverage, installed-user cache contents and actual hosting retention of old chunks remain outside this pass. The generic queue/draft hooks are present but broad mounted form enrollment was not established; findings explicitly limit their present release scope. This is an evidence-backed blocker inventory plus release gates, not a claim that the entire platform has passed functional acceptance.