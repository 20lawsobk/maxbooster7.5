# 54. /store/:slug — Storefront

Generated; edit the generator or source business-section supplements and regenerate. Inventory inclusion is not test passage.

Declaration `page-cfdecadd0884ff0b`; source `client/src/pages/Storefront.tsx:1`; registration `{"file":"client/src/App.tsx","line":264}`; status **UNVERIFIED**.

## Page acceptance

| Check | Status | Exact acceptance |
| --- | --- | --- |
| page-cfdecadd0884ff0b/page-states | UNVERIFIED | Exercise this page's actual loading, empty, error/retry and successful states, including navigation and reload. |
| page-cfdecadd0884ff0b/page-access | UNVERIFIED | Verify the page's declared public/authenticated/admin access policy and cross-user resource boundary. |
| page-cfdecadd0884ff0b/page-persistence | UNVERIFIED | Submit applicable page actions, verify the corresponding backend result, and reload to confirm durable state; verify failed writes do not show success. |

Implement each exact check, then map current passing case identities and source hashes. Keep missing prerequisites and external delivery explicitly unverified.

## All business sections

| Page work/provenance field | Required detail |
| --- | --- |
| ordinal | 54 |
| id | page-cfdecadd0884ff0b |
| path | /store/:slug |
| component | Storefront |
| source | {"file":"client/src/pages/Storefront.tsx","line":1} |
| status | UNVERIFIED |
| aliasSpecificWork | ["Run this declaration independently; the same component source does not establish this alias has correct router parameters.","Verify slug extraction, percent-encoding, direct navigation and checkout return preserve this alias and point to the same authorized store."] |
| knownFrontendContracts | [{"backendRouteIds":["api-5e47bf891c0ba2a2","api-6d7d46c4b4b4f7f9","api-b6efedf3839ffe3e","api-bf955ca735abdbc4","api-c68fa99ae38c2258"],"id":"call-237238af3c8fc169","method":"GET","methodConfidence":"assumed","path":"/api/storefront/:param/orders","source":{"file":"client/src/pages/Storefront.tsx","line":316},"topologyStatus":"matched"},{"backendRouteIds":["api-2839f90eff235c21"],"id":"call-2959c9a931fd0dbb","method":"GET","methodConfidence":"assumed","path":"/api/storefront/:param/membership-tiers/public","source":{"file":"client/src/pages/Storefront.tsx","line":330},"topologyStatus":"matched"},{"backendRouteIds":["api-529b9fc911be4252"],"id":"call-c08be66ad199f4f2","method":"POST","methodConfidence":"detected","path":"/api/storefront/:param/checkout/preview","source":{"file":"client/src/pages/Storefront.tsx","line":398},"topologyStatus":"matched"},{"backendRouteIds":["api-6dbe5bdf799266a0","api-87e59b13022236a3"],"id":"call-0a92f0378a419473","method":"POST","methodConfidence":"detected","path":"/api/storefront/:param/like","source":{"file":"client/src/pages/Storefront.tsx","line":407},"topologyStatus":"matched"},{"backendRouteIds":["api-6dbe5bdf799266a0","api-f7792ab535dbfef4"],"id":"call-f1ad50215d96782c","method":"POST","methodConfidence":"detected","path":"/api/storefront/:param/follow","source":{"file":"client/src/pages/Storefront.tsx","line":418},"topologyStatus":"matched"},{"backendRouteIds":["api-6dbe5bdf799266a0","api-f8cbccbe4f57a648"],"id":"call-255cbe0d8e2581a8","method":"POST","methodConfidence":"detected","path":"/api/storefront/:param/rate","source":{"file":"client/src/pages/Storefront.tsx","line":435},"topologyStatus":"matched"},{"backendRouteIds":["api-0d61e9f3cc08a7f2","api-4634d90f26b78a04","api-6dbe5bdf799266a0","api-8760c18cd3e1f99e","api-87e59b13022236a3","api-8c958a30a19c94be","api-f7792ab535dbfef4","api-f8cbccbe4f57a648"],"id":"call-833ba2b8b8e23c0e","method":"POST","methodConfidence":"detected","path":"/api/storefront/subscribe/:param","source":{"file":"client/src/pages/Storefront.tsx","line":488},"topologyStatus":"matched"},{"backendRouteIds":["api-6dbe5bdf799266a0","api-8760c18cd3e1f99e"],"id":"call-defdde4f0de88ca8","method":"POST","methodConfidence":"detected","path":"/api/storefront/:param/checkout","source":{"file":"client/src/pages/Storefront.tsx","line":548},"topologyStatus":"matched"}] |
| knownBackendRoutes | [{"id":"api-0d61e9f3cc08a7f2","method":"POST","mountResolved":true,"path":"/api/storefront/:storefrontId/verify-domain","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":1215}},{"id":"api-1a2231268bd1fc57","method":"POST","mountResolved":true,"path":"/api/auth/register","processScope":"main-app","source":{"file":"server/routes.ts","line":318}},{"id":"api-2839f90eff235c21","method":"GET","mountResolved":true,"path":"/api/storefront/:storefrontId/membership-tiers/public","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":961}},{"id":"api-2bc47d91358c2c72","method":"POST","mountResolved":true,"path":"/api/sync/batch","processScope":"main-app","source":{"file":"server/routes/sync.ts","line":357}},{"id":"api-4634d90f26b78a04","method":"POST","mountResolved":true,"path":"/api/storefront/:storefrontId/bogo-promotions","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":2554}},{"id":"api-529b9fc911be4252","method":"POST","mountResolved":true,"path":"/api/storefront/:id/checkout/preview","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":2750}},{"id":"api-5e47bf891c0ba2a2","method":"GET","mountResolved":true,"path":"/api/storefront/subdomain/:subdomain","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":1071}},{"id":"api-6d7d46c4b4b4f7f9","method":"GET","mountResolved":true,"path":"/api/storefront/:id/orders","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":1955}},{"id":"api-6dbe5bdf799266a0","method":"POST","mountResolved":true,"path":"/api/storefront/subscribe/:tierId","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":769}},{"id":"api-7c8878c0bdcf5f2f","method":"POST","mountResolved":true,"path":"/api/sync/receipts","processScope":"main-app","source":{"file":"server/routes/sync.ts","line":446}},{"id":"api-86e7b60426904482","method":"PUT","mountResolved":true,"path":"/api/auth/preferences","processScope":"main-app","source":{"file":"server/routes.ts","line":909}},{"id":"api-8760c18cd3e1f99e","method":"POST","mountResolved":true,"path":"/api/storefront/:id/checkout","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":1534}},{"id":"api-87e59b13022236a3","method":"POST","mountResolved":true,"path":"/api/storefront/:id/like","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":1417}},{"id":"api-8c958a30a19c94be","method":"POST","mountResolved":true,"path":"/api/storefront/:storefrontId/membership-tiers","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":585}},{"id":"api-9901ca9416b5f43b","method":"POST","mountResolved":true,"path":"/api/auth/login","processScope":"main-app","source":{"file":"server/routes.ts","line":485}},{"id":"api-ada499737fe455a9","method":"POST","mountResolved":true,"path":"/api/auth/logout","processScope":"main-app","source":{"file":"server/routes.ts","line":633}},{"id":"api-b6efedf3839ffe3e","method":"GET","mountResolved":true,"path":"/api/storefront/preview/:slug","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":283}},{"id":"api-bf955ca735abdbc4","method":"GET","mountResolved":true,"path":"/api/storefront/check-subdomain/:subdomain","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":1032}},{"id":"api-c68fa99ae38c2258","method":"GET","mountResolved":true,"path":"/api/storefront/public/:slug","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":189}},{"id":"api-d29e42a77351fe87","method":"GET","mountResolved":true,"path":"/api/auth/preferences","processScope":"main-app","source":{"file":"server/routes.ts","line":889}},{"id":"api-f7792ab535dbfef4","method":"POST","mountResolved":true,"path":"/api/storefront/:id/follow","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":1449}},{"id":"api-f8cbccbe4f57a648","method":"POST","mountResolved":true,"path":"/api/storefront/:id/rate","processScope":"main-app","source":{"file":"server/routes/storefront.ts","line":1481}}] |
| coverageOfSource | {"existingEvidenceScope":["reports/test-verification/integration-browser/page80/page80.json and reports/test-verification/integration-browser/browser-page80-summary.json contain scoped render/journey observations. Inspect per-page auth and receipt scope before linking any named business-section acceptance."],"inspectedFiles":[{"apiExpressions":["/api/","/api/marketplace/audio/${audioUrl.replace(/^\\/+/,","/api/marketplace/audio/${audioUrl}","/api/storefront/${encodeURIComponent(storefront!.id)}/orders","/api/storefront/${storefront!.id}/checkout","/api/storefront/${storefront!.id}/checkout/preview","/api/storefront/${storefront!.id}/follow","/api/storefront/${storefront!.id}/like","/api/storefront/${storefront!.id}/listings","/api/storefront/${storefront!.id}/membership-tiers/public","/api/storefront/${storefront!.id}/rate","/api/storefront/${storefront?.id}/bogo-promotions","/api/storefront/${storefront?.id}/listings","/api/storefront/${storefront?.id}/membership-tiers/public","/api/storefront/${storefront?.id}/orders","/api/storefront/${storefront?.id}/social","/api/storefront/preview/${slug}","/api/storefront/public/${slug}","/api/storefront/subscribe/${tierId}"],"declaredLinks":[],"eventHandlers":["addToCart","checkoutMutation","checkoutOutcome","checkoutStatus","handleCheckout","handleCopyLink","handleFollow","handleLike","handlePlayListing","handleShare","savedIntent","subscribeMutation"],"fieldAttributes":[{"attribute":"placeholder","line":911,"value":"Write a review (optional)"}],"file":"client/src/pages/Storefront.tsx","headingTabDialogAndFieldLabels":[{"kind":"h2","line":635,"name":"Storefront Not Found","tabValue":null},{"kind":"h1","line":759,"name":"{storefront.name}","tabValue":null},{"kind":"h4","line":892,"name":"Rate this storefront","tabValue":null},{"kind":"h2","line":984,"name":"Join the Community","tabValue":null},{"kind":"CardTitle","line":1022,"name":"{tier.name}","tabValue":null},{"kind":"h2","line":1169,"name":"Products","tabValue":null},{"kind":"CardTitle","line":1232,"name":"{listing.title}","tabValue":null},{"kind":"h2","line":1344,"name":"Your purchases","tabValue":null}],"inspectedRange":{"end":1468,"start":1},"sha256":"5ee9e44d59a9fc54a71f80edf87c5b63111d12d0d97aa25e1daa7bbc950fc29c","staticDataTitles":["Added to Cart","Checkout Canceled","Checkout Failed","Checkout unavailable","Link","Link copied","Link copied!","Membership Activated!","Payment received","Rating submitted","Removed from Cart","Share","Subscription Canceled","Subscription Failed","Subscription Successful!"]}],"knownLimits":["No case execution, current coverage increase, provider delivery or production-readiness claim is made by this plan."],"meaning":"Source inspection inventory only. Business behavior remains UNVERIFIED; all register controls/contracts are retained for root task joining, not marked complete.","registeredPageBackendRouteIds":["api-0d61e9f3cc08a7f2","api-1a2231268bd1fc57","api-2839f90eff235c21","api-2bc47d91358c2c72","api-4634d90f26b78a04","api-529b9fc911be4252","api-5e47bf891c0ba2a2","api-6d7d46c4b4b4f7f9","api-6dbe5bdf799266a0","api-7c8878c0bdcf5f2f","api-86e7b60426904482","api-8760c18cd3e1f99e","api-87e59b13022236a3","api-8c958a30a19c94be","api-9901ca9416b5f43b","api-ada499737fe455a9","api-b6efedf3839ffe3e","api-bf955ca735abdbc4","api-c68fa99ae38c2258","api-d29e42a77351fe87","api-f7792ab535dbfef4","api-f8cbccbe4f57a648"],"registeredPageFrontendContractIds":["call-0a92f0378a419473","call-0f045f80943d4c48","call-14e7a921cb488164","call-1a25405e3a71d413","call-237238af3c8fc169","call-255cbe0d8e2581a8","call-2959c9a931fd0dbb","call-29aea1f08af7e088","call-833ba2b8b8e23c0e","call-c08be66ad199f4f2","call-cb860b04fe41fe4d","call-defdde4f0de88ca8","call-e8522d80c7b64747","call-f1ad50215d96782c","call-f4d5de16a940565d"],"registeredPageInteractionIds":["ui-0937a333a57b5fe5","ui-15c703c851546204","ui-22be01f80b05e065","ui-22d2b3dfb6a39e9f","ui-23e281cfb64a4a06","ui-29a2fd5ec7e815ee","ui-33b6f62e9f154682","ui-3c9c6778dedb1194","ui-403f88eb30948fe9","ui-64d34b5af4ea68b8","ui-6f05ab0e825accb5","ui-75c5d9223ccd2ced","ui-795e6d3b5ac84531","ui-7b49a57590b17552","ui-a5d8761643b634d0","ui-a87cdbc5ae9fb7c6","ui-b63d197b8531d0a0","ui-b7fbe2511b8326ba","ui-b809b6f5745b6c38","ui-bddeadc23930cd13","ui-c9bd3a415430e535","ui-cceafedea73c185e","ui-d4741b86b032dbbb","ui-d597ea900c9f463a","ui-d8171df727d76e4e","ui-f4f1e9c93275ef70","ui-f6e757293b76acc8","ui-fe2f7a7c1849fce1"],"sourceLocalInteractionIds":["ui-0937a333a57b5fe5","ui-15c703c851546204","ui-22be01f80b05e065","ui-22d2b3dfb6a39e9f","ui-23e281cfb64a4a06","ui-29a2fd5ec7e815ee","ui-33b6f62e9f154682","ui-3c9c6778dedb1194","ui-403f88eb30948fe9","ui-64d34b5af4ea68b8","ui-75c5d9223ccd2ced","ui-795e6d3b5ac84531","ui-7b49a57590b17552","ui-a5d8761643b634d0","ui-a87cdbc5ae9fb7c6","ui-b63d197b8531d0a0","ui-b7fbe2511b8326ba","ui-b809b6f5745b6c38","ui-bddeadc23930cd13","ui-c9bd3a415430e535","ui-cceafedea73c185e","ui-d4741b86b032dbbb","ui-d597ea900c9f463a","ui-d8171df727d76e4e","ui-f4f1e9c93275ef70","ui-f6e757293b76acc8","ui-fe2f7a7c1849fce1"],"unresolvedMappingWork":["Resolve every source API expression not represented by a matching current frontend contract and mounted backend route; distinguish private imported-service processes from main-server routes.","Map each dynamic heading, repeated row, source-local control and shared component to its named business section; retain a concrete task for unknown associations."]} |
| analysisSourceFreshness | {"checkedFiles":1,"meaning":"Source-analysis freshness only; not behavioral execution evidence.","staleSourceFiles":[],"status":"SOURCE_HASHES_MATCH","unavailableSourceFiles":[]} |

### Public storefront, preview and publication state

| Work field | Required detail |
| --- | --- |
| id | page-cfdecadd0884ff0b/business-section-1 |
| status | UNVERIFIED |
| sourceFiles | ["client/src/pages/Storefront.tsx"] |
| sourceSectionCandidates | [{"file":"client/src/pages/Storefront.tsx","kind":"h2","line":635,"name":"Storefront Not Found","tabValue":null},{"file":"client/src/pages/Storefront.tsx","kind":"h1","line":759,"name":"{storefront.name}","tabValue":null},{"file":"client/src/pages/Storefront.tsx","kind":"h4","line":892,"name":"Rate this storefront","tabValue":null}] |
| frontendWork | ["Resolve slug, missing slug, unpublished storefront, authenticated owner preview and public visibility; verify custom banner/avatar/theme/social links and no owner-only data exposure.","Exercise every source-linked field/control in this section, including emitted handlers and dynamic rows; resolve ambiguous section ownership before adding acceptance evidence."] |
| backendWork | ["Trace the actual API expressions listed in coverageOfSource to mounted handlers, middleware, schema and service; verify method/path, role/owner checks, durable state and error contracts.","Use knownFrontendContracts and knownBackendRoutes below; any absent/dynamic route mapping remains an explicit mapping task, never a presumed implemented endpoint."] |
| validationPermissionsSecurity | ["Public listing visibility differs from owner preview, social mutations, subscriptions and purchased private files; enforce owner/customer authorization and server-pricedCSRF-protected checkout."] |
| durableProviderGenerationJourneys | ["Verify immutable product bytes, authoritative checkout/Stripe fulfillment, membership lifecycle and paid download rights using disposableSQL plus dedicated sandbox/deployed gates."] |
| failureAccessibilityMobileI18nPerformance | ["Test malformed slugs, failed audio/share/checkout, rapid cart changes, keyboard star ratings,RTL/currency formatting, responsive cart and bounded listing/media loads."] |
| evidenceNeeded | ["Current-source component/browser case IDs for this named section with successful and adverse outcomes, keyboard/touch observations and exact state/payload assertions.","For declared mutations, retain owner/foreign-owner/anonymous HTTP cases plus persisted second-request/worker reads and side-effect receipts; for static/navigation sections retain destination/content assertions.","Source-mapped execution counters for the actual section functions/branches and links to required deployment/provider evidence; a source scan or page shell render never closes this work."] |
| interactionIds | [] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| mappingStatus | UNVERIFIED_SECTION_ASSIGNMENT: page-level complete ID inventories are retained below; map exact controls/contracts to this section before closing work. |

### Likes, follows, reviews and sharing

| Work field | Required detail |
| --- | --- |
| id | page-cfdecadd0884ff0b/business-section-2 |
| status | UNVERIFIED |
| sourceFiles | ["client/src/pages/Storefront.tsx"] |
| sourceSectionCandidates | [] |
| frontendWork | ["Exercise authenticated/anonymous like/follow/rating flows, star selection/review limits, counts after reload, copy/share failures and duplicate submissions.","Exercise every source-linked field/control in this section, including emitted handlers and dynamic rows; resolve ambiguous section ownership before adding acceptance evidence."] |
| backendWork | ["Trace the actual API expressions listed in coverageOfSource to mounted handlers, middleware, schema and service; verify method/path, role/owner checks, durable state and error contracts.","Use knownFrontendContracts and knownBackendRoutes below; any absent/dynamic route mapping remains an explicit mapping task, never a presumed implemented endpoint."] |
| validationPermissionsSecurity | ["Public listing visibility differs from owner preview, social mutations, subscriptions and purchased private files; enforce owner/customer authorization and server-pricedCSRF-protected checkout."] |
| durableProviderGenerationJourneys | ["Verify immutable product bytes, authoritative checkout/Stripe fulfillment, membership lifecycle and paid download rights using disposableSQL plus dedicated sandbox/deployed gates."] |
| failureAccessibilityMobileI18nPerformance | ["Test malformed slugs, failed audio/share/checkout, rapid cart changes, keyboard star ratings,RTL/currency formatting, responsive cart and bounded listing/media loads."] |
| evidenceNeeded | ["Current-source component/browser case IDs for this named section with successful and adverse outcomes, keyboard/touch observations and exact state/payload assertions.","For declared mutations, retain owner/foreign-owner/anonymous HTTP cases plus persisted second-request/worker reads and side-effect receipts; for static/navigation sections retain destination/content assertions.","Source-mapped execution counters for the actual section functions/branches and links to required deployment/provider evidence; a source scan or page shell render never closes this work."] |
| interactionIds | [] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| mappingStatus | UNVERIFIED_SECTION_ASSIGNMENT: page-level complete ID inventories are retained below; map exact controls/contracts to this section before closing work. |

### Membership tier subscription

| Work field | Required detail |
| --- | --- |
| id | page-cfdecadd0884ff0b/business-section-3 |
| status | UNVERIFIED |
| sourceFiles | ["client/src/pages/Storefront.tsx"] |
| sourceSectionCandidates | [{"file":"client/src/pages/Storefront.tsx","kind":"CardTitle","line":1022,"name":"{tier.name}","tabValue":null}] |
| frontendWork | ["Render every tier and benefit; submit subscribe once, validate authenticated redirects and current tier refresh; verify price/currency and provider subscription authority.","Exercise every source-linked field/control in this section, including emitted handlers and dynamic rows; resolve ambiguous section ownership before adding acceptance evidence."] |
| backendWork | ["Trace the actual API expressions listed in coverageOfSource to mounted handlers, middleware, schema and service; verify method/path, role/owner checks, durable state and error contracts.","Use knownFrontendContracts and knownBackendRoutes below; any absent/dynamic route mapping remains an explicit mapping task, never a presumed implemented endpoint."] |
| validationPermissionsSecurity | ["Public listing visibility differs from owner preview, social mutations, subscriptions and purchased private files; enforce owner/customer authorization and server-pricedCSRF-protected checkout."] |
| durableProviderGenerationJourneys | ["Verify immutable product bytes, authoritative checkout/Stripe fulfillment, membership lifecycle and paid download rights using disposableSQL plus dedicated sandbox/deployed gates."] |
| failureAccessibilityMobileI18nPerformance | ["Test malformed slugs, failed audio/share/checkout, rapid cart changes, keyboard star ratings,RTL/currency formatting, responsive cart and bounded listing/media loads."] |
| evidenceNeeded | ["Current-source component/browser case IDs for this named section with successful and adverse outcomes, keyboard/touch observations and exact state/payload assertions.","For declared mutations, retain owner/foreign-owner/anonymous HTTP cases plus persisted second-request/worker reads and side-effect receipts; for static/navigation sections retain destination/content assertions.","Source-mapped execution counters for the actual section functions/branches and links to required deployment/provider evidence; a source scan or page shell render never closes this work."] |
| interactionIds | [] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| mappingStatus | UNVERIFIED_SECTION_ASSIGNMENT: page-level complete ID inventories are retained below; map exact controls/contracts to this section before closing work. |

### Product grid and audio previews

| Work field | Required detail |
| --- | --- |
| id | page-cfdecadd0884ff0b/business-section-4 |
| status | UNVERIFIED |
| sourceFiles | ["client/src/pages/Storefront.tsx"] |
| sourceSectionCandidates | [{"file":"client/src/pages/Storefront.tsx","kind":"h2","line":1169,"name":"Products","tabValue":null}] |
| frontendWork | ["Filter/render listings, normalize preview audio URLs, play/pause/switch clips and release Audio resources on navigation; enforce private full-audio access.","Exercise every source-linked field/control in this section, including emitted handlers and dynamic rows; resolve ambiguous section ownership before adding acceptance evidence."] |
| backendWork | ["Trace the actual API expressions listed in coverageOfSource to mounted handlers, middleware, schema and service; verify method/path, role/owner checks, durable state and error contracts.","Use knownFrontendContracts and knownBackendRoutes below; any absent/dynamic route mapping remains an explicit mapping task, never a presumed implemented endpoint."] |
| validationPermissionsSecurity | ["Public listing visibility differs from owner preview, social mutations, subscriptions and purchased private files; enforce owner/customer authorization and server-pricedCSRF-protected checkout."] |
| durableProviderGenerationJourneys | ["Verify immutable product bytes, authoritative checkout/Stripe fulfillment, membership lifecycle and paid download rights using disposableSQL plus dedicated sandbox/deployed gates."] |
| failureAccessibilityMobileI18nPerformance | ["Test malformed slugs, failed audio/share/checkout, rapid cart changes, keyboard star ratings,RTL/currency formatting, responsive cart and bounded listing/media loads."] |
| evidenceNeeded | ["Current-source component/browser case IDs for this named section with successful and adverse outcomes, keyboard/touch observations and exact state/payload assertions.","For declared mutations, retain owner/foreign-owner/anonymous HTTP cases plus persisted second-request/worker reads and side-effect receipts; for static/navigation sections retain destination/content assertions.","Source-mapped execution counters for the actual section functions/branches and links to required deployment/provider evidence; a source scan or page shell render never closes this work."] |
| interactionIds | [] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| mappingStatus | UNVERIFIED_SECTION_ASSIGNMENT: page-level complete ID inventories are retained below; map exact controls/contracts to this section before closing work. |

### Cart, BOGO and checkout preview

| Work field | Required detail |
| --- | --- |
| id | page-cfdecadd0884ff0b/business-section-5 |
| status | UNVERIFIED |
| sourceFiles | ["client/src/pages/Storefront.tsx"] |
| sourceSectionCandidates | [] |
| frontendWork | ["Add/remove unique listings, verify discount eligibility and server-priced checkout preview; test invalid/unavailable items and response ordering without trusting client totals.","Exercise every source-linked field/control in this section, including emitted handlers and dynamic rows; resolve ambiguous section ownership before adding acceptance evidence."] |
| backendWork | ["Trace the actual API expressions listed in coverageOfSource to mounted handlers, middleware, schema and service; verify method/path, role/owner checks, durable state and error contracts.","Use knownFrontendContracts and knownBackendRoutes below; any absent/dynamic route mapping remains an explicit mapping task, never a presumed implemented endpoint."] |
| validationPermissionsSecurity | ["Public listing visibility differs from owner preview, social mutations, subscriptions and purchased private files; enforce owner/customer authorization and server-pricedCSRF-protected checkout."] |
| durableProviderGenerationJourneys | ["Verify immutable product bytes, authoritative checkout/Stripe fulfillment, membership lifecycle and paid download rights using disposableSQL plus dedicated sandbox/deployed gates."] |
| failureAccessibilityMobileI18nPerformance | ["Test malformed slugs, failed audio/share/checkout, rapid cart changes, keyboard star ratings,RTL/currency formatting, responsive cart and bounded listing/media loads."] |
| evidenceNeeded | ["Current-source component/browser case IDs for this named section with successful and adverse outcomes, keyboard/touch observations and exact state/payload assertions.","For declared mutations, retain owner/foreign-owner/anonymous HTTP cases plus persisted second-request/worker reads and side-effect receipts; for static/navigation sections retain destination/content assertions.","Source-mapped execution counters for the actual section functions/branches and links to required deployment/provider evidence; a source scan or page shell render never closes this work."] |
| interactionIds | [] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| mappingStatus | UNVERIFIED_SECTION_ASSIGNMENT: page-level complete ID inventories are retained below; map exact controls/contracts to this section before closing work. |

### Checkout return and purchased downloads

| Work field | Required detail |
| --- | --- |
| id | page-cfdecadd0884ff0b/business-section-6 |
| status | UNVERIFIED |
| sourceFiles | ["client/src/pages/Storefront.tsx"] |
| sourceSectionCandidates | [] |
| frontendWork | ["Exercise saved checkout intent, canceled/successful returns and orders refresh; require signed payment fulfillment before purchases/downloads become accessible and preserve ownership across reload.","Exercise every source-linked field/control in this section, including emitted handlers and dynamic rows; resolve ambiguous section ownership before adding acceptance evidence."] |
| backendWork | ["Trace the actual API expressions listed in coverageOfSource to mounted handlers, middleware, schema and service; verify method/path, role/owner checks, durable state and error contracts.","Use knownFrontendContracts and knownBackendRoutes below; any absent/dynamic route mapping remains an explicit mapping task, never a presumed implemented endpoint."] |
| validationPermissionsSecurity | ["Public listing visibility differs from owner preview, social mutations, subscriptions and purchased private files; enforce owner/customer authorization and server-pricedCSRF-protected checkout."] |
| durableProviderGenerationJourneys | ["Verify immutable product bytes, authoritative checkout/Stripe fulfillment, membership lifecycle and paid download rights using disposableSQL plus dedicated sandbox/deployed gates."] |
| failureAccessibilityMobileI18nPerformance | ["Test malformed slugs, failed audio/share/checkout, rapid cart changes, keyboard star ratings,RTL/currency formatting, responsive cart and bounded listing/media loads."] |
| evidenceNeeded | ["Current-source component/browser case IDs for this named section with successful and adverse outcomes, keyboard/touch observations and exact state/payload assertions.","For declared mutations, retain owner/foreign-owner/anonymous HTTP cases plus persisted second-request/worker reads and side-effect receipts; for static/navigation sections retain destination/content assertions.","Source-mapped execution counters for the actual section functions/branches and links to required deployment/provider evidence; a source scan or page shell render never closes this work."] |
| interactionIds | [] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| mappingStatus | UNVERIFIED_SECTION_ASSIGNMENT: page-level complete ID inventories are retained below; map exact controls/contracts to this section before closing work. |

## Every control

| ID | Source | Tag/labels | Handlers | Status | Required checks |
| --- | --- | --- | --- | --- | --- |
| ui-0937a333a57b5fe5 | client/src/pages/Storefront.tsx:699 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleCopyLink"}] | UNVERIFIED | ui-0937a333a57b5fe5/control-behavior=UNVERIFIED; ui-0937a333a57b5fe5/control-failure=UNVERIFIED |
| ui-15c703c851546204 | client/src/pages/Storefront.tsx:183 | {"labels":{},"tag":"img"} | [{"event":"onError","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-15c703c851546204/control-behavior=UNVERIFIED; ui-15c703c851546204/control-failure=UNVERIFIED |
| ui-22be01f80b05e065 | client/src/pages/Storefront.tsx:824 | {"labels":{"aria-label":"Rate storefront"},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-22be01f80b05e065/control-behavior=UNVERIFIED; ui-22be01f80b05e065/control-failure=UNVERIFIED |
| ui-22d2b3dfb6a39e9f | client/src/pages/Storefront.tsx:1177 | {"labels":{},"tag":"Button"} | [] | UNVERIFIED | ui-22d2b3dfb6a39e9f/control-behavior=UNVERIFIED; ui-22d2b3dfb6a39e9f/control-failure=UNVERIFIED |
| ui-23e281cfb64a4a06 | client/src/pages/Storefront.tsx:844 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-23e281cfb64a4a06/control-behavior=UNVERIFIED; ui-23e281cfb64a4a06/control-failure=UNVERIFIED |
| ui-29a2fd5ec7e815ee | client/src/pages/Storefront.tsx:910 | {"labels":{},"tag":"textarea"} | [{"event":"onChange","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-29a2fd5ec7e815ee/control-behavior=UNVERIFIED; ui-29a2fd5ec7e815ee/control-failure=UNVERIFIED |
| ui-33b6f62e9f154682 | client/src/pages/Storefront.tsx:708 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-33b6f62e9f154682/control-behavior=UNVERIFIED; ui-33b6f62e9f154682/control-failure=UNVERIFIED |
| ui-3c9c6778dedb1194 | client/src/pages/Storefront.tsx:1108 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-3c9c6778dedb1194/control-behavior=UNVERIFIED; ui-3c9c6778dedb1194/control-failure=UNVERIFIED |
| ui-403f88eb30948fe9 | client/src/pages/Storefront.tsx:855 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-403f88eb30948fe9/control-behavior=UNVERIFIED; ui-403f88eb30948fe9/control-failure=UNVERIFIED |
| ui-64d34b5af4ea68b8 | client/src/pages/Storefront.tsx:162 | {"labels":{},"tag":"img"} | [{"event":"onError","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-64d34b5af4ea68b8/control-behavior=UNVERIFIED; ui-64d34b5af4ea68b8/control-failure=UNVERIFIED |
| ui-6f05ab0e825accb5 | client/src/components/auth/AuthProvider.tsx:185 | {"labels":{"type":"button"},"tag":"button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-6f05ab0e825accb5/control-behavior=UNVERIFIED; ui-6f05ab0e825accb5/control-failure=UNVERIFIED |
| ui-75c5d9223ccd2ced | client/src/pages/Storefront.tsx:1211 | {"labels":{},"tag":"img"} | [{"event":"onError","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-75c5d9223ccd2ced/control-behavior=UNVERIFIED; ui-75c5d9223ccd2ced/control-failure=UNVERIFIED |
| ui-795e6d3b5ac84531 | client/src/pages/Storefront.tsx:1286 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-795e6d3b5ac84531/control-behavior=UNVERIFIED; ui-795e6d3b5ac84531/control-failure=UNVERIFIED |
| ui-7b49a57590b17552 | client/src/pages/Storefront.tsx:866 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-7b49a57590b17552/control-behavior=UNVERIFIED; ui-7b49a57590b17552/control-failure=UNVERIFIED |
| ui-a5d8761643b634d0 | client/src/pages/Storefront.tsx:1376 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-a5d8761643b634d0/control-behavior=UNVERIFIED; ui-a5d8761643b634d0/control-failure=UNVERIFIED |
| ui-a87cdbc5ae9fb7c6 | client/src/pages/Storefront.tsx:895 | {"labels":{},"tag":"button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-a87cdbc5ae9fb7c6/control-behavior=UNVERIFIED; ui-a87cdbc5ae9fb7c6/control-failure=UNVERIFIED |
| ui-b63d197b8531d0a0 | client/src/pages/Storefront.tsx:781 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleFollow"}] | UNVERIFIED | ui-b63d197b8531d0a0/control-behavior=UNVERIFIED; ui-b63d197b8531d0a0/control-failure=UNVERIFIED |
| ui-b7fbe2511b8326ba | client/src/pages/Storefront.tsx:877 | {"labels":{"href":null},"tag":"a"} | [] | UNVERIFIED | ui-b7fbe2511b8326ba/control-behavior=UNVERIFIED; ui-b7fbe2511b8326ba/control-failure=UNVERIFIED |
| ui-b809b6f5745b6c38 | client/src/pages/Storefront.tsx:1375 | {"labels":{},"tag":"Button"} | [] | UNVERIFIED | ui-b809b6f5745b6c38/control-behavior=UNVERIFIED; ui-b809b6f5745b6c38/control-failure=UNVERIFIED |
| ui-bddeadc23930cd13 | client/src/pages/Storefront.tsx:918 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-bddeadc23930cd13/control-behavior=UNVERIFIED; ui-bddeadc23930cd13/control-failure=UNVERIFIED |
| ui-c9bd3a415430e535 | client/src/pages/Storefront.tsx:1303 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-c9bd3a415430e535/control-behavior=UNVERIFIED; ui-c9bd3a415430e535/control-failure=UNVERIFIED |
| ui-cceafedea73c185e | client/src/pages/Storefront.tsx:815 | {"labels":{"aria-label":"Share storefront"},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleShare"}] | UNVERIFIED | ui-cceafedea73c185e/control-behavior=UNVERIFIED; ui-cceafedea73c185e/control-failure=UNVERIFIED |
| ui-d4741b86b032dbbb | client/src/pages/Storefront.tsx:1445 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleCheckout"}] | UNVERIFIED | ui-d4741b86b032dbbb/control-behavior=UNVERIFIED; ui-d4741b86b032dbbb/control-failure=UNVERIFIED |
| ui-d597ea900c9f463a | client/src/pages/Storefront.tsx:1098 | {"labels":{},"tag":"Button"} | [] | UNVERIFIED | ui-d597ea900c9f463a/control-behavior=UNVERIFIED; ui-d597ea900c9f463a/control-failure=UNVERIFIED |
| ui-d8171df727d76e4e | client/src/pages/Storefront.tsx:799 | {"labels":{"aria-label":null},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleLike"}] | UNVERIFIED | ui-d8171df727d76e4e/control-behavior=UNVERIFIED; ui-d8171df727d76e4e/control-failure=UNVERIFIED |
| ui-f4f1e9c93275ef70 | client/src/pages/Storefront.tsx:930 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-f4f1e9c93275ef70/control-behavior=UNVERIFIED; ui-f4f1e9c93275ef70/control-failure=UNVERIFIED |
| ui-f6e757293b76acc8 | client/src/pages/Storefront.tsx:718 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-f6e757293b76acc8/control-behavior=UNVERIFIED; ui-f6e757293b76acc8/control-failure=UNVERIFIED |
| ui-fe2f7a7c1849fce1 | client/src/pages/Storefront.tsx:1298 | {"labels":{},"tag":"Button"} | [] | UNVERIFIED | ui-fe2f7a7c1849fce1/control-behavior=UNVERIFIED; ui-fe2f7a7c1849fce1/control-failure=UNVERIFIED |

For every control execute its control-behavior and control-failure acceptance from the global required-check ledger; cover keyboard/mobile, input validation, loading/error/retry, authorization and the real side effect.

## Every frontend API contract

| ID | Method/path | Source | Topology | Backend IDs | Behavior acceptance |
| --- | --- | --- | --- | --- | --- |
| call-0a92f0378a419473 | POST /api/storefront/:param/like | client/src/pages/Storefront.tsx:407 | matched | ["api-6dbe5bdf799266a0","api-87e59b13022236a3"] | UNVERIFIED |
| call-0f045f80943d4c48 | POST /api/auth/register | client/src/components/auth/AuthProvider.tsx:148 | matched | ["api-1a2231268bd1fc57"] | UNVERIFIED |
| call-14e7a921cb488164 | PUT /api/auth/preferences | client/src/lib/preferenceWrites.ts:14 | matched | ["api-86e7b60426904482"] | UNVERIFIED |
| call-1a25405e3a71d413 | POST /api/auth/login | client/src/components/auth/AuthProvider.tsx:132 | matched | ["api-9901ca9416b5f43b"] | UNVERIFIED |
| call-237238af3c8fc169 | GET /api/storefront/:param/orders | client/src/pages/Storefront.tsx:316 | matched | ["api-5e47bf891c0ba2a2","api-6d7d46c4b4b4f7f9","api-b6efedf3839ffe3e","api-bf955ca735abdbc4","api-c68fa99ae38c2258"] | UNVERIFIED |
| call-255cbe0d8e2581a8 | POST /api/storefront/:param/rate | client/src/pages/Storefront.tsx:435 | matched | ["api-6dbe5bdf799266a0","api-f8cbccbe4f57a648"] | UNVERIFIED |
| call-2959c9a931fd0dbb | GET /api/storefront/:param/membership-tiers/public | client/src/pages/Storefront.tsx:330 | matched | ["api-2839f90eff235c21"] | UNVERIFIED |
| call-29aea1f08af7e088 | GET /api/auth/preferences | client/src/components/auth/AuthProvider.tsx:68 | matched | ["api-d29e42a77351fe87"] | UNVERIFIED |
| call-833ba2b8b8e23c0e | POST /api/storefront/subscribe/:param | client/src/pages/Storefront.tsx:488 | matched | ["api-0d61e9f3cc08a7f2","api-4634d90f26b78a04","api-6dbe5bdf799266a0","api-8760c18cd3e1f99e","api-87e59b13022236a3","api-8c958a30a19c94be","api-f7792ab535dbfef4","api-f8cbccbe4f57a648"] | UNVERIFIED |
| call-c08be66ad199f4f2 | POST /api/storefront/:param/checkout/preview | client/src/pages/Storefront.tsx:398 | matched | ["api-529b9fc911be4252"] | UNVERIFIED |
| call-cb860b04fe41fe4d | POST /api/auth/logout | client/src/components/auth/AuthProvider.tsx:159 | matched | ["api-ada499737fe455a9"] | UNVERIFIED |
| call-defdde4f0de88ca8 | POST /api/storefront/:param/checkout | client/src/pages/Storefront.tsx:548 | matched | ["api-6dbe5bdf799266a0","api-8760c18cd3e1f99e"] | UNVERIFIED |
| call-e8522d80c7b64747 | POST /api/sync/batch | client/src/lib/offline/SyncManager.ts:298 | matched | ["api-2bc47d91358c2c72"] | UNVERIFIED |
| call-f1ad50215d96782c | POST /api/storefront/:param/follow | client/src/pages/Storefront.tsx:418 | matched | ["api-6dbe5bdf799266a0","api-f7792ab535dbfef4"] | UNVERIFIED |
| call-f4d5de16a940565d | POST /api/sync/receipts | client/src/lib/offline/SyncManager.ts:386 | matched | ["api-7c8878c0bdcf5f2f"] | UNVERIFIED |

Trace each request to its actual process/mount, assert exact response/error/permission behavior and prove persistence after reload or another worker.

## Every mapped backend registration

| ID | Method/path | Source | Process/mount | Status | Required checks |
| --- | --- | --- | --- | --- | --- |
| api-0d61e9f3cc08a7f2 | POST /api/storefront/:storefrontId/verify-domain | server/routes/storefront.ts:1215 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-0d61e9f3cc08a7f2/response-contract=UNVERIFIED; api-0d61e9f3cc08a7f2/access-policy=UNVERIFIED; api-0d61e9f3cc08a7f2/input-boundaries=UNVERIFIED; api-0d61e9f3cc08a7f2/tenant-boundary=UNVERIFIED; api-0d61e9f3cc08a7f2/dependency-failure=UNVERIFIED; api-0d61e9f3cc08a7f2/mutation-durability=UNVERIFIED |
| api-1a2231268bd1fc57 | POST /api/auth/register | server/routes.ts:318 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-1a2231268bd1fc57/response-contract=UNVERIFIED; api-1a2231268bd1fc57/access-policy=UNVERIFIED; api-1a2231268bd1fc57/input-boundaries=UNVERIFIED; api-1a2231268bd1fc57/tenant-boundary=UNVERIFIED; api-1a2231268bd1fc57/dependency-failure=UNVERIFIED; api-1a2231268bd1fc57/mutation-durability=UNVERIFIED |
| api-2839f90eff235c21 | GET /api/storefront/:storefrontId/membership-tiers/public | server/routes/storefront.ts:961 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-2839f90eff235c21/response-contract=UNVERIFIED; api-2839f90eff235c21/access-policy=UNVERIFIED; api-2839f90eff235c21/input-boundaries=UNVERIFIED; api-2839f90eff235c21/tenant-boundary=UNVERIFIED; api-2839f90eff235c21/dependency-failure=UNVERIFIED |
| api-2bc47d91358c2c72 | POST /api/sync/batch | server/routes/sync.ts:357 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-2bc47d91358c2c72/response-contract=UNVERIFIED; api-2bc47d91358c2c72/access-policy=UNVERIFIED; api-2bc47d91358c2c72/input-boundaries=UNVERIFIED; api-2bc47d91358c2c72/tenant-boundary=UNVERIFIED; api-2bc47d91358c2c72/dependency-failure=UNVERIFIED; api-2bc47d91358c2c72/mutation-durability=UNVERIFIED |
| api-4634d90f26b78a04 | POST /api/storefront/:storefrontId/bogo-promotions | server/routes/storefront.ts:2554 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-4634d90f26b78a04/response-contract=UNVERIFIED; api-4634d90f26b78a04/access-policy=UNVERIFIED; api-4634d90f26b78a04/input-boundaries=UNVERIFIED; api-4634d90f26b78a04/tenant-boundary=UNVERIFIED; api-4634d90f26b78a04/dependency-failure=UNVERIFIED; api-4634d90f26b78a04/mutation-durability=UNVERIFIED |
| api-529b9fc911be4252 | POST /api/storefront/:id/checkout/preview | server/routes/storefront.ts:2750 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-529b9fc911be4252/response-contract=UNVERIFIED; api-529b9fc911be4252/access-policy=UNVERIFIED; api-529b9fc911be4252/input-boundaries=UNVERIFIED; api-529b9fc911be4252/tenant-boundary=UNVERIFIED; api-529b9fc911be4252/dependency-failure=UNVERIFIED; api-529b9fc911be4252/mutation-durability=UNVERIFIED |
| api-5e47bf891c0ba2a2 | GET /api/storefront/subdomain/:subdomain | server/routes/storefront.ts:1071 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-5e47bf891c0ba2a2/response-contract=UNVERIFIED; api-5e47bf891c0ba2a2/access-policy=UNVERIFIED; api-5e47bf891c0ba2a2/input-boundaries=UNVERIFIED; api-5e47bf891c0ba2a2/tenant-boundary=UNVERIFIED; api-5e47bf891c0ba2a2/dependency-failure=UNVERIFIED |
| api-6d7d46c4b4b4f7f9 | GET /api/storefront/:id/orders | server/routes/storefront.ts:1955 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-6d7d46c4b4b4f7f9/response-contract=UNVERIFIED; api-6d7d46c4b4b4f7f9/access-policy=UNVERIFIED; api-6d7d46c4b4b4f7f9/input-boundaries=UNVERIFIED; api-6d7d46c4b4b4f7f9/tenant-boundary=UNVERIFIED; api-6d7d46c4b4b4f7f9/dependency-failure=UNVERIFIED |
| api-6dbe5bdf799266a0 | POST /api/storefront/subscribe/:tierId | server/routes/storefront.ts:769 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-6dbe5bdf799266a0/response-contract=UNVERIFIED; api-6dbe5bdf799266a0/access-policy=UNVERIFIED; api-6dbe5bdf799266a0/input-boundaries=UNVERIFIED; api-6dbe5bdf799266a0/tenant-boundary=UNVERIFIED; api-6dbe5bdf799266a0/dependency-failure=UNVERIFIED; api-6dbe5bdf799266a0/mutation-durability=UNVERIFIED |
| api-7c8878c0bdcf5f2f | POST /api/sync/receipts | server/routes/sync.ts:446 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-7c8878c0bdcf5f2f/response-contract=UNVERIFIED; api-7c8878c0bdcf5f2f/access-policy=UNVERIFIED; api-7c8878c0bdcf5f2f/input-boundaries=UNVERIFIED; api-7c8878c0bdcf5f2f/tenant-boundary=UNVERIFIED; api-7c8878c0bdcf5f2f/dependency-failure=UNVERIFIED; api-7c8878c0bdcf5f2f/mutation-durability=UNVERIFIED |
| api-86e7b60426904482 | PUT /api/auth/preferences | server/routes.ts:909 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-86e7b60426904482/response-contract=UNVERIFIED; api-86e7b60426904482/access-policy=UNVERIFIED; api-86e7b60426904482/input-boundaries=UNVERIFIED; api-86e7b60426904482/tenant-boundary=UNVERIFIED; api-86e7b60426904482/dependency-failure=UNVERIFIED; api-86e7b60426904482/mutation-durability=UNVERIFIED |
| api-8760c18cd3e1f99e | POST /api/storefront/:id/checkout | server/routes/storefront.ts:1534 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-8760c18cd3e1f99e/response-contract=UNVERIFIED; api-8760c18cd3e1f99e/access-policy=UNVERIFIED; api-8760c18cd3e1f99e/input-boundaries=UNVERIFIED; api-8760c18cd3e1f99e/tenant-boundary=UNVERIFIED; api-8760c18cd3e1f99e/dependency-failure=UNVERIFIED; api-8760c18cd3e1f99e/mutation-durability=UNVERIFIED |
| api-87e59b13022236a3 | POST /api/storefront/:id/like | server/routes/storefront.ts:1417 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-87e59b13022236a3/response-contract=UNVERIFIED; api-87e59b13022236a3/access-policy=UNVERIFIED; api-87e59b13022236a3/input-boundaries=UNVERIFIED; api-87e59b13022236a3/tenant-boundary=UNVERIFIED; api-87e59b13022236a3/dependency-failure=UNVERIFIED; api-87e59b13022236a3/mutation-durability=UNVERIFIED |
| api-8c958a30a19c94be | POST /api/storefront/:storefrontId/membership-tiers | server/routes/storefront.ts:585 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-8c958a30a19c94be/response-contract=UNVERIFIED; api-8c958a30a19c94be/access-policy=UNVERIFIED; api-8c958a30a19c94be/input-boundaries=UNVERIFIED; api-8c958a30a19c94be/tenant-boundary=UNVERIFIED; api-8c958a30a19c94be/dependency-failure=UNVERIFIED; api-8c958a30a19c94be/mutation-durability=UNVERIFIED |
| api-9901ca9416b5f43b | POST /api/auth/login | server/routes.ts:485 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-9901ca9416b5f43b/response-contract=UNVERIFIED; api-9901ca9416b5f43b/access-policy=UNVERIFIED; api-9901ca9416b5f43b/input-boundaries=UNVERIFIED; api-9901ca9416b5f43b/tenant-boundary=UNVERIFIED; api-9901ca9416b5f43b/dependency-failure=UNVERIFIED; api-9901ca9416b5f43b/mutation-durability=UNVERIFIED |
| api-ada499737fe455a9 | POST /api/auth/logout | server/routes.ts:633 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-ada499737fe455a9/response-contract=UNVERIFIED; api-ada499737fe455a9/access-policy=UNVERIFIED; api-ada499737fe455a9/input-boundaries=UNVERIFIED; api-ada499737fe455a9/tenant-boundary=UNVERIFIED; api-ada499737fe455a9/dependency-failure=UNVERIFIED; api-ada499737fe455a9/mutation-durability=UNVERIFIED |
| api-b6efedf3839ffe3e | GET /api/storefront/preview/:slug | server/routes/storefront.ts:283 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-b6efedf3839ffe3e/response-contract=UNVERIFIED; api-b6efedf3839ffe3e/access-policy=UNVERIFIED; api-b6efedf3839ffe3e/input-boundaries=UNVERIFIED; api-b6efedf3839ffe3e/tenant-boundary=UNVERIFIED; api-b6efedf3839ffe3e/dependency-failure=UNVERIFIED |
| api-bf955ca735abdbc4 | GET /api/storefront/check-subdomain/:subdomain | server/routes/storefront.ts:1032 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-bf955ca735abdbc4/response-contract=UNVERIFIED; api-bf955ca735abdbc4/access-policy=UNVERIFIED; api-bf955ca735abdbc4/input-boundaries=UNVERIFIED; api-bf955ca735abdbc4/tenant-boundary=UNVERIFIED; api-bf955ca735abdbc4/dependency-failure=UNVERIFIED |
| api-c68fa99ae38c2258 | GET /api/storefront/public/:slug | server/routes/storefront.ts:189 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-c68fa99ae38c2258/response-contract=UNVERIFIED; api-c68fa99ae38c2258/access-policy=UNVERIFIED; api-c68fa99ae38c2258/input-boundaries=UNVERIFIED; api-c68fa99ae38c2258/tenant-boundary=UNVERIFIED; api-c68fa99ae38c2258/dependency-failure=UNVERIFIED |
| api-d29e42a77351fe87 | GET /api/auth/preferences | server/routes.ts:889 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-d29e42a77351fe87/response-contract=UNVERIFIED; api-d29e42a77351fe87/access-policy=UNVERIFIED; api-d29e42a77351fe87/input-boundaries=UNVERIFIED; api-d29e42a77351fe87/tenant-boundary=UNVERIFIED; api-d29e42a77351fe87/dependency-failure=UNVERIFIED |
| api-f7792ab535dbfef4 | POST /api/storefront/:id/follow | server/routes/storefront.ts:1449 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-f7792ab535dbfef4/response-contract=UNVERIFIED; api-f7792ab535dbfef4/access-policy=UNVERIFIED; api-f7792ab535dbfef4/input-boundaries=UNVERIFIED; api-f7792ab535dbfef4/tenant-boundary=UNVERIFIED; api-f7792ab535dbfef4/dependency-failure=UNVERIFIED; api-f7792ab535dbfef4/mutation-durability=UNVERIFIED |
| api-f8cbccbe4f57a648 | POST /api/storefront/:id/rate | server/routes/storefront.ts:1481 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-f8cbccbe4f57a648/response-contract=UNVERIFIED; api-f8cbccbe4f57a648/access-policy=UNVERIFIED; api-f8cbccbe4f57a648/input-boundaries=UNVERIFIED; api-f8cbccbe4f57a648/tenant-boundary=UNVERIFIED; api-f8cbccbe4f57a648/dependency-failure=UNVERIFIED; api-f8cbccbe4f57a648/mutation-durability=UNVERIFIED |

Exercise successful/adverse HTTP contracts, cross-owner denial, input boundaries, dependency failure, durable mutation/deletion and callback/artifact/readiness checks exactly as assigned. Standalone or unresolved processes need their own harness.

## Exact source reachability and test instructions

```json
{
  "reachableSourceFiles": [
    "built-in plugins dsp/BasePlugin.ts",
    "built-in plugins dsp/EQPlugin.ts",
    "client/src/components/auth/AuthProvider.tsx",
    "client/src/components/ui/badge.tsx",
    "client/src/components/ui/button.tsx",
    "client/src/components/ui/card.tsx",
    "client/src/components/ui/separator.tsx",
    "client/src/components/ui/toast.tsx",
    "client/src/contexts/ThemeContext.tsx",
    "client/src/hooks/use-toast.ts",
    "client/src/hooks/useAuth.ts",
    "client/src/lib/audio/PluginHost.ts",
    "client/src/lib/authenticationBoundary.ts",
    "client/src/lib/daw/AudioWorkletEngine.ts",
    "client/src/lib/daw/TrackPluginChain.ts",
    "client/src/lib/errorService.ts",
    "client/src/lib/idbPersister.ts",
    "client/src/lib/logger.ts",
    "client/src/lib/offline/DraftStorage.ts",
    "client/src/lib/offline/OfflineCache.ts",
    "client/src/lib/offline/OfflineQueue.ts",
    "client/src/lib/offline/SyncManager.ts",
    "client/src/lib/offline/accountCoordinator.ts",
    "client/src/lib/offline/accountLocalStorage.ts",
    "client/src/lib/offline/identity.ts",
    "client/src/lib/offline/index.ts",
    "client/src/lib/offline/operationFingerprint.ts",
    "client/src/lib/offline/studioOfflineLifecycle.ts",
    "client/src/lib/preferenceWrites.ts",
    "client/src/lib/queryClient.ts",
    "client/src/lib/sessionProbe.ts",
    "client/src/lib/studioLayoutStore.ts",
    "client/src/lib/utils.ts",
    "client/src/pages/Storefront.tsx",
    "client/src/stores/studioStore.ts",
    "shared/schema.ts"
  ],
  "addTest": {
    "suggestedPath": "tests/browser/store-slug-acceptance.test.mjs",
    "command": "node --import tsx --test tests/browser/store-slug-acceptance.test.mjs",
    "cwd": ".",
    "instructions": "Implement the named behavioral assertions using disposable fixtures, then map exact passing case identities in the acceptance map; source associations alone never close a check.",
    "fixtureTemplate": "browser-page"
  },
  "testCandidates": []
}
```

The complete machine ledger retains original evidence/details and global controls, unmapped routes, source coverage and non-JS/desktop/native lanes. See [platform index](../platform-completion-plan.md).
