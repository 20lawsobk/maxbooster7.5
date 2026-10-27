# Replit release rehearsal

The documented launch target is a Replit **Reserved VM** using the local imported
MaxCore and PDIM services. See [deployment settings](../replit-production-deployment.md).
This rehearsal checks the portable publishing payload on a fresh local filesystem.
It neither publishes to Replit nor establishes a multi-instance capacity claim.

## Current evidence

The October 27 preparation bound to commit
`b369d68e34bef0e30c96fbd5b72fa7339e6425f2` passed all four release commands.
The [recorded result](../../reports/release-rehearsal/2026-10-27-published-guard-final/summary.json)
includes the published-target revalidation guard, migration journal and scratch
filter corrections. Its source identity remained current after the cold check.

| Command | Actual seconds | Exit |
| --- | --- | --- |
| `npm run release:prepare` | 173.102 | 0 |
| `npm run release:verify` | 3.150 | 0 |
| `node scripts/readiness-packed-acceptance.mjs …` | 37.155 | 0 |
| `npm run release:verify` after cold startup | 2.182 | 0 |

The [independent read-only audit](../../reports/release-rehearsal/2026-10-27-published-guard-final/hygiene-audit.json)
matched all four log hashes, the execution driver, the recorded code-input and
release-source digests, the actual current source and the complete prepared
payload inventory. All 16 audit checks passed. The source inventory has 4,554
entries; the publishing payload has 37 entries totaling 804,554,617 bytes.
Inspection of the actual application archive found 1,891 members, including the
runtime social-platform registry and `0099_fabric_migration_journal.sql`.
Neither the source inventory nor the application archive admitted
`.pdim-scratch-*` or `.pdim-cluster-test-*` entries. All 40 tracked descendant
processes were cleaned up.

This is **cold payload scope only**. Frontend and health returned 200, the
protected API returned 401, and the imported Node/Python children were live.
PostgreSQL, Redis and route checks passed. The isolated run deliberately denied
public-source egress and supplied an empty private public-state directory.
MaxCore and application readiness therefore correctly returned 503 for
unavailable live awareness/generation capability. The receipt retains
`productionReady: false`; it does not prove an actual Replit Nix/publishing image,
deployed HTTPS identity, operational generation, provider delivery or global
capacity. A subsequent admitted source, dependency or build-setting change
requires preparation and verification again.

Earlier attempts remain intact rather than being overwritten by this result:

| Receipt | Recorded outcome and limitation |
| --- | --- |
| [October 26](../../reports/release-rehearsal/2026-10-26/summary.json) | Capsules were built and round-trip verified; the source guard rejected concurrent application changes. |
| [October 27 retry](../../reports/release-rehearsal/2026-10-27/summary.json) | Verified capsules were reused and changed MaxCore rebuilt; the source guard rejected concurrent configuration/script changes. |
| [Earlier cold check](../../reports/release-rehearsal/2026-10-27-final/summary.json) | Cold scope passed, but later archive review found an old cluster-test bundle and source-identity scratch noise. |
| [Platform cold check](../../reports/release-rehearsal/2026-10-27-platform-final/summary.json) | Cold scope passed and scratch hygiene was corrected; the [audit](../../reports/release-rehearsal/2026-10-27-platform-final/hygiene-audit.json) recorded that the subsequent published-target guard made its source stale. |

The shared scratch policy excludes both directory families from source copies,
release identity and application member selection. Regressions prove omission
without deleting the original scratch trees and retain identity binding for real
runtime changes. Cached capsules are reused only through their existing checksum
and source/policy identity validation.

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
