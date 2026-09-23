# Credential-free production-process simulation

Scope authorized by owner: simulate production processes without provider API
keys; owner will publish. External providers are explicitly simulated, never
claimed to have accepted a real transaction or delivery.

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

## Not executed: host admission blocked

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

## Handoff

Run the remaining harnesses on an approved isolated runner with sufficient free
memory and network-namespace permission. Never kill platform processes, run the
destructive packed build in the source workspace, substitute shared Neon, disable
MaxCore, or waive thresholds to manufacture a pass.

No deployment was performed or suggested as ready. Credential rotation, actual
external provider permissions/delivery/settlement and a deployed-artifact check
cannot be certified by credential-free simulation. The launch task remains open.