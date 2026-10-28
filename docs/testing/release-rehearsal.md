# Replit release rehearsal

The documented launch target is a Replit **Reserved VM** using the local imported
MaxCore and PDIM services. See [deployment settings](../replit-production-deployment.md).
This rehearsal checks the portable publishing payload on a fresh local filesystem.
It neither publishes to Replit nor establishes a multi-instance capacity claim.

## Current evidence

The latest [serialized cb783f1f rehearsal](../../reports/release-rehearsal/2026-10-28-cb783f1f-final/README.md)
passed preparation, verification, copied-payload cold startup and verification
after startup from source `cb783f1f9b34719a214dd7f9203a31dea64c051e`.
It ran October 28, 2026, 08:15:15–08:30:50 America/Detroit
(`12:15:15Z`–`12:30:50Z` in the raw receipts), after the a160 full master
and separate cb complete Node-group recheck finished. Four preparation threads
used the normal zstd19 codec, source/checksum guards and shared cache policy.
Policy-invalidated capsules were rebuilt normally.

| Command | Actual seconds | Exit |
| --- | ---: | ---: |
| `npm run release:prepare` | 887.744 | 0 |
| `npm run release:verify` | 2.026 | 0 |
| `node scripts/readiness-packed-acceptance.mjs …` | 39.745 | 0 |
| `npm run release:verify` after cold startup | 2.125 | 0 |

The [actual summary](../../reports/release-rehearsal/2026-10-28-cb783f1f-final/summary.json)
retains all four exits and log hashes. The
[independent read-only audit](../../reports/release-rehearsal/2026-10-28-cb783f1f-final/hygiene-audit.json)
passed all 37 checks at 08:32:07 America/Detroit. The common code/config/test
digest stayed `eba9dafdb3a96f430c05e6782cd9b23b21f5eeb01ba71c51e9b9875a313dbd07`.
All 4,526 release-admitted entries match exactly before/after, with complete
serialized inventories and an empty added/removed/changed diff. The audit also
matched the current source, prepared payload and Git HEAD to cb at that timestamp.
A later evidence-only commit may reference this tested source receipt without
changing its original revision or claiming another full master ran.

The payload contains 37 entries totaling 719,499,770 bytes. The actual application
archive has 1,892 members, including the runtime social-platform registry and
`0099_fabric_migration_journal.sql`; MaxCore has 46,255 members. Both archives match
the manifest. Scratch trees and the precise MaxCore runtime upload subtree are
absent from source and capsules; source assets and fixtures remain admitted under
the normal policy. All 37 tracked descendants were cleaned, with zero remaining.
The adjacent cohort manifest hashes every retained artifact except itself.

This is **cold payload scope only**. The fresh copied payload starts with checkout
dependency fallback disabled, disposable PostgreSQL/Redis/state, actual imported
services and no application/provider credentials. Frontend and health return 200;
protected API admission, database, Redis and route checks have their own receipts.
Public-source egress is blocked and initial public state is empty. The exact
accepted gate is `cold-startup-with-ml-unavailable`, with `accepted: true`,
`productionReady: false` and `unverifiedNonMl: []`. Recognized unavailable
awareness/generation permits this startup scope to pass; it does not establish
operational generation, a real Replit Nix image, deployed HTTPS identity, provider
delivery, full 80-page acceptance or global capacity. Public awareness does not
acquire a trained-checkpoint requirement from this fixture. Any later admitted
source, dependency or public build-setting change requires fresh preparation
and verification.

Earlier attempts remain intact:

| Receipt | Recorded outcome and limitation |
| --- | --- |
| [October 26](../../reports/release-rehearsal/2026-10-26/summary.json) | Capsules built and round-trip verified; source guard rejected concurrent application changes. |
| [October 27 retry](../../reports/release-rehearsal/2026-10-27/summary.json) | Verified capsules reused and changed MaxCore rebuilt; source guard rejected concurrent configuration/script changes. |
| [Earlier cold check](../../reports/release-rehearsal/2026-10-27-final/summary.json) | Cold scope passed; later archive review found an old cluster-test bundle and source-identity scratch noise. |
| [Platform cold check](../../reports/release-rehearsal/2026-10-27-platform-final/summary.json) | Cold scope passed and scratch hygiene corrected; its audit records the subsequent published-target guard making its source stale. |
| [Published-target guard check](../../reports/release-rehearsal/2026-10-27-published-guard-final/summary.json) | All four commands and 16 audit checks passed for b369 source; later analytics/dependency changes make that payload historical. |
| [Analytics/dependency preparation](../../reports/release-rehearsal/2026-10-27-analytics-dependencies-final/summary.json) | All runtime capsules round-trip verified; final source guard rejected concurrent generated bundle/media changes. No cold startup or new prepared release. |

The [failed preparation's mutation evidence](../../reports/release-rehearsal/2026-10-27-analytics-dependencies-final/source-drift-diagnosis.json)
retains exact observed paths, hashes and times. Its initial admitted inventory was
not saved by the original preparer; a historical inventory is separately labeled
and is not substituted. The
[runtime upload isolation batch](../../reports/release-rehearsal/2026-10-27-runtime-upload-isolation/README.md)
then passed 14 actual packaging checks with only the demonstrated runtime subtree
excluded. Owned Python fixtures preserve the original source uploads. The
[assertion-oracle review](test-oracle-review.md) separately retains all five
log/counter-only helpers' correction, their actual negative pytest failures and
positive execution proof. Those earlier receipts are not overwritten.

The shared scratch policy excludes `.pdim-scratch-*` and `.pdim-cluster-test-*`
from source copies, release identity and application member selection without
deleting original scratch trees. Cached capsules are reused only through their
existing checksum and source/policy identity validation.

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
