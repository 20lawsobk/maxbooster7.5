# 79. /epk/:slug — PublicPressKit

Generated; edit the generator or source business-section supplements and regenerate. Inventory inclusion is not test passage.

Declaration `page-cbeaedba40fda3f6`; source `client/src/pages/PublicPressKit.tsx:1`; registration `{"file":"client/src/App.tsx","line":292}`; status **UNVERIFIED**.

## Page acceptance

| Check | Status | Exact acceptance |
| --- | --- | --- |
| page-cbeaedba40fda3f6/page-states | UNVERIFIED | Exercise this page's actual loading, empty, error/retry and successful states, including navigation and reload. |
| page-cbeaedba40fda3f6/page-access | UNVERIFIED | Verify the page's declared public/authenticated/admin access policy and cross-user resource boundary. |
| page-cbeaedba40fda3f6/page-persistence | UNVERIFIED | Submit applicable page actions, verify the corresponding backend result, and reload to confirm durable state; verify failed writes do not show success. |

Implement each exact check, then map current passing case identities and source hashes. Keep missing prerequisites and external delivery explicitly unverified.

## All business sections

| Page work/provenance field | Required detail |
| --- | --- |
| ordinal | 79 |
| id | page-cbeaedba40fda3f6 |
| path | /epk/:slug |
| component | PublicPressKit |
| source | {"file":"client/src/pages/PublicPressKit.tsx","line":1} |
| status | UNVERIFIED |
| aliasSpecificWork | [] |
| knownFrontendContracts | [{"backendRouteIds":["api-1fc2b38475960cb3"],"id":"call-f012386ddcc9167f","method":"GET","methodConfidence":"assumed","path":"/api/press-kit/public/:param","source":{"file":"client/src/pages/PublicPressKit.tsx","line":18},"topologyStatus":"matched"}] |
| knownBackendRoutes | [{"id":"api-1fc2b38475960cb3","method":"GET","mountResolved":true,"path":"/api/press-kit/public/:slug","processScope":"main-app","source":{"file":"server/routes/pressKit.ts","line":316}}] |
| coverageOfSource | {"existingEvidenceScope":["reports/test-verification/integration-browser/page80/page80.json and reports/test-verification/integration-browser/browser-page80-summary.json contain scoped render/journey observations. Inspect per-page auth and receipt scope before linking any named business-section acceptance."],"inspectedFiles":[{"apiExpressions":["/api/press-kit/public","/api/press-kit/public/${slug}"],"declaredLinks":["https://maxbooster.replit.app"],"eventHandlers":[],"fieldAttributes":[],"file":"client/src/pages/PublicPressKit.tsx","headingTabDialogAndFieldLabels":[{"kind":"h1","line":41,"name":"Press Kit Not Found","tabValue":null},{"kind":"h1","line":82,"name":"{pressKit.artistName &#124;&#124; \"Artist\"}","tabValue":null},{"kind":"h2","line":172,"name":"Biography","tabValue":null},{"kind":"h2","line":181,"name":"Press Photos","tabValue":null},{"kind":"h3","line":217,"name":"Contact &amp; Booking","tabValue":null},{"kind":"h3","line":269,"name":"Performance Requirements","tabValue":null}],"inspectedRange":{"end":314,"start":1},"sha256":"cd6f575eaeedfee3899cebd16fd5aa770c2fc005d7eda6a0eae1997b11549660","staticDataTitles":[]}],"knownLimits":["No case execution, current coverage increase, provider delivery or production-readiness claim is made by this plan."],"meaning":"Source inspection inventory only. Business behavior remains UNVERIFIED; all register controls/contracts are retained for root task joining, not marked complete.","registeredPageBackendRouteIds":["api-1fc2b38475960cb3"],"registeredPageFrontendContractIds":["call-f012386ddcc9167f"],"registeredPageInteractionIds":["ui-0e3341069399dd26","ui-13d41bbb7d8d89d0","ui-2e4faa02c648d622","ui-4f9fc3e1270b8e4e","ui-932cc035ec9f4d8b","ui-9bfa880fa301bb0c","ui-a2dc12644b7b8c48","ui-c10e787bbe102a7e","ui-c1cdfd95403d7028","ui-fb562ad36d2ff4bd"],"sourceLocalInteractionIds":["ui-0e3341069399dd26","ui-13d41bbb7d8d89d0","ui-2e4faa02c648d622","ui-4f9fc3e1270b8e4e","ui-932cc035ec9f4d8b","ui-9bfa880fa301bb0c","ui-a2dc12644b7b8c48","ui-c10e787bbe102a7e","ui-c1cdfd95403d7028","ui-fb562ad36d2ff4bd"],"unresolvedMappingWork":["Resolve every source API expression not represented by a matching current frontend contract and mounted backend route; distinguish private imported-service processes from main-server routes.","Map each dynamic heading, repeated row, source-local control and shared component to its named business section; retain a concrete task for unknown associations."]} |
| analysisSourceFreshness | {"checkedFiles":1,"meaning":"Source-analysis freshness only; not behavioral execution evidence.","staleSourceFiles":[],"status":"SOURCE_HASHES_MATCH","unavailableSourceFiles":[]} |

### Public slug, artist header and link rendering

| Work field | Required detail |
| --- | --- |
| id | page-cbeaedba40fda3f6/business-section-1 |
| status | UNVERIFIED |
| sourceFiles | ["client/src/pages/PublicPressKit.tsx"] |
| sourceSectionCandidates | [{"file":"client/src/pages/PublicPressKit.tsx","kind":"h1","line":82,"name":"{pressKit.artistName &#124;&#124; \"Artist\"}","tabValue":null}] |
| frontendWork | ["Resolve only published EPK by slug, distinguish unknown/error/loading, render artist identity/genres/links and deny draft/private data.","Exercise every source-linked field/control in this section, including emitted handlers and dynamic rows; resolve ambiguous section ownership before adding acceptance evidence."] |
| backendWork | ["Trace the actual API expressions listed in coverageOfSource to mounted handlers, middleware, schema and service; verify method/path, role/owner checks, durable state and error contracts.","Use knownFrontendContracts and knownBackendRoutes below; any absent/dynamic route mapping remains an explicit mapping task, never a presumed implemented endpoint."] |
| validationPermissionsSecurity | ["Published-only read with safeURLs/escapedtext; private/draftuploads andcontact fields outside publicschema must remain inaccessible."] |
| durableProviderGenerationJourneys | ["Verify publicslug resolves exact saved published snapshot and accessible media; publication must survive reload and owneredit."] |
| failureAccessibilityMobileI18nPerformance | ["Test absent/hidden/malformedslug, missingphotos/optionalcontact, alttext/mailto, longriders/mobile and boundedimage loading."] |
| evidenceNeeded | ["Current-source component/browser case IDs for this named section with successful and adverse outcomes, keyboard/touch observations and exact state/payload assertions.","For declared mutations, retain owner/foreign-owner/anonymous HTTP cases plus persisted second-request/worker reads and side-effect receipts; for static/navigation sections retain destination/content assertions.","Source-mapped execution counters for the actual section functions/branches and links to required deployment/provider evidence; a source scan or page shell render never closes this work."] |
| interactionIds | [] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| mappingStatus | UNVERIFIED_SECTION_ASSIGNMENT: page-level complete ID inventories are retained below; map exact controls/contracts to this section before closing work. |

### Biography and Press Photos

| Work field | Required detail |
| --- | --- |
| id | page-cbeaedba40fda3f6/business-section-2 |
| status | UNVERIFIED |
| sourceFiles | ["client/src/pages/PublicPressKit.tsx"] |
| sourceSectionCandidates | [{"file":"client/src/pages/PublicPressKit.tsx","kind":"h1","line":41,"name":"Press Kit Not Found","tabValue":null},{"file":"client/src/pages/PublicPressKit.tsx","kind":"h1","line":82,"name":"{pressKit.artistName &#124;&#124; \"Artist\"}","tabValue":null},{"file":"client/src/pages/PublicPressKit.tsx","kind":"h2","line":172,"name":"Biography","tabValue":null},{"file":"client/src/pages/PublicPressKit.tsx","kind":"h2","line":181,"name":"Press Photos","tabValue":null}] |
| frontendWork | ["Render biography and complete photo gallery with safe escaping, alt text and accessible external/download links; verify public bytes and missing-media behavior.","Exercise every source-linked field/control in this section, including emitted handlers and dynamic rows; resolve ambiguous section ownership before adding acceptance evidence."] |
| backendWork | ["Trace the actual API expressions listed in coverageOfSource to mounted handlers, middleware, schema and service; verify method/path, role/owner checks, durable state and error contracts.","Use knownFrontendContracts and knownBackendRoutes below; any absent/dynamic route mapping remains an explicit mapping task, never a presumed implemented endpoint."] |
| validationPermissionsSecurity | ["Published-only read with safeURLs/escapedtext; private/draftuploads andcontact fields outside publicschema must remain inaccessible."] |
| durableProviderGenerationJourneys | ["Verify publicslug resolves exact saved published snapshot and accessible media; publication must survive reload and owneredit."] |
| failureAccessibilityMobileI18nPerformance | ["Test absent/hidden/malformedslug, missingphotos/optionalcontact, alttext/mailto, longriders/mobile and boundedimage loading."] |
| evidenceNeeded | ["Current-source component/browser case IDs for this named section with successful and adverse outcomes, keyboard/touch observations and exact state/payload assertions.","For declared mutations, retain owner/foreign-owner/anonymous HTTP cases plus persisted second-request/worker reads and side-effect receipts; for static/navigation sections retain destination/content assertions.","Source-mapped execution counters for the actual section functions/branches and links to required deployment/provider evidence; a source scan or page shell render never closes this work."] |
| interactionIds | [] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| mappingStatus | UNVERIFIED_SECTION_ASSIGNMENT: page-level complete ID inventories are retained below; map exact controls/contracts to this section before closing work. |

### Contact, Booking and Performance Requirements

| Work field | Required detail |
| --- | --- |
| id | page-cbeaedba40fda3f6/business-section-3 |
| status | UNVERIFIED |
| sourceFiles | ["client/src/pages/PublicPressKit.tsx"] |
| sourceSectionCandidates | [{"file":"client/src/pages/PublicPressKit.tsx","kind":"h3","line":217,"name":"Contact &amp; Booking","tabValue":null},{"file":"client/src/pages/PublicPressKit.tsx","kind":"h3","line":269,"name":"Performance Requirements","tabValue":null}] |
| frontendWork | ["Verify email/website/social/streaming destinations and technical/hospitality rider presentation match saved published fields, with long text/mobile layouts.","Exercise every source-linked field/control in this section, including emitted handlers and dynamic rows; resolve ambiguous section ownership before adding acceptance evidence."] |
| backendWork | ["Trace the actual API expressions listed in coverageOfSource to mounted handlers, middleware, schema and service; verify method/path, role/owner checks, durable state and error contracts.","Use knownFrontendContracts and knownBackendRoutes below; any absent/dynamic route mapping remains an explicit mapping task, never a presumed implemented endpoint."] |
| validationPermissionsSecurity | ["Published-only read with safeURLs/escapedtext; private/draftuploads andcontact fields outside publicschema must remain inaccessible."] |
| durableProviderGenerationJourneys | ["Verify publicslug resolves exact saved published snapshot and accessible media; publication must survive reload and owneredit."] |
| failureAccessibilityMobileI18nPerformance | ["Test absent/hidden/malformedslug, missingphotos/optionalcontact, alttext/mailto, longriders/mobile and boundedimage loading."] |
| evidenceNeeded | ["Current-source component/browser case IDs for this named section with successful and adverse outcomes, keyboard/touch observations and exact state/payload assertions.","For declared mutations, retain owner/foreign-owner/anonymous HTTP cases plus persisted second-request/worker reads and side-effect receipts; for static/navigation sections retain destination/content assertions.","Source-mapped execution counters for the actual section functions/branches and links to required deployment/provider evidence; a source scan or page shell render never closes this work."] |
| interactionIds | [] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| mappingStatus | UNVERIFIED_SECTION_ASSIGNMENT: page-level complete ID inventories are retained below; map exact controls/contracts to this section before closing work. |

## Every control

| ID | Source | Tag/labels | Handlers | Status | Required checks |
| --- | --- | --- | --- | --- | --- |
| ui-0e3341069399dd26 | client/src/pages/PublicPressKit.tsx:193 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-0e3341069399dd26/control-behavior=UNVERIFIED; ui-0e3341069399dd26/control-failure=UNVERIFIED |
| ui-13d41bbb7d8d89d0 | client/src/pages/PublicPressKit.tsx:239 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-13d41bbb7d8d89d0/control-behavior=UNVERIFIED; ui-13d41bbb7d8d89d0/control-failure=UNVERIFIED |
| ui-2e4faa02c648d622 | client/src/pages/PublicPressKit.tsx:108 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-2e4faa02c648d622/control-behavior=UNVERIFIED; ui-2e4faa02c648d622/control-failure=UNVERIFIED |
| ui-4f9fc3e1270b8e4e | client/src/pages/PublicPressKit.tsx:128 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-4f9fc3e1270b8e4e/control-behavior=UNVERIFIED; ui-4f9fc3e1270b8e4e/control-failure=UNVERIFIED |
| ui-932cc035ec9f4d8b | client/src/pages/PublicPressKit.tsx:224 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-932cc035ec9f4d8b/control-behavior=UNVERIFIED; ui-932cc035ec9f4d8b/control-failure=UNVERIFIED |
| ui-9bfa880fa301bb0c | client/src/pages/PublicPressKit.tsx:138 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-9bfa880fa301bb0c/control-behavior=UNVERIFIED; ui-9bfa880fa301bb0c/control-failure=UNVERIFIED |
| ui-a2dc12644b7b8c48 | client/src/pages/PublicPressKit.tsx:300 | {"labels":{"href":"https://maxbooster.replit.app"},"tag":"a"} | [] | UNVERIFIED | ui-a2dc12644b7b8c48/control-behavior=UNVERIFIED; ui-a2dc12644b7b8c48/control-failure=UNVERIFIED |
| ui-c10e787bbe102a7e | client/src/pages/PublicPressKit.tsx:148 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-c10e787bbe102a7e/control-behavior=UNVERIFIED; ui-c10e787bbe102a7e/control-failure=UNVERIFIED |
| ui-c1cdfd95403d7028 | client/src/pages/PublicPressKit.tsx:254 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-c1cdfd95403d7028/control-behavior=UNVERIFIED; ui-c1cdfd95403d7028/control-failure=UNVERIFIED |
| ui-fb562ad36d2ff4bd | client/src/pages/PublicPressKit.tsx:118 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-fb562ad36d2ff4bd/control-behavior=UNVERIFIED; ui-fb562ad36d2ff4bd/control-failure=UNVERIFIED |

For every control execute its control-behavior and control-failure acceptance from the global required-check ledger; cover keyboard/mobile, input validation, loading/error/retry, authorization and the real side effect.

## Every frontend API contract

| ID | Method/path | Source | Topology | Backend IDs | Behavior acceptance |
| --- | --- | --- | --- | --- | --- |
| call-f012386ddcc9167f | GET /api/press-kit/public/:param | client/src/pages/PublicPressKit.tsx:18 | matched | ["api-1fc2b38475960cb3"] | UNVERIFIED |

Trace each request to its actual process/mount, assert exact response/error/permission behavior and prove persistence after reload or another worker.

## Every mapped backend registration

| ID | Method/path | Source | Process/mount | Status | Required checks |
| --- | --- | --- | --- | --- | --- |
| api-1fc2b38475960cb3 | GET /api/press-kit/public/:slug | server/routes/pressKit.ts:316 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-1fc2b38475960cb3/response-contract=UNVERIFIED; api-1fc2b38475960cb3/access-policy=UNVERIFIED; api-1fc2b38475960cb3/input-boundaries=UNVERIFIED; api-1fc2b38475960cb3/tenant-boundary=UNVERIFIED; api-1fc2b38475960cb3/dependency-failure=UNVERIFIED |

Exercise successful/adverse HTTP contracts, cross-owner denial, input boundaries, dependency failure, durable mutation/deletion and callback/artifact/readiness checks exactly as assigned. Standalone or unresolved processes need their own harness.

## Exact source reachability and test instructions

```json
{
  "reachableSourceFiles": [
    "client/src/components/ui/badge.tsx",
    "client/src/components/ui/separator.tsx",
    "client/src/lib/utils.ts",
    "client/src/pages/PublicPressKit.tsx"
  ],
  "addTest": {
    "suggestedPath": "tests/browser/epk-slug-acceptance.test.mjs",
    "command": "node --import tsx --test tests/browser/epk-slug-acceptance.test.mjs",
    "cwd": ".",
    "instructions": "Implement the named behavioral assertions using disposable fixtures, then map exact passing case identities in the acceptance map; source associations alone never close a check.",
    "fixtureTemplate": "browser-page"
  },
  "testCandidates": []
}
```

The complete machine ledger retains original evidence/details and global controls, unmapped routes, source coverage and non-JS/desktop/native lanes. See [platform index](../platform-completion-plan.md).
