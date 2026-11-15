# Full Node-group recheck after the Chromium socket fixture repair

On October 28, 2026, at08:12:32 America/Detroit (12:12:32UTC in the receipt),
the complete canonical Node group passed from committed source
`cb783f1f9b34719a214dd7f9203a31dea64c051e` in126.867seconds.
All122 files passed their execution status. Actual TAP totals are646 tests,
644passes,0failures,2skips and0cancelled. Nested parent cases are included;
these counts are not a count of unique product behaviors or platform coverage.

The common source/config/test input digest was unchanged before/after:
`eba9dafdb3a96f430c05e6782cd9b23b21f5eeb01ba71c51e9b9875a313dbd07`.
`receipt.json` records the real outer command, exit, duration and log hash.
`source-inputs.json` retains the exact input-file hashes. The outer command uses
the same clean-environment process helper as the master, so this recheck retains
its additional isolation layer. Nested file commands and log hashes are in
`node/results.json`, with every original TAP log alongside it.

## What changed and what this proves

The [completed a160 full master](../../test-verification/history/2026-10-28-a1603b13-master/README.md)
failed one Node file before its navigation assertions: Chromium aborted because
nested TMPDIR paths exceeded its Unix SingletonSocket limit. The only later
source change was `tests/layout-navigation-accessibility-browser.test.mjs`.
It now gives Chromium a short private owned temporary directory, keeps the
same startup deadline and original nine AX/keyboard assertions, and reports
bounded stderr on real spawn/early-exit errors. It adds two harness diagnostics,
not additional product accessibility cases. The same nested reproduction changes
fromfailure in10.804seconds to pass in2.287seconds; the
[versioned startup cohort](../../accessibility-audit/2026-10-28-sealed-startup/README.md)
retains the original master timeout, direct one-layer pass, exact nested failure,
Chromium SIGABRT/socket diagnostic and corrected pass.

In this full recheck the navigation test passes allnine product leaf cases and
two startup diagnostics, with12TAP cases including its navigation parent.
Production layout code, case assertions and the startup deadline did not change.
This is the complete Node-group recheck. The other master groups were not rerun
against cb783f1f, and the original a160 full-master failure remains unchanged.
It does not establish100% coverage, all80-page accessibility, deployed provider
journeys or launch approval.

## Explicit skips

- `tests/deployment-rust-phase.test.mjs`: “real Rust compilation survives concurrent workspace cleanup”.
- `tests/runtime-bucket-restore.test.mjs`: “real private bucket backup restores, rejects bad hashes, and preserves newer seeded files”.

These exact invocations are skipped, not passing native/private-bucket proof.
Separate Rust, recovery and provider receipts retain their own execution scopes.

## Repeat the group

From the repository root, select the prepared Node22 runtime and installed root
lockfile dependencies. Provide actual Chromium and its required system libraries;
run `npm run build` first in a normal source checkout so the navigation test has
the production stylesheet. The master already supplied that build for this run.
Do not rebuild or mutate source while another release/source-bound test is active.
Use a new owned output directory to preserve each prior attempt:

```sh
python3 scripts/testing/run-node-suites.py \
  --output /tmp/maxbooster-node-new-owned-run
```

For only the affected file, retain its actual nine product assertions and two
startup diagnostics through the same canonical file selector:

```sh
python3 scripts/testing/run-node-suites.py \
  --file tests/layout-navigation-accessibility-browser.test.mjs \
  --output /tmp/maxbooster-navigation-new-owned-run
```

[General setup and safety boundaries](../../../docs/testing/README.md) describe
Node/Chromium/SQL/codec prerequisites and clean fixture ownership. The runner
constructs isolated test environments and does not use application/provider
credentials. A missing required binary or failed assertion must remain a real
failure; neither a longer timeout nor a retry is the socket-path repair.

`manifest.json` hashes every retained artifact in this versioned recheck except
itself, including this instruction file. No previous master log was overwritten.
