# Deployment and operational readiness audit — 2026-09-19

## Blocker list

Read-only source audit. No release, settings change, dependency installation, application execution, live database/provider query, secret inspection, or load test was performed. Only this report was written. Prior task proposals and comments describing earlier successful deployments are not acceptance evidence. Production state is **unknown**, not presumed broken: the source deployment contract was inspected, but deployment metadata, actual image, provider settings, DNS answers and certificates were not queried.

Scope: build/release, `start.sh`, capsules, portability, resource sizing, health/readiness, monitoring, CI/load confidence and DNS/TLS. P1 means resolve before the affected production release; P2 means a lower-urgency improvement. No independently evidenced P0 in this scope. Alternatives below are choices, not four sequential phases of one solution. Each requires validation; none guarantees a first-attempt fix.

### DEP-01 — The active build does not establish a complete, current runtime artifact set

**CONFIRMED defect · P1 · scope: fresh builds, gateway-dependent features, relocation to minimal runtimes · confidence: high for build omission; medium for resulting outage in any particular deployment.**

- Actual entrypoint: `.replit:173-176` selects a VM, runs `bash start.sh`, and builds with `DEPLOY_PACK=1 npm run build`; `package.json:17,24` maps these commands. It does **not** select legacy `build.sh`.
- `script/build.ts:16-47` compiles frontend, server and cluster only. Its later packing step describes including existing `dist/gateway.mjs` and the Boosterstate binary (`script/build.ts:171-202`), not regenerating them. `start.sh:184-195,257-265` executes those artifacts. The workspace tracks `dist/gateway.mjs` and `bin/boosterstate`; presence is not source/build correspondence.
- Portable Node is preferred by `start.sh:27-38`, with a fatal exit if every candidate fails (`start.sh:77-86`). The active build has no Node bundling step; the old one is in `build.sh:17-51`. `.dockerignore:186-193` excludes `.node_bin`, while `script/lib/dockerignoreScan.ts:34-40` also deliberately leaves it outside the remainder capsule.
- Impact: gateway/Rust source edits can leave a release executing an older binary; a minimal runtime without a usable platform Node cannot boot. This is **not** proof the current live runtime lacks Node or that the checked-in binaries are currently stale. It is a missing reproducibility/provenance contract.

### DEP-02 — Python feature readiness can be permanently decided before its background runtime arrives

**CONFIRMED defect · P1 · scope: Python-backed audio/video features and enabled legacy sidecar on cold capsule boots · confidence: high for the race and fail-open build; runtime manifestation depends on timing.**

- `script/build.ts:77-114` downloads Python and installs floating package constraints, but catches failure, removes the runtime and continues the full-platform build. `start.sh:144-178` starts background restoration and immediately tries to activate Python without waiting.
- `dist/pdim-restore.mjs:726-732` restores Python in the background; background boolean results are not evaluated before announcing completion. This is distinct from the correctly checked critical tier at `dist/pdim-restore.mjs:709-725`.
- `server/services/pythonPath.ts:16-38` resolves the executable once at module initialization and exports fixed `PYTHON`/`PYTHON_AVAILABLE`; a later capsule completion does not refresh those constants. `start.sh:205-242` likewise attempts the optional legacy sidecar once.
- Impact: an otherwise valid Python capsule can arrive too late, leaving a process pinned to no Python or a system interpreter without the required modules until restart. Build-time Python failure can also ship a release missing advertised functionality. No claim is made that every Python consumer uses this helper or that the optional sidecar is enabled live.

### DEP-03 — Periodic readiness checks temporarily withdraw healthy instances and can overlap

**CONFIRMED defect · P1 · scope: `/ready`, `/readyz`, `/status` consumers and production readiness-based routing · confidence: high.**

- Entry: `server/index.ts:100-101` starts staged probes; `server/startup-probes.ts:287-308` launches an asynchronous run every 30 seconds without an in-flight guard and immediately assigns `phase = "connecting"`.
- `server/startup-probes.ts:357-364,446-461` returns readiness only for `phase === "ready"`, and otherwise HTTP 503. Consequently even a previously healthy instance becomes not-ready during every refresh.
- A check can exceed the interval: the database probe permits five 5-second attempts plus backoff (`server/startup-probes.ts:100-149`), and local MaxCore readiness polls for up to 60 seconds (`server/startup-probes.ts:235-258`). Concurrent generations mutate shared probe state.
- Impact: transient routing withdrawal, false alerts and out-of-order readiness decisions during slow dependencies. The present implementation does periodically refresh and does reject degraded status; historical “readiness never refreshes”/“degraded is ready” claims are not current findings.

### DEP-04 — CI does not enforce the shipped deployment lifecycle or the stated load-quality result

**CONFIRMED defect plus CAPABILITY GAP · P1 · scope: release promotion confidence for the complete web/worker/capsule platform · confidence: high for workflow semantics, unknown for repository branch-protection configuration.**

- `.github/workflows/ci.yml:153-169` runs the ordinary build without `DEPLOY_PACK=1`; artifact-presence checks use `test ... && echo success || echo missing`, so missing artifacts produce successful shell commands.
- `.github/workflows/ci.yml:281-304` starts `tsx server/index.ts`, not `start.sh`/the cluster/capsule runtime, and waits on always-live `/health` (`server/startup-probes.ts:402-403`), not route/dependency readiness.
- The CI summary prints failure but does not exit nonzero (`.github/workflows/ci.yml:321-345`). Individual failing jobs still fail; this is dangerous specifically if only the summary is required. Required status checks were not inspected.
- `tests/load/load-test.ts:105-109,232-252` hardcodes localhost, exercises a 60-second/50-user public-read workload, and exits successfully at 95% HTTP success without enforcing latency. Request execution has no timeout there. This cannot establish authenticated transaction/worker/soak capacity or tail-latency acceptance. `package.json:55-59` exposes that script as `test:load` and includes it in `test:all`.
- Impact: a green subset/summary or basic development-server test is insufficient evidence for packed cold boot, source-to-binary correspondence, sidecars, rolling shutdown or production SLOs. This audit does not claim all tests fail or that no other workflow performs useful tests.

### DEP-05 — Resource sizing is host-based and independently allocates shared capacity

**CONFIRMED portability defect; production capacity VERIFICATION GATE · P1 · scope: constrained containers/VMs and co-located app + MaxCore workers · confidence: high for calculation, medium for actual overcommit.**

- `server/computeSizing.ts:43-68` uses `os.cpus().length` and `os.freemem()`, not effective process CPU quotas/cgroup memory limits, and lets a positive override bypass all calculated bounds.
- App workers use the shared helper with a per-worker memory estimate (`server/cluster.ts:301-320`), but MaxCore requests all CPUs with `reserveCore:false` and no memory estimate (`server/services/maxcoreLocalSupervisor.ts:225-241`). Sharing the formula is not a shared resource reservation.
- `server/cluster.ts:347-355` gives each worker a minimum 512 MiB heap even when the calculated budget is smaller. `start.sh:294-300` independently permits a default 4 GiB primary heap.
- Impact: on quota-constrained hosts or simultaneous app/AI startup, the processes can collectively exceed the effective budget and trigger OOM, throttling or latency collapse. Existing worker heap clamping is acknowledged; it does not prove aggregate capacity safety. Purchased production resources and actual peak RSS/disk usage were not inspected.

### DEP-06 — Sentry silence watchdog never reaches its threshold if delivery has never succeeded

**CONFIRMED defect · P1 · scope: initial deployment or restart with an unavailable error-reporting transport · confidence: high.**

- Entry: `server/instrument.ts:266-278` schedules heartbeat attempts hourly. Every attempt overwrites `lastSentryHeartbeatAttemptAt` (`server/instrument.ts:204-206`).
- Before any success, `getSentryHeartbeatStatus()` measures silence from that **latest** attempt (`server/instrument.ts:240-252`), but the threshold is 24 hours (`server/instrument.ts:199-202`). Repeated failed hourly attempts keep age below the threshold.
- The independent page dispatch runs only when `isSilent` is true (`server/instrument.ts:281-305`). Thus a transport that has never succeeded does not page through this watchdog, although local warnings occur.
- Alert channels are also configuration-dependent (`server/monitoring/alertingService.ts:33-38,79-101`); actual delivery/recipient configuration remains a verification gate. This is not a claim that silence detection is absent: it exists and covers the post-success branch.
- Impact: operators can lose error visibility from the beginning of a release without the intended independent silence page.

### DEP-07 — Public-origin and custom-domain DNS/TLS acceptance remains unverified

**VERIFICATION GATE · P1 for an internet launch/custom-domain release · scope: published primary origin, storefront domains, callbacks/webhooks and certificate renewal · confidence: high that source cannot establish external readiness; no confirmed live DNS/TLS failure.**

- Primary VM deployment is declared at `.replit:173-176`, but this is workspace configuration, not proof of publication, visibility, routing, domain ownership or a valid chain.
- Custom storefront provisioning calls ACME at `server/services/storefrontDnsService.ts:720`; the renewal worker is registered at `server/index.ts:1150`. `server/services/acmeClient.ts:38-47` defaults ACME to disabled and the staging directory. These are appropriate safe defaults, **not proof of production misconfiguration**.
- `server/services/acmeClient.ts:517-568,587-595` contains renewal coordination/sweeps, but source cannot prove authoritative DNS delegation, CA challenge reachability, trusted certificate termination or successful renewal.
- `tests/smoke/post-deployment-tests.ts:15,85-100` allows a configurable URL and tests readiness, but does not by itself prove the complete domain/CA lifecycle.
- Impact if the gate is skipped: a valid application image can remain inaccessible, untrusted, privately gated against callbacks, or fail after certificate expiry. Platform-managed primary TLS and application-managed storefront TLS must be verified separately; enabling app ACME is not automatically the remedy for the primary origin.

## Repair playbooks

### DEP-01 alternatives — complete artifact contract

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

### DEP-02 alternatives — Python lifecycle

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

### DEP-03 alternatives — stable readiness

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

### DEP-04 alternatives — trustworthy release gates

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

### DEP-05 alternatives — enforce aggregate capacity

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

### DEP-06 alternatives — independent observability failure detection

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

### DEP-07 alternatives — externally verified DNS/TLS lifecycle

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

## Examined-surface inventory and boundaries

### Examined

- Safe allowlisted deployment fields only from `.replit:173-176`; no environment/secret sections were displayed.
- `package.json` command wiring; active `script/build.ts`; `script/lib/dockerignoreScan.ts`; capsule restore flow in `dist/pdim-restore.mjs`; legacy `build.sh` explicitly distinguished from the active build.
- `start.sh` Node selection, port-contract ordering, stub lifecycle, critical/background restore, Python activation, auxiliary processes and cluster launch; `.dockerignore` runtime exclusions.
- `server/cluster.ts`, `server/computeSizing.ts`, and MaxCore supervisor sizing call sites; workspace artifact tracking for gateway/Boosterstate.
- Staged startup probes, readiness responders, boot-stub purpose, health-registry/monitoring implementation surfaces, Sentry heartbeat and independent alert dispatch.
- CI build/integration/summary gates, load-test request/acceptance logic, post-deployment smoke readiness checks; workflow filenames were inventoried, not all native-platform workflows audited.
- Custom-domain ACME defaults, provisioning consumer, renewal registration and renewal sweep source.

### Existing protections not misreported as absent

- Active builds compile frontend/server/cluster rather than using legacy `build.sh`'s presence-only fast path.
- Capsule restoration has checksum processing, locking/staging and checked critical restore; app remainder restoration is already critical. This report does not revive earlier claims that app remainder restoration races cluster boot.
- Bootstrap port-contract scripts are intentionally retained outside the remainder capsule. No unverified port collision is alleged.
- Current image preflight includes payload/capsules and Nix closure accounting (`script/build.ts:205-230` and following implementation); the historical missing image-budget check is not a current finding.
- Readiness periodically refreshes and degraded dependencies are not labeled ready; current Sentry code already implements a silence watchdog. Findings identify remaining specific defects instead of restating obsolete tasks.

### Unexamined / not established

- No deployment metadata call, published URL lookup, production image download, logs/console inspection, DNS query, TLS handshake, provider configuration check, live DB query or secret-value inspection. Published build success, current visibility, region, resource tier and actual production health are unknown.
- No complete build, typecheck, test suite, browser screenshot, workload benchmark, external callback or renewal exercise was run. A screenshot would not verify this source-only infrastructure audit and was outside the assigned implementation/testing scope.
- No assertion of current binary staleness, actual OOM, present Sentry outage, broken DNS, missing production credentials or live certificate failure.
- Dependency vulnerability/package scans are excluded and owned by the main audit. Native desktop/mobile signing, app-store submission, application security, business correctness and provider-specific data flows require their assigned domain audits.
- Capsule member safety/integrity across every possible archive, production backup/restore, resource/disk budgets under real data, purchased monitoring coverage and full DNS/edge topology remain acceptance work. Historical reports and proposed tasks were not used as proof; all blocker assertions above derive from cited current source.