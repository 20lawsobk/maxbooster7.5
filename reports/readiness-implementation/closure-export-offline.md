# Export/offline closure execution

## Scope and disposition

Read the original CG/client-offline findings, closure-verification, remaining-gap-execution, coverage-gaps implementation and superseding resume-client-auth report. Implemented focused modules only. **CG-2, CG-3 and the partial CO findings remain partial, not production-certified.**

### Implemented production paths

- Generic export claims and all subsequent transitions now include the actor in the SQL predicate, rather than changing a job before checking its owner.
- Audio admission and queued-job execution share a pure codec contract. Unsupported 32-bit FLAC, invalid MP3 sample rates and previously ignored effect-tail requests fail explicitly. AIFF 32-bit uses floating-point PCM, matching WAV semantics. Unknown data formats/types cannot produce mislabeled CSV/audio.
- All selected audible track renders pad/trim to the same finite timeline end (maximum one hour), preserving stem alignment. Nonfinite/negative timing, fades/gain and invalid pan/volume fail before encoding. Native encoding uses one codec thread.
- Successful durable cancellation immediately kills the local native encoder. A single-flight one-second repository monitor aborts a renderer cancelled/recovered on another replica, including failures to verify its processing state. Native start also checks cancellation, covering pre-spawn cancellation. Publication remains fenced by durable state.
- Uploaded-but-uncommitted/corrupt artifacts are deleted in worker cleanup. Explicit artifact expiry is honored at the exact boundary, fails closed on invalid dates, hides the download link and returns HTTP 410 before storage reads. **No retention period was invented:** current creators do not populate expiry until policy is selected.
- Offline audio caching now reads actor-authorized storage bytes, not arbitrary URLs or filesystem paths. Bounded source sizes/clip counts, SHA-256 checksums and owner/project-qualified pocket keys replace fake zero-byte fallback success. Cache index writes serialize per actor within a process.
- Server-only refresh actually reacquires project/track/clip data and owned audio. Local dirty changes remain intact with conflict/error state; sync no longer pretends that incremented counters uploaded edits. Change counters persist. Import's previous ID-only success now explicitly rejects without mutation; this is a safety repair, **not an implemented import engine**.
- The advertised offline download URL now has an authenticated handler producing an actual versioned JSON `.mbproj` snapshot containing project metadata and checksum-verified base64 audio. Metadata reports actual serialized bundle size. Corruption and legacy unverified audio fail explicitly. No browser importer/round trip is claimed.
- Uncache deletes only owner-qualified pocket audio, never arbitrary persisted filesystem paths, and propagates storage deletion failures rather than reporting false cleanup.
- Client cache checks reject invalid/nonfinite expiry and equality-at-expiry in memory, IndexedDB reads and cleanup.

## Shared integration patches

**None required.** Existing `server/routes/export.ts` mounts the modified durable router and the existing shared bootstrap mounts `server/routes/offline.ts`. Both focused routers are edited directly. No changes to shared routes/index/storage/schema/App/main/queryClient, root packages or migration files.

Retain the existing reviewed prerequisite for `migrations/0023_generic_export_jobs.sql`; this worker did not apply it. Optional artifact expiry is a JSON property and requires no DDL. Existing CO migration 0094 and server-side versioned commands remain unchanged.

## Isolated evidence

Commands (no inherited application credentials):

```
env -i PATH="$PATH" HOME=/tmp NODE_ENV=test node node_modules/vitest/vitest.mjs run --config tests/coverage-gaps.config.ts
env -i PATH="$PATH" HOME=/tmp node --test tests/unit/client-offline-readiness.test.mjs
```

Results: **19/19 focused server tests; 5/5 existing client tests passed.** New cases cover codec admission, invalid timelines/gain, expiry boundary and expired download denial before storage access, preserved dirty conflicts, rejected no-op imports, owned snapshot bytes and corruption. Existing tests cover owner denials, real analytics artifacts, commit cancellation fencing and one actual short WAV encoding. Database/PDIM/pocket calls are fixtures only; no live persistence or network was accessed. The native fixture is 0.1-second generated test PCM; no destructive native jobs. Scoped diff whitespace and parser checks passed.

These tests do **not** establish native abort timing, all codec decodability or stem ZIP alignment by independent decode. Client tests are algorithm/source/parser checks, not mounted-browser acceptance. No application startup, screenshot, live DB/storage/provider operation, package installation or migration occurred.

## Remaining blocking requirements

1. Approved retention/expiry policy, artifact TTL creation, durable cleanup scheduling and orphan reclamation (including interrupted offline cache acquisitions). Expiry enforcement alone is not lifecycle completion.
2. Migration/activation safety, real PDIM persistence/restart, two-user HTTP acceptance and multi-replica coordination. Pocket index serialization is process-local, not CAS; cross-process edits/cache refresh still require an authoritative versioned transaction boundary. Failed acquisitions can leave unreferenced pocket blobs, and quota accounting is per-project rather than a transactional account reservation.
3. Real offline import/edit/conflict resolution through existing versioned commands, including base-version checking, safe merge choices and actual browser consuming the bundle. Dirty edits are preserved/rejected, not automatically merged or uploaded. Legacy disk audio needs owner-verifiable migration; it is not fetched or deleted on trust.
4. Offline connectivity/capability advertisement and automatic/background cache settings remain broader legacy gaps; this pass does not turn them into a real connectivity-driven synchronization engine.
5. DSP/instrument/MIDI/warped/comped rendering, active plugin chains, dither, custom naming, unbundled delivery, PDF/XLSX/charts, royalty/contract/backup/invoice/tax families, batch bundles, email and shared links remain unimplemented. Rejection is not completion.
6. All-codec independent decoding, multi-stem duration/alignment verification, native cancellation/load/resource limits and artifact cleanup fault acceptance remain necessary. Archive cancellation is publication-fenced but not an immediate abort of ZIP compression.
7. CO native IndexedDB/Web Locks, cold/offline authentication, old-tab rollout, chunk retention, legacy recovery, quota/eviction, multi-account browser/device and accessibility journeys remain gates described in the original reports. No shared authentication or account-boundary behavior was weakened.

## Bounded integration follow-up: beta runner and snapshot import contract

### Beta integration implemented (full cycle deliberately not run)

`scripts/readiness-beta-simulation.mjs` now schedules these discovered, existing closure suites in addition to all previous commands:

- `server/services/accountErasureWorkflow.test.ts` via Node + tsx (privacy).
- `tests/closure-integrations.cjs` and `tests/closure-integrations-shared.cjs` via Node test runner (integrations).
- `tests/runtime-artifact-gates.test.mjs` and `tests/nested-reconciliation.test.mjs` (deploy).
- `server/services/backup/__tests__/postgresTools.test.ts` via a temporary isolated Vitest configuration with no application setup files (data).
- `tests/readiness-beta-history.test.mjs` (deploy), verifying report preservation and closure-suite inventory.

Before its first progress save, the runner copies any previous `beta-simulation.json`/`.md` pair into a timestamp-and-UUID directory under `beta-simulation-history/`, with exclusive copies and SHA-256 evidence in the new report. Failure to preserve prior evidence prevents replacement. Stable report filenames explicitly mean **latest started cycle**, not latest passing/completed cycle; a missing `finishedAt` means incomplete. Previous historical output remains intact. Existing report files were **not** replaced by this change; the main agent owns the next single completed integration cycle.

Only `env -i PATH="$PATH" HOME=/tmp node --test tests/readiness-beta-history.test.mjs` was executed for this follow-up: **2/2 passed** using temporary report fixtures. `node --check scripts/readiness-beta-simulation.mjs` and scoped diff checks passed. No beta/full-suite rerun.

### Snapshot import: exact unresolved contract, not a fabricated round trip

Re-inspected `server/services/offlineModeService.ts`, `server/routes/sync.ts`, the project/track/clip schema and direct studio clip-writing routes. A safe full snapshot import contract is **not currently defined**:

- The new download envelope's `version: 1` identifies its serialization shape, not a server revision or mutation capability. Its project, track and clip reads are separate queries, not a consistent database snapshot. It contains `mixBuses: []` without exporting actual bus state and omits plugin/MIDI/automation/comp relationships. Treating absence as deletion would destroy unexported work.
- Existing `/api/sync` `project.update` checks `expectedUpdatedAt` under an owner-filtered row lock, but applies an allowlist of **project fields only**. It is not a track/clip/audio restore command. `audioClips` has no revision/updated-at column; direct clip creation/update paths do not consistently advance the parent project revision. Reusing only the parent timestamp would therefore permit stale snapshot overwrites.
- The downloadable audio array records `audio-${clip.id}`, track identity, digest and base64 bytes; it does not define an import grant, canonical storage relinking receipt or how reference IDs are remapped. Ownership cannot come from uploaded project JSON. No mounted client `/api/offline/import` consumer or snapshot conflict-choice contract was found.

**Required decision before implementing an actual import:** define whether import creates an independent new owned project or updates an existing one; define replace versus overlay semantics for explicitly present collections and preservation of omitted collections; define an authoritative snapshot revision/digest checked against all relevant writers (not just `projects.updatedAt`); specify permitted fields/relationships and ID remapping plus owner-authorized audio materialization; specify conflict/retry/idempotency behavior and which persisted records a reload must verify. An import-as-new decision is non-destructive but still requires an explicit definition of which musical content constitutes a complete imported project.

No destructive merge defaults, metadata-only “full import,” local ID acknowledgement or fabricated reload were added. Import remains HTTP 422 with no mutation; original functional import remains open. This decision does not remove the missing feature from scope. No shared-file integration patch is required for the beta changes; a future canonical snapshot-write contract will require coordination with the shared sync/schema owners.