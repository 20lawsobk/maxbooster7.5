# Exact Node coverage compatibility blocker

Recorded October 28, 2026. This continues **C5** of the
[existing C0–C7 completion sequence](completion-execution-plan.md#execution-sequence-toward-100-coverage)
and **P1/P2** of the
[existing producer implementation plan](coverage-producer-implementation-plan.md).
No source, tests, compiler configuration, coverage counters or thresholds were
changed by this trace. The requested target remains 100% for lines, statements,
functions and branches across the entire existing platform denominator.

The [retained evidence](../../reports/coverage-producer/2026-10-28-compatibility-trace/README.md)
replays actual executed JavaScript, original maps and raw V8 counters from the
[committed-source Node producer](../../reports/coverage-producer/2026-10-28-a1603b13-node/receipt.json).
It does not rerun product behavior. All nine replayed serialized results,
including counters, exactly reproduce the saved Node profile. All nine remain
incompatible with the canonical maps and **remain unmerged**.

## Provenance and present result

The baseline is the immutable `coverage/coverage-final.json` member in the
preserved 8cad master archive, not reconstructed source or a new compilation.
Its SHA256 is
`b3c316c5eef7f07ef552b1b1653b3f7c058f685d2491f69f6110a87148423fcd`;
the archive/member bytes and all nine selected entries were reverified. This
matches the original Node collector receipt's actual baseline SHA256.

The later completed canonical run is bound to source
`a1603b13b6352a978e3877a2f43f1ccd98a98a18`. Its three maps for all nine selected
files equal those retained baseline maps; its counters were not copied. The
current global metrics are 13.10% lines, 13.00% statements, 8.67% functions and
8.77% branches across 2,653 files. All four requested 100% thresholds remain
unmet. See the exact source/profile hashes and counts in
[`current-canonical-comparison.json`](../../reports/coverage-producer/2026-10-28-compatibility-trace/current-canonical-comparison.json).
These JavaScript/TypeScript measurements do not establish Python, Go, Rust,
C++, page-feature acceptance, provider delivery or deployment readiness.

## Small exact counterexample: `server/config/ports.ts`

| Complete map | Canonical | Node | Actual result |
| --- | ---: | ---: | --- |
| Statements | 21 | 25 | Different |
| Functions | 3 | 4 | Different |
| Branches | 6 | 6 | Serialized maps equal; raw memory representation differs |

The original module contains `readPort`, `assertUniquePorts` and `loopbackUrl`.
The retained `tsx` execution adds these compiler constructs:

```js
var __defProp = Object.defineProperty;
var __name = (target, value) =>
  __defProp(target, "name", { value, configurable: true });
// Actual compiler calls after the corresponding declarations:
__name(readPort, "readPort");
__name(assertUniquePorts, "assertUniquePorts");
__name(loopbackUrl, "loopbackUrl");
```

The installed `tsx` transform has `minifyWhitespace: true` and
`keepNames: true`. The actual Node JavaScript, rather than an inferred transform,
proves these additions. Its source map's first original mapping begins at
generated column 114 and points to original line 9/column 0. Both helper
declarations preceding that point contain **no original mapping segments**.
The converter nevertheless emits an additional anonymous function at original
line 9/columns 0–6, where the original module has a constant declaration.

The three helper calls each have an explicit compiler mapping to the original
function name: line 27/column 9, line 47/column 9 and line 85/column 16. Thus simply
discarding wholly unmapped prefixes would not align the full statement map.
The [exact details](../../reports/coverage-producer/2026-10-28-compatibility-trace/ports-exact-details.json)
retain executed offsets, mapped segments, both directional source lookups,
the complete function/statement maps and all representation differences.

The common converter package/version alone does not establish compatibility.
Vitest executes its own Vite/SSR transform and supplies provider-specific
`ignoreNode`, wrapper and class-method options. The standalone collector parses
the actual `tsx` execution and currently supplies none of that provider policy.
Both use `ast-v8-to-istanbul`; their execution/transform contracts differ. The
observed helper injection proves the concrete ports counterexample. Other
files require their own exact transform differences before choosing a shared
policy; this trace does not assume that one helper explains every difference.

## A second, separate format issue

The collector currently compares an already parsed canonical JSON profile to
newly converted in-memory data. The converter uses `Infinity` for some end
columns and can retain coordinate properties with value `undefined`. JSON
serializes `Infinity` as `null` and omits `undefined` properties. The original
diagnostic's serialized `null` values did **not** establish that the raw value
was `NaN`; the replay identifies it precisely as `Infinity`.

The strict in-memory comparison therefore also flags branch maps in cases
where both persisted JSON maps are equal. Three of the nine selected branch
maps equal their canonical counterparts after serialization, including ports.
Every file still has a genuine statement/function mismatch, so this diagnostic
difference has not admitted or merged any coverage.

Do not fix this by silently JSON-roundtripping arbitrary malformed coordinates,
accepting `NaN`, unioning maps, copying selected function/branch hits or excluding
the affected production files. First specify a versioned coordinate/wire-format
policy matching the real provider, retain raw typed representation and reject
unsupported values. Comparison and storage must then use that same validated
representation for every participating producer.

## Exact next work inside the existing plan

Execute these in order. They refine C5/P1–P7; they do not replace C0–C7 or any
of the 80-page, shared/unrouted, language or deployment work.

| Order | Existing lane and concrete task | Required validation and acceptance |
| --- | --- | --- |
| 1 | C5/P1: retain a versioned transform/converter contract in `coverage-provenance.mjs` and producer manifests: actual parser/compiler versions/options, wrapper offsets, generated-node policy and coordinate representation. | Unsupported/mixed policies fail. Raw `Infinity`/`undefined`/null/missing/NaN cases are explicitly distinguished. Persisted and in-memory decisions agree only through the reviewed schema; malformed coordinates never become accepted by serialization. |
| 2 | C5/P1: add a small actual-runtime regression based on the ports counterexample, plus Unicode, untouched original functions/branches, and a legitimate author-defined `__name`. Use current `tests/testing/coverage-provenance.test.mjs` for the framework regressions. | Before repair, prove the extra helper function/calls and preserve the incompatible profile. After repair, generated helpers cannot credit original constants/functions, a real author function is retained, and an unexecuted original branch stays zero-hit in the same denominator. |
| 3 | C5/P1–P2: align transform and conversion handling through one reviewed participating-producer policy. Preserve actual runtime bytes/maps; prove generated AST identity from the admitted compiler profile, rather than deleting nodes merely named `__name`. | All three complete maps for the representative real module must equal a same source canonical profile. If wider compiler changes are needed, rerun original execution under that shared contract; do not apply old V8 offsets to newly compiled code. |
| 4 | C5/P2: recheck the existing two-assertion in-process Node suite from a new source freeze, then all nine retained subjects under the accepted policy. | Actual behavior remains unchanged, originals/hash/maps/raw counters match, strict statement/function/branch maps all agree, raw snapshots are not duplicated, and owned processes clean up. Until then, P1 remains unmerged and the current single-suite allowlist remains intact. |
| 5 | C5/P3: prove ownership/cleanup of independently daemonized PostgreSQL sessions before admitting SQL suites, then archive each exact esbuild subject/map/metafile before fixture deletion in `helpers-database-postgres.mjs`. | Missing/different bytes/maps, a killed/unflushed producer, a substituted fixture module or an unowned daemon fails collection. Preserve the actual fixture boundaries and egress restrictions. Do not add SQL files to today's in-process-only allowlist first. |
| 6 | C5/P4: instrument the actual application process spawned by `integration-browser.mjs`, with separate worker/child identities. | Capture/flush the server's real code/maps/counters before shutdown. Existing HTTP assertions and isolated DB/egress/credential guards remain unchanged. Instrumenting only the HTTP test driver cannot pass this step. |
| 7 | C5/P5: extend actual CDP collection to relevant browser contexts/workers/reloads, following the existing Studio producer and `page80-acceptance.mjs`. | Exact served/decoded/runtime JavaScript and maps match, snapshots are non-overlapping with explicit reset semantics, missed targets fail collection, and every selected page remains present. Studio's existing 92-versus-90 statement mismatch remains open until independently aligned. |
| 8 | C5/P6–P7, then C7: combine only genuinely compatible complete profiles and integrate the proved producers into the master. | Keep every original file and zero-hit counter, deduplicate producer/snapshot identities, reject stale/excluded/unmapped data, regenerate all four decisions and rerun from stable source. Passing producer checks do not waive failed behavior, source-feature, accessibility, provider or deployed gates. |

The next source edit is the bounded **C5/P1 coordinate/transform contract and
its real counterexample regressions**, followed by one compatible P2 execution.
Wiring incompatible collection into all runners first would create more
unusable evidence. Continue C1–C4 behavior work for genuine remaining gaps and
C6 for other languages; this measurement repair does not promise 100% coverage.

## Reproduce the read-only trace

From the repository root with the installed Node 22 and Python runtimes:

```sh
python3 reports/coverage-producer/2026-10-28-compatibility-trace/run-readonly-analysis.py
```

The wrapper uses a clean credential-free child environment and a 30-second bound
per command. It verifies the immutable archive/member and nine selected entries,
validates the actual retained producer manifest/code/map/originals, reconverts
the original counters and asserts exact equality to the saved Node JSON. It
also records the initial report-harness package-entry error separately: that
expected exit 1 is not a product assertion failure. The corrected replay uses
the packages' public exports. Input hashes before/after prove the selected
production/producer/configuration inputs and canonical coverage were untouched.

The scripts write only adjacent report files, so use a copied evidence cohort
or a new versioned output if preserving this exact receipt. The original
retained paths and absolute source URLs bind this workspace; another clone
must re-collect or explicitly validate relocated originals instead of silently
rewriting map paths. No dependency installation, network, private state,
application startup or new product side effect is required.
