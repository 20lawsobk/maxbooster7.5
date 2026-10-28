# Shared navigation accessibility cohort

The same final Chromium test source reproduces2PASS/7FAIL in the original HEADc06 layout sources, then9PASS/0FAIL/0SKIP after repair. JUnit leaf count9 is authoritative; TAP10includes the parent. Actual Accessibility names, DOM semantics and native keyboard events are exercised, with production CSS and actual shared navigation components. Authentication and unrelated widgets are isolated fixtures.

Read [the full audit, commands, all80 declarations and explicit acceptance criteria](../../../docs/testing/accessibility-launch-audit.md). The [focused receipt](focused-receipt.json) records command/exit and before/after source hashes; [page-matrix.json](page-matrix.json) retains all80 page IDs and2,162 section IDs. Every full-page accessibility status remains UNVERIFIED. No full compliance, real-auth, provider, mobile screen-reader or launch approval is inferred.

Historical attempts are retained: before.txt and after.txt used an incomplete synthetic Enter event; after-keyboard.txt fixed the native keycode/text. before-final-test.txt reran the same final test against originalHEAD source in a2second owned-file try/finally transaction, then restored all fixed bytes (receipt records this). after-final.* is the final source-stable pass. Types and lint pass separately. build-evidence.py is the recorded environment-specific reproduction wrapper; use a new cohort for later source snapshots.

manifest.json binds every cohort artifact except itself by SHA256 and byte count. It is evidence integrity, not a compliance certificate.
