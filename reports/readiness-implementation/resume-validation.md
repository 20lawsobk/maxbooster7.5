# Resumed implementation and verification

This records executed work, not a replacement instruction set or release certification.

## Completed source repairs

- Mounted signed notification/Resend callbacks and narrowed provider CSRF exemptions to exact POST paths. Governance verifies callback signatures before exemption.
- Connected Settings MFA replacement/disable and queued account-erasure status/cancel to the actual security contracts.
- Preserved legacy financial evidence in a nonwithdrawable reconciliation section. Payout reports distinguish currencies and legacy records.
- Persisted marketplace orders and frozen settlement terms before payment. Verified webhook processing reuses canonical order identity.
- Persisted owner-scoped withdrawal command keys across reloads, with account fencing and Web Locks.
- Declared all 29 readiness tables in the canonical schema, matching the authored SQL.
- Removed unreachable simulation/fallback code and corrected server/client type errors.
- Cancellation reasons now persist atomically with payout release. Statement identifiers are validated before funding calls.

## Executed evidence

- Full server TypeScript check: PASS.
- Full client TypeScript check: PASS.
- Latest commerce contracts: 22 tests PASS.
- Latest focused account/offline/MFA contracts: 17 tests PASS.
- Broad isolated simulation: see `beta-simulation.json` and `beta-simulation.md` for the latest completed cycle, commands, hashes, outputs and limitations.
- Temporary PostgreSQL rehearsal: 12 readiness migrations applied; 29 tables, 205 columns, 77 structural constraints and 50 indexes matched. Append-only ledger DELETE/UPDATE rejection preserved original rows. Temporary databases were removed.
- Preview capture: connection refused. No browser journey or assembled-app acceptance is claimed.

## Boundaries still requiring resolution

No live migrations, storage conversion, provider activity, payments, messages or publishing were performed.

The application remains unavailable in preview. Restart/live acceptance must follow approved migration and storage-cutover preparation; isolated contract tests do not establish safe live activation.

Remaining gates include reviewed backup/rollback and historical migration provenance; legacy financial and storage reconciliation; persistent encryption/webhook configuration; browser/device/session acceptance; actual provider and concurrency drills; nested dependency/runtime verification; cold-image/load acceptance; retention/erasure policy; and qualified AI datasets/models where the domain reports identify missing capability.

`releaseReady` remains false. Passing tests are evidence about the exercised contracts, not a claim that all 80 audit findings or the entire platform are complete.