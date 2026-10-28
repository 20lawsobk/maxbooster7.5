# Serialized 10d19267 portable cold-release rehearsal

The four-command cold-payload scope passed from source
`10d192675beefcf1b7beef3ce47c271db0cc17cf` on October 28, 2026,
13:49:17–13:51:58 America/Detroit (17:49:17–17:51:58 UTC in raw receipts).
The independent read-only audit at 13:52:50 America/Detroit passed all 37 checks.
The receipt retains `productionReady: false`.

This followed the completed unchanged-source 10d full master. Four preparation
threads used the normal zstd19 codec, cache identity, source guards and archive
round-trip policy. Valid capsules were reused and changed inputs rebuilt under
the existing policy; no source guard or compression setting was bypassed.

## Actual commands and exits

| Phase | Command | Actual seconds | Exit |
| --- | --- | ---: | ---: |
| prepare | `npm run release:prepare` | 114.010 | 0 |
| verify | `npm run release:verify` | 1.980 | 0 |
| cold | `node scripts/readiness-packed-acceptance.mjs …` | 40.029 | 0 |
| verify-after-cold | `npm run release:verify` | 1.922 | 0 |

`summary.json` records exact argv, timestamps, source identity and log hashes.
`prepare.txt`, `verify.txt`, `cold-runner.txt` and `verify-after-cold.txt`
retain the actual output. All four completed without timeout. The preceding
[cb rehearsal](../2026-10-28-cb783f1f-final/README.md) and older failed attempts
remain historical and unchanged.

## Source, payload and cleanup

- Common code/config/test digest before and after:
  `cbf794e080119fa4f64ec6ebce2b29b3d78641d606a3059c0c207b2420324418`.
- All 4,527 release-admitted entries match exactly before/after. The complete
  `admitted-diff.json` contains no added, removed or changed entry. Both serialized
  inventory files have SHA256
  `8eecc5c9468b5a350f39decd8aa4e8a0619d19c5f92e718e0e596774d63f0337`.
- The prepared payload has 37 entries totaling719,501,006 bytes. The recorded
  release-manifest SHA256 is
  `fc22e387b8f9caa7e06c514be6e6319d564238175c5a9f1f621e7f94803e51d2`.
  Its normalized source-array digest is
  `2032e14483a79e3a976c91b6a044feca8621146727131d3308f7aced0f28860a`; that serialization is different
  from the admitted-inventory file hash.
- The actual application archive has 1,892 members, including the runtime
  social-platform registry and migration 0099. MaxCore has 46,255 members. Both
  archive hashes and member lists match the manifest and pass hygiene checks.
- Scratch trees and the precise MaxCore runtime upload subtree are absent from
  **admitted release-source inventories** and capsules. This does not assert
  physical absence from the developer checkout: 36 original ignored runtime
  upload files remain there and were not deleted. Source assets and fixtures
  remain governed by their normal admission policy.
- All 36 tracked owned descendants were cleaned, with zero remaining. The audit
  also matched code, admitted source, payload and Git HEAD to the recorded 10d
  source at its review timestamp. Later evidence-only commits can reference
  that tested source without changing its original identity.

## Accepted startup scope and limits

The copied payload starts with checkout dependency fallback disabled,
disposable PostgreSQL/Redis/state, actual imported services, no application or
provider credentials, blocked public-source egress and empty initial public
state. Read `cold/packed-acceptance.json` for exact startup, restoration,
readiness and cleanup observations. Frontend and health return 200; protected
API admission and individual dependency responses retain their own evidence.

The configured serving profile is `live-awareness`, state `runtime-managed`,
with `readinessRequired: true`. The exact accepted gate is
`cold-startup-with-ml-unavailable`, with `accepted: true`,
`productionReady: false` and `unverifiedNonMl: []`. Recognized unavailable fresh
awareness/generation permits this **startup scope** to pass; it does not prove
operational generation or fresh live-awareness readiness. Public awareness
acquires no trained-checkpoint requirement from this fixture. No actual Replit
Nix image, published HTTPS identity, provider delivery, all 80-page feature or
accessibility acceptance, desktop GUI, or global capacity was certified.

## Independent read-only audit

`hygiene-audit.json` records all 37 actual checks, original summary hash, exact
admitted inventories, payload/archive hashes and members, cleanup and honest
readiness scope. Its `current*` checks describe the 10d checkout at the original
audit timestamp. A later source, dependency or public build-setting change
requires preparation and verification again; never edit a receipt or prepared
manifest to preserve a stale pass.

## Reproduce into a new owned cohort

[Release instructions](../../../docs/testing/release-rehearsal.md) describe
prerequisites, scope and deployment/migration boundaries. Select locked Node 22
dependencies, verified portable Python, PostgreSQL/compression/runtime tools
and their actual library paths. Finish heavy tests first, freeze source and
retain complete admitted inventories. Never run destructive publishing scripts
in the source/editor checkout.

The adjacent `execution-driver.py` is the exact executed recipe. In this
workspace, choose a new output directory:

```sh
python3 reports/release-rehearsal/2026-10-28-10d19267-final/execution-driver.py \
  reports/release-rehearsal/my-new-owned-cold-run
python3 reports/release-rehearsal/2026-10-27-runtime-uploads-final/audit-receipt.py \
  reports/release-rehearsal/my-new-owned-cold-run
```

The recorded recipes contain original absolute checkout/tool selectors. Adjust
those for another clone and retain changed driver bytes with the new attempt.
The driver records actual exits and full admitted before/after inventories even
on failure. It forwards tool/library paths, approved network settings and the
public live-awareness build profile, not application/database/provider secrets.
A passing exit proves only the stated scope. `manifest.json` hashes every
retained cohort artifact except itself; raw receipts are unchanged.
