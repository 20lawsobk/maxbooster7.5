# Launch readiness and remaining evidence

This is the October 27, 2026 hardening checkpoint, based on baseline
`b369d68e34bef0e30c96fbd5b72fa7339e6425f2` on
`sophia/platform-production-hardening-2026-10-27`. The source, tests, focused
evidence and exhaustive platform plan are pushed on that review branch. Main
promotion remains conditional on the actual requested readiness gates.
**Global launch readiness is not established.** The
[targeted evidence snapshot](../../reports/test-verification/history/2026-10-26-targeted-hardening/README.md)
preserves what has actually run, including a failing paid/billing HTTP recheck
followed by a passing recheck of the same focused scope. The later run records
87 passes and four explicit skips; the six-case limiter regression also passes.
The [completed October 26 master](../../reports/test-verification/history/2026-10-26-integrated-before-rechecks/README.md)
also preserves a full run with unchanged source inputs. It passed most isolated
groups but retained three unit failures, five HTTP failures and failed
coverage/evidence gates. The repaired October 27 master now completed from
unchanged pushed source: all executable groups and ordinary checks pass;
coverage and strict feature-evidence gates remain open. The
[master results](results.md) must be read with their execution timestamp and
source digests; later edits do not retroactively turn an earlier failure into
a pass.

## Deployment target and state authority

The documented Replit target is a
[Reserved VM in North America, 16 vCPU / 64 GiB](../replit-production-deployment.md#editor-and-publishing-commands).
The committed `.replit` configuration starts the imported local MaxCore and PDIM
implementations and exposes only application port 5000. Machine allocation,
publication, production secrets and the actual HTTPS app origin are separate
Replit settings. An editor/project URL does not identify a published origin.

This fixed-VM target can share primary-owned children among Node workers.
Independent replicas need a verified common authority for mutable state and
media, in addition to PostgreSQL-backed sessions and metadata. Local PDIM defaults
to disk persistence; its optional app-storage journal fences a single owner.
Neither mode by itself proves simultaneous independent replica ownership.
Python jobs and local upload/media staging also need verified ownership and
delivery behavior for the selected topology. Do not infer shared state from
several healthy instances independently responding to `PING`.

## Release gates

| Gate | Evidence required to close it | Current checkpoint |
| --- | --- | --- |
| Source integration | Integrate the repaired auth/billing HTTP flow and bounded cross-worker hybrid metadata/media-job repairs; run their real database/concurrency/owner tests. | The repaired master passes 2,669 unit cases, 43 instrumented real-database contracts, 112 Node files and 484 HTTP cases with 9 explicit HTTP skips. The original three unit and five HTTP failures are closed. Fabric migration recovery, immutable replica fencing and schema contracts also pass their focused 25-leaf scope. Counts overlap and are not summed. |
| Entire platform work inventory | Retain all 80 declarations and every page section, control, frontend contract, backend process, source/configuration/asset file and shared client/operational lane, with exact required acceptance work. | Inventory validation passes: 80 pages, 2,161 business sections, 12,966 detailed steps, 8,374 control declarations, 2,901 backend registrations, 932 frontend contracts and 20 shared lanes. This closes planning completeness only; execution acceptance remains separate. |
| Complete master | Build; unit/additional/Node/Python/commerce/native suites; real browser and HTTP journeys; page observations; bounded load; recovery/operational checks; types, lint and production audit. Preserve actual exit codes and skipped/blocked cases. | The October 27 run completed in 21m17s with unchanged source inputs. Build, unit/additional/Node/Python/commerce/native/browser/HTTP/page/load/operations/types/lint checks pass. The overall command exits 1 for the 100% coverage target and strict evidence/remediation gates. The audit's configured high-severity gate passes but reports one newly observed moderate `qs` advisory requiring a separate repair. |
| Coverage and contract evidence | Reach the owner's requested 100% for lines, statements, functions and branches, resolve live route mappings, and link passing exact assertions to the affected source contracts. Measure other languages separately. | The repaired profile measures 13.11% lines, 13.01% statements, 8.67% functions and 8.79% branches across 2,651 files, with 2,712 passing assertions and no transform exclusions. The 100% target is enforced and unmet. All 33,504 source-derived behavior checks still require exact acceptance links; these are verification tasks, not a count of confirmed product bugs. |
| Database release | Drain old storage writers/controllers, take the normal recoverable backup, apply the reviewed ordered migrations, verify schema and existing object/reference invariants, then start compatible writers. | Read-only configured Neon metadata found existing fabric tables but no deletion journal/reference-count additions required by `0096`. No production migration was executed. The reviewed sequence now includes `0096` through `0099`; the migration journal is also bound to the ORM and prelaunch schema check. |
| Legacy storage | Verify actual stored container headers before marking existing dependencies indexed; retain shared references and retryable deletion receipts. | Unknown legacy dependencies deliberately retain potential bases with `409`. Changing flags without header evidence cannot close this boundary. |
| Cold release/startup | Produce a current-source release in a disposable Publishing/build copy; verify capsule manifests/hashes, restore without editor state, start private children, assert honest readiness and shutdown/restart/recovery. | The final pushed-source portable payload passed all four commands and a 16-check independent audit. Actual source and payload match, scratch entries are absent and all 40 tracked descendants shut down. This closes portable cold-start scope only; isolated awareness/generation readiness remains false. Actual Replit Nix image/deployment proof remains separate. |
| Public Replit deployment | Establish actual published HTTPS origin, deployed source/release identity, production health/readiness and enabled browser journeys after deployment. | Only the project URL is established. Two guessed host probes returned generic 404; their identity is unverified. |
| External providers | Verify enabled OAuth callbacks/permissions, payment confirmation and signed webhook processing, email/distribution/social delivery and durable retry/receipt behavior in the selected environment. | Dedicated Stripe TEST API acceptance is partial and API-only. Production provider readiness remains unverified rather than inferred from secret configuration. |
| Generation delivery | Verify each advertised mode from its real page through Node, live awareness and the selected MaxCore renderer/engine; fetch, decode and verify owner-controlled output bytes and persisted receipts. | Specific model-free modes and the beat rendering/listing loop have targeted proof. General semantic generation and every consuming page are not established by those checks. |
| Capacity and operations | Measure the deployed topology under bounded representative traffic, including generation admission, queueing, latency/error thresholds, restart/recovery and resource/connection limits. | The source fixture passed 150 paced requests across 10/20 worker phases with 100% success and p95 below 332 ms. Existing 90M figures project smaller measurements; no 90M simultaneous-client or global multi-region execution is recorded. |
| Native Linux VST3 | Restore original JUCE/C++ source, build for Linux, and verify actual host/plugin processing if that native capability is advertised at launch. | Uploaded Windows binaries/build outputs do not supply the missing source. Browser Studio DSP has separate passing tests. |
| Desktop, mobile and offline clients | Build and exercise each configured Electron/OS installer, mobile/PWA target, installation/update path and offline synchronization/account-isolation journey; keep device/hardware prerequisites explicit. | These are included in the entire-platform plan. The pushed checkpoint triggered both native workflows; GitHub reports that jobs could not start because the account is locked due to a billing issue. No build steps executed. Focused local runtime/transport policies do not certify the OS/device builds or full offline journeys. |

The coverage target is now 100% for all four JS/TS metrics. The
[ordered coverage batches](completion-execution-plan.md#execution-sequence-toward-100-coverage)
start with durable safety paths, then API journeys, routed UI behavior and the
remaining libraries/adapters. They use actual per-file statement/function/branch
maps and retain separate Python/native measurement. Neither raising the gate
nor removing untested source from a report is evidence that this work is done.
Even valid 100% execution coverage would still need the deployment, provider,
recovery, output-quality and capacity checks in this table.

The [complete platform ledger](platform-completion-plan.md) and
[all-page execution schedule](platform-work-schedule.md) retain every section
and backend dependency, including aliases, unmounted process declarations and
unrouted controls. Their completeness checks do not upgrade any unverified
business behavior. The scoped media repository/handler/cleanup and hybrid SQL
repository profiles reached 100% for all four metrics; these are individual
files, not the platform-wide percentage. StudioLoader's separately source-mapped
browser profile reached 100% lines/statements/functions and 98.57% branches;
its counters are explicitly unmerged into the global unit-run profile.

The migration package must identify the exact files included in the release,
backup and recovery steps, writer-drain boundary, post-migration invariants and
compatibility restrictions. Applying additive DDL does not make it safe to run
old binaries that omit generation or shared-reference checks. Do not roll back
by dropping journals or dependency evidence. See
[storage verification and migration boundaries](storage-and-archives.md).

## Awareness and generation capabilities

Public live-awareness context does not require a trained generation checkpoint.
Its acceptance requires current publicly accessible sources, successful PDIM
publication and fresh snapshot provenance. Read
`GET /api/health/awareness/ready` separately from aggregate application readiness.
An expired snapshot or failed live source must remain a bounded unavailable
response.

The October 27 [canonical public acceptance](../../reports/live-awareness-acceptance/2026-10-27/canonical-public-pipeline-README.md)
used four real public adapters and six validated GET hops. It published 105
observations to the actual isolated PDIM owner, verified pointer/blob and source
ledger hashes, and loaded the same fresh snapshot into a separate engine with
matching context across all four domains. Expiration rejection and owned-process
cleanup passed. This closes that live ingestion/publication/follower scope;
it does not certify main Node generation, deployed readiness or output quality.

The current model-free modes have specific meanings:

| Mode | Implemented output and required acceptance |
| --- | --- |
| Planner text | Structured workflow/planning metadata. Verify requested fields, fresh context and immutable plan identity. This receipt does not establish generated creative copy. |
| Dedicated image | Explicit controlled poster rendering. Fetch/decode the actual image and verify applied controls, dimensions, provenance and owner access. |
| Dedicated audio | Explicit instrumental synthesis or supported narration path. Decode the returned audio, check actual format/duration/controls and distinguish requested instruments/voice from unsupported claims. |
| Dedicated video | Explicit supported scene/render controls through the real renderer. Fetch/decode the resulting video and verify delivery, timing and persisted job status. |
| Semantic text/campaign/media | Use an admitted generation engine compatible with that mode and retain current output-quality/delivery evidence. Fresh awareness alone does not establish that the semantic decoder ran. |

The beat-loop acceptance crosses the real Node service, Python ASGI renderer,
decoded audio/artwork, private files and PostgreSQL listing/royalty records.
Those passing cases prove their declared fixture flow. A metadata capability
response such as `runtime: not_probed`, an asset URL alone or a planner result
cannot close another modality's generation gate. No obsolete checkpoint needs
to be reinstated merely to verify live-awareness functionality.

## Scope of the 80-page and scale evidence

The preserved 80-page receipt reports `PASS_WITH_UNTESTED_CATEGORIES` for a sealed
non-ML source application. MaxCore is not started in that fixture and full
aggregate readiness is expected to return 503. Its 80 successful render
observations therefore establish that selected route shells render and the
fixture's persisted/authentication assertions pass. They do not establish every
form, role, empty/error state, provider delivery or generated asset on all pages.
The platform register retains the next behavior checks without treating source
imports or candidate test associations as executed proof.

The October 26 bounded HTTP fixture independently measured 70 requests at 10 workers
over 20 seconds and 80 requests at 20 workers over 10 seconds. Its p95 latencies were
159.00 ms and 331.20 ms, with 100% success and 3 second pacing per session. The tested
callbacks include authenticated session reads/writes and project reads/writes.
Those measured source-application results do not establish deployed capacity,
generation throughput, soak behavior or a simultaneous 90M client workload.

[Scale evidence](scale-evidence.md) identifies the existing endpoint harnesses
and their documented successes/failures. The preserved ten-run numeric profile
executes 1,101 orchestrator calls per repeat with eight worker threads and no
network clients. Its initial failure is retained alongside the later passes.
The 150-request/40-worker Wave6 sample and 90M fleet arithmetic must remain
separate from deployed global throughput or semantic-quality claims.

## Provider account observations

The [dedicated Stripe TEST report](../../reports/provider-acceptance/stripe-test-api-2026-10-26.json)
records 28 passes, four blocks and one skip. Automatic Tax lacks the test
account's head-office prerequisite; a newly created Express fixture has not
completed onboarding, activated transfers or enabled payouts. These observations
do not prove production account misconfiguration. They require valid account
prerequisites and deployed flow evidence before the corresponding features can
be declared ready. Configuration must use the actual business/account facts.

The report also preserves six cleanup skips for documented immutable,
short-lived or ledger-bound test resources. These are visible cleanup limits,
not successful deletions. The runner did not exercise application routes,
browser confirmation or deployed signed webhooks. A complete launch decision
must retain those distinctions.

## Completion sequence

Finish the bounded source repairs, freeze sources and refresh test discovery.
Run the full [master procedure](README.md#run-the-complete-isolated-sweep), fix
reproduced failures and reconcile all fresh reports. Then prepare and verify the
disposable current-source release and its concrete migration/deployment package.
Verify the actual Replit deployment, enabled provider and generation journeys,
and measured capacity for the chosen topology. Update this gate table from
retained evidence and make the shipping decision before promoting a global
launch claim. A source push alone closes none of these runtime gates.
