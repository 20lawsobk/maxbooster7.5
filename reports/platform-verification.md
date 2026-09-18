# Platform verification — 2026-09-18

## Outcome

The native MaxCore analysis implementation and confirmed integration defects were repaired. This is **not a certification that every platform function is operational**.

## Verified

- Full client and server TypeScript checks pass without suppressing the reported errors.
- Both complete application entry points bundle successfully.
- Selected TypeScript regression suites: 184 tests across 20 files pass.
- Native Python analysis suites: 30 tests pass, including real image/video inputs.
- Ten live checks through MaxCore's Node/Python bridge pass: authentication, trusted actor requirement, text measurements, image measurements, cross-owner denial, private scratch isolation, video measurements, private-network request rejection, live website parsing, and owned audio upload/analysis.
- The running home page renders without fatal browser errors.
- Static inventory: 1,115 frontend call sites, 857 unique statically resolved method/path contracts, all 857 matched. There are 2,344 backend registrations and 15 unresolved dynamic frontend references. See `endpoint-audit.md` and `endpoint-audit.json`.
- The scanner now understands typed Express registrations without losing source offsets or misclassifying their routes as missing.

## Repairs

- Native image, video, text, and website analysis, with authenticated owner-scoped uploads and bounded public-URL fetching.
- Content analysis UI and multimodal consumers use the native contracts; audio uses its existing owned-upload/conductor path.
- User-scoped marketplace cart persistence and current catalog-price reconciliation; explicit follow-status failures.
- Server-backed Studio preference hydration without overwriting unsaved edits.
- Batch/template request and response parsing, validation, and honest progress states.
- Earnings query-envelope typing and dashboard/royalty state contract errors.
- Monitoring reads authoritative MaxCore state rather than retired local model objects. Unknown metrics remain unknown.

## Limits and blockers

- These analyzers measure pixels, sampled frames, lexical features, and HTML structure. They are **not trained semantic object/action/language-understanding models**. No trained recognition checkpoint or held-out recognition benchmark was established.
- Static route matches do not establish payload correctness, authorization, database effects, provider delivery, or component behavior.
- Authenticated browser verification remains blocked after receiving dedicated test credentials. Both the normal browser login and the workspace request returned HTTP 401. A read-only check found no existing account matching the supplied identifier, even after case/whitespace normalization. No credentials or hashes were printed; no bypass, password reset, or account change was used.
- Authenticated cart reload, Studio preference hydration, analysis UI interactions, every role, and every dynamic request have not all been verified end to end.
- No real payments, payouts, publishing, or third-party distribution operations were executed. Their production outcomes remain unverified.
- Missing genuine prediction/planning capabilities still fail explicitly; neither type-check success nor native analysis creates those models.

## Repeatable checks

- `tsc -p tsconfig.client.json --pretty false`
- `tsc -p tsconfig.server.json --pretty false`
- `node scripts/audit-endpoints.mjs --static`
- `tsx scripts/verify-native-analysis.ts` (local MaxCore only; ephemeral synthetic input fixtures)

Run unit tests with isolated test credentials and endpoints. The application database is shared with production; inherited development credentials are not test isolation.