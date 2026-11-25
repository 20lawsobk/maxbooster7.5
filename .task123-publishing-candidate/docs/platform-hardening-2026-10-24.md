# Platform hardening — October 24, 2026

The current launch disposition is **NO-GO**. This continuation repairs confirmed
platform defects and expands executable evidence; it does not establish that
every feature is production ready. This checkpoint records completed checks and remaining failures below.
It is a source delivery checkpoint, not a launch approval. Multi-application workflows and native desktop/mobile packaging remain
outside the owner's production criteria.

This work continues draft [PR #112](https://github.com/20lawsobk/maxbooster7.5/pull/112)
from remote commit `2dac7347ee933c304c9e299f50856abd920da575`, tree
`3cec9fb00e2f947ffa748e017a3b09efc0195b48`. Earlier reports, including the
[previous continuation](sophia-production-continuation-2026-10-24.md), describe
their own revisions. Their 2,345-test result must not be presented as proof of
this later, initially uncommitted tree.

## Coverage and limits

The [per-file review register](platform-review-register-2026-10-24.csv) inventories
88 frontend page TSX files, 155 route-directory TS files, and 435 service-directory
TS files at this inspection, plus five supplemental runtime files. Directory
counts include supporting tests and helpers; they are not counts of distinct
features. The register has 683 rows: 51 narrowly reviewed files and 632 files
inventoried without current focused review. Of the 51 reviewed files, 22 have focused regression evidence, 28 have source
review only, and one has a confirmed DSP factory defect under active repair. Every row retains
`end_to_end=UNVERIFIED`; a focused test does not establish an entire page or
service journey. This register covers the root application's listed directories;
imported MaxCore/PDIM code has only the targeted review described below, not a
complete per-file review of both imported systems.

A fresh static inventory found 2,391 backend registrations, 2,371 unique
method/path pairs, 157 mounted router files and 1,198 frontend transport call
sites. All 932 unique detected frontend calls have a matching registered route;
zero confirmed unmatched paths were reported. Seven dynamic findings remain in
the audit's finding list. Manual inspection traces these to parameterized
generation requests, release create/update selection, storefront/marketplace
loaders, the generic bulk-action utility, and two transport definitions. This
accounts for their static shape, without proving payload, permission, database,
provider or browser behavior. The audit separately retains 13 raw unresolved
dynamic occurrences; these counts have different meanings.

Selected analytics, support, notifications, storefront, Studio wrapper, admin,
distribution, social, storage, worker and privacy paths were traced. Studio audio
playback/save/reopen, complete storefront purchasing, every administrative action,
all OAuth/provider flows and the hundreds of merely inventoried files have no
new blanket acceptance claim. Source review of an authorization check is not a
complete browser-to-provider test.

## Confirmed corrections

| Area | Failure and resulting behavior | Evidence boundary |
| --- | --- | --- |
| Commerce | Provider refund/dispute accounting is now read after the transaction source lock with bounded requests. Initial conservative holds book atomically, replay does not resurrect old holds, settlement consumers refresh current accounting, and lifetime reversals recheck locked customer/current charge state. | Disposable PostgreSQL races and actual consumers with isolated provider boundaries; no live charge or provider settlement. Sources: `server/services/commerce/{repository,compensation,verification,disputeHold,reversalState,settlement,merchant,growthMerch,provider,engine}.ts`. |
| Workspace authorization | Administrators could mass-assign ownership fields and modify authoritative owner membership. Strict shared settings validation, active administrator membership, owner protection and same-workspace custom-role checks now enforce those boundaries. | Exact service and registered handler regressions with isolated storage. Sources: `server/services/workspaceService.ts`, `server/routes/workspace.ts`. |
| Distribution workflow | Workflow history/version/transition paths allowed cross-owner access and generic callers could claim internal completion. Owner-scoped queries and state comparisons reject unauthorized transitions; version metadata uses the actual schema column. | Prior PostgreSQL fixture had mismatched columns; corrected actual-schema and atomic-transition integration is pending. Workflow/scheduler unit regressions pass. Sources: `server/services/releaseWorkflowService.ts`, `server/routes/distribution.ts`. |
| Analytics | Revenue and audience tabs dereferenced absent data on cold render; missing metrics displayed invented zeros. Loading/error/retry states now render safely, unsupported values stay unavailable, and real platform stream counts reach the client. | Real React SSR/query-state tests and the exact dashboard handler. Sources: the two analytics page components and `server/routes.ts`. |
| Autonomous posting | Queue acceptance prematurely changed pending posts to published, preventing pending-only worker claims. Dispatch now leaves publication/receipt state to the worker. | Exact dispatcher plus existing queue/recovery tests; no external post. Source: `server/services/autonomousService.ts`. |
| Video transport credentials | A legitimate external CDN video URL received the private MaxCore bearer and owner headers. Only configured MaxCore origin requests receive those credentials; external artifacts use the existing guarded public transport. | Exact handler regression captures external request headers; URL/SSRF suites. Source: `server/routes/socialMedia.ts`. |
| MaxCore proxy lifecycle | Recovery polling and several upstream operations could outlive the client; mutation retry could duplicate accepted operations. Recovery/deadlines now follow client cancellation; only safe reads retry, uploads are bounded, and binary streaming observes backpressure and disconnects. | Timer, disconnect, retry and registered-route regressions; no complete inference or all-proxy-branch certification. Sources: imported `api-server/src/config/proxy-lifecycle.ts` and `routes/model-proxy.ts`. |
| Training admission | Full source-authored posts with unknown rights could become next-token training targets, including through non-peak mode. Admission now rejects them before corpus/worker writes and persists the accurate refusal through restart/cooldown. An optional pinned operator manifest admits only exact source/domain/citation/full-text hashes backed by current permission evidence, retaining original scanner metadata. | Earlier engine-to-admission and owned/licensed fixture regressions plus 13 new rights-manifest regressions pass. The new admission test stops before worker execution. No actual source permissions supplied, public posts trained or candidate promoted. Sources: imported `live_learning.py`, `live_serving.py`. |
| Dependency security | Compatible patches update Multer, Undici, fast-uri, Fastify, Vitest and Electron across root/imported/DNS locks. Security floors reject the preceding vulnerable releases; the required coverage runner is now explicitly installed at the matching Vitest version. | Root full/production and MaxCore/PDIM/DNS production audits report zero; TLS audit is lock-only. Twenty-six focused consumer/gate/reconciliation results pass. Transport probes are compatibility coverage, not claimed reproduced exploits. |
| Delta compression | Repetitive versions redundantly compared equivalent maximal matches; malformed instructions could copy beyond the base or return incomplete/uninitialized output. Matching now stops at the first maximal choice, and the full decoder program is validated before allocation. | 29 new integrity cases and seven existing round trips pass with precise coverage; 32 wire fixtures remain byte-identical. The 200 KiB fixture drops from 49,227 comparisons to 50 and precise-coverage time from 13.56 s to 78.89 ms. Existing 20 s timeouts are unchanged. Source: `server/pocket-dimension/fabric/compression/DeltaEngine.ts`. |
| Snapshot recovery | Verified snapshot bytes were subsequently reread from a mutable path. Restore now writes the already-verified buffer exclusively with private file permissions. | Real filesystem replacement regressions. Source: `scripts/pdim-content-recovery-drill-lib.mjs`. |
| Chunk uploads | Invalid declared size/chunk counts could retain excessive bytes. Strict metadata, actual byte accounting, identity-safe duplicates, completion checks and quotas close the initial path. Cross-worker process-local state was then reproduced and replaced by private shared-filesystem staging and PostgreSQL advisory locks, with verified completion receipts and explicit uncertain-outcome reconciliation. | Eleven unit/handler cases and ten PostgreSQL scenarios across distinct Node workers pass; same-VM shared filesystem/database only, with unknown outcomes retained for reconciliation. Sources: `server/routes/storage.ts`, `server/lib/chunkUploadSessions.ts`. |

## Focused verification recorded before final integration

The following results are bounded receipts from the individual changes. Root
integration must reconcile them with the final combined tree. Local logs under
`work/` retain execution detail but are not shipped as source artifacts.

| Check | Observed result | Scope / limits |
| --- | --- | --- |
| MaxCore proxy unit suites | 21 passing across three suites | `maxcore-proxy-lifecycle`, `awareness-proxy-independence`, `maxcore-node-readiness`; cancellation and gate routing with isolated boundaries. |
| Workspace ownership suite | 14 passing | `tests/unit/workspace-ownership-boundaries.test.ts`; before-fix regressions fail as recorded locally. |
| Distribution tenancy / honesty | 10 unit results passing; corrected PostgreSQL integration pending | `npm run test:distribution-tenancy` previously reported seven results using a fixture with mismatched schema columns; that is insufficient proof of the actual production workflow schema. The fixture and atomic transition are being corrected. |
| Analytics render / handler suites | 11 passing across three suites | Cold render, retry, unavailable-vs-zero and actual stream projection. |
| Social video / URL / SSRF suites | 74 combined passing | Four new credential/URL tests plus existing transport guards. |
| Autonomous dispatch / queue / recovery | 28 combined passing | Four new dispatch regressions plus existing queue and ambiguous-recovery tests. |
| Credential-free payment runner | 73 contracts, 14 SQL/handler results and 33 overlap/settlement results passing; one remote Stripe scenario skipped | `node tests/payment-processing/run.mjs`; no inherited provider credentials. SQL result counts include Node harness results. |
| Training rights and serving | Final fresh run: 53 passing (curriculum 11, live serving 16, legacy learning 13, pinned rights 13), no skips | Torch-capable Python; owned/licensed fixture training mechanics and grant admission pass without qualifying a production candidate. Earlier differently scoped receipts do not replace this count. |
| Operator-pinned text rights manifest | 13 passing | `tests/test_text_training_rights.py` in the imported AI server; exact identities, permission/evidence and hash/persistence checks. Test-authored text only; admission persistence test deliberately prevents trainer execution. |
| Storage recovery and crash capacity | Four passing | `npm run test:storage-recovery`; real filesystem tests and two-process PDIM/AOF abrupt restart with 256 acknowledged increments from eight clients, all recovered. This is local bounded durability evidence. |
| Existing local recovery drills | PDIM seven-datatype/TTL/crash/restore and content-owner restore cases pass | Corrupt transport/semantic owner data fail closed. No off-host recovery or declared production RPO/RTO certification. |
| LFS-independent release mode | One passing | `tests/unit/model-release-mode.test.ts`; default needs no legacy checkpoint, explicit legacy mode validates it. |
| Root server/client types | Passing before shared-coordinator extension | `npm run check`; final post-extension result remains required. |

The first combined 2,398-test run found two configuration-template omissions; documenting the new upload setting resolves the exact environment checks. The subsequent coverage run exposed the compression timeout and a JS coverage glob that incorrectly included Python/Markdown. The codec fix removes redundant matching; coverage now includes executable JS/TS and excludes actual tests, with all 20% thresholds retained. These failed receipts remain historical evidence. The final rerun below passes every assertion, but fails the unchanged global coverage floor.

Focused ESLint and `git diff --check` results were clean for completed scopes.
They do not replace final integrated compilation, build and CI.

## LFS replacement and remaining model gate

The default production path is `live-awareness`. It does **not** require Git
LFS, `model.corrupt` or `model.pt`. `script/lib/modelRelease.ts` returns no legacy
checkpoint requirements for that mode, and `script/prepare-release.ts` consumes
that decision. Only explicit `MAXCORE_SERVING_RELEASE=legacy` requires the pinned
checkpoint; the observed repository LFS-budget failure belongs to that optional
legacy fetch, not the default launch path.

Application capsules and PDIM recovery are separate from private trained model
state. Capsule packaging excludes candidate runs, training/admission evidence,
registry state and the old checkpoint. The supervisor's `MAXCORE_MODEL_STATE_DIR`
defaults to `models` under `MAXCORE_PRIVATE_STATE_DIR` or
`~/.local/state/maxcore`. Replacement instances need this state durably attached
at the same absolute path, including matching certifications and applicable
review/trust evidence. A capsule alone does not create a qualified model. See
[deployment guidance](DEPLOYMENT.md) and the imported
[live-learning operator contract](../external/maxcore/artifacts/ai-training-server/ai_model/training/LIVE_LEARNING.md).

The inspected candidate inventory contains three smoke candidates and one legacy
live candidate, with no `public-content-transformer-v2` candidate. The legacy run
has one training step/128 tokens and lacks the complete input/corpus evidence
needed for current public eligibility. No checkpoint was downloaded, promoted or
accepted by weakening validation.

One bounded, anonymous public awareness scan completed 28 configured source
results, with 15 healthy sources covering advertising, culture, music and social.
It produced eight metadata-eligible peak records in about 11 seconds, using the
session's explicit egress proxy and ephemeral in-memory storage. It invoked no
trainer and retained/logged no bodies. Public availability and `NOASSERTION`
provenance supply no training permission. The optional pinned rights-manifest
path can accept operator-provided grants with exact content hashes and current
evidence, but none are supplied or inferred here. Approved reusable content/provenance
and an actually trained, certified and operationally eligible candidate remain
necessary. A successful network scan cannot pass generation quality or runtime
readiness on its own.

## Combined validation checkpoint

This snapshot compiles 2,139 source inputs into 162 recorded artifacts. The
SHA-256 of the sorted build-input hash map is
`7bce1473ad783b904f110def5daba1c6979b62026e5406dde836e08fe93453d7`.
The immutable commit/tree is recorded in PR #112 when this checkpoint is saved.
Subsequent DSP work is a separate follow-up and must receive fresh validation.

| Gate | Current disposition | Evidence / remaining requirement |
| --- | --- | --- |
| Root/imported types, lint, ordinary build | PASS for this checkpoint | Root server/client check and full root policy lint, MaxCore API types and explicit imported proxy lint, ordinary production npm build all exit zero. |
| Full credential-isolated CI, retries disabled | FAIL: coverage | `npm run test:ci -- --retry=0 --coverage`: 2,427 Vitest tests across 286 suites, zero failures/errors/skips; preceding runtime/security, Sharp, preference and recovery Node stages pass. Command exits one because global coverage is below the retained 20% floor: lines 12.38%, functions 12.14%, statements 12.25%. |
| Payment, tenancy and shared-worker upload integration | PASS within isolated boundaries | Fresh payment runner: 73 contracts, 14 SQL/handler results, 33 overlap/settlement results pass; one remote Stripe test intentionally skipped. Actual-schema distribution: 10 PostgreSQL results. Shared upload: 10 distinct-worker PostgreSQL scenarios plus harness. No live side effects. |
| Dependency audits | PASS within recorded scope | Root full/production, MaxCore/PDIM/DNS production audits and TLS production lock audit report zero. Installed root/MaxCore/PDIM/DNS gate passes; absent optional TLS/legacy duplicate installed trees do not acquire runtime verification from a lock audit. |
| Focused Python training/serving | PASS within fixtures | 53 tests (11 curriculum, 16 serving, 13 legacy learning, 13 pinned-rights); no skips. Owned/licensed fixture training mechanics pass; no actual public posts trained or production candidate promoted. |
| Actual production start / bounded public reads | PARTIAL; readiness FAIL | Disposable compiled `npm run start`: homepage/health 200, critical routes registered, private Python model process running with zero restarts. Ninety-six homepage/health reads at concurrency eight have zero unexpected responses, p95 14.87 ms/p99 17.21 ms, below the declared 800/1,500 ms read limits. Owned process/port/database cleanup passes. Harness exits one because readiness remains 503. No inference/business/world-capacity claim. |
| Qualified MaxCore generation | BLOCKED in checkout; host UNVERIFIED | Zero eligible v2 candidates or selected pointer in this checkout. The owner identified the Replit bucket; authenticated contents remain uninspected. Actual approved content/grants, a qualified candidate and operational quality evidence remain required unless verified existing host artifacts supply them. |
| Durable model recovery / complete runtime readiness | UNVERIFIED / NOT PASSED | Restore and validate retained private model state, and demonstrate full readiness with real awareness coverage. The startup namespace intentionally prevents public network access; the separate anonymous awareness scan is not a full runtime/model pass. |
| DSP registry / lifecycle follow-up | CONFIRMED DEFECT; IN PROGRESS | The public registry combines 40 arrow factories and 50 constructors but invokes all with `new`, breaking actual instrument rendering for the factory families. Dedicated instrument/effect lifecycle work is underway and is not included in this checkpoint. Global coverage analysis directs this work toward real signal behavior, not import-only tests. |
| Required consumer/provider and capacity acceptance | UNVERIFIED | Complete the declared critical journey and retained recovery/capacity matrix beyond the bounded fixtures above. |
| Remaining inventoried pages/services | UNVERIFIED | Per-file register distinguishes focused/static review from actual complete user journeys. |
| Multi-application/native packaging | EXCLUDED from launch criteria | Owner's stated production criteria. Synchronizing two requested projects does not make their cross-application workflows a launch gate. |

The [source delivery manifest](replit-source-delivery-2026-10-24.json) records
exact file hashes and explicitly includes restoration of `.replit` and
`replit.nix`, even though both canonical files already exist in this repository.
Their presence here does not establish restoration in either Replit editor.
The run configuration parses as TOML and points to the repository's tested
entrypoints. A Replit-native Nix evaluation has not been executed here.

The owner's latest instruction targets both existing Replit projects:
[Max Booster](https://replit.com/@blawzmusic89/Max-Booster) and
[maxbooster7.5](https://replit.com/@blawzmusic89/maxbooster75). Updating that project through its available agent is distinct from
exact file synchronization and from publishing a deployment; each result needs
its own read-back and checks. This report does not claim that launch gates have
passed or that a main-branch merge, production publication, shared-data migration,
external post or live charge occurred. The saved Sophia Agents API session was
not launched; available execution and authenticated GitHub tools performed the
work described here.

The latest observed Replit publication status is failed for deployment
`8b64bd32…` at `maxbooster.replit.app`; the deployed source revision is unknown.
Read-only public health/readiness requests returned non-JSON 404 responses. These
observations do not identify the deployment failure's cause and supply no live
readiness evidence. The inspected prior GitHub Actions run `40043991933` reports
failure with zero executed job steps; it supplies no hosted CI pass. Final local
checks and any later hosted execution must be reported separately.

Three authenticated Replit Agent read-only requests timed out, including the
bucket-specific request. An anonymous metadata-only bucket probe returned 401;
no object contents were requested. This is an access limitation, not evidence
that the supplied bucket lacks a candidate. Project synchronization, configuration
restoration and their read-back remain unverified until the connector responds.
