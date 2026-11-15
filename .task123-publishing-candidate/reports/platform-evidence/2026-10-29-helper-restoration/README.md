# Owned SQL restoration regression

The original helper was corrected after lint rejected an explicit throw in its
finally block. The current helper captures the operation outcome, always
attempts original-field restoration, and preserves both errors in an
AggregateError when operation and restoration fail together. No error is
suppressed to satisfy lint.

The actual [execution receipt](receipt.json) has exit0 and unchanged source.
The [13 checks](helper-sql-acceptance.json) cover all five policy states after
success and intentional callback failure, unknown-state and wrong-proof
rejection, and a genuine restoration failure after dropping only the owned
disposable database's users table. SQL timestamp microseconds are retained;
PostgreSQL is stopped and its temporary directory removed.

This is test-fixture behavior, not a production feature or page Green. The
[earlier 110-case HTTP run](../2026-10-29-main-access-policy/receipt.json) retains
its original source scope; the next frozen master re-executes the current
helper through those application journeys.

Replay only from the prepared repository with disposable PostgreSQL tools:

```sh
env -i PATH="$PATH" HOME=/tmp LANG=C node --import tsx \
  reports/platform-evidence/2026-10-29-helper-restoration/test-restoration.mjs
```

The script creates and destroys its own database. It never accepts a production
database URL and supplies its own generated isolation proof. Preserve this
cohort before replay, which replaces its helper receipt.
