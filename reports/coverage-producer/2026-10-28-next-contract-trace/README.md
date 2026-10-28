# C5 shared transform and coordinate trace

This is a source/map analysis from October 28, 2026, America/Detroit. It
continues C5/P1–P2 of the existing completion plan. **No application subject
executed, no counter was merged, and no coverage or launch approval is granted.**

The earlier actual bca Node collector passed its two existing assertions but
left every profile unmerged. Its narrow, source-proven `__name` policy removed
compiler name helpers without removing original functions. Two of nine
persisted complete map sets then matched the canonical maps; seven still did
not. This trace preserves those exact runtime witnesses and identifies the
next transform contract needed before fresh execution can be admitted.

## Exact observations

| Control | Files | Full persisted maps matching historical baseline | Execution |
| --- | ---: | ---: | --- |
| Plain esbuild, unminified and `keepNames: false` | 2 | 0/6 | None |
| esbuild → Vite SSR → installed Vitest provider | 2 | 6/6 | None |
| Actual tsconfig-aware Vite transform → SSR → installed Vitest provider | 9 | 27/27 | None |
| Independent bounded typed replay of the nine controls | 9 | 27/27 | None |

The last replay's transform/conversion loop took 390.058ms. Its complete
credential-free wrapper finished in 1.017s, with exit 0 and unchanged current
common source inventory and global coverage bytes. All statement, function
and branch counters in every map-only control are integer **zero**. These
profiles establish map shape only; they cannot establish a called function,
passed product case, complete generation service or improved coverage.

The final replay compares raw in-memory maps with saved JSON as well. All 27
raw comparisons fail, even though all 27 persisted maps agree. Explicit typed
records prove exactly 7,434 positive `Infinity` end-column values serialized
as null and 3,080 own `undefined` coordinate properties omitted from JSON.
The latter form 770 complete synthetic branch locations. No prototype or
other typed differences occurred in this replay. These observed types do not
license decoding arbitrary legacy null/missing values into trusted sentinels:
`NaN` also serializes to null. The typed codec remains proposed and unimplemented.

The current canonical run is source `10d192675beefcf1b7beef3ce47c271db0cc17cf`,
common digest `cbf794e080119fa4f64ec6ebce2b29b3d78641d606a3059c0c207b2420324418`.
Its actual global profile SHA256 is
`3a4baa7bdb84c4863c60801782a09aae05a129a71d9e0bb9334a2e7baf7990f8`.
All nine current complete map sets also agree with the a160 maps and these
controls: 27/27. **Only maps were compared; current counters were not copied or
combined.** The source-bound current master separately measures 13.11% lines,
13.01% statements, 8.68% functions and 8.78% branches over 2,653 files, with all
four 100% targets still unmet. This trace earns none of those hits.

## What the actual retained code explains

[The exact runtime witnesses](runtime-ast-witnesses.json) retain actual tsx
JavaScript, map/source identities and AST locations. Their
[compact summary](witness-summary.json) relates the observed extra constructs
and genuine original span changes to each complete map difference:

- `PocketDimensionChunkStore.ts`, Redis `store.ts`, `pdimClient.ts` and
  `lua-pool.ts` contain emitted class static `__name(this, …)` statements.
- `PocketDimensionChunkStore.ts` and `luaExecutor.ts` contain tsx's injected
  dynamic-import `.then` interop function and its conditional/logical branches.
- `logger.ts`, `logSanitizer.ts` and other affected entries also have genuine
  original arrow/statement span shifts. Removing generated helpers alone
  cannot repair those complete maps.

These are witnessed cause classes, not an asserted exhaustive attribution of
every differing entry. Neither a regex helper name nor a coordinate codec can
justify deleting an authored arrow, class member or original branch.

The installed library observations record tsx 4.23.12, Vite 7.3.7, Vitest and
coverage-v8 4.1.12, esbuild 0.28.2, ast-v8-to-istanbul 1.0.7 and TypeScript 5.9.3.
The actual tsx implementation forces `minifyWhitespace` and `keepNames` true
and inserts its dynamic-import interop. Vite's transform disables minification,
tree shaking and keepNames. The successful nine-file control additionally
uses Vite's tsconfig-aware transform, SSR mapping and the installed provider's
original-node policy. Changing the two esbuild flags alone was disproven.

## Runtime boundary and API correction

The original diagnostic recipe imports the version-specific minified private
Vite `ht` export. That recipe is retained as evidence, not a shipped integration.
Vite 7.3.7 actually exports the same SSR transform publicly as
`moduleRunnerTransform`; the next adapter can use that entry.

The earlier coordinate proposal cites plain Vite's default evaluator. That is
not the canonical Vitest execution wrapper. The installed
`vitest/dist/module-evaluator.js` constructs a VM wrapper and records
`startOffset: codeDefinition.length`. That offset is a UTF-16 prefix length
passed to the coverage converter. Default Vite's evaluator has a separate
line-padding calculation. The [exact API/wrapper citations](runtime-wrapper-and-public-api-evidence.json)
retain both implementations and this correction.

Every map-only control here passes empty functions and wrapperLength 0. That
can prove the denominator/maps while proving nothing about actual runtime
counter offsets. A future adapter must record the actual compiled script,
transformed body and complete wrapper, then derive and validate that script's
real offset. Old tsx V8 offsets must never be applied to reconstructed SSR code.

The coverage package's public `getProvider()` loads its provider. Its
`remapCoverage` method remains an implementation hook rather than a guaranteed
cross-version API. Any adapter must fail on unsupported version/hash/shape and
retain the exact provider options and generated-node decisions. Installed
packages must not be edited in place.

## Next bounded implementation

[next-patch-spec.json](next-patch-spec.json) gives eight dependency-ordered
steps, exact implementation paths, explicit validation/acceptance and rollback
boundaries. It adds detail inside the existing C5/P1–P7/C0–C7 sequence:

1. Agree the versioned source/transform/converter/wrapper/coordinate identity.
2. Execute a bounded Node P1 experiment through supported Vite interfaces,
   capturing the actual script, transform/map and wrapper before conversion.
3. Preserve the existing provider policy through a version/hash-guarded adapter,
   while proving that authored helper or SSR lookalikes cannot be hidden.
4. Implement and test a separate strict raw validator and typed wire codec.
5. Capture canonical Vitest raw maps and typed sidecars before serialization,
   preserving source scope, zero-hit nodes, tests and every 100% threshold.
6. Recollect the actual two-assertion P1 suite and a same-source canonical
   profile, then compare all nine complete map sets under that shared contract.
7. Admit a merge only after complete source, map, counter, snapshot and
   process-ownership checks pass. Otherwise retain `UNMERGED`.
8. Continue the existing SQL ownership, actual server/child, browser/worker,
   cross-language and full master work. All 80 pages, 2,162 sections and 12,972
   dimensions remain required.

The original [coordinate proposal](coordinate-policy/coordinate-contract-proposal.json)
is retained unchanged as an unimplemented earlier proposal. This report's
wrapper/API correction and shared-transform dependency are required additions.
No policy, codec, fresh participating runtime or global integration has passed
merely because these map-only controls agree.

## Validate and reproduce safely

From the corresponding prepared checkout, this read-only verifier checks the
retained hashes, exact full maps, zero counters, typed differences, installed
API observations and recorded current canonical map identities:

```sh
python3 reports/coverage-producer/2026-10-28-next-contract-trace/validate-trace.py
```

It prints a JSON integrity result and exits nonzero on a mismatch. It performs
no application imports, test execution, network requests, inference or writes.
A later genuine source/library/profile change can invalidate current-input
checks; preserve this historical receipt rather than modifying it to keep a pass.

The original transform recipes and their original output are under
[recipes-and-original-observations](recipes-and-original-observations/).
The independently repeated recipe, exact command/exit and typed records are
under [typed-review](typed-review/). They retain original absolute workspace
selectors. To repeat transformations, copy to a fresh owned output directory,
explicitly change only the selectors, save the changed recipe bytes and use
Node 22 with the matching installed package hashes. Never run a recipe that
would overwrite this versioned cohort. A different clone/runtime requires new
execution provenance before any eventual merge, even if text hashes agree.

`manifest.json` hashes every retained artifact except itself. The adjacent
validation is report integrity only. Legacy snapshots, old actual counters,
new empty controls and future runtime evidence remain distinct.
