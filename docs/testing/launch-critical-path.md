# Exact launch critical path and seven-level execution roadmap

Reconciled October 28, 2026, America/Detroit. This extends the existing
[governing plan](completion-execution-plan.md),
[80-declaration schedule](platform-work-schedule.md) and
[complete platform ledger](platform-completion-plan.md). It does not restart
their work, replace their sections or turn a plan into launch approval.

The latest completed integrated source is `10d19267`, with unchanged digest
`cbf794e080119fa4f64ec6ebce2b29b3d78641d606a3059c0c207b2420324418`.
Its [retained history](../../reports/test-verification/history/2026-10-28-10d19267-master/README.md)
records the actual passing executable scopes and failed coverage/feature gates.
The [earlier failures](../../reports/test-verification/history/2026-10-27-before-awareness-release-isolation/README.md)
remain intact. Read every receipt's source hashes before using it as current
evidence; a passing focused scope does not certify the whole platform.

## Complete work set and seven levels

The existing machine ledger is the authoritative enumeration. At reconciliation
it has 80 page declarations, 2,162 business sections, 12,972 business-dimension
steps, 33,549 required feature checks, 170 mapping-resolution tasks and 53,020
total work items. Re-generation may add newly found work; it may not discard an
unverified feature because it lacks a convenient test fixture. Current counts
and status are reproduced by the [launch audit](launch-readiness-audit.md).

The following is the exact expansion rule for **every** existing page section,
including repeated source consumers and aliases. Each instruction remains
addressable by its existing ID and JSON pointer rather than being replaced by
a representative example.

| Level | Required identity and content | Execution/closure rule |
| --- | --- | --- |
| 1 — milestone | `M0` through `M9` below | A milestone closes only after every prerequisite and assigned deliverable passes its explicit acceptance gate. |
| 2 — deliverable | Page declaration ID in its existing wave, or one of the 20 shared subsystem IDs below | Retain the page's exact registered path and every section. Global work remains assigned even without a routed consumer. |
| 3 — feature | Existing `pageId/sectionId` business-section work item; exact required-check, frontend-consumer, mapping, file or subsystem item for global work | Read the full section and its actual source/callers; resolve candidate bindings before implementation. A source heading is a work pointer, not completed behavior. |
| 4 — component | Every section `sourceFiles` entry, enumerated control, referenced frontend contract, backend declaration, schema, service, worker and shared dependency | Trace exact process, mount, method/path, middleware, identity, storage and output. Resolve inherited, dynamic and conditional behavior; record missing mappings. |
| 5 — implementation task | Each of the six existing `workSteps` IDs and every instruction at its `exactInstructionsPointer`, plus each referenced work item | Reproduce any defect, implement the smallest coherent fix, preserve contracts, and add meaningful behavior assertions. No instruction or referenced entity is satisfied by a shell render. |
| 6 — validation | Exact current-source cases for each applicable criterion in the validation table below and the section's own instructions | Require real command/exit, matching source hashes, named case identity, exact result/state/bytes, raw counters and owned-fixture cleanup. Missing, skipped, stale and blocked evidence do not pass. |
| 7 — production acceptance | Existing section `acceptance`, all referenced required checks, applicable deployed/client/provider gates and all page domains in the audit | All required criteria pass with valid evidence, no unresolved blocker, and dependencies remain valid. Only then may this exact page declaration become Green. |

For example, the existing AIDashboard section
`page-ad4acc42ba6a751c/section-1329be7864863173` retains its real insufficient
history/public-context/statistical-limit work. Its six IDs end in
`frontendWork`, `backendWork`, `validationPermissionsSecurity`,
`durableProviderGenerationJourneys`,
`failureAccessibilityMobileI18nPerformance` and `evidenceNeeded`. Each points
to its own nonempty instructions. The same expansion applies to all 2,162
sections; the example is not a substitute for the remaining 2,161.

The global ledger's other item kinds are also mandatory: all
`registered-required-check`, `frontend-consumer-journey`, `measured-coverage`,
`mapping-resolution`, `source-config-asset-contract` and
`shared-subsystem-contract` items. Four coverage metrics produce separate
work items for each measured file. A metric pass does not close its behavioral
contract. A file may be retired only after caller/reachability evidence and a
reviewed source change; exclusions cannot substitute for testing.

## Exact milestone order, dependencies and checkpoints

Independent deliverables may execute concurrently only with disjoint ownership
and enough isolated resources. The final master, bounded load, native packaging
and capsule preparation are serialized on this four-CPU executor.

| Order | Milestone and exact deliverables | Prerequisites | Validation and production acceptance | Risk/rollback boundary |
| --- | --- | --- | --- | --- |
| M0 | Preserve current state: branch/HEAD, dirty source hashes, earlier complete master, failed release, focused receipts, all-page inventory and issue ownership. Generate the full status/gap/roadmap audit. | Existing repository and receipts | All 80 IDs, prior section IDs, dimension steps and global IDs remain represented; every assertion has source/time/scope; missing evidence is explicit. | High risk of stale or overstated evidence. Preserve immutable histories; never edit an old failure into a pass. |
| M1 | Finish reproduced shared defects: patched nested-install fixture; required-awareness transport classification; runtime-upload release exclusion; generated-asset isolation; five authoritative Python assertion helpers; demonstrated Linux ASAR/TFJS/Sharp packaging defects. | M0; actual reproductions and disjoint source ownership | Positive and adverse contracts pass; the same false-oracle probes fail for the intended AssertionError; upload state is unchanged; native module ancestry/resources execute. Full desktop launch remains open until its independent gates pass. | High security/data-integrity risk. Minimal coherent source changes, source-bound regressions, preserve baseline failures and previous payloads. Never ship secrets or disable the product browser sandbox. |
| M2 | Freeze every source/configuration/test input; register new files in Git discovery; regenerate endpoint audit, test catalog, exact-link candidate digest and all-page plan. Independently review source and proof. | M1 source ownership released | Discovery has no missing new suite; candidate maps retain exact semantics; all 80 page analyses match source or are explicitly stale; no silent coverage denominator changes. | High provenance risk. Reopen freeze on a necessary source change and recapture evidence; do not patch manifests to conceal drift. |
| M3 | Execute one complete stable-source master, including unchanged 100% thresholds, real database/commerce/native scopes, browser/HTTP/80-page observations, existing bounded-load limits, operations/types/lint/audits and strict evidence gates. | M2; no competing heavy work | Each command's real exit, cases/skips/blocks, cleanup and before/after source identity retained. Any failure is triaged before claiming its scope passed. | High false-confidence risk. Archive prior raw results before overwrite. Preserve measured latency failures rather than widening limits. |
| M4 | After M3 completes, prepare/verify/cold-start/verify the actual release in an owned publishing copy. Capture full admitted-source inventories and common-code digests before and after; independently audit payload members and shutdown. | M3 completed; all admitted release inputs frozen; available CPU/disk | All four commands pass; hashes/restore/runtime/child ownership match; runtime uploads and scratch are excluded precisely; actual startup readiness is truthful; all owned descendants terminate. | High packaging/state leakage risk. Four threads may use idle CPUs with existing zstd level 19. Rebuild all policy-invalidated caches normally. Keep historical payload/receipts; never run destructive publishing scripts in the source checkout. |
| M5 | Complete shared source contracts and measurement before/alongside dependent page waves: identity/tenant authority; Neon/PDIM/jobs; public awareness and each generation engine; commerce/provider adapters; monitoring and supply chain. Execute C1, initial C5 provenance, then C2–C6 batches in the governing plan. | M3 failures triaged; M4 source-bound result known; each task's concrete dependency | Exact successful/adverse/owner/concurrent/recovery assertions pass; all source counters are real and compatible; privacy and error contracts remain enforced. Missing live provider or engine evidence stays open. | High cross-page blast radius. Keep changes small, preserve previous compatible readers, retain durable journals and fenced leases. Re-run affected regressions after each task. |
| M6 | Execute every section/control/backend of all 80 declarations in the existing six-wave schedule, with all frontend/backend/integration/security/accessibility/locale/performance requirements. Work every unrouted/global item as well. | Relevant M5 dependency gates, not merely an available page shell | Every exact feature check and six section dimensions have current proof; each alias has its own routing/access/reload evidence; all page domains pass. Verified count and denominator update after every batch. | High omitted-feature risk. All named rows remain visible; source binding changes reopen affected evidence. No mock, render or import may certify a broader journey. |
| M7 | Finish deployment/client/recovery/capacity acceptance: actual Replit HTTPS identity; ordered Neon migrations with writer drain and joint recoverable backup; enabled signed provider flows; all advertised clients/native/plugin targets; representative topology/capacity and operations. | Concrete tested release and migration package; applicable M5/M6 contracts; actual environment/device/source/account prerequisites | Owned canaries prove real delivery/state/bytes/owner boundaries and recovery. Per-OS/device/native evidence passes. Capacity meets declared workload/latency/errors on the identified topology. Actual source and deployment identity agree. | Critical production data and availability risk. Follow the concrete migration/recovery runbooks and required production-change authorization. Never infer production authority or missing account facts. |
| M8 | Final source freeze and full integrated master, compatible 100% language/source coverage, all 80-page feature/QA/accessibility acceptance, current release cold verification, deployed/provider/recovery/capacity regression and evidence audit. | All M5–M7 required tasks complete | Every required gate passes from compatible current source; zero unresolved production blocker or invalid/stale acceptance link; 80/80 declarations Green with proof. | Critical launch-decision risk. Any failed or unknown required gate is NO-GO and reopens its owning milestone. Source changes invalidate affected measurements and package identity. |
| M9 | Commit/push the full source/tests/results/instructions normally; verify remote ref and concrete launch decision; promote main only under the owner's production-ready condition. Preserve rollback/recovery artifacts and operational handoff. | M8 actual GO, plus authorized release action | Verified remote commit, exact release/migration identity and retained acceptance evidence. Launch approval is granted only when the required gates pass; a push alone grants nothing. | Critical irreversible release risk. No force push. Retain prior compatible payload and backup; post-migration rollback cannot use writers that omit the new fences/journals. |

The **current immediate critical path** is M1 native completion and independent
oracle review → M2 source/catalog/map freeze → M3 uncontended full sweep → M4
serialized cold release. Those checkpoints expose the next concrete blockers;
they do not erase the remaining M5–M9 scope. A failing known source contract
takes priority over an arbitrary uncovered line. Once shared defects pass,
coverage and exact end-to-end acceptance remain mandatory critical work, not
optional cleanup.

No credible completion date is assigned to unknown external prerequisites or
tens of thousands of unverified work items. Measured prior timings guide
resource allocation: the latest master took 22m38s; the failed two-thread
preparation took 23m37s. Four idle preparation threads may improve throughput,
but that is not an unmeasured timing promise.

## Every shared dependency remains assigned

These are the existing 20 subsystem identities. Their full source paths,
individual tasks and acceptance instructions remain in the machine ledger and
[shared ledger](platform-pages/_sharedSubsystems.md).

| Exact subsystem | Required milestone/dependency chain |
| --- | --- |
| `shared-auth` — authentication, sessions, authorization and tenant isolation | M5 foundation → every protected route/control in M6 → deployed/session recovery in M7. |
| `shared-database` — Neon schema, migrations and transaction authority | M5 disposable transaction/schema proof → dependent page mutations → writer-drained actual migration/recovery in M7. |
| `shared-storage` — PDIM, hybrid bytes, uploads, deletion and backup/recovery | M1 upload packaging/isolation → M5 owner/refcount/fence proof → M6 durable bytes → joint offsite restore in M7. |
| `shared-awareness` — public live awareness ingestion, refresh and provenance | M1 required-dependency status → M5 real public ingestion/publication/freshness → consuming pages and deployed continuity. |
| `shared-generation` — MaxCore text, image, audio and video generation | M5 exact mode/engine contracts → M6 every consuming control and decoded output → deployed outputs/capacity in M7. |
| `shared-beat-loop` — beat creation, listing, licensing, sale and royalty loop | Storage/generation/commerce authority → complete M6 creation-to-sale/royalty flows → signed delivery/payout acceptance. |
| `shared-studio` — DAW, DSP instruments/effects and native VST3 | M5 browser DSP/state/lifecycle → both Studio aliases → genuine native source/Linux build/host proof in M7. |
| `shared-commerce` — subscriptions, billing, payments, tax, Connect and payouts | M5 entitlement/idempotency/signed-event contracts → M6 actual UI/account transitions → applicable production account/delivery gates. |
| `shared-providers` — external social, music, distribution, email and analytics | M5 bounded transport/schema/retry/ownership → M6 actual consumer state → enabled deployed OAuth and accepted/delivered receipts. |
| `shared-queues` — workers, schedules, automation and durable media jobs | M5 durable admission/lease/fence/recovery → M6 cross-worker job polling → deployed restart/common queue authority. |
| `shared-notifications` — notifications, administrators, audit and security response | M1 actual email acceptance → M5 role/recipient/audit contracts → M6 UI updates → real delivery/incident evidence. |
| `shared-accessibility` — accessibility, responsive layouts and page states | Shared shell/component semantics → all M6 page/section states → automated and manual WCAG 2.2 AA proof. |
| `shared-languages` — all configured languages, localization and bidirectional content | Complete locale/key inventory → M6 every supported locale and RTL/text/number/date behavior → actual configured language acceptance. |
| `shared-offline-mobile` — offline synchronization, PWA and mobile platforms | M5 account/storage/conflict authority → M6 offline/logout/isolation flows → actual install/update/device acceptance in M7. |
| `shared-desktop` — Electron, OS installers and updates | M1 actual Linux packaging defects → full client configuration/children/UI behavior → every supported OS/install/update target in M7. |
| `shared-hardware` — native hardware, accelerators and optional backends | Exact advertised hardware/source inventory → bounded implementation proof → real supported device/backend evidence. |
| `shared-security` — platform security and dependency supply chain | M1 compatible advisory fixes → every M5/M6 trust boundary → integrated audit/secrets/security/abuse proof. |
| `shared-capacity` — performance, global concurrency and realistic topology | M3 uncontended local profile → actual common state/job topology → M7 measured representative concurrency/latency/errors/soak. |
| `shared-deployment` — Replit Nix, build, cold startup and deployed identity | M2 stable inputs → M3 source sweep → M4 current payload → M7 actual HTTPS/image/schema identity. |
| `shared-operations` — CI, observability, incident response and recovery | M3 reproducible suites/cleanup → M4 lifecycle → M7 real monitoring, backup/restore, restart and operational response. |

## Explicit validation and pass/fail criteria for each feature

Apply every row to every section, resolve applicability from actual source, and
retain its per-feature evidence. An unsupported or unverified applicability
claim cannot become a passing exemption. The launch audit carries domain
criteria and evidence status; the individual section instructions remain
additional requirements.

| Validation | PASS requires | FAIL or open requires |
| --- | --- | --- |
| Frontend functionality | Every actual named control produces its specified action/output; correct valid/invalid values; dialogs/tabs/cancel/reset/navigation/reload work; duplicate actions cannot create extra effects. | Incorrect outcome, missing control/action, unknown binding or untested state. |
| Responsive UX | All intended viewport/touch layouts remain usable, content and controls are reachable at 320 CSS pixels and 400% zoom where WCAG reflow applies; orientation and virtual keyboard do not obscure required actions. | Clipping, overlapping/inaccessible actions, unsupported required device, or absent measured evidence. |
| Frontend state/error handling | Loading/empty/success/validation/unauthorized/forbidden/not-found/timeout/outage/retry/cancel states show truthful results; unmount/account switch cannot leak stale state or listeners. | False success, hidden mutation failure, cross-account cache data, unbounded retry or missing adverse-state proof. |
| Accessibility | All applicable WCAG 2.2 A/AA criteria pass. Automated findings are resolved; manual keyboard/focus/screen-reader/contrast/reflow/error/status/motion/target-size checks pass for relevant states and controls. | Any applicable failed criterion, unresolved serious finding, inaccessible critical journey or missing required manual evidence. An automated scan alone cannot pass the domain. |
| Frontend performance | Representative page data/interaction workload meets its explicitly recorded render/interaction/network budget on the identified device/profile, with no unbounded list/render/listener behavior. | A budget is missed, not defined for the actual journey, or inferred from an unrelated shell/profile. |
| API behavior | Exact mounted method/path validates input and returns the specified status/schema and output; malformed/oversized/boundary/empty/not-found cases are precise; dependency failures are bounded. | Broad accepted status sets, malformed data accepted, unmounted/dynamic path unresolved, timeout unbounded or actual result missing. |
| Database and integrity | Actual disposable database proves constraints/transactions/concurrency/idempotency; durable read from a fresh request/worker matches committed state/bytes/accounting; failed writes do not partially succeed. | Mock-only transaction proof, lost update, invalid ownership/reference totals, unverified migration, or persistence inferred from local response. |
| Authentication/authorization | Anonymous, owner, foreign owner and every applicable role/subscription/admin scope have exact allowed/denied outcomes; denied requests do not mutate state; CSRF/session/rotation boundaries hold. | Any unauthorized effect/data disclosure, ambiguous role policy or missing negative state. |
| AI generation and awareness | Actual public-source context freshness/provenance is verified separately; each advertised mode invokes its admitted renderer/engine, yields decoded expected output and durable owner-scoped receipt; private account aggregates never enter public learning. | A capability flag, planner or URL substitutes for generated content; unsupported mode reports success; stale context, private learning, missing engine/output proof or unverifiable quality claim. |
| Frontend/backend integration | The real consuming UI calls the exact service with owned identity, validates responses, shows real state, survives failure/reload and preserves request/job identity. | Only isolated unit mocks pass, consumer mapping unknown, response drift or fake state transition. |
| Workflow/real-time updates | Durable admission, scheduler/worker ownership, retries, deduplication, terminal state, polling/event delivery and account isolation pass across process/reconnect/restart boundaries. | In-process success alone, duplicate side effects, stale worker completion, missed durable event or unverified reconnect recovery. |
| Failure recovery | Owned interruption/dependency-loss cases recover deterministically or remain truthfully unavailable; restoring a matched SQL/blob pair reproduces exact metadata/bytes/owner denials; cleanup succeeds. | Inconsistent pair accepted, deleted data resurrected, stale writer wins, hidden partial success, resources leak or only a backup creation command is tested. |
| Functional/regression/end-to-end QA | Every named feature criterion has passing exact current-source case evidence; affected regressions and full stable-source sweep pass with all skips/blocks assessed. | A failed, stale, skipped, blocked, missing or mislinked required case; renders/test totals substituted for business acceptance. |
| Security QA | Actual enabled trust boundaries pass validation/abuse/tenant/XSS/CSRF/SSRF/file/rate-limit/secret-redaction and dependency-policy checks with real intended rejection semantics. | Known reachable vulnerability, secret exposure, unexplained accepted attack path or missing required security boundary test. |
| Load QA | Existing bounded profile retains p95 ≤500 ms and its success/error requirements with no competing heavy work; actual global claim additionally meets declared topology/workload/region/queue/resource limits and recovery/soak criteria. | Measured threshold failure, missing realistic topology/target, projection substituted for measured clients, or untested saturation/recovery. |
| Localization | Every supported locale has correct keys/fallback/formatting/plurals/long text/RTL/navigation and functional journeys; user input and account state persist correctly across switches. | Language declaration alone, untranslated required content, direction/layout/data corruption or untested supported locale. |
| Coverage/provenance | All requested line/statement/function/branch counters reach 100% for current declared source with real raw profiles and compatible maps; other languages have their own valid profiles; exact feature cases still pass. | Excluded unknown source, fabricated/import-only counters, stale/incompatible map merge, unsupported language measurement or any metric below target. |
| Deployment/operations | Actual published release/source/schema identity, enabled callbacks, private child supervision, truthful health/readiness, redacted monitoring, recovery and rollback pass on the intended environment. | Editor URL substituted for origin, configured keys substituted for delivery, stale package, schema drift, false readiness or absent recovery evidence. |

## Parallelization, revalidation and rollback

Disjoint feature implementations and lightweight source/evidence reviews may
run concurrently before a freeze. Shared manifest/lock/schema/generated report
ownership is singular. Tests that mutate the same PostgreSQL/PDIM fixture,
upload directory or runtime capsule never share it. Provider fixtures use
explicit owned resources; existing unchanged sandbox evidence is reused only
for its actual source/account scope, without repeated remote mutations.

After each task, verify exact current callers and dependency source hashes;
run its positive/adverse regressions; check state/bytes/owner boundaries and
owned-process cleanup; inspect the diff; record command/exit/source/evidence;
update the task and dependent page metrics. A source change marks affected
evidence stale and may reveal new prerequisites. Record the new gap with root
cause and owning milestone before taking the next item. Do not lower a gate
to keep a dependent task looking complete.

Accessibility and locale checks may share tested component foundations, while
each consuming page still needs its actual state, layout and keyboard/user
journey. Shared backend cases may establish one reusable contract with exact
links, while each frontend consumer must still prove its own integration.
This avoids duplicate implementation without inventing duplicate acceptance.

Rollback source fixes in coherent batches with their regressions. For durable
changes retain the journal/fence/lease evidence; do not drop new authority
tables or restart old incompatible writers merely to restore a binary. Actual
production migration/backup/recovery follows the
[storage release runbook](storage-release-runbook.md). Rebuild a rejected
release rather than modifying its hashes. Production/provider changes require
the concrete tested package and the applicable authorization boundary; lack of
access leaves that gate open while unrelated source work continues.

## Unavailable prerequisites remain tracked critical work

The audit's gap register must retain the actual published Replit HTTPS origin
and deployment access; Neon 0096–0099 migration/compatible-writer proof; a
coordinated independent recoverable SQL/blob backup; real enabled provider and
signed delivery journeys; GitHub native jobs blocked before execution by an
account billing lock; original JUCE/C++ source for Linux VST3; every required
OS/device/hardware target; missing daily engagement reporting where advertised;
and realistic shared-state/job-routing/global-capacity proof. Configured Replit
API secrets are already acknowledged and are not repeatedly requested.

The [current matrix](../../reports/launch-readiness/current/matrix.md) records
Green/Yellow/Red per declaration. The [gap register](../../reports/launch-readiness/current/gaps.json)
retains unresolved work and dependencies; the [machine roadmap](../../reports/launch-readiness/current/roadmap.json)
preserves exhaustive task identities. Unknown implementation completion stays
unknown; a verified-acceptance ratio or launch-domain score is labelled as
such. **Launch approval remains withheld until all 80 declarations and every
required shared/deployed gate actually pass.** No review-signature requirement
is introduced.

## Source-binding implementation checkpoint — October 28

This delta retains M0–M9, all seven expansion levels, every page/section identity
and the full 20-lane shared work set above. It adds no substitute plan. At source
`10d192675beefcf1b7beef3ce47c271db0cc17cf`, nested-route/finite-path identity
repairs and current-execution evidence binding are implemented. The actual
source-bound [focused evidence cohort](../../reports/platform-evidence/2026-10-28-source-binding-final/README.md)
retains the original false-pass reproductions, 130 passing review cases, the
three additional duplicate-Node regressions and final 133 passing cases.
Those checks validate verification machinery, not product feature completion.

M3 completed from frozen 10d source in 23m42s: ordinary executable groups,
build, types, lint and audit passed; all 2,771 instrumented assertions passed,
but requested 100% coverage and strict feature/remediation gates failed. Actual
coverage is 13.11% lines, 13.01% statements, 8.68% functions and 8.78% branches.
The six narrow access-policy checks passed through eight actual current HTTP
cases, leaving 33,543 checks unverified. The current matrix has source freshness
PASS and all 80 pages Red. Historical results were not transferred.

M4's new [10d portable release rehearsal](../../reports/release-rehearsal/2026-10-28-10d19267-final/README.md)
passed preparation, both verifications and copied-payload cold startup, plus
37 independent audit checks. Common and all 4,527 admitted release-source
entries stayed unchanged. Its accepted startup scope explicitly retains
`productionReady: false`; operational generation, actual Replit deployment and
global/page acceptance remain open. The prior cb receipt remains historical.
A source change invalidates affected acceptance and payload identity.

The pre-master inventory at source `bca5f4e1` retained 80 declarations, 2,162
sections, 12,972 dimension steps, 8,374 controls, 2,909 backend registrations,
932 frontend contracts, 20 shared lanes and 53,020 work items. Its 170 unresolved
mapping diagnostics expose unsupported/uncertain declarations; they are not
170 proven missing handlers. These are planning counts for that snapshot, not
current production completion. The completed 10d master preserves these counts.
No original section is removed, no threshold is lowered and no unresolved
feature/deployed/provider/native/accessibility/global-capacity gate is closed
by the producer repairs. Continue M5–M9 only with their actual prerequisites,
explicit validation/acceptance and rollback boundaries retained.

The next critical source batch is the existing C5/P1–P2 shared execution and
typed-coordinate contract, specified with actual map/wrapper witnesses in the
[next contract trace](../../reports/coverage-producer/2026-10-28-next-contract-trace/README.md).
Its zero-counter controls are not executed product coverage. Preserve the
single-suite ownership boundary until fresh real execution and every complete
map validate; no incompatible profile is merged today.

The [evidence-binding gap trace](evidence-binding-gaps.md) separately retains
all 104 passing occurrences currently inadmissible as exact feature proof and
one historical-source catalog defect. Implement unique parameter/class
identities, actual commerce adapter subject bindings and snapshot classification
without removing assertions or changing input semantics. These are existing
verification-lane subtasks, not 104 newly proven product failures. The
[unfinished Python factory proposal](../../reports/mapping-audit/2026-10-28-python-factory-proposal/README.md)
remains unreviewed and unlanded. Resume its existing mapping lane only after
its scope, tests and identity relations are checked; it supplies no acceptance.
