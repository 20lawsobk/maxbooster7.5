# SAST resumption evidence

## Disposition

**Still incomplete; release gate remains blocked.**

The local runner's actionable target-selection failures were repaired without
changing the Git-tracked source inventory, excluding test source, suppressing a
security rule, or discarding a finding. The one permitted full verification
attempt exceeded the execution harness's 300-second command bound before
Semgrep produced its atomic JSON output. The previous
`sast-recovery.json`/`.md` therefore remain the latest completed full scan and
must not be described as clean: they report 3,222 inventoried files, 3,031
scanner-reported files, 191 omitted files, 71 parser/scanner errors, and 50
findings (8 ERROR, 42 WARNING).

No application was started, no live service or data was touched, and no
credential value was printed or recorded.

## Runner repairs

- Semgrep now receives every immutable staged inventory path explicitly. This
  closes the prior discrepancy where Semgrep's directory target selection
  omitted test paths and other inventoried source even though those paths were
  intentionally in scope.
- Eleven built-in, improbable marker rules make each supported inventory
  language an applicable target even when the registry pack has no applicable
  rule for a file. Marker matches are retained as INFO results rather than
  filtered. The security-audit pack still runs unchanged.
- `--no-rewrite-rule-ids` preserves stable registry rule IDs instead of
  prefixing them with a random temporary directory.
- The per-rule timeout threshold increased from one to three and the default
  per-rule bound from 10 to 30 seconds. Timeouts and parse errors still make the
  scan incomplete; these changes prevent one expensive file/rule pair from
  prematurely ending that rule's remaining coverage.
- Exact duplicate scanner records are collapsed only when rule ID, path, and
  complete start/end location are identical. Findings at different locations
  remain distinct.
- Structured Semgrep error types now retain the stable category (for example,
  `PartialParsing`) instead of serializing internal objects. Temporary paths
  remain masked; matched source and metavariables remain absent.

## Verification performed

1. `node --check scripts/readiness-sast-scan.mjs` passed.
2. `node --test tests/readiness-sast-scan.test.mjs` passed 6/6 tests, including
   exact-duplicate handling and structured error normalization.
3. A bounded scanner integration fixture explicitly inventoried JavaScript,
   TypeScript, Python, Rust, Go, and Dockerfile source. Semgrep 1.172.0 reported
   all 6/6 paths, zero omissions, zero errors, and `complete=true`. Before
   explicit target paths, the same fixture reproduced the omission (3/6).
4. `node scripts/readiness-sast-scan.mjs` was attempted once after the repairs.
   The execution harness terminated the command at 300 seconds. No Semgrep
   process remained afterward, and the prior completed evidence files retained
   their 2026-09-22 09:23:10 UTC modification time; no partial result replaced
   them.
5. `git diff --check` passed for the SAST runner and focused test before the full
   attempt; the final scoped diff was checked again after writing this report.

## Source validation of highest-priority completed-scan results

These are triage conclusions, not suppressions. The full finding list remains
in `sast-recovery.json`.

1. **Actionable SSRF boundary:** `external/maxcore/artifacts/ai-training-server/ai_model/intent/url_reader.py:205`
   opens its supplied URL directly. The nearby code classifies the hostname but
   does not establish a public-address policy, redirect revalidation, or a
   scheme allowlist before `urlopen`. If the URL is reachable from an
   HTTP/RPC-controlled path, route it through the repository's safe URL-fetch
   policy and validate every redirect/address.
2. **Actionable shell construction:** `script/build.ts:308` invokes
   `execSync` with a shell command containing a JSON-quoted path. JSON string
   quoting is not shell escaping (shell expansions remain possible inside
   double quotes). Prefer an argument-vector API such as `execFileSync("du",
   ["-sb", "--", target])`.
3. **Requires trust-boundary proof:** the `pickle.loads` at
   `external/maxcore/artifacts/ai-training-server/ai_model/gpu/hyper_creative_transformer.py:95`
   currently reads an in-memory cache populated by the paired `pickle.dumps`.
   It is safe only while no external/shared cache writer or persistence restore
   can influence `_PREFIX_KV_CACHE`; replace pickle with a non-executable format
   or document/enforce that invariant.
4. **Dynamic execution requires invariant enforcement:** the `exec` at
   `external/maxcore/artifacts/ai-training-server/ai_model/isolated_audio_worker.py:36`
   parses and name-checks function source but does not constrain function-body
   AST operations. Its safety depends on the documented mode-0600,
   supervisor-only canonical-source boundary. That provenance and file
   ownership must be tested at the producer/consumer boundary.
5. The four ERROR cleartext-request results in PDIM reviewed here target the
   Replit sidecar on literal loopback `127.0.0.1:1106`, or an internal sidecar
   endpoint. The three literal-loopback probes are not network cleartext
   credential transmission. The configurable sidecar endpoint at
   `external/pdim/.replit_integration_files/server/replit_integrations/object_storage/objectStorage.ts:278`
   still needs an enforced loopback/approved-local-endpoint invariant.
6. The child-process results at
   `server/services/advancedVideoRendererService.ts:562` and
   `server/services/backup/databaseBackupService.ts:212` use argument arrays,
   not shell mode. They are not the same injection shape as the build-script
   result, but executable provenance and allowed-tool selection remain relevant
   operational controls.

## Remaining blockers

- A completed full scan of the unchanged 3,222-file (or newly generated
  current) Git-tracked inventory is still required. Run the repaired runner in
  an execution context allowed to exceed five minutes and retain its generated
  JSON/Markdown atomically.
- Semgrep 1.172.0 previously produced 70 `PartialParsing` errors, largely on
  valid TSX text containing raw ampersands, plus one rule timeout. The runner
  deliberately does not downgrade these. If they remain after the timeout
  changes, use a scanner/parser release that parses the unchanged source; do
  not rewrite staged source or mark partial parsing complete.
- Every genuine finding, especially the URL-fetch and shell-construction
  boundaries above, needs owner remediation or documented source-level
  disposition. This worker did not edit those owners' files.
- The independent local scan does not replace the authoritative production
  security gate, packed-image checks, authenticated acceptance, or other
  readiness blockers.