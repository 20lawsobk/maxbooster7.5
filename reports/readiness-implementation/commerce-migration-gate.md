# Commerce migration gate

**Status: BLOCKED — no schema apply was performed.**

The standalone gate pins the exact files `0022_commerce_webhook_receipts.sql` and
`0023_commerce_settlement.sql` by SHA-256 rather than treating the duplicated
numeric prefixes or incomplete Drizzle journal as migration history. Its default
CLI path is a read-only catalog preflight. Existing partial objects fail; existing
complete objects remain unverified unless compared with a catalog signature made
from the exact SQL in an isolated schema.

Apply is library-coordinated and requires all of the following: the exact
operator flag, a target explicitly classified non-live, fresh source/dump/restore
fingerprint and schema-digest evidence, a separately verified private
generation-pinned stored backup object with matching digest and active retention,
a retained, generation-pinned recovery evidence record, and a dedicated external
receipt-manifest adapter. A report-level pass boolean is not accepted as recovery
proof. Receipts contain exact filenames and digests and are written only for newly
applied files after commit.

The apply transaction sets lock and statement timeouts, takes a transaction-level
advisory lock, rechecks catalog prerequisites under that lock, executes only the
two pinned SQL bodies, and requires exact catalog postconditions before commit.
The rehearsal API additionally exercises rollback, balanced commit, deferred
unbalanced rejection, append-only triggers, row-count proof, and advisory-lock
exclusion when a second PostgreSQL client is supplied.

Current release blocker: the storage/recovery worker has not yet supplied and
retained protocol-v1 stored-object restore evidence or the external receipt
manifest store. The isolated unit command
`env -i PATH="$PATH" HOME=/tmp node --test tests/commerce-migration-gate.test.mjs`
passed 4/4; an actual PostgreSQL rehearsal remains blocked on an approved
disposable target. Therefore schema apply readiness remains blocked. No database
URL, database mutation, workflow start, broad schema push, invented migration
history, or live apply was performed for this report.