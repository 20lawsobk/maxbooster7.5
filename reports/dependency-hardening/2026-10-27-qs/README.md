# qs dependency hardening — October 27, 2026

Patched `qs` from 6.16.0 to 6.16.1 in the root, imported MaxCore and imported
PDIM application dependency graphs. The
[advisory](advisory.json), published during the verification period, affects
comma-array serialization of objects without a callable `toString`.
The fixed registry tarball's SHA512 integrity was verified before installation.

This is dependency-level and isolated HTTP evidence. Source inspection found
no direct application use of `qs.stringify` or comma-array serialization in the
inspected client/server/shared/imported API sources. The advisory and PoC do
not establish that an existing Max Booster endpoint crashes.

## Results

| Check | Result |
| --- | --- |
| Actual installed dependency PoC before patch | All 18 hostile vectors threw: three sources × two comma paths × three real Express dependency graphs. |
| New canonical contract before patch | 21 failures and 3 passes; ordinary parameter/array cases already passed. |
| New contract plus existing dependency/HTTP/legacy regressions after patch | **52 passed, 0 failed, 0 skipped** across five test files; 24 cases belong to the new qs contract. |
| Actual Express and body-parser dependency resolution | All three application graphs resolve qs 6.16.1. |
| Targeted installation | Root npm install and both imported frozen pnpm installs passed; all eight edited file hashes stayed unchanged during installation. |
| Guarded legacy replay | Eight entries updated across the two retained roots; all 36 final checksums verified, second replay changed nothing, custom edits were rejected/preserved, unrelated user content survived and the disposable fixture was removed. |
| Production audits at `low` threshold | Root, MaxCore, PDIM, DNS and TLS proxy: zero reported vulnerabilities. |
| Full dependency audits at `low` threshold | Root, PDIM, DNS and TLS proxy: zero. The initial MaxCore development graph retained the findings below. |
| New test lint and patch whitespace | Passed. |

The initial MaxCore all-dependencies audit records two `markdown-it` advisories
(one low and one high, installed 14.3.2 through `orval > typedoc`, fixed in
14.3.3) and one high `zod` advisory (installed 3.25.76 through
`scripts > puppeteer-core > chromium-bidi`, with the advisory naming 4.6.6 as
the first patched version). These are development-graph findings; the MaxCore
production audit is zero. Their compatible remediation is a separate work
item. No forced Zod 3-to-4 override or unrelated dependency update was made in
this qs patch. Retain these initial audit responses if later work resolves
them; do not rewrite them as historical passes.

Fresh integrated verification and release preparation are required because
dependency inputs changed. These receipts do not certify launch readiness or
the remaining 100% source-coverage and deployed acceptance gates.

## What the test does and how to run it

Use the documented Node 22 toolchain and install the root plus both imported
pnpm workspaces as described in [the testing guide](../../../docs/testing/README.md).
No application database, provider key or running Max Booster server is needed.
The HTTP cases create and close owned loopback Express servers.

From the repository root:

```sh
node --test tests/qs-security-contract.test.mjs
```

For each of the three actual Express dependency graphs, the test checks:

- JSON, prototype-preserving query and null-prototype query objects on both
  comma-array serialization paths, asserting the exact safe output.
- Literal text, plus/space/ampersand/Unicode values, nested objects and arrays
  using indices, brackets, repeated parameters and normal comma output.
- Actual Express extended query parsing, JSON bodies and URL-encoded bodies,
  followed by serialization and a healthy subsequent request.

The broader regression command is:

```sh
node --test tests/qs-security-contract.test.mjs \
  tests/legacy-security-update.test.mjs \
  tests/http-dependency-consumers.test.mjs \
  tests/dependency-security-paths.test.mjs \
  tests/dependency-advisories.test.mjs
```

The package-manager installs used `--ignore-scripts` and existing prepared
dependencies. They changed only the selected package resolution; they do not
replace the project's complete build/native-dependency setup instructions.

The reproducible guarded replay drill reads the saved pre-advisory bundle from
Git and updates a disposable directory, preserving the working legacy tree:

```sh
node reports/dependency-hardening/2026-10-27-qs/verify-replay.mjs \
  c06fbecdb32a5c3b76662f631604bfd9abac386b
```

## Evidence and limitations

See [summary.json](summary.json) for exact case counts, installed versions,
source hashes and audit observations; [patch-integrity.json](patch-integrity.json)
for the eight changed files and predecessor integrity;
[before-tests.xml](before-tests.xml) and [after-tests.xml](after-tests.xml) for
actual assertions; and each install/audit/replay JSON receipt for command,
timestamp, exit code and log SHA256. Audit metadata responses remain in the
matching `.txt` files. No broad `npm audit fix` or unrelated lock regeneration
was used. DNS/TLS locks and the empty Electron dependency manifest were not
modified because they contain no qs resolution.

Two runner failures remain intact with their diagnoses: the first combined
test attempt forwarded registry proxies to an isolated Electron loopback
fixture and received 403; the standard clean-fixture rerun passed. The first
replay evidence driver exceeded Node's default 1 MiB subprocess-output buffer
before fixture writes; increasing that driver's buffer allowed the real replay
drill to complete. Neither receipt is relabeled as a passing execution.
