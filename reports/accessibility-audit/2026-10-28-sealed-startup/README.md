# Sealed master browser startup correction

October28,2026. The full `a1603b13` master retained one Node failure: the shared
navigation browser never reached its debugger endpoint. No navigation assertion
ran in that failed attempt. The original master log is preserved here; it is not
relabelled by this focused passing correction.

## Actual cause and counterexample

A direct invocation of the canonical Node runner passed the unchanged test's
nine navigation cases. The master adds another `common.run_command` isolation
layer. Repeating that exact layer reproduced exit1 after10.804seconds. A matching
credential-free Chromium launch exited with SIGABRT and the actual diagnostic
**`Socket path too long`** for `org.chromium.Chromium.../SingletonSocket`.
The nested parent homes, test profile, Chromium temp subdirectory and socket name
exceeded the Unix-domain socket path limit. This was a fixture path defect,
not evidence that the navigation source had regressed.

The fixture now allocates a short private owned Chromium temporary directory
under the standard POSIX `/tmp`; Windows retains its normal temporary root.
The browser's HOME and user profile remain private, no application credentials
are inherited, and the new directory is removed by the test cleanup hook after
the existing owned browser-process cleanup. No product file, runtime policy,
sandbox flag, retry, deadline or original navigation assertion was changed.

Startup now fails immediately on a real early browser exit or spawn error and
retains a bounded stderr tail. The same10-second startup deadline remains.
Two actual child-process regressions prove exit37/stderr and an absent binary
are reported rather than hidden behind a startup timer. Those are harness
checks, not additional product acceptance cases.

## Validation

The exact nested canonical runner now exits0 in2.287seconds: all **nine original
navigation leaves pass**, and the two startup harness cases pass. TAP reports12
passes because it also counts the navigation parent. There are zero failures or
skips. File ESLint and whitespace checks pass. The production layout files are
unchanged and their current hashes are retained in `summary.json`.

The commands use prepared Node22, Chromium, root dependencies and an existing
ordinary `npm run build` CSS payload. Do not use the destructive publishing
`build.sh` in the source checkout. To rerun the exact isolation depth from the
repository root, select a **new** output directory:

```sh
python3 - <<'PYCODE'
import pathlib, sys
sys.path.insert(0, 'scripts/testing')
from common import run_command
out = pathlib.Path('/tmp/maxbooster-new-navigation-check')
result = run_command([
    sys.executable, 'scripts/testing/run-node-suites.py',
    '--file', 'tests/layout-navigation-accessibility-browser.test.mjs',
    '--output', str(out / 'node'),
], out / 'outer.txt', 60)
print(result)
sys.exit(result['exitCode'])
PYCODE
```

The wrapper constructs credential-free child environments at both levels.
Configure the same Node22/tool paths, `LD_LIBRARY_PATH` and `CHROMIUM_PATH` as the
[master instructions](../../../docs/testing/README.md). `before/` is the direct
one-level control; `master-nested-before/` and `master-nested-after/` retain the
actual counterexample and passing correction, with exact command receipts.
`chromium-master-nested-stderr.txt` records the abort, while `test-before.mjs`
retains the original committed test. The original nine assertions, product
source hashes and the two cleanup/diagnostic boundaries remain explicit.

This closes only the demonstrated browser fixture startup gap. Full-platform,
coverage, manual accessibility, provider, target-deployment and capacity gates
remain separate and unverified unless their own actual receipts establish them.
