# Remove build-host bcrypt shadowing from desktop artifacts

October 28, 2026. **The confirmed native-loader packaging defects are repaired.**
This continues the [preceding artifact cohort](../2026-10-28-final/README.md),
which retains its actual libc failure. Desktop production acceptance remains
open; the new complete child correctly reaches the private configuration guard
in a deliberately credential-free fixture.

## Root cause and exact repair

The actual installed bcrypt 6.0.0 package supplies published platform prebuilds.
Its canonical Linux x64 glibc binary requires only GLIBC 2.14/2.2.5, as recorded
by [readelf](canonical-prebuilt-elf.txt). Electron-builder's default native
rebuild produced an additional `build/Release/bcrypt_lib.node` on this newer
cloud host, requiring GLIBC 2.38 ([readelf](owned-rebuilt-elf.txt)). Both bytes
entered the preceding artifact. `node-gyp-build` selects a local Release build
before a published prebuild; the incompatible host binary shadowed the usable
one in the Debian 12 runner.

An actual offline diagnostic first selected the canonical published binary
using `PREBUILDS_ONLY=1` and proved real bcrypt cost-12 hashing, correct Unicode
password verification and wrong-password rejection. Its [command and result](actual-canonical-bcrypt.json)
are retained. That environment override was a diagnostic, never a product fix.

The root Electron build `files` policy now excludes exactly
`!node_modules/bcrypt/build/**/*`. Both embedded legacy root build manifests
carry the same rule, preserving their verified predecessor hashes. Default
native rebuild behavior, dependency versions, lockfiles, installed graphs,
other native modules and every published bcrypt platform prebuild remain.
The distributed app uses its canonical platform binary through the ordinary
loader, with no global `PREBUILDS_ONLY` setting.

## Meaningful canonical regression

The existing `tests/electron-asar-launch-policy.test.mjs` now has **nine cases**:
six launch-path cases and three real packaging/filter/loader cases, one for
the root manifest and each embedded legacy manifest. The new cases stage the
actual installed bcrypt package plus a deliberately invalid owned local build.
They prove the actual native loader prefers that local build before packaging,
apply the installed electron-builder node-module filter from the real manifest,
verify that the shadowing build was removed, compare every published platform
binary byte for byte, and require the actual default loader to select a
published prebuild afterward. The invalid fixture binary is never executed.

Before the policy correction, the same nine cases produce **six passes and
three assertion failures** ([JUnit](policy-before-final-test.xml)); afterward,
all nine pass. The combined policy and existing complete legacy replay/coherence
run is **18 passes, zero failures, zero skips** ([JUnit](policy-and-legacy-after.xml)).
The legacy tests are separate from the nine policy cases and are not additional
desktop business journeys.

Run the reusable canonical regression from the repository root:

```sh
node --test tests/electron-asar-launch-policy.test.mjs
```

It requires the installed root `@electron/asar`, `app-builder-lib`, bcrypt and
`node-gyp-build` packages, ordinary Node 22, and no Electron download, network,
application credentials or external database. Owned fixture trees are removed
through the test runner's cleanup hook. The actual native artifact proof below
has a separate explicitly prepared Electron/Linux runner prerequisite.

## Current artifact proof

- The ordinary current production build passes in the owned copy; its [receipt](owned-production-build.json)
  and [original stale-dist rejection](copied-build-validation.json) are retained.
  No build manifest was rewritten to bypass a source check.
- Configured Linux x64 DIR packaging passes at **one CPU in 36.827 seconds**
  ([receipt](configured-linux-dir-build.json)), with normal native rebuild and
  `--publish never`. No installer/signing/global launch claim follows from DIR.
- [Artifact inspection](artifact-inspection.json) binds the 414,648,494-byte ASAR
  and actual executable hashes, four exact current owned-build entries, all four
  physical Sharp addon/libvips entries, TensorFlow presence, absence of the
  entire bcrypt build subtree, and **all ten published bcrypt platform binaries
  retained byte for byte**.
- In the actual new packaged Electron 43.8.3 on offline Debian 12, the
  [default bcrypt acceptance](runtime/actual-default-bcrypt-operation.stdout.txt)
  selects `prebuilds/linux-x64/bcrypt.glibc.node`, performs real asynchronous
  cost-12 Unicode hashing, accepts the correct password and rejects the wrong
  one. [Its receipt](runtime/actual-default-bcrypt-operation.json) has exit 0,
  no fixture timeout and **no `PREBUILDS_ONLY` override**.
- The actual [Zod loader](runtime/asar-module-acceptance.json),
  [TFJS tensor operation](runtime/actual-tfjs-operation.stdout.txt) and
  [real Sharp PNG](runtime/actual-sharp-png.stdout.txt) also pass. Sharp's
  upstream Electron/Linux and GLib warnings remain in stderr; broader rendering
  stability is a separate open gate.
- The exact full bundled child now gets past these dependency imports and
  exits 1 at the real `SESSION_SECRET` environment guard
  ([stderr](runtime/exact-bundled-server-child.stderr.txt)). The fixture
  intentionally supplies no application credentials. **This is expected
  configuration rejection, not evidence that Replit's configured key is missing.**
  It does not prove the subsequent database, private children or application
  readiness paths. No server/provider secrets were packaged to make it pass.
- Normal sandbox startup remains unverified in this read-only nonroot container:
  Chrome refuses a sandbox binary without the installed ownership/mode or a
  permitted user namespace. The isolated diagnostic disables sandbox only for
  observation, repeats the honest configuration guard and is fixture-terminated;
  its exit 0 is not successful production GUI startup.

The [actual Docker inspection](actual-runtime-isolation.json) proves network
none, unprivileged execution, nonroot user, read-only root/artifact/project,
owned writable temporary state and CPU/memory/PID limits. The named container
is absent after [cleanup](runtime-final-state.json). Children receive explicit
credential-free environments, never the source executor's application keys.
The [source/lock/native guard](original-integrity-after.json) records unchanged
common source digest
`91459e7df5c00f9470b63c5424bf480d99f189f49d35c5acb9f04cfb14c09ca6`
and exact original selected source, three lockfile and two native prebuild hashes.
This is not a complete installed-tree byte inventory.

`build-driver.py`, `offline-driver.py`, `offline-probe.cjs` and
`inspect-artifact.mjs` document exact commands and admission rules. They use the
cohort's particular owned paths; reproduce with a new owned root/output directory
and retain each old attempt. The public Electron ZIP was admitted by its locked
127,277,783-byte size and SHA256
`73d7d6fe120c998db75834c23c8ce7ce8390607c198b2e167a28acd7937bef22`.
No executable/archive binaries are committed in this evidence cohort.

## Remaining dependencies and acceptance

The libc shadowing defect is closed by actual default-loader execution. The
remaining desktop gates are the normal installed sandbox, actual configured
private/writable local-server or remote-server contract, full authenticated GUI
journeys, imported MaxCore/PDIM/Python/worker/migration behavior after
configuration, broad Sharp media stability, offline/account-isolation/update
flows and each advertised OS/installer/device/signing path. All need their own
passing evidence. A public desktop package must not contain the Replit server's
private credentials. This cohort marks no page end-to-end Green and grants no
global launch approval.

## Post-review owned-copy cleanup

After independent review, every artifact hash and size in the original 68-entry
and 70-entry native manifests was reverified; all six latest selected source
hashes still matched both the root checkout and copied inputs. The exact prior
70-entry manifest remains in [manifest-before-cleanup.json](manifest-before-cleanup.json).
The [cleanup receipt](owned-copy-cleanup.json) records removal of only the six
known generated project/artifact trees, freeing an observed **6.698 GiB** under
`/tmp`. All tracked native build process groups were absent, and no existing
Docker container mounted these trees. No accessible process reference was found;
the receipt explicitly retains limitations for protected `/proc` entries. This
is a scoped owned-workload cleanup check, not inspection of other users' private
process memory or a production certification.

The verified Electron ZIP, caches, controller and all other children were kept.
No original root dependencies, release capsules or unknown paths were removed.
Binary hashes and all canonical proof remain in the repository; the removed
directory artifacts require a fresh owned build to reproduce. The exact cleanup
procedure is retained in [owned-copy-cleanup.py](owned-copy-cleanup.py).
