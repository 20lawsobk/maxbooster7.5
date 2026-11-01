# Bounded Linux desktop verification plan

Read-only feasibility review, October 27, 2026. No native build, binary download,
container start, source change, dependency installation or published artifact
was performed by this review. The integrated master and portable cold release
were already running; native execution waits for their resource release and
the coordinating agent's go-ahead.

## Observed feasibility

- Current installed Electron is **43.8.3**, not the package range's 43.8.1
  minimum. Its Linux x64 ZIP exists, is **127,277,783 bytes**, and its public
  download URL returned HTTP 200 to a HEAD request. The installed locked npm
  package supplies SHA256
  `73d7d6fe120c998db75834c23c8ce7ce8390607c198b2e167a28acd7937bef22`.
  Metadata/HEAD success is not a completed download or verified binary.
- No Electron executable, `path.txt`, Electron ZIP, Xvfb, 7zip builder toolset,
  fpm or AppImage toolset was found in the inspected task-owned caches.
  Importing the original `node_modules/electron/index.js` would try to install
  into that original tree; do not use that path as a feasibility probe.
- Host GTK3, X11, NSS, ATK and GBM libraries are present. gcc/g++, make,
  pkg-config, unzip, gzip, tar, xauth and dpkg-deb exist. Actual Electron
  `ldd`/launch compatibility remains untested until its binary is obtained.
- The managed local Docker daemon is healthy, version **28.4.0**. Cached images
  include `maxbooster-readiness-base:local` (135 MB), `debian:bookworm-slim`
  (74.9 MB), and `postgres:17-bookworm`. Their GUI package contents have not
  been inspected. Do not infer that the readiness image contains Xvfb.
- Host unprivileged user/network namespace creation fails because
  `/proc/self/uid_map` is read-only. An owned Docker container with
  `--network none` is the proposed strict offline runtime, subject to an actual
  successful run after coordination. Do not claim a namespace was established
  from daemon availability alone.
- The executor has four CPU equivalents. At review time `/tmp` had about
  17 GiB free; root npm dependencies use 1.6 GiB, MaxCore 506 MiB, PDIM 499 MiB,
  and current dist about 22 MiB. Recheck after the cold rehearsal cleans up.
  Budget roughly 6–9 GiB temporary space for regular copies, runtime,
  unpacked output, tar intermediate and compressed artifact; stop below a
  conservative 10 GiB free-space floor before starting.

These observations support a bounded attempt at the configured **Linux x64
directory/tar.gz target**. They do not establish feasibility or acceptance of
the additional DEB/AppImage, Windows, macOS, signed release or device paths.

## Exact scope and safe preparation

1. Wait for coordination. Re-read the frozen source digest and current
   `dist/build-complete.json`. Use the actual current filesystem, including
   uncommitted changes; do not create an old Git checkout. Capture all selected
   source and emitted-file hashes before copying.
2. Create a uniquely owned `/tmp/maxbooster-linux-<id>/` containing separate
   `project`, `downloads`, `cache`, `out`, `profile`, `tools` and evidence paths.
   Use regular file copies, never hardlinks to the working tree. Copy current
   Git-visible build inputs and assets, excluding `.git`, documentation,
   reports, private/ignored runtime state, historical `.pdim-*` trees and the
   unavailable legacy gitlink. Copy the current dist and root/MaxCore/PDIM
   installed dependency graphs when a local build is needed.
3. Preserve only symlinks whose targets resolve inside this owned copy. The
   root npm tree has 89 inspected links; the sole target outside node_modules
   is the relative `../../packages/electron-download-transport`, which remains
   inside a complete project copy. Copy that package as well. Validate every
   retained pnpm/workspace link after copying. Reject or explicitly relocate
   absolute links into the original workspace; never permit writeback.
4. Use a fresh credential-free environment: owned HOME/TMPDIR/cache/profile,
   pinned Node 22, controlled PATH/library paths, no DATABASE_URL, application
   keys, provider credentials, GH_TOKEN or user browser profile. Networked
   preparation alone receives the inherited approved proxy and CA settings.
   Never dump the environment or Docker config.
5. Verify the copied build contract. If copied dist does not correspond to
   the exact current copied inputs, run the ordinary build **only in the owned
   project**, without DEPLOY_PACK or publishing cleanup. It checks both
   subsystem locks and builds the actual embedded API, UI and server entries.
   Do not run historical `build.sh` in the original checkout.

The relevant execution commands, after the coordinator's go-ahead, are:

```sh
# Run in the owned project, not /workspace/maxbooster7.5.
node --input-type=module -e \
  'import("./scripts/start-production.mjs").then(m=>m.validateBuild(process.cwd()))'

# Only if current copied dist fails that provenance check:
NODE_ENV=production SKIP_BOOSTERSTATE=1 npm run build

# Download into the owned downloads directory through the managed proxy/CA.
curl --fail --location --retry 1 --connect-timeout 10 --max-time 180 \
  --output ../downloads/electron-v43.8.3-linux-x64.zip \
  https://github.com/electron/electron/releases/download/v43.8.3/electron-v43.8.3-linux-x64.zip

# Compare the exact file bytes with the recorded locked-package SHA256 before use.
sha256sum ../downloads/electron-v43.8.3-linux-x64.zip

# ELECTRON_BUILDER_CACHE and every HOME/TMPDIR/cache path point into the owned root.
# Retain the configured default native-dependency rebuild behavior for this attempt.
node node_modules/electron-builder/cli.js --linux tar.gz --x64 --publish never \
  --config.electronDist=/absolute/owned/downloads/electron-v43.8.3-linux-x64.zip \
  --config.directories.output=/absolute/owned/out
```

Do not run the builder until an evidence driver enforces exact checksum
comparison; the displayed `sha256sum` command alone is not admission. A
diagnostic retry with `npmRebuild=false` would be a changed build configuration
and cannot be recorded as a pass of the configured default. The installed
builder downloads its own 7zip toolset on first archive creation and verifies
the checksum in `out/toolsets/7zip.js`; keep that cache owned. fpm and AppImage
toolsets are unnecessary for this explicitly limited tar target.

Use one bounded build job after the current heavy jobs finish: at most
180 seconds per runtime download, 300 seconds for compilation when needed,
and 450 seconds for packaging. Record the real exit status and stop on timeout;
do not repeatedly retry an unproven native toolchain for half an hour. Recheck
disk and track only owned process groups and container names for cleanup.

## Offline artifact and GUI checks

1. Hash the actual emitted tar.gz, enumerate its members safely, reject
   traversal/escaping links, and extract only under the owned root. Inspect
   actual `app.asar`, unpacked entries, package metadata and native modules.
   Confirm that the packaged server and UI bytes match the frozen build.
2. Prepare a small owned GUI runner image from a cached base, adding only
   required Xvfb/GTK/NSS/GBM/audio/font packages. This is not the Replit image.
   Pin the selected base digest and record installed package versions. Follow
   the cloud runtime Docker skill: approved proxy defaults, read-only CA mount
   for networked build steps, no credential-bearing image layers and no
   disabled TLS verification. No daemon restart, global cache prune or host
   networking is needed.
3. Start exactly one named runner with `--network none`, bounded CPU/memory/PID
   limits, an owned writable temporary profile, and only the extracted owned
   artifact mounted read-only. Start an owned Xvfb display with TCP listening
   disabled. No original workspace, user home, Docker socket or production
   credential is mounted into this runner.
4. Launch the actual packaged executable with a fresh `--user-data-dir` and
   collect main-process/stdout, child exit, window/renderer errors and the
   actual loaded URL. An existing Playwright Electron launcher is available
   for an owned automation driver; all inspection/debug listeners must stay
   private to the isolated runner. Assert real Electron/preload versions,
   renderer content, contextIsolation/nodeIntegration settings and process
   cleanup. Preserve a screenshot if a window renders.
5. Try the normal sandbox behavior first. If the container prohibits Electron
   sandbox startup, a clearly marked `--no-sandbox` diagnostic may identify the
   next failure, but it does not prove the production sandbox security gate.
6. The real bundled server may correctly reject absent private configuration.
   Capture that outcome. Never replace it with a fake readiness responder and
   call the desktop backend operational. A rendered offline shell is partial
   UI evidence; a build artifact is packaging evidence. Neither is configured
   desktop end-to-end acceptance.
7. Stop owned processes and the exact named container in `finally`; verify no
   owned descendants/listeners remain. Keep compact hashed logs/metadata, not
   credentials or the entire temporary dependency graph. Recheck the original
   frozen source hash and installed graph for zero mutation.

## Questions for actual execution to resolve

The root build config includes `electron/**`, selected `dist` server entries,
and `dist/public/**`; it has no extraResources for imported MaxCore/PDIM,
Python, migrations or configuration. The main process chooses
`resources/app.asar.unpacked/dist/index.mjs` first and forks it with that dist
directory as cwd. Server bundles keep npm imports external. This creates
**suspected**, not yet reproduced, module/resource lookup and local-backend
startup gaps: dependency placement and Electron's asar behavior must be
observed in the actual artifact before calling them confirmed defects.

The workflow uses the root builder config, whereas `npm run electron:build`
selects `--projectDir electron`, whose package has no equivalent build config.
The separate build:desktop/build:apps convenience commands reference absent
`scripts/build-apps.ts`. These observations do not turn a limited tar build
into verification of all advertised entrypoints.

A production desktop decision also needs the intended configured backend
contract. The current shell starts a complete local server; configured Replit
credentials are not public desktop distribution assets. A remote-client
rewrite would require the actual published app origin, which is still not
known. No such redesign is authorized by this read-only feasibility task or
claimed by this plan.
