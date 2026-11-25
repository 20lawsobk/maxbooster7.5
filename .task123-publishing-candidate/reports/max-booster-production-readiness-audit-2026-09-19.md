# Max Booster production-readiness audit — 2026-09-19

**Verdict: NOT READY for the full advertised scope.**

Source-only review plus dependency, privacy and SAST scan evidence. No live database/provider, load, or destructive payment runs. This is not proof that every possible defect has been discovered.

## Unified platform finding index

80 unique audit IDs across 12 domains; 320 alternative repair playbooks; 1600 numbered repair steps. Count each ID once, not once per evidence section, option, observation or cross-reference. Scope-qualified verification gates may overlap related defects; they are not additional independent failures.

| ID / navigation | Title | Type | Priority | Exact affected scope |
|---|---|---|---|---|
| [SEC-01](#repair-sec-01) · [evidence](#evidence-security) | Revocation is a temporary, fail-open flag rather than durable invalidation; fallback sessions can survive password reset. | CONFIRMED defect | P1 | all authenticated releases |
| [SEC-02](#repair-sec-02) · [evidence](#evidence-security) | MFA assurance is inconsistent across sign-in and authenticator replacement. | CONFIRMED defect | P1 | MFA, Google sign-in, privileged users |
| [SEC-03](#repair-sec-03) · [evidence](#evidence-security) | URL string checks do not constrain the destination reached by the server. | CONFIRMED defect | P1 | custom workflow webhooks |
| [SEC-04](#repair-sec-04) · [evidence](#evidence-security) | Public deletion removes only the user row; complete erasure orchestration and OAuth reauthentication are missing from that path. | CONFIRMED defect + CAPABILITY GAP | P1 | account erasure and privacy promises |
| [SEC-05](#repair-sec-05) · [evidence](#evidence-security) | CSRF middleware load failure is explicitly allowed to continue startup. | CONFIRMED defect | P1 | browser-authenticated production |
| [SEC-06](#repair-sec-06) · [evidence](#evidence-security) | Edge trust, deployed cookie settings, secret custody and negative authorization tests need deployment evidence. | VERIFICATION GATE | P1 (conditional details in scope) | public deployment; P2 for non-public development |
| [C1](#repair-c1) · [evidence](#evidence-commerce) | Paid marketplace booking calls a nonexistent storage method; settlement also commits completion before its dependent work | CONFIRMED defect | P0 | All paid beat purchases |
| [C2](#repair-c2) · [evidence](#evidence-commerce) | Authenticated refund route lacks order-owner or privileged-actor authorization | CONFIRMED defect | P0 | Customer refunds |
| [C3](#repair-c3) · [evidence](#evidence-commerce) | Withdrawable balance mixes gross earnings, transfer debits and bank withdrawals; in-transit funds are not reserved | CONFIRMED defect | P0 | Connect seller/royalty withdrawals |
| [C4](#repair-c4) · [evidence](#evidence-commerce) | Collaborator credits are not connected to an executable payable balance | CONFIRMED defect | P1 | Marketplace revenue splits |
| [C5](#repair-c5) · [evidence](#evidence-commerce) | Scheduled royalty drain reads nonexistent payable fields and “executes” payments without a provider | CONFIRMED defect + CAPABILITY GAP | P1 | Automatic royalty payouts and statements |
| [C6](#repair-c6) · [evidence](#evidence-commerce) | Refund/dispute ingestion does not reconcile the actual commerce ledger or recover seller funds | CONFIRMED defect | P0 | Refunds, chargebacks, external dashboard refunds |
| [C7](#repair-c7) · [evidence](#evidence-commerce) | Plan metadata and payment-mode handling disagree across subscription producers/consumers | CONFIRMED defect | P1 | Existing-user upgrades, yearly/lifetime billing |
| [C8](#repair-c8) · [evidence](#evidence-commerce) | Webhook deduplication is a non-atomic, expiring check; provider disbursement requests lack stable idempotency | CONFIRMED defect | P1 | Multi-worker/retry/restart payment processing |
| [C9](#repair-c9) · [evidence](#evidence-commerce) | No current end-to-end evidence establishes settlement and deployment invariants | VERIFICATION GATE | P2 | Any production money release |
| [I1](#repair-i1) · [evidence](#evidence-integrations) | LabelGrid submission/delivery claims exceed provider evidence: local drafts become submissions and unknown outlet states become processing | CONFIRMED defect | P1 | Spotify, Apple Music, YouTube Music direct-submit routes and configured LabelGrid delivery-status consumers |
| [I2](#repair-i2) · [evidence](#evidence-integrations) | Distribution creation retries lack application-level idempotency and durable remote checkpoints | CONFIRMED defect | P1 | Too Lost primary submission and LabelGrid release creation |
| [I3](#repair-i3) · [evidence](#evidence-integrations) | Catalog completeness is inferred independently of actual scanner termination | CONFIRMED defect | P1 | DSP catalog previews/imports, especially SoundCloud and Deezer |
| [I4](#repair-i4) · [evidence](#evidence-integrations) | Automatic artist discovery/import has no durable job handoff/checkpoint in this path | CAPABILITY GAP | P1 | Automatic catalog import after artist creation and transfer-job progress |
| [I5](#repair-i5) · [evidence](#evidence-integrations) | OAuth callbacks persist reusable social credentials in plaintext application columns | CONFIRMED defect | P1 | Connected social accounts, refresh and publishing credential boundary |
| [I6](#repair-i6) · [evidence](#evidence-integrations) | Autopilot publishing has no recovery path for stranded posting records or ambiguous per-platform outcomes | CONFIRMED defect | P1 | Scheduled/manual/autopilot posts through AutoPostingServiceV2 |
| [I7](#repair-i7) · [evidence](#evidence-integrations) | Notification delivery reads a different preference schema than the preference API writes | CONFIRMED defect | P1 | Release/social/other notifications through NotificationService; email and browser opt-ins |
| [I8](#repair-i8) · [evidence](#evidence-integrations) | SMS verification claims active notifications, but notification dispatch has no SMS channel | CAPABILITY GAP | P2 | General SMS notification offering; P1 if SMS is a required security-alert channel |
| [I9](#repair-i9) · [evidence](#evidence-integrations) | Both mounted distributor payout actions call a method that always throws; a token cannot enable the absent provider endpoint | CAPABILITY GAP | P1 | LabelGrid earnings/royalty payout execution, not internal balance accounting |
| [AM-1](#repair-am-1) · [evidence](#evidence-ai-media) | Fabricated A/B performance and locally authored AI variants | CONFIRMED defect | P1 | social AI A/B generation and any ranking/selection based on its scores. |
| [AM-2](#repair-am-2) · [evidence](#evidence-ai-media) | Predictive analytics and engagement capabilities have no working authoritative contract | CAPABILITY GAP | P1 | engagement/best-time predictions, AI analytics/forecasting, A&R forecast and release-timing promises. Ordinary observed analytics are not implicated. |
| [AM-3](#repair-am-3) · [evidence](#evidence-ai-media) | Requested video narration/audio may silently disappear | CONFIRMED defect | P1 | MaxCore videos requested with voiceover or generated audio. |
| [AM-4](#repair-am-4) · [evidence](#evidence-ai-media) | Image-to-video accepts assets/options that the active MaxCore handoff drops | CONFIRMED defect | P2 | multi-image music-video generation and its advanced controls. |
| [AM-5](#repair-am-5) · [evidence](#evidence-ai-media) | Native model loading does not establish trained, compatible, qualified readiness | VERIFICATION GATE | P1 | all native-model inference and training-readiness claims. |
| [AM-6](#repair-am-6) · [evidence](#evidence-ai-media) | Audio render errors can leave jobs retrying forever | CONFIRMED defect | P1 | MaxCore audio generation job completion, caller polling, and resource availability. |
| [D1](#repair-d1) · [evidence](#evidence-data-runtime) | Backup objects and their catalog are written under generated keys but subsequently read using different, fixed keys. | CONFIRMED defect | P0 | Application-managed database backups and backup automation |
| [D2](#repair-d2) · [evidence](#evidence-data-runtime) | Backup scheduling is not wired in current server sources; backup target selection differs from application DB selection. | CONFIRMED defect | P1 | Scheduled backups, especially installations using NEON_DATABASE_URL |
| [D3](#repair-d3) · [evidence](#evidence-data-runtime) | No demonstrated end-to-end safe restore workflow; existing helper can report success after SQL errors. | CAPABILITY GAP with confirmed helper defect | P1 | Disaster-recovery readiness claims |
| [D4](#repair-d4) · [evidence](#evidence-data-runtime) | External PDIM treats unreadable/corrupt recovery state as absent and proceeds; AOF replay can skip failed records; streams are excluded from persistence. | CONFIRMED defect | P0 | Deployments with external/pdim enabled as durable Redis-compatible state |
| [D5](#repair-d5) · [evidence](#evidence-data-runtime) | External fabric deletion removes authoritative metadata before cleanup is recoverable and decrements capacity after failed physical deletion. | CONFIRMED defect | P1 | External fabric object deletion, deduplicated storage and capacity accounting |
| [D6](#repair-d6) · [evidence](#evidence-data-runtime) | Session save/delete callbacks acknowledge before durable backing operations complete; PG errors are swallowed even in PG-only mode. | CONFIRMED defect | P1 | Session continuity across worker handoff/restart and backing-store outages |
| [D7](#repair-d7) · [evidence](#evidence-data-runtime) | Retention-worker startup cleanup can drain valid queued work along with malformed jobs. | CONFIRMED defect | P1 | Retention queue startup/restarts and multi-worker operation |
| [D8](#repair-d8) · [evidence](#evidence-data-runtime) | Schema rollout provenance is incomplete; checked-in migration journal stops before later SQL, and the merge push pipeline masks command failure. | VERIFICATION GATE with confirmed tooling defect | P1 | Releases needing schema changes; fresh installs and upgrades |
| [DEP-01](#repair-dep-01) · [evidence](#evidence-deployment) | The active build does not establish a complete, current runtime artifact set | CONFIRMED defect | P1 | fresh builds, gateway-dependent features, relocation to minimal runtimes |
| [DEP-02](#repair-dep-02) · [evidence](#evidence-deployment) | Python feature readiness can be permanently decided before its background runtime arrives | CONFIRMED defect | P1 | Python-backed audio/video features and enabled legacy sidecar on cold capsule boots |
| [DEP-03](#repair-dep-03) · [evidence](#evidence-deployment) | Periodic readiness checks temporarily withdraw healthy instances and can overlap | CONFIRMED defect | P1 | /ready, /readyz, /status consumers and production readiness-based routing |
| [DEP-04](#repair-dep-04) · [evidence](#evidence-deployment) | CI does not enforce the shipped deployment lifecycle or the stated load-quality result | CONFIRMED defect plus CAPABILITY GAP | P1 | release promotion confidence for the complete web/worker/capsule platform |
| [DEP-05](#repair-dep-05) · [evidence](#evidence-deployment) | Resource sizing is host-based and independently allocates shared capacity | CONFIRMED portability defect; production capacity VERIFICATION GATE | P1 | constrained containers/VMs and co-located app + MaxCore workers |
| [DEP-06](#repair-dep-06) · [evidence](#evidence-deployment) | Sentry silence watchdog never reaches its threshold if delivery has never succeeded | CONFIRMED defect | P1 | initial deployment or restart with an unavailable error-reporting transport |
| [DEP-07](#repair-dep-07) · [evidence](#evidence-deployment) | Public-origin and custom-domain DNS/TLS acceptance remains unverified | VERIFICATION GATE | P1 for an internet launch/custom-domain release | published primary origin, storefront domains, callbacks/webhooks and certificate renewal |
| [PA-1](#repair-pa-1) · [evidence](#evidence-product-autonomous) | Settings theme selector persists a different state from the actual theme consumer. | CONFIRMED defect | P2 | settings/appearance release |
| [PA-2](#repair-pa-2) · [evidence](#evidence-product-autonomous) | Concurrent preference edits can restore a stale whole-form snapshot after a failure. | CONFIRMED defect | P2 | settings preference editing |
| [PA-3](#repair-pa-3) · [evidence](#evidence-product-autonomous) | Security healing cannot execute session invalidation, circuit breaking, or feature isolation. | CAPABILITY GAP | P1 | autonomous security containment claims, not every platform release |
| [PA-4](#repair-pa-4) · [evidence](#evidence-product-autonomous) | Evolution only has live consumers for posting/content knobs, not its other declared enhancement categories. | CAPABILITY GAP | P1 | broad autonomous feature/distribution/compliance evolution claims |
| [PA-5](#repair-pa-5) · [evidence](#evidence-product-autonomous) | Evolution post-apply validation measures local liveness, not the changed consumer's correctness. | CAPABILITY GAP | P1 | unattended evolution promotion |
| [PA-6](#repair-pa-6) · [evidence](#evidence-product-autonomous) | Latest simulations are component/fixture evidence, not deployment integration acceptance. | VERIFICATION GATE | P1 | production promotion of evolution, security healing and autofix |
| [SCAN-01](#repair-scan-01) · [evidence](#evidence-scanners) | Current root lock retains scanner-advised runtime packages; advisory applicability and final artifact patches are not demonstrated | VERIFICATION GATE; confirmed affected-version lock matches | P1 | web runtime, media/upload and data-import consumers |
| [SCAN-02](#repair-scan-02) · [evidence](#evidence-scanners) | Scanner lacks dependency occurrence paths; nested Python, Rust, developer, Go and duplicate findings cannot be equated to one deployed web service | VERIFICATION GATE | P1 (conditional details in scope) | whole release portfolio; P0 only if critical AnyIO certificate-spoofing preconditions are confirmed on a shipped consumer |
| [SCAN-03](#repair-scan-03) · [evidence](#evidence-scanners) | Raw email/IP/username logging is not covered by central key-path redaction, including message interpolation | CONFIRMED defect | P1 | server logs and operational tools with personal data |
| [SCAN-04](#repair-scan-04) · [evidence](#evidence-scanners) | Global tar override substitutes success-returning no-op archive APIs | CONFIRMED defect | P1 | build/install and any archive consumer; conditional runtime impact |
| [SCAN-05](#repair-scan-05) · [evidence](#evidence-scanners) | SAST is explicitly incomplete, not a clean scan | VERIFICATION GATE | P1 | all production release candidates |
| [CG-1](#repair-cg-1) · [evidence](#evidence-coverage-gaps) | Admin token issue and revoke actions explicitly return 501. | CAPABILITY GAP | P1 | admin-issued API credentials; not a blocker for session login |
| [CG-2](#repair-cg-2) · [evidence](#evidence-coverage-gaps) | Timer-driven exports announce completion without rendering; downloads return JSON acknowledgements, not files. | CONFIRMED defect | P1 | the generic export API and consumers promising downloadable artifacts |
| [CG-3](#repair-cg-3) · [evidence](#evidence-coverage-gaps) | Offline project/cache operations authenticate the caller but do not consistently authorize the target or scope global operations to that caller. | CONFIRMED defect | P1 | deployments exposing the mounted offline API |
| [CG-4](#repair-cg-4) · [evidence](#evidence-coverage-gaps) | Project access calls a nonexistent storage method and rejects legitimate connections. | CONFIRMED defect | P1 | the initialized studio collaboration WebSocket endpoint |
| [CG-5](#repair-cg-5) · [evidence](#evidence-coverage-gaps) | Modulation routing is acknowledged into a capped process-local map; first reads also dereference missing state. | CONFIRMED defect | P1 (conditional details in scope) | durable modulation-routing API; P2 for exploratory/session-only controls |
| [GR-1](#repair-gr-1) · [evidence](#evidence-growth-rights) | Fan campaign “send” records delivery without sending; the separate real broadcast path lacks durable recipient outcomes | CONFIRMED defect | P1 | Fan marketing campaigns and restart/retry-safe broadcasts |
| [GR-2](#repair-gr-2) · [evidence](#evidence-growth-rights) | Fan broadcasts have no application-level consent/suppression/unsubscribe lifecycle | CAPABILITY GAP | P1 | Production artist-to-fan email marketing |
| [GR-3](#repair-gr-3) · [evidence](#evidence-growth-rights) | Merch management has no order-ingestion/purchase producer behind its fulfillment UI | CAPABILITY GAP | P1 | Selling/fulfilling physical merchandise inside this platform; catalog-only management is narrower |
| [GR-4](#repair-gr-4) · [evidence](#evidence-growth-rights) | Split-sheet amendments bypass allocation invariants and overwrite mutable signatures without revision-bound assent | CONFIRMED defect | P1 | Split-sheet execution through mounted contracts API |
| [GR-5](#repair-gr-5) · [evidence](#evidence-growth-rights) | Revenue forecast API returns invented accuracy and substitutes assumptions for measured zero revenue without provenance | CONFIRMED defect | P1 | Mounted revenue forecast API and any consumer relying on its financial estimates |
| [AG-1](#repair-ag-1) · [evidence](#evidence-admin-governance) | Removal and warning endpoints acknowledge effects they do not perform; review actions also misrepresent completion. | CONFIRMED defect | P1 | moderation operations |
| [AG-2](#repair-ag-2) · [evidence](#evidence-admin-governance) | Settings persist but have no corresponding runtime enforcement consumer. | CONFIRMED defect | P1 | operator maintenance, registration and rate-limit controls |
| [AG-3](#repair-ag-3) · [evidence](#evidence-admin-governance) | Status crashes when a required document has not yet been uploaded. | CONFIRMED defect | P1 | applicant KYC onboarding |
| [AG-4](#repair-ag-4) · [evidence](#evidence-admin-governance) | Approval is not bound to reviewed evidence; approved identity information remains editable without invalidation. | CONFIRMED defect | P1 | internally verified identity assertions |
| [AG-5](#repair-ag-5) · [evidence](#evidence-admin-governance) | Concurrent message/tag mutations overwrite each other's JSONB state. | CONFIRMED defect | P1 | multi-agent support operations |
| [AG-6](#repair-ag-6) · [evidence](#evidence-admin-governance) | Reply notifications point to an absent customer ticket page; detail/reply APIs are admin-only. | CAPABILITY GAP with confirmed broken link | P1 | customer support conversation lifecycle |
| [CO-1](#repair-co-1) · [evidence](#evidence-client-offline) | Browser-private state is not bound to the authenticated account | CONFIRMED defect | P1 | production browser/PWA account switching, logout and offline reads; queue/draft isolation also blocks enabling those utilities broadly. |
| [CO-2](#repair-co-2) · [evidence](#evidence-client-offline) | The local outbox does not have a recoverable, exclusive scheduler | CONFIRMED scheduler defect | P1 for existing/future queued actions | the generic offline scheduler and any pre-existing or subsequently enrolled queued work. No current mounted mutation producer was established. Initialization proves scheduler reachability, not that a current page enqueues mutations; this finding does not assert current queued Projects data loss. |
| [CO-3](#repair-co-3) · [evidence](#evidence-client-offline) | Background queue acceptance is confused with completed business synchronization | CONFIRMED transport defect | P1 for existing/future queued actions | PWA background sync on browsers supporting the Sync API, and local sync-status UX when generic queued work exists. No current mounted mutation producer was established. The initialization path is not evidence of a producer, and this finding does not assert current queued Projects data loss. |
| [CO-4](#repair-co-4) · [evidence](#evidence-client-offline) | Worker activation discards old application generations before open clients are safe | CONFIRMED lifecycle defect | P1 | deployed PWA upgrades with open tabs/offline navigation and lazy chunks. |
| [CO-5](#repair-co-5) · [evidence](#evidence-client-offline) | First-save draft storage dereferences an absent draft | CONFIRMED defect | P2 for present reachability; P1 before promising draft-backed forms | reusable draft API and any form enrolled through it, not every current form. |
| [CO-6](#repair-co-6) · [evidence](#evidence-client-offline) | Global offline assurance exceeds actual persistence capability | CAPABILITY GAP, with confirmed state-reporting defect | P1 | all pages under the root offline provider, especially project editing and storage-restricted devices. |
| [CO-7](#repair-co-7) · [evidence](#evidence-client-offline) | Projects renders a failed initial fetch as an empty account | CONFIRMED defect | P2 | authenticated /projects initial-load failure/no cached data. |
| [CO-8](#repair-co-8) · [evidence](#evidence-client-offline) | Cross-device, accessible and reconnect-safe critical journeys remain an acceptance gate | VERIFICATION GATE | P1 for full platform/browser release | source cannot certify keyboard/screen-reader completion, touch/mobile audio behavior, quota/eviction survival, deployed lazy-route recovery, or reconciliation after disconnect/multiple tabs. No major accessibility barrier was conclusively established in this pass; lack of a browser run is not itself proof of an accessibility defect. Full release requires demonstrated contracts across the unexamined pages below, not an inference from shared components. |

## How to use this audit and release order

[Full evidence](#full-evidence) · [All repair playbooks](#all-repair-playbooks) · [Scanner inventories](#scanner-inventories) · [Coverage and exclusions](#coverage-and-exclusions). Use native browser Find (Ctrl/Cmd+F) for any ID, source path, provider, or capability; print preserves the full document.

The index is the complete list of findings established by these twelve reports, not a claim of exhaustive examination of the platform. Source citations, confidence, current versus dormant consumers, affected release scope, prerequisites, tradeoffs and acceptance criteria below control interpretation. Prior 786 tests and prior typecheck are prior evidence, not rerun here; tests do not certify real database, provider, authentication, settlement or deployed-artifact boundaries. Task proposals, cancellations and historical completion claims are not current acceptance evidence.

**Choose one of four different start-to-finish strategies per ID**, not all four simultaneously. Each has five stages; preparation/prerequisites, implementation or migration, testing and acceptance remain part of the option. Validate dependencies and tradeoffs before choosing. A recommendation is a starting point, not a first-try guarantee. Do not close a finding until its chosen approach passes its stated acceptance tests against the actual affected scope.

**Recommended focused path to release:**

1. Establish owners, release scope and safe validation environments. Address high-risk money, authorization and data-loss boundaries first: commerce P0 C1/C2/C3/C6 and data P0 D1/D4, alongside SEC-01/SEC-02/SEC-05, CG-3, CO-1 and durable sessions D6. P0 priority describes the stated affected capability, not a proven live incident or universal outage; D4 is conditional on external/pdim being enabled as durable state.
2. Reconcile the complete money lifecycle: C4/C5/C7/C8 and external payout I9; prove bookings, entitlements, collaborators, refunds, disputes, withdrawals and replay safety with C9 acceptance. Do not infer cash settlement from a local success response.
3. Establish recoverable data and privacy: D2/D3/D5/D7/D8, SEC-03/SEC-04, I5 and SCAN-03; require durable recovery, authorization, consent and erasure evidence. Resolve critical dependency exposure only after SCAN-01/SCAN-02 occurrence-to-artifact mapping; SCAN-02's P0 escalation is conditional, not an established P0.
4. Establish reproducible deployment, monitoring and security acceptance: DEP findings, SEC-06, SCAN-04/SCAN-05. SAST is incomplete, not clean. Prove the deployed artifacts and configuration rather than assuming source or prior tests establish them.
5. Repair and accept real external delivery, AI/media, offline/device and operator/customer journeys: I, AM, CO, CG, GR and AG findings within their exact scope. Complete product/autonomous PA capabilities and integration acceptance before advertising those capabilities. P2/dormant utilities do not imply every present route is broken.
6. Execute the full set of chosen-option acceptance gates and resolve the coverage exclusions for the intended release. Obtain provider, multi-user/multi-worker, recovery, accessibility/device and operational evidence; monitor rollout with an explicit rollback plan that does not restore revoked credentials or inconsistent money/data.

**Scanner interpretation:** 206 dependency observations, 172 distinct scanner IDs (not audit finding IDs), and 79 privacy observations. The two critical token alerts are false positives for token values at the cited current source; this does not dismiss other personal-data logging. SAST returned incomplete, not a clean result. These observations are triaged into five SCAN IDs and are not added again to the unique finding total.

**Evidence preservation:** all source prose, citations, tables and every A–D option are reproduced below, reorganized only into evidence → playbooks → sanitized inventories → coverage. Statements such as “only this report was written” describe the original domain-review activity, not this assembly. Coverage statements are domain-local; a surface unexamined by one domain may be examined by another. No findings have been silently rewritten or retired.

## Full evidence

### Evidence: security

Source: `reports/readiness-audit/security.md`. [Index](#unified-platform-finding-index) · [Domain playbooks](#playbooks-security)

### Security production-readiness audit — 2026-09-19

#### Blocker list

Read-only source audit; no application changes, workflow operations, live database/provider requests, credential-value inspection, or runtime tests. Prior tasks and comments are not evidence of completion. Priorities describe release risk, not a claim of demonstrated exploitation. No P0 exploit was established. This is the security-domain contribution, not certification of the entire platform.

| ID | Classification | Priority / release scope | Finding | Confidence |
|---|---|---|---|---|
| SEC-01 | CONFIRMED defect | P1 / all authenticated releases | Revocation is a temporary, fail-open flag rather than durable invalidation; fallback sessions can survive password reset. | High |
| SEC-02 | CONFIRMED defect | P1 / MFA, Google sign-in, privileged users | MFA assurance is inconsistent across sign-in and authenticator replacement. | High |
| SEC-03 | CONFIRMED defect | P1 / custom workflow webhooks | URL string checks do not constrain the destination reached by the server. | High |
| SEC-04 | CONFIRMED defect + CAPABILITY GAP | P1 / account erasure and privacy promises | Public deletion removes only the user row; complete erasure orchestration and OAuth reauthentication are missing from that path. | High for source behavior; medium for total retained footprint |
| SEC-05 | CONFIRMED defect | P1 / browser-authenticated production | CSRF middleware load failure is explicitly allowed to continue startup. | High for failure behavior; not evidence of a current load failure |
| SEC-06 | VERIFICATION GATE | P1 / public deployment; P2 for non-public development | Edge trust, deployed cookie settings, secret custody and negative authorization tests need deployment evidence. | High that source alone cannot establish these properties |

##### SEC-01 — session revocation does not establish permanent invalidity

**Entrypoints/consumers:** password reset invokes `revokeUserSessions` at `server/routes.ts:2237-2248`; password change also invokes the revocation path after its best-effort session enumeration (`server/routes.ts:1350-1388`). Express consumes the active store at `server/index.ts:745`.

**Evidence:** revocation has a 310-second TTL (`server/middleware/sessionConfig.ts:355`), stores only `"1"` rather than a generation or issuance cutoff (`:435-443`), and reads timeout/error as not revoked (`:394-405`). An old session not requested during that window need not be destroyed. Revocation rejection deletes the inner copy but not the PostgreSQL copy (`:483-488`). PostgreSQL fallback reads return session data without that check (`:514-518`, `:538-543`); the PG-only store returns cached/database sessions without it (`:713-729`). Session destruction acknowledges success before best-effort persistent removal (`:611-618`). These are instances of the same non-authoritative invalidation design, not separate findings.

**Impact:** a captured cookie can remain usable or reappear after reset, expiration of the revocation flag, storage outage, or failed deletion. Conversely, the user-wide boolean cannot distinguish a new legitimate login from an old session while it is set. The source comment promising a bounded five-second revocation is not an end-to-end guarantee.

##### SEC-02 — MFA lifecycle does not preserve assurance

**Entrypoints/consumers:** local login, Google callback, MFA setup/verification, and routes using `requireAuth` / `require2FA`.

**Evidence:** local login challenges TOTP (`server/routes.ts:540-558`), but the Google callback links by returned email and establishes a full session without consulting `twoFactorEnabled` (`:2404-2439`). Ordinary `requireAuth` establishes authentication without MFA assurance (`server/middleware/auth.ts:6-39`); `req.isAuthenticated` is simply presence of `req.user` (`server/routes.ts:217-222`). Privileged gates do check session assurance (`server/middleware/auth.ts:122-136`), so this is not a claim that every privileged route is directly bypassed.

The setup endpoint requires only a user, writes a new **active** secret immediately, and returns it (`server/routes.ts:1739-1768`), without proving the existing factor/password or maintaining a separate pending secret. Verification checks that replacement (`:1802-1815`). Thus a session without the prior factor can replace it, and an abandoned setup can break the legitimate factor. Admin and security routers do have explicit admin/MFA gates (`server/routes/admin.ts:51-62`; `server/routes/security.ts:10`); those existing gates do not repair factor replacement.

**Impact:** enabled local MFA is not enforced consistently at Google login; session theft can become authenticator takeover. Google email/sub identity-linking rules also require negative tests; this audit does not claim a provider-specific unverified-email exploit.

##### SEC-03 — workflow webhook SSRF protection checks names, not destinations

**Entrypoint:** authenticated `POST /api/custom-workflows/:id/test`, mounted at `server/routes.ts:8535`, checks workflow ownership at `server/routes/customWorkflows.ts:466-480`.

**Evidence:** `isSafeWebhookUrl` requires HTTPS and matches hostname strings against a small private-address regex list, but does not resolve and constrain addresses (`server/routes/customWorkflows.ts:13-37`). The webhook action passes the URL to native `fetch` with no redirect policy or pinned resolved address (`:531-550`). A public hostname can resolve to a private address; default redirect handling can reach destinations never examined by the validator. Literal IPv6 normalization also needs complete address parsing rather than these regexes.

**Impact:** authenticated users can induce requests from the server's network position. Network egress restrictions may reduce impact but were not inspected. Ownership checks are present and do not prevent SSRF.

##### SEC-04 — erasure completion is not substantiated by the public path

**Entrypoint:** `DELETE /api/auth/account` verifies a password, calls `storage.deleteUser`, and returns success (`server/routes.ts:1415-1432`). The storage method deletes only the users row (`server/storage.ts:231-236`). Google-created accounts have an empty password (`server/routes.ts:2413-2418`), so that public deletion flow cannot directly reauthenticate those accounts.

**Evidence:** not all user-associated schema rows cascade: e.g. `analytics.userId` has no user foreign key (`shared/schema.ts:135-149`). Files are stored through an external storage abstraction (`server/routes.ts:1473-1478`), whose explicit deletion operation exists at `server/services/storageService.ts:221-222`; the account path never calls it. The separate deletion service similarly relies on a user delete and asserts broad cascade completion (`server/services/accountDeletionService.ts:154-187`), retains identifying audit fields (`:215-227`), and logs identifying data (`:149-150`, `:230-235`). Source search found no runtime caller of that service outside its definition; it is not proof the public endpoint performs scheduled erasure.

**Impact:** success does not mean user-associated rows, object bytes, caches, processor copies and backups meet a documented erasure policy. A total schema/processor inventory and lawful-retention assessment remain necessary; no legal violation is inferred solely from retaining a narrowly justified audit record. Logging and permanent audit retention need minimization and explicit policy.

##### SEC-05 — CSRF initialization fails open

**Entrypoint/consumer:** asynchronous server initialization installs origin validation then attempts to install CSRF (`server/index.ts:761-784`). The catch logs a warning and continues rather than failing readiness/startup (`:782-784`).

**Evidence:** missing Origin/Referer in production is logged but admitted by origin validation (`server/middleware/requestValidation.ts:138-145`); malformed Referer also falls through (`:151-155`). Normal CSRF does reject missing/mismatching tokens (`server/middleware/csrf.ts:34-68`). Therefore an import/initialization failure removes a deliberate protection while readiness can proceed.

**Impact:** loss of defense in depth during a faulty build or startup. SameSite and origin checks still exist; this is **not** proof that cross-site requests currently succeed. Exemptions and shared-secret internal bypass (`server/middleware/csrf.ts:131-183`) must remain constrained when repairing startup, not be broadened to make tests pass.

##### SEC-06 — deployment security acceptance remains unverified

**Entrypoints/consumers:** ingress through Express, browser sessions, upload delivery, role/ownership routes and deployment configuration.

**Evidence:** trusted proxies include all private, link-local and loopback ranges (`server/middleware/cloudflare.ts:134-141`), consumed by `server/index.ts:176`. Session production detection includes `REPLIT_DEPLOYMENT`, but cookie `secure` depends only on `NODE_ENV` (`server/middleware/sessionConfig.ts:796-834`). The actual edge reachability/header sanitation and deployment environment determine safety. CORS production allowlisting is implemented (`server/safety/mandatoryMiddleware.ts:298-384`), not demonstrated broken.

Credential-bearing configuration values were deliberately not opened. The task proposal about plaintext `.replit` credentials is **not** proof of current leakage or remediation. No sanitized key-only inventory, repository-history secret scan, provider rotation evidence, edge tests, or cross-tenant test results were produced in this constrained audit.

**Impact:** public release requires affirmative evidence that direct ingress cannot spoof forwarding headers, cookies are Secure over the actual deployment, secrets are held outside shipped/tracked assets, and ownership/admin checks survive hostile requests. This is a verification gate, not an invented confirmed exposure.

### Evidence: commerce

Source: `reports/readiness-audit/commerce.md`. [Index](#unified-platform-finding-index) · [Domain playbooks](#playbooks-commerce)

### Commerce production-readiness audit — 2026-09-19

#### Blocker list

Read-only source audit of money movement, marketplace settlement, subscriptions, refunds and royalties. No application/configuration changes, provider calls, live database queries, installations or test execution. “Confirmed” means demonstrated by current source, not proof that a particular customer has suffered loss. P0 blocks exposed money movement; P1 blocks the named capability; P2 is a release-evidence gate. Prior task proposals are not evidence. These are domain findings, not certification of the entire platform.

| ID | Classification / priority | Blocker | Release scope | Confidence |
|---|---|---|---|---|
| C1 | CONFIRMED defect / P0 | Paid marketplace booking calls a nonexistent storage method; settlement also commits completion before its dependent work | All paid beat purchases | High |
| C2 | CONFIRMED defect / P0 | Authenticated refund route lacks order-owner or privileged-actor authorization | Customer refunds | High |
| C3 | CONFIRMED defect / P0 | Withdrawable balance mixes gross earnings, transfer debits and bank withdrawals; in-transit funds are not reserved | Connect seller/royalty withdrawals | High |
| C4 | CONFIRMED defect / P1 | Collaborator credits are not connected to an executable payable balance | Marketplace revenue splits | High |
| C5 | CONFIRMED defect + CAPABILITY GAP / P1 | Scheduled royalty drain reads nonexistent payable fields and “executes” payments without a provider | Automatic royalty payouts and statements | High |
| C6 | CONFIRMED defect / P0 | Refund/dispute ingestion does not reconcile the actual commerce ledger or recover seller funds | Refunds, chargebacks, external dashboard refunds | High |
| C7 | CONFIRMED defect / P1 | Plan metadata and payment-mode handling disagree across subscription producers/consumers | Existing-user upgrades, yearly/lifetime billing | High |
| C8 | CONFIRMED defect / P1 | Webhook deduplication is a non-atomic, expiring check; provider disbursement requests lack stable idempotency | Multi-worker/retry/restart payment processing | High |
| C9 | VERIFICATION GATE / P2 | No current end-to-end evidence establishes settlement and deployment invariants | Any production money release | High that evidence is insufficient; deployment state unknown |

##### C1 — Buyer charged, booking cannot complete

**Entrypoint/consumer:** `POST /api/marketplace/checkout/initiate` and `/purchase` call `initiatePurchase` (`server/routes/marketplace.ts:1023-1055,1069-1099`); the signed checkout webhook inserts a pending order then calls `processPayment` (`server/routes/webhooks/stripe.ts:71-122`).

**Evidence:** `processPayment` retrieves the real order and then calls `(storage as any).updateOrder` (`server/services/marketplaceService.ts:539-540,568-593`). The actual `DatabaseStorage` exports an instance and supplies `getOrder` but no `updateOrder` implementation (`server/storage.ts:68,3658-3669`; repository symbol search finds only marketplace call sites). Thus successful payment reaches a method-not-found failure. The same missing method is used for failed-payment state and generated-license persistence (`server/services/marketplaceService.ts:573-581,995`). The service suppresses static checking (`server/services/marketplaceService.ts:1`).

**Additional settlement defects in the same boundary:** the real schema returns `amount`, not `amountCents` (`shared/schema.ts:3232-3242`), but seller transfer is gated on `dbOrder.amountCents` (`server/services/marketplaceService.ts:595-610`). Merely adding `updateOrder` would therefore still skip the automatic transfer. Completion is written before license, splits and revenue work; replay of a completed order only reconciles notifications (`server/services/marketplaceService.ts:554-559,589-665`). Split failure returns false without the caller checking it; revenue failure is swallowed. Impact: charged-but-unfulfilled sales, skipped payouts, and unrecoverable partial settlement on ordinary retries. The existing webhook correctly inserts **pending**; its historical completed-at-insert bug is not the finding.

##### C2 — Cross-account refund initiation

**Entrypoint/consumer:** `POST /api/billing/refund`, authenticated but not ownership-scoped (`server/routes/billing.ts:1147-1184`). The route validates an amount and passes the caller ID plus arbitrary order ID. `stripeService.createRefund` fetches by order ID alone and checks only existence/payment linkage (`server/services/stripeService.ts:375-411`), then submits the Stripe refund (`server/services/stripeService.ts:425-438`).

**Impact:** an authenticated actor knowing another order ID can initiate a refund against it and attribute the local refund to themselves. Stripe returns money to the original payment method, not the attacker; this is unauthorized reversal/disruption, not direct refund-to-attacker theft. UUID unpredictability is not authorization. There is no owner comparison in this call chain.

##### C3 — No conserved seller payable balance

**Entrypoint/consumer:** `/api/payouts/instant` calls `requestInstantPayout` (`server/routes/payouts.ts:126-143`); the royalties withdrawal path also calls it (`server/routes.ts:6498`). Calculation adds gross completed order amounts and pending/confirmed royalty amounts, subtracts only completed and pending `instant_payouts`, and labels the result USD without currency grouping (`server/services/instantPayoutService.ts:241-295`).

**Evidence/impact:** automatic transfer computes a fee-net amount and stores it in the same payout table, then sets `in_transit` (`server/services/instantPayoutService.ts:508-554`), a state excluded from reservations. For a $100 gross sale/$90 seller transfer, the formula can expose $100 while in transit and $10 after completion, although that $10 is the platform fee. Manual withdrawal again subtracts a payout while invoking `stripe.payouts.create` **on the connected account**, not funding it from the platform (`server/services/instantPayoutService.ts:698-705,735-787`). Transfer-to-connected-account and connected-account-to-bank are different legs, not two independent deductions from earnings. Unfunded royalty balances cannot be paid merely by creating a bank payout. The accounting seam imports genuine royalty earnings as pending without transferring money (`server/services/labelGridRoyaltySync.ts:139-154`); transport is outside this audit. Potential impacts include overstated availability, underpayment/double debit, payout failures, and cross-currency aggregation.

##### C4 — Royalty split accrual does not become collaborator cash

**Entrypoint/consumer:** settlement invokes `distributeSplits` (`server/services/marketplaceService.ts:629`). It calculates shares from gross order amount, marks transaction rows `completed`, and increments split `pendingPayout` (`server/services/marketplaceService.ts:807-809,884-914`). The withdrawal calculator includes only pending/confirmed royalty transactions, not these completed credits or split pending balances (`server/services/instantPayoutService.ts:253-257`). Meanwhile its order component belongs wholly to the seller.

**Impact:** collaborators can see credited earnings yet have no withdrawable balance, while the seller retains gross-order availability. Split resolution reads up to twenty rows without an active/accepted filter and accepts any positive total percentage rather than enforcing a contract total (`server/services/marketplaceService.ts:832-836,848-852,864-887`). Missing recipient IDs fall back to the seller (`:888`). The standalone `royaltySplitsDispatcher` is not a production consumer of this path: repository references show only its definition/example, not a runtime dispatch caller (`server/services/royaltySplitsDispatcher.ts:15-16,372`). Do not treat that implementation as existing settlement coverage.

##### C5 — Automatic payout capability is not implemented end to end

**Entrypoint/consumer:** the six-hour `payout-drain` job invokes `payoutService.processScheduledPayouts` (`server/services/autonomousJobScheduler.ts:207-212,369`). Scheduling exists; “add a cron” is not a remedy.

**Evidence:** the service sums finalized statements' `payableAmount` (`server/services/payoutService.ts:225-258`), but the actual statement schema exposes `totalEarnings`, not `payableAmount`, currency or detailed revenue fields (`shared/schema.ts:2583-2601`). `royaltyEngine.saveStatement` supplies those absent fields without mapping to `totalEarnings` (`server/services/royaltyEngine.ts:767-792`). Finalized nonempty results therefore cannot provide the intended numeric payable through this consumer. Requests are stored in a process-local map (`server/services/payoutService.ts:320-339`). `executePayment` only logs method names and waits; `processPayout` marks completion and generates a local transaction string (`server/services/payoutService.ts:358-398`). Eligibility compares balance to threshold but not the calculated due date (`:438-487`).

**Impact:** normal statements fail eligibility through invalid amounts; if that is repaired alone, scheduled jobs can issue fictional completion/receipts without moving money. There is no durable paid-statement allocation in this flow. This is both a confirmed implementation defect and a missing real payment capability, not evidence of actual bank payouts.

##### C6 — Refunds and disputes are detached from settlement

**Entrypoint/consumer:** startup registers refund handlers (`server/index.ts:798`; `server/safety/index.ts:151-155`), and `/api/webhooks/stripe` dispatches verified events (`server/routes/webhooks/stripe.ts:766-783`).

**Evidence:** `charge.refunded` and `refund.created` handlers only log and return success. `refund.updated` and dispute updated/closed depend on process-local maps (`server/safety/refundHandler.ts:300-360`). Persistence writes `refund_records`/`chargeback_records`, swallowing database failures (`:247-292`), whereas the active billing service writes `refunds` (`server/services/stripeService.ts:397-411`; `shared/schema.ts:2472-2497`). Its separate `handleRefundWebhook` is not registered/called anywhere in the searched TypeScript (`server/services/stripeService.ts:554-580`). The API refund transaction writes a buyer ledger entry and notification, but no order adjustment, seller liability debit, collaborator reversal or Connect transfer reversal (`server/services/stripeService.ts:452-484`). The seller availability formula ignores refund records/ledger entries (C3). Dispute-created handling submits generic affirmative evidence derived from metadata and catches failures (`server/safety/refundHandler.ts:185-207`).

**Impact:** provider-side refunds may be acknowledged without durable settlement changes; restart loses subsequent-event correlation; seller balances remain withdrawable after reversal; dispute evidence is not established from actual service records. C2 addresses who may request a refund; this finding addresses the independent financial lifecycle after a valid refund/dispute.

##### C7 — Purchased entitlements can be missing or overwritten

**Entrypoint/consumer:** `/api/billing/create-checkout-session` supports yearly/monthly subscription and lifetime payment, but writes only **session** `metadata.planId` (`server/routes/billing.ts:378-412`). The live checkout handler applies entitlement only when `mode === "subscription"` (`server/routes/webhooks/stripe.ts:236-259`): lifetime payment-mode checkout has no corresponding activation branch.

The direct subscription producer writes `metadata.planName` and lifetime PaymentIntent `planName` (`server/routes.ts:6740-6760`), while subscription created/updated handlers read `metadata.planId || "monthly"` (`server/routes/webhooks/stripe.ts:302,359`). Checkout metadata is not automatically subscription metadata; the yearly checkout can initially become yearly, then be overwritten as monthly. The live PaymentIntent success handler only checks/audits an order, not lifetime activation (`server/routes/webhooks/stripe.ts:593-641`). An alternate lifetime handler in `stripeService` does not establish coverage: no runtime caller of `stripeService.handleWebhook` was found. Subscription updates/deletes match customer only (`server/routes/webhooks/stripe.ts:364-373,427-437`), so an older subscription event can also overwrite a newer or lifetime entitlement.

**Impact:** paid lifetime upgrades lack activation in these paths; annual billing can receive monthly tier state; out-of-order/old-subscription events can revoke current access. Registration-after-payment is a separate path and is not asserted broken.

##### C8 — Replay and ambiguous provider outcome are not safe

**Entrypoint/consumer:** all events through `handleWebhookEvent`; automatic transfers and manual payouts through `instantPayoutService`.

**Evidence:** processed-event lookup and marking surround, but do not atomically claim, handler execution (`server/safety/stripeWebhookSecurity.ts:171-223,253-279`). Markers expire after 24 hours and fall back to process-local memory (`:156-160,183-191`), so concurrent deliveries and later replay can execute again. A concrete non-idempotent effect is BOGO redemption increment before the entire checkout handler succeeds (`server/routes/webhooks/stripe.ts:159-175,280-284`). Transfer create has no provider idempotency key (`server/services/instantPayoutService.ts:534-545`); manual payout's options only identify the connected account (`:761-774`). Both catch blocks include local post-provider persistence/notification failures and mark the payout failed (`:547-614,776-821`), even if money was already sent. The per-user 30-second lock (`:653-659`) is not an immutable financial operation identity.

**Refund retry instance:** each HTTP attempt inserts a new refund row (`server/services/stripeService.ts:397-411`) and derives the Stripe idempotency key from that newly generated row (`:435-438`). Thus the key protects retries of one provider call, not retries of the user's refund operation. Repeating a partial-refund request can create another refund while refundable charge balance remains. A provider success followed by the local transaction failure (`:452-487`) further encourages a retry with a new row/key; the existing `reconcile_required` response does not itself enforce reuse of the original operation.

**Impact:** duplicated side effects on concurrent/replayed events, duplicate partial refunds, and additional disbursement after ambiguous outcomes. Refund remediation must durably bind authenticated actor, order and refund-operation identity before provider execution, reject changed payloads under the same identity, and reconcile ambiguous provider outcomes before authorizing another execution (also required for C6). A migration **does** add uniqueness to order payment-intent IDs (`migrations/0013_payment_intent_unique_constraint.sql:1-16`); this report does not claim that protection is absent. It does not make every downstream operation unique.

##### C9 — Production settlement evidence remains a gate

Historical reports are not a substitute for tracing the current code. `reports/platform-regression-current.md:3-16` describes an isolated green unit suite, explicitly not live-provider verification. The current webhook unit test mocks `marketplaceService.processPayment` (`tests/unit/stripe-webhook-honesty.test.ts:69-72`), so it cannot expose C1. A billing lifecycle test returns early if account setup is unavailable (`tests/billing-lifecycle.test.ts:276-285`). `reports/authenticated-flow-verification.md:23` explicitly excludes checkout/purchase. Current migrations include order payment-intent uniqueness, but live application and deployment conformance were not queried.

**Required evidence:** migrations applied with schema parity; raw-body signature verification under deployed routing; real test-mode checkout through fulfillment and books; Connect account/available-balance and transfer/bank-payout distinctions; refund/dispute compensation; duplicate, restart and crash recovery; currency/rounding and reconciled statement totals. This is an unknown deployment state, not a claim of misconfigured keys, absent migrations, or failed tests.

### Evidence: integrations

Source: `reports/readiness-audit/integrations.md`. [Index](#unified-platform-finding-index) · [Domain playbooks](#playbooks-integrations)

### External integrations readiness audit

Date: **2026-09-19**. Scope: distribution gateways, DSP identity/catalog import, social OAuth and external publishing, notification/email/SMS delivery. Read-only source review; only this report was written. No application execution, provider calls, database queries, secret inspection, dependency installation, or workflow changes.

#### Blocker list

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

##### I1 — Submission and delivery claims exceed provider evidence

**Entrypoint → provider → consumer:** `server/routes/distribution.ts:8022-8077`, `:8080-8135`, `:8140-8185` expose `/platform/spotify`, `/platform/apple`, `/platform/youtube`. Each calls the imported `labelgrid-service` (`:26`), records a provider release ID and “submitted at,” and returns `success: true` with an explicit submission/delivery message. `server/services/labelgrid-service.ts:1181-1191` instead returns `simulateCreateRelease` when not configured. That method now honestly returns `status: "draft"` and a locally generated `draft_` ID (`:2175-2188`).

**Impact:** the service-level draft status is not itself the defect; the live route wraps it in an external-submission success claim and persists misleading submission metadata. No real DSP acknowledgement is required. Existing draft-honesty work therefore does not close this route-level defect.

**Configured-path instance of the same root cause:** after a successful distribute call, `server/services/labelgrid-service.ts:1380-1388` fetches delivery status, but a failed lookup or empty parsed outlet list becomes the caller's requested platforms with invented `processing` statuses (`:1395-1405`). The preceding comment correctly notes that LabelGrid delivers to account-configured outlets, not necessarily the requested list (`:1375-1379`). Nonempty real parsed outlet results are preserved; the defect is the fallback, not replacement of every real response. Unknown overall and outlet status strings also normalize to `processing` (`:885-897`, `:900-923`). Therefore even a connected account can appear to be progressing at an outlet without evidence that the provider attempted it. Submission acknowledgement, requested outlet intent, observed provider delivery and unavailable/unknown status must remain separate, with source/time/raw-status provenance.

##### I2 — Non-idempotent remote mutations and late persistence

**Entrypoint → provider:** primary submission calls Too Lost before creating dispatch records (`server/routes/distribution.ts:2072-2077`). Too Lost retries 429, 5xx, timeouts and network errors generically (`server/services/toolost-service.ts:708-737`), including `POST /releases` (`:1273-1288`) and submit (`:1371-1383`). The remote release ID lives inside the service while audio upload and subsequent stages execute (`:1288-1295`). LabelGrid similarly wraps create in generic retry (`server/services/labelgrid-service.ts:601-630`, `:1225-1240`); its catalog reference uses `Date.now()` inside the retried callback (`:1231`).

**Impact:** a response lost after remote acceptance can cause another creation; a later upload/validation/DB failure can leave an orphaned remote draft or submitted release, and retrying the route starts creation again. This is not a claim that providers never deduplicate: neither a durable application operation key nor a verified provider idempotency contract is established by these callers. LabelGrid's newly corrected endpoint/payload work and Too Lost's real submission implementation do not eliminate this failure window.

##### I3 — Completion claims detached from scanner results

**Entrypoint → scanner → consumer:** artist import calls `scanReleasesFromProfileUrl` and returns its coverage to preview/import consumers (`server/services/artistProfileService.ts:2303-2310`, `:2330-2367`). Scanner selection attaches coverage after receiving only a release array (`server/services/distributionDataTransferService.ts:3230-3254`). SoundCloud stops after 100 pages even if `next_href` remains (`:2972-2989`), but coverage always reports complete (`:3361-3368`). Deezer catches scanner errors and returns `[]` (`:2881-2887`), while coverage categorically declares Spotify/Deezer complete (`:3340-3347`). A failed Deezer scan can consequently become “no releases” with complete coverage in the artist service (`server/services/artistProfileService.ts:2313-2329`).

**Impact:** users cannot distinguish an empty catalog from a failed scan or an exhausted cursor from a local cap. Separately, Spotify only enriches the first ten releases and one 50-track page in the examined enrichment block (`server/services/distributionDataTransferService.ts:2380-2387`); release coverage should not be presented as track/metadata completeness. The old 100-release Spotify cap is **not** reported as current: pagination now follows `next` (`:2374-2377`). Bandcamp/Audiomack already report partial coverage (`:3350-3358`); that honesty is not a defect.

##### I4 — Volatile catalog orchestration

**Entrypoint → orchestration → progress:** artist creation starts an unawaited promise and immediately returns 201 (`server/routes/artistProfiles.ts:83-101`). Transfer jobs are process-local maps (`server/services/distributionDataTransferService.ts:490-494`); creation and lookup write/read that map (`:601-628`). Import creates and mutates that job before entering catalog DB work (`:3558-3574`).

**Impact:** a process replacement after profile creation can lose the scheduled discovery, and transfer progress cannot reliably survive restart or be read across replicas. Persisted profile/release rows are not the same as persisted pending work. Existing advisory locking and transaction/savepoint protections (`:3570-3589`) address duplicate writes, not durable scheduling; they should be preserved. This finding does not claim that all linked-profile persistence or every synchronization path is volatile.

##### I5 — Plaintext OAuth credential lifecycle

**Entrypoint → persistence → consumer:** `/callback/:platform` (`server/routes/socialOAuth.ts:430`) stores effective access tokens and refresh tokens directly on updates/inserts (`:1046-1080`). The current comment explicitly explains that publishing/sync consumers require the plain representation (`:1048-1053`). `server/services/socialSyncService.ts:70-82` reads the column directly before refresh, and downstream calls use that token as Bearer credentials (`:472`, `:504`). Some other consumers support encrypted formats (`server/services/socialService.ts:32-56`), so changing only the callback would break a mixed ecosystem.

**Impact:** application/database reads, exports and backups of these columns expose reusable account credentials beyond the minimal publishing boundary. This is an application-level plaintext defect, not evidence that disk encryption is absent or that credentials have leaked. All callback platform instances share this root cause; access tokens, refresh tokens and platform-specific page-token overrides must be included in migration.

##### I6 — External social action recovery gap

**Entrypoint → scheduler → provider:** autopilot schedules through V2 (`server/services/autopilotPublisher.ts:726-733`). Startup reloads only `pending` posts (`server/services/autoPostingServiceV2.ts:79-94`). Processing writes `posting`, executes external calls, and only afterwards saves results (`:113-124`). Worker reads use `queuePop`, with no acknowledgement/recovery protocol in this worker (`:201-234`). Per-platform provider errors become result objects (`:334-345`); exceptions mark the whole post failed (`:195-198`).

**Impact:** a restart after `posting` but before saved results leaves a record outside startup reload. A restart after provider acceptance but before local receipt storage creates an ambiguous action; blindly replaying the whole post can duplicate already-published platforms. Partial successes are persisted only after all calls finish. Whether the separate queue service internally redelivers is a verification gate, but that alone cannot reconcile remote acceptance or recover this DB state safely.

##### I7 — Notification preference contract mismatch

**Entrypoint → preferences → delivery:** the registered API returns nested `email.enabled/categories`, `push.enabled/categories`, `muteAll`, quiet hours and SMS preferences (`server/routes.ts:3313-3405`), and writes the supplied preference object (`:3444-3453`). `NotificationService.send` instead checks flat `preferences.email && preferences[type]` and `preferences.browser && preferences[type]` (`server/services/notificationService.ts:67-81`). Producers use event names such as `release_submitted` (`:947-962`), not those flat default booleans. Sending then calls Resend/browser methods (`:96-110`) and records an in-app notification irrespective of those external-channel checks (`:83-94`).

**Impact:** normal nested preferences cannot reliably enable intended mail/push; legacy top-level event flags may allow an email even when nested `email.enabled` is false because an object is truthy. `muteAll`, category mapping and quiet hours are not consulted by this send path. The newer push dispatcher has preference handling; this does not automatically repair callers of NotificationService. Its explicit `emailSent` and provider-error checks (`:151-178`) are improvements and are not described as false-success defects here.

##### I8 — SMS notification channel missing after verification

**Entrypoint → claim → missing dispatch:** SMS confirmation persists verified phone state and responds “SMS notifications are now active” (`server/routes.ts:3967-3984`). API defaults expose SMS category settings (`:3372-3379`). `NotificationService.send` exposes only in-app, email and browser results/branches (`server/services/notificationService.ts:50-55`, `:96-128`); `NotificationDispatcher` describes/routes web, desktop and mobile push (`server/services/notificationDispatcher.ts:1-13`, `:28-35`), not SMS. Server TypeScript searches found Twilio sends in phone-verification endpoints, not a business-notification SMS dispatcher.

**Impact:** successful verification is not SMS alert delivery. Treat general SMS notifications as incomplete, not Twilio Verify itself as broken. A separate unexamined deployment-side sender could change this conclusion; no such delivery consumer was established in the inspected source.

##### I9 — No supported payout execution behind the mounted actions

**Entrypoint → service → provider boundary:** `POST /api/distribution/earnings/payout` validates the request and calls `requestPayout` (`server/routes/distribution.ts:7314-7338`); `POST /api/distribution/royalties/payout` does the same (`:7456-7474`). Configured `requestPayout` always throws because LabelGrid has no payout-request API endpoint and requires its dashboard (`server/services/labelgrid-service.ts:2032-2048`). The unconfigured branch calls `simulateRequestPayout`, which also always throws (`:2268-2275`). Its advice to set a token to enable payouts is contradicted by the configured branch. Both route error handlers turn these messages into an unavailable response (`server/routes/distribution.ts:7343-7351`, `:7486-7494`).

**Impact:** neither action can execute a payout with or without a token. This is an honest failure but an unfinished execution capability, not a missing-secret verification gate and not proof of an internal accounting defect. A supported external execution workflow must replace the impossible API call; a message-only change is not completion. Dashboard execution is the supported mechanism identified in current source. Any alternative provider-assisted or replacement-provider mechanism below requires documented contractual support before implementation; none assumes an undocumented LabelGrid endpoint exists.

### Evidence: ai-media

Source: `reports/readiness-audit/ai-media.md`. [Index](#unified-platform-finding-index) · [Domain playbooks](#playbooks-ai-media)

### AI, MaxCore, media and analytics readiness audit

Date: 2026-09-19. Method: read-only examination of current source; no runtime, provider, database, credential-value, or heavyweight test inspection. MaxCore is the sole AI authority; the Max assistant is exempt. Deployment packaging and general persistence are outside this domain. This is a source audit, not certification of the running remote model.

#### Blocker list

##### AM-1 — Fabricated A/B performance and locally authored AI variants

**CONFIRMED defect · P1 · High confidence.** Release scope: social AI A/B generation and any ranking/selection based on its scores.

`server/services/aiContentService.ts:1098-1109` substitutes the input text when MaxCore's response lacks usable output. Lines `1111-1132` locally transform its tone; `1135-1140` assign each variant a random 75–95 predicted performance score. Lines `1152-1156` attach fixed explanation confidence of 0.9. These are not measured outcomes or MaxCore prediction outputs. Both HTTP consumers map these numbers to `predictedEngagement`: `server/routes/socialAI.ts:700-710` and `725-750` (POST `/ai-content/ab-variants`, plus the preceding GET handler). Route registration exists at `server/routes.ts:7257-7258`.

Impact: arbitrary numbers can influence content decisions; local rewriting violates sole-authority requirements when presented as generated AI variants. This is a remaining live fabrication, unlike historical engagement heuristics now behind an unconditional error.

##### AM-2 — Predictive analytics and engagement capabilities have no working authoritative contract

**CAPABILITY GAP · P1 · High confidence.** Release scope: engagement/best-time predictions, AI analytics/forecasting, A&R forecast and release-timing promises. Ordinary observed analytics are not implicated.

The canonical Python engagement entrypoint unconditionally returns 503 at `external/maxcore/artifacts/ai-training-server/server.py:8569-8579`; historical heuristics below it are unreachable, not current fabrication. The Node proxy forwards that endpoint at `external/maxcore/artifacts/api-server/src/routes/model-proxy.ts:1513-1514`. The autopilot adapter independently throws at `server/services/aiModelManager.ts:137-142`; its consumer is `server/routes/autopilot.ts:392`. Unified prediction is consumed at `server/routes/ai.ts:342`.

Related missing authoritative contracts are explicitly enforced by `server/services/aiAnalyticsService.ts:7-10`: metric prediction (`101`), churn (`234`), revenue forecast (`325`), anomalies (`397`), business insights (`467`), career growth (`664`), milestones (`799`), fanbase insights (`874`), and release strategy (`1059`). Public consumers include `server/routes/ai.ts:393-432,776-785,796-858`; metric forecasting also throws at `server/services/unifiedAIController.ts:937-942`. The direct analytics-insights handler throws without calling an upstream model. A&R `/trend-forecast` and `/release-timing` return 501 at `server/routes/arIntelligence.ts:69-77,189-197` because performance/audience sources are absent.

Impact: advertised predictions cannot complete; confidence-gated decisions cannot obtain genuine scores. Honest unavailable responses are the correct current behavior, not a defect to “fix” by restoring random/local fallback. All named instances need capability-specific acceptance, even if implemented on a shared MaxCore platform.

##### AM-3 — Requested video narration/audio may silently disappear

**CONFIRMED defect · P1 · High confidence.** Release scope: MaxCore videos requested with voiceover or generated audio.

`external/maxcore/artifacts/ai-training-server/server.py:9618-9648` returns `None` on failed speech synthesis and logs rather than surfacing failure. The auto-soundtrack helper similarly permits silent output (`9665-9674`, exception handling at `9691`). The primary video consumer only changes audio and marks voiceover when a path exists (`10441-10464`). The render-only path does likewise for generated audio and requested narration (`10952-10983`) and continues rendering. Video extension also calls the soundtrack helper (`10716`).

Impact: a playable file is not fulfillment of a narration/audio request. The shown callers do not enforce requested versus delivered audio before rendering; the render-only path marks a successful render `done` at `10989-10998` without verifying audio fulfillment. A missing dependency/dataset can therefore produce a semantically incomplete successful artifact. This is not an assertion that every silent video is wrong: intentionally silent requests remain valid.

##### AM-4 — Image-to-video accepts assets/options that the active MaxCore handoff drops

**CONFIRMED defect · P2 · High confidence for payload loss; downstream visual impact requires integration verification.** Release scope: multi-image music-video generation and its advanced controls.

The authenticated `/generate-music-video` upload accepts ten images (`server/routes/socialMedia.ts:5375-5383`). The active `imageToVideoService` forwards only the first three (`server/services/imageToVideoService.ts:608-615`); its “last frame” is the last of those three, not the last uploaded image (`629-631`). Its options promise `voiceSynthPath`, `logoPath`, `beatSync`, `colorGrade`, and `transitionType` (`183-188`), but the full active MaxCore call (`616-639`) forwards none of them. The route supplies advanced options, including beat sync and color grade (`server/routes/socialMedia.ts:5529-5538`).

Impact: accepted inputs are not faithfully represented in the generation request. Local legacy helpers are not proof these options work: the active entrypoint returns the MaxCore result directly. Motion intensity is **not** a finding: it is correctly mapped at `633-638`, despite an obsolete helper comment claiming otherwise.

##### AM-5 — Native model loading does not establish trained, compatible, qualified readiness

**VERIFICATION GATE · P1 · High confidence in missing initialization gate; unverified live checkpoint condition.** Release scope: all native-model inference and training-readiness claims.

The canonical initializer filters checkpoint tensors by matching name and shape, then loads with `strict=False` (`external/maxcore/artifacts/ai-training-server/server.py:852-868`); the fallback repeats this and explicitly supports random initialization (`889-901`). Initialization records whether a weights path exists, then sets `_model_ready = True` (`949-956`). The readiness wait returns immediately for that flag (`416-426`). This establishes construction, not checkpoint completeness, training lineage, or task quality. It does **not** prove production currently serves random weights.

Impact: startup success alone is insufficient release evidence. Require checkpoint identity, compatibility coverage, provenance and held-out task results before approving inference. Training loss is not automatically fabricated: current training updates calculate loss/perplexity from trainer/evaluation results (`server.py:2781-2799`); no allegation of fake loss is made.

##### AM-6 — Audio render errors can leave jobs retrying forever

**CONFIRMED defect · P1 · High confidence.** Release scope: MaxCore audio generation job completion, caller polling, and resource availability.

The canonical audio job deliberately loops until render succeeds (`external/maxcore/artifacts/ai-training-server/server.py:10070-10085`). Exception handling counts repeated errors but remains in the loop, records status `rendering`, and sleeps with a bounded delay rather than a bounded retry budget (`10086-10111`). At five repeated errors it requests watchdog attention, but that hook is optional/best-effort and the loop continues (`10092-10104`); escalation is not a completion bound. Terminal `done` is only reached after escape (`10112-10118`). No cancellation/deadline check exists inside this loop.

Consumer example: studio audio style transfer calls `/api/generate/audio` via MaxCore (`server/services/aiAudioGeneratorService.ts:230-262`). Impact: a permanent renderer/input error can consume a worker indefinitely and strand a user job, even if the outer HTTP client times out. This finding concerns execution semantics, not job persistence or deployment.

### Evidence: data-runtime

Source: `reports/readiness-audit/data-runtime.md`. [Index](#unified-platform-finding-index) · [Domain playbooks](#playbooks-data-runtime)

### Data/runtime production-readiness audit

Date: 2026-09-19. Scope: database evolution, backup/recovery, PDIM storage durability and deletion, queue recovery, and session backing. Read-only source audit; no live database/provider calls, secret reads, application changes, workflow operations, or test executions.

#### Blocker list

Priorities are release decisions, not claims that an incident has occurred. P0 = do not rely on the affected recovery/data-retention promise; P1 = resolve before launching the affected capability; P2 = follow-up. Confidence describes the source conclusion, not knowledge of deployed infrastructure.

| ID | Classification / priority | Blocker | Affected release scope | Confidence |
|---|---|---|---|---|
| D1 | CONFIRMED defect / P0 | Backup objects and their catalog are written under generated keys but subsequently read using different, fixed keys. | Application-managed database backups and backup automation | High |
| D2 | CONFIRMED defect / P1 | Backup scheduling is not wired in current server sources; backup target selection differs from application DB selection. | Scheduled backups, especially installations using NEON_DATABASE_URL | High for source wiring and selection; runtime schedule unverified |
| D3 | CAPABILITY GAP with confirmed helper defect / P1 | No demonstrated end-to-end safe restore workflow; existing helper can report success after SQL errors. | Disaster-recovery readiness claims | High for helper behavior; recovery operations unverified |
| D4 | CONFIRMED defect / P0 | External PDIM treats unreadable/corrupt recovery state as absent and proceeds; AOF replay can skip failed records; streams are excluded from persistence. | Deployments with external/pdim enabled as durable Redis-compatible state | High |
| D5 | CONFIRMED defect / P1 | External fabric deletion removes authoritative metadata before cleanup is recoverable and decrements capacity after failed physical deletion. | External fabric object deletion, deduplicated storage and capacity accounting | High |
| D6 | CONFIRMED defect / P1 | Session save/delete callbacks acknowledge before durable backing operations complete; PG errors are swallowed even in PG-only mode. | Session continuity across worker handoff/restart and backing-store outages | High |
| D7 | CONFIRMED defect / P1 | Retention-worker startup cleanup can drain valid queued work along with malformed jobs. | Retention queue startup/restarts and multi-worker operation | High |
| D8 | VERIFICATION GATE with confirmed tooling defect / P1 | Schema rollout provenance is incomplete; checked-in migration journal stops before later SQL, and the merge push pipeline masks command failure. | Releases needing schema changes; fresh installs and upgrades | High for repository facts; deployed schema unknown |

No source evidence here establishes current production data loss. D1/D4 are P0 specifically for trusting backup/recovery or durable-state guarantees, not an assertion that every platform route must be offline.

##### Evidence, entrypoints and impact

**D1 — Backup addressing and catalog integrity.** Mounted entrypoint: `server/routes.ts:7209-7212`; creation/list consumers: `server/routes/backup.ts:11-25`; automation consumer: `server/automation-system.ts:572-575`. `server/services/backup/databaseBackupService.ts:23-38` reads `database-backups/index.json` but writes it through `uploadFile`. That API actually generates `category/UUID/filename` (`server/services/storageService.ts:197-205`); fixed-key writing is a separate API (`:208-214`). The dump writer likewise passes its intended key as category and MIME type as filename, ignores the returned actual key, and records the intended key (`server/services/backup/databaseBackupService.ts:185-193`). Thus both the dump reference and index address are wrong, independently of provider health. Also, all index-read failures become an empty index (`:23-29`), concurrent writers read/modify/overwrite (`:189-191`), and failed retention deletes still disappear from the catalog (`:203-214`). Successful creation does not establish a retrievable backup; listing, retention and restore can lose discoverability. These are one backup-object/catalog contract root cause, not separate artificial findings.

**D2 — Backup orchestration and target identity.** `server/services/backup/databaseBackupService.ts:44-60,72-85` requires `initialize()` to register the schedule. The module only exports a constructed instance (`:291`); current source search found create/list/metrics consumers, but no call to that initializer. The route comment claiming initialization in index (`server/routes/backup.ts:8`) is not executable evidence. Metrics return constants, not last-success observations (`server/services/backup/databaseBackupService.ts:273-280`). Separately, the running application's config chooses `NEON_DATABASE_URL || DATABASE_URL` (`server/config/defaults.ts:173-174`), while backup enablement/dump/restore use only `env.DATABASE_URL` (`server/services/backup/databaseBackupService.ts:45,88-100,228`). When these differ, backup may target another database; when only the preferred variable exists, backup is refused. Provider-managed backup may exist outside this repository; that is unverified and does not repair the application claim.

**D3 — Restore workflow.** `server/services/backup/databaseBackupService.ts:221-251` downloads SQL and invokes `psql ... -f ...`, without `ON_ERROR_STOP`, a clean-target provision step, or database validation before resolving success on exit zero (`:228-240`). Standard psql scripting can continue after SQL statement errors unless configured to stop, so process success is insufficient evidence of a complete restore. Search found the method definition but no current caller. The mounted backup router offers creation/list/metrics only (`server/routes/backup.ts:10-40`); therefore this is not presented as an exposed restore endpoint bug. It is a recovery capability gap plus an unsafe helper that must not be adopted unchanged. The 24-hour RPO / 30-minute RTO are declared targets (`server/services/backup/databaseBackupService.ts:13-14,273-280`), not measured recovery results. Dump creation also has an explicit 1-GiB ceiling (`:155-171`), which constrains recoverable scale unless another complete backup route exists.

**D4 — Fail-open recovery.** External API command consumer: `external/pdim/artifacts/api-server/src/routes/redis.ts:252`; existing instance initialization calls `store.load()` (`external/pdim/artifacts/api-server/src/redis/manager.ts:87-88,166-167`). `external/pdim/artifacts/api-server/src/redis/store.ts:272-308` catches any snapshot read/parse error as a fresh store; `:333-345` treats unreadable AOF as nothing to replay; `:349-361` continues after a replay command fails. A missing snapshot, storage outage, corrupt snapshot and incomplete replay are not distinguished. A snapshot parse/load failure can leave empty or partially populated state eligible for service. Subsequent mutations can persist incomplete state; no safe-recovery barrier is shown on this path. Existing AOF and snapshots are real, not absent: snapshot scheduling is five seconds and AOF flush scheduling one second (`:315-329`), and AOF writes go through fabric (`:406-427`). Those timers are not a hard RPO bound under storage latency/failure. Crash durability, consistent recovery and acceptable acknowledged-write loss remain verification gates even after correcting the fail-open path.

**D4 stream contract qualification.** Stream mutations are intentionally excluded from the AOF (`external/pdim/artifacts/api-server/src/redis/store.ts:62-68`); stream entries are skipped on snapshot load (`:285-287`) and snapshot creation (`:569-572`). Thus repairing recovery error handling alone cannot provide durability for every supported Redis command/type. Each remediation below must either persist stream entries and all supported stream metadata/mutations, or migrate durability-requiring stream consumers to a durable authority while explicitly retaining an ephemeral contract only for consumers that require no persistence. Existing stream state must be exported before restart/cutover where recoverable; already lost state cannot be reconstructed without another authoritative source. This finding applies only when the external PDIM backend is enabled. Stream exclusion alone is not evidence of BullMQ job loss; D7 rests on its separate, directly observed queue-drain path.

**D5 — Delete/usage accounting.** Consumer: external fabric delete route `external/pdim/artifacts/api-server/src/routes/fabric.ts:389`. `external/pdim/artifacts/api-server/src/pocket-dimension/fabric/PocketStorageService.ts:1109-1139` claims the object by deleting its index row first, then releases chunk references. A crash or exception between those actions leaves work without its original object row; a retry returns early because the object is absent (`:1114-1115`). Physical deletion errors are swallowed and node usage is reduced anyway (`:1124-1129`). This can strand bytes/references and under-report usage. The atomic single-winner object deletion is a genuine existing improvement; the remaining defect is absence of durable cleanup progress across metadata and physical storage, not double-deletion of the same object row. No claim is made that every app-side storage route reaches this external fabric; scope is explicitly that backend.

**D6 — Durable session acknowledgments.** Store selection/fallback is in `server/middleware/sessionConfig.ts:764-790`. PDIM-backed `set` populates process L1, starts best-effort PG work, calls success, and then invokes the PDIM write (`:588-608`). PG helpers catch database failures (`:59-81`); PDIM destroy also starts a best-effort PG delete (`:611-614`). PG-only `set`, `destroy` and `touch` acknowledge immediately (`:732-755`), even though PG is their sole durable backing. PG reads also flatten errors into absence (`:43-56`). A just-acknowledged session can disappear after process failure or worker handoff; backing-store outages are hidden from callers. This is a persistence/consistency finding, not an audit of login authorization, cookie policy or session revocation policy.

**D7 — Queue recovery deleting legitimate work.** Actual startup consumer: `server/index.ts:1167-1171`. Broker selection supports native Redis and PDIM (`server/lib/redisClient.ts:86-107`). `server/lib/scaleJobQueue.ts:106-120` identifies malformed waiting jobs, but if more than ten are found calls `queue.drain()`, removing *all* waiting jobs, including named legitimate jobs. The worker is started immediately and cleanup scheduled five seconds later (`:161-175`), contradicting comments that cleanup precedes processing. Another replica can also have newly enqueued work at that time. The same cleanup requests zero-grace active cleanup (`:93-100`); actual removal of locked active jobs depends on broker/BullMQ semantics and is not asserted here. The proven waiting-job drain alone is sufficient. Recurring schedules do not reconstruct arbitrary queued payloads or the exact lost run.

**D8 — Schema provenance.** Supported `db:push` script delegates to schema push (`package.json:37`; `scripts/db-push.js:1-13`); `drizzle.config.ts:18-21` identifies shared schema and migrations output. `migrations/meta/_journal.json:40-48` ends at 0005, while later checked-in changes include `migrations/0010_add_soft_delete_to_user_storage_files.sql`, `0013_payment_intent_unique_constraint.sql`, `0017_marketplace_money_loop.sql`, and `0018_social_reply_templates.sql:8-31`. This does not prove those changes are missing from a live database: push and manual SQL can apply them. It does mean journal-based rollout cannot be assumed to cover them. `scripts/post-merge.sh:4,9-12` pipes push to `tail` without `pipefail`; upstream push failure can appear successful, and its fallback only warns. Deployed schema, custom SQL/data changes, constraints and index parity need independent release evidence. No live schema was queried.

### Evidence: deployment

Source: `reports/readiness-audit/deployment.md`. [Index](#unified-platform-finding-index) · [Domain playbooks](#playbooks-deployment)

### Deployment and operational readiness audit — 2026-09-19

#### Blocker list

Read-only source audit. No release, settings change, dependency installation, application execution, live database/provider query, secret inspection, or load test was performed. Only this report was written. Prior task proposals and comments describing earlier successful deployments are not acceptance evidence. Production state is **unknown**, not presumed broken: the source deployment contract was inspected, but deployment metadata, actual image, provider settings, DNS answers and certificates were not queried.

Scope: build/release, `start.sh`, capsules, portability, resource sizing, health/readiness, monitoring, CI/load confidence and DNS/TLS. P1 means resolve before the affected production release; P2 means a lower-urgency improvement. No independently evidenced P0 in this scope. Alternatives below are choices, not four sequential phases of one solution. Each requires validation; none guarantees a first-attempt fix.

##### DEP-01 — The active build does not establish a complete, current runtime artifact set

**CONFIRMED defect · P1 · scope: fresh builds, gateway-dependent features, relocation to minimal runtimes · confidence: high for build omission; medium for resulting outage in any particular deployment.**

- Actual entrypoint: `.replit:173-176` selects a VM, runs `bash start.sh`, and builds with `DEPLOY_PACK=1 npm run build`; `package.json:17,24` maps these commands. It does **not** select legacy `build.sh`.
- `script/build.ts:16-47` compiles frontend, server and cluster only. Its later packing step describes including existing `dist/gateway.mjs` and the Boosterstate binary (`script/build.ts:171-202`), not regenerating them. `start.sh:184-195,257-265` executes those artifacts. The workspace tracks `dist/gateway.mjs` and `bin/boosterstate`; presence is not source/build correspondence.
- Portable Node is preferred by `start.sh:27-38`, with a fatal exit if every candidate fails (`start.sh:77-86`). The active build has no Node bundling step; the old one is in `build.sh:17-51`. `.dockerignore:186-193` excludes `.node_bin`, while `script/lib/dockerignoreScan.ts:34-40` also deliberately leaves it outside the remainder capsule.
- Impact: gateway/Rust source edits can leave a release executing an older binary; a minimal runtime without a usable platform Node cannot boot. This is **not** proof the current live runtime lacks Node or that the checked-in binaries are currently stale. It is a missing reproducibility/provenance contract.

##### DEP-02 — Python feature readiness can be permanently decided before its background runtime arrives

**CONFIRMED defect · P1 · scope: Python-backed audio/video features and enabled legacy sidecar on cold capsule boots · confidence: high for the race and fail-open build; runtime manifestation depends on timing.**

- `script/build.ts:77-114` downloads Python and installs floating package constraints, but catches failure, removes the runtime and continues the full-platform build. `start.sh:144-178` starts background restoration and immediately tries to activate Python without waiting.
- `dist/pdim-restore.mjs:726-732` restores Python in the background; background boolean results are not evaluated before announcing completion. This is distinct from the correctly checked critical tier at `dist/pdim-restore.mjs:709-725`.
- `server/services/pythonPath.ts:16-38` resolves the executable once at module initialization and exports fixed `PYTHON`/`PYTHON_AVAILABLE`; a later capsule completion does not refresh those constants. `start.sh:205-242` likewise attempts the optional legacy sidecar once.
- Impact: an otherwise valid Python capsule can arrive too late, leaving a process pinned to no Python or a system interpreter without the required modules until restart. Build-time Python failure can also ship a release missing advertised functionality. No claim is made that every Python consumer uses this helper or that the optional sidecar is enabled live.

##### DEP-03 — Periodic readiness checks temporarily withdraw healthy instances and can overlap

**CONFIRMED defect · P1 · scope: `/ready`, `/readyz`, `/status` consumers and production readiness-based routing · confidence: high.**

- Entry: `server/index.ts:100-101` starts staged probes; `server/startup-probes.ts:287-308` launches an asynchronous run every 30 seconds without an in-flight guard and immediately assigns `phase = "connecting"`.
- `server/startup-probes.ts:357-364,446-461` returns readiness only for `phase === "ready"`, and otherwise HTTP 503. Consequently even a previously healthy instance becomes not-ready during every refresh.
- A check can exceed the interval: the database probe permits five 5-second attempts plus backoff (`server/startup-probes.ts:100-149`), and local MaxCore readiness polls for up to 60 seconds (`server/startup-probes.ts:235-258`). Concurrent generations mutate shared probe state.
- Impact: transient routing withdrawal, false alerts and out-of-order readiness decisions during slow dependencies. The present implementation does periodically refresh and does reject degraded status; historical “readiness never refreshes”/“degraded is ready” claims are not current findings.

##### DEP-04 — CI does not enforce the shipped deployment lifecycle or the stated load-quality result

**CONFIRMED defect plus CAPABILITY GAP · P1 · scope: release promotion confidence for the complete web/worker/capsule platform · confidence: high for workflow semantics, unknown for repository branch-protection configuration.**

- `.github/workflows/ci.yml:153-169` runs the ordinary build without `DEPLOY_PACK=1`; artifact-presence checks use `test ... && echo success || echo missing`, so missing artifacts produce successful shell commands.
- `.github/workflows/ci.yml:281-304` starts `tsx server/index.ts`, not `start.sh`/the cluster/capsule runtime, and waits on always-live `/health` (`server/startup-probes.ts:402-403`), not route/dependency readiness.
- The CI summary prints failure but does not exit nonzero (`.github/workflows/ci.yml:321-345`). Individual failing jobs still fail; this is dangerous specifically if only the summary is required. Required status checks were not inspected.
- `tests/load/load-test.ts:105-109,232-252` hardcodes localhost, exercises a 60-second/50-user public-read workload, and exits successfully at 95% HTTP success without enforcing latency. Request execution has no timeout there. This cannot establish authenticated transaction/worker/soak capacity or tail-latency acceptance. `package.json:55-59` exposes that script as `test:load` and includes it in `test:all`.
- Impact: a green subset/summary or basic development-server test is insufficient evidence for packed cold boot, source-to-binary correspondence, sidecars, rolling shutdown or production SLOs. This audit does not claim all tests fail or that no other workflow performs useful tests.

##### DEP-05 — Resource sizing is host-based and independently allocates shared capacity

**CONFIRMED portability defect; production capacity VERIFICATION GATE · P1 · scope: constrained containers/VMs and co-located app + MaxCore workers · confidence: high for calculation, medium for actual overcommit.**

- `server/computeSizing.ts:43-68` uses `os.cpus().length` and `os.freemem()`, not effective process CPU quotas/cgroup memory limits, and lets a positive override bypass all calculated bounds.
- App workers use the shared helper with a per-worker memory estimate (`server/cluster.ts:301-320`), but MaxCore requests all CPUs with `reserveCore:false` and no memory estimate (`server/services/maxcoreLocalSupervisor.ts:225-241`). Sharing the formula is not a shared resource reservation.
- `server/cluster.ts:347-355` gives each worker a minimum 512 MiB heap even when the calculated budget is smaller. `start.sh:294-300` independently permits a default 4 GiB primary heap.
- Impact: on quota-constrained hosts or simultaneous app/AI startup, the processes can collectively exceed the effective budget and trigger OOM, throttling or latency collapse. Existing worker heap clamping is acknowledged; it does not prove aggregate capacity safety. Purchased production resources and actual peak RSS/disk usage were not inspected.

##### DEP-06 — Sentry silence watchdog never reaches its threshold if delivery has never succeeded

**CONFIRMED defect · P1 · scope: initial deployment or restart with an unavailable error-reporting transport · confidence: high.**

- Entry: `server/instrument.ts:266-278` schedules heartbeat attempts hourly. Every attempt overwrites `lastSentryHeartbeatAttemptAt` (`server/instrument.ts:204-206`).
- Before any success, `getSentryHeartbeatStatus()` measures silence from that **latest** attempt (`server/instrument.ts:240-252`), but the threshold is 24 hours (`server/instrument.ts:199-202`). Repeated failed hourly attempts keep age below the threshold.
- The independent page dispatch runs only when `isSilent` is true (`server/instrument.ts:281-305`). Thus a transport that has never succeeded does not page through this watchdog, although local warnings occur.
- Alert channels are also configuration-dependent (`server/monitoring/alertingService.ts:33-38,79-101`); actual delivery/recipient configuration remains a verification gate. This is not a claim that silence detection is absent: it exists and covers the post-success branch.
- Impact: operators can lose error visibility from the beginning of a release without the intended independent silence page.

##### DEP-07 — Public-origin and custom-domain DNS/TLS acceptance remains unverified

**VERIFICATION GATE · P1 for an internet launch/custom-domain release · scope: published primary origin, storefront domains, callbacks/webhooks and certificate renewal · confidence: high that source cannot establish external readiness; no confirmed live DNS/TLS failure.**

- Primary VM deployment is declared at `.replit:173-176`, but this is workspace configuration, not proof of publication, visibility, routing, domain ownership or a valid chain.
- Custom storefront provisioning calls ACME at `server/services/storefrontDnsService.ts:720`; the renewal worker is registered at `server/index.ts:1150`. `server/services/acmeClient.ts:38-47` defaults ACME to disabled and the staging directory. These are appropriate safe defaults, **not proof of production misconfiguration**.
- `server/services/acmeClient.ts:517-568,587-595` contains renewal coordination/sweeps, but source cannot prove authoritative DNS delegation, CA challenge reachability, trusted certificate termination or successful renewal.
- `tests/smoke/post-deployment-tests.ts:15,85-100` allows a configurable URL and tests readiness, but does not by itself prove the complete domain/CA lifecycle.
- Impact if the gate is skipped: a valid application image can remain inaccessible, untrusted, privately gated against callbacks, or fail after certificate expiry. Platform-managed primary TLS and application-managed storefront TLS must be verified separately; enabling app ACME is not automatically the remedy for the primary origin.

### Evidence: product-autonomous

Source: `reports/readiness-audit/product-autonomous.md`. [Index](#unified-platform-finding-index) · [Domain playbooks](#playbooks-product-autonomous)

### Product UX and autonomous-systems readiness audit

Date: 2026-09-19. Method: current-source, read-only inspection; no application changes, executions of simulations, browser tests, service calls, secret inspection, or live database access. This is the product/autonomous portion of a platform audit, not a certification of every route. Historical simulation results below are reported results, not newly reproduced results. Task proposals/cancellations are not evidence.

#### Blocker list

| ID | Finding / classification | Priority; release scope; confidence |
|---|---|---|
| PA-1 | Settings theme selector persists a different state from the actual theme consumer. **CONFIRMED defect** | P2; settings/appearance release; high |
| PA-2 | Concurrent preference edits can restore a stale whole-form snapshot after a failure. **CONFIRMED defect** | P2; settings preference editing; high |
| PA-3 | Security healing cannot execute session invalidation, circuit breaking, or feature isolation. **CAPABILITY GAP** | P1; autonomous security containment claims, not every platform release; high |
| PA-4 | Evolution only has live consumers for posting/content knobs, not its other declared enhancement categories. **CAPABILITY GAP** | P1; broad autonomous feature/distribution/compliance evolution claims; high |
| PA-5 | Evolution post-apply validation measures local liveness, not the changed consumer's correctness. **CAPABILITY GAP** | P1; unattended evolution promotion; high |
| PA-6 | Latest simulations are component/fixture evidence, not deployment integration acceptance. **VERIFICATION GATE** | P1; production promotion of evolution, security healing and autofix; high for evidence boundary, unknown live outcome |

No P0 defect established in this domain. P2 items should be fixed for the advertised UX; they do not imply the entire platform must stop serving. Capability gaps block the named capability claims until implemented and accepted. None of the alternatives below is a guaranteed first-attempt fix.

##### PA-1 evidence and impact

Entrypoint `/settings`: `client/src/App.tsx:233`. The Appearance selector calls `handlePreferenceChange("theme", value)` (`client/src/pages/Settings.tsx:1276-1306`). That handler updates page-local state and PUTs the account preference, then invalidates the preference query (`client/src/pages/Settings.tsx:431-455`). The server really persists it (`server/routes.ts:913-961`), so this is not a fake save.

Actual rendering instead uses `ThemeProvider`, mounted at `client/src/main.tsx:81-122`. It initializes exclusively from localStorage and changes DOM classes from its own state (`client/src/contexts/ThemeContext.tsx:15-53`); its setter writes that localStorage key (`:69-72`). The Settings path does not call this setter. Result: a successful Appearance save need not change the displayed theme, and reload still reads the unrelated local value. This is an inert *effect*, not an unhandled button. Cross-device account preference and local theme can disagree.

##### PA-2 evidence and impact

Active Studio Preferences controls invoke an unrestricted async handler (`client/src/pages/Settings.tsx:1276-1280,1328-1334,1401-1404`). Each call captures the entire `preferences` object, optimistically changes one key, and on failure reinstates the whole captured object (`:431-455`). Query results also replace the object (`:351-362`). With edits A then B, successful B followed by failing A can overwrite B's displayed success after B's refetch has completed; repeated same-key writes can also complete out of intent order. This establishes a frontend race, not a claim that database JSON merge is broken: `server/routes.ts:955-961` merges supplied preferences.

The similarly shaped notification handler at `client/src/pages/Settings.tsx:403-428` is not counted as a second active defect: the notifications tab mounts `NotificationPreferences` at `:1256-1258`, rather than proving that handler is reachable. Scope here is the active preference controls only.

##### PA-3 evidence and impact

`SelfHealingSecurityEngine` explicitly throws unsupported errors for `session_kill`, `circuit_break`, and `feature_disable` (`server/services/selfHealingSecurityEngine.ts:749-770`). Session kill is actually proposed in the response plan (`:654`); the other two are declared action types (`:63-65`) and unsupported dispatch cases, not proven reachable automatic plans. They are grouped because the root cause is missing enforcement adapters. Operator consumer is `/admin/autonomy` (`client/src/App.tsx:251`), whose self-healing queries are at `client/src/pages/AdminAutonomy.tsx:422-435`.

IP blocking and finite rate limiting exist (`server/services/selfHealingSecurityEngine.ts:720-747`); do not describe all security healing as a stub. Current unsupported actions honestly fail, rather than falsely claiming completion. Remaining impact: a compromised session cannot be revoked through this engine and affected features/dependencies cannot be isolated through these action types. Security provider/authentication implementation details belong to the primary security audit; this finding is the autonomous enforcement contract.

##### PA-4 evidence and impact

`server/services/evolutionRegistry.ts:27-43` declares five categories but marks only `posting_optimization` and `content_optimization` consumed. `:45-76` enumerates effective fields. `distribution_config`, `platform_compliance`, and `feature_flag` are therefore advisory, not live enhancements. Genuine consumers exist at `server/autopilot-engine.ts:361,684,721` and `server/autonomous-autopilot.ts:410,610`. Deployment differentiates application from advisory recording (`server/self-evolution-engine.ts:2257-2325`).

Entrypoint/consumer: `/admin/autonomy` and the evolution deploy path. Impact: a release promising autonomous distribution, compliance or feature delivery exceeds implemented behavior. This is not the historical false-applied-count bug, nor proof that arbitrary generated source is deployed. AI/provider availability belongs to its primary domain and is not duplicated here.

##### PA-5 evidence and impact

`monitorDeploymentHealth(appliedUpgradeIds)` makes one loopback `/api/health` request, accepts any 2xx, discards the body, and records `errorRate: 0` (`server/self-evolution-engine.ts:2384-2417`). Fast responses return true (`:2429-2431`); slow/error paths invoke rollback analysis (`:2419-2440`), whose thresholds are error rate >5% or latency >3000ms (`:2445-2456`).

The server can remain healthy while newly changed posting hours/content knobs are unsuitable or generation fails. This gate contains no check of those outcomes. The status handling and canary-ID rollback are improvements, not regressions to relist. Impact is insufficient autonomous promotion evidence, not proof that a particular applied upgrade harmed production.

##### PA-6 evidence and impact

Current tests corroborate the historical reports' isolation:

* Evolution uses Map-backed storage and mocks optimization storage, industry monitoring, learned data, publishing and generation boundaries (`tests/unit/self-evolution-simulation.test.ts:4-18,26-72`).
* Security uses an injected chain-compatible fake database and the real middleware factory (`tests/unit/selfHealingSecurityEngine.test.ts:3-29,43-60`). This is useful connected component coverage, not a real database/proxy deployment.
* Autofix mocks PDIM and Lua control functions (`tests/unit/autofix-simulation.test.ts:7-30`), substitutes remediation callbacks (`:53-59`), and replaces `npx` with a fixture command (`:265-271`).

Historical reports examined: `reports/self-evolution-simulation.md`, `reports/security-self-healing-simulation.md`, `reports/autofix-simulation.md`. Their reported passes should not be upgraded to production passes. Their fixes for false application credit, failed persistence handling, inappropriate private-IP bypass, and rollback targeting are not listed as open defects here. Missing acceptance evidence spans durable restart, real adapter contracts, deployed proxy identity and real build gates. No claim is made that such integration necessarily fails, or that no other tests exist anywhere.

### Evidence: scanners

Source: `reports/readiness-audit/scanners.md`. [Index](#unified-platform-finding-index) · [Domain playbooks](#playbooks-scanners)

### Scanner triage and release-readiness audit
Date: 2026-09-19. Read-only source audit; only this report is authored. Scanner output is evidence to investigate, not proof of exploitability, a legal breach, or a complete shipped software inventory. No installation, runtime execution, provider/DB access or secret-value inspection was performed.

#### Blocker list

| ID | Classification | Priority / affected release scope | Finding | Confidence |
|---|---|---|---|---|
| SCAN-01 | VERIFICATION GATE; confirmed affected-version lock matches | P1 / web runtime, media/upload and data-import consumers | Current root lock retains scanner-advised runtime packages; advisory applicability and final artifact patches are not demonstrated | High for lock/source presence; medium for exposure; no exploit claim |
| SCAN-02 | VERIFICATION GATE | P1 / whole release portfolio; P0 only if critical AnyIO certificate-spoofing preconditions are confirmed on a shipped consumer | Scanner lacks dependency occurrence paths; nested Python, Rust, developer, Go and duplicate findings cannot be equated to one deployed web service | High for missing provenance; medium for release relevance |
| SCAN-03 | CONFIRMED defect | P1 / server logs and operational tools with personal data | Raw email/IP/username logging is not covered by central key-path redaction, including message interpolation | High for source-level emission; sink retention/access unverified |
| SCAN-04 | CONFIRMED defect | P1 / build/install and any archive consumer; conditional runtime impact | Global tar override substitutes success-returning no-op archive APIs | High for behavior; consumer execution requires acceptance tests |
| SCAN-05 | VERIFICATION GATE | P1 / all production release candidates | SAST is explicitly incomplete, not a clean scan | High |

Five deduplicated roots, not 285 independently proven vulnerabilities. The dependency report contains **206 occurrences: 3 critical, 93 high, 99 moderate, 11 low**, read from severity.level. There are **172 distinct scanner IDs** (IDs include package version); repeated occurrences need provenance rather than assumed deletion. Privacy contains **79 occurrences**. Both critical token-log alerts are false positives for token material at the cited current source. No P0 exploit is established by this audit.

##### Evidence, entrypoints, consumers and scope

**SCAN-01.** package-lock.json:12346 (fast-uri 3.1.5), :15223 (multer 2.2.0), :17790 (sharp 0.35.3), :14108 (js-yaml 4.3.1), :8259 (@xmldom/xmldom 0.9.11), :10154 (csv-parse 6.2.1), :16860 (qs 6.15.3) match scanner versions in non-dev root-lock entries. package-lock.json also contains uuid 7.0.3 under xcode as a **dev** occurrence, not an established web runtime dependency. Actual entrypoints: server/middleware/uploadHandler.ts:1,105-114 constructs multer upload middleware; server/routes.ts:4162 begins upload error handling; server/image-generation.ts:6,164 and server/pocket-dimension/fabric/compression/MediaTranscoder.ts:141-142 invoke sharp; server/services/royaltiesCSVImportService.ts:2 imports csv-parse/sync. fast-uri, qs, js-yaml and xmldom match installed dependency graph, but direct hostile-input reachability was not established here. Scanner descriptions include multipart denial of service/descriptor leaks/limit races (multer; proposed fix 2.3.0), image codec vulnerabilities (sharp; 0.35.4), URI normalization/host confusion (fast-uri; 3.1.6), and YAML merge CPU exhaustion (js-yaml; 4.3.2). These are scanner advisory assertions, not independently reproduced exploits. Package versions and exact advisories for all other instances are retained below. Use the largest applicable patched floor, not the first advisory's floor. Consumer limits/authentication can reduce exposure but are not proof a vulnerable parser is fixed.

build.sh:117-138 installs production dependencies then optionally runs script/security-fix.ts, treating failure as nonfatal. Consequently the lock establishes an unresolved verification gate, not definitive proof of the final installed implementation. build.sh:93-99 selects prebuilt artifacts by existence; :159-174 builds/prunes on the alternative path. Rebuild and inspect actual bundled and externalized code. This dependency root is separate from authorization/business-logic findings in [security.md](security.md); do not count parser occurrences as additional auth defects.

**SCAN-02.** Every dependency occurrence omits a file/path field; source only identifies osv-scanner and collection time. Critical GHSA-82r6-8w77-94w6 appears for AnyIO 4.13.0 twice and 4.12.1 once: the described flaw is TLSStream IDNA 2003 hostname encoding permitting potential certificate spoofing, with scanner fix 4.14.2. Current tracked uv.lock:30, external/maxcore/uv.lock:43 and external/maxcore/artifacts/ai-training-server/uv.lock:43 contain AnyIO records; they are separate candidate environments, not proof three live vulnerable services. Root uv.lock also contains click (:52); external/maxcore/uv.lock carries click (:293), setuptools (:1326,1340), and torch (:1467,1498). Its torch markers explicitly split non-Linux 2.12.1 from Linux CPU 2.13.0+cpu (:1167-1168). Do not assert Linux ships the non-Linux torch finding. boosterstate/Cargo.lock:6,191 contains anyhow/fxhash, a distinct Rust sidecar scope. The fxhash maintenance advisory is not by itself an exploitable security bug. No tracked Go application consumer was established for pgx/x/mod/x/net/x/text/stdlib; the 46 stdlib occurrences are **unattributed**, not automatically web-service defects or automatically safe dev tooling.

Tracked manifest/lock families examined by filename: root npm/pnpm/uv; boosterstate Cargo; dns-node; dns-os and its dns-api service; electron; tls-proxy; external/maxcore root and workspace manifests plus two uv locks; external/pdim root/workspace manifests and pnpm lock; stubs/tar. Workspace/cache duplicates may contribute but cannot be assigned without scanner occurrence paths. npm package-lock matching is independently annotated in the inventory; no match means unresolved provenance, not stale by default.

Artifact evidence: Dockerfile:14-20 installs all dependencies/copies context/builds Rust and :22-29 runs development. Dockerfile.prod:21-24 copies dist, node_modules, package.json and the Rust binary, not entire external source trees; this does not prove build execution succeeds. .dockerignore:10-32 excludes named caches/environments/root node_modules and :34-42 excludes desktop/mobile artifacts; these exclusions are not a universal guarantee for nested contexts or other deployment mechanisms. Tracked dist assets exist, so source-only scanning cannot attest committed bundles. package.json:38-48 defines desktop/mobile build paths independently. Final release images, release archives, running environments and provider-installed dependencies were not inspected. External MaxCore integration behavior belongs to [integrations.md](integrations.md); count its underlying dependency upgrade once here, not again as a separate OAuth/integration defect.

**SCAN-03.** server/logger.ts:5-41 lists secret/header key paths but no email, username or IP redaction; :48-55 configures Pino. String interpolation is not redacted by object-key rules. Concrete reachable consumers include admin actions (server/routes/admin.ts:267,317,358,382,405,670,695,717,751,1142), support (server/routes/support.ts:184,221,264,334,384), OAuth success (server/routes.ts:2423,2439; server/routes/socialOAuth.ts:1090), account deletion (server/services/accountDeletionService.ts:103,149,173,230), status subscriptions (server/services/statusPageService.ts:442,470,618,644) and abuse middleware (inventory gives every remaining location). Impact: unnecessary personal-data copying to stdout/log sinks; deletion logs themselves retain identifiers. This is a confirmed minimization/redaction gap, not a conclusion that these logs violate a particular statute. Legal basis, retention, operator access and actual sink exposure are verification gates. Deletion lifecycle findings in security.md and OAuth findings in integrations.md share these data flows; link this logging root rather than duplicating their distinct lifecycle/auth defects.

Critical privacy trace: server/routes/socialOAuth.ts:552-556 builds tokenData. :559-566 logs only two boolean coercions and numeric expiry, never token bytes. :637-641 parses response, :646-654 logs status, ok, token-presence boolean and tokenData.error. Thus **neither cited call logs an access/refresh token as alleged**. However error is provider-controlled and not type/enum constrained at that call: its safety is conditional on upstream error shape, and central redaction does not sanitize arbitrary error strings. Preserve this as a narrow SCAN-03 schema-hardening gate, not a confirmed critical token leak. Nearby failure paths were not exhaustively proven safe. Privacy items for DNS listener addresses, scheduler round budget, registrant code and ID-only login are similarly differentiated below. Phone prefix logging is partial personal data, not a full phone-number leak. GeoDNS logs at debug level, so default info level does not emit that site unless configured otherwise.

**SCAN-04.** package.json:407 overrides tar to file:./stubs/tar. stubs/tar/package.json:2-9 advertises tar 6.2.1 and CommonJS/ESM entrypoints. stubs/tar/index.js:3-13 and index.mjs:1-11 return resolved promises for create/extract/list/update/replace and aliases without doing archive work. Consumers resolving tar through the override can silently accept absent extraction/creation. The stub's comment claims --ignore-scripts, but build.sh:118,159 invokes npm ci without that flag: do not rely on the comment as a consumer proof. The scanner's **17 tar entries** apply upstream tar advisories to a local file dependency; they are **not demonstrated upstream traversal/overwrite exploits in this no-op code**. The independently verified functional defect is the no-op replacement, not 17 extra security bugs. This intersects deployment/build readiness; count this root once.

**SCAN-05.** reports/readiness-audit/scanner-sast.json:2-3 explicitly contains incomplete:true and empty results. No successful language/file coverage, ruleset, revision, or completion evidence is supplied. Its consumer is the release approval decision. Empty findings cannot support a clean security attestation. Manual review and dependency/privacy scanners do not close full SAST coverage.

### Evidence: coverage-gaps

Source: `reports/readiness-audit/coverage-gaps.md`. [Index](#unified-platform-finding-index) · [Domain playbooks](#playbooks-coverage-gaps)

### Cross-platform coverage gaps — 2026-09-19

#### Blocker list

Read-only source breadth pass, supplementary to the seven domain reports in this directory. No application execution, tests, workflow operations, configuration changes, secret inspection, database queries or provider calls were performed. Only this report was written. “Confirmed” refers to source behavior, not a witnessed production incident. Mounted APIs count as release surfaces even when no current page consumer was found; that boundary is explicit below.

| ID | Classification | Priority / affected release scope | Finding | Confidence |
|---|---|---|---|---|
| CG-1 | CAPABILITY GAP | P1 for admin-issued API credentials; not a blocker for session login | Admin token issue and revoke actions explicitly return 501. | High |
| CG-2 | CONFIRMED defect | P1 for the generic export API and consumers promising downloadable artifacts | Timer-driven exports announce completion without rendering; downloads return JSON acknowledgements, not files. | High |
| CG-3 | CONFIRMED defect | P1 for deployments exposing the mounted offline API | Offline project/cache operations authenticate the caller but do not consistently authorize the target or scope global operations to that caller. | High |
| CG-4 | CONFIRMED defect | P1 for the initialized studio collaboration WebSocket endpoint | Project access calls a nonexistent storage method and rejects legitimate connections. | High |
| CG-5 | CONFIRMED defect | P1 for durable modulation-routing API; P2 for exploratory/session-only controls | Modulation routing is acknowledged into a capped process-local map; first reads also dereference missing state. | High |

No independent P0 is asserted. These five findings supplement—not replace—the other audits. In particular, payments, session invalidation, backup durability, predictive-model readiness and social-delivery recovery remain owned by their existing reports. Task proposals, old comments and cancelled tasks were not treated as evidence.

##### CG-1 — Admin credential lifecycle has no implementation behind its controls

**Entrypoint/consumer:** `/admin/dashboard` is routed at `client/src/App.tsx:230`. Its issue mutation calls `/api/auth/token` at `client/src/pages/AdminDashboard.tsx:1664`; revoke calls `/api/auth/token/revoke` at `:1701-1717`. Both handlers are directly registered in `server/routes.ts:2268-2286`, check the admin role, and return 501. This is a capability gap, not a claim that the current UI falsely announces success: it checks failed responses and shows errors (`client/src/pages/AdminDashboard.tsx:1693-1698,1713-1730`).

**Impact:** operators cannot issue/revoke credentials through these controls. The comments claiming there is no Bearer path are not adopted as platform-wide truth: the repository also contains developer API keys and JWT services. The confirmed fact is that these specific controls are not wired to a credential lifecycle. Do not conflate this with SEC-01's session-revocation defect.

##### CG-2 — Generic export completion is synthetic, and download endpoints do not deliver artifacts

**Entrypoint:** lazy route registration exposes `/api/export` (`server/routes.ts:7719-7721`). The generic audio/data/batch/analytics/chart/bulk/mastered/stems handlers converge on `simulateExportProgress` (`server/routes/export.ts:147-210`; call sites `:272,399,458,925,974,1071,1172,1266,1439,1527`). The function advances a timer, labels effects/encoding stages, calculates an estimated file size, and records “completed,” without an encoder or artifact write.

**Consumers:** generic export components call these endpoints (`client/src/components/export/ExportDialog.tsx:244-245`, `BulkExportManager.tsx:456,520,553,594`). Their presence is not proof that every studio export dialog uses this pipeline: separate studio/stem dialogs exist. The blocker applies independently to the mounted generic API; this pass did not establish a current routed page importing every generic export component.

**Terminal behavior:** `/download/:jobId` checks ownership and completion, then returns JSON saying “Download initiated” (`server/routes/export.ts:839-871`); ZIP download similarly returns JSON (`:1292-1319`). All named job families therefore share the same defective completion contract. In-memory job/history storage (`:67-69`) also loses receipts across restart; cleanup checks a `createdAt` property absent from `ExportJob`, which instead has `startTime` (`:17-45,74-86`), making live jobs eligible for cleanup. These are parts of the same incomplete export-job lifecycle, not separate duplicate findings.

**Impact:** clients can receive success and misleading completion/history/file sizes without the requested audio, stems, report or archive. This is separate from AM-6's MaxCore audio-render retry behavior and D1's database backup addressing.

##### CG-3 — Offline API project isolation is incomplete

**Entrypoint:** `/api/offline` is mounted at `server/routes.ts:7390-7392`; handlers use `requireAuth`. Creating a cache passes the current user (`server/routes/offline.ts:75-83`), but the service fetches project, tracks and clips by project ID alone (`server/services/offlineModeService.ts:306-327`) and assembles their data (`:356-361`). Possession of another project's ID is not authorization.

**All identified instances of this root cause:** cache creation above; cache deletion (`server/routes/offline.ts:107-113`); cache detail and existence (`:147-174`); per-project and global sync (`:182-200`); global settings (`:217-235`); global cache clearing/cleanup (`:251-268`); and local/server change markers (`:320-330`). Those handlers either pass only the target ID or invoke a singleton-wide operation without user scope. The service's detail/existence methods simply access a project-keyed map (`server/services/offlineModeService.ts:433-445`), whereas only list explicitly filters user ID (`:437-440`). Sync likewise accepts only a project ID (`:447-449`); uncache deletes the shared project entry and files (`:420-429`).

**Impact:** an authenticated user knowing a project ID can request another project's contents be cached and retrieve cached project data; shared cache operations can disrupt other users' offline preparation. No UUID guessing success or production exploitation is asserted. This finding concerns the server API, not an assertion that IndexedDB in one browser is readable by another browser. No direct client consumer of these exact offline REST routes was established in this pass; they remain exposed authenticated API surfaces. Browser PWA queue durability is a separate, incompletely examined boundary.

##### CG-4 — Studio WebSocket project authorization calls the wrong storage contract

**Entrypoint:** server bootstrap initializes realtime collaboration (`server/index.ts:840-849`); realtime initialization calls `studioCollabServer.initialize` (`server/realtime/index.ts:289-308`), whose default upgrade path is `/ws/studio` (`server/realtime/studioCollabServer.ts:82`). Upgrade requests authenticate, then require `checkProjectAccess`, returning 403 when it returns false (`:111-149`).

**Failure:** `checkProjectAccess` calls `(storage as any)?.getStudioProject(projectId)` (`server/realtime/studioCollabServer.ts:305-310`). Optional chaining is on the storage object, not on the method: a defined object with no such method throws. The catch converts this to false (`:329-335`). The imported storage is the concrete `DatabaseStorage` singleton (`server/storage.ts:68,3669`); repository search finds no implementation of `getStudioProject` or `getProjectCollaborators` in that storage. The other `getStudioProject` references are service interface/call sites, not an implementation (`server/services/studioService.ts:133,215,312,601`). Thus even the owner check after the call cannot run.

**Impact:** correctly authenticated studio collaboration connections are rejected by this endpoint. No current browser consumer of `/ws/studio` was found in the breadth search, so this is explicitly an initialized backend capability blocker, not a claim that every visible collaboration page fails. The separate `/api/collaboration` comments/invites and `/api/collaborations` pages were not treated as equivalent consumers.

##### CG-5 — Modulation routing has no durable state contract

**Entrypoint:** `/api/studio/plugins` is mounted at `server/routes.ts:7343-7345`. Its modulation GET checks project ownership, then loads `modulationConfigs.get(key)` and dereferences `config.routings` without guarding missing state (`server/routes/studioPlugins.ts:878-899`). An authorized first read therefore throws and becomes an error response.

**Write/read chain:** `modulationConfigs` is a module-local map (`server/routes/studioPlugins.ts:605`); successful POST only writes that map and applies oldest-entry eviction (`:979-985`). The cap deletes state at 10,000 keys (`:607-613`). DELETE modifies only that map (`:1024-1031`). Restart, worker handoff or eviction loses previously acknowledged routings. Project-owner authorization is present here and is not the reported defect.

**Impact/scope:** API clients cannot reliably save/reload routing settings, and first-time GET fails. No current frontend reference to `/modulation-matrix` was found, so this must not be described as a confirmed failure of every plugin browser. The catalog itself is backed by actual definitions (`server/services/pluginHostService.ts:66-79`) and is consumed by real browser components (`client/src/components/studio/FlowStatePluginBrowser.tsx:215-222`, `StudioBrowser.tsx:52-56`); catalog existence does not establish durable routing.

### Evidence: growth-rights

Source: `reports/readiness-audit/growth-rights.md`. [Index](#unified-platform-finding-index) · [Domain playbooks](#playbooks-growth-rights)

### Growth, rights and remaining product surfaces — 2026-09-19

#### Blocker list

Read-only current-source audit. Only this report was written; no app execution, heavy tests, configuration changes, live databases/providers, secret values or workflows were accessed. “Confirmed” means established by code, not a claim of observed production incidents. P1 blocks the named feature's production promise; it does not necessarily block an unrelated limited release. No P0 established here.

| ID | Classification / priority | Blocker | Affected release scope | Confidence |
|---|---|---|---|---|
| GR-1 | CONFIRMED defect / P1 | Fan campaign “send” records delivery without sending; the separate real broadcast path lacks durable recipient outcomes | Fan marketing campaigns and restart/retry-safe broadcasts | High |
| GR-2 | CAPABILITY GAP / P1 | Fan broadcasts have no application-level consent/suppression/unsubscribe lifecycle | Production artist-to-fan email marketing | High for application gap; provider-level suppression not verified |
| GR-3 | CAPABILITY GAP / P1 | Merch management has no order-ingestion/purchase producer behind its fulfillment UI | Selling/fulfilling physical merchandise inside this platform; catalog-only management is narrower | High within searched repository |
| GR-4 | CONFIRMED defect / P1 | Split-sheet amendments bypass allocation invariants and overwrite mutable signatures without revision-bound assent | Split-sheet execution through mounted contracts API | High |
| GR-5 | CONFIRMED defect / P1 | Revenue forecast API returns invented accuracy and substitutes assumptions for measured zero revenue without provenance | Mounted revenue forecast API and any consumer relying on its financial estimates | High; visible dashboard reachability not established |

##### GR-1 — Sending and recording delivery are disconnected

**Entry → consumer:** `/social-media` is mounted in `client/src/App.tsx:205`; its Fan Campaigns tab renders at `client/src/pages/SocialMedia.tsx:4747-4748`. The action calls `/api/fan-campaigns/:id/send` and announces “Delivered” (`:5638-5650`); server mount is `server/routes.ts:8524`. The complete handler only counts subscribers, updates `status: "sent"` and returns success (`server/routes/fanCampaigns.ts:185-227`). There is no delivery call or enqueue operation in that handler.

**Related instance, same delivery-ledger root cause:** `/fan-hub` (`client/src/App.tsx:268`) uses a genuinely sending implementation: `server/routes/fanHub.ts:349-373` invokes the email service. However, all sends precede the single message insert (`:381-391`), with no durable recipient command/outcome. A process loss or insert failure can leave accepted mail unrecorded; retry resends the whole audience. Partial failures only produce aggregate counts (`:393-403`), not a recoverable failed-recipient list. This is distinct from the social-post recovery finding I6: these are email fan-marketing commands, not social platform publication.

**Impact:** the campaign UI can report a completed marketing operation when no email was attempted; actual broadcasts cannot reliably resume without duplicates. Provider acceptance is also not inbox delivery: `server/services/emailService.ts:789-809` returns a boolean, not recipient delivery events.

##### GR-2 — Fan audience permission is not represented or enforced

**Entry → consumer:** `/fan-hub` subscriber creation accepts manually supplied email/source (`server/routes/fanHub.ts:16-24,98-114`). The audience schema has identity, tags and joined dates but no consent or suppression state (`shared/schema.ts:7186-7209`). Broadcast selects every subscriber belonging to the artist (`server/routes/fanHub.ts:312-320`), and the email asserts subscription without an unsubscribe link (`:336-345`). Its email wrapper only supplies addresses, content and sender (`server/services/emailService.ts:789-809`); no marketing preference lookup or application unsubscribe handling occurs there.

**Impact:** a manually imported/added contact is treated as sendable without evidence of permission; the application cannot enforce recipient withdrawal for this list. This is not I7's user-notification preference mismatch: fan contacts need not be registered users, and `emailPreferences` is a separate user-keyed table (`shared/schema.ts:5917-5928`). External provider suppression may exist, but source does not establish it or make it an artist-scoped consent lifecycle. Legal applicability, sender identity requirements and lawful basis require jurisdiction-specific review; this is not a legal-compliance certification.

##### GR-3 — Merch catalog/order management has no order origin

**Entry → consumer:** `/merch` (`client/src/App.tsx:272`) loads catalog, orders and statistics (`client/src/pages/MerchStore.tsx:122-128`), creates products (`:133`), and updates order status (`:195-203`). The mounted router (`server/routes.ts:7677`) implements product creation (`server/routes/merch.ts:112-145`), order reads (`:246-261`) and status updates (`:265-347`), not order creation/checkout/import. Searches of server TypeScript for `merchOrders`, `merch_orders` and SQL insert references found no order insert producer; schema defines the order table (`shared/schema.ts:7422-7441`). This is a bounded repository absence, not proof that no external operator ever writes the database.

**Impact:** new customers cannot create physical-merch orders through the examined product, so fulfillment and revenue screens cannot become a complete selling workflow. This is distinct from beat marketplace payments/royalties already covered in commerce.md. A further acceptance requirement is financial semantics: merch “totalRevenue” currently sums all non-cancelled/non-refunded order totals, including pending orders (`server/routes/merch.ts:355-361`); a real ingestion implementation must distinguish paid, booked and collected amounts rather than inherit this as collected revenue.

##### GR-4 — Split-sheet assent is neither atomic nor bound to a revision

**Entry → consumer:** `/contracts` mounts at `client/src/App.tsx:253`; its API family mounts at `server/routes.ts:7587`. The child endpoint `/api/contracts/split-sheets/:contractId/sign` reads a JSON signature array, edits one element, then replaces the full array with a predicate on ID only (`server/routes/contracts.ts:1391-1450`). Two participants signing the same snapshot can each receive success while the last writer erases the other's signature.

The creator-only amendment endpoint reads and pushes participants/signatures, then writes both arrays (`server/routes/contracts.ts:1490-1521`), preserving existing signatures despite changed participants/terms. Signature hashes include supplied signature, time and user ID, not the contract revision/content (`:1426-1430`). Adding a participant changes status but does not invalidate prior assent. These are instances of the same missing atomic, immutable revision model, not the collaborator-payout gap C4.

Allocation invariants also fail at this amendment boundary: creation has a sum-to-100 check (`server/routes/contracts.ts:1333-1341`), but add-participant checks only required-field presence and email format (`:1468-1487`) before appending, without finite numeric, individual range, aggregate total or duplicate participant validation (`:1506-1521`). For example, adding a positive allocation to an existing 100% sheet can persist an overallocated revision. The separate `/split-sheets/validate` route (`:1531-1559`) is not called by the mutation and cannot enforce its invariants. Remediation must atomically validate the complete proposed allocation on every creation/amendment, not merely repair signature storage or rely on optional client preflight.

**Impact:** accepted signatures can disappear or appear attached to amended economics never signed by prior participants, including invalid or overallocated participant sets. Scope precision: these child APIs are live under the mounted family, but no direct split-sheet UI call was found in the current Contracts page; do not claim a demonstrated click-through failure. The page's ordinary contract sign flow is separate (`client/src/pages/Contracts.tsx:375-394`). No conclusion about legal enforceability or actual fraudulent activity is drawn.

##### GR-5 — Financial forecast statistics conceal absence of evidence

**Entry → consumer:** `server/routes.ts:7047` mounts `/api/revenue-forecast`; `server/routes/revenueForecast.ts:59-79` exposes accuracy through the imported `revenueForecastService`. With no compared forecasts the service returns 85% accuracy and 15 MAPE (`server/services/revenueForecastService.ts:214-234`); it also falls back to 15 when all actual revenues are zero (`:244-265`). Stream rate substitutes a constant for zero streams and for a measured zero revenue/stream ratio, then clamps the result (`:143-167`). Generation multiplies revenue by a fixed 70% royalty percentage (`:75,112`) without a rights-specific input.

**Impact:** consumers cannot distinguish observed accuracy/rates from assumptions; zero monetization can become a positive modeled rate. These are not claims that assumptions or scenario models are inherently wrong, but the return contracts do not identify these substitutions. Distinct from AM-2: that report covers unavailable authoritative AI endpoints; this mounted heuristic API returns successful, misleading financial data. `client/src/components/dashboard/RevenueForecast.tsx:274-304` contains a matching consumer, but repository search did not establish its current import into a mounted page. The blocker is therefore explicitly API-scoped, not a claim that this widget is currently visible.

### Evidence: admin-governance

Source: `reports/readiness-audit/admin-governance.md`. [Index](#unified-platform-finding-index) · [Domain playbooks](#playbooks-admin-governance)

### Admin, support and governance readiness — 2026-09-19

#### Blocker list

Read-only source audit; only this report was written. No live database/provider access, secret inspection, application execution, configuration changes or heavy tests. Findings describe current source, not production observations. Priority applies to the named release scope, not necessarily every platform launch.

| ID | Classification | Priority / affected release scope | Finding | Confidence |
|---|---|---|---|---|
| AG-1 | CONFIRMED defect | P1 / moderation operations | Removal and warning endpoints acknowledge effects they do not perform; review actions also misrepresent completion. | High |
| AG-2 | CONFIRMED defect | P1 / operator maintenance, registration and rate-limit controls | Settings persist but have no corresponding runtime enforcement consumer. | High |
| AG-3 | CONFIRMED defect | P1 / applicant KYC onboarding | Status crashes when a required document has not yet been uploaded. | High |
| AG-4 | CONFIRMED defect | P1 / internally verified identity assertions | Approval is not bound to reviewed evidence; approved identity information remains editable without invalidation. | High |
| AG-5 | CONFIRMED defect | P1 / multi-agent support operations | Concurrent message/tag mutations overwrite each other's JSONB state. | High |
| AG-6 | CAPABILITY GAP with confirmed broken link | P1 / customer support conversation lifecycle | Reply notifications point to an absent customer ticket page; detail/reply APIs are admin-only. | High |

##### Entrypoints, evidence and impact

**AG-1 — Acknowledged moderation without the promised action.** `/api/admin` mounts the primary router at `server/routes.ts:7037`; its role and 2FA guards are at `server/routes/admin.ts:51-62`. The live `/admin` page is registered at `client/src/App.tsx:232`; it submits review actions at `client/src/pages/Admin.tsx:435-450` and displays successful processing.

`POST /moderation/content/:contentId/remove` only logs and returns success, including `notifiedUser: notifyUser`; it neither removes content nor sends a notification (`server/routes/admin.ts:690-705`). `POST /moderation/users/:userId/warn` similarly only logs/echoes (`:712-728`). The UI-used review handler accepts `approve`, `warn_user`, `ban_user`, `remove_content`, and `dismiss`; only ban writes a user value, and only remove/dismiss close the queue status. Approve/warn return success but leave `flagged`, and warn sends no warning (`:636-682`). Review notes/action/reviewer are returned but not durably stored in this handler. The listing synthesizes reports from posts and labels every item “Automated moderation” rather than loading reporting provenance (`:557-617`). These are not authorization bypass claims: privileged access is guarded. The direct ban handler does write `subscriptionStatus`; its broader enforcement is not asserted here. Content removal through the review handler does write `posts.status="removed"`—do not confuse that real local mutation with the separate no-op removal endpoint or infer remote-platform deletion.

**AG-2 — Control plane disconnected from enforcement.** Primary settings GET reads `platform.*` values and returns maintenance, registration and rate-limit defaults (`server/routes/admin.ts:975-999`); maintenance/registration POSTs only persist them (`:1039-1057`). The later admin router is lazy-mounted at `server/routes.ts:7438-7442`, guards requests at `server/routes/admin/index.ts:10-20`, and supports generic PUT plus a rate-limit writer (`:65-97`). `/admin` maintenance UI reads and updates this state (`client/src/pages/Admin.tsx:2080-2097`). Current server-wide searches for these setting names find writers/readback, not runtime consumers. Actual global/API limiters are constructed from the fixed 1,200/minute constant (`server/middleware/scalableRateLimiter.ts:489-501`); the global limiter is installed at `server/index.ts:939-940`. Registration completion is separately implemented at `server/routes.ts:8227-8327`, with no read of this registration switch. Impact: an operator can see maintenance enabled or registration disabled while traffic/admission is unchanged, and editing the displayed API limit does not change the actual limiter. Other allowlisted settings are not automatically declared defective without tracing their consumers.

**AG-3 — Ordinary incomplete KYC checklist throws.** The KYC router is registered at `server/routes.ts:7236`. `/status` uses the authenticated user's ID (`server/routes/kyc.ts:155-161`); `client/src/pages/Verification.tsx:169` consumes it. In `getVerificationStatus`, required types are mapped and `documents.find` can return undefined (`server/services/kycService.ts:627-628`). Status/file metadata handle missing documents, but `uploadedAt: doc.createdAt` dereferences that missing value (`:635-646`). Starting a verification before submitting every required type therefore makes the status endpoint fail instead of reporting `not_uploaded`. This does not affect users with no verification record in the same way; the defect is the existing-but-incomplete checklist path.

**AG-4 — Verification decision lacks an immutable subject/evidence boundary.** Applicant routes authenticate and the entire `/admin` subtree requires admin (`server/routes/kyc.ts:21-25`); admin UI calls `/admin/review/:verificationId` and document-review separately (`client/src/pages/admin/KYCReview.tsx:136,182-189`). Overall approval delegates from `server/routes/kyc.ts:783-810` to `approveVerification`, which checks only existence, then unconditionally stamps verified/expiry/reviewer (`server/services/kycService.ts:513-542`). It does not verify required approved documents or legal transitions. Separately, applicant-owned `updateIndividualInfo` and `updateBusinessInfo` check ownership/type but update metadata without rejecting verified state or resetting approval (`:317-390`); routes expose these at `server/routes/kyc.ts:257-338`. Consequently an authorized applicant can change the subject information attached to a still-verified record, and an authorized reviewer can approve incomplete/rejected evidence without an explicit exceptional-decision record. `getVerificationStatus` treats verified/unexpired as payout eligible (`server/services/kycService.ts:671,1149-1150`); the separate eligibility helper also checks thresholds/tax metadata (`:952-1002`). Search found that helper called by the KYC eligibility endpoint only, not a payout executor: this report does **not** claim these internal decisions currently gate all real-money payouts or confer regulatory compliance.

**AG-5 — Lost support records under concurrent writes.** `/api/support` lazy mount is at `server/routes.ts:7427-7429`; admin detail/reply/tag operations require auth, admin and 2FA (`server/routes/support.ts:125,154-160,195-202,237-244`). UI reply/tag writes originate in `client/src/pages/admin/SupportTicketDetail.tsx:107-125,145,213-214`. `addMessage` reads the ticket then replaces its entire metadata object containing the appended array (`server/services/supportTicketService.ts:255-293`). `addTags` does the same (`:339-355`); route-level tag deletion also reads/replaces metadata (`server/routes/support.ts:247-262`). Two replies, reply plus tag, or add versus delete can both succeed while the later stale write erases the earlier change. This is a concurrency defect, not an assertion that replies are wholly unimplemented: sequential replies really persist.

**AG-6 — Customer conversation has no complete return path.** Customer creation/listing exist (`server/routes/support.ts:13-30,345`), while detail and message POST require admin+2FA (`:125,154-160`). The staff-reply service sends notification links to `/support/tickets/:id` (`server/services/supportTicketService.ts:312-317`); ticket status notifications use the same path (`:237-242`). The actual application routes only register `/admin/support` and `/admin/support/tickets/:ticketId` (`client/src/App.tsx:222-226`); current App source contains no customer support-ticket route. Customers may receive reply text by email (`server/services/supportTicketService.ts:295-309`) and may retrieve metadata in their own list, but that is not a routed read/reply conversation. Do not fix by pointing customers at privileged pages or relaxing the admin route's guard globally.

### Evidence: client-offline

Source: `reports/readiness-audit/client-offline.md`. [Index](#unified-platform-finding-index) · [Domain playbooks](#playbooks-client-offline)

### Client, offline and device readiness — 2026-09-19

#### Blocker list

Read-only source audit. No application code/configuration changed; no browser, runtime tests, provider calls, database queries, or secret inspection performed. Prior report headings were checked for overlap, then current source was inspected. Task proposals are not evidence. Priorities below apply to the specified release scope, not an assertion that every dormant utility currently affects every page.

##### CO-1 — Browser-private state is not bound to the authenticated account

**CONFIRMED defect · P1 · high confidence. Scope:** production browser/PWA account switching, logout and offline reads; queue/draft isolation also blocks enabling those utilities broadly.

**Entrypoint/consumer and evidence:** `client/src/main.tsx:63-74` registers `/sw.js`; `server/index.ts:275-287` serves `client/public` before session middleware, and `vite.config.ts:21-24` also builds from `client`. Thus the relevant worker is **`client/public/sw.js`**, not the separate push-only `public/sw.js`.

**Environment qualification:** the active worker bypasses GET caching on `localhost`, `127.0.0.1`, `*.replit.dev` (including the explicitly listed `*.picard.replit.dev`) through `IS_DEV` and the early fetch return (`client/public/sw.js:28-32,121-128`). This is a production-domain cache defect, not a defect reproduced in a development preview. No runtime reproduction was performed.

* The worker caches successful GET responses even for API paths outside its explicit list: `client/public/sw.js:154-162,207-223`. Those responses enter a shared dynamic cache and can be returned on network failure without TTL. The listed private project/studio/settings/analytics/release paths use URL-only cache keys: `client/public/sw.js:49-59,228-251`. Neither path establishes an account namespace or honors response `no-store` before writing.
* Logout clears the React Query client, but not worker CacheStorage or offline databases: `client/src/components/auth/AuthProvider.tsx:83-92`. Clearing memory is a real existing protection, not complete browser-data erasure.
* Query persistence uses a global database/key (`client/src/lib/idbPersister.ts:7-10,26-48`), mounted outside authentication (`client/src/main.tsx:85-115`), with a denylist rather than an authenticated namespace. This is an additional isolation gate; unlike the worker defect, a specific post-logout query rehydration race was **not** reproduced.
* Other instances of the same unscoped ownership model: queue record/schema/database `client/src/lib/offline/OfflineQueue.ts:17-59`; draft IDs derived only from form ID `client/src/lib/offline/DraftStorage.ts:141-177`; offline cache database/key `client/src/lib/offline/OfflineCache.ts:44,85-88`; background sync entries contain data/time, not owner, and replay with current cookies `client/public/sw.js:300-317,329-339`.

**Impact:** on a shared browser, a subsequent account or logged-out client can receive another account's cached private response during an outage. Old pending work can be submitted under a later session; server rejection/authorization is a separate question, not a protection against disclosure from local caches. No live cross-account exploit or actual private record was accessed.

##### CO-2 — The local outbox does not have a recoverable, exclusive scheduler

**CONFIRMED scheduler defect · P1 for existing/future queued actions · high confidence. Scope:** the generic offline scheduler and any pre-existing or subsequently enrolled queued work. **No current mounted mutation producer was established.** Initialization proves scheduler reachability, not that a current page enqueues mutations; this finding does not assert current queued Projects data loss.

**Entrypoint/consumer:** root `OfflineProvider` → `initOfflineSystem` → auto-starting `SyncManager` (`client/src/main.tsx:85`; `client/src/lib/offline/index.ts:32-39`; `client/src/lib/offline/SyncManager.ts:81-96`).

**Producer boundary (also applies to CO-3):** enqueue calls were established only in reusable hooks/facades: `client/src/hooks/useOfflineQueue.ts:139`, `client/src/hooks/useOffline.ts:197`, `client/src/hooks/useSyncQueue.ts:174`, and `client/src/lib/offlineStorage.ts:115,193`. These do not establish a mounted mutation producer. Actual existing queue contents were not inspected. CO-6 separately identifies the live global saving assurance, regardless of whether any actions are queued.

**Evidence/instances of the scheduler state-machine defect:**

* An action is persisted as `syncing` before transmission (`client/src/lib/offline/SyncManager.ts:250-260`), but initialization only opens the stores (`client/src/lib/offline/OfflineQueue.ts:90-118`). Selection reads only pending records (`client/src/lib/offline/OfflineQueue.ts:226-228,367-387`); there is no startup lease expiry/reconciliation for interrupted `syncing` work.
* Exclusivity is only a JS-instance status flag (`client/src/lib/offline/SyncManager.ts:190-195`). Selection and marking are separate operations, with no atomic claim or cross-tab lease. Two tabs can select the same work.
* Failed work becomes immediately pending (`client/src/lib/offline/OfflineQueue.ts:268-279`); the while-loop immediately selects again (`client/src/lib/offline/SyncManager.ts:210-224`), bypassing the intended retry delay (`:301-318`).
* Dependency readiness means “not present among pending actions,” not “completed successfully” (`client/src/lib/offline/OfflineQueue.ts:375-379`). Failed/conflicted/in-flight prerequisites therefore do not reliably block descendants.

**Impact:** stranded changes after restart, duplicate sends, retries exhausted during one transient failure, and child operations attempted without successful prerequisites. Actual server-side duplication depends on the action contract; this finding does not claim all endpoints lack deduplication.

##### CO-3 — Background queue acceptance is confused with completed business synchronization

**CONFIRMED transport defect · P1 for existing/future queued actions · high confidence. Scope:** PWA background sync on browsers supporting the Sync API, and local sync-status UX when generic queued work exists. **No current mounted mutation producer was established.** The initialization path is not evidence of a producer, and this finding does not assert current queued Projects data loss.

**Evidence:** on fetch rejection the worker returns HTTP 202 with `{queued:true}` (`client/public/sw.js:277-291`). The foreground manager expects `results/conflicts`, returns `data.results`, and spreads that result in its outer loop (`client/src/lib/offline/SyncManager.ts:255-283,215-216`). A 202 body therefore leaves actions in `syncing` and throws rather than recording a durable handoff.

During later replay, `response.ok` deletes the entire background entry without checking per-action results (`client/public/sw.js:329-340`). The actual batch endpoint returns HTTP-success JSON containing both successful and failed action results (`server/routes/sync.ts:329-348,363-370`); this evidence is about response semantics, **not CG-3 authorization**. The worker then announces completion even with retained/failed work (`client/public/sw.js:342-347`). Independently, foreground `sync-complete` is emitted after processing even if results failed (`client/src/lib/offline/SyncManager.ts:218-230`), while the provider says “All your changes have been saved” (`client/src/components/offline/OfflineProvider.tsx:153-160`).

**Impact:** false saved indicators, discarded background retry records for rejected actions, and inconsistent ownership between two queues. This is distinct from scheduler leasing (CO-2): the transport acknowledgment contract must also be repaired.

##### CO-4 — Worker activation discards old application generations before open clients are safe

**CONFIRMED lifecycle defect · P1 · high confidence in code, conditional user impact. Scope:** deployed PWA upgrades with open tabs/offline navigation and lazy chunks.

**Evidence:** install unconditionally calls `skipWaiting`, tolerates failed pre-cache, and activation deletes all other `max-booster-*` caches before claiming clients (`client/public/sw.js:78-113`). There is no open-client build/dirty-state acknowledgment in that path. Route modules are lazy (`client/src/App.tsx:109-166`), so a running old page may need an old chunk after takeover. The app registration only requests an update (`client/src/main.tsx:63-74`); a source search found no client sender for the worker's `PRECACHE_APP_CHUNKS` handler (`client/public/sw.js:626-656`) or client `controllerchange`/`updatefound` recovery flow.

**Impact:** an old tab can lose the cached assets it still needs when it goes offline or a deployment no longer serves old hashes. This is not proof that the current hosting layer deletes old hashes immediately. Activation's deletion predicate also includes the names declared for draft/media caches (`client/public/sw.js:72-73,102-108`); no active writer to those two caches was established, so **actual draft/media loss is not asserted**. IndexedDB draft stores are not deleted by this worker code.

##### CO-5 — First-save draft storage dereferences an absent draft

**CONFIRMED defect · P2 for present reachability; P1 before promising draft-backed forms · high confidence. Scope:** reusable draft API and any form enrolled through it, not every current form.

**Evidence:** `getDraft()` returns `undefined` for absent or expired drafts (`client/src/lib/offline/DraftStorage.ts:175-182`); `saveDraft()` correctly makes version conditional but reads `existingDraft.createdAt` unconditionally before writing (`:153-168`). First save, or save following expiry/deletion, throws. Consumer contracts include `client/src/hooks/useDraft.ts:75-94` and the draft facade in `client/src/lib/offlineStorage.ts:131-147`. Current page/component searches did **not** establish a mounted caller of `useDraft`, `useDraftSave`, or the generic save facade; exposing a helper is not evidence of complete form integration.

**Impact:** a new integration cannot save its first recoverable draft. Separately from this bug, root offline wording currently promises saving without those integrations (CO-6). Existing saved records do not prove first-save correctness.

##### CO-6 — Global offline assurance exceeds actual persistence capability

**CAPABILITY GAP, with confirmed state-reporting defect · P1 · high confidence. Scope:** all pages under the root offline provider, especially project editing and storage-restricted devices.

**Evidence:** the globally mounted provider promises “Your changes will be saved locally and synced when you reconnect” on every offline event (`client/src/main.tsx:85`; `client/src/components/offline/OfflineProvider.tsx:107-118`). Yet the concrete Projects edit/delete/duplicate contracts are direct requests and error toasts, not a draft or outbox write (`client/src/pages/Projects.tsx:114-210`); the root message is not conditioned on a mutation's enrollment.

Storage initialization failure is only logged (`client/src/components/offline/OfflineProvider.tsx:58-69`). Its online/offline listeners are installed only after `isInitialized` (`:85-86,121-122`), so IndexedDB failure also freezes this provider's initial network state. The separate capability helper reports drafts as fully available offline without checking persistence readiness (`client/src/hooks/useOfflineCapable.ts:49-84`). The query persister silently tolerates storage write failures (`client/src/lib/idbPersister.ts:36-42`); that is acceptable for an expendable query cache, not evidence that edits have been saved.

**Impact:** users can trust a global saving assurance even though a particular form has no durable write path, or local persistence is unavailable. Existing direct mutation error toasts are credited; this is not a claim that every form silently reports success. Repair must implement durable editing behavior and accurate per-operation status, not merely remove offline UI.

##### CO-7 — Projects renders a failed initial fetch as an empty account

**CONFIRMED defect · P2 · high confidence. Scope:** authenticated `/projects` initial-load failure/no cached data.

**Evidence:** the page extracts only data/loading, defaults missing data to `[]` (`client/src/pages/Projects.tsx:106-112`), then renders “No projects yet” and an upload action when not loading (`:587-607`). It has no error branch there. Global query error handling already produces a toast (`client/src/lib/queryClient.ts:661-689`), so this is **not** “errors are entirely swallowed”; the persistent page content remains false after the toast.

**Impact:** outages/auth failures look like missing user work, prompt unnecessary uploads, and give no contextual retry on the list. Edit/delete success invalidation and mutation error handling exist (`client/src/pages/Projects.tsx:114-210`) and are not being reported as missing.

##### CO-8 — Cross-device, accessible and reconnect-safe critical journeys remain an acceptance gate

**VERIFICATION GATE · P1 for full platform/browser release · high confidence that this audit does not establish acceptance; unknown incidence of additional defects.**

**Evidence anchoring the gate, not proof of universal failure:** route inventory and lazy navigation at `client/src/App.tsx:175-278,560-570`; root persistence and auth ordering at `client/src/main.tsx:85-115`; Projects labeled edit controls and dialogs at `client/src/pages/Projects.tsx:470-548`; reconnect/send behavior at `client/src/hooks/useWebSocket.ts:51-80,92-116`, consumed by `client/src/pages/Analytics.tsx:1589-1615` and `client/src/components/notifications/NotificationCenter.tsx:110-132`. The socket sends only while open; reconnect alone does not establish event replay or missed-update recovery. Analytics already includes polling fallback—do not report that as absent.

**Impact/release scope:** source cannot certify keyboard/screen-reader completion, touch/mobile audio behavior, quota/eviction survival, deployed lazy-route recovery, or reconciliation after disconnect/multiple tabs. No major accessibility barrier was conclusively established in this pass; lack of a browser run is not itself proof of an accessibility defect. Full release requires demonstrated contracts across the unexamined pages below, not an inference from shared components.

## All repair playbooks

### Playbooks: security

Source: `reports/readiness-audit/security.md`. [Domain evidence](#evidence-security) · [Index](#unified-platform-finding-index)

#### Repair playbooks

Choose one complete option per finding, adapting it to the validated production architecture. Each option is a distinct implementation path with its own five stages. Recommendations are not guarantees of a first-attempt fix.

<a id="repair-sec-01"></a>

##### SEC-01 alternatives

**A — Durable user/session generation (recommended; compact migration, one authority).**
1. Inventory cookie and JWT issuers, reset/change/logout/revoke callers, and every store; define maximum revocation latency.
2. Add an authoritative generation to users and issued sessions/tokens; backfill old sessions as obsolete at cutover.
3. Atomically advance the generation on security events; enforce comparison in every normal, cached and fallback read, with durable acknowledgement.
4. Test held cookies before/after 310 seconds, concurrent new login, two pods, timeout, restart and reset failures.
5. Accept only when old credentials never regain validity and new sessions work within the agreed latency; monitor mismatches and rollback without restoring revoked generations.

**B — Authoritative session ledger (strong per-device control; more database traffic).**
1. Catalogue sessions and agree retention/expiry indexes and database availability requirements.
2. Migrate sessions into a durable ledger with `revokedAt`, user linkage and issuance timestamps.
3. Make caches accelerators only; transact reset plus ledger revocation, and require reads to verify active ledger status.
4. Exercise per-device logout, all-device reset, delayed writes, replica lag and failed deletion.
5. Accept after replay rejection on all pods; retain tombstones through maximum credential lifetime and observe query latency.

**C — Dedicated identity/session authority (central policy; integration and operational cost).**
1. Select an authority with documented revocation/introspection guarantees and map current session/JWT consumers.
2. Import identities safely and plan one-time reauthentication rather than copying unverified sessions.
3. Route all issuance and revocation through the authority; use opaque sessions with authoritative introspection across fallback paths.
4. Test authority outages, refresh rotation, password recovery and application session invalidation.
5. Cut over only with replay/latency acceptance evidence and retire legacy issuance and stores.

**D — Durable event-driven revocation ledger (low read latency; greatest consistency complexity).**
1. Define durable event ordering, consumer checkpoints and an allowed freshness bound for every pod.
2. Store session tombstones and a transactional outbox alongside security changes; migrate active sessions to stable identifiers.
3. Stream revocations to every cache; require authoritative reconciliation when a consumer is behind and persist acknowledgements.
4. Test lost/duplicated/reordered events, cold starts, network partitions and credentials never used during the flag window.
5. Accept only with bounded freshness and durable rejection after restart; alert on checkpoint lag before serving stale auth.

<a id="repair-sec-02"></a>

##### SEC-02 alternatives

**A — Shared assurance state machine (recommended; preserves existing UX with explicit invariants).**
1. Map local, Google, recovery-code and JWT flows and define pending/fully-verified/step-up states.
2. Add pending-factor storage and assurance timestamps; migrate existing factors without replacing their active secrets.
3. Require MFA before any normal authenticated session for enrolled users; require recent existing-factor proof for replacement, then atomically promote a verified pending factor.
4. Test Google plus enrolled MFA, stolen pre-step-up sessions, abandoned setup, concurrent replacement and admin routes.
5. Accept only when no flow replaces or bypasses the active factor without approved proof; ship expiry cleanup and audit notifications.

**B — Managed MFA identity broker (less bespoke security code; provider dependency).**
1. Evaluate broker support for Google federation, mandatory enrolled MFA and secure factor recovery.
2. Migrate identities with an explicit re-enrollment plan and prohibit silent email-only relinking.
3. Validate broker issuer/audience/nonce and assurance claims, and delegate factor lifecycle to its reauthenticated management flow.
4. Test absent/forged assurance, Google-only login, recovery, callback replay and factor replacement.
5. Accept the full assurance matrix before removing local factor APIs and obsolete secret storage.

**C — WebAuthn-first assurance (phishing-resistant; device/recovery migration cost).**
1. Define supported authenticators and a verified recovery process; enumerate accounts needing enrollment.
2. Add WebAuthn credential/challenge storage and a staged, existing-factor-verified migration from TOTP.
3. Require an origin/RP-bound assertion after federation and before credential changes; keep pending enrollment separate.
4. Test wrong origins, cloned/replayed challenges, credential loss and session theft.
5. Accept only when every migrated sign-in and replacement requires valid assurance; retain a tested secure recovery route.

**D — Isolated authentication gateway (central boundary; larger architectural change).**
1. Inventory all browser/API routes and define which limited endpoints are available before MFA.
2. Migrate sessions to gateway-issued assurance-bearing credentials with short-lived step-up grants.
3. Move sign-in and factor replacement into the gateway; require old-factor proof and verified pending-factor activation there.
4. Test direct backend requests, alternate login routes, recovery and gateway/backend identity mismatches.
5. Accept only after backend access cannot bypass the gateway assurance boundary and legacy sessions are invalidated.

<a id="repair-sec-03"></a>

##### SEC-03 alternatives

**A — Address-pinned outbound HTTP client (recommended; supports arbitrary public webhooks).**
1. Inventory webhook dispatches and define permitted schemes, ports, address classes, payload and timeout limits.
2. Implement canonical URL/address parsing and resolution of all A/AAAA answers; reject private, special-use and mapped ranges.
3. Connect only to a validated pinned address with correct TLS hostname; manually revalidate every redirect or reject redirects explicitly.
4. Test DNS rebinding, mixed answers, IPv6, HTTPS-to-private redirects and response-size/time limits in an isolated test network.
5. Accept only when packet-level evidence shows no prohibited destination is reached; migrate every webhook caller to this client.

**B — Controlled egress proxy (network-enforced; additional service).**
1. Design an authenticated egress service and public-destination policy including redirect and DNS behavior.
2. Provision the proxy in a restricted network and migrate webhook traffic through it.
3. Deny direct application egress for webhooks; implement destination validation and connection pinning in the proxy.
4. Test proxy bypass, DNS changes, internal addresses and worker retries.
5. Accept with observed deny logs and successful real public deliveries, then monitor policy violations and availability.

**C — Verified destination registry (smaller attack surface; less URL flexibility).**
1. Define supported webhook destinations and a customer onboarding/ownership-verification workflow.
2. Add destination records containing approved origins, paths and delivery policy; migrate existing URL configurations through review.
3. Dispatch by destination ID using pinned public resolution, controlled redirects and scoped secrets rather than arbitrary URLs.
4. Test hostile edits, DNS rebinding, redirect changes and attempted cross-tenant destination use.
5. Accept only after all active destinations pass public-reachability and ownership checks without losing legitimate delivery.

**D — Isolated webhook delivery workers (strong containment; queue/operations cost).**
1. Catalogue delivery semantics and isolate a worker network with no private application or metadata access.
2. Migrate sends to a durable queue containing destination and minimal payload, not broad application credentials.
3. Enforce public-only egress plus resolving/pinning validation in workers, with bounded retries and redirect checks.
4. Test internal targets, DNS/redirect bypass, poisoned messages and timeout exhaustion.
5. Accept after successful end-to-end delivery and network proof that workers cannot reach prohibited services.

<a id="repair-sec-04"></a>

##### SEC-04 alternatives

**A — Durable erasure saga (recommended; works across database and external objects).**
1. Inventory personal data, object prefixes, processors, backups and legal holds; define evidence and retention requirements.
2. Add deletion jobs, immutable minimal audit events and per-target progress; backfill orphan ownership references.
3. Offer password or federated recent reauthentication; revoke access, erase each eligible target idempotently, and record justified exceptions.
4. Test passwordless users, partial object deletion, retries, crashes and database rows without foreign keys.
5. Report completion only after all targets reconcile; verify restore-time suppression and approved audit/log retention.

**B — Data-ownership registry with lifecycle workers (systematic extensibility; migration effort).**
1. Define an ownership contract for every table, object and processor integration.
2. Backfill a subject-to-resource registry and make every new write register ownership transactionally.
3. Drive deletion from the registry with external-object acknowledgements, lawful holds and federated reauthentication.
4. Compare registry coverage against a seeded complete account and test racing writes during deletion.
5. Accept only with zero unexplained residual eligible resources; enforce registration in future feature acceptance.

**C — Subject-isolated encrypted storage (efficient crypto-erasure; major redesign).**
1. Identify data eligible for cryptographic erasure and records requiring physical deletion or legal retention.
2. Migrate eligible personal data/objects to subject-scoped encrypted containers with independently destroyable keys; inventory plaintext copies.
3. Implement verified user reauthentication, key destruction plus deletion of indexes/plaintext/processor copies and backup key policy.
4. Test restored backups, key caches, lost acknowledgements and non-encrypted derived records.
5. Accept only after independent recovery attempts cannot recover erased subject data and retained exceptions are documented.

**D — Privacy orchestration service with adapters (dedicated ownership; service/vendor overhead).**
1. Select an internal or managed privacy orchestrator and establish processor/retention obligations.
2. Register all local and external data systems and migrate deletion requests to durable cases.
3. Implement adapters for DB, object storage, cache, identity and processors, including federated verification and proof collection.
4. Test adapter failures, legal holds, duplicate requests and actual residual-resource reconciliation.
5. Accept only when the public endpoint reports case status accurately and completion evidence covers every registered system.

<a id="repair-sec-05"></a>

##### SEC-05 alternatives

**A — Mandatory startup dependency (recommended; smallest repair).**
1. Define required browser-security middleware and permitted webhook/internal exceptions.
2. Replace optional CSRF loading with a required import/initialization contract and readiness prerequisite.
3. Stop readiness on failure; retain narrow exemptions and current valid-token behavior.
4. Inject module/initialization failure and test missing/mismatching tokens, allowed webhooks and normal login.
5. Accept only when failed protection never produces a ready application and every mutating browser route is covered.

**B — Required browser router factory (localized composition; route migration needed).**
1. Classify routes as browser-cookie, signed webhook or machine-authenticated.
2. Build a router factory that cannot construct cookie-authenticated mutation routes without CSRF middleware.
3. Migrate handlers into typed protected routers and make construction failure fatal to route readiness.
4. Test new-route registration, exemption boundaries and failed router initialization.
5. Accept after route-inventory coverage is complete and application startup cannot silently omit a protected router.

**C — Session-bound synchronizer tokens (strong binding; client/session migration).**
1. Specify token lifecycle for login, logout, rotation and multiple tabs.
2. Add session-bound token issuance and migrate clients from double-submit tokens with an explicit cutover.
3. Install validation as mandatory session middleware, with strict origin policy and separately authenticated machine routes.
4. Test stolen/cross-session tokens, concurrent tabs, session regeneration and store failures.
5. Accept only when validation failures cannot be bypassed and readiness proves required session/token infrastructure is available.

**D — Browser-facing security gateway/BFF (central enforcement; extra boundary).**
1. Inventory browser mutations and define gateway-owned sessions, origins and anti-CSRF policy.
2. Migrate browser clients to the gateway and bind anti-CSRF tokens to gateway sessions.
3. Authenticate gateway-to-backend requests independently and prevent direct cookie-authenticated backend bypass.
4. Test gateway outage, direct origin access, forged gateway headers and legitimate webhook separation.
5. Accept only with end-to-end proof of mandatory CSRF enforcement and a readiness dependency on the gateway.

<a id="repair-sec-06"></a>

##### SEC-06 alternatives

These are alternative ways to satisfy the **verification gate** and remediate any discovered mismatches; none treats a scan alone as a fix.

**A — Harden current edge and secret manager (recommended; least migration).**
1. Obtain a sanitized deployment topology and key-name/location inventory without publishing values.
2. Run approved secret scans in a controlled environment emitting only fingerprints/locations; verify edge header sanitation and direct ingress restrictions.
3. Rotate/revoke any exposed credentials, migrate them to managed secrets, narrow proxy trust where required and enforce Secure cookies for every production mode.
4. Run external spoofing/CORS/CSRF tests plus anonymous, owner, other-tenant and admin-role negative tests for upload and account APIs.
5. Accept only with sanitized rotation evidence, passing actual-deployment tests and documented residual boundaries.

**B — Private origin behind authenticated gateway (strong ingress trust; topology change).**
1. Plan a gateway-to-origin authenticated connection and independent secret ownership.
2. Provision private origin networking and a secret manager; inventory and rotate any previously exposed keys.
3. Migrate ingress, overwrite forwarding headers at the gateway, trust only its identity/network and enforce TLS cookies.
4. Test direct-origin denial, malicious forwarding headers, cross-origin requests and tenant/admin authorization.
5. Accept only after public traffic demonstrably uses the authenticated path and no release artifact contains credentials.

**C — Separate browser/API deployments with workload identity (less shared-secret exposure; larger migration).**
1. Classify consumers by browser or machine identity and map required provider secrets.
2. Provision workload identities and separate public/private ingress; migrate supported integrations off static keys.
3. Keep unavoidable provider keys in managed secrets, rotate old keys, and apply per-deployment proxy/CORS/cookie policy.
4. Test identity scope, cross-service impersonation, public forwarding spoofing and tenant isolation across both deployments.
5. Accept only with least-privilege evidence, no legacy key use and passing security regression tests.

**D — Reproducible immutable security baseline (repeatable acceptance; pipeline investment).**
1. Define reviewed ingress, proxy, cookie and secret-location invariants as deployment policy.
2. Build sanitized configuration validation, artifact/history scanning and isolated preview deployment checks into release CI.
3. Migrate current deployment to that baseline, rotate any discovered exposures and remediate failed topology or auth checks.
4. Exercise the pipeline with known-invalid configurations, negative ownership/admin tests and real edge smoke tests without exposing secret values.
5. Accept only signed evidence from the deployed revision; require recurring rotation/retention and topology review rather than one-time approval.

### Playbooks: commerce

Source: `reports/readiness-audit/commerce.md`. [Domain evidence](#evidence-commerce) · [Index](#unified-platform-finding-index)

#### Repair playbooks

Each A–D is a separate complete implementation strategy, not a step of another option. Numbered steps are preparation, implementation/migration, verification and acceptance. Alternatives still must satisfy all other applicable findings. No option promises a guaranteed first attempt.

<a id="repair-c1"></a>

##### C1 alternatives — marketplace booking

**A. Typed transactional booking plus outbox — recommended.** Best incremental fit; introduces a worker/outbox.
1. Define typed order fields and fulfillment obligations; inventory paid pending/partial orders using an approved reconciliation process.
2. Implement typed storage mutations and use canonical minor-unit conversion from `amount`; migrate settlement-state/outbox tables.
3. Commit order booking and durable license/split/transfer/revenue jobs together; mark fulfilled only after required obligations complete.
4. Test the actual storage/service chain with successful Stripe test payments and crashes at every boundary.
5. Reconcile historical obligations, verify one complete booking per payment, and release after outstanding jobs converge.

**B. Database settlement procedure.** Strong centralized invariants; more SQL ownership.
1. Specify payment verification inputs and sale/fee/split conservation invariants.
2. Migrate a typed settlement procedure that locks the order and writes ledger/revenue/job rows atomically.
3. Replace dynamic storage calls with the procedure and durable external-effect consumers.
4. Exercise concurrent settlement, invalid intent, rollback and job replay against a disposable database.
5. Backfill incomplete orders through the same procedure and accept only balanced, fulfilled results.

**C. Dedicated payment-settlement service.** Clear ownership; operationally heavier.
1. Document the checkout-to-settlement contract and identify all current callers.
2. Create a durable service with typed order repository, payment validation and settlement state machine.
3. Migrate existing pending orders and route signed payment events to its durable intake; expose fulfillment status back to marketplace.
4. Run contract and test-mode purchase/crash recovery tests across both services.
5. Compare legacy and new settlement totals, clear unmatched payments, then cut over ownership.

**D. Event-sourced sale aggregate.** Best traceability; largest data-model change.
1. Define PaymentVerified, SaleBooked, LiabilityAllocated and FulfillmentCompleted events.
2. Migrate append-only per-order streams and unique payment identities; replace unsupported repository methods.
3. Build resumable projections and idempotent license/transfer consumers; import historical sale state with provenance.
4. Rebuild projections and replay duplicate/out-of-order events under fault injection.
5. Accept when rebuilt balances and fulfillment match verified payments and a recovery rehearsal succeeds.

<a id="repair-c2"></a>

##### C2 alternatives — refund authorization

**A. Ownership-scoped service authorization — recommended.** Smallest comprehensive fix; requires explicit refund policy.
1. Define buyer, seller-support and administrator refund permissions and eligibility windows.
2. Scope lookup by authenticated buyer ID in the service; add separately authorized privileged paths and policy checks.
3. Migrate refund actor/reason audit fields and review existing requests with mismatched buyer identity.
4. Test owner, nonowner, expired-policy and privileged requests through HTTP and direct service callers.
5. Accept only when unauthorized requests cause no provider invocation and valid requests preserve actor provenance.

**B. Approval-case workflow.** Strong review controls; slower customer refunds.
1. Define case ownership, approval roles and evidence requirements.
2. Replace direct initiation with owner-bound refund cases; require authorized approval before execution.
3. Migrate existing pending refunds into cases and bind approved cases to unique execution IDs.
4. Test cross-account case access, approval separation and replayed approvals.
5. Accept after authorized cases refund correctly and unapproved cases cannot move money.

**C. Row-level authorization boundary.** Defense in depth; database/session-context complexity.
1. Map authenticated identities and privileged roles to order/refund database policies.
2. Implement transaction-local identity context and RLS-scoped order/refund access plus service eligibility validation.
3. Migrate policies with privileged reconciliation tooling and remove unscoped application access.
4. Test HTTP and direct database/service attempts across tenants, including pooled connections.
5. Accept after no identity leaks across requests and only authorized order rows can trigger refunds.

**D. Short-lived signed refund capability.** Useful for support-assisted flows; token lifecycle overhead.
1. Define owner/policy checks for issuing single-purpose refund authorizations.
2. Issue signed, expiring capabilities binding actor, order, maximum amount and nonce.
3. Make execution verify authorization and atomically consume the nonce before a durable provider command.
4. Test forged, stolen-to-other-actor, expired, replayed and amount-modified capabilities.
5. Accept after legitimate refunds complete and every rejected capability has zero financial effect.

<a id="repair-c3"></a>

##### C3 alternatives — conserved balances

**A. Double-entry, currency-partitioned ledger — recommended.** Broadest correctness; requires audited migration.
1. Specify gross receipts, fee revenue, collaborator/seller liabilities, connected cash and bank cash accounts.
2. Migrate integer-minor-unit journals and allocations; reconcile existing orders, transfers and payouts into opening balances.
3. Reserve liabilities atomically and book transfers/bank payouts as distinct legs, including all pending/in-transit states.
4. Test $100/$10 fee cases, royalties without funding, refunds, multi-currency and concurrent withdrawals.
5. Accept when each currency balances and withdrawable liability cannot exceed funded, unreserved entitlement.

**B. Immutable payable-allocation records.** Less machinery than a full general ledger; external GL still needed.
1. Define one net payable allocation per beneficiary and source earning.
2. Migrate allocations, reservations and funding/disbursement-leg tables; derive them from verified historical transactions.
3. Replace aggregate order sums with allocation availability and fund connected accounts before bank payout.
4. Test partial reservation, fee retention, failed transfer release and multi-currency grouping.
5. Accept once allocation totals reconcile to receipts and no allocation can be disbursed twice.

**C. Destination-charge funding model.** Provider handles the primary marketplace funding split; royalties still need explicit funding.
1. Assess Connect merchant liability, refund and platform-fee requirements with finance.
2. Implement destination charges/application fees and map provider balance transactions to net seller entitlements.
3. Migrate legacy separate transfers; implement royalty funding transfers and distinct bank-payout records.
4. Test charge/refund/payout cycles, delayed availability and mixed old/new orders in Stripe test mode.
5. Accept after local per-currency entitlement equals reconciled provider funding less true disbursements.

**D. External accounting subledger as authority.** Mature reconciliation tooling; integration cost/vendor dependency.
1. Select a ledger supporting immutable minor-unit postings, reservations and Connect cash accounts.
2. Map commerce events and migrate balanced opening liabilities with finance signoff.
3. Authorize payouts against ledger reservations, orchestrating transfer and bank legs separately.
4. Test provider timeouts, duplicate postings, currency separation and reversal handling.
5. Accept only after independently reconciled balances and recovery/export procedures pass.

<a id="repair-c4"></a>

##### C4 alternatives — executable collaborator royalties

**A. Unified beneficiary allocations — recommended.** Reuses C3; requires split-contract migration.
1. Define eligible accepted split versions, net-of-fee basis, rounding and total-percentage rules.
2. Migrate immutable order-level beneficiary allocations with unique order/recipient/version keys.
3. Route all seller and collaborator shares to the same payable engine; retain unresolved recipients in escrow liabilities rather than seller fallback.
4. Test inactive splits, over/under totals, more than twenty recipients and concurrent replay.
5. Reconcile historic split pending totals and accept when every recipient can receive exactly their funded allocation.

**B. Direct multi-beneficiary transfers.** Fast collaborator settlement; more provider operations and reversals.
1. Require verified Connect recipients and an approved split snapshot before sale.
2. Implement one idempotent net-share transfer command per beneficiary, with held obligations for incomplete onboarding.
3. Migrate old split credits to unsettled transfer obligations and remove competing seller-only availability.
4. Test rounding, partial provider failure, refund reversals and onboarding completion.
5. Accept after transferred plus held plus fee amounts exactly equal collected receipts.

**C. Periodic royalty clearing.** Lower transaction volume; delayed collaborator cash.
1. Define settlement periods, contract acceptance and payable thresholds.
2. Accrue validated net shares into a durable clearing ledger instead of completed transactions.
3. Migrate pending split totals and create finalized beneficiary statements linked to payout allocations.
4. Test close/reopen, late sales, refunds and period reruns without duplicate accrual.
5. Accept when each statement reconciles to sales and its paid amount matches actual provider settlement.

**D. Contract escrow and release service.** Handles disputed/unresolved rights; adds operations.
1. Define contract approval and beneficiary-verification prerequisites for release.
2. Implement order-funded escrow liabilities and versioned split release instructions.
3. Migrate unresolved/miscredited historical shares into auditable escrow cases.
4. Test missing recipients, disputed percentages, multi-party approvals and partial release recovery.
5. Accept after all releases conserve funds and beneficiaries receive provider-confirmed payments.

<a id="repair-c5"></a>

##### C5 alternatives — genuine scheduled payouts

**A. Consolidate onto a corrected payable engine — recommended.** Avoids parallel financial systems; depends on C3/C4.
1. Specify statement payable fields, due-date rules and supported real payment methods.
2. Migrate statement schema and integer payable allocations, reconciling `totalEarnings` against source transactions.
3. Replace process-local scheduler requests/log-only execution with durable commands to the corrected payout engine.
4. Test schedule due dates, thresholds, worker restart, provider failure and receipt provenance.
5. Accept when scheduled statements become paid only through confirmed provider transactions and no payable remains NaN.

**B. Complete a dedicated royalty payout service.** Preserves separation; duplicates operational responsibilities.
1. Define supported banking/Stripe/PayPal contracts and durable request states.
2. Migrate payout requests, receipts, statement allocations and complete statement amounts/currencies.
3. Implement real provider adapters, idempotent execution and reconciliation workers instead of the logging switch.
4. Test each advertised method end to end, including due dates and restart recovery.
5. Accept per method only after provider-confirmed payouts and paid-statement totals reconcile.

**C. Controlled bank batch settlement.** Practical for periodic royalties; bank approval latency.
1. Agree a bank-supported payment-file/API format, authorized approvers and settlement timetable.
2. Migrate payable statements and durable batch/member identities.
3. Generate authorized payment instructions, ingest bank acknowledgments/returns, and allocate actual settlement to statements.
4. Test rejected files, duplicate submissions, partial returns and period reruns in the bank's certification environment.
5. Accept after a reconciled settlement rehearsal; receipts reference bank confirmations, never local random IDs.

**D. Managed payables provider.** Broad methods/compliance support; commercial and integration overhead.
1. Select a regulated payout provider and validate supported countries, currencies and beneficiary onboarding.
2. Migrate statements and beneficiaries with independently reconciled payable opening amounts.
3. Integrate scheduled payable submission, durable callbacks and statement-linked settlement records.
4. Test provider sandbox payouts, withholding inputs, failures, deadlines and duplicate callbacks.
5. Accept after reconciliation and operational escalation drills demonstrate real delivery for each enabled method.

<a id="repair-c6"></a>

##### C6 alternatives — refund/dispute financial lifecycle

**A. Unified compensation state machine — recommended.** Most direct fit; requires careful historical reconciliation.
1. Define refund/dispute states, seller/collaborator clawback rules and evidence requirements.
2. Migrate provider-unique records plus durable actor/order/refund-operation identities into the commerce schema, including external dashboard refunds.
3. Reuse each operation on HTTP retry, reject payload changes and reconcile ambiguous outcomes before execution; register durable upserts, compensate liabilities/transfers, and create evidence from actual order/license/delivery records with accountable approval.
4. Test duplicate partial-refund requests, provider success followed by DB failure, pending-to-failed transitions, restart, disputes and already-paid sellers.
5. Accept when provider net receipts equal local net liabilities and every unresolved recovery has an owned case.

**B. Provider balance-transaction reconciliation authority.** Catches missing webhooks; settlement latency.
1. Define mappings from Stripe refund/dispute/balance transactions to original orders and transfers.
2. Migrate unique provider transaction identities, a reconciliation cursor and durable actor/order/refund-operation identities reused across HTTP retries with immutable request payloads.
3. Poll/import authoritative financial changes, reconcile ambiguous refund outcomes before another execution, and compensate liabilities/transfers; replace generic affirmative dispute evidence with actual order/license/delivery records requiring accountable approval.
4. Test missed events, duplicate partial-refund requests, post-provider DB failures, fee adjustments, replayed imports and evidence approval.
5. Accept after reconciliation detects and repairs all seeded gaps without fabricated dispute evidence.

**C. Event-sourced reversal aggregate.** Strong auditability; greater redesign.
1. Define refund requested/accepted/settled and dispute opened/won/lost events linked to sale allocations.
2. Migrate durable streams and deduplicated intake; bind each refund aggregate to actor/order/refund-operation identity, reusing it on HTTP retry and rejecting changed payloads.
3. Build compensation projections and reversal commands with ambiguous-outcome reconciliation before reexecution; replace generic affirmative dispute evidence with actual order/license/delivery records requiring accountable approval.
4. Replay lifecycle permutations, duplicate partial-refund HTTP requests, provider-success/DB-failure boundaries, restarts and already-disbursed collaborator cases.
5. Accept when rebuilt balances match provider state and all reversal commands terminate or enter accountable exception queues.

**D. Operational case management with durable financial execution.** Human judgment for disputes; staffing requirement.
1. Define service-level deadlines, authorized case ownership and evidence review rules.
2. Persist every provider refund/dispute into an order-linked case; bind durable actor/order/refund-operation identities to execution requests rather than HTTP attempts.
3. Reuse immutable operation requests on retry, reject payload changes and reconcile ambiguous outcomes before approved ledger/provider reversals; require accountable approval of actual order/license/delivery evidence.
4. Test restart, duplicate partial-refund requests, provider-success/DB-failure outcomes, outside-dashboard refunds, deadlines and concurrent case actions.
5. Accept after a complete refund/dispute drill reconciles money and produces reviewed, factual evidence.

<a id="repair-c7"></a>

##### C7 alternatives — subscription entitlement integrity

**A. Canonical billing contract and entitlement resolver — recommended.** Least migration risk; must normalize old subscriptions.
1. Specify canonical plan identifiers, price mappings and lifetime precedence.
2. Persist purchase/subscription identities and migrate existing `planName`/`planId` associations.
3. Write consistent subscription metadata, handle paid lifetime events, and scope updates/deletes to the active subscription.
4. Test all checkout producers, yearly/lifetime upgrades and reordered old-subscription events.
5. Reconcile purchased products to entitlements and accept only when every paid path grants the intended access.

**B. Price-ID-driven entitlements.** Avoids metadata dependence; catalogue versioning required.
1. Inventory approved Stripe prices and define explicit entitlement mappings.
2. Migrate a versioned price catalogue and link existing purchases/subscriptions.
3. Resolve verified session line items/subscription prices for activation, with lifetime purchase receipts and active-subscription guards.
4. Test metadata absence, retired prices, annual plans and stale deletion events.
5. Accept after catalogue reconciliation proves every supported product maps to one correct entitlement.

**C. Durable billing purchase aggregate.** Clean lifecycle ownership; more application state.
1. Define intended plan, purchase owner and completion/cancellation transitions.
2. Create purchase records before all Stripe checkout/PaymentIntent operations and migrate legacy identities.
3. Link provider events to the aggregate and derive entitlement from settled purchase/subscription state.
4. Test missing metadata, interrupted redirects, duplicate payments and subscription replacement.
5. Accept after replay reconstructs correct access without relying on the browser success page.

**D. Provider-backed entitlement synchronizer.** Robust against missed events; provider dependency and latency.
1. Define authoritative product/price resolution and lifetime purchase evidence.
2. Migrate local entitlement snapshots with source subscription/purchase identity and version.
3. Make events enqueue a refresh of current provider state; reconcile periodically rather than applying stale event payloads directly.
4. Test delayed/deleted/reordered events and provider outages with retained last-verified state.
5. Accept after periodic and event-driven refresh agree for monthly, yearly, lifetime and replacement subscriptions.

<a id="repair-c8"></a>

##### C8 alternatives — idempotent execution

**A. PostgreSQL inbox/outbox with stable operation IDs — recommended.** Fits existing database; worker lifecycle needed.
1. Define durable event, sale, promotion-redemption and disbursement identities, including actor/order/refund-operation identity reused across HTTP attempts and immutable payload validation.
2. Migrate unique inbox/effect/command rows and classify ambiguous historical provider outcomes.
3. Atomically claim local effects; use command IDs as Stripe idempotency keys and reconcile before retrying unknown outcomes.
4. Test simultaneous deliveries, events beyond 24 hours, duplicate partial-refund requests, changed payload rejection, lost responses and DB failure after provider success.
5. Accept when each business effect occurs once and ambiguous operations resolve without duplicate refunds or transfers.

**B. Durable workflow engine.** Built-in recovery; extra infrastructure.
1. Model checkout, payout and refund workflows with business-unique IDs; persist actor/order/refund-operation identity and immutable payloads so HTTP retries resume the original workflow.
2. Migrate pending events/commands and durable workflow histories.
3. Implement idempotent activities with provider keys, persistent effect dedupe and explicit unknown-result reconciliation.
4. Kill workers around every external activity; replay concurrent events, promotion updates and partial-refund requests, including changed payloads and DB failure after provider success.
5. Accept after recovered workflows preserve one effect per business identity and complete all obligations.

**C. Database-native financial command executor.** Minimal queue infrastructure; SQL locking complexity.
1. Define command states, payload hashes and reconciliation timeouts; bind durable actor/order/refund-operation identity before execution and reuse it across HTTP retries.
2. Migrate unique command/effect tables and per-entity locking procedures.
3. Execute claimable commands with provider idempotency keys; persist outcomes separately from notifications and reconcile ambiguous provider outcomes before reexecution.
4. Test lock expiry, process death, payload mismatch, duplicate webhooks/partial-refund requests and provider-success/DB-failure boundaries across workers.
5. Accept after no failed notification changes a successful disbursement into retryable money movement.

**D. Dedicated payment gateway service.** Centralizes policy for all callers; service migration overhead.
1. Inventory every refund/transfer/payout producer; require durable actor/order/refund-operation identity and immutable payload validation in the gateway protocol, reused across HTTP retries.
2. Migrate provider-operation identities and durable event/effect intake to the gateway.
3. Route all producers through idempotent commands and return pending/unknown states until reconciliation confirms outcome.
4. Test cross-caller duplicate commands, repeated partial-refund HTTP requests, changed payloads, provider timeouts, post-provider DB failure and gateway restart with independent effect replay.
5. Accept after no application path can bypass operation identity or duplicate promotion/ledger/provider effects.

<a id="repair-c9"></a>

##### C9 alternatives — release verification

**A. Disposable integration environment and Stripe test mode — recommended.** Reproducible; cannot certify live banking availability.
1. Define release assertions and isolate non-production identities, database and provider accounts.
2. Apply the real migration chain and deploy the same routing/worker configuration without copying secret values into reports.
3. Run actual checkout, split, transfer, payout, refund and entitlement flows through production code paths.
4. Inject concurrency, restart and provider-response loss; reconcile resulting rows and provider test transactions.
5. Accept with signed evidence of balances, schema parity and recovery; retain separate live-account onboarding approval.

**B. Dedicated staging payment certification environment.** Close deployment fidelity; ongoing cost.
1. Establish staging ownership, isolated provider accounts and evidence-retention policy.
2. Deploy candidate artifacts and production-equivalent routing, storage, queue and migration procedures.
3. Execute scenario-driven test-mode financial journeys with real database writes and provider objects.
4. Exercise deployment rollback and webhook replay, checking every financial invariant independently.
5. Accept only an artifact/configuration pair with reviewed evidence and a production readiness checklist.

**C. Finance-led release reconciliation drill.** Strong accounting scrutiny; more manual effort.
1. Agree a finite matrix of purchases, fees, splits, currencies, reversals and failure points.
2. Prepare a fresh isolated deployment and preapproved expected journal/entitlement outcomes.
3. Have operators execute real test-mode transactions while finance independently calculates expected settlement.
4. Compare provider exports, application rows and statement/receipt outputs; replay exceptions to completion.
5. Accept when discrepancies are closed and operators demonstrate recovery without database guesswork.

**D. Independent payment certification engagement.** External challenge; cost and lead time.
1. Define scope, access boundaries, privacy rules and required evidence with a payment specialist.
2. Supply a representative isolated deployment, migration history and provider test access through secure channels.
3. Require actual application-to-provider lifecycle exercises, not mocked service-only tests.
4. Have the reviewer challenge authorization, failure recovery, idempotency, conservation and deployment assumptions.
5. Accept after findings are remediated and rechecked, with production account/network prerequisites separately approved.

### Playbooks: integrations

Source: `reports/readiness-audit/integrations.md`. [Domain evidence](#evidence-integrations) · [Index](#unified-platform-finding-index)

#### Repair playbooks

Each letter is an independent implementation alternative, not another phase of the preceding option. Each includes preparation, implementation/migration, testing and acceptance. Select one primary approach per finding; combinations require explicit ownership of overlapping state. None guarantees a first-attempt fix.

<a id="repair-i1"></a>

##### I1 — Make submission responses reflect durable external acknowledgement

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

<a id="repair-i2"></a>

##### I2 — Prevent duplicate/orphaned distribution operations

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

<a id="repair-i3"></a>

##### I3 — Establish evidence-based catalog coverage

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

<a id="repair-i4"></a>

##### I4 — Make catalog work survive process replacement

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

<a id="repair-i5"></a>

##### I5 — Protect reusable OAuth credentials without breaking consumers

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

<a id="repair-i6"></a>

##### I6 — Recover social publishing without duplicating external posts

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

<a id="repair-i7"></a>

##### I7 — Align preference semantics across all notification producers

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

<a id="repair-i8"></a>

##### I8 — Implement real opt-in SMS notifications

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

<a id="repair-i9"></a>

##### I9 — Deliver a supported external payout execution workflow

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

### Playbooks: ai-media

Source: `reports/readiness-audit/ai-media.md`. [Domain evidence](#evidence-ai-media) · [Index](#unified-platform-finding-index)

#### Repair playbooks

Each alternative below is a different complete implementation strategy, not a step of another alternative. Choose one per finding after requirements review; none guarantees first-attempt success. No alternative treats hiding the feature, replacing results with mocks, or bypassing MaxCore as remediation.

<a id="repair-am-1"></a>

##### AM-1 alternatives

**A — MaxCore variant-and-score endpoint (recommended).** Lowest ambiguity; requires a calibrated scorer.
1. Define a versioned response containing model-generated variants, metric units, uncertainty, and model provenance.
2. Implement joint variant generation and calibrated scoring inside MaxCore using consented outcome data.
3. Replace local tone transforms, random numbers, and fixed explanation confidence; migrate consumers to the typed contract.
4. Test unavailable/malformed upstream responses and held-out score calibration, including repeated identical requests.
5. Accept only when each displayed prediction traces to its MaxCore result and no local substitution survives.

**B — Measured online A/B experiments.** Strong causal evidence; slower and requires sufficient audience traffic.
1. Define consent, traffic allocation, attribution windows, and minimum sample sizes.
2. Have MaxCore generate variants and assign experiment arms; collect actual impressions and outcomes.
3. Replace predicted fields with explicitly measured experiment metrics and MaxCore statistical conclusions; migrate existing records as unverified.
4. Test allocation bias, deduplication, delayed outcomes, low-sample behavior, and confidence-interval coverage.
5. Accept when real experiment outcomes support displayed rankings and the complete generation-to-result workflow works.

**C — MaxCore pairwise preference model.** Easier than absolute engagement calibration; ranking is not an engagement-rate prediction.
1. Specify pairwise quality/ranking semantics and gather labeled comparisons with measured outcome links.
2. Train and serve a MaxCore preference scorer alongside MaxCore variant generation.
3. Replace the API/UI's percentage prediction with ranked comparisons, uncertainty and provenance; migrate clients together.
4. Evaluate held-out ranking agreement and failure behavior; verify no absolute engagement claim remains.
5. Accept when users can generate and compare variants using validated authoritative ranks.

**D — Authoritative asynchronous batch scoring.** Supports expensive scoring and reuse; adds pending-job UX.
1. Define content fingerprints, model versions, result expiry, and per-user isolation.
2. Implement a MaxCore batch generation/scoring job with calibrated output and explicit terminal errors.
3. Migrate both variant routes and explanation records to pending/completed job results.
4. Test stale scores, changed text, concurrent requests, upstream failures and calibration.
5. Accept only when completed variants have matching content/model provenance and never borrow another variant's score.

<a id="repair-am-2"></a>

##### AM-2 alternatives

**A — Dedicated supervised MaxCore services (recommended).** Best contract clarity; largest labeled-data requirement.
1. Inventory every named capability, consumer, target variable, data authorization and minimum history.
2. Connect measured engagement, audience and revenue inputs; build task-specific MaxCore training/evaluation pipelines.
3. Implement versioned inference endpoints and migrate every throwing adapter/501 consumer to validated contracts.
4. Backtest by time and creator, assess calibration/bias, and test insufficient-data and outage responses.
5. Accept each capability separately only when its end-to-end real-data workflow and quality threshold pass.

**B — MaxCore probabilistic time-series service.** Shared quantitative foundation; less suited to sparse creator histories.
1. Specify consistent series, horizons, seasonality, censoring and uncertainty requirements for each capability.
2. Implement hierarchical probabilistic forecasting, anomaly detection and timing optimization inside MaxCore.
3. Add MaxCore evidence-grounded insight/recommendation adapters over those estimates; wire all named consumers.
4. Test rolling-origin forecasts, cohort transfer, missing data and interval coverage against agreed baselines.
5. Accept only after quantitative and recommendation-specific criteria pass, not merely a successful HTTP response.

**C — Retrieval-conditioned MaxCore reasoning with quantitative tools.** More explainable insights; tool correctness becomes critical.
1. Define an authorized evidence store and quantitative tool schemas for all prediction tasks.
2. Implement trained MaxCore reasoning that invokes real forecasting/survival/engagement tools and cites retrieved observations.
3. Deliver structured forecasts and recommendations through existing routes, enforcing typed numeric evidence and source timestamps.
4. Test hallucinations, cross-user retrieval, tool failures, numeric consistency and predictive calibration.
5. Accept when every supported claim has valid evidence and every prediction meets a held-out performance threshold.

**D — Scheduled MaxCore decision bundles.** Efficient for dashboards; freshness and interactive latency differ.
1. Define per-creator daily/weekly bundles covering every named forecast, insight and optimization, with expiry and minimum history.
2. Build authoritative MaxCore batch analysis on measured inputs, with trained task models and capability-specific quality gates.
3. Change consumers to retrieve fresh bundles or request recomputation; migrate UI to explicit analysis-as-of times.
4. Test missing bundles, stale inputs, task-specific failures and rolling backtests for every output type.
5. Accept when complete real-data bundles reach all consumers within freshness SLOs; a partial bundle cannot imply universal support.

<a id="repair-am-3"></a>

##### AM-3 alternatives

**A — Strict audio fulfillment before finalization (recommended).** Most predictable user contract; optional audio failures become explicit failed jobs.
1. Define required audio/narration flags and concrete delivery checks for each video entrypoint.
2. Make synthesis helpers return typed failures; require successful speech/soundtrack before final render completion.
3. Propagate actionable job errors and preserve retryable intermediate video assets.
4. Test missing engines, missing dataset, empty speech, invalid audio and valid intentionally silent requests.
5. Accept when a required-audio request cannot complete without a verified matching audio track and intelligible narration.

**B — Audio-first two-stage media pipeline.** Avoids wasted rendering; increases orchestration complexity.
1. Define audio and video subjob contracts, dependencies and cancellation behavior.
2. Produce and validate requested soundtrack/narration first inside MaxCore, then render against its timed audio manifest.
3. Migrate all three consumers to the dependency pipeline and surface subjob progress/errors.
4. Test duration mismatch, retries, voice selection, mux failures and cancel propagation.
5. Accept only when both validated subjobs produce one final artifact satisfying requested audio features.

**C — Multiple qualified speech/audio backends inside MaxCore.** Higher resilience; greater maintenance and licensing burden.
1. Qualify permitted in-house backends for requested languages/voices and soundtrack characteristics.
2. Implement MaxCore-controlled equivalent-capability routing with bounded failover and explicit no-capability errors.
3. Record delivered engine, voice and audio provenance; migrate callers to require the selected capability.
4. Inject primary-engine failures and assess secondary output intelligibility, timing and rights.
5. Accept when failover delivers the requested semantics or reports failure, never an unannounced silent replacement.

**D — Repairable partial-production workflow.** Preserves useful video work; requires clear user approval states.
1. Define incomplete versus completed artifact states and an audio-repair action.
2. Have MaxCore return a missing-component manifest when audio fails, retaining the visual intermediate.
3. Implement audio regeneration and remuxing, with user approval before final completion; migrate download/publishing consumers.
4. Test partial generation, repeated repair, changed narration and attempts to publish incomplete output.
5. Accept when required components are verified before final delivery and users can genuinely finish the repair workflow.

<a id="repair-am-4"></a>

##### AM-4 alternatives

**A — Full MaxCore media manifest (recommended).** Preserves existing product promises; requires expanded upstream contract.
1. Inventory every accepted option and define semantics, asset ownership and ordering.
2. Extend MaxCore's request schema/planner to consume all images, voice assets, logo, beat sync, color and transitions.
3. Replace truncation/omission with an ordered manifest and return a resolved-options receipt.
4. Test ten distinct images and each control independently; compare output frames/audio with the receipt.
5. Accept only when every accepted input influences the intended output or receives a specific preflight validation error.

**B — MaxCore storyboard subjobs and assembly.** Works with limited reference windows; more render coordination.
1. Define scene mapping for all submitted images and global visual/audio controls.
2. Let MaxCore plan multiple reference-limited scene jobs while retaining original image order.
3. Assemble inside MaxCore with global logo, voice, beat synchronization, grades and transitions.
4. Test image-boundary continuity, scene duration totals, all controls and subjob failures.
5. Accept when all requested assets appear as planned and the final assembly fulfills global controls.

**C — MaxCore-owned asset preprocessing and compositing.** Decouples generation from presentation; adds intermediate asset handling.
1. Classify controls as planning, conditioning or final-composition requirements.
2. Build MaxCore preprocessing for all image references and conditioning audio, plus explicit postcomposition for logo/grade/transitions.
3. Migrate the app to send one authoritative composition specification rather than ignored optional fields.
4. Test individual preprocessing/compositing stages and end-to-end multi-image output fidelity.
5. Accept only after every advertised control has an observable validated effect without local AI reinterpretation.

**D — Interactive authoritative storyboard editor.** Gives users explicit control; largest UX change.
1. Define editable scene/asset mappings and expose MaxCore's actual per-scene reference constraints.
2. Implement a MaxCore planning API that proposes a complete storyboard using all assets and advanced controls.
3. Let users confirm/edit the storyboard, then execute it through MaxCore and migrate the one-shot entrypoint.
4. Test reordered assets, more than three images, custom audio/logo and all accepted render settings.
5. Accept when confirmed storyboards and delivered assets agree; UI acknowledgment alone is not fulfillment.

<a id="repair-am-5"></a>

##### AM-5 alternatives

**A — Signed qualified checkpoint manifest (recommended).** Reproducible promotion; requires model-release discipline.
1. Define mandatory architecture/tokenizer identity, tensor coverage, dataset provenance and task-evaluation thresholds.
2. Produce signed manifests from actual training/evaluation; reject incompatible or incomplete inference checkpoints.
3. Split initialized, trained and qualified readiness; migrate wait/health consumers to qualified state.
4. Test missing weights, wrong shapes, partial tensors, invalid signatures and valid qualified checkpoints.
5. Accept with a reproducible manifest-to-running-model identity and held-out results for every advertised native task.

**B — Shadow qualification before model promotion.** Captures integration regressions; consumes extra compute.
1. Define sanitized representative task suites and incumbent quality/safety baselines.
2. Load candidates into an isolated training/shadow state and run real inference evaluation.
3. Promote only passing candidates through MaxCore's model registry; retain the last qualified model.
4. Test random-init and partially loaded candidates, rollback, and scoring reproducibility.
5. Accept when unqualified candidates never receive production inference and promotion evidence is inspectable.

**C — Mandatory startup qualification suite.** Simple deployment-independent gate; slower cold starts.
1. Establish minimum tensor integrity and task-quality checks with known evaluation provenance.
2. Run integrity checks and real held-out inference during MaxCore startup, distinguishing training bootstrap from serving.
3. Set readiness only after passing; publish structured failure reasons to callers.
4. Test missing/incompatible weights, degraded output and clean restarts against approved artifacts.
5. Accept after repeated startup qualifications match offline model evaluation and inference cannot bypass the gate.

**D — Immutable inference snapshots from training service.** Strong training/serving separation; more model lifecycle machinery.
1. Define immutable snapshot formats, architecture compatibility and evaluation approvals.
2. Make training export fully materialized, qualified snapshots rather than opportunistic partial loads.
3. Make inference consume only approved snapshot IDs and expose that identity in responses.
4. Test interrupted exports, mismatched tokenizers, snapshot rollback and task output quality.
5. Accept when every inference maps to an approved complete snapshot; random initialization remains training-only.

<a id="repair-am-6"></a>

##### AM-6 alternatives

**A — Bounded classified retries (recommended).** Smallest execution change; terminal failures need user-facing recovery.
1. Define retryable versus permanent renderer errors, total attempt/time budgets and cancellation semantics.
2. Replace the unconditional loop with classified bounded retry/backoff and a cancellation check.
3. Return terminal errors with remediation hints and implement explicit user retry using validated inputs.
4. Inject permanent and transient errors; verify worker release, eventual success and cancellation.
5. Accept when every job reaches a truthful terminal state within its budget without leaking render activity.

**B — Deadline-enforced isolated render workers.** Strong resource containment; adds process supervision.
1. Establish wall-clock, memory and CPU budgets per render class.
2. Execute each render in an isolated worker with a hard deadline and graceful/forced cancellation.
3. Translate worker outcomes into typed job states and permit bounded restarts only for transient failures.
4. Test hangs, memory pressure, deterministic bad inputs and worker termination.
5. Accept when a stuck renderer cannot outlive its job budget or block unrelated generation.

**C — Preflight plus resumable staged rendering.** Avoids repeated expensive work; larger pipeline refactor.
1. Split source validation, conditioning, synthesis, encoding and artifact validation into explicit stages.
2. Implement MaxCore preflight checks and stage-specific retry budgets/checkpoints.
3. Migrate the loop to a stage state machine with cancellation and precise terminal failure reasons.
4. Test permanent failures at every stage and transient restart from the correct completed stage.
5. Accept when invalid requests fail before expensive work and valid retries complete without infinite stage cycling.

**D — Bounded alternate render plans inside MaxCore.** Can recover unsupported combinations; must preserve user intent.
1. Define compatible alternative render plans and which changes require user approval.
2. Let MaxCore choose a finite plan set after preflight, with per-plan budgets and no semantic substitution.
3. Execute plans sequentially, report actual chosen parameters, and terminate when alternatives are exhausted.
4. Test all-plan failure, successful equivalent fallback, user rejection and budget exhaustion.
5. Accept when jobs either deliver an approved equivalent result or finish with an actionable failure within the total budget.

### Playbooks: data-runtime

Source: `reports/readiness-audit/data-runtime.md`. [Domain evidence](#evidence-data-runtime) · [Index](#unified-platform-finding-index)

#### Repair playbooks

Each lettered alternative is a complete implementation route, not a step in a single four-part plan. Choose one route per finding, addressing listed acceptance conditions. Tests below are future isolated-environment work, not tests executed during this audit. None guarantees a first-attempt repair.

<a id="repair-d1"></a>

##### D1 — Reliable backup objects and catalog

**A. Repair fixed-key objects plus transactional catalog — recommended.** Lowest disruption; requires a catalog migration.
1. Inventory backup object naming and capture a read-only catalog snapshot; identify actual generated objects without printing contents.
2. Use `uploadFileAtKey` for fixed names, or consistently persist the returned generated key; introduce a SQL backup catalog with unique IDs and pending/verified/deleting states.
3. Reconcile orphan objects into the catalog using checksums and readable SQL metadata; retain ambiguous objects for review; remove the mutable JSON index from authority.
4. Test concurrent creation, index unavailability, upload success/catalog failure and retention delete failure using an isolated real backing service.
5. Accept only when each successful creation downloads by its recorded key, listing survives restarts, and failed deletions retain retriable catalog entries.

**B. Immutable object manifests.** Avoids a DB dependency for disaster discovery; needs provider conditional writes/listing.
1. Define immutable dump/manifest IDs, checksum format and minimum provider consistency guarantees.
2. Write dump then immutable per-backup manifest; build listings from manifests rather than read/modify/write index JSON.
3. Import recoverable legacy objects as manifests; implement retention tombstones and retryable delete records.
4. Exercise concurrent writers, interrupted manifest creation, listing pagination and storage outages.
5. Accept when manifests independently locate and verify every retained dump and never hide unsuccessful deletion.

**C. Dedicated backup repository service.** Stronger separation; adds a service and operational cost.
1. Specify an idempotent create/list/verify/delete contract and migration mapping for existing dump objects.
2. Implement a dedicated repository owning immutable object keys and transactional metadata; adapt backup and automation callers.
3. Import existing recoverable backups and dual-read catalogs during a bounded cutover; preserve old objects until verified.
4. Fault-test client retries, repository restarts, duplicate submissions and partial retention work.
5. Cut over only after object counts, checksums and recorded addresses reconcile and service recovery is demonstrated.

**D. Managed database backup/PITR with application control adapter.** Less custom backup storage; provider coupling and retention cost.
1. Determine required retention/RPO and validate managed backup coverage for the authoritative database.
2. Implement application create/list/metrics adapters against actual managed backup identifiers and operation states.
3. Import/export legacy dumps into a supported recovery repository and map historical records; preserve any non-DB objects separately.
4. Test completed, pending and failed provider operations plus recovery from one managed backup.
5. Accept when application success means a verified managed recovery point, not merely a request acceptance, with auditable retention.

<a id="repair-d2"></a>

##### D2 — Scheduled, correctly targeted backup

**A. Shared DB resolver and leased scheduler — recommended.** Keeps existing service; requires lease/observability work.
1. Establish a credential-free database identity check and the intended schedule/timezone.
2. Reuse the application's URL resolution for dump/restore; wire initialization into lifecycle and schedule through a durable single-owner lease.
3. Record scheduled runs, target identity, completion time and failure; migrate historical metrics to explicit unknown where no evidence exists.
4. Test preferred-variable-only, two distinct configured targets, restart and two-replica schedule contention in isolated databases.
5. Accept after one scheduled run targets the same database as the app, can be recovered, and stale-success alerts fire.

**B. Dedicated backup worker.** Separates process lifetime; introduces another worker.
1. Define authoritative DB identity and durable run ledger shared with the application.
2. Implement a worker using the same target resolver, durable schedule and retry/idempotency keys.
3. Route manual and automatic requests to that worker and migrate run history; remove duplicate in-process scheduling only after cutover.
4. Test worker termination, delayed schedules, repeated delivery and wrong-target configuration.
5. Accept after missed runs are recovered without duplicate retention effects and metrics reflect observed run history.

**C. Provider-native schedule with reconciliation.** Reduced scheduler code; provider dependence.
1. Select backup cadence and verify the provider resource corresponds to the running application's database.
2. Configure managed scheduled backups and implement a reconciler exposing real recovery points and failures.
3. Map manual backup requests and existing history to provider identifiers, maintaining recoverability of legacy dumps.
4. Exercise missed backup alerts, configuration drift and restore from a scheduled recovery point.
5. Accept when resource identity, last-success age and retained recovery points independently meet policy.

**D. External scheduler invoking an idempotent backup job.** Clear ownership; scheduler availability becomes a dependency.
1. Define a schedule owner, job identity and authoritative DB identity contract.
2. Implement idempotent job submission/run recording and target validation in the backup service.
3. Install a durable external schedule and backfill missed-run metadata, with exclusive ownership at cutover.
4. Test duplicate triggers, application downtime during trigger delivery and mismatched DB identities.
5. Accept when delayed triggers retry safely and monitoring proves scheduled recoverable output on the correct database.

<a id="repair-d3"></a>

##### D3 — Safe, demonstrated restore

**A. Isolated logical restore with validation — recommended for current dump format.** Minimal format change; restore speed limits remain.
1. Define RPO/RTO acceptance, required tables/invariants and a disposable recovery database target.
2. Implement a controlled restore command using `psql -v ON_ERROR_STOP=1` and a clean target; use a transaction where the dump permits it.
3. Add checksum/version verification and a tested promotion/rollback procedure; never restore directly over the only authoritative database.
4. Test malformed SQL, constraint conflicts, truncated dumps and full recovery, measuring elapsed time and data invariants.
5. Accept only after a complete drill meets targets and any SQL failure prevents success/promotion.

**B. Custom-format dump and pg_restore pipeline.** Better selective/parallel recovery; changes backup format.
1. Benchmark representative database size and compatibility requirements.
2. Produce custom-format dumps and restore into a newly provisioned DB with `pg_restore --exit-on-error`, explicit dependency handling and validation.
3. Retain old SQL restores via a hardened compatibility path and catalog the format per backup.
4. Test parallel restore, corrupted archives, extension/version mismatches and rollback.
5. Accept after both retained old-format and new-format backups restore correctly within measured objectives.

**C. Managed PITR restoration.** Handles larger databases well; needs provider recovery operations.
1. Establish timestamp recovery goals and managed WAL/backup coverage.
2. Implement restore-to-new-instance orchestration, operation polling and target validation.
3. Add a reversible application DB cutover procedure and independent recovery for PDIM/file state.
4. Drill recovery before and after a known transaction boundary, then validate application invariants.
5. Accept on measured RPO/RTO and successful rollback, not provider status alone.

**D. Physical backup/WAL recovery service.** Strong control and scale; highest database-operations burden.
1. Verify PostgreSQL hosting permits physical backups/WAL access and select compatible tooling.
2. Implement encrypted base backups, continuous WAL archiving, checksums and isolated standby recovery.
3. Bootstrap recovery from a verified base backup and retain logical archives during transition.
4. Drill missing WAL segments, corrupt base backups and point-in-time promotion.
5. Accept after documented recovery can rebuild all required database state and meet measured objectives without original-host access.

<a id="repair-d4"></a>

##### D4 — PDIM recovery integrity and durability

**A. Typed recovery errors plus durable recovery manifest — recommended.** Preserves PDIM API; changes recovery protocol.
1. Define new-instance versus existing-instance states and acknowledged-write-loss budget; inventory stream consumers and decide their durable versus explicitly ephemeral contract.
2. Persist checksummed snapshot/AOF generation manifests; distinguish absence from I/O, parse and replay errors; block failed recovery. Implement stream snapshot/load and mutation journaling for the durable contract, or route durable stream consumers to a separate durable authority.
3. Validate sequence continuity before publishing recovered state; quarantine corrupt generations. Export existing live stream entries and supported group/pending metadata into the selected authority before cutover, reconciling IDs and references.
4. Crash-test snapshot/AOF writes, corrupt artifacts, inject read/replay errors and verify stream entry/metadata recovery across the migration; measure acknowledged-write loss.
5. Accept only validated recovery or explicit blocked recovery, with measured RPO per supported type and stream consumer; never claim all-command durability while any durable stream dependency remains ephemeral.

**B. Transactional database-backed Redis state.** Removes custom snapshot authority; can increase command latency.
1. Inventory supported commands, atomicity and recovery generations; explicitly specify stream entries, IDs, trimming, and supported consumer-group/pending-state durability.
2. Implement command/state persistence transactionally in SQL with sequence IDs and snapshot caching, including the selected durable stream semantics rather than inheriting the AOF exclusion.
3. Import verified recovered non-stream state and export/import live stream state with metadata; dual-compare reads and switch authority only after reconciliation.
4. Test transactions across worker failure, concurrent stream/non-stream mutations, consumer acknowledgment recovery and interrupted imports.
5. Accept when acknowledged durable commands and required stream state survive crashes, unsupported semantics are explicit, and no corrupt import can become authoritative.

**C. Native durable Redis-compatible service behind the adapter.** Mature persistence; new operational dependency and compatibility testing.
1. Inventory actual command/Lua/stream consumers and choose a service whose persistence/replication guarantees cover their required stream entry and metadata semantics.
2. Implement routing, durable acknowledgment policy and health checks against that service while retaining the application-facing contract; explicitly distinguish any intentionally ephemeral consumers.
3. Export verified PDIM state and separately capture live streams excluded from snapshots; import entries/IDs and supported group/pending state with TTL fidelity, reconcile, and perform a bounded write handoff.
4. Test failover, persistence restart, stream replay/acknowledgment, queue scripts and session operations using the real service; verify interrupted migration recovery.
5. Accept after per-type command parity and measured durability/failover targets, including required stream state, preserving rollback data without claiming untested all-command durability.

**D. Replicated append-before-ack command journal.** Strong custom durability; highest complexity.
1. Specify commit quorum, replay determinism, fencing and snapshot rules; enumerate durable stream mutations and metadata, making any ephemeral contract explicit per consumer.
2. Journal each durable mutation, including the selected stream command set, before acknowledgment with checksums/sequence continuity; include stream state in recoverable snapshots and derive state from committed records.
3. Seed verified non-stream state plus a reconciled export of live streams and supported metadata at a fenced journal boundary; migrate instances to explicit recovery generations.
4. Test leader failure, torn writes, partitions, corrupted artifacts and stream replay/consumer acknowledgment across snapshot boundaries and migration.
5. Accept only committed-state recovery with measured per-type loss, required stream recovery and no writable instance after incomplete replay; document unsupported commands rather than promising universal durability.

<a id="repair-d5"></a>

##### D5 — Recoverable deletion and honest storage accounting

**A. Transactional deletion outbox — recommended.** Fits current metadata model; adds a cleanup worker.
1. Inventory object/chunk references and define deletion idempotency and usage-accounting invariants.
2. Atomically tombstone objects and enqueue cleanup with chunk/node identities; retain records until physical deletion is confirmed.
3. Implement retriable reference release and per-node deletion progress; decrement usage only after confirmed physical outcomes.
4. Inject crashes between each metadata/physical step and test shared chunks and unavailable nodes.
5. Accept when retries converge, shared objects remain readable, and reported usage matches remaining bytes.

**B. Mark-and-sweep garbage collection.** Simpler foreground delete; delayed reclamation and scan cost.
1. Define object liveness, conservative grace period and a consistent metadata scan boundary.
2. Make foreground delete a durable tombstone; build a collector that derives unreferenced chunks from live manifests.
3. Rebuild reference/usage accounting from observed inventory and preserve suspect chunks until reconciled.
4. Test concurrent object creation, repeated collection, node outage and collector crash.
5. Accept when no live reference is swept and failed deletions remain visible in physical usage until reclaimed.

**C. Storage-node durable deletion jobs.** Distributes cleanup; requires node protocol changes.
1. Define per-node durable delete receipts and an idempotent operation identifier.
2. Have metadata service commit deletion intents and nodes persist/execute them before acknowledging deletion.
3. Track receipts centrally, finalize reference release and update capacity from confirmed node results.
4. Test duplicate jobs, lost acknowledgments, permanently unavailable nodes and node restart.
5. Accept when outstanding work survives all restarts and capacity never assumes unconfirmed deletion.

**D. Managed immutable blob lifecycle with manifest accounting.** Less bespoke chunk cleanup; changes storage architecture.
1. Evaluate object-store durability, versioning and lifecycle guarantees against fabric/dedup requirements.
2. Replace physical shard cleanup with immutable managed blob references and durable manifest tombstones.
3. Migrate objects and verify checksums before retiring old chunks; reconcile billing/physical usage separately from logical quota.
4. Test lifecycle delays, delete failures, shared references and interrupted migration.
5. Accept when deletion state is truthful, retained objects remain readable, and old storage is reclaimed through verified reconciliation.

<a id="repair-d6"></a>

##### D6 — Durable session storage contract

**A. Await authoritative PG writes — recommended.** Straightforward consistency; adds DB latency/load.
1. Declare PG authoritative and define callback durability/error semantics.
2. Make PG helpers propagate errors; await commit for set/destroy/touch before success; update L1 only consistently with commit.
3. Treat PDIM as a versioned cache and migrate existing sessions with bounded compatibility reads.
4. Test process termination immediately after callback, PG outage, cross-worker reads and cache-write failure.
5. Accept when acknowledged changes are present on another worker and backing failure produces an explicit error.

**B. Durable PDIM authority with ordered fallback replication.** Preserves PDIM-first architecture; depends on D4.
1. Resolve D4 and specify required PDIM durability acknowledgments and fallback ordering.
2. Await durable PDIM session mutation and maintain an ordered durable replication log for PG fallback.
3. Add per-session versions/tombstones so fallback cannot serve older mutations during promotion.
4. Test PDIM outage between commit/replication, worker restart and out-of-order replication.
5. Accept only when acknowledged state survives failure and fallback promotion respects committed versions.

**C. Transactional dual-store session coordinator.** Stronger multi-store recovery; higher coordination cost.
1. Define a single ordered session ledger and desired commit/quorum policy.
2. Persist mutation intents, versions and tombstones transactionally, then apply idempotently to both stores.
3. Make callbacks and reads depend on committed ledger state; reconcile preexisting unversioned sessions.
4. Test one-store failure, replayed intents, concurrent touches and interrupted deletion.
5. Accept when no successful callback represents an uncommitted mutation and recovery converges deterministically.

**D. Established durable session backend/store implementation.** Less custom code; migration and dependency cost.
1. Choose a maintained PostgreSQL or durable Redis session store with documented callback semantics.
2. Integrate it as the authority and replace custom fire-and-forget writes with awaited store operations.
3. Migrate session serialization/TTL and perform a bounded dual-read cutover without claiming a cache is durable.
4. Test restart continuity, multi-worker reads, expiration, deletion and backend outages against the real backend.
5. Accept when its measured durability matches the contract and fallback cannot hide write failures.

<a id="repair-d7"></a>

##### D7 — Lossless queue startup recovery

**A. Targeted quarantine, normal stalled recovery — recommended.** Minimal architecture change; requires bounded scanning.
1. Define valid job schemas and archive representative malformed metadata safely.
2. Replace bulk waiting drain with ID-specific quarantine/removal after revalidation; let normal stalled-job handling recover valid work.
3. Run recovery before worker activation or coordinate scans with active workers; preserve payload and reason for every quarantined job.
4. Test eleven malformed jobs mixed with valid jobs, concurrent enqueue, rolling worker restarts and lock renewal.
5. Accept when every valid submitted job remains queued/completed/retriable and no fresh work is lost to startup cleanup.

**B. Versioned queues and controlled migration.** Separates incompatible legacy jobs; temporary operational complexity.
1. Inventory job schemas and define old/new queue ownership.
2. Create a versioned queue with validated submissions and an explicit legacy migration worker.
3. Move valid jobs idempotently, quarantine invalid records, and retire the old queue only after reconciliation.
4. Test restart during migration, duplicate moves and simultaneous producers.
5. Accept when source/target ledgers account for every job and legacy cleanup cannot touch new work.

**C. SQL job ledger/outbox as authority.** Strong reconciliation; database cost and added dispatcher.
1. Assign stable job IDs and define durable submission/completion states.
2. Commit jobs to SQL before dispatch; use BullMQ as transport with idempotent execution and acknowledgment.
3. Import pending jobs and implement re-dispatch for missing transport entries; replace destructive startup cleanup.
4. Test broker loss, queue reset, duplicate delivery and worker death after side effects.
5. Accept when all incomplete ledger jobs recover without duplicate committed effects or silent loss.

**D. Durable workflow engine migration.** Rich recovery semantics; broadest implementation effort.
1. Map retention workflows, timers, retries and side effects into stable workflow identities.
2. Implement durable workflows with idempotent activities and explicit retry/dead-letter policies.
3. Transfer pending job payloads using a cutover ledger and reconcile every old queue item.
4. Test worker restart, activity timeout, malformed inputs and migration interruption.
5. Accept when valid workflow instances resume across failure and all old queue work is accounted for.

<a id="repair-d8"></a>

##### D8 — Reproducible schema evolution

**A. Repair an ordered migration chain — recommended.** Strong auditability; requires careful historical reconciliation.
1. Compare shared schema, every SQL migration and sanitized schema-only snapshots from each environment under an approved separate process.
2. Build a validated migration ledger including post-0005 changes; preserve custom SQL/data migrations and use transactional application where supported.
3. Baseline existing databases explicitly; replace masked push execution with fail-propagating migration application and pre/post checks.
4. Test fresh install, each supported upgrade baseline, partial failure and rollback/forward repair on isolated PostgreSQL.
5. Accept only a complete ordered history and matching constraints/indexes/data invariants, with nonzero exit on failed migration.

**B. Flyway/Liquibase-style versioned SQL authority.** Mature ledger/checksums; tooling migration overhead.
1. Inventory SQL/schema differences and select a single migration authority.
2. Convert checked-in evolution into immutable checksummed migrations with explicit preconditions.
3. Baseline each existing database after parity review; wire rollout to fail on checksum or SQL errors.
4. Test clean creation, repeat runs, divergent history and interrupted execution.
5. Accept when drift is detected before rollout and all supported baselines reach the intended schema reproducibly.

**C. Reviewed desired-state SQL plans with independent ledger.** Retains schema-as-code; custom release process.
1. Capture versioned desired schema and enumerate custom SQL/data changes that schema diff cannot infer.
2. Generate environment-specific SQL plans offline, review destructive changes and bind plans to precondition fingerprints.
3. Apply approved plans with strict error propagation, record checksums/results and validate postconditions.
4. Test drift, partially applied plans, large-table indexes and expand/contract compatibility.
5. Accept only when plan fingerprints match, data invariants pass and the recorded result is independently reproducible.

**D. New baseline database with logical migration/cutover.** Useful for badly divergent histories; highest migration burden.
1. Define authoritative schema and data-mapping rules from all existing SQL changes.
2. Build a new database from a validated complete baseline and implement change capture/backfill.
3. Reconcile row counts, relationships, constraints and indexes; rehearse reversible application cutover.
4. Test concurrent writes during backfill, replication lag, rejected rows and rollback.
5. Accept only after complete reconciliation and a demonstrated cutover, retaining an auditable migration ledger for future changes.

### Playbooks: deployment

Source: `reports/readiness-audit/deployment.md`. [Domain evidence](#evidence-deployment) · [Index](#unified-platform-finding-index)

#### Repair playbooks

<a id="repair-dep-01"></a>

##### DEP-01 alternatives — complete artifact contract

**A. Build every executable from source in the active pipeline — recommended.** Lowest architectural change; adds toolchain/build time.
1. Inventory every executable/file read by `start.sh`, cluster supervisors and gateways; define a required-artifact manifest including target architecture, source revision and toolchain.
2. Extend `script/build.ts` to compile gateway and Rust artifacts and explicitly obtain a verified compatible Node runtime, or formally require a supplied platform runtime.
3. Make the bootstrap packaging allowlist and `.dockerignore` agree; reject missing/unversioned artifacts before packing rather than accepting checked-in leftovers.
4. In disposable build/runtime environments, change each auxiliary source, rebuild, unpack and verify its embedded revision; exercise a cold boot with no workspace cache.
5. Accept only when all executed artifacts match the release manifest and the minimal target runtime passes readiness and real gateway/sidecar operations; retain the preceding manifest for rollback.

**B. Promote a signed immutable OCI image.** Best environment reproducibility; requires an image-capable deployment path and registry operations.
1. Document the supported OS/architecture and all native/runtime libraries, and obtain approval for the image delivery target.
2. Create multi-stage builds compiling Node bundles, Rust and Python/runtime dependencies from pinned inputs; include the verified runtime in the final image.
3. Replace source/workspace artifact promotion with image-digest promotion and keep source revision plus executable hashes as attestations.
4. Test the exact final image without build toolchains, caches or workspace mounts, including sidecar execution and shutdown.
5. Promote only the tested digest after acceptance; prove a rollback to the last accepted image and retain digest-linked evidence.

**C. Independently release auxiliary binaries with strict provenance verification.** Preserves fast app builds; adds cross-release compatibility management.
1. Define gateway/Rust/Node component versions and an app-to-component compatibility matrix.
2. Build each component in dedicated CI from its source revision and publish signed, architecture-specific artifacts with digests.
3. Make the app build retrieve exact component digests and fail on missing signatures, source-version mismatch or unsupported compatibility.
4. Run component contract tests plus a complete cold-start integration using the assembled release; test intentionally mismatched versions.
5. Accept only a locked, proven composition; promote/rollback the composition manifest atomically rather than selecting “latest.”

**D. Move auxiliary execution into independently deployed services.** Removes local native coupling; adds network latency, auth and service operations.
1. Identify gateway/Boosterstate consumers and define authenticated service APIs, health semantics and persistent-state ownership.
2. Package/build those services in their own runtime-native release pipelines, while keeping a verified Node contract for the web app.
3. Migrate consumers from local executable assumptions to versioned service endpoints with deadlines, idempotency and explicit failures.
4. Test real cross-service requests, unsupported versions, service loss, recovery and deploy ordering in staging.
5. Accept only after all former local features work against the deployed versions and an end-to-end rollback restores the prior compatible composition.

<a id="repair-dep-02"></a>

##### DEP-02 alternatives — Python lifecycle

**A. Make Python a critical-tier runtime for the full-feature release — recommended.** Simplest deterministic correction; longer cold starts.
1. Enumerate Python-backed features and required imports, and set a startup budget that includes runtime extraction.
2. Pin/hash the interpreter and Python dependencies; fail the full-feature build when the runtime or import verification fails.
3. Restore Python in the critical tier before activation/importing consumers; require a successful restore result and capability check.
4. Test cold extraction, corrupt capsules, missing modules, low disk space and first feature request from a clean image.
5. Accept when every supported Python feature works on first readiness and failed runtime preparation prevents promotion with a clear error.

**B. Keep asynchronous restore, implement a readiness-driven supervisor.** Faster HTTP boot; more lifecycle/state-machine complexity.
1. Specify states for pending restore, verifying imports, ready, failed and retrying, with bounded timeouts.
2. Publish restore completion/failure through a supervised IPC/state channel and replace immutable import-time Python resolution with a provider that refreshes on readiness.
3. Start Python consumers only after verified readiness; queue durable work or return explicit retryable errors while pending, and restart consumers on runtime recovery.
4. Delay restoration beyond module import in tests, then complete it; exercise failure/retry and concurrent requests without process restart.
5. Accept when Python-backed readiness becomes healthy automatically, queued work completes exactly once, and no request runs against an accidental system interpreter.

**C. Deploy a dedicated Python worker service.** Isolates native dependencies and resource peaks; introduces service/queue operations.
1. Define authenticated job contracts, supported operations, input storage references and error/retry semantics for current Python features.
2. Build a pinned Python worker image with required modules and real health/capability checks.
3. Migrate callers to durable jobs or bounded RPC, preserving functionality and authorization; remove their dependence on local runtime discovery only after migration.
4. Test actual audio/video work, worker restart, missing modules, timeouts, retries and duplicate delivery using disposable data.
5. Accept after feature parity, latency/error-budget approval and a working rollback to the preceding worker/API version.

**D. Pre-expand Python into a verified runtime layer.** Eliminates extraction race; larger image/layer footprint.
1. Measure the image budget and identify a runtime-layer mechanism supported by the chosen target.
2. Build a fixed Python environment in that layer, verify checksums/imports and record its digest.
3. Point all Python consumers at the layer's stable executable and validate it during startup before advertising capability readiness.
4. Boot the final layer composition on clean target hosts; test relocation and native module execution without a build environment.
5. Accept only when the whole image remains within the target budget and first-request feature tests pass; retain prior layer digests for rollback.

<a id="repair-dep-03"></a>

##### DEP-03 alternatives — stable readiness

**A. Single-flight refresh with atomic snapshots — recommended.** Smallest change; requires a defined maximum age.
1. Define readiness policy for boot, refresh, dependency failure and stale results, including maximum acceptable snapshot age.
2. Keep last completed state while checking; run at most one probe generation and store results in an isolated candidate snapshot.
3. Atomically publish complete results, switch to unhealthy on actual failed/expired checks, and schedule the next run after completion.
4. Use controlled probe delays/errors to test 60-second checks, stale expiry, recovery and simultaneous `/ready` requests.
5. Accept when healthy refreshes never cause 503, failures do cause bounded withdrawal, and no older generation overwrites newer results.

**B. Independent bounded dependency checks with aggregate freshness.** Faster per-service updates; more policy complexity.
1. Assign each dependency a timeout, criticality, refresh cadence and freshness TTL.
2. Maintain one guarded check loop and timestamped result per dependency instead of mutating a global “connecting” phase.
3. Compute readiness from completed critical results and their TTLs, with initial unknowns non-ready and explicit degraded detail.
4. Test slow MaxCore alongside fast DB recovery, expired cached results and dependency-specific failure/recovery.
5. Accept with a documented maximum detection delay and stable HTTP readiness across all interleavings.

**C. Dedicated supervised health coordinator.** Centralizes multi-worker truth; introduces an additional local service.
1. Define a versioned health snapshot contract and coordinator failure policy for every worker/sidecar.
2. Implement a single health coordinator performing bounded checks and publishing timestamped immutable snapshots over IPC.
3. Change HTTP workers to consume the coordinator snapshot, and make missing/stale coordinator state non-ready.
4. Test coordinator restart, worker churn, slow dependencies and stale IPC delivery in the full cluster.
5. Accept only when all workers report the same generation, outages are reflected within policy bounds and coordinator recovery needs no manual restart.

**D. Use real dependency lifecycle events plus periodic reconciliation.** Avoids repeated heavy probes; depends on reliable lifecycle instrumentation.
1. Map DB pool, storage, MaxCore and route-registration lifecycle events and define a readiness state machine.
2. Update dependency states on authenticated/validated connect, disconnect and supervisor events without a periodic global reset.
3. Add a serialized bounded reconciler to catch missed events and TTL expiration; apply hysteresis only within an explicit failure-detection budget.
4. Test dropped/reordered events, half-open connections, reconnects and prolonged reconciler stalls.
5. Accept when events and reconciliation agree with real dependency availability and recovery does not transiently withdraw healthy service.

<a id="repair-dep-04"></a>

##### DEP-04 alternatives — trustworthy release gates

**A. Upgrade existing CI into a release-equivalent gate — recommended.** Reuses current workflow; increases runtime and runner resource requirements.
1. Define required statuses, artifact assertions and representative SLOs, including p95/p99, timeout/error rate and authenticated workflows; inspect branch protection with owner approval.
2. Make missing-artifact checks and failed CI summary exit nonzero; add a disposable `DEPLOY_PACK=1` build and `start.sh` cold-boot test.
3. Wait for real readiness/routes; make load target configurable, bound request timeouts and enforce agreed latency/error/resource thresholds with real staging dependencies.
4. Prove the gate rejects missing bundles, corrupt capsules, late route registration, slow successful responses and semantic transaction failures.
5. Require the complete gate for release promotion and retain revision-linked reports; accept after a clean full lifecycle run and a rollback/shutdown exercise.

**B. Add a dedicated ephemeral release-candidate environment.** Highest end-to-end fidelity; costs more than unit CI.
1. Provision an isolated environment matching the target compute, network and runtime contracts with disposable non-production data.
2. Deploy each candidate using the actual packing/start commands and make its environment ID immutable to that revision.
3. Run first-boot, authenticated smoke, representative load/soak, sidecar recovery and graceful drain against real isolated services.
4. Deliberately break artifacts and dependencies to verify readiness and promotion gates reject the candidate.
5. Promote only a candidate with signed acceptance evidence and proven rollback; destroy the environment after retaining sanitized results.

**C. Build once, certify in a separate artifact-validation pipeline.** Keeps PR feedback fast; requires promotion orchestration.
1. Define an artifact manifest and evidence schema binding all results to content digests rather than branch names.
2. Have build CI publish an immutable candidate; trigger certification that unpacks and boots that exact candidate in target-like isolation.
3. Implement hard assertions and bounded functional/performance tests in certification, including the full worker/sidecar lifecycle.
4. Test that changed artifacts, missing evidence, failed jobs and exceeded tail-latency budgets cannot obtain certification.
5. Accept only digest-certified candidates for deployment; validate rollback using an earlier certified artifact, not a rebuild.

**D. Protected canary promotion after isolated preflight.** Measures real routing/resources; requires careful traffic and side-effect controls.
1. Define safe synthetic/test-tenant transactions, canary traffic limits, failure budgets and an automatic rollback policy.
2. First run deterministic packed-artifact preflight; deploy the same artifact to a separate canary slot with real dependencies.
3. Run bounded synthetic journeys and gradually admit an approved traffic slice, tracking semantic success, latency, worker health and drain behavior.
4. Exercise deliberate canary failures and prove traffic withdrawal/rollback without duplicating payments, jobs or writes.
5. Promote only after the approved observation period and all gates pass; retain an immediate rollback path and human release accountability.

<a id="repair-dep-05"></a>

##### DEP-05 alternatives — enforce aggregate capacity

**A. One cgroup-aware host budget allocator — recommended for continued co-location.** Preserves architecture; must model native/AI peaks realistically.
1. Measure target CPU quota, effective memory limit, baseline RSS, extraction disk peak and per-service peak resource demand in staging.
2. Implement a single allocator using effective process/container limits and reserved headroom for OS, primary, extraction and sidecars.
3. Assign explicit app/MaxCore/Python budgets from that pool; validate overrides and refuse configurations whose minimum allocations cannot fit.
4. Test constrained cgroups, very small machines, invalid overrides, simultaneous cold boot and sustained mixed workloads.
5. Accept only when aggregate RSS/disk/CPU stay within defined margins, no OOM occurs and latency SLOs hold for the supported machine classes.

**B. Isolate app and AI into separately limited deployments.** Strong isolation; higher network and operational cost.
1. Establish per-service SLOs, expected workload and cross-service API/data contracts.
2. Move MaxCore/Python execution to dedicated resource-limited services and size the web cluster within its own effective quota.
3. Implement bounded concurrency, authenticated routing and backpressure between services; migrate workload without losing durable jobs.
4. Saturate AI while serving web traffic, then reverse the load; test service failure, recovery and network latency.
5. Accept after each service independently meets its budget and the end-to-end platform meets latency, error and recovery targets.

**C. Certified machine profiles with validated allocations.** Predictable operations; less elastic and requires recertification for new hardware.
1. Select a finite set of supported deployment sizes and measure usable rather than advertised resources.
2. Define signed/versioned allocations per profile for app workers, primary heap, MaxCore concurrency, Python and disk reserve.
3. Validate the chosen profile against effective limits at startup and reject mismatches; do not silently accept arbitrary override counts.
4. Run cold boot, spike and soak certification for every profile, including all co-located services at peak demand.
5. Accept only certified profiles, track profile/release compatibility and repeat certification when runtime or workload characteristics change.

**D. Admission-controlled elastic worker pool.** Better utilization for variable jobs; most scheduling complexity.
1. Measure task resource envelopes and define priority, maximum queue age and per-tenant fairness.
2. Implement a shared resource-token scheduler allocating bounded app/AI work against effective CPU/memory budgets.
3. Spawn/retire workers within hard process limits and apply durable queue backpressure rather than multiplying independent pools.
4. Test heavy/light mixed tasks, reservation leaks, worker crashes, runaway tasks and sudden memory pressure.
5. Accept when reservations reconcile after failure, no starvation/data loss occurs and approved throughput fits measured resource limits.

<a id="repair-dep-06"></a>

##### DEP-06 alternatives — independent observability failure detection

**A. Track the first unconfirmed attempt, not the latest — recommended immediate fix.** Small change; process restarts still need a deliberate policy.
1. Specify silence age before first success, after success and across process restart, with a testable notification deadline.
2. Add an immutable monitoring-start/first-unconfirmed timestamp; reset it only on confirmed recovery, not every retry.
3. Persist the relevant epoch outside an individual worker or initialize a conservative boot grace; expose it in health and wire a verified independent alert channel.
4. Test more than 24 hours of repeated failures with controlled time, recovery, a later outage and restart during an outage.
5. Accept only after a real staging delivery failure generates an independently received page on schedule and recovery clears the incident.

**B. External dead-man heartbeat monitor.** Detects whole-app death too; needs an independent monitoring provider/service.
1. Define heartbeat identity per deployment and alert routing outside the app and Sentry failure domains.
2. Emit periodic authenticated heartbeats containing release identity and last confirmed error-reporting status.
3. Configure external missing/unhealthy-heartbeat deadlines and recovery rules; retire old deployment identities during controlled rollout.
4. Test no-first-heartbeat, continuous failed reporting, stopped process and blocked egress without relying on app logs.
5. Accept after the on-call recipient receives and acknowledges each failure class within the deadline, with no duplicate old-release pages.

**C. End-to-end ingestion canary with an independent verifier.** Stronger than transport completion; additional provider permissions and API cost.
1. Define a non-sensitive uniquely identified canary event and a verification interval/ingestion-lag budget.
2. Emit canaries from the deployed runtime and have a separately hosted verifier check actual receipt using least-privilege access.
3. Store last verified receipt externally and page through a separate channel when no canary has ever arrived or its age exceeds policy.
4. Test SDK queue success with ingestion failure, wrong project routing, revoked access and delayed provider indexing.
5. Accept when actual receipt, not only `flush()`, drives the monitor and every injected loss produces an acknowledged page.

**D. Durable observability outbox and delivery-state worker.** Auditable delivery/retries; larger implementation and storage footprint.
1. Define a minimal heartbeat record, retention limits, deduplication key and outbox durability requirements.
2. Record heartbeat intent durably before attempting delivery; have a supervised worker record delivery/verification outcomes.
3. Run an independent watcher over oldest unconfirmed heartbeat age, with outbox-store health monitored separately.
4. Test worker restart, continuous failed delivery from first boot, duplicate sends, outbox outage and eventual recovery.
5. Accept only when unconfirmed age survives restarts, alerts reach an independent recipient and retained records reconcile to successful receipt or an explicit incident.

<a id="repair-dep-07"></a>

##### DEP-07 alternatives — externally verified DNS/TLS lifecycle

All options require owner-approved external checks during remediation. None were performed in this audit.

**A. Platform-managed primary origin plus verified existing storefront ACME — recommended if retaining current architecture.** Least migration; two certificate owners remain.
1. Obtain verified deployment metadata and owner-approved domain inventory; distinguish primary platform TLS from storefront TLS and record callback visibility requirements.
2. Configure authoritative DNS/ownership and platform domain mapping through approved controls; configure production storefront ACME only where the app truly owns certificate issuance/termination.
3. Perform staging CA challenges first, then trusted production issuance; verify the actual serving edge presents the intended certificates and routes each hostname to the correct tenant.
4. Test external DNS resolution, chain/SAN/expiry, HTTPS redirects, authenticated callback/webhook reachability and a controlled renewal/reload.
5. Accept only with evidence for every promised hostname, an expiry monitor, named DNS/certificate owners and a rollback procedure for DNS/edge changes.

**B. Managed edge/custom-hostname TLS in front of the application.** Offloads tenant certificate operations; adds vendor integration and proxy policy.
1. Choose an edge service supporting the actual tenant-domain model and document origin authentication and callback behavior.
2. Provision verified custom hostnames and managed certificates at the edge with protected routing to the application origin.
3. Migrate DNS in controlled batches and integrate domain status into onboarding; retire app issuance only after the edge supplies the complete certificate lifecycle.
4. Test new/existing tenant domains, certificate pending states, spoofed hostnames, origin bypass, renewal and edge failover.
5. Accept after external trusted-chain/routing checks and a rollback rehearsal; operate expiry and domain-verification alerts for the managed service.

**C. Dedicated reverse-proxy/certificate service.** More control and portability; additional infrastructure/security ownership.
1. Define hostname authorization, certificate storage/access controls, proxy routing and high-availability requirements.
2. Deploy a supported proxy/cert-manager stack with real ACME challenge support and secured origin connectivity.
3. Migrate certificate issuance/renewal and tenant routing to that service using a staged DNS cutover with overlap.
4. Test challenge propagation, renewal/reload without downtime, proxy restart, certificate-store recovery and hostname isolation.
5. Accept after externally observed valid TLS for all release domains and demonstrated failover/rollback without serving another tenant's content.

**D. Infrastructure-as-code domain and certificate control plane.** Strong auditability at scale; highest provisioning/migration effort.
1. Inventory domains, DNS authorities, certificate issuers, deployment origins and required access boundaries as reviewed desired state.
2. Implement approved infrastructure modules for DNS, domain verification, trusted certificates, renewal automation and serving-edge attachment.
3. Import existing resources without replacing working records blindly, then reconcile drift through reviewed plans and staged changes.
4. Run disposable-domain issuance/renewal tests, verify production-origin visibility separately, and exercise rollback plus expired/misrouted certificate alerts.
5. Accept only reconciled, externally tested hostnames with revision-linked evidence, resource ownership and a recurring renewal/failover validation schedule.

### Playbooks: product-autonomous

Source: `reports/readiness-audit/product-autonomous.md`. [Domain evidence](#evidence-product-autonomous) · [Index](#unified-platform-finding-index)

#### Repair playbooks

Each A–D is a distinct end-to-end implementation route, not one step of a shared four-step plan. Acceptance should be recorded against an immutable revision with rollback ownership.

<a id="repair-pa-1"></a>

##### PA-1 — unify appearance state

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

<a id="repair-pa-2"></a>

##### PA-2 — make preference writes ordered and conflict-safe

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

<a id="repair-pa-3"></a>

##### PA-3 — implement actual security containment

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

<a id="repair-pa-4"></a>

##### PA-4 — extend evolution beyond the currently consumed knobs

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

<a id="repair-pa-5"></a>

##### PA-5 — validate changed behavior before promotion

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

<a id="repair-pa-6"></a>

##### PA-6 — establish deployment integration acceptance

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

### Playbooks: scanners

Source: `reports/readiness-audit/scanners.md`. [Domain evidence](#evidence-scanners) · [Index](#unified-platform-finding-index)

#### Repair playbooks

Each option is an independent implementation strategy; select one per root, coordinate overlapping migration work, and retain acceptance evidence. Steps are proposals, not work performed, and none guarantees a first-attempt fix.

<a id="repair-scan-01"></a>

##### SCAN-01 — runtime dependency advisories

**A. Upgrade dependency graph (recommended; least bespoke maintenance, possible compatibility changes).**
1. Map each matching package to owning consumer, bundled/external status and all applicable advisory floors; save reproducible current test baselines.
2. Upgrade direct packages and transitive parents to supported patched versions; change overrides only with compatibility evidence and regenerate the authoritative lock.
3. Build clean web/desktop/mobile artifacts as applicable, including native codecs, and replace previously committed bundles through the normal release pipeline.
4. Run upload abort/limit/multipart regressions, image corpus tests, CSV accounting imports and URI/YAML/XML tests at relevant consumers; scan final artifacts.
5. Accept when affected shipped versions are absent, advisory fixtures pass and feature/error behavior matches contracts; retain rollback artifacts and monitor resource use.

**B. Maintained backport (smaller API delta, higher internal security ownership).**
1. Establish which consumers cannot take upstream fixes and obtain exact reviewed patch commits for each applicable advisory.
2. Fork those dependency versions, apply complete fixes with tests and assign patch-maintenance owners.
3. Publish signed internal packages, pin immutable versions and migrate all parent resolutions/bundles to the fork.
4. Exercise advisory-specific regression fixtures and differential consumer tests; verify actual loaded code hashes in release artifacts.
5. Accept only with independent patch review, no unresolved reachable advisory and an upstream convergence deadline; version metadata alone is insufficient.

**C. Replace vulnerable implementations (larger migration, less legacy debt).**
1. Inventory required multipart, image, CSV, URI, XML and YAML semantics and choose maintained alternative implementations per affected consumer.
2. Implement adapters preserving validation, resource bounds, error contracts and cleanup; do not route around validation.
3. Migrate call sites and transitive parents, remove obsolete dependency edges and rebuild every affected target.
4. Compare normal and adversarial corpora, concurrent upload cleanup, format compatibility and accounting results against explicit requirements.
5. Accept when replacement dependencies are scanned, old implementations are absent and all required functionality works with measured bounds.

**D. Hardened service migration (isolation plus patched parsers, operational cost).**
1. Identify exposed parser workloads and define authenticated service contracts, data handling and availability budgets.
2. Implement a separately deployed parser/media service on patched supported libraries with strict input/output schemas and resource limits.
3. Migrate callers and durable jobs to the service; remove vulnerable local parser edges rather than leaving fallback execution.
4. Test malformed payloads, outages, retries, concurrency, cleanup and equivalent output; scan both caller and service artifacts.
5. Accept when all required parsing is served by verified fixed implementations and monitoring proves bounded failure; isolation alone is not acceptance.

<a id="repair-scan-02"></a>

##### SCAN-02 — occurrence provenance and critical scope

**A. Artifact-first SBOM reconciliation (recommended; strongest shipped-scope evidence, extra build integration).**
1. Enumerate independently released web, Rust, Python, DNS, proxy, desktop/mobile and external-service artifacts with owners and target platforms.
2. Generate per-artifact SBOMs containing package URLs, versions, file locations, dependency chains and digests; retain source scan separately.
3. Reconcile all 206 occurrences to artifacts or documented non-shipping tool environments; upgrade applicable AnyIO to a verified fixed release and rebuild affected environments.
4. Scan each final artifact and test TLS hostname verification plus process-pool cancellation where AnyIO is used; validate OS marker resolution.
5. Accept a signed occurrence ledger with no unattributed critical/high release dependency and tested remediation for every applicable advisory; non-shipping does not excuse vulnerable build tooling.

**B. Component-owned hermetic lock builds (more repositories/jobs, clear ownership).**
1. Partition roots and nested workspaces into actual deployable components and assign one authoritative lock per ecosystem/component.
2. Implement frozen clean builds with explicit OS/architecture resolution and machine-readable resolved dependency export.
3. Update affected component locks, including AnyIO consumers, and migrate releases away from ambiguous shared workspace installations.
4. Reproduce builds from clean checkouts and compare lock/export/artifact identities; run component security regressions and cross-component smoke tests.
5. Accept when every scanner occurrence resolves to a component plus target or documented stale evidence, with fixed artifacts and no unexplained drift.

**C. Curated internal distribution pipeline (supply-chain control, substantial infrastructure).**
1. Define approved dependency sets and owners for each release/toolchain environment, including Go scanner/tool binaries if attribution proves them.
2. Build a signed internal package/image channel with source provenance and security review, upgrading affected packages instead of merely allowlisting alerts.
3. Rebuild components exclusively from this channel and generate installation receipts that preserve nested/transitive identities.
4. Test package authenticity, stale-channel rejection, target platform behavior and the applicable vulnerability fixtures.
5. Accept only when receipts explain all 206 observations, released components use remediated packages and build-tool risks have owners and evidence.

**D. Scanner provenance adapter plus release graph (lighter build changes, scanner integration burden).**
1. Recover scanner invocation and input manifests without secret capture; specify required occurrence fields and duplicate identity rules.
2. Implement collection that records scan root, manifest path, dependency chain, dev/runtime/target markers, binary digest and completion status.
3. Rescan exact release inputs, reconcile duplicate IDs without erasing distinct installations, and upgrade confirmed affected consumers before deployment.
4. Validate with controlled multi-lock workspaces, repeated versions, local packages and OS-specific dependencies; compare against a final artifact sample.
5. Accept when every occurrence is attributable and critical release paths have reviewed reachability plus successful fix tests; unresolved records block approval, not silently disappear.

<a id="repair-scan-03"></a>

##### SCAN-03 — personal-data logging

**A. Typed allowlisted events (recommended; strongest source control, broad call-site migration).**
1. Classify every inventory location by purpose, personal-data need, retention and incident-response requirement.
2. Introduce typed event schemas allowing event IDs, request correlation and necessary pseudonymous actor references; constrain OAuth upstream errors to safe codes.
3. Migrate string interpolation and raw object logging at every listed application/tool site; centralize residual secret and personal-field redaction.
4. Capture production-format logs for admin/support/OAuth/deletion/rate-limit/error flows using synthetic identifiers; assert identifiers and token material never escape and useful diagnostics remain.
5. Accept after all true sites pass, historical sink retention/deletion is reconciled and ongoing schema enforcement rejects unsafe fields.

**B. Pseudonymous audit identity service (supports investigations, key lifecycle complexity).**
1. Determine which actor/IP relationships must be correlated and approve retention and access rules.
2. Implement scoped rotating keyed pseudonyms and a separately protected identity resolution store; keep raw personal data out of ordinary events.
3. Replace each sensitive interpolation/field with purpose-bound aliases and migrate old log references under an approved deletion schedule.
4. Test rotation, collision handling, unauthorized reidentification, deletion and investigation workflows; schema-bound provider error output as well.
5. Accept only with working audits, restricted resolution access and no raw identity in general sinks; pseudonyms still require privacy controls.

**C. Dedicated privacy-aware audit pipeline (preserves justified raw audits, more infrastructure).**
1. Separate strictly necessary security/legal audit facts from operational diagnostics, documenting lawful purpose and minimum fields.
2. Implement encrypted structured audit storage with scoped access, short purpose-specific retention and deletion/exemption workflows.
3. Route justified records directly to that pipeline, replace general logs with correlation references, and enforce safe OAuth error schemas at emission.
4. Test routing failures, access denial, retention expiry and subject deletion; verify stdout and vendor observability receive no unnecessary raw values.
5. Accept when required investigations remain possible and all inventory sites use the correct verified destination without duplicate copies.

**D. Enforced logging boundary/serialization layer (central rollout, requires careful adapters).**
1. Inventory every Pino, console and stdout producer and define supported event schemas and safe failure behavior.
2. Implement a shared structured logging facade with schema validation, sensitive-key normalization and deterministic removal of personal content before serialization; convert interpolation to named fields.
3. Migrate all inventoried producers, including scripts/DNS tools, and prohibit direct logging outside reviewed infrastructure adapters.
4. Run nested-object, error-message, Unicode, provider-error-object and partial-phone tests across production serialization and transports.
5. Accept when boundary tests and repository checks cover all true sites, diagnostics remain useful, and historical sink handling is approved; regex scrubbing alone is insufficient.

<a id="repair-scan-04"></a>

##### SCAN-04 — tar no-op override

**A. Restore patched upstream tar (recommended; faithful API, installation compatibility work).**
1. Trace all tar consumers and required API versions during install, desktop packaging and runtime; select a maintained version covering all applicable advisories.
2. Replace the local no-op override with the supported implementation and resolve parent compatibility without suppressing security checks.
3. Regenerate locks and rebuild from clean environments, migrating committed bundles and native installation artifacts.
4. Round-trip archives and verify extracted bytes, permissions and paths; test malicious archives, lifecycle builds and every alias used.
5. Accept only with actual archive output and safe extraction plus artifact scans; remove the obsolete stub after no references remain.

**B. Upgrade tar-dependent parents (less global override risk, multiple upstream migrations).**
1. Inventory dependency chains resolving tar and identify parent releases using supported fixed archive implementations.
2. Upgrade or replace those parents and adapt their integration APIs; remove the global file override.
3. Recreate locks and rebuild all native/desktop/mobile packages with real lifecycle work enabled where required.
4. Test each parent workflow and archive path traversal/symlink protections; inspect resolved dependency graphs for old or stub tar.
5. Accept with functional artifacts and no remaining no-op dependency; assign maintenance ownership for each migrated parent.

**C. Implement a real compatible archive adapter (maximum control, high maintenance).**
1. Document the exact tar API contract and select a secure maintained archive engine; budget independent security review.
2. Implement real creation/extraction/list/update semantics and aliases, with secure path handling, streaming, limits and honest failures.
3. Publish the adapter as an accurately named/versioned package and migrate callers explicitly rather than masquerading as upstream tar.
4. Run contract/differential archive tests, fuzz malformed archives and validate installation/packaging consumers.
5. Accept when byte-level outputs and safety properties are demonstrated and advisory scanners identify the real implementation.

**D. Replace archive-dependent build workflows (larger redesign, removes obsolete dependency paths).**
1. Identify why each installer/packager needs tar and select supported distribution mechanisms providing equivalent required functionality.
2. Implement verified artifact installation or packaging with genuine extraction in a hardened maintained tool, checksum verification and explicit errors.
3. Migrate parent tooling/call sites and remove both tar dependency edges and the stub; regenerate deployment artifacts.
4. Test clean builds, platform variants, integrity failures, malicious archives, interrupted installation and rollback.
5. Accept only with complete native and packaged outputs and no consumer resolving the stub; skipping scripts or archive features is not a fix.

<a id="repair-scan-05"></a>

##### SCAN-05 — incomplete SAST

**A. Repair and rerun existing scanner (recommended; continuity, tool-specific troubleshooting).**
1. Recover run metadata and failure reason; pin source revision, rule version, language inventory and expected file count.
2. Correct resource/configuration/input problems and implement fail-closed completion validation in CI.
3. Run the full supported language scan on exact release source, including relevant nested components, with documented exclusions only for genuinely non-code artifacts.
4. Verify coverage counts and positive-control detection; manually triage findings against consumers and repair confirmed issues with regression tests.
5. Accept only a completed signed report and reviewed remaining risk; empty results with incomplete=true always fail the gate.

**B. Alternate maintained SAST engine (different coverage, rule migration cost).**
1. Compare required TS/JS/Python/Rust/Go surfaces with engine support and define equivalent security rules and coverage criteria.
2. Integrate the replacement engine with pinned rules, reproducible CI inputs and explicit unsupported-language handling.
3. Scan all released components and migrate prior findings to stable identifiers; fix newly confirmed defects.
4. Validate positive controls, known-source patterns, false-positive triage and nonzero exit on partial scans.
5. Accept with complete coverage artifacts and remediation evidence, not merely a different tool returning fewer results.

**C. Per-language scanner federation (better specialization, orchestration cost).**
1. Partition source inventory by language/component and select maintained analyzers with declared rule coverage.
2. Build a result aggregator retaining revision, paths, rules, completion, severity and ownership without treating failed shards as clean.
3. Run each shard, remediate applicable findings and integrate cross-language trust-boundary review.
4. Test shard timeout/failure, duplicate findings and adversarial fixtures; ensure every released source family has an accountable result.
5. Accept only when all required shards complete and the aggregate release gate reflects actual coverage and reviewed findings.

**D. Independent assessed release pipeline (external expertise, cost and scheduling).**
1. Commission a scoped independent code-security assessment with the release inventory and explicit SAST completion requirements.
2. Provide isolated source/build metadata and integrate the assessor's reproducible automated scan pipeline with manual trust-boundary review.
3. Repair confirmed issues in application code and preserve regression tests, updating the candidate revision for reassessment.
4. Require reruns on the repaired revision, positive-control/coverage evidence and independent verification of each remediation.
5. Accept with completed machine-readable scan evidence and signed residual-risk review, plus an internal recurring scan gate; a manual signoff alone does not close incomplete SAST.

### Playbooks: coverage-gaps

Source: `reports/readiness-audit/coverage-gaps.md`. [Domain evidence](#evidence-coverage-gaps) · [Index](#unified-platform-finding-index)

#### Repair playbooks

Each A–D block is an independent implementation alternative, not a phase of another option. Each has five preparation-to-acceptance steps. Tests below are proposed work, not executed evidence. Recommendations balance current architecture and scope; none promises a guaranteed first-time fix.

<a id="repair-cg-1"></a>

##### CG-1 — Implement a real admin credential lifecycle

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

<a id="repair-cg-2"></a>

##### CG-2 — Produce actual export artifacts

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

<a id="repair-cg-3"></a>

##### CG-3 — Enforce offline API ownership and operation scope

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

<a id="repair-cg-4"></a>

##### CG-4 — Repair collaboration's project-access contract

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

<a id="repair-cg-5"></a>

##### CG-5 — Persist and safely initialize modulation routing

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

### Playbooks: growth-rights

Source: `reports/readiness-audit/growth-rights.md`. [Domain evidence](#evidence-growth-rights) · [Index](#unified-platform-finding-index)

#### Repair playbooks

Each letter is a genuinely different implementation strategy, not a step in another strategy. Each includes preparation, implementation/migration, tests and acceptance. Recommendations are engineering choices, not guaranteed first-attempt fixes.

<a id="repair-gr-1"></a>

##### GR-1 — Durable, truthful fan delivery

**A — Transactional outbox and recipient ledger (recommended; strongest local control, ongoing worker operations).**
1. Define campaign, recipient, provider-accepted and delivered states plus stable command keys.
2. Add campaign/recipient/outbox tables and migrate historical “sent” rows to provenance-qualified historical records, not invented deliveries.
3. Route both campaign and broadcast actions through one transactional enqueue; workers persist provider IDs and process authenticated delivery callbacks.
4. Test repeated commands, worker death before/after acceptance, DB failure, partial rejection and callback replay.
5. Accept only when UI totals reconcile to real recipient outcomes and retry targets unresolved recipients without blind whole-list replay.

**B — Provider-managed campaign execution (less in-house delivery infrastructure, provider coupling).**
1. Select a real marketing provider with campaign IDs, delivery exports and documented retry semantics.
2. Map artists/audiences and migrate campaign drafts to provider-backed records retaining local ownership.
3. Create/send provider campaigns with durable external IDs; reconcile callbacks and polling into local status.
4. Exercise lost responses, duplicate send requests, quota errors and delayed delivery events against an authorized test audience.
5. Accept when every “sent/delivered” count traces to provider evidence and uncertain outcomes remain explicitly pending.

**C — Durable workflow orchestration (strong recovery history, higher infrastructure cost).**
1. Define one long-lived workflow per campaign and one activity per recipient with external-effect reconciliation rules.
2. Migrate pending campaigns into versioned workflow inputs and retain historical evidence separately.
3. Implement retries, activity heartbeats, provider lookup and deterministic state transitions; connect both UI actions to workflow IDs.
4. Test orchestrator/worker restart at each send boundary and mixed provider outcomes.
5. Accept when workflows resume to reconciled completion and replay cannot report or create unsupported delivery.

**D — Relay service with acknowledgement protocol (isolates email operations, adds service boundary).**
1. Specify authenticated relay commands, tenant quotas, immutable recipient sets and command deduplication.
2. Implement a durable relay inbox plus recipient ledger; migrate campaign execution ownership to the relay.
3. Persist relay command IDs before dispatch and expose accepted/delivered/rejected progress to the existing pages.
4. Test network partitions, duplicate relay requests and relay restart after provider acceptance.
5. Accept when local and relay records reconcile and fan UI never equates command acceptance with delivery.

<a id="repair-gr-2"></a>

##### GR-2 — Consent and suppression

**A — First-party consent registry (recommended; explicit control, regulatory/product maintenance).**
1. Define artist/channel-scoped lawful-basis, consent evidence, withdrawal and retention requirements with qualified review.
2. Add permission/suppression events and migrate existing contacts to evidence-unknown rather than assume consent.
3. Implement verified enrollment, signed unsubscribe links and last-moment suppression checks in every marketing sender.
4. Test withdrawal during queued delivery, import duplicates, token tampering and re-enrollment with authentic evidence.
5. Accept only when every eligible recipient has documented permission and withdrawals stop subsequent marketing sends.

**B — Marketing provider as consent authority (faster operational maturity, vendor dependence).**
1. Choose a provider supporting required consent receipts, list isolation and suppression callbacks.
2. Import contacts with provenance; obtain missing permission through an appropriate enrollment process rather than unsolicited confirmation blasts.
3. Use provider forms/unsubscribe and query or synchronize authoritative eligibility before dispatch.
4. Test callback loss, offline synchronization, suppression overrides and artist separation.
5. Accept when provider and application eligibility agree and unsubscribed contacts cannot be reactivated by ordinary imports.

**C — Dedicated preference-center service (reusable across products, additional service ownership).**
1. Specify recipient identifiers, artist scopes and channel purposes independent of account login.
2. Migrate consent evidence into a central event-backed preference store.
3. Build a verified preference portal and require a short-lived eligibility decision at each delivery boundary.
4. Test stale decisions, identity changes, cross-artist requests and revocation races.
5. Accept when all marketing entrypoints enforce the same current recipient decision with auditable evidence.

**D — Customer-owned audience-system federation (best for established artist CRM users, integration complexity).**
1. Define supported external CRM consent models, authoritative IDs and disconnect behavior.
2. Link contacts to authentic CRM records and migrate unknown local permission to unresolved status.
3. Implement signed enrollment/withdrawal synchronization plus fresh eligibility checks; render CRM-provided unsubscribe paths in messages.
4. Test reconciliation lag, deleted contacts, reconnects and conflicting preference updates.
5. Accept when end-to-end withdrawal propagates before subsequent sends and local edits cannot override authoritative suppression.

<a id="repair-gr-3"></a>

##### GR-3 — Complete merchandise ordering

**A — Native physical-commerce workflow (recommended for native checkout promise; largest implementation burden).**
1. Define tax, shipping, returns, variants, stock reservation and payment-settlement requirements separately from digital beats.
2. Add immutable order lines, money/currency fields, reservations and payment/fulfillment events; migrate catalog and qualify existing orders.
3. Build buyer checkout, authenticated payment event ingestion, atomic stock reservation and shipment/refund reconciliation.
4. Test oversell concurrency, repeated payment events, abandoned checkout, partial shipments and returns.
5. Accept on an authorized end-to-end purchase whose stock, payment, shipment and net revenue reconcile.

**B — Commerce-platform connector (fast mature checkout, platform fees and synchronization).**
1. Select an actual physical-commerce platform and document ownership of product, payment and inventory data.
2. Map existing products to remote variants and import verified historical orders with stable source IDs.
3. Provide connected checkout and signed order/fulfillment/refund webhook ingestion with periodic reconciliation.
4. Test duplicate/out-of-order events, reconnect, SKU changes and partial refund/shipment.
5. Accept when every remotely paid order appears once locally and local revenue matches authoritative settlement definitions.

**C — Print-on-demand merchant integration (reduced stock operations, margin/provider limitations).**
1. Choose a real provider and settle merchant-of-record, production, shipping and return responsibilities.
2. Map designs/variants/prices to provider catalog; migrate stock semantics to provider availability where applicable.
3. Implement buyer ordering, durable production submissions and payment/shipment event ingestion.
4. Test unavailable variants, production rejection, lost acknowledgement, refunds and tracking updates.
5. Accept after an authorized fulfilled order with traceable customer payment, production cost and artist proceeds.

**D — External-order management/import workflow (appropriate for multichannel sellers; not native checkout).**
1. Define supported external stores and documented order-source/payment evidence requirements.
2. Add staged imports, source IDs and explicit paid/unpaid/unknown financial states; migrate legacy totals accordingly.
3. Implement authenticated order imports/connectors, deduplication, inventory reconciliation and supported fulfillment exports.
4. Test repeat files/events, conflicting edits, missing payment evidence and partial fulfillment.
5. Accept when a real external purchase flows through local fulfillment/reconciliation; describe the product honestly as connected order management, not nonexistent native checkout.

<a id="repair-gr-4"></a>

##### GR-4 — Immutable, concurrent-safe split agreements

**A — Normalized revision/signature tables (recommended; robust invariants, schema migration).**
1. Define canonical agreement content, revision identity and allocation constraints: finite numeric percentages in 0–100, unique participant identities and a 100% total using documented precision.
2. Migrate arrays into revision/participant/signature rows, preserving historical evidence and flagging invalid allocations for explicit correction rather than silently normalizing them.
3. Transactionally validate the entire proposed allocation on every creation/amendment under a per-agreement lock; enforce row constraints and unique identities, then create an unsigned revision and require revision/content-bound signatures.
4. Test simultaneous signers/amendments, stale assent, duplicate identities, missing/non-numeric/non-finite percentages, negative/over-100 values and under/overallocated totals.
5. Accept when invalid amendments cannot commit, concurrent valid amendments preserve all canonical constraints, no successful signature disappears and activation requires all parties' assent to that exact valid revision.

**B — Optimistic concurrency on versioned documents (smaller migration, explicit conflict handling).**
1. Specify document version, canonical hash and conflict/retry semantics alongside finite 0–100 percentages, unique participant identities and a precisely represented 100% total.
2. Add revision/version columns and immutable historical snapshots; flag legacy invalid allocations without rewriting signed evidence.
3. Validate the entire proposed participant set and compare-and-swap every creation/amendment/signature command atomically; on conflict reload and revalidate, rejecting stale assent and generating an unsigned revision for changed terms.
4. Force interleaved writes and test duplicate identities, non-numeric/non-finite inputs, range violations and invalid totals; verify conflicts and validation errors leave stored content unchanged.
5. Accept when every committed revision satisfies canonical allocation constraints despite concurrent amendments and all persisted assent matches the exact accepted version.

**C — Event-sourced agreement aggregate (best audit history, greater complexity).**
1. Define proposed, revised, signed and activated events with expected sequence and canonical allocation invariants: finite 0–100 percentages, unique participants and an exact total under documented precision.
2. Migrate agreements as provenance-labelled snapshots, marking invalid legacy allocations as requiring correction rather than treating them as valid executable revisions.
3. Validate each complete proposed allocation inside serialized creation/amendment commands before atomic expected-sequence append; count signatures only for their immutable content hash.
4. Test parallel commands, replay/rebuild, duplicate participants, non-numeric/non-finite/range-invalid percentages and invalid totals, including amendment after partial/full signing.
5. Accept when replay preserves authentic signing events without transferring assent and no creation/amendment event can establish a revision violating canonical allocation constraints.

**D — E-signature envelope authority (external evidentiary tooling, provider cost/lock-in).**
1. Select a provider meeting identity/envelope requirements and define local canonical allocation rules: finite 0–100 percentages, unique participants and a 100% total under documented precision.
2. Map participants and migrate sheets as historical records, flagging invalid allocations; only validated new unsigned revisions are eligible for envelopes.
3. Atomically validate and reserve each creation/amendment revision before durable envelope submission; recheck revision identity on callbacks, bind artifacts/hashes to that revision and supersede rather than mutate executed envelopes.
4. Test callback replay/order, signer mismatch, concurrent amendments/completion, duplicate participants, non-numeric/non-finite/range-invalid percentages and invalid totals before provider submission.
5. Accept when invalid allocations cannot become executable revisions or submitted envelopes, activation requires verified assent to the same valid revision, and prior signed artifacts remain immutable and retrievable.

<a id="repair-gr-5"></a>

##### GR-5 — Evidence-bearing financial forecasts

**A — Explicit empirical/scenario model contract (recommended; retains useful heuristic work without invented certainty).**
1. Define observed, assumed, insufficient-data and measured-accuracy result types with sample windows and currency.
2. Migrate stored forecasts with model/provenance versions; do not backfill fabricated accuracy.
3. Preserve real zero rates, expose optional assumptions as scenarios, derive royalty terms from authoritative rights inputs and return unavailable accuracy until comparisons exist.
4. Test no data, zero actuals, zero monetization, sparse histories, rate outliers and royalty changes.
5. Accept when each numeric claim has evidence or an explicit user-visible assumption and zero-actual scoring uses a documented valid metric.

**B — Statement-based cash forecast (strong financial grounding, statement lag).**
1. Define authoritative statements, settlement periods, currencies and contractual deductions.
2. Build reconciled statement ingestion and migrate forecast inputs from mixed analytics into typed cash/royalty series.
3. Forecast cash by settlement cohort and compute backtests only over closed periods, with separate stream scenarios.
4. Validate against authorized historical statements including reversals and delayed settlement.
5. Accept when forecast/actual comparisons reproduce ledger totals and no-history results convey absence of evidence.

**C — Versioned forecasting service with calibration (more modeling capability, operating/model risk).**
1. Specify input provenance, zero-inclusive scoring, model validation and output uncertainty requirements.
2. Publish a versioned service contract and migrate existing forecast records with source/model metadata.
3. Implement trained/calibrated forecasting and out-of-sample evaluation; adapters return explicit insufficient-data states rather than constants.
4. Run temporal holdouts and drift tests including non-monetized artists; verify royalty calculations independently.
5. Accept when reported accuracy is reproducible from actual holdouts and the API returns calibrated, provenance-labelled results.

**D — Transparent financial planning engine (user-controlled assumptions, not automated predictive accuracy).**
1. Define a scenario-planning product with editable stream rates, rights shares and uncertainty bounds.
2. Migrate legacy estimates as unverified scenarios while retaining observed actuals separately.
3. Implement auditable assumption sets and deterministic recalculation; build a separate measured scenario-versus-actual evaluation pipeline.
4. Test zero assumptions, currency precision, assumption revisions and actual reconciliation.
5. Accept when users can reproduce each result from named inputs and any displayed accuracy comes from real comparisons, not planning defaults.

### Playbooks: admin-governance

Source: `reports/readiness-audit/admin-governance.md`. [Domain evidence](#evidence-admin-governance) · [Index](#unified-platform-finding-index)

#### Repair playbooks

Each alternative is a distinct implementation strategy, with preparation, implementation/migration, testing and acceptance. Recommendations are starting points, not guaranteed first-attempt fixes. Scope acceptance to the actual local and external effects promised in the UI.

<a id="repair-ag-1"></a>

##### AG-1 — Effective moderation

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

<a id="repair-ag-2"></a>

##### AG-2 — Operational controls that take effect

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

<a id="repair-ag-3"></a>

##### AG-3 — Total KYC checklist construction

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

<a id="repair-ag-4"></a>

##### AG-4 — Evidence-bound approval

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

<a id="repair-ag-5"></a>

##### AG-5 — Lossless support mutations

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

<a id="repair-ag-6"></a>

##### AG-6 — Complete customer support loop

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

### Playbooks: client-offline

Source: `reports/readiness-audit/client-offline.md`. [Domain evidence](#evidence-client-offline) · [Index](#unified-platform-finding-index)

#### Repair playbooks

Each option below is a genuinely different implementation/validation approach, with preparation, delivery/migration, tests and acceptance. Alternatives can share safety requirements but are not four steps of one proposed fix. Recommendations are provisional; none guarantees first-time success. Execute runtime tests later in an approved environment, not as part of this read-only audit.

<a id="repair-co-1"></a>

##### CO-1 alternatives — principal-bound browser data

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

<a id="repair-co-2"></a>

##### CO-2 alternatives — recoverable exclusive scheduling

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

<a id="repair-co-3"></a>

##### CO-3 alternatives — distinguish queued, acknowledged and applied

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

<a id="repair-co-4"></a>

##### CO-4 alternatives — safe application generation upgrades

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

<a id="repair-co-5"></a>

##### CO-5 alternatives — correct first-save draft contract

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

<a id="repair-co-6"></a>

##### CO-6 alternatives — real, operation-specific offline editing

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

<a id="repair-co-7"></a>

##### CO-7 alternatives — truthful project list error state

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

<a id="repair-co-8"></a>

##### CO-8 alternatives — establish release acceptance

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

## Scanner inventories

These are the full sanitized observation inventories supplied by the scanner domain report, not a new scan or an assertion of exploitability. Dependency and privacy source JSON remain at the exact source paths below; their sanitized per-observation inventories retain all 206 and 79 rows here. Raw source snippets are treated as text, never executable HTML.

Source paths: `reports/readiness-audit/scanner-dependencies.json`, `reports/readiness-audit/scanner-privacy.json`, `reports/readiness-audit/scanner-sast.json`; triage and sanitized inventories: `reports/readiness-audit/scanners.md`.

#### Full sanitized dependency inventory — all 206 observations

Rows preserve scanner order and duplicates. Advisory IDs and versions are scanner-supplied, not independently validated against the advisory publisher. **No occurrence path was supplied for any row** (shown as —). Root-lock matches below are independent corroboration, not reconstructed scanner provenance. R means non-dev lock entry, not proved execution; D means dev entry. U means no exact root npm match; it may be nested, Python/Rust/Go, stale or tooling and must be attributed via SCAN-02. Local tar is independently identified as the no-op replacement. Fix is the scanner suggestion per observation; unavailable/unspecified is not evidence no future fix exists.

| # | Ecosystem | Package | Version | Advisory | Severity | Scanner fix | Scanner path | Independent root match/scope |
|---|---|---|---|---|---|---|---|---|
| 1 | crates.io | anyhow | 1.0.101 | RUSTSEC-2026-0190 | moderate | 1.0.103 | — | U: provenance gate |
| 2 | crates.io | fxhash | 0.2.1 | RUSTSEC-2025-0057 | moderate | unavailable / not supplied | — | U: provenance gate |
| 3 | npm | fast-uri | 3.1.5 | GHSA-5jgf-p345-68v8 | high | 3.1.6 | — | R: node_modules/fast-uri |
| 4 | npm | fast-uri | 3.1.5 | GHSA-f65p-4m7j-42xc | high | 3.1.6 | — | R: node_modules/fast-uri |
| 5 | npm | fast-uri | 3.1.5 | GHSA-fph4-wmhf-6fwf | high | 3.1.6 | — | R: node_modules/fast-uri |
| 6 | npm | fast-uri | 3.1.5 | GHSA-jqff-g426-hqxp | high | 3.1.6 | — | R: node_modules/fast-uri |
| 7 | npm | fast-uri | 4.1.2 | GHSA-5jgf-p345-68v8 | high | 4.1.3 | — | U: provenance gate |
| 8 | npm | fast-uri | 4.1.2 | GHSA-f65p-4m7j-42xc | high | 4.1.3 | — | U: provenance gate |
| 9 | npm | fast-uri | 4.1.2 | GHSA-fph4-wmhf-6fwf | high | 4.1.3 | — | U: provenance gate |
| 10 | npm | fast-uri | 4.1.2 | GHSA-jqff-g426-hqxp | high | 4.1.3 | — | U: provenance gate |
| 11 | Go | github.com/jackc/pgx/v5 | 5.9.0 | GO-2026-5004 | moderate | 5.9.2 | — | U: provenance gate |
| 12 | Go | github.com/jackc/pgx/v5 | 5.9.0 | GHSA-j88v-2chj-qfwx | low | 5.9.2 | — | U: provenance gate |
| 13 | Go | golang.org/x/mod | 0.35.0 | GO-2026-6179 | moderate | 0.40.0 | — | U: provenance gate |
| 14 | Go | golang.org/x/mod | 0.35.0 | GO-2026-6180 | moderate | 0.40.0 | — | U: provenance gate |
| 15 | Go | golang.org/x/net | 0.54.0 | GO-2026-5025 | moderate | 0.55.0 | — | U: provenance gate |
| 16 | Go | golang.org/x/net | 0.54.0 | GO-2026-5026 | moderate | 0.55.0 | — | U: provenance gate |
| 17 | Go | golang.org/x/net | 0.54.0 | GO-2026-5027 | moderate | 0.55.0 | — | U: provenance gate |
| 18 | Go | golang.org/x/net | 0.54.0 | GO-2026-5028 | moderate | 0.55.0 | — | U: provenance gate |
| 19 | Go | golang.org/x/net | 0.54.0 | GO-2026-5029 | moderate | 0.55.0 | — | U: provenance gate |
| 20 | Go | golang.org/x/net | 0.54.0 | GO-2026-5030 | moderate | 0.55.0 | — | U: provenance gate |
| 21 | Go | golang.org/x/net | 0.54.0 | GO-2026-5942 | moderate | 0.56.0 | — | U: provenance gate |
| 22 | Go | golang.org/x/net | 0.54.0 | GHSA-5cv4-jp36-h3mw | moderate | 0.55.0 | — | U: provenance gate |
| 23 | Go | golang.org/x/text | 0.37.0 | GO-2026-5970 | moderate | 0.39.0 | — | U: provenance gate |
| 24 | Go | stdlib | 1.25.0 | GO-2025-3955 | moderate | 1.25.1 | — | U: provenance gate |
| 25 | Go | stdlib | 1.25.0 | GO-2025-4006 | moderate | 1.25.2 | — | U: provenance gate |
| 26 | Go | stdlib | 1.25.0 | GO-2025-4007 | moderate | 1.25.3 | — | U: provenance gate |
| 27 | Go | stdlib | 1.25.0 | GO-2025-4008 | moderate | 1.25.2 | — | U: provenance gate |
| 28 | Go | stdlib | 1.25.0 | GO-2025-4009 | moderate | 1.25.2 | — | U: provenance gate |
| 29 | Go | stdlib | 1.25.0 | GO-2025-4010 | moderate | 1.25.2 | — | U: provenance gate |
| 30 | Go | stdlib | 1.25.0 | GO-2025-4011 | moderate | 1.25.2 | — | U: provenance gate |
| 31 | Go | stdlib | 1.25.0 | GO-2025-4012 | moderate | 1.25.2 | — | U: provenance gate |
| 32 | Go | stdlib | 1.25.0 | GO-2025-4013 | moderate | 1.25.2 | — | U: provenance gate |
| 33 | Go | stdlib | 1.25.0 | GO-2025-4014 | moderate | 1.25.2 | — | U: provenance gate |
| 34 | Go | stdlib | 1.25.0 | GO-2025-4015 | moderate | 1.25.2 | — | U: provenance gate |
| 35 | Go | stdlib | 1.25.0 | GO-2025-4155 | moderate | 1.25.5 | — | U: provenance gate |
| 36 | Go | stdlib | 1.25.0 | GO-2025-4175 | moderate | 1.25.5 | — | U: provenance gate |
| 37 | Go | stdlib | 1.25.0 | GO-2026-4337 | moderate | 1.25.7 | — | U: provenance gate |
| 38 | Go | stdlib | 1.25.0 | GO-2026-4340 | moderate | 1.25.6 | — | U: provenance gate |
| 39 | Go | stdlib | 1.25.0 | GO-2026-4341 | moderate | 1.25.6 | — | U: provenance gate |
| 40 | Go | stdlib | 1.25.0 | GO-2026-4342 | moderate | 1.25.6 | — | U: provenance gate |
| 41 | Go | stdlib | 1.25.0 | GO-2026-4601 | moderate | 1.25.8 | — | U: provenance gate |
| 42 | Go | stdlib | 1.25.0 | GO-2026-4602 | moderate | 1.25.8 | — | U: provenance gate |
| 43 | Go | stdlib | 1.25.0 | GO-2026-4603 | moderate | 1.25.8 | — | U: provenance gate |
| 44 | Go | stdlib | 1.25.0 | GO-2026-4864 | moderate | 1.25.9 | — | U: provenance gate |
| 45 | Go | stdlib | 1.25.0 | GO-2026-4865 | moderate | 1.25.9 | — | U: provenance gate |
| 46 | Go | stdlib | 1.25.0 | GO-2026-4869 | moderate | 1.25.9 | — | U: provenance gate |
| 47 | Go | stdlib | 1.25.0 | GO-2026-4870 | moderate | 1.25.9 | — | U: provenance gate |
| 48 | Go | stdlib | 1.25.0 | GO-2026-4918 | moderate | 1.25.10 | — | U: provenance gate |
| 49 | Go | stdlib | 1.25.0 | GO-2026-4946 | moderate | 1.25.9 | — | U: provenance gate |
| 50 | Go | stdlib | 1.25.0 | GO-2026-4947 | moderate | 1.25.9 | — | U: provenance gate |
| 51 | Go | stdlib | 1.25.0 | GO-2026-4970 | moderate | 1.25.12 | — | U: provenance gate |
| 52 | Go | stdlib | 1.25.0 | GO-2026-4971 | moderate | 1.25.10 | — | U: provenance gate |
| 53 | Go | stdlib | 1.25.0 | GO-2026-4976 | moderate | 1.25.10 | — | U: provenance gate |
| 54 | Go | stdlib | 1.25.0 | GO-2026-4977 | moderate | 1.25.10 | — | U: provenance gate |
| 55 | Go | stdlib | 1.25.0 | GO-2026-4980 | moderate | 1.25.10 | — | U: provenance gate |
| 56 | Go | stdlib | 1.25.0 | GO-2026-4981 | moderate | 1.25.10 | — | U: provenance gate |
| 57 | Go | stdlib | 1.25.0 | GO-2026-4982 | moderate | 1.25.10 | — | U: provenance gate |
| 58 | Go | stdlib | 1.25.0 | GO-2026-4986 | moderate | 1.25.10 | — | U: provenance gate |
| 59 | Go | stdlib | 1.25.0 | GO-2026-5026 | moderate | 1.25.13 | — | U: provenance gate |
| 60 | Go | stdlib | 1.25.0 | GO-2026-5037 | moderate | 1.25.11 | — | U: provenance gate |
| 61 | Go | stdlib | 1.25.0 | GO-2026-5038 | moderate | 1.25.11 | — | U: provenance gate |
| 62 | Go | stdlib | 1.25.0 | GO-2026-5039 | moderate | 1.25.11 | — | U: provenance gate |
| 63 | Go | stdlib | 1.25.0 | GO-2026-5856 | moderate | 1.25.12 | — | U: provenance gate |
| 64 | Go | stdlib | 1.25.0 | GO-2026-5972 | moderate | 1.25.13 | — | U: provenance gate |
| 65 | Go | stdlib | 1.25.0 | GO-2026-6088 | moderate | 1.25.13 | — | U: provenance gate |
| 66 | Go | stdlib | 1.25.0 | GO-2026-6089 | moderate | 1.25.13 | — | U: provenance gate |
| 67 | Go | stdlib | 1.25.0 | GO-2026-6090 | moderate | 1.25.13 | — | U: provenance gate |
| 68 | Go | stdlib | 1.25.0 | GO-2026-6091 | moderate | 1.25.13 | — | U: provenance gate |
| 69 | Go | stdlib | 1.25.0 | GO-2026-6218 | moderate | 1.25.13 | — | U: provenance gate |
| 70 | PyPI | anyio | 4.13.0 | GHSA-5p39-cfhj-2xmp | moderate | 4.14.2 | — | U: provenance gate |
| 71 | PyPI | anyio | 4.13.0 | GHSA-82r6-8w77-94w6 | critical | 4.14.2 | — | U: provenance gate |
| 72 | PyPI | setuptools | 81.0.0 | PYSEC-2026-3447 | moderate | 83.0.0 | — | U: provenance gate |
| 73 | PyPI | setuptools | 81.0.0 | GHSA-h35f-9h28-mq5c | moderate | 83.0.0 | — | U: provenance gate |
| 74 | PyPI | torch | 2.12.1 | GHSA-rrmf-rvhw-rf47 | moderate | 2.13.0 | — | U: provenance gate |
| 75 | npm | baseline-browser-mapping | 2.10.0 | GHSA-w5vr-8v7q-w6rv | moderate | 2.11.0 | — | U: provenance gate |
| 76 | npm | brace-expansion | 2.1.1 | GHSA-3jxr-9vmj-r5cp | moderate | 2.1.2 | — | U: provenance gate |
| 77 | npm | brace-expansion | 2.1.1 | GHSA-mh99-v99m-4gvg | high | 2.1.3 | — | U: provenance gate |
| 78 | npm | brace-expansion | 2.1.1 | GHSA-rgw5-rvv9-x895 | high | 2.1.4 | — | U: provenance gate |
| 79 | npm | browserslist | 4.28.1 | GHSA-73wf-gq98-2v4g | high | 4.28.7 | — | U: provenance gate |
| 80 | npm | browserslist | 4.28.1 | GHSA-c83g-rgw3-j3cx | high | 4.28.7 | — | U: provenance gate |
| 81 | npm | extract-zip | 2.0.1 | GHSA-7pqw-9j4j-h8q3 | high | unavailable / not supplied | — | U: provenance gate |
| 82 | npm | extract-zip | 2.0.1 | GHSA-jmr9-qjv8-65gv | high | unavailable / not supplied | — | U: provenance gate |
| 83 | npm | fast-uri | 3.1.3 | GHSA-5jgf-p345-68v8 | high | 3.1.6 | — | U: provenance gate |
| 84 | npm | fast-uri | 3.1.3 | GHSA-7p8r-x3mc-p8w7 | high | 3.1.5 | — | U: provenance gate |
| 85 | npm | fast-uri | 3.1.3 | GHSA-f65p-4m7j-42xc | high | 3.1.6 | — | U: provenance gate |
| 86 | npm | fast-uri | 3.1.3 | GHSA-fph4-wmhf-6fwf | high | 3.1.6 | — | U: provenance gate |
| 87 | npm | fast-uri | 3.1.3 | GHSA-jqff-g426-hqxp | high | 3.1.6 | — | U: provenance gate |
| 88 | npm | fast-uri | 3.1.3 | GHSA-v2hh-gcrm-f6hx | high | 3.1.4 | — | U: provenance gate |
| 89 | npm | js-yaml | 4.3.0 | GHSA-2883-xcg3-v3hh | high | 4.3.2 | — | U: provenance gate |
| 90 | npm | js-yaml | 4.3.0 | GHSA-5p4m-2wfm-xmqj | high | 4.3.1 | — | U: provenance gate |
| 91 | npm | nanoid | 3.3.15 | GHSA-28wg-ghj8-5hjv | moderate | 3.3.16 | — | U: provenance gate |
| 92 | npm | nanoid | 3.3.15 | GHSA-2v37-7h3g-55p8 | moderate | 3.3.18 | — | U: provenance gate |
| 93 | npm | postcss | 8.5.16 | GHSA-fxqj-rqcc-2cmp | moderate | 8.5.23 | — | U: provenance gate |
| 94 | npm | postcss | 8.5.16 | GHSA-r28c-9q8g-f849 | high | 8.5.18 | — | U: provenance gate |
| 95 | npm | qs | 6.15.3 | GHSA-4mjr-xmp4-gh2g | moderate | 6.16.0 | — | R: node_modules/qs |
| 96 | npm | qs | 6.15.3 | GHSA-x5fp-wj9c-mxmx | low | 6.16.0 | — | R: node_modules/qs |
| 97 | PyPI | anyio | 4.12.1 | GHSA-5p39-cfhj-2xmp | moderate | 4.14.2 | — | U: provenance gate |
| 98 | PyPI | anyio | 4.12.1 | GHSA-82r6-8w77-94w6 | critical | 4.14.2 | — | U: provenance gate |
| 99 | PyPI | click | 8.3.1 | PYSEC-2026-2132 | high | 8.3.3 | — | U: provenance gate |
| 100 | PyPI | setuptools | 81.0.0 | PYSEC-2026-3447 | moderate | 83.0.0 | — | U: provenance gate |
| 101 | PyPI | setuptools | 81.0.0 | GHSA-h35f-9h28-mq5c | moderate | 83.0.0 | — | U: provenance gate |
| 102 | PyPI | setuptools | 82.0.1 | PYSEC-2026-3447 | moderate | 83.0.0 | — | U: provenance gate |
| 103 | PyPI | setuptools | 82.0.1 | GHSA-h35f-9h28-mq5c | moderate | 83.0.0 | — | U: provenance gate |
| 104 | PyPI | torch | 2.12.1 | GHSA-rrmf-rvhw-rf47 | moderate | 2.13.0 | — | U: provenance gate |
| 105 | npm | @babel/core | 7.29.0 | GHSA-4x5r-pxfx-6jf8 | low | 7.29.6 | — | U: provenance gate |
| 106 | npm | baseline-browser-mapping | 2.10.0 | GHSA-w5vr-8v7q-w6rv | moderate | 2.11.0 | — | U: provenance gate |
| 107 | npm | browserslist | 4.28.1 | GHSA-73wf-gq98-2v4g | high | 4.28.7 | — | U: provenance gate |
| 108 | npm | browserslist | 4.28.1 | GHSA-c83g-rgw3-j3cx | high | 4.28.7 | — | U: provenance gate |
| 109 | npm | esbuild | 0.27.3 | GHSA-g7r4-m6w7-qqqr | low | 0.28.1 | — | U: provenance gate |
| 110 | npm | fast-uri | 3.1.0 | GHSA-4c8g-83qw-93j6 | high | 3.1.3 | — | U: provenance gate |
| 111 | npm | fast-uri | 3.1.0 | GHSA-7p8r-x3mc-p8w7 | high | 3.1.5 | — | U: provenance gate |
| 112 | npm | fast-uri | 3.1.0 | GHSA-f65p-4m7j-42xc | high | 3.1.6 | — | U: provenance gate |
| 113 | npm | fast-uri | 3.1.0 | GHSA-jqff-g426-hqxp | high | 3.1.6 | — | U: provenance gate |
| 114 | npm | fast-uri | 3.1.0 | GHSA-q3j6-qgpj-74h6 | high | 3.1.1 | — | U: provenance gate |
| 115 | npm | fast-uri | 3.1.0 | GHSA-v2hh-gcrm-f6hx | high | 3.1.4 | — | U: provenance gate |
| 116 | npm | fast-uri | 3.1.0 | GHSA-v39h-62p7-jpjc | high | 3.1.2 | — | U: provenance gate |
| 117 | npm | multer | 2.2.0 | GHSA-535w-7cp7-47q4 | high | 2.3.0 | — | R: node_modules/multer |
| 118 | npm | multer | 2.2.0 | GHSA-qfvm-cv95-jqjf | high | 2.3.0 | — | R: node_modules/multer |
| 119 | npm | multer | 2.2.0 | GHSA-qvfw-j98x-7q72 | low | 2.3.0 | — | R: node_modules/multer |
| 120 | npm | multer | 2.2.0 | GHSA-wc9g-mqfw-jrwm | high | 2.3.0 | — | R: node_modules/multer |
| 121 | npm | nanoid | 3.3.11 | GHSA-28wg-ghj8-5hjv | moderate | 3.3.16 | — | U: provenance gate |
| 122 | npm | nanoid | 3.3.11 | GHSA-2v37-7h3g-55p8 | moderate | 3.3.18 | — | U: provenance gate |
| 123 | npm | nanoid | 3.3.11 | GHSA-xwg4-73v4-xw9w | high | 3.3.12 | — | U: provenance gate |
| 124 | npm | postcss | 8.5.8 | GHSA-6g55-p6wh-862q | high | 8.5.12 | — | U: provenance gate |
| 125 | npm | postcss | 8.5.8 | GHSA-fxqj-rqcc-2cmp | moderate | 8.5.23 | — | U: provenance gate |
| 126 | npm | postcss | 8.5.8 | GHSA-qx2v-qp2m-jg93 | moderate | 8.5.10 | — | U: provenance gate |
| 127 | npm | postcss | 8.5.8 | GHSA-r28c-9q8g-f849 | high | 8.5.18 | — | U: provenance gate |
| 128 | npm | qs | 6.15.3 | GHSA-4mjr-xmp4-gh2g | moderate | 6.16.0 | — | R: node_modules/qs |
| 129 | npm | qs | 6.15.3 | GHSA-x5fp-wj9c-mxmx | low | 6.16.0 | — | R: node_modules/qs |
| 130 | npm | @xmldom/xmldom | 0.9.11 | GHSA-27p8-2357-5qqv | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 131 | npm | @xmldom/xmldom | 0.9.11 | GHSA-3px3-54cx-rmw9 | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 132 | npm | @xmldom/xmldom | 0.9.11 | GHSA-6gmq-8vp8-gcm6 | moderate | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 133 | npm | @xmldom/xmldom | 0.9.11 | GHSA-6h8r-xr42-gp59 | moderate | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 134 | npm | @xmldom/xmldom | 0.9.11 | GHSA-6mj3-qw4j-hgrw | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 135 | npm | @xmldom/xmldom | 0.9.11 | GHSA-8344-3jmq-59r6 | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 136 | npm | @xmldom/xmldom | 0.9.11 | GHSA-93r5-fhx6-vmg9 | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 137 | npm | @xmldom/xmldom | 0.9.11 | GHSA-965w-775f-mr7g | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 138 | npm | @xmldom/xmldom | 0.9.11 | GHSA-c7q8-3ch8-vqpv | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 139 | npm | @xmldom/xmldom | 0.9.11 | GHSA-jxjr-3g7g-3944 | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 140 | npm | @xmldom/xmldom | 0.9.11 | GHSA-vr34-hp96-76pp | high | 0.9.12 | — | R: node_modules/@xmldom/xmldom |
| 141 | npm | csv-parse | 6.2.1 | GHSA-8cw4-87c7-c6xx | moderate | 7.0.2 | — | R: node_modules/csv-parse |
| 142 | npm | fast-uri | 3.1.5 | GHSA-5jgf-p345-68v8 | high | 3.1.6 | — | R: node_modules/fast-uri |
| 143 | npm | fast-uri | 3.1.5 | GHSA-f65p-4m7j-42xc | high | 3.1.6 | — | R: node_modules/fast-uri |
| 144 | npm | fast-uri | 3.1.5 | GHSA-fph4-wmhf-6fwf | high | 3.1.6 | — | R: node_modules/fast-uri |
| 145 | npm | fast-uri | 3.1.5 | GHSA-jqff-g426-hqxp | high | 3.1.6 | — | R: node_modules/fast-uri |
| 146 | npm | js-yaml | 4.3.1 | GHSA-2883-xcg3-v3hh | high | 4.3.2 | — | R: node_modules/js-yaml |
| 147 | npm | multer | 2.2.0 | GHSA-535w-7cp7-47q4 | high | 2.3.0 | — | R: node_modules/multer |
| 148 | npm | multer | 2.2.0 | GHSA-qfvm-cv95-jqjf | high | 2.3.0 | — | R: node_modules/multer |
| 149 | npm | multer | 2.2.0 | GHSA-qvfw-j98x-7q72 | low | 2.3.0 | — | R: node_modules/multer |
| 150 | npm | multer | 2.2.0 | GHSA-wc9g-mqfw-jrwm | high | 2.3.0 | — | R: node_modules/multer |
| 151 | npm | qs | 6.15.3 | GHSA-4mjr-xmp4-gh2g | moderate | 6.16.0 | — | R: node_modules/qs |
| 152 | npm | qs | 6.15.3 | GHSA-x5fp-wj9c-mxmx | low | 6.16.0 | — | R: node_modules/qs |
| 153 | npm | sharp | 0.35.3 | GHSA-rgj7-g3m4-5g8c | high | 0.35.4 | — | R: node_modules/sharp |
| 154 | npm | uuid | 7.0.3 | GHSA-w5hq-g745-h8pq | high | 11.1.1 | — | D: node_modules/xcode/node_modules/uuid |
| 155 | npm | @vitest/mocker | 4.1.10 | GHSA-82fw-gwwq-j7x9 | moderate | 4.1.11 | — | U: provenance gate |
| 156 | npm | @xmldom/xmldom | 0.9.10 | GHSA-27p8-2357-5qqv | high | 0.9.12 | — | U: provenance gate |
| 157 | npm | @xmldom/xmldom | 0.9.10 | GHSA-3px3-54cx-rmw9 | high | 0.9.12 | — | U: provenance gate |
| 158 | npm | @xmldom/xmldom | 0.9.10 | GHSA-4w3w-2rp5-g8jm | high | 0.9.11 | — | U: provenance gate |
| 159 | npm | @xmldom/xmldom | 0.9.10 | GHSA-6gmq-8vp8-gcm6 | moderate | 0.9.12 | — | U: provenance gate |
| 160 | npm | @xmldom/xmldom | 0.9.10 | GHSA-6h8r-xr42-gp59 | moderate | 0.9.12 | — | U: provenance gate |
| 161 | npm | @xmldom/xmldom | 0.9.10 | GHSA-6mj3-qw4j-hgrw | high | 0.9.12 | — | U: provenance gate |
| 162 | npm | @xmldom/xmldom | 0.9.10 | GHSA-8344-3jmq-59r6 | high | 0.9.12 | — | U: provenance gate |
| 163 | npm | @xmldom/xmldom | 0.9.10 | GHSA-93r5-fhx6-vmg9 | high | 0.9.12 | — | U: provenance gate |
| 164 | npm | @xmldom/xmldom | 0.9.10 | GHSA-965w-775f-mr7g | high | 0.9.12 | — | U: provenance gate |
| 165 | npm | @xmldom/xmldom | 0.9.10 | GHSA-c7q8-3ch8-vqpv | high | 0.9.12 | — | U: provenance gate |
| 166 | npm | @xmldom/xmldom | 0.9.10 | GHSA-g53g-w8rj-fmg7 | high | 0.9.11 | — | U: provenance gate |
| 167 | npm | @xmldom/xmldom | 0.9.10 | GHSA-vr34-hp96-76pp | high | 0.9.12 | — | U: provenance gate |
| 168 | npm | @xmldom/xmldom | 0.9.10 | GHSA-w2rr-34g9-rvrj | high | 0.9.11 | — | U: provenance gate |
| 169 | npm | csv-parse | 6.2.1 | GHSA-8cw4-87c7-c6xx | moderate | 7.0.2 | — | R: node_modules/csv-parse |
| 170 | npm | dompurify | 3.4.12 | GHSA-55q2-fjhq-7xh7 | moderate | 3.4.13 | — | U: provenance gate |
| 171 | npm | fast-uri | 3.1.5 | GHSA-5jgf-p345-68v8 | high | 3.1.6 | — | R: node_modules/fast-uri |
| 172 | npm | fast-uri | 3.1.5 | GHSA-f65p-4m7j-42xc | high | 3.1.6 | — | R: node_modules/fast-uri |
| 173 | npm | fast-uri | 3.1.5 | GHSA-fph4-wmhf-6fwf | high | 3.1.6 | — | R: node_modules/fast-uri |
| 174 | npm | fast-uri | 3.1.5 | GHSA-jqff-g426-hqxp | high | 3.1.6 | — | R: node_modules/fast-uri |
| 175 | npm | js-yaml | 4.3.0 | GHSA-2883-xcg3-v3hh | high | 4.3.2 | — | U: provenance gate |
| 176 | npm | js-yaml | 4.3.0 | GHSA-5p4m-2wfm-xmqj | high | 4.3.1 | — | U: provenance gate |
| 177 | npm | multer | 2.2.0 | GHSA-535w-7cp7-47q4 | high | 2.3.0 | — | R: node_modules/multer |
| 178 | npm | multer | 2.2.0 | GHSA-qfvm-cv95-jqjf | high | 2.3.0 | — | R: node_modules/multer |
| 179 | npm | multer | 2.2.0 | GHSA-qvfw-j98x-7q72 | low | 2.3.0 | — | R: node_modules/multer |
| 180 | npm | multer | 2.2.0 | GHSA-wc9g-mqfw-jrwm | high | 2.3.0 | — | R: node_modules/multer |
| 181 | npm | nanoid | 3.3.16 | GHSA-2v37-7h3g-55p8 | moderate | 3.3.18 | — | U: provenance gate |
| 182 | npm | qs | 6.15.3 | GHSA-4mjr-xmp4-gh2g | moderate | 6.16.0 | — | R: node_modules/qs |
| 183 | npm | qs | 6.15.3 | GHSA-x5fp-wj9c-mxmx | low | 6.16.0 | — | R: node_modules/qs |
| 184 | npm | sharp | 0.35.3 | GHSA-rgj7-g3m4-5g8c | high | 0.35.4 | — | R: node_modules/sharp |
| 185 | npm | tar | file:stubs/tar | GHSA-23hp-3jrh-7fpw | high | 7.5.19 | — | Local stub: SCAN-04 |
| 186 | npm | tar | file:stubs/tar | GHSA-34x7-hfp2-rc4v | high | 7.5.7 | — | Local stub: SCAN-04 |
| 187 | npm | tar | file:stubs/tar | GHSA-3jfq-g458-7qm9 | high | unavailable / not supplied | — | Local stub: SCAN-04 |
| 188 | npm | tar | file:stubs/tar | GHSA-5955-9wpr-37jh | high | unavailable / not supplied | — | Local stub: SCAN-04 |
| 189 | npm | tar | file:stubs/tar | GHSA-83g3-92jg-28cx | high | 7.5.8 | — | Local stub: SCAN-04 |
| 190 | npm | tar | file:stubs/tar | GHSA-8qq5-rm4j-mr97 | high | 7.5.3 | — | Local stub: SCAN-04 |
| 191 | npm | tar | file:stubs/tar | GHSA-8x88-c5mf-7j5w | high | 7.5.18 | — | Local stub: SCAN-04 |
| 192 | npm | tar | file:stubs/tar | GHSA-9ppj-qmqm-q256 | high | 7.5.11 | — | Local stub: SCAN-04 |
| 193 | npm | tar | file:stubs/tar | GHSA-f5x3-32g6-xq36 | moderate | 6.2.1 | — | Local stub: SCAN-04 |
| 194 | npm | tar | file:stubs/tar | GHSA-gfjr-3jmm-4g9v | high | 2.0.0 | — | Local stub: SCAN-04 |
| 195 | npm | tar | file:stubs/tar | GHSA-gvwx-54wh-qm9j | moderate | 7.5.17 | — | Local stub: SCAN-04 |
| 196 | npm | tar | file:stubs/tar | GHSA-j44m-qm6p-hp7m | high | unavailable / not supplied | — | Local stub: SCAN-04 |
| 197 | npm | tar | file:stubs/tar | GHSA-qffp-2rhf-9h96 | high | 7.5.10 | — | Local stub: SCAN-04 |
| 198 | npm | tar | file:stubs/tar | GHSA-r292-9mhp-454m | high | 7.5.21 | — | Local stub: SCAN-04 |
| 199 | npm | tar | file:stubs/tar | GHSA-r6q2-hw4h-h46w | high | 7.5.4 | — | Local stub: SCAN-04 |
| 200 | npm | tar | file:stubs/tar | GHSA-vmf3-w455-68vh | moderate | 7.5.16 | — | Local stub: SCAN-04 |
| 201 | npm | tar | file:stubs/tar | GHSA-w8wr-v893-vjvp | moderate | 7.5.18 | — | Local stub: SCAN-04 |
| 202 | npm | vitest | 4.1.10 | GHSA-82fw-gwwq-j7x9 | moderate | 4.1.11 | — | U: provenance gate |
| 203 | npm | esbuild | 0.27.7 | GHSA-g7r4-m6w7-qqqr | low | 0.28.1 | — | U: provenance gate |
| 204 | PyPI | anyio | 4.13.0 | GHSA-5p39-cfhj-2xmp | moderate | 4.14.2 | — | U: provenance gate |
| 205 | PyPI | anyio | 4.13.0 | GHSA-82r6-8w77-94w6 | critical | 4.14.2 | — | U: provenance gate |
| 206 | PyPI | click | 8.3.2 | PYSEC-2026-2132 | high | 8.3.3 | — | U: provenance gate |

#### Full privacy disposition inventory — all 79 observations

All cited source ranges were compared with current source, not accepted from remediation prompts. No personal values or source payloads are reproduced. Scanner severity is retained for traceability, not endorsed. T = confirmed source-level personal-data emission / SCAN-03; F = scanner category false positive; G = narrower verification gate. A source emission alone does not establish legal noncompliance. All T rows are instances of one minimization/schema root and use the SCAN-03 alternatives. Non-web operational scripts have their own execution/retention scope.

| # | Scanner severity | Current source citation | Disposition and consumer detail |
|---|---|---|---|
| 1 | MEDIUM | server/middleware/errorHandler.ts:253-262 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 2 | LOW | server/routes/socialOAuth.ts:1090-1097 | T: Username emitted to application log; central redaction does not cover the cited field/message. |
| 3 | LOW | server/routes/admin.ts:267-267 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 4 | LOW | server/services/statusPageService.ts:442-444 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 5 | CRITICAL | server/routes/socialOAuth.ts:559-566 | F: Token-presence booleans and expiry only; no token material. OAuth callback. |
| 6 | MEDIUM | server/middleware/rateLimiter.ts:454-454 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 7 | LOW | server/routes/support.ts:184-184 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 8 | LOW | server/routes/support.ts:264-264 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 9 | MEDIUM | server/services/dnsServer.ts:606-608 | F for personal-IP allegation: authoritative server address announcement; infrastructure metadata. |
| 10 | LOW | server/services/accountDeletionService.ts:103-105 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 11 | MEDIUM | server/routes/selfHealingApi.ts:260-260 | T: Email and IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 12 | LOW | server/services/socialSyncService.ts:462-464 | T: Username emitted to application log; central redaction does not cover the cited field/message. |
| 13 | LOW | server/services/accountDeletionService.ts:230-236 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 14 | LOW | server/routes/admin.ts:670-670 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 15 | LOW | server/routes/admin.ts:751-753 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 16 | LOW | server/services/advertisingDispatchService.ts:946-948 | G: Advertising monetary budget is business/campaign telemetry, not intrinsically personal data; purpose and linkage need review under SCAN-03. |
| 17 | LOW | server/routes/admin.ts:695-697 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 18 | LOW | server/routes/support.ts:334-335 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 19 | MEDIUM | server/middleware/requestValidation.ts:162-166 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 20 | MEDIUM | server/security-system.ts:940-940 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 21 | CRITICAL | server/routes/socialOAuth.ts:646-654 | F for alleged token leak; G under SCAN-03 for unconstrained provider error value. Status/ok/presence boolean do not expose tokens. |
| 22 | LOW | server/routes.ts:2439-2439 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 23 | MEDIUM | server/routes/notifications.ts:531-533 | T: SMS recipient prefix (partial phone data), sender and user ID; not a full phone number. |
| 24 | LOW | server/services/accountDeletionService.ts:149-151 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 25 | MEDIUM | vps-dns-proxy/dns-proxy-node.js:212-212 | F: TCP listener bind address, not visitor/client IP. |
| 26 | LOW | server/services/beatMoneyLoopService.ts:202-204 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 27 | LOW | server/services/musicCodes.ts:403-403 | F for street/address category: registrant code and user ID, no postal address; linked identifier still requires retention review. |
| 28 | MEDIUM | server/middleware/rateLimiter.ts:485-487 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 29 | LOW | server/routes/paymentBypass.ts:83-85 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 30 | MEDIUM | server/middleware/rateLimiter.ts:381-381 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 31 | LOW | server/services/statusPageService.ts:470-470 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 32 | LOW | tools/vgpu_scheduler/demo.py:117-119 | F: Scheduler demonstration round budget/backlog, not financial budget or personal-data leak; nonproduction demo scope. |
| 33 | LOW | server/services/accountDeletionService.ts:173-178 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 34 | LOW | server/routes/selfHealingApi.ts:273-273 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 35 | MEDIUM | server/middleware/rateLimiter.ts:419-419 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 36 | LOW | server/services/statusPageService.ts:644-647 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 37 | LOW | server/routes/admin.ts:1142-1144 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 38 | LOW | server/routes/paymentBypass.ts:59-61 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 39 | MEDIUM | server/middleware/globalRateLimiter.ts:213-213 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 40 | MEDIUM | server/services/selfHealingSecurityEngine.ts:1046-1046 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 41 | LOW | server/init-admin.ts:147-147 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 42 | LOW | server/routes/admin.ts:717-719 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 43 | LOW | server/services/weeklyInsightsService.ts:349-352 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 44 | LOW | server/services/beatMoneyLoopService.ts:196-198 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 45 | LOW | server/services/emailService.ts:412-412 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 46 | MEDIUM | server/services/dnsServer.ts:609-611 | F: Nameserver/server-address announcement, infrastructure metadata. |
| 47 | LOW | server/routes/admin.ts:382-382 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 48 | LOW | server/routes/paymentBypass.ts:113-115 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 49 | LOW | server/services/notificationService.ts:175-175 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 50 | MEDIUM | server/middleware/csrf.ts:38-41 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 51 | LOW | server/routes/support.ts:221-223 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 52 | LOW | server/routes/support.ts:384-384 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 53 | LOW | server/services/weeklyInsightsService.ts:315-315 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 54 | MEDIUM | server/middleware/requestCorrelation.ts:95-106 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 55 | MEDIUM | server/middleware/scalableRateLimiter.ts:471-471 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 56 | MEDIUM | server/services/selfHealingSecurityEngine.ts:822-824 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 57 | LOW | server/routes/admin.ts:317-319 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 58 | LOW | server/scripts/setupAdmin.ts:680-680 | T: Administrative bootstrap CLI prints email; operational-tool scope, not a request handler. |
| 59 | MEDIUM | server/services/geoDns.ts:347-355 | T conditional: GeoDNS lookup IP in debug event; default info level suppresses emission, configured debug enables it. |
| 60 | MEDIUM | server/middleware/requestValidation.ts:140-143 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 61 | LOW | server/services/dunningService.ts:269-271 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 62 | LOW | server/routes/admin.ts:358-358 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 63 | LOW | server/routes/export.ts:1615-1615 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 64 | LOW | server/routes.ts:2423-2423 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 65 | LOW | server/init-admin.ts:78-78 | T: Existing-admin bootstrap diagnostic email; initialization scope. |
| 66 | MEDIUM | server/middleware/csrf.ts:49-52 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 67 | LOW | server/routes.ts:574-574 | F for email allegation: current login event logs user ID only. Pseudonymous ID retention remains a policy matter, not the alleged email leak. |
| 68 | MEDIUM | server/middleware/csrf.ts:61-64 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 69 | MEDIUM | server/services/selfHealingSecurityEngine.ts:1048-1048 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 70 | MEDIUM | vps-dns-proxy/dns-proxy-node.js:208-208 | F: UDP listener bind address, not client IP. |
| 71 | MEDIUM | server/security-system.ts:966-966 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 72 | MEDIUM | server/security-system.ts:1100-1102 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 73 | MEDIUM | server/middleware/rateLimiter.ts:313-313 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 74 | LOW | server/services/distributionService.ts:1632-1632 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 75 | LOW | server/routes/admin.ts:405-407 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 76 | MEDIUM | server/services/selfHealingSecurityEngine.ts:826-829 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |
| 77 | LOW | server/services/statusPageService.ts:618-621 | T: Email emitted to application log; central redaction does not cover the cited field/message. |
| 78 | LOW | server/scripts/setupAdmin.ts:56-56 | T: Administrative bootstrap CLI prints email; operational-tool scope. |
| 79 | MEDIUM | server/safety/inputValidation.ts:273-273 | T: IP Address emitted to application log; central redaction does not cover the cited field/message. |

### Sanitized SAST result

```json
{
  "incomplete": true,
  "results": []
}
```

## Coverage and exclusions

This section preserves each domain’s examined surfaces and unexamined boundaries. Neither route inventories nor the union of reports establishes production certification. No live credentials, production user records or secret values were inspected for this assembly.

### Coverage: security

Source: `reports/readiness-audit/security.md`.

#### Examined-surface inventory and boundaries

**Examined:** current source in `server/routes.ts` for auth/session, reset, factor setup, Google callback, account deletion and router mounts; `server/auth.ts`; `server/middleware/auth.ts`, `sessionConfig.ts`, `csrf.ts`, `requestValidation.ts`, `cloudflare.ts`; selected `server/index.ts` initialization; `server/routes/admin.ts`, `security.ts`, `uploads.ts`, `customWorkflows.ts`, selected `socialMedia.ts`; `server/services/accountDeletionService.ts`, storage abstraction and JWT references; `server/storage.ts`; selected `shared/schema.ts`; CORS registration references.

**Already-present protections not relisted as missing:** reset tokens are hashed and atomically consumed (`server/routes.ts:2188-2229`); normal CSRF token comparisons exist; admin/security routers have role and assurance gates; custom workflow ownership is checked; upload tokens use HMAC and constant-time signature comparison (`server/routes/uploads.ts:90-134`), filenames strip path components (`:71-79`). These observations are not full end-to-end assurances.

**Unexamined/limited:** no exhaustive review of every route, ownership query, OAuth provider, websocket, upload parser/media processor, storage adapter, DNS resolver, JWT lifetime/rotation path, client persistence, SQL migration, schema relation, retention job or log sink. No runtime exploit, browser screenshot, live data inspection, network probe, load test, dependency CVE analysis or production credential-value inspection occurred. Session/factor changes require regression testing across recovery codes and all token issuers. Object retention, backups, legal holds, actual cascades, provider deletion, secret rotation/history and ingress policy remain deployment verification work. Self-healing engine and billing business logic were excluded. Historical task proposals and comments were checked against sampled current code where relevant and never used as proof of a defect or a completed repair.

### Coverage: commerce

Source: `reports/readiness-audit/commerce.md`.

#### Examined-surface inventory and unexamined boundaries

**Examined in depth:** marketplace checkout routes and settlement chain; exported storage implementation; order/royalty/refund/statement schema excerpts; signed Stripe webhook registration, handler behavior and dedupe; seller balance calculation, automatic transfers and manual payouts; royalty split accrual and dispatcher reachability; refund API authorization, local/provider lifecycle and dispute handlers; scheduler-to-payout-service call chain; subscription checkout metadata and entitlement consumers. Searched current migrations for order-intent uniqueness and refund-table references. Examined royalty statement serialization and the LabelGrid accounting write seam only, not provider transport.

**Historical evidence checked:** current production-readiness/regression reports and authenticated-flow exclusions were compared with the current implementation rather than accepted as proofs. Proposed beat-booking, auto-drain and rate-seeding tasks were not treated as defects: pending insertion and the drain schedule are already present. The platform-rate seed exists (`server/seed/platformRoyaltyRates.ts` and initialization references); no “rates absent” finding is made without database evidence.

**Targeted/search-only, not exhaustive certification:** royalty calculation/FX/recoupment logic, enhanced split transfers, payout risk/tax logic, membership/storefront checkout branches, payment bypass, all marketplace licensing combinations, downstream downloads and full migration history. Existing tests were read selectively, not executed. No claim is made that unused alternative services cover active production paths.

**Unexamined:** live data/schema/migration application, balances or actual losses; Stripe keys/account settings/event subscriptions/API availability; regulatory/tax/legal sufficiency; real banking delivery, chargeback outcomes and provider reserves; LabelGrid/TooLost transport; infrastructure logs and running UI. No secrets or customer data were read. A UI screenshot would not verify these accounting invariants and was not taken; this audit produced only this report. Parent platform audit must cover domains outside money and decide the final release boundary.

### Coverage: integrations

Source: `reports/readiness-audit/integrations.md`.

#### Examined-surface inventory and unexamined boundaries

**Examined source surfaces:** distribution direct-submit routes and primary Too Lost handoff; current `labelgrid-service` and Too Lost create/retry/status paths; the separate `labelGridService` implementation was located and searched but not assumed to be the direct-submit dependency; artist creation/discovery/import handoff; transfer job storage, scanner pagination/coverage and transactional import boundaries; social OAuth callback/token persistence, social sync credential consumption, V2 scheduling/worker/provider dispatch and queue entrypoints; notification API preference/SMS confirmation paths, NotificationService, push dispatcher and email-service retry references.

**Current-source corrections respected:** LabelGrid's draft helper is now honest about being a draft; Too Lost has real create/upload/submit code and must not be called a generic stub; Spotify release pagination follows provider cursors; catalog import uses an advisory lock on the transaction connection and per-release savepoints; artist auto-import scans the exact target profile URL rather than a different saved artist; Bandcamp/Audiomack coverage is explicitly partial; OAuth callback persistence intentionally remains publisher-compatible; notification email handling checks provider rejection/message IDs. These are not listed as historical unfixed bugs.

**Verification boundaries:** no live provider contract, app-review/scope approval, redirect registration, sender-domain reputation, SMS sender compliance, webhook receipt, queue-server acknowledgement behavior, or real DSP delivery was exercised. Consequently connection/readiness is not certified, but missing credentials/approvals are not alleged. Production acceptance for the selected playbooks must include authorized end-to-end evidence: connect/refresh/revoke, release create/validate/submit/status reconciliation, publish and remote receipt recovery, catalog coverage proof, and consented email/SMS delivery. No screenshots were needed for this source-only audit; app execution/visual testing was explicitly outside the assignment.

This is a domain report, not certification of the entire repository. Unexamined in depth: all alternate social/advertising automation engines, every route mount/overlap, mobile push vendor configuration, full email deliverability/webhook stack, every distribution update/takedown/smart-link path, all vendor SDK internals and deployment secrets/roles. MaxCore and money internals are excluded; I9 examines only the explicitly requested mounted distributor payout execution boundary, not balance, settlement-accounting or disbursement internals. The expanded review also inspected LabelGrid's configured delivery-status fallback/normalizers and both configured/unconfigured payout branches. No historical report, proposed/cancelled task, or configuration assumption was used as proof of a current defect.

### Coverage: ai-media

Source: `reports/readiness-audit/ai-media.md`.

#### Examined-surface inventory and boundaries

Examined current source: MaxCore app client/control/domain adapters and local supervisor references; external Node prediction proxy and canonical Python model initialization, training metric updates, engagement endpoint, audio renderer retry loop and video audio helpers; app AI analytics/model adapters and public AI/A&R consumers; social A/B generation/routes; studio audio generation handoff; social music-video uploads and active image-to-video handoff. Searches also covered studio/audio-processing/training routes, mixing/mastering adapters, diffusion/video services and related test filenames. Searches do not equal full line-by-line review or executed coverage.

Negative controls: `aiMusicService.ts:2201-2248` contains simulated missing-audio fallback, but source search found no active importing consumer beyond its own export and a self-evolution file reference; it is **not** promoted to a reachable release blocker. `audioGeneratorService.ts` similarly has legacy local synthesis/TTS fallback but no discovered TypeScript importer. Legacy `maxcore_server.py:1125-1145` contains heuristic predictions; the inspected local supervisor identifies canonical `server.py`, so this audit does not claim those legacy predictions are active. The canonical engagement route's unreachable heuristic body is not counted. Active image-to-video motion intensity is mapped correctly. Task proposals and historical claims were not treated as evidence.

Unexamined/unverified: live MaxCore identity and checkpoint contents, remote configuration, live dataset rights and coverage, real inference quality/latency, audio intelligibility, GPU execution claims, rendered media, client interaction, provider connectivity, complete DSP/plugin/studio editor behavior, all training corpus construction and every native model, full automated-test coverage. No screenshot is warranted for this read-only source report; no application behavior was changed or runtime started. Those boundaries prevent an “entire platform certified ready” conclusion. General persistence, release packaging, payments and the exempt Max assistant belong to other audit domains.

### Coverage: data-runtime

Source: `reports/readiness-audit/data-runtime.md`.

#### Examined-surface inventory and unexamined boundaries

Examined current sources: application storage provider and fixed/generated key contracts; storage upload tracking/compensation and soft-delete routes; backup service/routes/automation consumer; DB configuration and schema tooling; migration journal and later SQL inventory; PDIM client/broker selection; local PDIM persistence routines; external PDIM Redis manager/store recovery and AOF scheduling; external fabric deletion and metadata indexes; retention queue startup; distributed-lock helper and its actual consumer search; PG/PDIM session store implementations. Searches also identified `tests/unit/pdim-command-contract.test.ts`; no test result is inferred from its existence.

Historical checking: inspected `reports/production-readiness-current.md` as a navigation aid only, then checked current code. Task proposals/cancellations were not treated as evidence. Current upload routes already compensate for tracking failures (`server/routes/storage.ts:263-274,469-477`), current storage deletion propagates provider failure (`server/services/storageService.ts:139-156`), and external PDIM has AOF persistence (`external/pdim/artifacts/api-server/src/redis/store.ts:325-329`). This report does not re-list historical “no tracking,” “delete always succeeds,” or “no persistence” claims as current blockers. The standalone `withSchedLock` get/delete implementation has no discovered current external consumer; it was not promoted to an active production finding solely from its comment.

Unexamined/verification boundaries: no live DB schema, migration history, stored backup objects, configured provider identity, secrets, managed PITR settings, external deployment version, actual scheduler execution, storage inventory, Redis/PDIM crash results, or RPO/RTO measurements were accessed. The complete 2,000-line PDIM client command surface, every fabric erasure/compression/replication algorithm, all queue families, and every application storage consumer were not exhaustively verified. Local PDIM's best-effort file persistence was inspected but its active production selection was not established, so no extra production defect is inferred from that implementation alone. Authentication policy, media semantics and deployment packaging are outside this assigned audit. All implementation/testing steps above require subsequent authorized work; this audit changed only this report.

### Coverage: deployment

Source: `reports/readiness-audit/deployment.md`.

#### Examined-surface inventory and boundaries

##### Examined

- Safe allowlisted deployment fields only from `.replit:173-176`; no environment/secret sections were displayed.
- `package.json` command wiring; active `script/build.ts`; `script/lib/dockerignoreScan.ts`; capsule restore flow in `dist/pdim-restore.mjs`; legacy `build.sh` explicitly distinguished from the active build.
- `start.sh` Node selection, port-contract ordering, stub lifecycle, critical/background restore, Python activation, auxiliary processes and cluster launch; `.dockerignore` runtime exclusions.
- `server/cluster.ts`, `server/computeSizing.ts`, and MaxCore supervisor sizing call sites; workspace artifact tracking for gateway/Boosterstate.
- Staged startup probes, readiness responders, boot-stub purpose, health-registry/monitoring implementation surfaces, Sentry heartbeat and independent alert dispatch.
- CI build/integration/summary gates, load-test request/acceptance logic, post-deployment smoke readiness checks; workflow filenames were inventoried, not all native-platform workflows audited.
- Custom-domain ACME defaults, provisioning consumer, renewal registration and renewal sweep source.

##### Existing protections not misreported as absent

- Active builds compile frontend/server/cluster rather than using legacy `build.sh`'s presence-only fast path.
- Capsule restoration has checksum processing, locking/staging and checked critical restore; app remainder restoration is already critical. This report does not revive earlier claims that app remainder restoration races cluster boot.
- Bootstrap port-contract scripts are intentionally retained outside the remainder capsule. No unverified port collision is alleged.
- Current image preflight includes payload/capsules and Nix closure accounting (`script/build.ts:205-230` and following implementation); the historical missing image-budget check is not a current finding.
- Readiness periodically refreshes and degraded dependencies are not labeled ready; current Sentry code already implements a silence watchdog. Findings identify remaining specific defects instead of restating obsolete tasks.

##### Unexamined / not established

- No deployment metadata call, published URL lookup, production image download, logs/console inspection, DNS query, TLS handshake, provider configuration check, live DB query or secret-value inspection. Published build success, current visibility, region, resource tier and actual production health are unknown.
- No complete build, typecheck, test suite, browser screenshot, workload benchmark, external callback or renewal exercise was run. A screenshot would not verify this source-only infrastructure audit and was outside the assigned implementation/testing scope.
- No assertion of current binary staleness, actual OOM, present Sentry outage, broken DNS, missing production credentials or live certificate failure.
- Dependency vulnerability/package scans are excluded and owned by the main audit. Native desktop/mobile signing, app-store submission, application security, business correctness and provider-specific data flows require their assigned domain audits.
- Capsule member safety/integrity across every possible archive, production backup/restore, resource/disk budgets under real data, purchased monitoring coverage and full DNS/edge topology remain acceptance work. Historical reports and proposed tasks were not used as proof; all blocker assertions above derive from cited current source.

### Coverage: product-autonomous

Source: `reports/readiness-audit/product-autonomous.md`.

#### Examined-surface inventory and unexamined boundaries

Inspected route registration in `client/src/App.tsx`; targeted Settings handlers/controls and theme provider/bootstrap; searched Dashboard, Admin, AdminDashboard, AdminAutonomy, Workspaces, DeveloperApi and MusicWorkflowAutomations for inert/stub indicators; traced AdminAutonomy error/status queries; inspected preference persistence in `server/routes.ts`; examined evolution registry categories, consumer references and post-deployment gate; security healing action dispatch; autofix implementation references; and current simulation test setup against the three historical simulation reports.

Search hits alone were not treated as defects. In particular, current admin error handling and working profile persistence were not called broken, and a placeholder attribute is not an unimplemented feature. The inspected theme mismatch is actionable without inventing an inert button.

Not exhaustively examined: every component/form, studio/DAW, accessibility and responsive rendering, all public marketing claims, every admin permission boundary, billing/distribution/provider operations, database migrations, multi-region convergence, actual frontend runtime, deployed proxy configuration, or live durable services. No browser/visual check was performed because this assignment is a source-only report, not an application change. No heavy tests were run. Primary AI/provider, payments, infrastructure and security findings should be supplied by their owning audit domains; this report does not duplicate their root causes or assert platform-wide production readiness.

### Coverage: scanners

Source: `reports/readiness-audit/scanners.md`.

#### Examined-surface inventory and unexamined boundaries

Examined: the three newly supplied scanner JSON reports; all 79 current privacy source ranges across routes, middleware, services, bootstrap scripts, DNS proxy and scheduler demo; server/logger.ts; root package manifest and exact matching root npm lock records; tracked manifest/lock filename inventory including nested/vendor workspaces; selected AnyIO/click/torch/setuptools and Rust lock records; tar CommonJS/ESM implementations and override; source upload/image/CSV consumers; Dockerfile, Dockerfile.prod, .dockerignore and build.sh release-selection/install behavior; tracked dist file presence; current security/integrations report cross-references. Historical task proposals, cancelled tasks and memory were not used as defect proof.

Unexamined / not attested: complete advisory-publisher authenticity/version history; exploit reproduction; every transitive consumer or installed package implementation; the internals/effectiveness of build-time security patches; final image/container/desktop/mobile/SBOM contents; actual process environments, Go binary provenance and nested dev/cache installations; CI scanner failure cause/rules/full language coverage; live log sinks, retention, access control and legal basis; provider OAuth responses beyond source schema; live DB/provider state; secrets and deployment configuration values. No app startup, tests, package installation, migrations, build/config edits or live queries were performed. A screenshot is not pertinent to this read-only scanner report and would not close these release gates.

Acceptance requires the selected playbooks' evidence on the exact release candidate. This report does not assert production is clean, that every scanner advisory is reachable, or that an absent root-lock match is harmless.

### Coverage: coverage-gaps

Source: `reports/readiness-audit/coverage-gaps.md`.

#### Examined-surface inventory and unexamined boundaries

##### Counts and method

Inventory counts, **not line-by-line audit coverage**: 146 TypeScript files beneath `server/routes` (includes nested/test/support modules, so not 146 independent APIs); 104 literal `path: "/api/…"` lazy route registrations in `server/routes.ts`; 161 top-level `app.get/post/put/patch/delete/use` source matches there (includes mounts/middleware, not 161 unique business operations). `client/src/App.tsx:191-278` has 76 `<Route>` declarations, including the pathless fallback: 75 path-bearing routes. `client/src/components/layout/Sidebar.tsx:55-180` inventories ordinary and admin navigation. These categories overlap and must not be added as a coverage percentage.

The seven existing blocker lists were read: security, commerce, data-runtime, deployment, integrations, ai-media and product-autonomous. This pass checked current source for additional surfaces and did not re-prove every finding in those reports. Scanner JSON was not used.

##### Route/page/feature coverage matrix

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

##### External subsystem boundaries

Source inventory includes PostgreSQL/Drizzle, PDIM/Pocket Dimension storage, Redis-compatible queues/pub-sub/session state, MaxCore/native media/DSP, Stripe/Connect, DSP distribution providers, connected social platforms, email/notification delivery, OAuth/JWT and WebSocket collaboration. These are not a claim of successful configuration or live connectivity. No deployed schema, bucket contents, session state, production secrets, provider dashboard, billing account, ad account, DSP catalog, signed artifact or user data was inspected.

**Release verification gates (not additional source-defect findings):** after implementing the chosen alternatives, require isolated multi-user/multi-worker acceptance for CG-2–CG-5 and a credential lifecycle acceptance for CG-1. This pass did not execute them. The wider unexamined page families and provider contracts above prevent describing this breadth report—or the union of navigation inventories—as a complete production certification.

### Coverage: growth-rights

Source: `reports/readiness-audit/growth-rights.md`.

#### Examined-surface inventory and unexamined boundaries

Started from mounted families in `client/src/App.tsx:253-277` and advertising `:206`; followed actual page requests into mounted routers, not merely historical task descriptions. Read existing blocker lists in commerce, integrations, AI/media, product/autonomous, security, deployment, data/runtime, coverage-gaps and scanner reports to avoid restating their root causes. Proposed/cancelled tasks supplied by the parent were not evidence.

| Surface | Source examined / conclusion | Residual boundary |
|---|---|---|
| Shows/live performance | `client/src/pages/Shows.tsx:119-217`; `server/routes/shows.ts` CRUD, stats and setlist ownership checks, including `:369-405` | Planner/storage reviewed, not real venue booking, ticket settlement, venue integrations or tour logistics certification |
| Merch | Page queries/mutations, mounted router, order schema and producer searches; GR-3 | No live checkout/provider/warehouse evidence |
| Publishing | `server/routes/publishing.ts:15-49,91-119,134-184` validates split totals, starts registration pending, and owner-scopes writes | Do not re-report already-fixed split validation. PRO registration verification, royalty statements and chain of title not certified |
| Sync licensing | `client/src/pages/SyncLicensing.tsx:86-144`; `server/routes/syncLicensing.ts` owner CRUD, public browse/inquiry `:208-294`, owner inquiry workflow `:297-400` | Inquiry/listing tracking is not proof of executed license, cleared masters/compositions, invoicing or exclusive-rights enforcement |
| Contracts/splits | Ordinary page signing and contracts router; template service signing; split-sheet mutations; GR-4 | Counterparty identity/legal validity, jurisdiction templates, tax forms and all invoice lifecycle paths not exhaustively reviewed |
| Collaboration/team permissions | `server/routes/collaborations.ts` connection endpoints; `server/routes/workspace.ts:34-80,219-238`; `server/services/workspaceService.ts:145-201` | Route-level membership/admin checks exist; no blanket authorization defect inferred from a service without checks. Full role inheritance, custom-role escalation, approval workflows, SSO and invitation lifecycle remain unverified |
| Playlist pitching | `client/src/pages/PlaylistPitching.tsx`; `server/routes/playlistPitching.ts` curator list and pitch/status CRUD `:179-295` | Local tracking/status entry is not verified curator receipt or placement; curator directory freshness and external submission agreements unverified |
| Fan CRM/marketing | FanHub, FanCampaigns tab/router, email wrapper and schemas; GR-1/2. Outreach page/router inspected, including explicit unavailable handling `server/routes/outreach.ts:378` | Provider suppression/deliverability, bounce/complaint handling and broader workflow-automation email consumers not exhaustively traced |
| Fan monetization | `server/routes/fanMemberships.ts` tier management, members/revenue `:258-385`, loyalty config/leaderboard; page query consumers | Membership acquisition, recurring billing reconciliation and wallet redemption not end-to-end traced; no invented missing-producer claim made |
| Advertising creation/delivery/spend | `client/src/pages/Advertisement.tsx:402-448,548-561,710-825`; `server/routes/advertising.ts:330-365,865-922`; `server/services/advertisingDispatchService.ts:1-220` | Current code explicitly uses organic posting, planning budgets and zero paid spend. Do not re-report the fixed budget-as-spend issue. Paid-media buying/billing/budget enforcement is not established by organic posting; provider delivery/metric aggregation, attribution and all autopilot rules remain verification boundaries |
| Revenue forecast/aggregation | Mounted forecast router and `revenueForecastService`, isolated widget reference; GR-5 | No claim of mounted widget visibility; cross-platform analytics ingestion, deduplication, FX/currency/timezone semantics and all aggregate dashboards not exhaustively audited |
| Press kit/release countdown/workflow automations | App route inventory only | Rendering, public sharing, automation delivery and external integrations not deeply audited in this report |

This is not a full-platform certification. Production acceptance requires authorized integration evidence for chosen remediations; static source cannot establish real email delivery, consent validity, legal assent, fulfillment or calibrated predictive accuracy. No screenshots were taken because the assignment explicitly restricted this to source review and report writing.

### Coverage: admin-governance

Source: `reports/readiness-audit/admin-governance.md`.

#### Examined-surface inventory and unexamined boundaries

- **Mounts/UI:** reviewed primary/lazy admin, support and KYC registrations in `server/routes.ts`, application admin/support/KYC routing, moderation/settings actions, KYC review and applicant-status consumers, support detail actions.
- **Backend effects:** inspected admin moderation/settings handlers, KYC service ownership/decisions/checklist/eligibility, support service persistence and route-level authorization. Guards are acknowledged; this report intentionally does not repeat authentication, session revocation, logging or privacy-erasure findings from `security.md`/`scanners.md`.
- **Historical reports:** compared blocker lists in all existing readiness reports; excluded token lifecycle 501 (`coverage-gaps.md`), autonomous healing/evolution adapters (`product-autonomous.md`), commerce and deployment/runtime findings. Existing comments/tasks were search leads only, not runtime evidence. Current KYC upload ownership checks, admin subtree role guard and sequential support persistence were not misreported as missing.
- **Consent/compliance/legal:** inspected `server/services/consentService.ts`, `server/services/complianceService.ts`, `client/src/components/CookieConsentBanner.tsx`, `client/src/components/settings/PrivacySettings.tsx`, public Terms/Privacy source and policy-file inventory. Searches found no external callers of the consent/compliance services; therefore their report language/internal scores are not presented as evidence of a live compliance dashboard or certification. The banner itself describes essential cookies and stores a local choice; no proven optional-tracker contradiction is asserted from that fact alone. No demonstrable new legal/billing contradiction was established in this pass; jurisdiction-specific legal adequacy was not assessed.
- **Incident/security governance:** inventoried admin security, audit-log and platform-fixer incident surfaces and policy document paths. Did not validate incident drills, alert routing, decision-log retention, staff operating procedures or external certifications. These remain operational evidence boundaries, not fabricated failures.
- **Other unexamined boundaries:** no deployed behavior, provider delivery, live schema/data completeness, KYC file custody penetration test, all payment eligibility consumers, external social takedown confirmation, ban enforcement across every session/API path, all training/admin-dashboard controls, exhaustive policy/version-consent acceptance capture, DMCA processing, jurisdiction-specific obligations or complete accessibility audit. No screenshots were necessary for this source-only report and no application was run. An entire-platform release decision must combine the parallel domain reports and explicit acceptance evidence; this report does not certify production readiness.

### Coverage: client-offline

Source: `reports/readiness-audit/client-offline.md`.

#### Examined-surface inventory and boundaries

##### Examined source and functional contracts

* **Root registration/routing:** `main.tsx`, `App.tsx`, worker source selection in `server/index.ts`/`vite.config.ts`, both worker files. Contract: install/open/update/deep-link with compatible assets; development-domain worker caching bypass is present, so a development preview would not prove production cache behavior.
* **Worker data paths:** private/public response caches, fallback reads, batch interception/replay, cache cleanup and update messages. Push URL sanitization is present and is not reported as a missing protection. Full push permission/provider delivery was not audited.
* **Persistence:** IndexedDB query adapter, query persistence filter, auth logout, offline queue/cache/draft stores, initialization and provider status, draft/sync hooks and facade. Contract: identity isolation, durable commit acknowledgment, restart recovery and truthful capability/error status.
* **Projects (partial page audit):** fetch/list/error-state rendering, edit/delete/duplicate request wiring and invalidation, sampled labeled edit form. Contract: list truthfulness; successful operations reconcile visible state; failures preserve actionable feedback. Upload/audio/create internals were not traced end to end.
* **Realtime (sampled):** generic socket hook, Analytics reconnect consumer, NotificationCenter invalidation consumer. Contract: reconnect/subscription and eventual authoritative state after missed events. Collaboration server method/authorization is already CG-4 and excluded here; no realtime end-to-end convergence certification is made.
* **Navigation/errors/accessibility (sampled):** lazy routes, root/route error boundaries, global query/mutation error feedback, Projects form/loading semantics. Existing error boundaries, labeled controls and error toasts are credited; their presence alone does not establish functional accessibility.
* Existing blocker lists in security, deployment, data-runtime, commerce, integrations, AI-media, product-autonomous, scanners and coverage-gaps were reviewed for overlap. This report does not repeat CG-3 offline server authorization, CG-4 collaboration storage-method mismatch, CG-5 modulation persistence, themes/preference race, payment/provider defects or deployment artifact findings. The legacy root worker is not confused with the active client worker.

##### Client pages not substantively audited in this report

The route inventory at `client/src/App.tsx:175-278` is a surface map, not a pass result. The following **source pages were inventoried but not audited end to end here** (other domain reports may cover their backend contracts):

* **Account/onboarding/purchase:** Login, Register, RegisterPayment, RegisterSuccess, ForgotPassword, ResetPassword, Onboarding, Pricing, Subscribe, Verification, Settings.
* **Creation/business:** Studio, Dashboard, SimplifiedDashboard, Marketplace, SocialMedia, Advertisement, Distribution, Royalties, Contracts, Workspaces, Collaborations, CareerCoach, Assistant, ReleaseCountdown, Invoices, HandleLink, MusicWorkflowAutomations, Shows, ShowPage, FanHub, FanMemberships, ARIntelligence, OutreachCRM, MerchStore, PressKit, PlaylistPitching, Publishing, SyncLicensing, ProducerProfilePage, Storefront, PublicPressKit, VideoGeneratorPage.
* **Communication/analytics:** Notifications, NotificationDetail, Analytics beyond the socket sample; every `pages/analytics` module: AIDashboard, ARDiscoveryPanel, AudienceInsights, CrossPlatformComparison, ExportAnalytics, GlobalRankingDashboard, HistoricalAnalyticsView, NaturalLanguageQuery, PlaylistJourneysVisualization, PlaylistTracking, RevenueAnalytics, StreamingAnalytics.
* **Administration/developer:** Admin, AdminAutonomy, AdminDashboard, DeveloperApi, API, DesktopApp; `pages/admin` AuditLog, ContentSampler, KYCReview, SecurityDashboard, SupportDashboard, SupportTicketDetail, TrainingDashboard.
* **Public/help/legal/navigation:** About, Blog, BlogPost, DMCA, Documentation, Features, Help, Landing, Privacy, SecurityPage, SoloFounderStory, Terms, not-found. File existence does not mean every page is a mounted route.

Required functional contracts for those unexamined surfaces: role-correct entry/deep links; initial load versus genuinely empty versus failure; validated create/edit/delete with pending/error/confirmation state; preserved unsaved input; no duplicate effects on retry; authoritative refresh after mutation/reconnect; identity-isolated recovery; keyboard/touch/assistive-tech completion; narrow-screen/zoom operation; explicit permissions and storage failures. Page-specific backend/provider acceptance belongs to its domain report, not this client-only sampling.

##### Unexamined boundaries / evidence still required

No runtime reproduction, browser console inspection, screenshot, installed-app update, native/Electron/Capacitor validation, audio device permission test, real quota/eviction test, assistive-technology session, or multi-client race experiment was performed. No live records were inspected. CSP/cookie/header effectiveness, backend idempotency coverage, installed-user cache contents and actual hosting retention of old chunks remain outside this pass. The generic queue/draft hooks are present but broad mounted form enrollment was not established; findings explicitly limit their present release scope. This is an evidence-backed blocker inventory plus release gates, not a claim that the entire platform has passed functional acceptance.

### Assembly validation

80 unique IDs; 320 options; 1600 steps. Structural exceptions: none; each ID has A–D and each option has steps 1–5. Distinct strategy titles are checked mechanically; practical distinctness remains a requirements/architecture review, not something numbering alone can certify. No source finding or repair content was altered to force a pass.

Machine-readable counts, per-ID metadata, source hashes and options are in `reports/readiness-audit/validation.json`.
