# Security production-readiness audit — 2026-09-19

## Blocker list

Read-only source audit; no application changes, workflow operations, live database/provider requests, credential-value inspection, or runtime tests. Prior tasks and comments are not evidence of completion. Priorities describe release risk, not a claim of demonstrated exploitation. No P0 exploit was established. This is the security-domain contribution, not certification of the entire platform.

| ID | Classification | Priority / release scope | Finding | Confidence |
|---|---|---|---|---|
| SEC-01 | CONFIRMED defect | P1 / all authenticated releases | Revocation is a temporary, fail-open flag rather than durable invalidation; fallback sessions can survive password reset. | High |
| SEC-02 | CONFIRMED defect | P1 / MFA, Google sign-in, privileged users | MFA assurance is inconsistent across sign-in and authenticator replacement. | High |
| SEC-03 | CONFIRMED defect | P1 / custom workflow webhooks | URL string checks do not constrain the destination reached by the server. | High |
| SEC-04 | CONFIRMED defect + CAPABILITY GAP | P1 / account erasure and privacy promises | Public deletion removes only the user row; complete erasure orchestration and OAuth reauthentication are missing from that path. | High for source behavior; medium for total retained footprint |
| SEC-05 | CONFIRMED defect | P1 / browser-authenticated production | CSRF middleware load failure is explicitly allowed to continue startup. | High for failure behavior; not evidence of a current load failure |
| SEC-06 | VERIFICATION GATE | P1 / public deployment; P2 for non-public development | Edge trust, deployed cookie settings, secret custody and negative authorization tests need deployment evidence. | High that source alone cannot establish these properties |

### SEC-01 — session revocation does not establish permanent invalidity

**Entrypoints/consumers:** password reset invokes `revokeUserSessions` at `server/routes.ts:2237-2248`; password change also invokes the revocation path after its best-effort session enumeration (`server/routes.ts:1350-1388`). Express consumes the active store at `server/index.ts:745`.

**Evidence:** revocation has a 310-second TTL (`server/middleware/sessionConfig.ts:355`), stores only `"1"` rather than a generation or issuance cutoff (`:435-443`), and reads timeout/error as not revoked (`:394-405`). An old session not requested during that window need not be destroyed. Revocation rejection deletes the inner copy but not the PostgreSQL copy (`:483-488`). PostgreSQL fallback reads return session data without that check (`:514-518`, `:538-543`); the PG-only store returns cached/database sessions without it (`:713-729`). Session destruction acknowledges success before best-effort persistent removal (`:611-618`). These are instances of the same non-authoritative invalidation design, not separate findings.

**Impact:** a captured cookie can remain usable or reappear after reset, expiration of the revocation flag, storage outage, or failed deletion. Conversely, the user-wide boolean cannot distinguish a new legitimate login from an old session while it is set. The source comment promising a bounded five-second revocation is not an end-to-end guarantee.

### SEC-02 — MFA lifecycle does not preserve assurance

**Entrypoints/consumers:** local login, Google callback, MFA setup/verification, and routes using `requireAuth` / `require2FA`.

**Evidence:** local login challenges TOTP (`server/routes.ts:540-558`), but the Google callback links by returned email and establishes a full session without consulting `twoFactorEnabled` (`:2404-2439`). Ordinary `requireAuth` establishes authentication without MFA assurance (`server/middleware/auth.ts:6-39`); `req.isAuthenticated` is simply presence of `req.user` (`server/routes.ts:217-222`). Privileged gates do check session assurance (`server/middleware/auth.ts:122-136`), so this is not a claim that every privileged route is directly bypassed.

The setup endpoint requires only a user, writes a new **active** secret immediately, and returns it (`server/routes.ts:1739-1768`), without proving the existing factor/password or maintaining a separate pending secret. Verification checks that replacement (`:1802-1815`). Thus a session without the prior factor can replace it, and an abandoned setup can break the legitimate factor. Admin and security routers do have explicit admin/MFA gates (`server/routes/admin.ts:51-62`; `server/routes/security.ts:10`); those existing gates do not repair factor replacement.

**Impact:** enabled local MFA is not enforced consistently at Google login; session theft can become authenticator takeover. Google email/sub identity-linking rules also require negative tests; this audit does not claim a provider-specific unverified-email exploit.

### SEC-03 — workflow webhook SSRF protection checks names, not destinations

**Entrypoint:** authenticated `POST /api/custom-workflows/:id/test`, mounted at `server/routes.ts:8535`, checks workflow ownership at `server/routes/customWorkflows.ts:466-480`.

**Evidence:** `isSafeWebhookUrl` requires HTTPS and matches hostname strings against a small private-address regex list, but does not resolve and constrain addresses (`server/routes/customWorkflows.ts:13-37`). The webhook action passes the URL to native `fetch` with no redirect policy or pinned resolved address (`:531-550`). A public hostname can resolve to a private address; default redirect handling can reach destinations never examined by the validator. Literal IPv6 normalization also needs complete address parsing rather than these regexes.

**Impact:** authenticated users can induce requests from the server's network position. Network egress restrictions may reduce impact but were not inspected. Ownership checks are present and do not prevent SSRF.

### SEC-04 — erasure completion is not substantiated by the public path

**Entrypoint:** `DELETE /api/auth/account` verifies a password, calls `storage.deleteUser`, and returns success (`server/routes.ts:1415-1432`). The storage method deletes only the users row (`server/storage.ts:231-236`). Google-created accounts have an empty password (`server/routes.ts:2413-2418`), so that public deletion flow cannot directly reauthenticate those accounts.

**Evidence:** not all user-associated schema rows cascade: e.g. `analytics.userId` has no user foreign key (`shared/schema.ts:135-149`). Files are stored through an external storage abstraction (`server/routes.ts:1473-1478`), whose explicit deletion operation exists at `server/services/storageService.ts:221-222`; the account path never calls it. The separate deletion service similarly relies on a user delete and asserts broad cascade completion (`server/services/accountDeletionService.ts:154-187`), retains identifying audit fields (`:215-227`), and logs identifying data (`:149-150`, `:230-235`). Source search found no runtime caller of that service outside its definition; it is not proof the public endpoint performs scheduled erasure.

**Impact:** success does not mean user-associated rows, object bytes, caches, processor copies and backups meet a documented erasure policy. A total schema/processor inventory and lawful-retention assessment remain necessary; no legal violation is inferred solely from retaining a narrowly justified audit record. Logging and permanent audit retention need minimization and explicit policy.

### SEC-05 — CSRF initialization fails open

**Entrypoint/consumer:** asynchronous server initialization installs origin validation then attempts to install CSRF (`server/index.ts:761-784`). The catch logs a warning and continues rather than failing readiness/startup (`:782-784`).

**Evidence:** missing Origin/Referer in production is logged but admitted by origin validation (`server/middleware/requestValidation.ts:138-145`); malformed Referer also falls through (`:151-155`). Normal CSRF does reject missing/mismatching tokens (`server/middleware/csrf.ts:34-68`). Therefore an import/initialization failure removes a deliberate protection while readiness can proceed.

**Impact:** loss of defense in depth during a faulty build or startup. SameSite and origin checks still exist; this is **not** proof that cross-site requests currently succeed. Exemptions and shared-secret internal bypass (`server/middleware/csrf.ts:131-183`) must remain constrained when repairing startup, not be broadened to make tests pass.

### SEC-06 — deployment security acceptance remains unverified

**Entrypoints/consumers:** ingress through Express, browser sessions, upload delivery, role/ownership routes and deployment configuration.

**Evidence:** trusted proxies include all private, link-local and loopback ranges (`server/middleware/cloudflare.ts:134-141`), consumed by `server/index.ts:176`. Session production detection includes `REPLIT_DEPLOYMENT`, but cookie `secure` depends only on `NODE_ENV` (`server/middleware/sessionConfig.ts:796-834`). The actual edge reachability/header sanitation and deployment environment determine safety. CORS production allowlisting is implemented (`server/safety/mandatoryMiddleware.ts:298-384`), not demonstrated broken.

Credential-bearing configuration values were deliberately not opened. The task proposal about plaintext `.replit` credentials is **not** proof of current leakage or remediation. No sanitized key-only inventory, repository-history secret scan, provider rotation evidence, edge tests, or cross-tenant test results were produced in this constrained audit.

**Impact:** public release requires affirmative evidence that direct ingress cannot spoof forwarding headers, cookies are Secure over the actual deployment, secrets are held outside shipped/tracked assets, and ownership/admin checks survive hostile requests. This is a verification gate, not an invented confirmed exposure.

## Repair playbooks

Choose one complete option per finding, adapting it to the validated production architecture. Each option is a distinct implementation path with its own five stages. Recommendations are not guarantees of a first-attempt fix.

### SEC-01 alternatives

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

### SEC-02 alternatives

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

### SEC-03 alternatives

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

### SEC-04 alternatives

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

### SEC-05 alternatives

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

### SEC-06 alternatives

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

## Examined-surface inventory and boundaries

**Examined:** current source in `server/routes.ts` for auth/session, reset, factor setup, Google callback, account deletion and router mounts; `server/auth.ts`; `server/middleware/auth.ts`, `sessionConfig.ts`, `csrf.ts`, `requestValidation.ts`, `cloudflare.ts`; selected `server/index.ts` initialization; `server/routes/admin.ts`, `security.ts`, `uploads.ts`, `customWorkflows.ts`, selected `socialMedia.ts`; `server/services/accountDeletionService.ts`, storage abstraction and JWT references; `server/storage.ts`; selected `shared/schema.ts`; CORS registration references.

**Already-present protections not relisted as missing:** reset tokens are hashed and atomically consumed (`server/routes.ts:2188-2229`); normal CSRF token comparisons exist; admin/security routers have role and assurance gates; custom workflow ownership is checked; upload tokens use HMAC and constant-time signature comparison (`server/routes/uploads.ts:90-134`), filenames strip path components (`:71-79`). These observations are not full end-to-end assurances.

**Unexamined/limited:** no exhaustive review of every route, ownership query, OAuth provider, websocket, upload parser/media processor, storage adapter, DNS resolver, JWT lifetime/rotation path, client persistence, SQL migration, schema relation, retention job or log sink. No runtime exploit, browser screenshot, live data inspection, network probe, load test, dependency CVE analysis or production credential-value inspection occurred. Session/factor changes require regression testing across recovery codes and all token issuers. Object retention, backups, legal holds, actual cascades, provider deletion, secret rotation/history and ingress policy remain deployment verification work. Self-healing engine and billing business logic were excluded. Historical task proposals and comments were checked against sampled current code where relevant and never used as proof of a defect or a completed repair.