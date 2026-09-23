# Credential-free production-process simulation

Scope authorized by owner: simulate production processes without provider API
keys; owner will publish. External providers are explicitly simulated, never
claimed to have accepted a real transaction or delivery.

## Current handoff — partial pass; cluster acceptance open

The host-admission and namespace-unsupported observations later in this file are
**historical and superseded**. Canonical current-source run
`2026-09-23T18-57-24-314Z` subsequently completed in a distinct unprivileged
user/network namespace with canonical build exit 0, loaded-model health,
three stable full-readiness probes, cold and warm capsule acceptance, and
authenticated load of 150/150 at P95/P99 69.139/77.562 ms. That run used
`DISABLE_CLUSTER=true`; its model/load result remains valid only for the
single-process scope. The current decision is **PARTIAL PASS**. Recovery/cluster
integration and cluster-packed acceptance remain open pending the shared-authority
and durable-job recovery fix plus an enabled-cluster run with at least two app
workers and unchanged gates.

The retained-PDIM pre-deployment recovery simulation also passed. Its external
object-store boundary was simulated; publication and actual provider writes,
charges, settlement, delivery, live-bucket use, and production-user-content
recovery were not performed or claimed.

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
namespace/capacity limitation is superseded, but complete pre-deployment
acceptance remains open for the cluster gates described above. Publication
remains owner-controlled.