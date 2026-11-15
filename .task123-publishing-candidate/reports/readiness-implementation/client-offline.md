# Client/offline implementation — 2026-09-19

## Final disposition and release gates

Implemented the recommended incremental account-scoped persistence, transactional scheduling/receipts, coordinated worker upgrade and enrolled-command approach. This report supersedes the first implementation pass. The follow-up explicitly authorized `client/src/main.tsx` and unmodified `server/routes/sync.ts`; checked the latter's diff before taking ownership. Did not edit `offline.ts`, App.tsx, shared/schema.ts, server/routes.ts, server/index.ts, server/storage.ts, package/lock files or another domain's report.

**Not a production certification.** The application stayed stopped. No workflow, live DB/provider request, dependency install, schema application, publishing, full typecheck or full suite was run.

**Mandatory gates:**

1. Review/apply **`migrations/0094_client_sync_receipts.sql`** through the authorized database deployment process before releasing the new sync protocol. It is additive and **NOT APPLIED** to shared Neon. No pre-existing generic owner-bound operation-receipt table was established in the examined schema; the focused repository uses SQL rather than requiring a shared/schema.ts edit. Missing migration produces explicit unavailable errors and retains local commands, never synthetic success.
2. Native-browser multi-tab/worker/IndexedDB acceptance and real PostgreSQL commit/rollback/concurrency tests remain required. Tests below mock boundaries; they do not establish those platform semantics.
3. Legacy ownerless drafts/outboxes/studio state cannot be automatically assigned to a user. They remain quarantined at their original keys, with no new runtime reader/replay path. A proof-of-owner recovery/export policy is still needed; do not destroy them or show them to the next account. This is a genuine migration blocker, not an implemented recovery feature.
4. Deploy with all legacy, nonparticipating app tabs closed. The account-lock protocol coordinates upgraded tabs/workers; old JavaScript cannot retroactively acknowledge cleanup. Legacy worker cache authentication is additionally prevented with a never-reused auth-check URL.
5. The safe multi-tab protocol requires Web Locks and BroadcastChannel. Unsupported browser versions receive an explicit error rather than an unsafe account switch; certify the supported device/browser matrix before release. Cold offline startup does not authenticate from a cached `/auth/me` response.

## Audit-by-audit implementation

### CO-1 — implementation wired; legacy recovery/device acceptance PARTIAL

* Queue, draft and response-cache IndexedDB names are account-specific. Anonymous access is rejected. Database wrappers fence every asynchronous read/write/list/stat/transaction result by owner and epoch; initialization is checked for ownership races.
* `main.tsx` now mounts **QueryClientProvider → AuthProvider → AccountPersistenceBoundary → TooltipProvider/App**. Authentication is not restored from persistence. The inner boundary only restores after verified identity, remounts on owner/epoch changes, captures owner before throttling, and cancels its writer on identity changes. Restored auth and mutation state are excluded. The legacy global persister is no longer mounted.
* Discovered studio Zustand persistence while checking “all stores.” Minimal persistence-only edits in `studioStore.ts` and `studioLayoutStore.ts` use an account-keyed storage adapter, never hydrate legacy ownerless keys, reset in-memory project/tracks/master/history/layout on identity transitions, and rehydrate only the verified owner. Resetting memory cannot overwrite the next owner's saved work. No studio editing/engine implementation was rewritten.
* `accountCoordinator.ts` holds shared Web Locks while a tab can use an account. Login/register/logout broadcast prepare messages, await each participating tab's actual cleanup/release, and require the exclusive account lock before changing cookies. Frozen/non-acking tabs block and time out rather than being assumed clean. Worker handoff/replay uses the same shared lock. A second cleanup sweep under exclusive ownership prevents background writes behind logout cleanup.
* Auth cleanup locks queries, cancels requests/query memory, resets studio memory, stops draft timers, closes queue/draft/cache connections, purges query storage and current response-cache data, deletes legacy expendable response DB and private worker cache families including handoffs/account marker, and clears the in-memory auth token. Failures do not release a tab's privacy lease. Owner-scoped pending drafts/commands/studio work remain recoverable, not reassigned or erased.
* The worker caches only allowlisted public assets. Private API/media GETs bypass CacheStorage. Account marker creation verifies `/api/auth/me`; new handoffs/replay are owner-bound and server-enforced. Legacy background entries are never replayed.
* Hooks' private cached results and repository operations are epoch-guarded; App subtree remounts with the persistence boundary. Global browser privacy is not a claim of encryption or protection against same-origin malicious JavaScript/devtools.

**Remaining:** owner-verifiable legacy recovery/export, old-tab rollout and actual browser/device acceptance. “All stores” here covers inventoried browser persistence: query IDB, offline queue/conflict IDB, draft IDB, response-cache IDB/memory, worker private caches/handoffs and studio/layout Zustand storage. It is not a certification of every unrelated third-party/browser storage surface.

### CO-2 — implemented; migration/native concurrency acceptance PENDING

`getNextBatch` selects and marks claims in one IndexedDB readwrite transaction. It respects durable `nextAttemptAt`, keeps dependency receipts, requires a completed prerequisite and prevents another scheduler from claiming the same record. Expired/legacy syncing leases become reconciliation-needed rather than blind resends. Forced sync uses the same claim path; due retries survive restart.

Reconciliation is now real: the mounted SyncManager calls `/api/sync/receipts`, applies authoritative receipts, and resubmits the **same immutable ID/payload** only on authoritative absence. IDs/types/payloads/metadata cannot be mutated in place. Terminal rejections are not reset by retry-all. Unknown transport outcomes remain recoverable during receipt-service outages, with bounded retry scheduling.

`clientSyncReceipts.ts` places mutation and receipt in the same PostgreSQL transaction, serializes owner+operation with a transaction-scoped advisory lock, and rejects reuse of an ID with a different payload hash. The owner+ID primary key is an additional durable constraint. No mock storage or nontransactional fallback is used in production.

### CO-3 — implemented versioned handoff and receipts; migration/browser acceptance PENDING

The worker creates an owner-bound durable handoff **before** returning 202, with a token and exact operation IDs. SyncManager validates/records the handoff instead of treating it as applied. Worker replay validates every terminal receipt, retains entries on malformed/missing/unavailable results, and notifies pages that authoritative receipts are available—not that every change succeeded. Rejected/conflicted outcomes remain queryable in the server receipt ledger when transport entries are removed.

Foreground validates protocol, owner, action coverage, receipt shape/outcome and canonical SHA-256 payload fingerprint. Reconciliation handles mixed commit/transport failures without guessing. Sync UI distinguishes handed-off/pending, applied, rejected and conflicted states; empty passes do not announce saved changes.

### CO-4 — coordinated waiting-worker implementation; deployment acceptance PARTIAL

Install requires successful public precache; uncoordinated skipWaiting/claim is removed. Existing static generations and draft/media caches are retained. The main registration watches waiting/installing workers and mounts a visible update prompt.

The waiting worker enumerates every live window, issues a nonce/build-aware preparation request, requires explicit ready acknowledgments, rechecks the window set and persists approval before activating. The client prompts to save/draft first; a ready tab becomes inert behind an accessible portal overlay until reload or cancellation. Hidden/nonready tabs postpone the update (save and close them, then retry). Failed/expired preparation leaves the current generation active. Only approved activation claims clients; only prepared tabs reload on controller change.

**Remaining:** production hashed-chunk manifest completeness, retention/GC policy and deploy-during-edit/native multi-tab acceptance. No claim that an unfetched lazy chunk is magically available offline; no old static-generation deletion was introduced.

### CO-5 — ADDRESSED; native storage acceptance pending

Fixed missing-draft `createdAt` dereference. Projects mounts real draft save/recovery: manual durable save with status; recovery before editing; local save before server submission; failed requests preserve form/draft; confirmed updates remove only the appropriate old draft. Storage denial does not falsely report local saving. First save, later version, expiry and deletion→first-save paths are isolated-test covered.

### CO-6 — enrolled edit/delete paths implemented; broader offline acceptance PARTIAL

Projects edits and confirmed deletions now enqueue real versioned commands before showing pending status, attempt sync online, survive offline/restart, and keep server-applied status separate. Projects renders PendingChangesPanel and ConflictResolver. Project update/delete handlers check owner and expected `updatedAt` under row locks; conflict receipts carry the actual current server row. Reviewed conflict resolution atomically replaces the conflicted command with a fresh ID/current revision and rewires dependent operations. The old ACK-only resolution endpoint no longer invents success.

The server delete transaction performs the existing track/split/project deletion semantics plus its receipt. Track handlers validate ownership against the actual project catalog(s) instead of updating arbitrary track IDs. Existing fake draft/audio/unknown-action ACKs are explicit rejections; this is **not** credited as implementing draft upload/audio upload.

Network listeners are independent of IDB availability; readiness/statistics reset at identity boundaries. Storage failure is visible. Draft capability depends on initialized storage. Global messages promise local durability only where the operation actually achieved it.

**Scope:** file upload/create and duplication retain their existing real online endpoints; no fake local file upload or automatic duplicate replay was introduced. Their network failures remain explicit. Cold offline authentication, offline media-file creation, storage eviction/quota behavior and comprehensive command enrollment remain release/product gates. Existing online request paths remain available when local persistence cannot be used; that is real online behavior, not a fabricated offline success.

### CO-7 — ADDRESSED; browser visual acceptance pending

Projects renders a persistent accessible error/retry branch on initial list failure; it cannot render “No projects yet” without a successful empty result. Failed refresh retains and labels the prior list. Existing loading/success-empty UX remains.

### CO-8 — BLOCKED verification gate

No running app, device, keyboard/screen-reader, mobile audio, deployed worker, live PostgreSQL or provider journey was exercised. Source and isolated tests cannot certify those journeys. App stayed stopped as required.

### PA-1 — account-authoritative theme implementation wired; browser acceptance pending

AuthProvider subscribes to preferences and feeds ThemeProvider. Settings and theme toggle share its value/setter and disable appearance changes while saving. Authenticated writes use the real account endpoint and apply after acknowledgment; failures are visible. A loaded account with no theme migrates a valid local/default theme once; existing account values win. Anonymous appearance remains device-local, logout restores it, boot/provider defaults agree, denied localStorage is tolerated for presentation, and system media-query updates remain live. Epoch checks prevent an old-account response changing the new account's theme.

### PA-2 — ADDRESSED at client transport/state boundary

Preference/theme writes share an ordered transport, including different keys in the server's merged preferences object. Field versions and confirmed values prevent stale whole-form rollback; same-key transport cannot reorder; hydration is held during outstanding writes. Failure releases the next queued write, but identity changes reject both stale completion and queued old-account writes. Mounted React/refetch interaction acceptance remains required.

## Exact protocol and integration ownership

No further `main.tsx` patch is required; provider ordering and worker handoff are implemented. No App.tsx change required.

`server/routes/sync.ts` remains registered at existing `/api/sync` by server/routes.ts. No registration patch was needed. CG-3's `/api/offline` remains a separate owner/contract; no integration with or changes to offline.ts were assumed.

* `POST /api/sync/batch`: `{ protocolVersion: 1, ownerId, actions: [{id,type,payload,metadata?}] }`, 1–50 actions, unique IDs, max ID length 160. Owner must match authenticated session. Project update/delete payloads include projectId and ISO/null expectedUpdatedAt; project update includes changes and catalog flag.
* Applied batch: `{protocolVersion:1,ownerId,results,conflicts,summary}`. Every result is a durable receipt `{protocolVersion:1,ownerId,actionId,payloadHash,receipt:true,success,outcome:"applied"|"rejected"|"conflict",retryable:false,error?,serverResponse?}`. Canonical JSON key ordering and SHA-256 bind type/payload/metadata. Terminal receipts are immutable.
* `POST /api/sync/receipts`: `{protocolVersion:1,ownerId,ids}` → `{protocolVersion:1,ownerId,receipts,missing}`. Missing is authoritative database absence, not an inferred network result. Failed database access is 503, never “missing.”
* Worker-only 202: `{protocolVersion:1,state:"handed-off",ownerId,handoffId,actionIds}` after durable CacheStorage write. It is not an applied receipt.
* Database/transaction failures may occur after earlier batch operations committed: return 503; reconcile all IDs. The atomic ledger permits safe same-ID retry even when worker/page race.
* Conflicts: user reviews local/server payload, chooses server/discard or a new command with the current version. No mutation to the old operation's identity/payload.
* Migration **0094_client_sync_receipts** must be applied before rollout. Do not expire receipts on a time-based TTL: deleting receipts reopens duplicate side effects. Retention requires a future explicit protocol epoch/retirement policy.

## Actual validation

Focused command (no inherited secrets):

`env -i PATH="$PATH" HOME=/tmp node --test tests/unit/client-offline-readiness.test.mjs tests/unit/client-account-boundary.test.mjs tests/unit/client-sync-receipts.test.mjs tests/unit/client-worker-handoff.test.mjs`

Tests cover real production algorithms with isolated boundaries:

* private worker GET exclusion, legacy replay/uncoordinated activation rejection;
* theme boot default/system/invalid/localStorage-denied behavior;
* draft first save/version/expiry/delete, account isolation/anonymous rejection;
* transactional queue selection, dependency receipts, no re-claim, due timing and expired lease handling;
* serialized preferences with failed writes and identity changes;
* two independent account-coordinator modules, real cleanup waits and background shared-lock exclusion;
* owner-captured persistence throttling, cancellation, rightful-owner restoration and auth exclusion;
* studio localStorage owner isolation, memory-reset write suppression and legacy quarantine;
* receipt repository replay/deduplication, cross-owner isolation, changed-payload rejection, modeled transaction rollback and matching client/server fingerprints;
* durable handoff, mixed terminal receipts, malformed-receipt retention, quota rejection and waiting-worker acknowledgment/activation;
* parse-only checks of changed client and server TS/TSX modules.

Latest run: **12/12 tests passed**. `env -i PATH="$PATH" node --check client/public/sw.js` and scoped `git diff --check` also passed.

Native IndexedDB/Web Locks/service-worker behavior and real PostgreSQL isolation/rollback are **not** proven by the fixtures. They are test boundaries, never production fallback implementations. No full suite/typecheck was run.