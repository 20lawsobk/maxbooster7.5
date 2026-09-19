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
- Updated existing-account credentials now pass normal browser and HTTP login (HTTP 200). Authenticated application API checks also pass: text returns four words, website returns Example Domain, private-network website targets return 400, and Studio preferences return 200. No credentials, hashes, cookies, or tokens were printed, and no bypass or password reset was used.
- Browser checks reached the actual Social Media analyzer, the empty marketplace cart, and Settings → Preferences. The real Settings preferences request is `/api/auth/preferences`, not `/api/user/preferences`. Its GET returned 200 and the BPM field rendered 120; full saved-value comparison was not completed.
- A subsequent workspace-driven Chromium pass verified mounted analysis-result rendering, cart add/reload/remove with exact original-state restoration, and Settings preference values matching the server before and after reload. See `authenticated-flow-verification.md`. Earlier automation timeouts were harness problems, not established application defects.
- `UICustomizer` is not mounted by the production UI. Its earlier hydration repair therefore does not establish that the live Studio interface supports those customization controls.
- During verification the app shut down after an uncaught timeout. Investigation identified an independently reproduced matching failure mechanism: a Web response body converted to a Node stream and piped without source-error handling could crash after headers had already arrived. Both MaxCore proxy paths and the social-video path now await the entire pipeline, cancel upstream on disconnect, and terminate partial responses on failure. All 18 focused proxy tests and the full server type check pass after the repair. This fixes the demonstrated mechanism; the original stack alone cannot conclusively attribute the historical shutdown to a specific request.
- The three previously incomplete authenticated flows now pass. This does not verify every role, every dynamic request, or unmounted Studio customization controls.
- No real payments, payouts, publishing, or third-party distribution operations were executed. Their production outcomes remain unverified.
- Missing genuine prediction/planning capabilities still fail explicitly; neither type-check success nor native analysis creates those models.

## Repeatable checks

- `tsc -p tsconfig.client.json --pretty false`
- `tsc -p tsconfig.server.json --pretty false`
- `node scripts/audit-endpoints.mjs --static`
- `tsx scripts/verify-native-analysis.ts` (local MaxCore only; ephemeral synthetic input fixtures)

Run unit tests with isolated test credentials and endpoints. The application database is shared with production; inherited development credentials are not test isolation.