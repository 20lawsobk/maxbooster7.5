# Ordinary production build and start

`npm run build` compiles the Vite client and five Node runtime entries. It
verifies the installed MaxCore/PDIM dependency trees without downloading tools
or reinstalling packages. Build failure invalidates the completion record.

`npm run start` validates the completion record, source inputs and artifact
hashes, then invokes the existing production application handoff in `start.sh`.
It preserves Python activation, the Rust sidecar, diffusion gateway, port
validation and cluster startup, with `NODE_ENV=production`. It does not launch
Vite, restore deployment capsules, or execute the deployment packer.

Run these commands from a checkout with installed dependencies and provisioned
runtime services. They are not a standalone `dist`-only installation format.
Python/MaxCore resources, the Rust sidecar, database, session configuration and
provider credentials remain operational prerequisites.

The configured publishing path remains `bash build.sh` / `bash start.sh`.
Its compression, directory removal, restoration and deployment executive are
unchanged. Do not run that destructive packing flow in the working checkout.

## Explicit dependency synchronization

To synchronize existing nested installations from a populated local pnpm cache:

```sh
SUBSYSTEM_INSTALL=1 bash script/sync-subsystem-dependencies.sh
```

This requires the pinned pnpm version, uses frozen lockfiles and offline mode,
and disables lifecycle scripts. Missing cached packages must be provisioned
separately; the normal build does not silently fetch them.

## Validation

```sh
node --test tests/npm-build-start-contract.test.mjs \
  tests/deployment-contracts.cjs tests/runtime-artifact-gates.test.mjs
```

The isolated startup smoke test requires a disposable source/artifact copy,
a disposable PostgreSQL database initialized from the schema, and a running
Unix-socket-only PostgreSQL fixture. The copy must include the executable
`python_runtime/bin/python3` and native boosterstate artifact, together with
their runtime dependencies. The harness checks these prerequisites before launch
and uses the current private port contract, 5000. It must run inside an unprivileged network
namespace; capture the host namespace ID before invoking `unshare`:

```sh
unshare -Urn python3 tests/npm-start-isolated-smoke.py \
  /tmp/npm-start-isolated-EXAMPLE /tmp/npm-start-pg-EXAMPLE \
  "$(readlink /proc/self/ns/net)"
```

The test generates its own session key and never imports workspace credentials.
Inside the isolated namespace it uses a synthetic Stripe credential to register
billing routes; this does not authenticate to Stripe or verify provider behavior.
HTTP 200 from the homepage or health route is not readiness: it separately
requires `/api/ready` to pass and otherwise exits unsuccessfully.

## Verification in this workspace

- Final `npm run build`: exit 0; Vite finished in 63 seconds and all five
  server entrypoints compiled. No publishing packer or desktop build ran.
- Contract tests listed above: 20 passed, zero failed.
- Focused ESLint for the build, launcher and contract test: exit 0.
- Node launcher syntax and shell synchronization syntax: passed.
- Actual `npm run start` in a disposable copy, with a fresh PostgreSQL schema,
  generated test session key and network isolation: homepage HTTP 200,
  `/api/health` HTTP 200, `/api/ready` HTTP 503.
- Consequently the readiness smoke test exited 1. The deliberately restricted
  fixture did not include the complete Python/MaxCore/native runtime or provider
  credentials. This is evidence of working compiled HTTP startup, **not** proof
  of full ecosystem readiness or successful publication.
- No shared/production database schema or provider state was modified. The
  PostgreSQL schema push was restricted to the disposable Unix-socket fixture.

## Embedded MaxCore production handoff

The ordinary build now also compiles the MaxCore API through its existing local
build script. The supervisor uses that compiled entry with production environment
in production, and retains its TypeScript entry in development. The explicit
embedded flag prevents enabling the separate dashboard/SPA handler.

The MaxCore bundle is required by the build completion contract. Its API/library
source files are included in stale-source detection. No desktop or separate
dashboard packaging is invoked. A missing compiled entry fails explicitly.

Production skips the development dependency bootstrap completely. It passes
the parent application's absolute packaged Python path to the nested server,
while honoring an explicitly configured `MAXBOOSTER_PYTHON`. Missing runtime
resources remain errors; startup does not download an interpreter or silently
substitute a different one.

After this change, the actual npm build passed and the full native server
typecheck passed. Repeating isolated npm startup still returned homepage 200,
health 200 and readiness 503 (`health check failed`). This is not a successful
full readiness test and does not establish live MaxCore/model availability.
