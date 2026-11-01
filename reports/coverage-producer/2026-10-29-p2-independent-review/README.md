# Independent P2 admission review

Decision: **blocked for production integration**. This is an outside prototype review. No root source, configuration, tests, or canonical reports were modified; no provider or application workflow was executed.

`findings.json` records four concrete gaps with acceptance criteria. `negative-controls.json` proves the current exported gates accept an explicit unhandled-error log, an empty implementation inventory, and conflicting duplicate TAP totals. The empty-inventory full-CLI consequence is also established by its zero-iteration validation loop; the current stale root prevents full admission, so this is not represented as a successful current-source CLI exploit.

The strongest runtime control uses actual pinned Vitest4.1.12. Its JUnit-only reporter reports a passing case with zero failures/errors despite an intentionally unhandled Promise rejection. With all four thresholds100, the command exits1 and logs exactly four threshold errors, satisfying the prototype's purported threshold-only failure check. Repeating with thresholds0 still exits1 and emits no unhandled diagnostic under JUnit-only. Adding the default reporter exposes the actual unhandled rejection. This proves a trusted structured run result with unhandledErrors0 must be bound before production coverage admission; stricter text matching alone is insufficient. The diagnostic threshold overrides apply only to this tiny outside fixture.

`path-control.json` is a faithful isolated reproduction of the lexical output guard accepting an ancestor symlink escape; it is not a full CLI execution. All paths stayed within independent review scratch and the temporary link/output were removed.

The exact counter addition, source equality, original typed maps/IDs, nonfinite/overflow guards, raw record equality and zero preservation are useful existing safeguards. No original counters were merged into published coverage. The prototype's own52 passing controls do not cover these newly exposed gaps.

`manifest.json` hashes retained regular files, excluding installed dependency selector symlinks and generated Vite caches/coverage output. Root files and frozen candidate source were not edited.
