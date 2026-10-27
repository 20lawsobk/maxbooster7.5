# Replit release rehearsal

The documented launch target is a Replit **Reserved VM** using the local imported
MaxCore and PDIM services. See [deployment settings](../replit-production-deployment.md).
This rehearsal checks the portable publishing payload on a fresh local filesystem.
It neither publishes to Replit nor establishes a multi-instance capacity claim.

## Current evidence

The October 26 preflight rejected the old `.prepared-release` with
`Production source changed`. The installed deployment-dependency gate passed.
The subsequent preparation built and round-trip verified native outputs,
JavaScript dependencies, imported services and the genuine portable Python
runtime, then correctly rejected the package because application source had
changed during preparation. The privacy correction that reopened the source
freeze must be included in a fresh package.

That failed attempt and its true exit status remain in
[`reports/release-rehearsal/2026-10-26/summary.json`](../../reports/release-rehearsal/2026-10-26/summary.json).
Its capsule cache is reusable only through the builder's existing checksum and
identity validation. A second attempt rebuilt the changed MaxCore capsule and
reused the other verified capsules, then rejected concurrent test-configuration
and script changes through the same source guard. That attempt remains in
[`2026-10-27/summary.json`](../../reports/release-rehearsal/2026-10-27/summary.json).
The frozen follow-up in
[`2026-10-27-final/summary.json`](../../reports/release-rehearsal/2026-10-27-final/summary.json)
passed preparation (110.444 seconds), verification (2.529 seconds), copied-payload
cold startup (36.627 seconds) and verification after startup (2.544 seconds).
Every command exited zero. Independent review matched all four command-log
hashes, the execution-driver hash and the release-source inventory digest.
The payload contained 37 inventory entries totaling 804,564,548 bytes; all 37
tracked descendant processes were cleaned up.

That successful result is **cold payload scope only**. Frontend delivery,
protected API denial, PostgreSQL, Redis, routes and local child liveness passed.
The isolated run deliberately denied public-source egress and supplied an empty
private public-state directory. MaxCore and application readiness therefore
returned 503 for unavailable awareness/generation capability; the receipt keeps
`productionReady: false`. It does not prove a deployed Replit Nix image, live
generation readiness, provider delivery or global capacity.

The subsequent review found a separate packaging-hygiene defect: the application
capsule admitted an old `.pdim-cluster-test-*` bundle, while the source inventory
also bound unrelated `.pdim-scratch-*` restore trees. The shared scratch policy
now excludes both directory families from source copies, release identity and
application member selection. Regressions verify omission, preservation of the
original scratch trees, and continued identity binding for runtime changes.
This correction and the current measurement/runtime repairs invalidate the
prepared source identity. Preserve the successful receipt above; a fresh
versioned preparation and cold check are required after the new source freeze.
Inspect the resulting application archive and source inventory to confirm that
neither scratch family is admitted before calling that replacement current.

## Preparation sequence

1. Finish source changes and their focused checks. Freeze every input admitted
   by `script/lib/releaseInventory.ts`: runtime source, migrations, scripts,
   admitted root configuration and public frontend build settings. Most test
   files are excluded, but not all test tooling is excluded. Documentation and
   reports are excluded from the release source identity.
2. Use the installed, locked dependencies, Node 22 and the project's verified
   portable Python preparation. Ensure PostgreSQL server tools, compression
   tools and required runtime libraries are available. Run as a non-root user.
3. Run `npm run release:prepare` with `MAXCORE_SERVING_RELEASE=live-awareness`
   and the intended public `VITE_` build settings. This command builds in a private
   staging directory and validates capsules before replacing its generated
   `.prepared-release`. It preserves application source and serving data.
4. Run `npm run release:verify` with the same build settings. Any source,
   dependency or build-setting change requires preparation again; do not edit a
   release manifest to bypass that check.
5. Rehearse only the copied payload using the command below. The public-state
   argument may be an empty private directory to exercise the supported
   no-checkpoint startup boundary. It must never identify private production state.
6. Retain the setup/startup logs and `packed-acceptance.json`, including actual
   readiness responses, source identity and owned-process cleanup. Keep a failed
   run when retrying after a fix.

Do **not** run `build.sh` in a source/editor checkout. Its publishing installation
step is authorized only inside Replit's explicitly disposable publishing copy.

## Credential-free cold payload check

The runner rejects inherited application/database/provider credentials. Start it
with a clean environment, forwarding only tool and runtime-library paths:

```sh
mkdir -p /tmp/maxbooster-empty-public-state
env -i PATH="$PATH" HOME=/tmp LD_LIBRARY_PATH="${LD_LIBRARY_PATH:-}" \
  node scripts/readiness-packed-acceptance.mjs \
  /tmp/maxbooster-empty-public-state /tmp/maxbooster-cold-results
```

The runner initializes a disposable PostgreSQL cluster from actual generated SQL
and additive migrations, restores the real capsules into a fresh directory and
starts `start.sh`. Checkout dependencies are unlinked before runtime startup.
It launches the actual imported child services, denies non-loopback TCP/TLS and
UDP, and supplies no provider keys. Schema generation must produce usable SQL;
an exit code of zero alone is insufficient.

The checks cover frontend delivery, protected API denial, CSRF route registration,
database/Redis/route health, imported MaxCore and Python liveness, required runtime
asset hashes, actual model readiness and descendant-process cleanup. A recognized
empty-candidate or unavailable-awareness response may allow the **cold startup**
check to pass while `productionReady` remains `false`. Unexpected dependency,
route or packaging failures must fail the rehearsal.

## Additional release gates

- Measure the real Replit Nix closure and publishing image on Replit. A local
  machine without `/nix/store` cannot certify Replit's image size or VM allocation.
- Apply reviewed database migrations in deployment order after a coordinated
  writer drain and verified backup/recovery plan. Test additive migrations on a
  disposable database first. Do not substitute `drizzle-kit push` against the
  configured production database for a migration rehearsal.
- Rehearse the configured persistent PDIM/state and upload staging topology,
  restart and recovery behavior. Shared PostgreSQL metadata does not by itself
  make per-instance blob storage shared.
- Probe the actual published HTTPS origin and execute configured provider,
  callback and signed webhook journeys there. The Replit project/editor URL is
  not the published origin, and account capabilities are separate from API keys.
- Complete the master sweep and its coverage/evidence gates. Cold startup,
  eighty page renders and bounded engine throughput are distinct proof scopes.
  [Scale evidence](scale-evidence.md) records what the existing 90M projection
  actually measures.

For a separate Docker image rehearsal, use
`scripts/readiness-container-acceptance.mjs` with the same argument contract and
its documented clean environment. It additionally checks a real non-root image,
an internal-only Docker network, isolated PostgreSQL and owned container/volume
cleanup. It is not a substitute for the Replit Reserved VM checks above.
