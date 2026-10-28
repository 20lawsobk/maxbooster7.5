# MaxCore compatible dependency repair — October 27, 2026

The actual MaxCore scripts consumer now resolves Puppeteer **25.13.0**, its
selected browser manager **3.2.4**, Chromium BiDi **157.0.8090-0**, and BiDi's
own Zod **4.6.7**. TypeDoc's actual Markdown consumer resolves **14.3.3**.
The narrow update removes the vulnerable Zod 3 chain through its compatible
upstream Puppeteer release; it does not force Zod 4 into the incompatible old
BiDi parser. The Markdown override and installed-version gate now enforce
14.3.3. The portable dependency gate also enforces qs 6.16.1 and Zod 4.6.6.

The [research plan](../../../docs/testing/dev-dependency-advisory-plan.md)
records the three original MaxCore advisories, upstream sources and why an
unqualified Zod major override would break invalid-input handling. The
[initial qs cohort](../2026-10-27-qs/README.md) retains the original failing
MaxCore audit. These receipts are a separate, subsequent cohort.

## Actual results

| Verification | Result |
| --- | --- |
| Before: graph and bounded collection contracts | **4 failed**: old graph, 1,000 array/set element visits before rejecting size, and no old-Zod Map size API. |
| Installed-consumer contracts after repair | **7 passed**, no failures or skips: compatible graph, actual BiDi valid/invalid parser, early array/map/set size checks, six bounded Markdown advisory inputs plus normal rendering, real Chromium CDP interaction/Unicode/PNG/process cleanup. |
| Existing PDF, runtime gate, qs, guarded replay, HTTP, code generation and security regressions | **64 passed**, no failures or skips. The actual patent generator produced a Letter PDF with configured Chromium. |
| Final runtime gate rerun | **10 passed**, including explicit rejection of qs 6.16.0, Markdown 14.3.2, Zod 3.25.76 and Zod 4.6.5. This overlaps the broader group; do not add the counts. |
| MaxCore frozen pnpm install | Passed; manifest, workspace and lock hashes unchanged. |
| Scripts TypeScript and installed security-version gate | Passed. |
| Changed-source lint and whitespace | Passed. |
| Guarded legacy replay | Passed; 36 checksums, eight qs upgrades, idempotency, custom/unrelated content preservation and owned fixture cleanup. |
| MaxCore, PDIM, DNS, TLS: full and production audits at low threshold | **Zero reported vulnerabilities** in all eight observations. |
| Root: full and production audits at low threshold | **Failed**, four low-severity audit nodes from newly published deepmerge GHSA-gcqx-w48m-w2h4 through SendGrid. No available upstream deepmerge patch; separate consumer-removal work is required. |

The root audit failure remains in this cohort. It must not be relabeled as an
audit pass after later source changes. The
[deepmerge review](../../../docs/testing/deepmerge-advisory-plan.md) records
the authoritative no-patch status and actual SDK consumer. npm's suggested
SendGrid downgrade is not an accepted remediation.

## Run and understand each check

Install the root and MaxCore workspace dependencies using the documented
[testing setup](../../../docs/testing/README.md), with Node >=22.12.0 and a
real configured Chromium executable. This cohort ran Node 22.23.3 and Chromium
154; [installed-versions.json](installed-versions.json) records the exact
actual consumer paths and engine requirements. No application credentials,
database, running application, remote page or provider delivery is needed.

From the repository root:

```sh
REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium \
  node --test tests/maxcore-dev-dependency-security.test.mjs

REPLIT_PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chromium \
  node --import tsx --test tests/patent-pdf-runtime.test.mjs \
  tests/runtime-artifact-gates.test.mjs tests/qs-security-contract.test.mjs \
  tests/legacy-security-update.test.mjs tests/http-dependency-consumers.test.mjs \
  tests/dependency-security-paths.test.mjs tests/dependency-advisories.test.mjs

pnpm --dir external/maxcore --filter @workspace/scripts typecheck
node external/maxcore/scripts/check-js-security-versions.js

node reports/dependency-hardening/2026-10-27-qs/verify-replay.mjs \
  c06fbecdb32a5c3b76662f631604bfd9abac386b

pnpm --dir external/maxcore install --frozen-lockfile --ignore-scripts
pnpm --dir external/maxcore audit --audit-level=low --json
pnpm --dir external/maxcore audit --prod --audit-level=low --json
```

The new contract resolves packages through the actual scripts, BiDi, Orval and
TypeDoc consumers. It never substitutes a root package mock. Three size tests
use only 1,000 elements and assert zero untrusted item visits before rejection,
one `too_big` issue, and valid single-item acceptance. The BiDi parser test
checks an actual `invalid argument` error containing the invalid field path;
a TypeError is a failure. Six bounded Markdown cases exercise both advisory
families with enabled HTML where relevant, plus exact ordinary rendering.
The browser test serves one owned loopback document, clicks a button, verifies
Japanese/Arabic/emoji text, captures a valid PNG, closes its browser child and
listener, and makes no application or provider request.

The patent regression checks actual generator PDF bytes, size, Letter media
box and missing-document failure. Runtime gates use disposable installed-tree
fixtures to reject vulnerable nested versions even when top-level manifests
look patched. The existing dependency suite performs actual isolated OpenAPI
generation; it does not run destructive code generation in tracked outputs.
The replay drill reconstructs the previous bundle in a disposable directory,
then exercises the real guarded update implementation.

Use the same full/prod audit commands for PDIM; root/DNS/TLS use `npm audit
--audit-level=low --json` and `npm audit --omit=dev --audit-level=low --json`
in their own directories. Audit receipts retain exact commands, scope,
timestamps, exit status, vulnerability counts and hashed response logs.

## Evidence boundary

[summary.json](summary.json) records counts and source hashes.
[manifest.json](manifest.json) hashes every retained artifact. XML receipts
retain all actual assertions, including the original four failures. The first
passing browser receipt pinned the observed host major; the final contract
accepts the configured Chrome version, avoiding an artificial failure after
a legitimate host browser update. Both receipts remain intact.

This verifies the ordinary Chrome/CDP browser path and the actual BiDi parser,
not a browser BiDi session. No current main-server Puppeteer consumer was
found in Git-visible current sources; the patent generator is a scripts CLI.
A package's development classification alone is not a reachability proof.
These source-bound checks do not certify deployment, migration, global scale,
all-feature acceptance or 100% platform coverage. Changed dependency inputs
require fresh integrated master and portable release verification after all
coordinated batches finish.
