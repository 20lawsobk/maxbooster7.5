# Linux desktop module-path and native-resource repair

October 28, 2026. **Limited packaging/loader checks pass; desktop launch remains
NO-GO.** This cohort continues the earlier
[Linux observations](../2026-10-27/feasibility.json), rather than replacing their
failures or claiming an installer/global launch certificate.

## Confirmed defects and implementation

The original main process preferred the physical unpacked ESM server entry.
Actual Electron execution reproduced `ERR_MODULE_NOT_FOUND` for Zod because its
package lives inside `app.asar`, outside that entry's module-parent chain.
`electron/runtime-policy.cjs` now selects the virtual archive entry first;
`electron/main.js` forks that exact entry with a physical working directory.
Electron transparently reads the unpacked entry's bytes while preserving the
archive's dependency ancestry. Development ESM/CJS entries and explicit missing
entry behavior retain their own cases.

The next actual artifact failures established that the build explicitly omitted
TensorFlow.js, despite the server importing it, and retained Sharp's libvips
shared library inside ASAR while the native addon needed a physical adjacent
library. The root build config now includes the installed TensorFlow packages
and unpacks only `node_modules/@img/sharp-*/**/*` together. Both embedded legacy
root manifests carry the same two build-policy corrections, with their prior
accepted content hashes preserved. No dependency versions, lockfiles, provider
configuration, sandbox settings or production data were changed by this repair.

## Actual results

| Check | Outcome and evidence |
| --- | --- |
| Six development/ASAR selection cases under ordinary Node | Original helper absent: **6 failures** in [before JUnit](policy-before.xml). Current Node 22.23.3: **6 passes**, zero skips, in [after JUnit](policy-after-node22.xml). |
| Complete guarded legacy replay | [Full replay](legacy-full-replay.xml) and [caller/transport coherence](legacy-build-config-replay.xml) pass, including known predecessor admission, unknown source rejection and idempotence. These are separate tests, not added desktop-journey totals. |
| Current ordinary production build in owned copy | **PASS**, 33.081 seconds, [receipt](owned-production-build.json). The older dist was correctly rejected before rebuild; its manifest was never edited to make it pass. |
| Configured Linux x64 DIR packaging | **PASS**, 37.445 seconds at one CPU, [receipt](configured-linux-dir-build.json). Native rebuild defaults retained; `--publish never`. This is a directory target, not AppImage/DEB/macOS/Windows acceptance. |
| Actual packaged artifact | [Inspection](artifact-inspection.json) binds the 414,648,591-byte ASAR and executable hashes, verifies four exact current owned-build entry bytes, TensorFlow package presence and all four physical Sharp addon/libvips entries. Binaries are outside the repository. |
| Real Electron ASAR resolver | **PASS** on Electron 43.8.3/embedded Node 24.22.0. [Native receipt](runtime/asar-module-acceptance.json) proves the physical Zod failure, actual archived helper selection, successful virtual Zod validation and cleanup. |
| Actual packaged TensorFlow operation | **PASS**, [result](runtime/actual-tfjs-operation.stdout.txt): installed TFJS 4.22.0 performs real scalar addition, resulting in 3. This is a package/runtime check, not semantic content-generation quality. |
| Actual packaged Sharp render | **PASS with retained warnings**, [result](runtime/actual-sharp-png.stdout.txt): libvips 8.18.7 generates a 95-byte PNG with the real PNG signature. [stderr](runtime/actual-sharp-png.stderr.txt) retains upstream `SharpElectronLinux` and GLib warnings; broader rendering stability remains open. |
| Full exact bundled backend | **FAIL**, [real child](runtime/exact-bundled-server-child.json): the build-host-recompiled bcrypt requires `GLIBC_2.38`, absent from the Debian 12 offline runner. [stderr](runtime/exact-bundled-server-child.stderr.txt) preserves the native loader error. The run passed the formerly missing Zod/TFJS/Sharp import stages; it did not reach configured readiness. |
| Normal GUI sandbox startup | **UNVERIFIED due to fixture prerequisite**, [receipt](runtime/normal-sandbox-startup.json): Chromium refuses the read-only nonroot-mounted sandbox binary without root ownership/mode 4755 or permitted user namespaces. Product sandbox settings remain enabled. |
| Diagnostic GUI run | **Not production acceptance**. The explicitly isolated `--no-sandbox` diagnostic repeats the actual backend libc failure and is fixture-terminated after ten seconds. Exit 0 after that controlled termination does not prove a ready backend, rendered page, privacy boundary or supported sandbox. |
| Isolation and cleanup | [Actual Docker inspection](actual-runtime-isolation.json): network none, unprivileged, read-only root, nonroot, CPU/memory/PID limits, only owned artifact/controller/project read-only mounts. [Final state](runtime-final-state.json) confirms the named container is absent. No application/provider/database credentials entered child environments. |
| Original source provenance | [Guard](original-integrity-after.json): all common source inputs remained unchanged, digest `0dc7f121807e1f9973853d60171b94d51911ad5bacae2477c364cc16ae1e27ac`; six selected source/config/test files and three lockfiles match. This does not claim a complete original installed-tree byte inventory. |

## Reproduction and preserved attempts

Use the [canonical instructions](../../../docs/testing/electron-asar-module-acceptance.md)
for the portable six-case Node suite and explicit-native-runtime loader test.
No Electron auto-install or internet access is needed by either test when its
stated dependencies/runtime are already prepared.

`final-build-driver.py` and `offline-driver.py` retain the exact bounded owned
copy/build and offline execution procedures used here. They refer to this
cohort's specifically owned `/tmp` paths; reproduce with new owned paths and a
new report directory, not by overwriting this evidence. The full selected source
inventory, copy admission, original build validation failure, actual build logs,
runtime commands, exit codes and raw stderr remain available beside this file.
The verified Electron ZIP was 127,277,783 bytes with SHA256
`73d7d6fe120c998db75834c23c8ce7ce8390607c198b2e167a28acd7937bef22`.

Two pre-execution harness corrections remain explicit. The first copy preflight
incorrectly required old build hashes even though the purpose was to rebuild
changed source; [receipt](initial-copy-preflight-error.json) and the initial
script are retained. Corrected preflight copies actual current bytes and lets
the ordinary build validator reject stale dist. The first offline driver omitted
`/usr/local/bin` from PATH, so Docker never started; its [trace](offline-driver.initial-path-error.txt)
and initial script are retained. Corrected execution uses Docker's explicit
local binary/socket. The earlier prototype Sharp probe imported an internal
binding as a high-level function; its TypeError remains in the earlier cohort.
The final probe imports Sharp's actual public ESM entry and asserts output bytes.
These harness failures are not silently recategorized as passing product tests.

## Remaining desktop acceptance gates and order

1. Establish and test the supported Linux libc baseline. Build native addons on
   that baseline in an owned reproducible toolchain, or explicitly enforce a
   documented supported distribution floor, then rerun actual bcrypt hash/verify
   and the complete bundled server. No copied binary workaround is launch proof.
2. Rehearse normal sandbox execution under the actual installed-package ownership
   and namespace model. Retain sandbox and renderer isolation; the diagnostic
   flag is never a production fix.
3. Validate Sharp's upstream Electron/Linux warning against all advertised media
   operations and concurrency, or repair the demonstrated incompatibility.
4. Complete the local-versus-remote desktop backend contract: private writable
   state, database/provider configuration, migrations, workers and imported
   MaxCore/PDIM/Python children are not distribution secrets. Replit server keys
   cannot be packaged into a public desktop client. Resources cwd is physical
   but read-only in this fixture; writable-state behavior needs explicit design.
5. Verify an actual GUI page, session/account isolation, offline recovery and
   update paths; then each configured OS/installer/device and signing lane.
   Existing GitHub native jobs did not execute because of the separately
   recorded account billing lock. A passing Linux DIR build does not close them.

All these gates stay tracked. This cohort grants no global launch approval and
marks no page end-to-end Green from these limited checks.
