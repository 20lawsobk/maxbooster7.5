# Cross-platform coverage gaps — 2026-09-19

## Blocker list

Read-only source breadth pass, supplementary to the seven domain reports in this directory. No application execution, tests, workflow operations, configuration changes, secret inspection, database queries or provider calls were performed. Only this report was written. “Confirmed” refers to source behavior, not a witnessed production incident. Mounted APIs count as release surfaces even when no current page consumer was found; that boundary is explicit below.

| ID | Classification | Priority / affected release scope | Finding | Confidence |
|---|---|---|---|---|
| CG-1 | CAPABILITY GAP | P1 for admin-issued API credentials; not a blocker for session login | Admin token issue and revoke actions explicitly return 501. | High |
| CG-2 | CONFIRMED defect | P1 for the generic export API and consumers promising downloadable artifacts | Timer-driven exports announce completion without rendering; downloads return JSON acknowledgements, not files. | High |
| CG-3 | CONFIRMED defect | P1 for deployments exposing the mounted offline API | Offline project/cache operations authenticate the caller but do not consistently authorize the target or scope global operations to that caller. | High |
| CG-4 | CONFIRMED defect | P1 for the initialized studio collaboration WebSocket endpoint | Project access calls a nonexistent storage method and rejects legitimate connections. | High |
| CG-5 | CONFIRMED defect | P1 for durable modulation-routing API; P2 for exploratory/session-only controls | Modulation routing is acknowledged into a capped process-local map; first reads also dereference missing state. | High |

No independent P0 is asserted. These five findings supplement—not replace—the other audits. In particular, payments, session invalidation, backup durability, predictive-model readiness and social-delivery recovery remain owned by their existing reports. Task proposals, old comments and cancelled tasks were not treated as evidence.

### CG-1 — Admin credential lifecycle has no implementation behind its controls

**Entrypoint/consumer:** `/admin/dashboard` is routed at `client/src/App.tsx:230`. Its issue mutation calls `/api/auth/token` at `client/src/pages/AdminDashboard.tsx:1664`; revoke calls `/api/auth/token/revoke` at `:1701-1717`. Both handlers are directly registered in `server/routes.ts:2268-2286`, check the admin role, and return 501. This is a capability gap, not a claim that the current UI falsely announces success: it checks failed responses and shows errors (`client/src/pages/AdminDashboard.tsx:1693-1698,1713-1730`).

**Impact:** operators cannot issue/revoke credentials through these controls. The comments claiming there is no Bearer path are not adopted as platform-wide truth: the repository also contains developer API keys and JWT services. The confirmed fact is that these specific controls are not wired to a credential lifecycle. Do not conflate this with SEC-01's session-revocation defect.

### CG-2 — Generic export completion is synthetic, and download endpoints do not deliver artifacts

**Entrypoint:** lazy route registration exposes `/api/export` (`server/routes.ts:7719-7721`). The generic audio/data/batch/analytics/chart/bulk/mastered/stems handlers converge on `simulateExportProgress` (`server/routes/export.ts:147-210`; call sites `:272,399,458,925,974,1071,1172,1266,1439,1527`). The function advances a timer, labels effects/encoding stages, calculates an estimated file size, and records “completed,” without an encoder or artifact write.

**Consumers:** generic export components call these endpoints (`client/src/components/export/ExportDialog.tsx:244-245`, `BulkExportManager.tsx:456,520,553,594`). Their presence is not proof that every studio export dialog uses this pipeline: separate studio/stem dialogs exist. The blocker applies independently to the mounted generic API; this pass did not establish a current routed page importing every generic export component.

**Terminal behavior:** `/download/:jobId` checks ownership and completion, then returns JSON saying “Download initiated” (`server/routes/export.ts:839-871`); ZIP download similarly returns JSON (`:1292-1319`). All named job families therefore share the same defective completion contract. In-memory job/history storage (`:67-69`) also loses receipts across restart; cleanup checks a `createdAt` property absent from `ExportJob`, which instead has `startTime` (`:17-45,74-86`), making live jobs eligible for cleanup. These are parts of the same incomplete export-job lifecycle, not separate duplicate findings.

**Impact:** clients can receive success and misleading completion/history/file sizes without the requested audio, stems, report or archive. This is separate from AM-6's MaxCore audio-render retry behavior and D1's database backup addressing.

### CG-3 — Offline API project isolation is incomplete

**Entrypoint:** `/api/offline` is mounted at `server/routes.ts:7390-7392`; handlers use `requireAuth`. Creating a cache passes the current user (`server/routes/offline.ts:75-83`), but the service fetches project, tracks and clips by project ID alone (`server/services/offlineModeService.ts:306-327`) and assembles their data (`:356-361`). Possession of another project's ID is not authorization.

**All identified instances of this root cause:** cache creation above; cache deletion (`server/routes/offline.ts:107-113`); cache detail and existence (`:147-174`); per-project and global sync (`:182-200`); global settings (`:217-235`); global cache clearing/cleanup (`:251-268`); and local/server change markers (`:320-330`). Those handlers either pass only the target ID or invoke a singleton-wide operation without user scope. The service's detail/existence methods simply access a project-keyed map (`server/services/offlineModeService.ts:433-445`), whereas only list explicitly filters user ID (`:437-440`). Sync likewise accepts only a project ID (`:447-449`); uncache deletes the shared project entry and files (`:420-429`).

**Impact:** an authenticated user knowing a project ID can request another project's contents be cached and retrieve cached project data; shared cache operations can disrupt other users' offline preparation. No UUID guessing success or production exploitation is asserted. This finding concerns the server API, not an assertion that IndexedDB in one browser is readable by another browser. No direct client consumer of these exact offline REST routes was established in this pass; they remain exposed authenticated API surfaces. Browser PWA queue durability is a separate, incompletely examined boundary.

### CG-4 — Studio WebSocket project authorization calls the wrong storage contract

**Entrypoint:** server bootstrap initializes realtime collaboration (`server/index.ts:840-849`); realtime initialization calls `studioCollabServer.initialize` (`server/realtime/index.ts:289-308`), whose default upgrade path is `/ws/studio` (`server/realtime/studioCollabServer.ts:82`). Upgrade requests authenticate, then require `checkProjectAccess`, returning 403 when it returns false (`:111-149`).

**Failure:** `checkProjectAccess` calls `(storage as any)?.getStudioProject(projectId)` (`server/realtime/studioCollabServer.ts:305-310`). Optional chaining is on the storage object, not on the method: a defined object with no such method throws. The catch converts this to false (`:329-335`). The imported storage is the concrete `DatabaseStorage` singleton (`server/storage.ts:68,3669`); repository search finds no implementation of `getStudioProject` or `getProjectCollaborators` in that storage. The other `getStudioProject` references are service interface/call sites, not an implementation (`server/services/studioService.ts:133,215,312,601`). Thus even the owner check after the call cannot run.

**Impact:** correctly authenticated studio collaboration connections are rejected by this endpoint. No current browser consumer of `/ws/studio` was found in the breadth search, so this is explicitly an initialized backend capability blocker, not a claim that every visible collaboration page fails. The separate `/api/collaboration` comments/invites and `/api/collaborations` pages were not treated as equivalent consumers.

### CG-5 — Modulation routing has no durable state contract

**Entrypoint:** `/api/studio/plugins` is mounted at `server/routes.ts:7343-7345`. Its modulation GET checks project ownership, then loads `modulationConfigs.get(key)` and dereferences `config.routings` without guarding missing state (`server/routes/studioPlugins.ts:878-899`). An authorized first read therefore throws and becomes an error response.

**Write/read chain:** `modulationConfigs` is a module-local map (`server/routes/studioPlugins.ts:605`); successful POST only writes that map and applies oldest-entry eviction (`:979-985`). The cap deletes state at 10,000 keys (`:607-613`). DELETE modifies only that map (`:1024-1031`). Restart, worker handoff or eviction loses previously acknowledged routings. Project-owner authorization is present here and is not the reported defect.

**Impact/scope:** API clients cannot reliably save/reload routing settings, and first-time GET fails. No current frontend reference to `/modulation-matrix` was found, so this must not be described as a confirmed failure of every plugin browser. The catalog itself is backed by actual definitions (`server/services/pluginHostService.ts:66-79`) and is consumed by real browser components (`client/src/components/studio/FlowStatePluginBrowser.tsx:215-222`, `StudioBrowser.tsx:52-56`); catalog existence does not establish durable routing.

## Repair playbooks

Each A–D block is an independent implementation alternative, not a phase of another option. Each has five preparation-to-acceptance steps. Tests below are proposed work, not executed evidence. Recommendations balance current architecture and scope; none promises a guaranteed first-time fix.

### CG-1 — Implement a real admin credential lifecycle

**A — Adapt the existing developer-key subsystem (recommended).** Lowest duplication, but requires proving that its principal/scopes fit admin delegation.
1. Inventory the developer-key schema, verifiers and intended admin delegation rules; define allowed subjects/scopes and expiry.
2. Add an admin-authorized adapter that issues random keys, persists only secure verifiers, and returns the secret once.
3. Wire both existing UI actions to the adapter; migrate any legitimate historical credential metadata and record audit events without secrets.
4. Test issuance, least privilege, expiry, wrong actor, revoked credentials and cache invalidation across workers.
5. Accept only after a newly issued credential performs its allowed request and immediately fails after revocation on every worker.

**B — Build dedicated opaque service tokens.** Strong server-side control; extra schema and verification work.
1. Specify token principals, delegation policy, rotation and audit retention.
2. Migrate a token table with hashed random secrets, expiry, scope and revocation metadata; implement atomic issuance/revocation.
3. Add a typed request authenticator and connect both UI mutations to it with one-time secret display.
4. Exercise replay, lost responses, rotation, DB outages and cross-tenant authorization against staging persistence.
5. Accept a complete issue/use/rotate/revoke lifecycle with no plaintext credential at rest.

**C — Short-lived signed tokens plus durable revocation state.** Efficient verification; signing-key and revocation-cache complexity.
1. Define issuer/audience, subject, scope, maximum TTL, signing-key rotation and revocation latency.
2. Implement signed issuance and a durable JTI/subject-version registry, including secure signing-key custody.
3. Enforce signature, audience, expiry and revocation in consumers; migrate admin controls to this service.
4. Test old signing keys, clock skew, expired tokens, revoked JTIs and cache/backend outages.
5. Accept only when allowed requests succeed and revoked credentials fail within the documented bounded interval across replicas.

**D — Delegate credentials to an OAuth authorization server.** Mature lifecycle support; external dependency and operational cost.
1. Select an authorization server and document client-credentials/token-exchange requirements and revocation semantics.
2. Configure scoped clients and protected resources, with admin approval and managed secret custody.
3. Implement provisioning/revocation adapters and introspection or bounded-TTL verification; migrate dashboard actions and audit identifiers.
4. Test provider unavailability, insufficient scope, rotation and revoked credentials against a non-production tenant.
5. Accept after end-to-end admin provisioning, authorized API use and revocation meet the security/latency contract.

### CG-2 — Produce actual export artifacts

**A — Durable application export jobs (recommended).** Reuses the application and storage stack; requires worker capacity and recovery design.
1. Define supported formats, ownership, real render/report inputs and immutable job/result states for every named export family.
2. Migrate durable job/history tables and queue handoff; replace timer stages with encoder/report/archive workers and cancellation.
3. Store completed artifacts with checksums/actual sizes; stream or sign authorized downloads only after durable commit; fix timestamp-based retention.
4. Test each format's bytes/decodability, stems alignment, report records, ZIP contents, restart, retry and multi-worker cancellation.
5. Accept only when real source changes affect the artifact, downloads contain the declared MIME bytes, and job recovery preserves truthful status.

**B — Dedicated rendering/export service.** Isolates expensive processing; adds network/API/versioning obligations.
1. Define versioned source manifests and a renderer contract for audio, data and archive families.
2. Implement a separate worker service with durable job IDs, idempotent submission and artifact storage.
3. Migrate API handlers to submit manifests and reconcile callbacks/polling; replace synthetic history and download responses.
4. Test callback replay, renderer outages, malformed source manifests and artifact integrity across all formats.
5. Accept with durable receipts tying every completed job to a retrievable verified artifact and observable failures.

**C — Browser-side rendering/packaging with server artifact commit.** Reduces server rendering load; device memory/performance becomes a constraint.
1. Define browser-supported formats and memory limits, with server-side authorization for every source asset.
2. Implement actual Web Audio/WASM rendering and browser report/archive generation using real authorized data.
3. Upload results through a checksummed, resumable artifact-commit endpoint; migrate job/history/download contracts to committed artifacts.
4. Test browser interruption, large projects, unsupported codecs, tampered metadata and resuming upload without false completion.
5. Accept after cross-browser outputs decode correctly and completion remains absent until the server verifies stored bytes.

**D — Synchronous streaming exports for bounded workloads.** Simpler recovery for small jobs; needs strict size/time limits and backpressure.
1. Characterize workloads and define a supported bounded streaming contract for each format rather than simulated background jobs.
2. Implement authorized on-demand encoders, report serializers and ZIP streams with backpressure and explicit errors.
3. Migrate clients from synthetic polling to real response streams; persist actual completion receipts and remove incompatible historical success records.
4. Test stream aborts, encoder failure, resource limits, MIME/content integrity and multi-user isolation.
5. Accept only when every successful response is a valid artifact and oversized work receives an explicit actionable limit response.

### CG-3 — Enforce offline API ownership and operation scope

**A — Actor-aware offline service (recommended).** Central invariant protects future callers; requires updating every listed method.
1. Define owner/collaborator roles for cache, read, sync, change, settings and cleanup; enumerate all callers.
2. Change service signatures to require an actor and authorize database resources before reading or mutating them.
3. Migrate cache keys/index/settings to user/workspace scope, quarantine unowned legacy entries, and scope bulk operations.
4. Test two users with known project IDs, every listed operation, role revocation and concurrent cache writes.
5. Accept when forbidden reads/mutations fail without side effects and each user's clear/sync/settings affect only authorized state.

**B — Central resource-policy middleware and scoped repositories.** Reusable across APIs; every entrypoint must use the policy boundary.
1. Define a shared project-operation policy and inventory route/resource parameters including global operations.
2. Implement middleware resolving authorized project sets and per-request scoped repositories.
3. Replace raw singleton access in offline routes with those repositories; migrate persisted index/settings namespaces.
4. Test policy bypasses, missing middleware, direct repository calls, bulk operations and collaborator roles.
5. Accept with a route coverage check and negative tests proving all offline operations require a scoped resource context.

**C — Database row-level isolation and durable offline metadata.** Strong persistence boundary; transaction identity and file isolation are substantial work.
1. Design tenant/project membership policies and map cached files/indexes to database-owned rows.
2. Migrate cache metadata/settings/change records to tables with row-level policies and restricted application roles.
3. Propagate verified tenant identity transactionally and authorize file access from protected rows; import only attributable legacy entries.
4. Test connection-pool identity leakage, raw-query bypass, file cleanup, sync-all and cross-user project IDs.
5. Accept after direct DB-role and HTTP tests both prevent cross-tenant reads and writes without breaking authorized collaboration.

**D — Per-user offline agent/storage boundary.** Strong physical/logical isolation; highest operational complexity.
1. Specify per-user agent identity, project grants and an authenticated orchestration protocol.
2. Implement isolated cache/index/settings stores with signed, short-lived project access grants.
3. Migrate API operations to the caller's agent and enforce project grants during export/cache acquisition; relocate legacy cache data safely.
4. Test grant theft/expiry, agent routing mistakes, revoked membership, deletion and shared-host failures.
5. Accept only when cross-user requests cannot reach another agent's data and authorized offline work survives restart.

### CG-4 — Repair collaboration's project-access contract

**A — Typed project-access repository (recommended).** Smallest durable fix; requires choosing canonical project/membership tables.
1. Reconcile project IDs and membership roles across studio REST, storage and collaboration schema.
2. Implement a typed access repository over real project/membership queries; remove the `any`-cast missing-method call.
3. Wire WebSocket upgrade to read/write capabilities, migrate incompatible membership records, and enforce write permission on updates.
4. Test owner/member/viewer/stranger connections, missing projects, storage failure and revoked memberships.
5. Accept a real two-client authorized edit/reconnect sequence plus denied unauthorized/read-only mutations.

**B — Implement the missing storage contract.** Minimizes consumer churn; enlarges an already broad storage interface.
1. Specify exact return types and permissions required by all `getStudioProject` consumers.
2. Add concrete methods to `IStorage`/`DatabaseStorage` backed by canonical project and collaborator data.
3. Migrate callers to typed methods and explicit role checks, including update handlers; reconcile legacy IDs.
4. Compile contract consumers and test live-persistence owner/collaborator queries, absent projects and database errors.
5. Accept after WebSocket upgrade and subsequent editing use the same authorized project records as REST.

**C — Dedicated project authorization service.** Consistent policy across protocols; adds service availability and policy-version management.
1. Inventory REST/WebSocket role requirements and define an authorization decision contract.
2. Implement authoritative project/membership decisions with bounded caching and revocation propagation.
3. Replace storage casts with service decisions at connect and mutation time; migrate role mappings.
4. Test service outages, cache expiry, membership removal and concurrent role changes during sessions.
5. Accept only when valid users connect, revoked writers stop editing within the defined bound, and failed decisions deny access explicitly.

**D — Scoped collaboration session grants.** Avoids database lookup on every upgrade; introduces grant issuance/revocation lifecycle.
1. Define project-scoped short-lived grants and read/write privileges using authoritative membership records.
2. Implement authenticated grant issuance with signed claims, expiry and durable revocation/version checks.
3. Migrate the WebSocket client/protocol to exchange grants and enforce their project/write scope throughout the session.
4. Test wrong project, expired/replayed grants, revoked membership, reconnect and key rotation.
5. Accept a working owner/member session with real collaborative edits and rejection of every invalid grant case.

### CG-5 — Persist and safely initialize modulation routing

**A — Relational routing records (recommended).** Fits existing project ownership; adds migration and concurrency handling.
1. Define typed routing schema, project/track ownership, revision numbers and the valid empty initial state.
2. Migrate routing tables and implement transactional read/upsert/delete with optimistic concurrency.
3. Replace the map as authority; import recoverable active state where available and return an explicit empty routing document on first read.
4. Test first read, create/delete, stale revision, restart, multiple workers and more than 10,000 projects.
5. Accept when acknowledged settings round-trip unchanged across worker/restart boundaries and unauthorized writes remain denied.

**B — Store routing in the canonical project document.** Atomic project portability; document merges become more complex.
1. Define a versioned modulation section and migration rules for existing project documents.
2. Implement routing reads/writes through the durable project-document repository with ownership checks.
3. Migrate API payloads and initialize absent sections; remove map authority and add conflict-safe document updates.
4. Test older project imports, concurrent track edits, document restore and first reads.
5. Accept when project save/reopen/export/import preserves routing without overwriting unrelated project changes.

**C — CRDT-backed durable routing state.** Better collaborative editing; more complicated semantic validation.
1. Define routing CRDT structures and invariants such as valid targets and permissible cycles.
2. Implement validated routing transactions with durable update logs/snapshots rather than process-only state.
3. Adapt GET/POST/DELETE to the document, migrate existing routings, and initialize empty documents safely.
4. Test conflicting edits, offline merges, snapshot replay, worker restart and invalid routing transactions.
5. Accept deterministic routing convergence and persistence after full process loss with no acknowledged update missing.

**D — Versioned object-store routing documents.** Separates large routing state from DB rows; needs compare-and-swap and garbage collection.
1. Specify object keys, revisions, ownership metadata and strong read/write consistency requirements.
2. Implement conditional object writes and a durable project-to-version pointer with checksums.
3. Migrate API operations to versioned documents, explicitly handle missing initial state, and keep maps only as disposable caches.
4. Test competing writes, pointer/object commit failure, eviction, corruption and restore of prior versions.
5. Accept when every success points to verified durable data and reads remain correct across workers and cache loss.

## Examined-surface inventory and unexamined boundaries

### Counts and method

Inventory counts, **not line-by-line audit coverage**: 146 TypeScript files beneath `server/routes` (includes nested/test/support modules, so not 146 independent APIs); 104 literal `path: "/api/…"` lazy route registrations in `server/routes.ts`; 161 top-level `app.get/post/put/patch/delete/use` source matches there (includes mounts/middleware, not 161 unique business operations). `client/src/App.tsx:191-278` has 76 `<Route>` declarations, including the pathless fallback: 75 path-bearing routes. `client/src/components/layout/Sidebar.tsx:55-180` inventories ordinary and admin navigation. These categories overlap and must not be added as a coverage percentage.

The seven existing blocker lists were read: security, commerce, data-runtime, deployment, integrations, ai-media and product-autonomous. This pass checked current source for additional surfaces and did not re-prove every finding in those reports. Scanner JSON was not used.

### Route/page/feature coverage matrix

| Surface / entrypoint | Breadth work performed | Result / ownership / remaining boundary |
|---|---|---|
| Login/register/reset, settings, developer API; App routes `:192-197,204,233` | Compared security ownership; traced admin issue/revoke UI/API; inspected separate key subsystem existence | CG-1 only for admin controls. SEC findings remain separate; API key scope enforcement not exhaustively audited. |
| Studio/projects; `:200,214-215` | Inspected plugin catalog/provider/consumers, modulation endpoints, WebSocket bootstrap/access checks | CG-4/CG-5. Native DSP correctness, all plugin renderers and every editor action unexamined. |
| Generic export API, share links, data/audio/stems/bulk | Traced mounted jobs through completion and downloads; located client components | CG-2. Separate studio mixdown/export pipeline and all import formats not certified. |
| Offline REST; mobile/desktop/PWA | Traced mount and project/cache service; inventoried browser OfflineQueue/SyncManager/DraftStorage separately | CG-3. Browser eviction/quota, reconnect replay, service-worker upgrades, mobile background suspension and desktop packaging unverified. |
| Advertising page `:206`; `/api/advertising` | Inspected campaign budget/activation and dispatch service | Current summary distinguishes planned budget from spend (`server/routes/advertising.ts:353-359`); activation uses dispatch (`:930-940`) and organic social posting (`server/services/advertisingDispatchService.ts:9-20`). No re-listing of old “budget equals spend” claims. Paid-provider delivery and reconciliation remain unexamined. |
| Analytics/AI pages `:202-203`; revenue forecast API | Inspected mounted revenue forecast router and its actual `revenueForecastService` import, generation/default model constants (`server/routes/revenueForecast.ts:4`; `server/services/revenueForecastService.ts:73-120`) | Distinguish this heuristic service from `revenueForecaster` used by certified analytics. Statistical calibration, source completeness and certified analytics outputs not exhaustively audited. AM-2 retains predictive-capability scope; no new duplicate finding asserted. |
| Workspaces/collaborations `:254-255` | Inventoried invitations, permissions, project sharing and separate collaboration routers | `server/routes/workspace.ts:242-254,586-595` has invitation/permission consumers. Paid seat limits, cross-workspace roles, concurrent invitations and all team-tier entitlements remain unexamined; not labeled absent merely because proposed tasks mention them. |
| Admin beat loop `:231` | Located current `beatMoneyLoopService` and its scheduling/MaxCore-dependent stages; compared commerce/AI/integrations ownership | No new stall finding inferred from historical tasks. Cold-start/recovery, worker exclusivity and real asset-to-sale loop acceptance remain unverified. |
| Marketplace/royalties/pricing/subscriptions `:207-213,218-219` | Navigation inventory and commerce blocker de-duplication | Commerce report owns settlement/refunds/splits. Merch, fan memberships, invoices and their tax/refund/subscription paths not independently audited here. |
| Distribution/social `:205,217`, notification pages `:261-262` | Existing integrations coverage comparison | Existing report owns dispatch/idempotency/import/preferences. Full provider account permissions and live delivery remain unverified. |
| Contracts, shows, fan hub/memberships, A&R, outreach, merch, press kit, pitching, publishing, sync licensing `:253,267-277` | Route/navigation inventory only | These are real live page families, not represented as fully audited. Legal execution, ticket/inventory fulfillment, licensing rights and campaign compliance require separate deep dives. |
| Public landing, storefront links, help/docs/blog/legal/EPK `:191,235-250,277` | Route inventory only | Public authorization, content accuracy, SEO/accessibility, custom-domain security and public caching not fully examined here. |
| Admin security/support/KYC/training/autonomy `:220-232,251` | Cross-referenced existing report ownership; traced token controls specifically | Support moderation/report workflow, KYC evidence custody and every privileged control remain unexamined beyond existing reports. |

### External subsystem boundaries

Source inventory includes PostgreSQL/Drizzle, PDIM/Pocket Dimension storage, Redis-compatible queues/pub-sub/session state, MaxCore/native media/DSP, Stripe/Connect, DSP distribution providers, connected social platforms, email/notification delivery, OAuth/JWT and WebSocket collaboration. These are not a claim of successful configuration or live connectivity. No deployed schema, bucket contents, session state, production secrets, provider dashboard, billing account, ad account, DSP catalog, signed artifact or user data was inspected.

**Release verification gates (not additional source-defect findings):** after implementing the chosen alternatives, require isolated multi-user/multi-worker acceptance for CG-2–CG-5 and a credential lifecycle acceptance for CG-1. This pass did not execute them. The wider unexamined page families and provider contracts above prevent describing this breadth report—or the union of navigation inventories—as a complete production certification.