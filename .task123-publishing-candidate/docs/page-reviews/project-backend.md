# Project direct-mutation backend follow-up

## Scope and inspected contracts

Edits are limited to `server/routes/studio.ts`, the project-delete handler and required imports in `server/routes/sync.ts`, the new `server/services/projectOwnedDeletionCleanup.ts` helper, `tests/unit/project-backend-*.test.ts`, this review, and assigned frontend files: `client/src/pages/Projects.tsx`, `client/src/components/studio/StudioStartHub.tsx`, `client/src/components/studio/FlowStateProjectSelector.tsx`, `client/src/components/studio/ProjectSettingsDialog.tsx`, and `client/src/hooks/useStudioController.ts`. Existing dashboard-projects stream changes were preserved. No shared storage/database/schema/auth files were changed.

Read-only inspection covered:

- `client/src/pages/Projects.tsx` and `docs/page-reviews/dashboard-projects.md`: queued project edits/deletes already carry `expectedUpdatedAt`; the page's direct PATCH/DELETE fallbacks did not.
- `shared/schema.ts`: `projects` and `studioProjects` are distinct tables. These direct endpoints list/read/write `projects`. Its nullable `updatedAt` is the concurrency token; it has no `version` column. The inspected DAW child columns do not declare project/track/clip foreign-key cascades.
- `server/routes/sync.ts`: queued canonical-project updates/deletes select the owned `projects` row `FOR UPDATE` and compare its serialized timestamp. Updates use a database-clock, monotonic millisecond timestamp. Queued deletion currently cleans only tracks, royalty splits, and the canonical project.
- `server/db.ts` and the installed Drizzle implementations: the exported database uses Neon serverless or node-postgres. Both installed session implementations support callback transactions on one acquired connection, execute BEGIN/COMMIT, and execute ROLLBACK on a thrown callback error; PostgreSQL select builders support `.for("update")`. These were source inspections, not live-driver tests.

## Changed direct-route behavior

The endpoints remain PATCH and DELETE `/api/studio/projects/:projectId`.

| Request/result | Contract |
| --- | --- |
| Expected version | Top-level JSON `expectedUpdatedAt`: UTC datetime string matching the loaded project's serialized timestamp, or explicit `null` only for a row whose stored timestamp is null. |
| Missing expected version | HTTP 428 with an explicit refresh/version-required error; no transaction or writes. An old client's omitted field never disables checking. Legacy numeric `version` is not an alternative concurrency token. |
| Malformed timestamp / PATCH fields | HTTP 400 with validation issues. |
| Missing or differently owned canonical row | HTTP 404 with only `Project not found`. Owning a same-ID `studioProjects` row cannot authorize canonical-project mutations or child cleanup. DELETE formerly returned 403 for its failed broad ownership check. |
| Stale expected version | HTTP 409, `{ conflict: true, error, data: currentOwnedProject }`, before any mutation. |
| Successful PATCH | The updated project row, as before. Only schema-allowlisted fields are persisted; transport timestamp, legacy numeric `version`, and `tempo` are not DB columns. `bpm` takes precedence if supplied alongside the `tempo` alias. Timestamp advancement matches queued updates. |
| Successful DELETE | `{ success: true, message: "Project deleted" }`, as before. |
| Database / cleanup failure | HTTP 500 after callback rollback; no success response is sent before commit. A missing final mutation result also throws instead of committing child removal or returning an empty success. |

Each route verifies the owned canonical row with `SELECT ... FOR UPDATE` inside its transaction. Final update/delete predicates include both project ID and authenticated user ID.

DELETE removes the following in that same transaction, leaf-first: MIDI notes belonging to the project's MIDI clips; warp markers belonging to its audio clips; take segments/lanes belonging to its take groups; comp versions; take groups; MIDI/audio clips; timeline markers; plugin instances; stem-export rows; recent-file references; tracks; royalty splits; then the owned project. Subqueries scope clip/take leaf cleanup to the selected project; unrelated project data is retained. No object-store files or external jobs are deleted or cancelled.

## Frontend contract implementation and caller audit

The four assigned frontend files now send versioned direct mutations:

1. `Projects.tsx` direct PATCH fallback sends `{ ...data, expectedUpdatedAt }` from its edit-start snapshot; DELETE fallback sends JSON `{ expectedUpdatedAt }` from the selected row. The same captured version is used by the existing offline queue. Queue action types, manual-conflict behavior, account identity assertions, receipt handling, and acknowledged-version draft cleanup remain intact.
2. Project drafts now persist their original expected timestamp with their fields and restore that original timestamp, never the newly listed project's timestamp. Older drafts without a saved version retain their form fields but cannot be submitted automatically; the error instructs the user to keep a copy and review current data before starting a new edit. Missing versions are not synthesized as null.
3. `StudioStartHub.tsx` and `FlowStateProjectSelector.tsx` delete mutations receive the selected project snapshot rather than an ID to resolve against a potentially newer list. The selector's confirmation closure retains that snapshot. Both send its expected timestamp and show specific 409 review guidance.
4. `ProjectSettingsDialog.tsx` receives a reduced local model from its DAW parent, which has no canonical timestamp. It therefore loads canonical fields **and their version once at dialog open** for persisted projects. Fields/save stay disabled until that edit-start read succeeds; failure is explicit. Late reads after close/project switch are ignored. Ordinary DAW rerenders cannot reset an open form or rebase its version. PATCH uses only that captured snapshot; submission and 409 handling do not fetch a fresh version. A 409 keeps the unsaved form open and displays review guidance. New, not-yet-persisted projects retain their existing local-only settings path.
5. Successful mutations retain their cache invalidations. Failed PATCH does not invoke success/close/local-update handling; failed DELETE does not report deletion. No authenticated UI verification was performed by this workstream.

An AST-assisted read-only scan of all `client/src` TS/TSX/JS/JSX source identified six direct PATCH/DELETE callsites for this exact endpoint. The subsequently assigned sixth caller, `client/src/hooks/useStudioController.ts`'s `setTempo`, is now versioned too. The hook hydrates canonical tempo and timestamp together once on project selection because its transport store has no canonical project-version field. It does not load a replacement version on submission, conflict, or ordinary rerender. Missing/wrong-project snapshots and overlapping tempo saves fail explicitly before local mutation. A successful save advances the base only from that write's returned timestamp. Conflict/ambiguous failure retains the unsaved local tempo, blocks subsequent persistence pending explicit review/reopen, and reports via `onError` or a destructive toast when no callback exists. Late hydration/save responses cannot update another project's snapshot. `client/src/lib/studioStore.ts` was inspected, not edited; no additional type/hydration file changes were needed. The source search found no invocation of this exported controller hook, so runtime UI reachability is not established by these tests.

GET callers in `useProjectSync.ts` and subresource mutations (`/opened`, `/favorite`, MIDI/comping/stem routes, etc.) are different contracts and were not modified. Unversioned older clients safely fail with 428.

## Queued-delete cleanup parity — implementation and remaining evidence

The queued handler previously deleted only tracks, splits, and the canonical project. Direct and queued DELETE now call the same imported production implementation, `deleteLockedOwnedProject`, in `server/services/projectOwnedDeletionCleanup.ts`, after their existing canonical owned-row lock/version checks. This helper performs exactly the documented direct-route cleanup above and requires the final ID/user-constrained deletion to return a row. It does not open/commit a separate transaction.

Consequently queued deletion now also removes MIDI notes, warp markers, take segments/lanes, comp versions, take groups, MIDI/audio clips, timeline markers, plugin instances, stem-export rows, and recent-file references. Notes/warp markers/take segments/take lanes use the same project-scoped parent subqueries before parents disappear. No additional business/history/file retention scope was added.

`server/repositories/clientSyncReceipts.ts` remains unedited: it executes the handler and receipt insert in one callback transaction. Tests execute its actual factory/fingerprinting code and the actual queued handler with the real imported cleanup helper and real Drizzle predicates/subqueries. They check direct/queued cleanup parity, receipt replay without rerunning deletion, wrong-owner/stale rejection, and rollback on late child/final-delete/receipt-insert failure. Existing successful historical receipts intentionally replay without rerunning cleanup; this change does not backfill orphan rows left by earlier deletions.

## Exact verification performed

- Command: `node_modules/.bin/vitest run --config vitest.config.ts tests/unit/project-backend-mutations.test.ts`
- Result: **19 tests passed; 1 test file passed**. The existing Vitest `poolOptions` deprecation warning was emitted.
- Follow-up command: `node_modules/.bin/vitest run --config vitest.config.ts tests/unit/project-backend-mutations.test.ts tests/unit/project-backend-client-contracts.test.ts tests/unit/dashboard-projects-page-regressions.test.ts tests/unit/royalty-and-project-settings.test.ts`
- Follow-up result: **53 tests passed; 4 test files passed**: 19 backend mutation cases, 19 client version-contract cases, 13 existing dashboard-projects cases, and 2 existing royalty/settings cases. An initial client-test run exposed an extractor-name collision with the Projects page's nested songwriting `deleteMutation`; the test extractor was corrected to select the first matching declaration, then the full focused command passed.
- Client regressions execute actual mutation/effect/error callbacks with isolated dependencies: versioned direct fallbacks; unchanged queued conflict behavior; draft base-version persistence/recovery; selected delete snapshots; explicit missing/null semantics; conflict messages and retained forms; one-time settings opening snapshot; and late-read cancellation. All four assigned frontend files are transpiled for syntax. These are not rendered browser/E2E tests.
- Latest completed focused command: `node_modules/.bin/vitest run --config vitest.config.ts tests/unit/project-backend-mutations.test.ts tests/unit/project-backend-client-contracts.test.ts tests/unit/dashboard-projects-page-regressions.test.ts tests/unit/royalty-and-project-settings.test.ts --reporter=dot` — **70 passed, 4 files** (26 backend/queued cases, 29 client cases, 13 prior page cases, 2 settings/royalty cases). This included production-helper parity and controller hydration/conflict/overlap/late-response tests. An earlier backend-only attempt timed out under resource contention; a later backend-only run completed with 26 passing tests.
- After that passing run, two additional focused tests were added (receipt operation-ID/payload mismatch and explicit-null controller version), and newly unused royalty-split imports were removed. **Those final changes have not been rerun.** The coordinator reported another workspace OOM/preview failure and requested that all further checks stop. No additional checks or preview restart were attempted after that instruction. Final serialized verification remains coordinator-owned.
- The suite transpiles the actual route file for syntax and extracts/executes the actual two route callbacks plus their actual Zod schemas without importing the router, server database module, or app startup. It imports the real shared schema and checks columns used by the transaction double. Coverage includes omitted/malformed versions, stale versions, explicit-null semantics, wrong ownership including a cross-table ID collision, missing rows, allowlisted PATCH fields and tempo/bpm behavior, lock-before-write and commit-before-response ordering, reused versions after an update, project-scoped leaf cleanup, and final ID/user predicates.
- Failure injection at royalty-split deletion, final project deletion, and an unexpectedly empty final delete result verifies that route exceptions reach rollback and preserve the transaction double's original state after earlier child removals.
- The actual monotonic timestamp SQL expression is compiled using Drizzle's PostgreSQL dialect and checked for database-clock/millisecond advancement.
- Scoped `git diff --check` was run for the route, both project-backend test files, the four assigned frontend files, and this review.

## Remaining evidence and boundaries

The transaction double models rollback and records calls; it does **not** prove real PostgreSQL locking, deployed schema parity, rollback, SQL execution, isolation, or concurrent request scheduling. No real database writes, API mutations, full build/typecheck, app run/restart, secret inspection, external actions, or deployment were performed.

Before making readiness claims, use an approved isolated database to verify both configured driver paths, actual deployed tables/columns, two simultaneous same-version requests (including direct-vs-queued operations), stale PATCH/DELETE responses, wrong-owner/cross-table collisions, and an injected mid-cleanup failure retaining all original rows. Verify refreshed timestamps round-trip through PostgreSQL/JSON with submillisecond storage precision and nullable legacy rows. Exercise signed-in E2E draft recovery, unavailable-local-storage fallbacks, conflict review, all additional callers above, and success/error UI behavior.

Other writers must participate in the same parent-row locking/version protocol to prevent concurrent child creation or unrelated project writes from defeating version guarantees. The declared child tables have no foreign keys to make parent locking alone prevent noncooperating inserts. This change does not retrofit every child writer, active export worker, or favorite/opened/DAW-state route. The broader lifecycle of workspace catalogs, budgets, collaboration records, revenue history, and external files was not redefined as a destructive cascade. Confirm their ownership/retention semantics separately rather than assuming every `projectId` names this canonical table.
