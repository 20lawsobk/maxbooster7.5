# Whole-Repository Readiness Catalog

**Review date:** 2026-11-14  
**Inspected branch and revision:** `review/pr-211`, `dae4682d370e4852b9cbefe00d0eba7fcb022248`  
**Revision subject/date:** `Update documentation and system maintenance scripts`, 2026-11-14T01:19:01Z  
**Initial working tree:** clean (`git status --porcelain=v2` returned no entries).

## Executive summary

This is an evidence-led static review of the tracked repository and selected
current source paths. It is **not** a runtime, provider, database, deployment,
or production-readiness certification. No tests, benchmarks, live endpoints,
external providers, migrations, publishing actions, or production data were
used. The source review found:

- A current conflict between the configured Replit start command and the
  documented development workflow.
- A scheduled social-generation service with no direct application call site
  found in the searched current source.
- An authenticated billing invoice route that converts a provider failure into
  an empty result, which the UI renders as “No invoices found.”
- An audio-job cancellation endpoint that does not purge completed output, and
  a media-safety gate that explicitly blocks the asynchronous studio-audio
  acceptance path.
- Open evidence gaps for source/consent health, role and provider journeys,
  independent backup recovery, account erasure, model certification, and an
  actual Replit publish.

The review does not claim every defect has been found. It assigns no readiness
percentage and does not conclude that the repository or a deployment is
production ready.

## Scope, inventory, and method

### Snapshot and inventory method

The snapshot was recorded before the catalog was added. Inventory used
`git ls-files -z`, counted tracked paths by top-level directory and extension,
and then traced the current entry points and relevant handlers in context.
Tracked-file inventory is exhaustive for the Git index at the inspected
revision; source-code reading was targeted, not a line-by-line review of every
tracked file.

There were **26,071 tracked files**. The largest top-level groups were:

| Tracked area | Files | Classification used in this review |
| --- | ---: | --- |
| `reports/` | 19,891 | Generated reports, snapshots, logs, evidence bundles, and historical review output; not current runtime proof by virtue of being present. |
| `external/` | 1,060 | Imported MaxCore and PDIM subsystems; treated as current code where wired from the active application, but distinct from root application source. |
| `client/` | 996 | Current web-client source and assets. |
| `server/` | 931 | Current application server and services. |
| `.pdim-scratch-external_maxcore-989/` | 614 | Tracked scratch/copy material, not treated as the canonical imported subsystem. |
| `tests/` | 597 | Test and evidence code; test names or fixtures are not proof of current runtime behavior. |
| `built-in plugins dsp/` | 429 | Plugin/DSP source and build assets. |
| `.agents/` | 274 | Agent instructions, skills, and project memory; not application runtime source. |
| `docs/` | 268 | Current documentation mixed with dated and archived material. |
| `scripts/` | 205 | Build, maintenance, test, and operational scripts. |
| `dist/` | 172 | Generated/compiled output; not treated as canonical source. |
| `shared/` | 64 | Current shared schemas and application contracts. |
| `migrations/` | 50 | Authored migration files; their presence does not show that a migration has been applied. |

`reports/` alone contains 11,567 `.html`, 2,415 `.txt`, 1,607 `.ts`, 1,574
`.json`, 966 `.xml`, and 630 `.md` files. Some reports contain generated
source, fixtures, logs, or compiled artifacts; they were not counted as
current implementation. The tracked tree also includes binary/plugin/media
assets, including `.rlib`, `.vst3`, `.dll`, images, audio, video, and PDFs.

The review distinguished:

- **Current application source:** `server/`, `client/src/`, `shared/`,
  `migrations/`, current build/start scripts, and wired portions of
  `external/maxcore/` and `external/pdim/`.
- **Tests and evidence:** `tests/`, test gates under `scripts/testing/`, and
  reports. Tests were read selectively but not run.
- **Generated or archived material:** `dist/`, report outputs, archive
  directories, historical documentation, retained build artifacts, and
  `.pdim-scratch-external_maxcore-989/`. These were not treated as current
  implementation without a traced link to active source.
- **Other subsystems and external boundaries:** plugin/DSP, DNS, video,
  hardware, model-serving, storage, Stripe, Too Lost, and social-platform code.
  Static source does not establish that external services, credentials,
  accounts, or deployment resources are currently available.
- **Untracked dependencies:** local installed packages are not part of the
  tracked-file inventory.

### Contracts and evidence reviewed

The review compared `replit.md`, `README.md`, `package.json`, `.replit`,
`replit.nix`, `docs/README.md`, `docs/ARCHITECTURE.md`,
`docs/DEPLOYMENT.md`, `docs/CONTRIBUTING.md`, the current continuation and
launch documents, the admin-gap catalog, current route/service code, relevant
tests and gates, selected readiness closure reports, and the project task
board. Historical reports are cited only as dated evidence with their source
revision; they are not current acceptance results.

### Status meanings

- **FAIL:** static evidence directly demonstrates a missing or contradictory
  behavior against the stated product or acceptance contract. This does not
  necessarily prove a live incident.
- **BLOCKED:** a required approval, operator-controlled resource, input, or
  runtime evidence is missing. This is not automatically a code defect.
- **UNVERIFIED:** current source or dated evidence is insufficient to establish
  the end-to-end behavior or current external state.
- **NOT APPLICABLE:** outside the stated target for this review.
- **PASS:** none assigned to end-to-end product journeys; no runtime checks
  were permitted or performed.

Each status applies to the specific assertion described in that finding, not
to every route or feature in the surrounding area.

## Journey status matrix

| User/operator journey | Status | Static finding and current evidence |
| --- | --- | --- |
| Replit development preview | **FAIL** | The configured workflow runs `npm run start`, while project instructions describe the same workflow as `npm run dev`. Actual preview behavior was not tested. See R-01 and updated proposed task #12. |
| Replit publish and deployed startup | **BLOCKED** | Active #114 and pending #118 cover the actual publishing path. This review did not publish or inspect a live deployment. See R-02. |
| Authentication, onboarding, standard and paid accounts | **UNVERIFIED** | An older page-80 report records limited isolated auth and CRUD evidence, but its source commit differs from this snapshot and many journeys were explicitly not proven by route rendering. Current acceptance remains in #83 and related work. See R-09. |
| Admin, billing, distribution, ownership and cross-account boundaries | **UNVERIFIED** | Current route code includes authentication and owner checks on sampled paths, but this review did not run an end-to-end role/tenant matrix. Task #16 remains proposed with corrected source paths. Stripe invoice error handling is a separate static failure in R-07. |
| Text generation and MaxCore model certification | **BLOCKED** | Active #115 is waiting for input; code and README distinguish model/runtime readiness from output quality. No model inference, training, or independent quality evaluation was performed. See R-03. |
| Scheduled social post generation | **FAIL** | The service methods are imported and exposed to a kill switch, but no direct invocation was found in current application call sites. Existing #105 covers reachability. See R-04. |
| Generated media delivery and privacy | **UNVERIFIED** | The MaxCore static `/uploads` mount excludes `analysis-inputs` but contains no per-owner authorization in that mount. Public reachability through the configured service boundary was not established. See R-05. |
| Asynchronous studio audio cleanup | **FAIL** | The audio-job DELETE route only marks nonterminal work cancelled; completed jobs are a no-op. The generation reliability gate explicitly says this path lacks a safe cancel-and-delete contract. See R-06 and existing #101/#104. |
| Awareness feeds, permission lifecycle, withdrawal, and current source health | **UNVERIFIED** | Existing source reports are revision-bound to older commits and task-board work remains open. No live feed or approval state was queried. See R-08 and #59/#60/#98/#99. |
| Off-source backup and instance-loss recovery | **BLOCKED** | The closure report says the independent destination, verified read-back, and isolated restore remain outstanding; a same-instance dump is not recovery proof. See R-10 and proposed #120. |
| Account-data removal and verified completion | **BLOCKED** | The closure report says policy, complete inventory, real adapters, and residual/backup suppression proof are absent; migration `0024` is authored but not applied. See R-11 and proposed #121. |
| Desktop/mobile application launch coverage | **NOT APPLICABLE** to the web/API deployment gate | This review does not certify desktop or mobile delivery. Separate product accessibility and navigation work remains represented by #84; this status is not a claim that those clients do not exist. |

## Prioritized findings

### R-01 — Replit preview command conflicts with documented mode

- **Priority:** P1 — blocks a reliable operator/developer preview contract.
- **Status:** **FAIL** for the command/documentation contract; preview runtime
  behavior is **UNVERIFIED**.
- **Affected journey:** Starting the application in Replit preview.
- **Evidence type:** Current configuration and documentation, static.
- **Evidence:** `.replit:1-3,35-40,73-92` sets Node 24, maps local port 5000
  to external port 80, keeps 8080 without an external mapping, and runs
  `npm run start` for the configured workflow. `package.json:15,30` maps
  `dev` to `scripts/start-dev.sh` and `start` to
  `scripts/start-production.mjs`. `replit.md:109-115` describes the same
  “Start application” workflow as Redis plus Express/Vite development mode and
  documents `npm run dev`. `docs/DEPLOYMENT.md:7-18` also gives Node 22 and
  `npm run dev` as the development contract.
- **Root cause / evidence gap:** The run button, workflow, and documentation
  disagree about whether preview is development or production. The external
  mapping itself is currently 5000→80; the older task #12 claim that 8080 is
  exposed externally is stale. No preview was started during this review.
- **User/operator impact:** A developer may launch a production path while
  expecting Vite development behavior, or rely on documentation that does not
  describe the configured command.
- **Dependencies:** Decide the intended preview mode; account for existing
  publishing/runtime alignment work in #118 and separate launcher work in #13.
- **Acceptance evidence:** Start the exact configured Replit workflow, verify
  the intended mode and visible application on port 5000, and confirm the
  documented command matches. Verify internal service ports remain private.
- **Existing work:** #12 was re-scoped to the current command/mapping facts;
  #13 separately addresses other launch commands and working directories.

**Remediation approaches**

1. Configure preview to run `npm run dev`, retain the current port mapping,
   and update the docs to match. **Recommended:** makes the Replit preview
   intentionally developmental without requiring a production build.
2. Keep `npm run start`, but document it as a production preview and require
   the correct build artifacts before launch. Tradeoff: slower iteration and a
   stricter build prerequisite.
3. Provide separate, clearly named development and production workflows with
   explicit commands and port checks. Tradeoff: more workflow configuration
   and a risk of selecting the wrong one.
4. Add one mode-selecting launcher that requires an explicit mode and dispatches
   to the existing dev or production command. Tradeoff: another lifecycle
   layer that must itself be maintained and tested.
5. Declare the existing workflow production-only and remove claims that it
   starts Vite development mode. Tradeoff: resolves the contradiction but
   leaves no configured development preview.

### R-02 — Replit publishing has no current end-to-end acceptance evidence

- **Priority:** P1 — publication must remain gated until readiness is proven.
- **Status:** **BLOCKED**.
- **Affected journey:** Build, publish, cold startup, and operator release.
- **Evidence type:** Current task state and documentation; no publish attempt.
- **Evidence:** `.replit:8-12` configures a build and `deployment:start`.
  `docs/DEPLOYMENT.md:3-5` explicitly says the documented entry points do not
  establish a running deployment's state. The current task board has active
  #114 “Restore Replit Publishing” and pending #118 “Systematically Resolve
  Publishing Failures,” with #118 dependent on #114.
- **Root cause / evidence gap:** No successful publish/cold-start result for
  the inspected revision was established. Build configuration and previous
  local evidence cannot substitute for the actual publishing builder and
  runtime.
- **User/operator impact:** A release could fail during build or cold startup,
  or be represented as available without proof.
- **Dependencies:** Resolve #114, then complete #118; publishing requires its
  separate operator authorization and release readiness.
- **Acceptance evidence:** Current revision builds in the configured Replit
  publish environment, the published startup reaches its declared readiness
  checks, logs show no unresolved startup failure, and an operator records the
  tested revision and result. This catalog did not execute those steps.
- **Existing work:** #114 and #118; no duplicate execution task created.

**Remediation approaches**

1. Rehearse the exact configured build and cold-start path, then publish only
   after a separate readiness and authorization decision. **Recommended:**
   preserves the real target environment and explicit release gate.
2. Run a non-publishing rehearsal in an isolated Repl with the same build
   configuration, then separately verify the actual publishing builder.
   Tradeoff: useful for diagnosis but does not prove publish success.
3. Have an authorized operator run the configured publish path and attach
   revision-specific build, startup, and readiness evidence. Tradeoff: depends
   on operator availability and does not isolate builder from runtime failure.
4. Add a staged/canary deployment only if an approved staging target exists,
   promote after smoke and rollback criteria pass. Tradeoff: requires a
   separately maintained environment; none was assumed to exist.
5. Keep publication closed and update release claims until the configured path
   is verifiable. Tradeoff: avoids a false success claim but delays release.

### R-03 — Model certification and quality are not established by readiness flags

- **Priority:** P1 — affects generation capability claims.
- **Status:** **BLOCKED** for the current certification work; runtime inference
  and quality remain **UNVERIFIED**.
- **Affected journey:** Training, model approval, serving, and user generation.
- **Evidence type:** Current documentation and task-board state; no training or
  inference run.
- **Evidence:** `README.md:65-74` says the default serving release is
  `live-awareness`, uses rolling observations, and explicitly states that
  runtime readiness does not assert general output quality. The generation
  reliability gate reads readiness and capability signals in
  `scripts/testing/generation-reliability-gate.mjs:164-179,225-239`; those
  signals are not a quality evaluation. Active #115 is blocked waiting for
  input; #102, #104, #108, #116, and #117 cover standard-account generation,
  surface acceptance, the active generation path, model-state restoration,
  and capacity.
- **Root cause / evidence gap:** No current revision-bound training lineage,
  independent quality result, or replacement-instance serving proof was
  established in this static review. The active training task is waiting for
  input; no missing-model runtime failure is inferred.
- **User/operator impact:** A readiness indicator could be mistaken for
  certification or reliable output quality.
- **Dependencies:** Authorized training inputs and owner approval; then
  #115/#102/#104 with #116/#117 where applicable.
- **Acceptance evidence:** Approved input lineage, repeatable training and
  evaluation reports, a deliberately gated promotion, actual standard-account
  inference across supported surfaces, honest failure behavior when capability
  is unavailable, and state restoration on a replacement instance.
- **Existing work:** #115, #102, #104, #108, #116, and #117; no duplicate task.

**Remediation approaches**

1. Obtain owner-approved training material, train a candidate, evaluate it
   independently against agreed quality and safety criteria, then promote
   through a recorded release gate. **Recommended:** keeps consent, provenance,
   and serving claims explicit.
2. If the intended product is live-awareness rather than a conventional
   checkpoint, certify that mode with held-out and longitudinal evaluations
   instead of claiming training completion. Tradeoff: requires suitable
   evaluation data and may not satisfy checkpoint-based consumers.
3. Restrict or disable generation surfaces that lack a currently verified
   modality/account capability. Tradeoff: reduces product coverage while
   preserving honest availability.
4. Separate model training/certification from application launch and expose
   explicit “not certified” status until the model gate passes. Tradeoff:
   launch can proceed only for unaffected non-generation journeys.
5. Keep generation unavailable until the owner supplies an approved candidate
   and independent evaluation. Tradeoff: safest when rights or quality inputs
   are unresolved, but postpones generation.

### R-04 — Scheduled social generator has no direct application call site

- **Priority:** P1 — advertised scheduled generation may not be reachable.
- **Status:** **FAIL** for the statically searched direct-call path; runtime
  or dynamic invocation is **UNVERIFIED**.
- **Affected journey:** User requests generated social content and schedules
  or publishes it.
- **Evidence type:** Current source search and call-graph trace, static.
- **Evidence:** `server/index.ts:1690-1697` imports
  `services/autoPostGenerator.js`; `server/index.ts:1802-1818` only registers
  kill-switch pause/resume callbacks. `server/services/autoPostGenerator.ts:535-603`
  defines `generateAndPostSocial`; lines 608 onward define the viral variant.
  No direct invocation of either method was found in the searched current
  `server/` or `client/src/` application paths.
- **Root cause / evidence gap:** Module initialization and kill-switch
  registration do not invoke the service. No direct request/worker path was
  found to generate and schedule from a user action.
- **User/operator impact:** The feature may be unreachable even though its
  generator module is loaded; manually triggering it could bypass intended
  ownership, scheduling, or idempotency controls.
- **Dependencies:** Existing scheduled-post persistence, user authorization,
  provider consent and connection state, durable job execution, and
  idempotency.
- **Acceptance evidence:** A real authenticated user request creates a durable
  owned job, the worker processes it once, schedule time and provider results
  are read back, and retries/foreign-user requests cannot duplicate or cross
  post.
- **Existing work:** Proposed #105 “Make scheduled social post generation
  reachable.”

**Remediation approaches**

1. Connect an authenticated user-facing request to a durable, owner-scoped
   scheduled job and worker, with idempotency and provider-result readback.
   **Recommended:** gives the feature a complete, auditable path.
2. Subscribe the generator to an existing durable job queue and make the UI
   create that job. Tradeoff: queue lifecycle and retries must be proven.
3. Add an explicit authenticated endpoint that validates connected accounts,
   consent, content, and schedule before enqueuing. Tradeoff: adds API surface
   and requires strong request validation.
4. Integrate the generator into the already-reachable scheduled-post service
   and remove duplicate scheduling ownership. Tradeoff: refactor may be broader
   but avoids parallel schedulers.
5. Remove/disable the unsupported scheduled-generation entry point until a
   real path is approved. Tradeoff: honest but reduces advertised functionality.

### R-05 — Generated-media static mount has no per-owner check in its handler

- **Priority:** P1 — privacy boundary requires proof.
- **Status:** **UNVERIFIED** for external reachability and cross-user access.
- **Affected journey:** Viewing or downloading generated media.
- **Evidence type:** Current MaxCore source; network exposure not exercised.
- **Evidence:** `external/maxcore/artifacts/ai-training-server/server.py:639-649`
  defines `_GeneratedAssetsOnlyStaticFiles.get_response`, denies only paths
  under `analysis-inputs`, then mounts the directory at `/uploads`. The mount
  itself does not check an owner or authenticated user. The app’s configured
  port mappings mark MaxCore’s port private, but this review did not test its
  proxy routes, deployed network boundary, or asset URL behavior.
- **Root cause / evidence gap:** A static handler decides by path, not by
  authenticated owner. Whether supported app routes expose those URLs or
  another boundary gates them is not proven here.
- **User/operator impact:** If an unowned asset URL is reachable, generated
  media may be readable by someone other than its owner. This is a risk
  requiring a bounded access test, not a proven public exposure claim.
- **Dependencies:** Existing private-storage and generated-media work in #101;
  the per-modality acceptance gate in #104.
- **Acceptance evidence:** For each modality, owner can retrieve an authorized
  object; unauthenticated and different-owner requests are denied; delete and
  expiry revoke access; no direct static path bypasses the owner check.
- **Existing work:** #101 and #104.

**Remediation approaches**

1. Serve generated objects through an authenticated, owner-checked storage
   handler and close the generic static mount to private outputs.
   **Recommended:** makes authorization explicit at the read boundary.
2. Keep private object storage and issue short-lived, owner-authorized signed
   URLs with deletion/revocation semantics. Tradeoff: URL leakage remains
   possible until expiry and signing policy must be tested.
3. Proxy media bytes through the authenticated application API. Tradeoff:
   simplest access policy, but adds bandwidth and server load.
4. Use per-owner private buckets/keys with an access service that verifies
   owner and object metadata. Tradeoff: robust isolation but more storage
   configuration and operational complexity.
5. Remove public access to generated outputs and only expose intentionally
   shared assets through an explicit consented-public route. Tradeoff: breaks
   existing direct links until consumers migrate.

### R-06 — Completed asynchronous audio jobs have no purge contract

- **Priority:** P1 — media retention and cleanup acceptance.
- **Status:** **FAIL** for the audio-job DELETE behavior and deterministic
  studio-audio acceptance path.
- **Affected journey:** Canceling or removing a generated studio audio result.
- **Evidence type:** Current source and current acceptance-gate text, static.
- **Evidence:** `external/maxcore/artifacts/ai-training-server/server.py:12578-12589`
  requires job ownership, but only changes nonterminal audio jobs to
  `cancelled`. A completed job returns `action: "no_op"` without deleting the
  output or job record. The video endpoint at
  `server.py:12431-12459` has a separate terminal purge path; audio does not.
  `scripts/testing/generation-reliability-gate.mjs:152-157,243-255` explicitly
  blocks the asynchronous studio-audio case because it lacks a safe
  cancel-and-delete / verified cleanup contract.
- **Root cause:** Audio cancellation semantics do not include owner-requested
  deletion of completed job metadata and output. The periodic janitor at
  `server.py:666-737` is a time/size-based file sweep, not a per-owner
  deletion receipt.
- **User/operator impact:** A completed output may remain stored after the
  user requests cancellation/removal; the safety gate correctly refuses to
  treat the path as accepted.
- **Dependencies:** Storage ownership and lifecycle work in #101; generated
  surface acceptance in #104.
- **Acceptance evidence:** An owner can purge a completed, errored, or
  cancelled job; output bytes and metadata are removed or made immediately
  inaccessible; repeated deletes are idempotent; a different owner cannot
  delete it; cleanup failures are reported and do not claim success.
- **Existing work:** #101 and #104.

**Remediation approaches**

1. Implement an owner-checked purge operation that deletes output, job
   metadata, and durable references with verified acknowledgement.
   **Recommended:** meets explicit deletion and honest failure semantics.
2. Introduce a centralized artifact registry with owner, job, object, and
   retention state; make deletion revoke access first, then verify physical
   cleanup. Tradeoff: stronger cross-modality consistency but broader change.
3. Use a soft-delete/write fence followed by a durable background purge with
   receipts and retry state. Tradeoff: supports recovery from transient storage
   errors but needs an explicit pending-deletion status.
4. Adopt an approved time-limited retention policy and clearly expose the
   retention window rather than offering immediate deletion. Tradeoff: only
   valid if product and privacy requirements permit delayed removal.
5. Keep the asynchronous studio-audio path disabled until cleanup evidence is
   available. Tradeoff: preserves safety but removes that path from current
   user functionality.

### R-07 — Billing invoice provider failures are rendered as empty history

- **Priority:** P1 — financial history must distinguish error from no records.
- **Status:** **FAIL**.
- **Affected journey:** A signed-in user views billing invoices and history.
- **Evidence type:** Current route and UI source, static.
- **Evidence:** `server/routes/billing.ts:2258-2275` returns an empty invoice
  collection for a user without a Stripe customer or when Stripe is unavailable.
  More importantly, lines 2277-2358 catch invoice-list errors, log a warning,
  and return `{ invoices: [], hasMore: false }`. The same file’s `/history`
  route at lines 757-800 returns `[]` after a provider error; payment-method
  and disputes reads also convert provider failures to empty/null values.
  `client/src/components/billing/InvoiceStatus.tsx:97-107` derives
  `data?.invoices || []`, does not read the query error state, and renders
  “No invoices found” at lines 212-220.
- **Root cause:** Provider failure is represented using the same successful
  empty shape as a genuine zero-invoice result; the UI cannot distinguish them.
- **User/operator impact:** Users may believe no invoices exist or miss a
  billing issue while the provider is unavailable.
- **Dependencies:** Stripe provider response handling, shared invoice contract,
  and client query error state.
- **Acceptance evidence:** Separate tests cover no Stripe customer, successful
  zero results, successful invoice results, provider outage, malformed result,
  and retry. Provider failure produces a visible unavailable/error state and
  never a false empty-history state; owner scoping and safe diagnostics remain.
- **Existing work:** Proposed #122 “Show invoice lookup failures instead of
  claiming none exist.” Proposed #16 concerns authorization and tenant
  isolation; it does not cover false-empty provider results.

**Remediation approaches**

1. Return a non-success response for provider failure and render an explicit
   error/retry state in the invoice UI; keep real zero results as empty.
   **Recommended:** preserves the existing clear distinction at the HTTP
   boundary.
2. Use a typed response state such as `available`, `empty`, or `unavailable`,
   and render each state explicitly. Tradeoff: schema changes must be propagated
   to all clients.
3. Retain the last successful invoice list with an age and a visible stale-data
   warning when refresh fails. Tradeoff: useful during outages but requires a
   durable cache and must never imply that stale data is current.
4. Centralize invoice reads behind one adapter returning an explicit
   success/failure result, then use it for `/history` and `/invoices`.
   Tradeoff: reduces drift but expands test and migration scope across current
   consumers.
5. Surface provider failure with a request identifier and safe diagnostic
   status while retaining a separate “no account/no invoices” state.
   Tradeoff: adds supportability and response-contract work without caching.

### R-08 — Awareness source and withdrawal state is not current acceptance proof

- **Priority:** P1 — source permission and provenance affect model inputs.
- **Status:** **UNVERIFIED**.
- **Affected journey:** Source approval, feed collection, withdrawal, and
  awareness-backed generation.
- **Evidence type:** Dated reports and current task board, not live source calls.
- **Evidence:** `reports/admin-gap-audit/2026-11-12/page80-rebased/page80.json`
  records source revision `16e53e0d64ceba3b10165dc99eeb65e619365bf4`, not this
  catalog’s `dae4682...` revision, and its decision is
  `PASS_WITH_UNTESTED_CATEGORIES`. Other `reports/admin-gap-audit` awareness
  reports are also revision-bound snapshots. The current board has proposed
  #59 (feeds returning 404), #60 (source failure visibility), #98 (renew source
  approval when policy changes), and #99 (exclude withdrawn observations).
- **Root cause / evidence gap:** The repository contains older source-state
  reports and open lifecycle work, but this review cannot establish which feeds
  currently succeed, what permissions are active, or whether withdrawn
  observations are excluded from current generation.
- **User/operator impact:** Stale or withdrawn material could be treated as
  current without a revision-bound source and permission record; conversely,
  stale reports could overstate current failures.
- **Dependencies:** Owner/source approvals, feed providers, source-health
  ingestion, and the MaxCore training/generation gate.
- **Acceptance evidence:** Revision-bound per-source state, actual feed
  timestamps and outcomes, approval/policy version and expiry, a tested
  withdrawal/tombstone path, and proof that withdrawn observations cannot enter
  generated outputs.
- **Existing work:** #59, #60, #98, #99, and related model work #115.

**Remediation approaches**

1. Maintain a versioned source registry linking each source to owner approval,
   policy version, expiry, adapter health, and withdrawal state; fail closed for
   expired or withdrawn inputs. **Recommended:** makes consent and provenance
   first-class.
2. Retire persistently failing feeds and keep only explicitly approved,
   currently observable sources. Tradeoff: simpler and safer but reduces
   awareness coverage.
3. Separate source-health collection from model generation and publish
   per-source success/failure timestamps before any source is eligible.
   Tradeoff: adds an operational service and does not replace approval records.
4. Require manual review for source changes and withdrawal with a durable
   audit trail. Tradeoff: strong control but slower and operator-intensive.
5. Disable awareness-backed generation whenever the current source/permission
   snapshot is unavailable or stale. Tradeoff: safest during uncertainty, with
   lower availability.

### R-09 — Role and provider workflows lack current whole-journey evidence

- **Priority:** P1 — account, billing, and distribution controls affect users
  and money.
- **Status:** **UNVERIFIED**; no vulnerability or provider outage is asserted.
- **Affected journey:** Free/paid/admin accounts, billing, distribution, and
  Too Lost provider operations.
- **Evidence type:** Current code presence plus dated test report and task
  states; no HTTP/provider test was run.
- **Evidence:** Sampled code includes `requireAuth` and user-scoped billing
  reads in `server/routes/billing.ts:757-803`, and distribution release
  ownership checks in `server/routes/distribution.ts:837,923-934`. Their
  presence is not proof of every handler. The page-80 report dated
  2026-11-12 explicitly marks numerous business journeys
  `NOT_PROVEN_BY_ROUTE_RENDER`, and is from an older source revision. Proposed
  #16 covers billing/distribution access tests; #83/#84 cover account journeys
  and navigation; active #95 is blocked waiting for Too Lost sandbox input.
- **Root cause / evidence gap:** No current, role-by-role, cross-user HTTP
  acceptance result was collected. The provider sandbox cannot be verified
  while its task is blocked by missing user input.
- **User/operator impact:** A route may be correctly guarded in code but lack
  proof across real mounting, sessions, CSRF, ownership, durable mutations,
  provider scopes, and failure outcomes.
- **Dependencies:** Disposable account fixtures and owner-authorized provider
  sandbox access; keep production data and provider writes out of testing.
- **Acceptance evidence:** Authenticated and unauthenticated paths for each
  role, foreign-owner negative cases, durable readback after valid mutations,
  no partial state after failures, provider scope/error evidence, and a current
  test revision attached to the result.
- **Existing work:** #16 (source paths corrected), #83, #84, #95, and #109.

**Remediation approaches**

1. Build a table-driven authorization contract against the mounted application
   routes for every role and ownership boundary, including durable readback.
   **Recommended:** proves actual route behavior without relying on helper-only
   tests.
2. Run separate isolated end-to-end journeys for standard, paid, and admin
   accounts across signup, settings, billing, and distribution. Tradeoff:
   closest to user behavior but slower and more fixture-sensitive.
3. Add systematic foreign-user read/write attempts for every sensitive route,
   plus CSRF/session expiry and retry tests. Tradeoff: strong negative coverage
   but does not by itself prove all positive user journeys.
4. Verify Too Lost separately against an authorized sandbox account and record
   exact scopes and read/write outcomes. Tradeoff: provider-specific and
   dependent on owner-supplied access; it does not certify other providers.
5. Keep unverified billing or distribution operations unavailable to
   unsupported roles until their acceptance gates pass. Tradeoff: least
   exposure but reduces functionality while proof is incomplete.

### R-10 — Independent backup and instance-loss recovery remain blocked

- **Priority:** P0 — data loss recovery is a critical operator capability.
- **Status:** **BLOCKED**.
- **Affected journey:** Recovery after application-instance or backing-storage
  loss.
- **Evidence type:** Current tracked closure report and source contract; no dump,
  upload, live database query, or restore occurred in this review.
- **Evidence:** `reports/readiness-implementation/closure-backup.md:51-65`
  says the current dump primitive returns bytes/checksum and marks durability
  `uncommitted`, while a separate durable path requires destination upload,
  read-back, and verified catalog state. Lines 80-88 identify the missing
  independently recoverable destination and isolated restore; they also record
  prior configured target checks returning HTTP 403. This is historical
  operator evidence, not a new connectivity check. The active code paths are
  under `server/services/backup/` and `server/services/storageService.ts`.
  Proposed #17 is a different task about PDIM API storage failures/restarts;
  it is not off-source backup acceptance.
- **Root cause / evidence gap:** No currently verified independent destination
  and restore result is recorded. A dump, checksum, or restart on the same
  instance does not prove recovery after losing that instance.
- **User/operator impact:** User data may not be recoverable after loss of the
  application instance or its storage.
- **Dependencies:** Operator-approved independent destination and access,
  isolated recovery target, database/object inventory, and a separately
  authorized restore test.
- **Acceptance evidence:** Destination read-back matches a cryptographic digest;
  isolated restore recovers database and related objects; owner boundaries,
  row/object counts, and application invariants pass; a deliberate
  instance-loss simulation proves the backup is not dependent on the source
  instance; failures do not report “verified.”
- **Existing work:** Proposed #120 “Restore trustworthy account backups after
  data loss”; #17 remains the separate PDIM API task.

**Remediation approaches**

1. Use an operator-approved destination independent of the application and
   database, with checksum read-back and isolated restore acceptance.
   **Recommended:** directly proves the required recovery property.
2. Store encrypted, versioned backups in a separately administered object
   store and run periodic isolated restores. Tradeoff: requires independent
   access lifecycle and storage costs.
3. Use an approved managed database backup/export service plus separately
   retained object backups, then test cross-service restore. Tradeoff: provider
   coupling and potentially different retention windows.
4. Maintain immutable offline snapshots with scheduled restore drills.
   Tradeoff: strong separation but slower recovery and more operator handling.
5. Keep backup status explicitly unavailable and do not promise recovery until
   a verified independent destination exists. Tradeoff: honest but leaves the
   recovery gap unresolved.

### R-11 — Account erasure is intentionally incomplete pending policy and proof

- **Priority:** P0 — privacy requests must not report false completion.
- **Status:** **BLOCKED**.
- **Affected journey:** User requests account/data removal and receives final
  status.
- **Evidence type:** Current tracked closure report and source/migration
  inspection; no migration or deletion was performed.
- **Evidence:** `reports/readiness-implementation/closure-erasure.md:5-11`
  labels source work partial and production acceptance blocked, with no approved
  retention matrix, complete subject inventory, or hold authority. Lines
  25-43 describe workflow safeguards, missing production adapters, and the
  absence of a completion transition. Lines 61-97 require migration review,
  approved authority, complete inventory, write fences, real provider receipts,
  backup/restore suppression, and real database/provider acceptance.
  `migrations/0024_account_erasure_workflow.sql` is authored but not applied.
- **Root cause / evidence gap:** Destructive completion must wait for policy,
  full data-system inventory, and verified handling of residual data and
  backups. The current workflow intentionally has no default deletion authority
  or completion transition.
- **User/operator impact:** Deleting too early risks retained copies, racing
  writes, broken legal/financial records, or a false completion claim; doing
  nothing without a visible status also leaves requests unresolved.
- **Dependencies:** Owner-approved policy/holds, inventory of every data
  processor and copy, migration review, authenticated write fences, adapters
  with verified receipts, and restore-time suppression.
- **Acceptance evidence:** Isolated database and processor tests prove
  owner-scoped deletion, races/retries/restarts, receipt reconciliation,
  residual handling, and backup restore suppression. User-visible status only
  reaches complete after every required system has verified evidence. No
  production deletion or migration is part of this catalog.
- **Existing work:** Proposed #121 “Let users request data deletion with
  approved safeguards.” #99 concerns withdrawn awareness observations, not
  account erasure.

**Remediation approaches**

1. Obtain approved retention/hold policy and a complete data inventory, then
   implement a durable owner-scoped deletion workflow with verified adapters
   and no completion transition until residual and backup suppression checks
   pass. **Recommended:** preserves authority, integrity, and honest status.
2. Begin with app-owned database and object storage only, explicitly report
   external processors as pending, and do not claim whole-account completion
   until each is integrated. Tradeoff: smaller scope but incomplete status must
   remain clear to users.
3. Use a reviewed, operator-assisted workflow with per-system receipts while
   provider adapters are unavailable. Tradeoff: enables controlled handling
   but is slower and still requires the same authority and audit rules.
4. Keep requests pending behind a durable write fence until policy and
   processor boundaries are ready. Tradeoff: prevents new data while waiting
   but requires an approved policy for when and how to fence.
5. Defer automated deletion and clearly expose request status and missing
   prerequisites until approved policy exists. Tradeoff: avoids unsafe
   destructive behavior but does not complete user requests.

## Existing work reconciliation and execution queue

Implementation is not authorized by this static catalog. Proposed tasks below
must be approved before their implementation work starts. Existing active or
proposed tasks remain in their current states; this review did not run them.

| Finding | Existing project work | Queue decision |
| --- | --- | --- |
| R-01 Preview command/mode | #12, #13 | Updated proposed #12 to match the actual 5000→80 mapping and current `npm run start` command; #13 remains separate launcher/working-directory work. No duplicate created. |
| R-02 Publish evidence | #114 active; #118 pending on #114 | Existing work covers the publishing/cold-start path. No publish attempt or duplicate task. |
| R-03 Model certification | #115 active and blocked for input; #102, #104, #108, #116, #117 | Existing training, generation, restoration, and capacity work retained. No model action. |
| R-04 Scheduled social generation | #105 proposed | Existing task covers unreachable generation; no duplicate. |
| R-05 Media privacy and R-06 cleanup | #101, #104 proposed | Existing private-storage/cleanup and acceptance tasks cover both findings; no duplicate. |
| R-07 Billing false-empty errors | #16 proposed | Not equivalent: #16 covers authorization and cross-user access. New bounded task #122 covers error-vs-empty behavior and UI. |
| R-08 Awareness source lifecycle | #59, #60, #98, #99 proposed; #115 active | Existing tasks cover feed restoration, failure visibility, approval renewal, withdrawal exclusion, and model inputs. No duplicate. |
| R-09 Roles/provider journeys | #16, #83, #84 proposed; #95 active and blocked for input; #109 proposed | Existing coverage tasks retained. #16’s paths were corrected to current root application files. No provider call or duplicate. |
| R-10 Independent backups | #17 proposed is a distinct PDIM API durability task | New proposed #120 covers independent backup, restore, and instance-loss recovery. #17’s source references were corrected to the current `external/pdim/` tree. |
| R-11 Account erasure | No equivalent project task found; #99 is awareness withdrawal only | New proposed #121 covers policy-gated account erasure and honest completion. |

The proposed execution queue is:

1. **#120 — Restore trustworthy account backups after data loss.** Prove an
   independent destination, checksum read-back, database/object restoration,
   and instance-loss recovery without production data mutation.
2. **#121 — Let users request data deletion with approved safeguards.** First
   obtain approved policy and complete inventory; then verify authorized
   per-system deletion and backup/restore suppression before any completion
   claim.
3. **#122 — Show invoice lookup failures instead of claiming none exist.**
   Separate provider errors from legitimate empty history in both route
   contract and UI; test error, no-customer, zero-result, retry, and ownership
   cases.

Other current task references were corrected without changing source code:

- **#12** no longer asserts that port 8080 is externally mapped; current
  `.replit` maps 5000→80 and leaves 8080 without an external mapping.
- **#16** now points to current root route and test files instead of the
  missing `imports/maxbooster7.5/` snapshot paths.
- **#17** now points to current imported source under `external/pdim/`, not the
  missing `imports/maxbooster7.5/` copy.

These metadata corrections keep proposed work executable; they do not imply
that the tasks were implemented or that their acceptance criteria passed.

## Verification boundary

This catalog was created without changing application source, tests,
configuration, production data, credentials, provider state, migrations,
publishing state, or deployment state. The only project changes are this report
and the task-description corrections/proposed task records listed above. No
automated tests, benchmarks, browser checks, service calls, database queries,
builds, training, media generation, or publish operations were performed.

Static evidence can identify source-level gaps and contradictions, but cannot
establish live network reachability, external provider availability, actual
user-visible behavior, data durability, deployment health, model quality, or
that all defects have been found. Completion requires the relevant proposed
execution task to be approved and its stated acceptance evidence to be
collected.
