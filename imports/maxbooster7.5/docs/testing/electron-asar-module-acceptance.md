# Electron ASAR launch verification

Two complementary checks cover the desktop launch-path repair. Neither check
claims that a desktop application's database, providers, GUI or local sidecars
are production ready.

## Ordinary Node policy tests

```sh
node --test tests/electron-asar-launch-policy.test.mjs
```

The nine cases verify actual development ESM/CJS files, explicit absence, a
physical unpacked fallback, real ASAR archives containing an unpacked ESM
or CJS entry, and the actual builder/native-loader policy for the root and two
embedded legacy manifests. The packaging cases retain every published bcrypt
platform binary and reject build-host native shadowing. They require installed
root dependencies including `@electron/asar`, `app-builder-lib`, bcrypt and
`node-gyp-build`; they do not download or require an Electron executable.
Fixture creation uses the same ASAR stream-writer API as electron-builder.

The ASAR cases inspect real archive metadata and unpacked bytes through a
documented archive-aware existence adapter. Ordinary Node does not have
Electron's ASAR filesystem patch. These cases verify launch selection, virtual
module ancestry and physical cwd; the native check below verifies execution.

## Actual native loader acceptance

Supply an explicitly prepared Electron binary with compatible system libraries:

```sh
node scripts/testing/electron-asar-module-acceptance.mjs \
  --electron-binary /absolute/path/to/electron \
  --output-json /new/owned/evidence/asar-module-acceptance.json
```

The binary can be the actual packaged Max Booster executable. The command
never imports Electron's npm auto-installer, downloads a runtime, modifies the
installed dependency graph, reuses a user browser profile or connects to an
application/provider/database. A missing binary or failed assertion is a
failure, not a skipped pass. Use a new output file to preserve earlier attempts.

The script creates and removes one owned temporary fixture. It packages the
actual installed Zod dependency and the current launch-policy helper into a
real ASAR archive, with only the ESM entry physically unpacked. It then invokes
the supplied Electron binary with `ELECTRON_RUN_AS_NODE=1` and an explicit
credential-free environment:

1. The physical unpacked entry must fail to find Zod in its module ancestors.
2. The actual archived helper, running with Electron's filesystem patch, must
   select the virtual ASAR entry and a physical working directory.
3. That selected entry must load real Zod, validate ordinary Unicode data,
   reject invalid data, report the physical cwd and exit successfully.

The JSON receipt records all three subprocess commands, statuses and output,
the actual native runtime and Zod versions, helper/archive hashes and fixture
cleanup. An isolated Docker runner with `--network none`, the prepared artifact
and source/dependency copy mounted read-only, and an owned writable `/tmp` is
the recommended acceptance environment. Xvfb is unnecessary for this Node-mode
module check; full GUI startup needs separate evidence.

This deliberately small fixture isolates archive module resolution. It does
not prove that every dependency/resource needed by the full packaged server
is included. Run the actual Linux artifact startup rehearsal as well, retain
its subsequent missing-resource or configuration errors, and keep those gates
open until their own acceptance passes.

## Current repaired artifact and remaining gates

The [October 28 current-artifact cohort](../../reports/native-linux-rehearsal/2026-10-28-final/README.md)
records the actual before/after policy cases, successful configured Linux DIR
build and real Electron Zod, TensorFlow and Sharp operations. The root build
includes TensorFlow.js and keeps Sharp's addon/libvips resources together outside
ASAR. The full backend still fails the Debian 12 runner's native libc boundary;
normal sandbox setup, complete desktop configuration, broader media stability
and all configured installers remain separate open gates. No product sandbox
bypass or distribution of Replit secrets is part of this change.

The [subsequent bcrypt cohort](../../reports/native-linux-rehearsal/2026-10-28-bcrypt-trace/README.md)
traces that libc error to a build-host native rebuild shadowing the usable
published prebuild. The exact build-subtree exclusion now passes nine policy
cases, retains all ten published platform binaries and verifies actual bcrypt
cost-12 hashing/verification in the new packaged Electron with its default
loader. The full bundled child correctly reaches the private configuration
guard in the credential-free fixture; complete configured desktop launch remains
unverified. Earlier failed receipts remain intact.
