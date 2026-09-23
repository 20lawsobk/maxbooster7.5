# Credential-free production-process simulation

Scope authorized by owner: simulate production processes without provider API
keys; owner will publish. External providers are explicitly simulated, never
claimed to have accepted a real transaction or delivery.

## Current handoff — scaled two-worker simulation PASS

The host-admission and namespace-unsupported observations later in this file are
**historical and superseded**. The latest current-source canonical report for
`2026-09-23T18-57-24-314Z` records **PASS** with `copy`, `build`, `size`,
`restore`, and `startup` complete, no failures, and source isolation enforced.
The build exited **0**, five actual capsule SHA-256 hashes matched manifests,
cold critical/background restores exited **0**, warm restore idempotence
passed, and the disposable footprint measured **4.729 GiB** under the 8-GiB
limit. The 17 approved refreshed source path hashes and external harness hash
match the current checkout and preserved copy. Parallel capsule packing was
retained.

The owner's production Reserved VM is **16 vCPUs / 64 GiB**. This isolated
development run had **4 effective CPUs / 8-GiB cgroup memory** and explicitly
used `APP_WORKER_CPU_SHARE=0.5` plus `CLUSTER_WORKERS=2`: two real app HTTP
processes **time-share the existing one-CPU total app CPU role budget** rather
than claiming two dedicated cores or production throughput. The packaged
policy admitted two app workers at 1,219 MiB each, one MaxCore worker, and
unchanged role reservations/headroom; the production worker CPU share
defaults to 1. Primary PID **4109** owned the sole MaxCore root (PID **4133**)
and in-process PDIM listener; real HTTP workers **4126** and **4138** were
both live and did not own a MaxCore root. The local packaged model reported
HTTP **200**, `status=healthy`, `model_loaded=true`. Three full-ready HTTP
**200** `ok` probes were spaced **6,031/6,039 ms**; mandatory authenticated
warmup passed **20/20**. Packed measured load passed **150/150** at **100%**
success, aggregate **P95 150.836 ms / P99 179.888 ms**, against unchanged
**99% / 500 ms / 1,000 ms** thresholds.

Under normal synthetic-admin session/MFA/CSRF protection, job creation
returned HTTP **202** on worker **4126** and a cross-worker lookup returned
HTTP **200** on worker **4138** (state `running`), with a job in the
**private durable store**.
This verifies the scoped durable lookup and cluster-primary ownership, not
successful off-VM external backup. Controlled teardown recorded startup exit
**143** after acceptance; the disposable copy remains retained. The earlier
`DISABLE_CLUSTER=true` single-process result (**150/150**, P95/P99
**69.139/77.562 ms**) and the `-attempt-3.json` failed resource-admission
attempt remain preserved historical evidence, not additional cluster passes.

The separately retained-PDIM pre-deployment recovery simulation also passed.
Its external object-store boundary was simulated; publication and actual
provider writes, charges, settlement, delivery, live-bucket use,
production-user-content recovery, and production 16-vCPU/64-GiB throughput
were not performed or claimed. Publication remains owner-controlled;
`productionReadiness.publishReady=false` is retained.

## Executed pass

`env -i PATH="$PATH" HOME=/tmp node scripts/production-provider-simulation.mjs`

Real disposable PostgreSQL and actual commerce/reconciliation consumers passed
the bounded provider-process scenario. Accepted-before-response-loss, delayed
duplicates, identity mismatch, retry, and an actual worker-process restart were
exercised. Simulated Stripe transfer/payout and Too Lost acceptance occurred
once; three committed journals balanced through actual SQL queries. No external
credentials or live/shared database were used.

Detailed coverage, source attribution and unsupported scenarios:
`reports/production-provider-simulation-2026-09-23T13-38-45-796Z.md`.

## Historical host-admission result — superseded

The following records an earlier attempt only. It is not a current limitation,
current namespace finding, or current release decision.

The current-source packed runtime simulator now prepares real isolated PostgreSQL,
local PDIM and owned MaxCore rather than port-9 dependency placeholders and
historical subsystem capsules. Native-descendant isolation requires a network
namespace. Actual host preflight returned `Operation not permitted`; memory
headroom was also below the stated admission threshold on the 4-CPU/8-GiB host.
The build/cold boot/model run therefore did not execute. This is a simulation-host
limitation, not a reproduced production application failure.

Command:
`env -i PATH="$PATH" HOME=/tmp LANG=C TZ=UTC node scripts/simulate-production.mjs --new`

Evidence: `reports/production-simulation/2026-09-23T13-49-18-813Z.json`.

Authenticated HTTP load has an explicit isolated mode preserving the existing
99% success / 500ms P95 / 1000ms P99 thresholds. Its actual invocation failed
capacity admission before PostgreSQL or application startup because less than
1536 MiB headroom was available. No load results were fabricated.

Command:
`env -i PATH="$PATH" HOME=/tmp node scripts/readiness-assembled-acceptance.mjs --http-load`

Evidence: `assembled-authenticated-http-load.json`.

## Historical handoff — completed and superseded

Run the remaining harnesses on an approved isolated runner with sufficient free
memory and network-namespace permission. Never kill platform processes, run the
destructive packed build in the source workspace, substitute shared Neon, disable
MaxCore, or waive thresholds to manufacture a pass.

At that historical point no deployment was performed or suggested as ready.
Credential rotation and actual external provider permissions/delivery/settlement
still cannot be certified by credential-free simulation. The former
namespace/capacity limitation is superseded by the **scaled** cluster gates
documented above, not by a production-capacity or provider-outcome claim.
Publication remains owner-controlled.