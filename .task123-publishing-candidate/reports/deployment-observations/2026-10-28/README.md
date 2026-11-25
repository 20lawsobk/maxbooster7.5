# Current configured Neon schema observation

Observed October 28, 2026 through the configured `DATABASE_URL` Neon binding.
The actual HTTP transaction used `readOnly: true` and `RepeatableRead`; the
first result confirmed `transaction_read_only = on`. Only
`information_schema.columns` was read. No application rows, host identity,
connection string, credentials or provider response bodies are retained.

The current ORM declares **312 tables**. **Ten schema entries have drift**:
missing deletion/fencing/dependency/migration journals, hybrid storage metadata
and imports, social media jobs, and required fabric object/chunk columns.
`neon-schema-readonly.json` enumerates exact missing tables/columns. This confirms
that the configured database cannot yet admit the repaired storage/job runtime.
It does not identify a published Replit deployment or prove an offsite backup.

The concrete ordered migration runbook remains
[storage and archives](../../../docs/testing/storage-and-archives.md) and
[the execution plan](../../../docs/testing/completion-execution-plan.md).
Drain incompatible writers/controllers, verify a recoverable joint SQL/PDIM
backup, apply reviewed migrations0096–0099, check invariants and schema, then
start compatible writers with controlled canary/recovery evidence. These steps
have **not** been performed against this configured database. No production
DDL was attempted during this read-only audit.

The adjacent driver is the exact executed program. It imports the real ORM
schema and the existing `compareSchema` implementation, selects only the
configured Neon binding, retains the inherited approved proxy and TLS trust,
uses a15-second HTTP bound and redacts connection failures to an error code.
It writes one new output filename with exclusive creation. To repeat, copy it
to an owned new evidence directory, update its output directory literal and
use the prepared Node22/tsx runtime from the repository root. Its absolute
repository path is provenance for this workspace; adjust it for another clone.
The exit was **1** because schema drift is a failed gate, rather than a failed
network connection. The successful read is not production approval.
