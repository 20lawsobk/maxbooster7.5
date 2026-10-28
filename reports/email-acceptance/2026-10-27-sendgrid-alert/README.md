# Monitoring email acceptance — October 27, 2026

Scope: the actual alert service, its Express monitoring route and a bounded
SendGrid protocol transport. Local controlled middleware/provider boundaries
and owned HTTP sockets are explicit; no external email was sent.

| Attempt | Cases | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Initial previous service | 7 | 4 | 3 | 0 |
| Initial repaired service | 7 | 7 | 0 | 0 |
| Per-channel previous service | 8 | 4 | 4 | 0 |
| Per-channel repaired service | 8 | 8 | 0 | 0 |
| Final previous service and route | 11 | 4 | 7 | 0 |
| Final repaired service and route | 11 | 11 | 0 | 0 |

Each before/after pair executes the same test source for that attempt. The final
baseline was extracted from `c06fbecdb32a5c3b76662f631604bfd9abac386b`;
the obsolete SDK boundary preserves its real CommonJS default-export shape.
The old service cannot call `.default.send`; the old route always reports
success. Actual before failures and intermediate passing receipts are retained.
Final source hashes are in `summary.json`; command exits, timestamps, log hashes
and durations are in the corresponding `*-receipt.json` files. Final scoped
runtime/test lint passes, as does the new transport's standalone strict type
check. Full integration/type evidence for the forthcoming source checkpoint
must be read separately.

[Usage and every case's purpose](../../../docs/testing/monitoring-alerts.md).
The canonical command is `node --import tsx --test --test-concurrency=1 tests/sendgrid-alert-transport.test.mjs`.

HTTP 202 means provider acceptance. This rehearsal does not establish inbox
delivery, production provider configuration, real admission-middleware policy,
cross-instance cooldown, deployed readiness or global launch readiness.
