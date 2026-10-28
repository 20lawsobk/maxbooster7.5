# Max Booster master verification evidence

Read [recorded results](../../docs/testing/results.md) with their timestamp,
source-input digest, actual exit codes, skips and blocked prerequisites.
[Usage instructions](../../docs/testing/README.md) explain the complete master
and every supported group; the [catalog](../../docs/testing/catalog.md) lists
each canonical test's purpose, command and prerequisites.

- `orchestration/results.json` records every command and the source stability
  check. `orchestration/source-inputs.json` identifies the actual tested inputs.
- `summary.json`, `case-results.json` and `file-status.json` reconcile real
  outcomes. Group counts overlap and must not be added into a grand total.
- `coverage/` retains raw counters and summaries. Python coverage is separate
  under `python/`; Node/browser profiles cannot be merged without compatible
  source identity and complete maps.
- `platform-register.json`, `remediation.json` and `completion-plan.json`
  retain the complete 80-page, backend and shared-platform inventory, exact
  evidence gaps and detailed remaining work. Planning completeness is separate
  from execution acceptance.
- `history/` preserves earlier attempts. The full repaired baseline is also
  retained in Git at `c06fbecdb32a5c3b76662f631604bfd9abac386b`.

The isolated sweep uses disposable resources and does not establish deployed
Replit/provider delivery, native device behavior or global capacity. The
[launch gate ledger](../../docs/testing/global-launch-readiness.md) retains
those requirements. A passing subset, page render or configured secret does
not establish production readiness.
