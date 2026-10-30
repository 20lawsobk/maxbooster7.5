# Distribution page review

Scope: first bounded page/backend review; not a full-page or whole-platform certification. No application changes or external actions performed.

**FAIL — this bounded Distribution vertical slice has a submission blocker and an account-level earnings disclosure; it does not establish whole-page or platform readiness.** Read-only review of current source; no runtime/provider calls or tests were run, and the preview was not touched.

**Confirmed static findings**
- **Primary submission cannot pass UPC validation.** `server/routes/distribution.ts:2183-2190` reads `release.upc`, but the release returned by `server/storage.ts:2536-2542` is a raw `distroReleases` row, whose schema has no `upc` column (`shared/schema.ts:1000-1027`). The upload persists no UPC (`server/routes/distribution.ts:5055-5081`); the code-generation route explicitly does not persist its provisional UPC (`server/routes/distribution.ts:983-1029`). Even an otherwise complete release gets “Missing UPC.” Read and validate an authoritative persisted identifier consistently in both the guard and Too Lost payload (`server/routes/distribution-toolost-submission.ts:192`); test a release with a saved UPC.
- **The page’s visible upload flow cannot produce a submission-ready draft.** Its “Submit Release” button (`client/src/pages/Distribution.tsx:5249-5267`) only POSTs `/upload` (`:2152-2192`), which stores `status: "draft"` (`server/routes/distribution.ts:5055-5065`). This form does not collect/persist the required AI declarations, composer, or Too Lost terms (`client/src/pages/Distribution.tsx:2152-2181`; `server/routes/distribution.ts:4995-5009,5065-5081`); provider submission rejects missing declarations and confirmations (`server/routes/distribution-toolost-submission.ts:146-153`; `server/services/toolost-service.ts:1287-1295`). Rename the button “Save Draft,” provide a review/completion path, and test that a modal-created draft can reach submission without invented defaults.
- **Multi-platform dispatch persistence can lose records.** Submission starts parallel writes (`server/routes/distribution.ts:2293-2297`), while each dispatch loads and rewrites the same JSON array without locking (`server/storage.ts:2711-2756`). Concurrent requests can overwrite one another yet all report success; status tracking then misses destinations. Serialize/atomically append or use per-platform rows; test concurrent writes for several platforms.
- **Release-list failures masquerade as empty catalogs.** `client/src/pages/Distribution.tsx:1538-1543,2563-2598` defaults failed query data to `[]` without checking `isError`, displaying “No Releases Yet” after a 500. Add a retryable error state; test a failed GET versus an actual empty response. The “150+ platforms automatically” copy (`:2588-2590`, `:4064-4068`) is also not supported by this selection-based provider flow; make it conditional on verified catalog/delivery evidence.

**Security — serious:** `server/services/toolostRuntimeConfig.ts:22-30` falls back to an admin-owned Too Lost connection for any user without one. `/earnings/summary` returns that account’s unfiltered lifetime total (`server/routes/distribution.ts:5574-5586`), displayed as Lifetime Sales (`client/src/pages/Distribution.tsx:2279-2295`). This exposes shared distributor earnings to unrelated authenticated users and misattributes them as their own. Do not expose account-level earnings through the fallback; require user-owned credentials or verified per-user accounting. Test two users on the shared connection.

**Next actions:** Fix the earnings boundary first; align UPC and draft/compliance contracts; make dispatch writes atomic and add focused failure/concurrency UI/API tests. The imported `ReleaseWizard` and other child components/secondary panels were **not reviewed**; its callback’s success claim (`client/src/pages/Distribution.tsx:2867-2880`) cannot be verified here. Provider behavior and deployment schema remain runtime-unverified.

## Focused existing tests

Command: node_modules/.bin/vitest run --config vitest.config.ts tests/unit/distribution-provider-contract.test.ts
Result: 4 passed, 0 failed (1.29s). These are source-contract tests; they do not exercise the newly identified tenant/UPC/concurrency defects. Vitest warned that test.poolOptions is deprecated.

## Remaining review coverage

ReleaseWizard and imported child panels require separate inspection. App.tsx contains 79 explicit route declarations, including aliases and parameterized variants; this is an inventory seed, not a complete route graph or proof of reviewed pages. Remaining pages have not been reviewed in this pass.
