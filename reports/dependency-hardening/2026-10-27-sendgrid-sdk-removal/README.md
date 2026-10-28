# SendGrid SDK consumer removal — October 27, 2026

Removed the root SendGrid SDK dependency and its three remaining dependency
packages, including vulnerable `deepmerge` 4.3.1. The application continues to
use SendGrid for monitoring alerts through the tested bounded REST transport;
ordinary application mail still uses the existing Resend path. No provider
key, delivery destination or provider account was changed.

The newly published [advisory review](../../../docs/testing/deepmerge-advisory-plan.md)
records that no upstream deepmerge patch exists. The earlier
[MaxCore cohort](../2026-10-27-maxcore-dev/README.md) retains the initial failing
root audit. This repair removes the actual vulnerable consumer instead of
suppressing the advisory, downgrading SendGrid or renaming vulnerable code.

The [alert implementation receipts](../../email-acceptance/2026-10-27-sendgrid-alert/summary.json)
describe the separately implemented correction: the old `sgMail.default.send`
call could not reach the SDK, successful webhook acceptance could suppress a
failed email retry, and the monitoring test route could report success without
any provider acceptance. The final implementation reports explicit accepted,
failed and suppressed outcomes, with per-channel cooldown. A provider 202
means acceptance; these tests do not claim delivery.

## Results

| Check | Actual result |
| --- | --- |
| Combined alert, real legacy bundle, PDF, security gate, qs, replay, HTTP and generator regressions | **77 passed, 0 failed, 0 skipped**. Includes 11 actual alert/route cases, two legacy coherence cases and 64 existing regressions. |
| Actual serialized first legacy caller/route payload | **11 passed**, using the same canonical alert/route cases. |
| Actual serialized nested legacy caller/route payload | **11 passed**, using the same cases; do not add these repeats as unique global coverage. |
| Root, MaxCore, PDIM, DNS, TLS full and production audits at low threshold | **Zero vulnerabilities in all ten observations**. Exact commands and raw audit responses are retained. |
| Actual Node dependency resolution | SendGrid mail/client/helpers and deepmerge are absent. |
| Actual installed-tree portable security gate | **Passed**, 97 security-family occurrences, zero failures. |
| Root targeted installation and frozen-lock consistency | Actual existing-tree npm installation passed; manifest/lock hashes unchanged. `npm ci --dry-run` passed. This is not a fresh npm ci rebuild. |
| PDIM stale installed package cleanup | Frozen forced reinstall passed with unchanged lock/workspace hashes; removed an unreferenced old qs 6.16.0 virtual-store copy. |
| Actual guarded legacy replay | **18 updates**, all 46 final checksums verified; idempotent; custom caller/helper changes rejected intact before any manifest write; unrelated file preserved; owned fixture removed. |
| Changed-source lint and whitespace | Passed. |

The initial installed-tree gate failure remains in
[actual-installed-absence.json](actual-installed-absence.json). Its lock audit
and active consumer were already patched; the physical obsolete package copy
was still present. Recreating that workspace's installed graph removed the
copy without changing its lock or source. The passing result is separately
recorded in [actual-installed-absence-final.json](actual-installed-absence-final.json).

The first combined execution remains in `after-regressions.xml`: 75 passes
and one failed test file because the new coherence test initially imported an
undeclared root-level YAML package. The test now resolves the parser through
its actual declared MaxCore Orval consumer. The final 77-case execution is
retained separately; the initial execution is not relabeled.

## Commands and what they verify

Use the documented [testing environment](../../../docs/testing/README.md)
with Node >=22.12.0, root and imported workspace dependencies, and a real
configured Chromium. No application database, provider key or remote delivery
is needed. These tests use owned local HTTP fixtures and controlled module
boundaries; no test sends a real email.

```sh
node --import tsx --test tests/sendgrid-alert-transport.test.mjs
node --test tests/legacy-sendgrid-security-coherence.test.mjs
node --test tests/runtime-artifact-gates.test.mjs
```

[The 11 alert tests](../../../tests/sendgrid-alert-transport.test.mjs) exercise
the actual alert service, transport and monitoring router. They verify request
serialization, recipient privacy, escaped HTML, 202 acceptance, provider
rejection and retry, per-channel cooldown, simultaneous admission, absent
configuration, invalid addresses/headers/oversized payloads, timeout,
redirect refusal, secret-safe diagnostics and route acceptance/failure/status
responses. The fixture's supplied auth identities do not replace the separate
real authorization tests.

[The two legacy coherence tests](../../../tests/legacy-sendgrid-security-coherence.test.mjs)
read the actual guarded bundle. Both roots must have consistent manifest,
npm lock and parsed pnpm graphs without the removed consumer, updated SDK
callers, and exactly the current alert transport. They stage the real completed
payload in a disposable directory, prove idempotency, and prove unknown caller
history is rejected without changing any staged file.

[Runtime artifact gates](../../../tests/runtime-artifact-gates.test.mjs) reject
vulnerable nested packages, absent/escaping dependency trees, malformed
versions, wrong source exclusions, altered capsules and invalid portable Node
provenance. The updated gate rejects reintroducing unpatched deepmerge; it
does not remove that package from the audited inventory to obtain a pass.

The actual combined command is:

```sh
REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium \
node --import tsx --test tests/sendgrid-alert-transport.test.mjs \
  tests/legacy-sendgrid-security-coherence.test.mjs \
  tests/patent-pdf-runtime.test.mjs tests/runtime-artifact-gates.test.mjs \
  tests/qs-security-contract.test.mjs tests/legacy-security-update.test.mjs \
  tests/http-dependency-consumers.test.mjs \
  tests/dependency-security-paths.test.mjs tests/dependency-advisories.test.mjs
```

The [MaxCore cohort](../2026-10-27-maxcore-dev/README.md) and
[qs cohort](../2026-10-27-qs/README.md) document the existing PDF, generator,
HTTP and qs checks used in this command. The original generic guarded-replay
tests continue to verify opt-in application, known predecessor admission,
path/symlink safety, addition collisions and whole-bundle preflight.

For the additional controlled known-original replay, run from the matching
source checkout:

```sh
node reports/dependency-hardening/2026-10-27-sendgrid-sdk-removal/verify-replay.mjs
```

This evidence driver requires the recorded Git objects `c06fbecd` and
`2c9b739a`, reconstructs only an owned disposable fixture, invokes the real
`applyLegacyUpdate`, and cleans the fixture. It does not apply changes to a
retained checkout. The driver intentionally verifies this 46-entry payload;
later payload changes require a new versioned rehearsal rather than editing
these historical receipts.

## Guarded legacy scope

[legacy-patch-provenance.json](legacy-patch-provenance.json) records every
changed or added entry and original Git hashes. Six existing manifest/lock
entries remove the SDK graph while preserving qs and every prior accepted
hash. Eight new caller/route updates use actual known-original hashes; two
new transport additions require absent targets. All original bundle entries
and predecessor chains remain present.

The first legacy Git object contains the three actual SDK callers and the
monitoring route. The old alert and email monitor equal the recorded root
baseline. The old worker differs, so only its SDK import and unused init block
are removed. The old route also differs, so only test-alert outcome handling
is changed. Unrelated legacy behavior is preserved.

No retained legacy working tree exists in this checkout. For a nested copy,
the update accepts only those exact verified original bytes. Different private
or custom history fails the whole preflight before package changes. The two
11-case serialized-payload runs verify the changed alert/route behavior; they
do not certify all unrelated historical code or a deployed legacy app. The
current production release excludes the legacy gitlink tree.

## Evidence boundary

[summary.json](summary.json) records exact counts, twelve final source hashes,
install observations and all audit results.
[manifest.json](manifest.json) hashes every artifact. Each command receipt
retains its real exit status, timestamp and log SHA256. Raw XML includes
assertions and failures. Reports contain no application credentials.

No production data or provider account was altered. Fresh integrated master,
release preparation, cold startup and configured deployed acceptance still
need their own evidence. These targeted passes do not resolve global coverage,
all-feature acceptance, migration/recovery, native builds or launch capacity.
