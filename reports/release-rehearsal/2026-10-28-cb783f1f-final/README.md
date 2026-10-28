# Serialized cb783f1f portable cold-release rehearsal

The four-command **cold payload scope passed** from source
`cb783f1f9b34719a214dd7f9203a31dea64c051e` on October 28, 2026,
08:15:15–08:30:50 America/Detroit (12:15:15–12:30:50 UTC in the raw receipts).
The independent audit at 08:32:07 America/Detroit passed **all 37 checks** below.
The receipt explicitly retains `productionReady: false`.

This was an owned disposable publishing/cold-start rehearsal after the a160
full master and cb complete Node recheck finished. Four preparation threads
used the normal zstd19 codec, source/checksum guards and shared cache policy.
Policy-invalidated capsules were rebuilt normally; no source guard, cache
identity or compression policy was bypassed. No Replit publication, production
Neon mutation, live provider journey, desktop GUI or global-scale test ran.

## Actual commands and exits

| Phase | Command | Actual seconds | Exit |
| --- | --- | ---: | ---: |
| `prepare` | `npm run release:prepare` | 887.744 | 0 |
| `verify` | `npm run release:verify` | 2.026 | 0 |
| `cold` | `node scripts/readiness-packed-acceptance.mjs …` | 39.745 | 0 |
| `verify-after-cold` | `npm run release:verify` | 2.125 | 0 |

`summary.json` records exact argv, timestamps, logs and their hashes. All runs
finished without timeout. `prepare.txt`, `verify.txt`, `cold-runner.txt` and
`verify-after-cold.txt` retain the actual output. The historical failed
[concurrent preparation](../2026-10-27-analytics-dependencies-final/summary.json)
and its source-drift evidence remain unchanged.

## Source, payload and archive identity

- Common code/config/test digest before and after:
  `eba9dafdb3a96f430c05e6782cd9b23b21f5eeb01ba71c51e9b9875a313dbd07`.
- All 4,526 full release-admitted entries match exactly before/after;
  `admitted-diff.json` has no added, removed or changed entries. Both serialized
  inventory files have SHA256
  `5b74c597f83b7dc3ffba88be62997d00d5ba44f0a78a880933d71c4f9d3e5f58`.
- The prepared payload contains 37 entries totaling 719,499,770 bytes. The
  recorded release manifest hash is
  `99c608aa1d885a5359eacf95df12693f68f5efc447dc4a9a74915a86faa4d68f`.
  Its normalized source-array digest is
  `eed078537e75d534a1d6a4d2c0b862f6c533f7d885428f3413d2faa5db2d0698`;
  this has a different serialization scope from the inventory file hash.
- The actual application archive has 1,892 members, including the social-platform
  runtime registry and migration 0099. MaxCore has 46,255 members. Both archive
  hashes match the payload manifest. Member lists retain exact names.
- Scratch trees and MaxCore runtime uploads are absent from the **admitted
  release-source inventory** and capsules, with the precise upload exclusion
  recorded; source assets and fixtures remain subject to their normal policy.
  These checks inspect admitted release inputs, not physical absence from the
  developer checkout. Original ignored runtime uploads remain in the checkout
  and were not deleted by this rehearsal.
- The audit matched current code, admitted source, payload and Git HEAD to this
  recorded cb source at its review timestamp. These are historical source-bound
  observations, not a blanket claim about a later checkout or evidence commit.

## Actual cold startup and limits

The copied payload starts with checkout dependency fallback disabled, disposable
PostgreSQL/Redis/state, actual imported services and no application/provider
credentials. Frontend and health return 200; protected API admission is checked
separately. All 37 tracked descendants are cleaned, with zero remaining and no
cleanup error. Read `cold/packed-acceptance.json` for individual responses and
startup/restoration details.

The accepted readiness gate is exactly
`cold-startup-with-ml-unavailable`, with `accepted: true`,
`productionReady: false` and `unverifiedNonMl: []`. Public-source egress is
blocked and initial public state is empty. This recognized unavailable
awareness/generation boundary permits the **startup** scope to pass; it does
not prove operational generation or fresh live-awareness readiness. Public
awareness does not acquire a trained-checkpoint requirement from this fixture.
No full generation, real Replit Nix image, deployed HTTPS identity, provider
delivery, all 80-page acceptance or global capacity is certified.

## Independent read-only audit

The adjacent `hygiene-audit.json` records actual 37 check results, original summary
hash, archive counts, cleanup and exact readiness scope. The executed audit
recipe is retained in
[the prepared audit script](../2026-10-27-runtime-uploads-final/audit-receipt.py);
it takes this cohort directory as its argument. Its `current*` checks describe
the cb checkout at the original audit timestamp. Later admitted source,
dependency or public-build-setting changes require preparation and verification
again; do not edit a receipt or manifest to preserve a stale pass.

| Exact check | Actual outcome |
| --- | --- |
| `driver` | PASS |
| `exactCommandSequence` | PASS |
| `prepareRecordedExitAndLog` | PASS |
| `verifyRecordedExitAndLog` | PASS |
| `coldRecordedExitAndLog` | PASS |
| `verify-after-coldRecordedExitAndLog` | PASS |
| `codeBeforeRecordedDigest` | PASS |
| `codeAfterRecordedDigest` | PASS |
| `codeInputUnchanged` | PASS |
| `currentCodeInputMatches` | PASS |
| `admittedBeforeFileHash` | PASS |
| `admittedAfterFileHash` | PASS |
| `admittedExactBeforeAfter` | PASS |
| `admittedCompleteEmptyDiff` | PASS |
| `releaseManifestHash` | PASS |
| `recordedManifestMatchesPrepared` | PASS |
| `recordedSourceMatchesManifest` | PASS |
| `recordedSourceDigest` | PASS |
| `currentFullSourceMatches` | PASS |
| `currentPayloadMatchesManifest` | PASS |
| `currentGitHeadMatches` | PASS |
| `app_remainderArchiveHash` | PASS |
| `app_remainderSafeMembers` | PASS |
| `app_remainderScratchAbsent` | PASS |
| `runtimeRegistryPresent` | PASS |
| `migration 0099Present` | PASS |
| `external_maxcoreArchiveHash` | PASS |
| `external_maxcoreSafeMembers` | PASS |
| `external_maxcoreScratchAbsent` | PASS |
| `maxcoreRuntimeUploadsAbsent` | PASS |
| `maxcoreUploadExclusionRecorded` | PASS |
| `sourceScratchAbsent` | PASS |
| `sourceRuntimeUploadsAbsent` | PASS |
| `coldStartupPassed` | PASS |
| `ownedDescendantsCleaned` | PASS |
| `preparedCurrentAfterCold` | PASS |
| `honestProductionScope` | PASS |

## Reproduce without overwriting this attempt

[Release instructions](../../../docs/testing/release-rehearsal.md) describe
prerequisites, scope and the production migration/deployment boundaries. Select
the locked Node 22 dependencies, verified portable Python, PostgreSQL server,
compression tools, Rust/runtime selectors and actual library paths from the
prepared environment. Freeze source/config/tests and finish CPU-heavy tests
before preparation. Run only in an owned disposable preparation scope; do not
run destructive `build.sh` in the source/editor checkout.

The adjacent `execution-driver.py` is the exact executed recipe. In this
workspace, choose a new output directory:

```sh
python3 reports/release-rehearsal/2026-10-28-cb783f1f-final/execution-driver.py \
  reports/release-rehearsal/my-new-owned-cold-run
python3 reports/release-rehearsal/2026-10-27-runtime-uploads-final/audit-receipt.py \
  reports/release-rehearsal/my-new-owned-cold-run
```

The recorded cloud recipes contain their original absolute checkout/tool paths;
adjust those selectors for another clone and retain the changed driver bytes
with the new attempt. The driver records actual exits, source inputs and full
admitted before/after inventories even on failure. Its clean subprocess helper
forwards tool/library and approved network paths plus the public live-awareness
build profile, not application/database/provider credentials. The cold command
uses a fresh owned empty public-state directory, not production/private data.
A passing script exit establishes only its stated scope. A later evidence-only
commit can reference this cb receipt; it must preserve the original tested
source revision, hashes, timestamps and honest readiness result.

`manifest.json` hashes every retained cohort artifact except itself. Raw command,
source, cold and audit receipts were not rewritten during documentation.
