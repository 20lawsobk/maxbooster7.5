# 67. /notifications — Notifications

Generated; edit the generator or source business-section supplements and regenerate. Inventory inclusion is not test passage.

Declaration `page-7af4f1aeb5f034dc`; source `client/src/pages/Notifications.tsx:1`; registration `{"file":"client/src/App.tsx","line":277}`; status **UNVERIFIED**.

## Page acceptance

| Check | Status | Exact acceptance |
| --- | --- | --- |
| page-7af4f1aeb5f034dc/page-states | UNVERIFIED | Exercise this page's actual loading, empty, error/retry and successful states, including navigation and reload. |
| page-7af4f1aeb5f034dc/page-access | UNVERIFIED | Verify the page's declared public/authenticated/admin access policy and cross-user resource boundary. |
| page-7af4f1aeb5f034dc/page-persistence | UNVERIFIED | Submit applicable page actions, verify the corresponding backend result, and reload to confirm durable state; verify failed writes do not show success. |

Implement each exact check, then map current passing case identities and source hashes. Keep missing prerequisites and external delivery explicitly unverified.

## All business sections

| Page work/provenance field | Required detail |
| --- | --- |
| ordinal | 67 |
| id | page-7af4f1aeb5f034dc |
| path | /notifications |
| component | Notifications |
| source | {"file":"client/src/pages/Notifications.tsx","line":1} |
| status | UNVERIFIED |
| aliasSpecificWork | [] |
| knownFrontendContracts | [] |
| knownBackendRoutes | [{"id":"api-1a2231268bd1fc57","method":"POST","mountResolved":true,"path":"/api/auth/register","processScope":"main-app","source":{"file":"server/routes.ts","line":318}},{"id":"api-1c1e6f62b55d1d41","method":"GET","mountResolved":true,"path":"/api/notifications","processScope":"main-app","source":{"file":"server/routes.ts","line":3099}},{"id":"api-2bc47d91358c2c72","method":"POST","mountResolved":true,"path":"/api/sync/batch","processScope":"main-app","source":{"file":"server/routes/sync.ts","line":357}},{"id":"api-2fcdf83c64884073","method":"DELETE","mountResolved":true,"path":"/api/notifications/push-subscriptions","processScope":"main-app","source":{"file":"server/routes.ts","line":3651}},{"id":"api-748719b2ffc698f2","method":"PUT","mountResolved":true,"path":"/api/notifications/:id/read","processScope":"main-app","source":{"file":"server/routes.ts","line":3119}},{"id":"api-79806241e7837847","method":"DELETE","mountResolved":true,"path":"/api/notifications/clear-all","processScope":"main-app","source":{"file":"server/routes.ts","line":3163}},{"id":"api-7c8878c0bdcf5f2f","method":"POST","mountResolved":true,"path":"/api/sync/receipts","processScope":"main-app","source":{"file":"server/routes/sync.ts","line":446}},{"id":"api-7f36d87c329f443f","method":"DELETE","mountResolved":true,"path":"/api/notifications/mobile-tokens","processScope":"main-app","source":{"file":"server/routes.ts","line":3182}},{"id":"api-86e7b60426904482","method":"PUT","mountResolved":true,"path":"/api/auth/preferences","processScope":"main-app","source":{"file":"server/routes.ts","line":909}},{"id":"api-90e8fe0c684b7fc3","method":"PUT","mountResolved":true,"path":"/api/notifications/mark-all-read","processScope":"main-app","source":{"file":"server/routes.ts","line":3146}},{"id":"api-9901ca9416b5f43b","method":"POST","mountResolved":true,"path":"/api/auth/login","processScope":"main-app","source":{"file":"server/routes.ts","line":485}},{"id":"api-a98bdf4156c16cc6","method":"GET","mountResolved":true,"path":"/api/notifications/preferences","processScope":"main-app","source":{"file":"server/routes.ts","line":3374}},{"id":"api-ada499737fe455a9","method":"POST","mountResolved":true,"path":"/api/auth/logout","processScope":"main-app","source":{"file":"server/routes.ts","line":633}},{"id":"api-b5765bd71835678e","method":"DELETE","mountResolved":true,"path":"/api/notifications/:id","processScope":"main-app","source":{"file":"server/routes.ts","line":3217}},{"id":"api-d29e42a77351fe87","method":"GET","mountResolved":true,"path":"/api/auth/preferences","processScope":"main-app","source":{"file":"server/routes.ts","line":889}}] |
| coverageOfSource | {"existingEvidenceScope":["reports/test-verification/integration-browser/page80/page80.json and reports/test-verification/integration-browser/browser-page80-summary.json contain scoped render/journey observations. Inspect per-page auth and receipt scope before linking any named business-section acceptance."],"inspectedFiles":[{"apiExpressions":["/api/notifications","/api/notifications/${id}","/api/notifications/${id}/read","/api/notifications/clear-all","/api/notifications/mark-all-read"],"declaredLinks":[],"eventHandlers":["clearAllMutation","deleteNotificationMutation","filteredNotifications","handleNavigate"],"fieldAttributes":[],"file":"client/src/pages/Notifications.tsx","headingTabDialogAndFieldLabels":[{"kind":"h1","line":229,"name":"Notifications","tabValue":null},{"kind":"TabsTrigger","line":283,"name":"All ({notifications.length})","tabValue":"all"},{"kind":"TabsTrigger","line":286,"name":"Unread {unreadCount > 0 && ( {unreadCount} )}","tabValue":"unread"},{"kind":"TabsTrigger","line":302,"name":"{catLabel} {catCount > 0 && ( {catCount} )}","tabValue":null},{"kind":"h3","line":331,"name":"Unable to load notifications","tabValue":null},{"kind":"h3","line":348,"name":"No notifications","tabValue":null}],"inspectedRange":{"end":375,"start":1},"sha256":"8f3392c3d35ea5a3c6692ecd019a81c54da95b37048c8c6d99ba876b5be7c64d","staticDataTitles":["All notifications cleared","All notifications marked as read","Error","Notification deleted"]},{"apiExpressions":[],"declaredLinks":[],"eventHandlers":["handleClick","handleDelete","handleMarkAsRead"],"fieldAttributes":[],"file":"client/src/components/notifications/NotificationItem.tsx","headingTabDialogAndFieldLabels":[],"inspectedRange":{"end":370,"start":1},"sha256":"ae45c8997c0d96131ba34eaadc493ca811cbb8ce98091364f0f693bcbb9bd9a8","staticDataTitles":[]},{"apiExpressions":[],"declaredLinks":[],"eventHandlers":[],"fieldAttributes":[],"file":"client/src/components/notifications/types.ts","headingTabDialogAndFieldLabels":[],"inspectedRange":{"end":405,"start":1},"sha256":"ee87a22c7fe3a13a3377d506eec4fb94a7d8aa6fb0c2a3be7caa3af2e8bb8668","staticDataTitles":["Achievements","Collaboration","Content Updates","Direct Interactions","Distribution","Engagement Summaries","High","Location & Local","Low","Marketplace","Normal","Platform Admin","Platform Suggestions","Royalties & Payments","Security & Account","Social Scheduling","System & Platform","Urgent"]},{"apiExpressions":[],"declaredLinks":[],"eventHandlers":[],"fieldAttributes":[],"file":"client/src/lib/notificationAction.ts","headingTabDialogAndFieldLabels":[],"inspectedRange":{"end":12,"start":1},"sha256":"f8abc57a1b4e39002674a38c3cce5b45b95b317a565d8397d81e0acb88294ee4","staticDataTitles":[]}],"knownLimits":["No case execution, current coverage increase, provider delivery or production-readiness claim is made by this plan."],"meaning":"Source inspection inventory only. Business behavior remains UNVERIFIED; all register controls/contracts are retained for root task joining, not marked complete.","registeredPageBackendRouteIds":["api-1a2231268bd1fc57","api-1c1e6f62b55d1d41","api-2bc47d91358c2c72","api-2fcdf83c64884073","api-748719b2ffc698f2","api-79806241e7837847","api-7c8878c0bdcf5f2f","api-7f36d87c329f443f","api-86e7b60426904482","api-90e8fe0c684b7fc3","api-9901ca9416b5f43b","api-a98bdf4156c16cc6","api-ada499737fe455a9","api-b5765bd71835678e","api-d29e42a77351fe87"],"registeredPageFrontendContractIds":["call-0f045f80943d4c48","call-14e7a921cb488164","call-1a25405e3a71d413","call-29aea1f08af7e088","call-29ff873da0a56983","call-786f4741b5b20d32","call-96046eae71eeec35","call-c5c1e9f24259778b","call-cb860b04fe41fe4d","call-e50428bcbbb5a563","call-e655004b3be38ccf","call-e8522d80c7b64747","call-f4d5de16a940565d"],"registeredPageInteractionIds":["ui-02fb5e1aaab5c7c9","ui-05c73bbe7051147e","ui-0959f9e08b8b3663","ui-0b10e417bbea8507","ui-0ba2a629dacc5a4e","ui-10a17ec9718ae282","ui-147a7510c4c070cd","ui-19351da557492895","ui-9ca2eb446c30ce51","ui-2a334e7fe9e1f64a","ui-2b75ce276d7518e4","ui-b371ddfc98bfbb10","ui-3ff76f68be9e58d7","ui-09288376a7ab1304","ui-b72cc52a3e04a587","ui-4c70bc6f106bf5e8","ui-09b540e6b78df08d","ui-59e29d0517679d8a","ui-5dc5f6dc725b0714","ui-60c9c0e6145c26fa","ui-975edfade3e58d49","ui-63e2d179d155f16b","ui-660d292c53a1a27b","ui-67c713adf99573ce","ui-6ba0c83dc62c067a","ui-6f05ab0e825accb5","ui-6f4ae996df00adfa","ui-6fbecffd9578c892","ui-3828cf72f867bcb1","ui-78d565f7f7078b98","ui-84245433268496bc","ui-87a4ca027697e750","ui-949ed72b89c682cb","ui-97f927a9cc40024e","ui-9ba320680f841e27","ui-9ba6573d8f3d79ac","ui-a051fac5c8352c75","ui-d0d9ca11329dc60e","ui-a390d99ae55668d5","ui-6868a26f3f09e2a9","ui-aa788eb9d2142629","ui-b067e9a48325de98","ui-b43cc7e819219b5c","ui-c6223d6d483950f0","ui-c650988c8661dc69","ui-27a8441a308cf701","ui-cba895665a9c6e60","ui-cf2b58eec584dae4","ui-0f63676b1efba992","ui-dd275739e07f5a9a","ui-e149798fdf5cac49","ui-e498f929cdb7d24b","ui-f202dbb108e7e48f","ui-f9f1315309a3abbb","ui-fd41b29f3d2b1fab"],"sourceLocalInteractionIds":["ui-5dc5f6dc725b0714","ui-67c713adf99573ce","ui-6f4ae996df00adfa","ui-949ed72b89c682cb","ui-9ba320680f841e27","ui-a390d99ae55668d5","ui-b43cc7e819219b5c","ui-c6223d6d483950f0","ui-c650988c8661dc69","ui-dd275739e07f5a9a","ui-e498f929cdb7d24b"],"unresolvedMappingWork":["Resolve every source API expression not represented by a matching current frontend contract and mounted backend route; distinguish private imported-service processes from main-server routes.","Map each dynamic heading, repeated row, source-local control and shared component to its named business section; retain a concrete task for unknown associations."]} |
| analysisSourceFreshness | {"checkedFiles":4,"meaning":"Source-analysis freshness only; not behavioral execution evidence.","staleSourceFiles":[],"status":"SOURCE_HASHES_MATCH","unavailableSourceFiles":[]} |

### All, Unread and category tabs

| Work field | Required detail |
| --- | --- |
| id | page-7af4f1aeb5f034dc/business-section-1 |
| status | UNVERIFIED |
| sourceFiles | ["client/src/pages/Notifications.tsx","client/src/components/notifications/NotificationItem.tsx","client/src/components/notifications/types.ts","client/src/lib/notificationAction.ts"] |
| sourceSectionCandidates | [{"file":"client/src/pages/Notifications.tsx","kind":"TabsTrigger","line":286,"name":"Unread {unreadCount > 0 && ( {unreadCount} )}","tabValue":"unread"}] |
| frontendWork | ["Load current-user feed and unread count; exercise every category, priority/type badge, time formatting and independent empty/error states.","Exercise every source-linked field/control in this section, including emitted handlers and dynamic rows; resolve ambiguous section ownership before adding acceptance evidence."] |
| backendWork | ["Trace the actual API expressions listed in coverageOfSource to mounted handlers, middleware, schema and service; verify method/path, role/owner checks, durable state and error contracts.","Use knownFrontendContracts and knownBackendRoutes below; any absent/dynamic route mapping remains an explicit mapping task, never a presumed implemented endpoint."] |
| validationPermissionsSecurity | ["Filter all feed/bulk mutations byauthenticatedowner and validate action paths; keep priority icons distinguishable without color only."] |
| durableProviderGenerationJourneys | ["Read/delete/all-read/all-clear must persist and refresh cross-tab counters; delivery source events require separate business receipts."] |
| failureAccessibilityMobileI18nPerformance | ["Test nested click propagation, empty/categorized unread states, bulk failure, keyboard focus, relative-date localization and large-feed rendering."] |
| evidenceNeeded | ["Current-source component/browser case IDs for this named section with successful and adverse outcomes, keyboard/touch observations and exact state/payload assertions.","For declared mutations, retain owner/foreign-owner/anonymous HTTP cases plus persisted second-request/worker reads and side-effect receipts; for static/navigation sections retain destination/content assertions.","Source-mapped execution counters for the actual section functions/branches and links to required deployment/provider evidence; a source scan or page shell render never closes this work."] |
| interactionIds | [] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| mappingStatus | UNVERIFIED_SECTION_ASSIGNMENT: page-level complete ID inventories are retained below; map exact controls/contracts to this section before closing work. |

### Item read/delete and action controls

| Work field | Required detail |
| --- | --- |
| id | page-7af4f1aeb5f034dc/business-section-2 |
| status | UNVERIFIED |
| sourceFiles | ["client/src/pages/Notifications.tsx","client/src/components/notifications/NotificationItem.tsx","client/src/components/notifications/types.ts","client/src/lib/notificationAction.ts"] |
| sourceSectionCandidates | [{"file":"client/src/pages/Notifications.tsx","kind":"TabsTrigger","line":286,"name":"Unread {unreadCount > 0 && ( {unreadCount} )}","tabValue":"unread"}] |
| frontendWork | ["Use NotificationItem row and nested buttons without event-bubbling double actions; persist read/delete and safe target navigation across reload.","Exercise every source-linked field/control in this section, including emitted handlers and dynamic rows; resolve ambiguous section ownership before adding acceptance evidence."] |
| backendWork | ["Trace the actual API expressions listed in coverageOfSource to mounted handlers, middleware, schema and service; verify method/path, role/owner checks, durable state and error contracts.","Use knownFrontendContracts and knownBackendRoutes below; any absent/dynamic route mapping remains an explicit mapping task, never a presumed implemented endpoint."] |
| validationPermissionsSecurity | ["Filter all feed/bulk mutations byauthenticatedowner and validate action paths; keep priority icons distinguishable without color only."] |
| durableProviderGenerationJourneys | ["Read/delete/all-read/all-clear must persist and refresh cross-tab counters; delivery source events require separate business receipts."] |
| failureAccessibilityMobileI18nPerformance | ["Test nested click propagation, empty/categorized unread states, bulk failure, keyboard focus, relative-date localization and large-feed rendering."] |
| evidenceNeeded | ["Current-source component/browser case IDs for this named section with successful and adverse outcomes, keyboard/touch observations and exact state/payload assertions.","For declared mutations, retain owner/foreign-owner/anonymous HTTP cases plus persisted second-request/worker reads and side-effect receipts; for static/navigation sections retain destination/content assertions.","Source-mapped execution counters for the actual section functions/branches and links to required deployment/provider evidence; a source scan or page shell render never closes this work."] |
| interactionIds | [] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| mappingStatus | UNVERIFIED_SECTION_ASSIGNMENT: page-level complete ID inventories are retained below; map exact controls/contracts to this section before closing work. |

### Mark all read and clear all

| Work field | Required detail |
| --- | --- |
| id | page-7af4f1aeb5f034dc/business-section-3 |
| status | UNVERIFIED |
| sourceFiles | ["client/src/pages/Notifications.tsx","client/src/components/notifications/NotificationItem.tsx","client/src/components/notifications/types.ts","client/src/lib/notificationAction.ts"] |
| sourceSectionCandidates | [{"file":"client/src/pages/Notifications.tsx","kind":"TabsTrigger","line":286,"name":"Unread {unreadCount > 0 && ( {unreadCount} )}","tabValue":"unread"}] |
| frontendWork | ["Confirm destructive clear behavior, transaction/owner scope and cache reconciliation; handle failure without falsely zeroing durable unread state.","Exercise every source-linked field/control in this section, including emitted handlers and dynamic rows; resolve ambiguous section ownership before adding acceptance evidence."] |
| backendWork | ["Trace the actual API expressions listed in coverageOfSource to mounted handlers, middleware, schema and service; verify method/path, role/owner checks, durable state and error contracts.","Use knownFrontendContracts and knownBackendRoutes below; any absent/dynamic route mapping remains an explicit mapping task, never a presumed implemented endpoint."] |
| validationPermissionsSecurity | ["Filter all feed/bulk mutations byauthenticatedowner and validate action paths; keep priority icons distinguishable without color only."] |
| durableProviderGenerationJourneys | ["Read/delete/all-read/all-clear must persist and refresh cross-tab counters; delivery source events require separate business receipts."] |
| failureAccessibilityMobileI18nPerformance | ["Test nested click propagation, empty/categorized unread states, bulk failure, keyboard focus, relative-date localization and large-feed rendering."] |
| evidenceNeeded | ["Current-source component/browser case IDs for this named section with successful and adverse outcomes, keyboard/touch observations and exact state/payload assertions.","For declared mutations, retain owner/foreign-owner/anonymous HTTP cases plus persisted second-request/worker reads and side-effect receipts; for static/navigation sections retain destination/content assertions.","Source-mapped execution counters for the actual section functions/branches and links to required deployment/provider evidence; a source scan or page shell render never closes this work."] |
| interactionIds | [] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| mappingStatus | UNVERIFIED_SECTION_ASSIGNMENT: page-level complete ID inventories are retained below; map exact controls/contracts to this section before closing work. |

## Every control

| ID | Source | Tag/labels | Handlers | Status | Required checks |
| --- | --- | --- | --- | --- | --- |
| ui-02fb5e1aaab5c7c9 | client/src/components/offline/PendingChangesIndicator.tsx:179 | {"labels":{},"tag":"Button"} | [] | UNVERIFIED | ui-02fb5e1aaab5c7c9/control-behavior=UNVERIFIED; ui-02fb5e1aaab5c7c9/control-failure=UNVERIFIED |
| ui-05c73bbe7051147e | client/src/components/layout/Breadcrumb.tsx:169 | {"labels":{"data-testid":null,"href":null},"tag":"Link"} | [] | UNVERIFIED | ui-05c73bbe7051147e/control-behavior=UNVERIFIED; ui-05c73bbe7051147e/control-failure=UNVERIFIED |
| ui-09288376a7ab1304 | client/src/components/layout/Sidebar.tsx:338 | {"labels":{"data-testid":null,"href":null},"tag":"Link"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-09288376a7ab1304/control-behavior=UNVERIFIED; ui-09288376a7ab1304/control-failure=UNVERIFIED |
| ui-0959f9e08b8b3663 | client/src/components/notifications/NotificationCenter.tsx:521 | {"labels":{},"tag":"NotificationToastContainer"} | [{"event":"onDismiss","expressionKind":"Identifier","handler":"handleDismissToast"},{"event":"onMarkRead","expressionKind":"Identifier","handler":"handleToastRead"}] | UNVERIFIED | ui-0959f9e08b8b3663/control-behavior=UNVERIFIED; ui-0959f9e08b8b3663/control-failure=UNVERIFIED |
| ui-09b540e6b78df08d | client/src/components/layout/TopBar.tsx:40 | {"labels":{"aria-label":"Open navigation menu","data-testid":"mobile-menu-button"},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"onMenuClick"}] | UNVERIFIED | ui-09b540e6b78df08d/control-behavior=UNVERIFIED; ui-09b540e6b78df08d/control-failure=UNVERIFIED |
| ui-0b10e417bbea8507 | client/src/components/layout/Breadcrumb.tsx:149 | {"labels":{"data-testid":null,"href":null},"tag":"Link"} | [] | UNVERIFIED | ui-0b10e417bbea8507/control-behavior=UNVERIFIED; ui-0b10e417bbea8507/control-failure=UNVERIFIED |
| ui-0ba2a629dacc5a4e | client/src/components/notifications/NotificationCenter.tsx:370 | {"labels":{"data-testid":"mark-all-read-btn"},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-0ba2a629dacc5a4e/control-behavior=UNVERIFIED; ui-0ba2a629dacc5a4e/control-failure=UNVERIFIED |
| ui-0f63676b1efba992 | client/src/components/layout/TopBar.tsx:71 | {"labels":{},"tag":"Button"} | [] | UNVERIFIED | ui-0f63676b1efba992/control-behavior=UNVERIFIED; ui-0f63676b1efba992/control-failure=UNVERIFIED |
| ui-10a17ec9718ae282 | client/src/components/LanguageSwitcher.tsx:32 | {"labels":{},"tag":"Select"} | [{"event":"onValueChange","expressionKind":"Identifier","handler":"handleLanguageChange"}] | UNVERIFIED | ui-10a17ec9718ae282/control-behavior=UNVERIFIED; ui-10a17ec9718ae282/control-failure=UNVERIFIED |
| ui-147a7510c4c070cd | client/src/components/ui/theme-toggle.tsx:67 | {"labels":{},"tag":"DropdownMenuItem"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-147a7510c4c070cd/control-behavior=UNVERIFIED; ui-147a7510c4c070cd/control-failure=UNVERIFIED |
| ui-19351da557492895 | client/src/components/offline/PendingChangesIndicator.tsx:273 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleSync"}] | UNVERIFIED | ui-19351da557492895/control-behavior=UNVERIFIED; ui-19351da557492895/control-failure=UNVERIFIED |
| ui-27a8441a308cf701 | client/src/components/layout/Sidebar.tsx:382 | {"labels":{},"tag":"Link"} | [] | UNVERIFIED | ui-27a8441a308cf701/control-behavior=UNVERIFIED; ui-27a8441a308cf701/control-failure=UNVERIFIED |
| ui-2a334e7fe9e1f64a | client/src/components/notifications/NotificationCenter.tsx:328 | {"labels":{},"tag":"Popover"} | [{"event":"onOpenChange","expressionKind":"Identifier","handler":"setIsOpen"}] | UNVERIFIED | ui-2a334e7fe9e1f64a/control-behavior=UNVERIFIED; ui-2a334e7fe9e1f64a/control-failure=UNVERIFIED |
| ui-2b75ce276d7518e4 | client/src/components/notifications/NotificationToast.tsx:84 | {"labels":{"data-testid":null,"role":"alert"},"tag":"div"} | [{"event":"onMouseEnter","expressionKind":"ArrowFunction","handler":null},{"event":"onMouseLeave","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-2b75ce276d7518e4/control-behavior=UNVERIFIED; ui-2b75ce276d7518e4/control-failure=UNVERIFIED |
| ui-3828cf72f867bcb1 | client/src/components/layout/AppLayout.tsx:142 | {"labels":{},"tag":"MobileBottomNav"} | [{"event":"onMoreClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-3828cf72f867bcb1/control-behavior=UNVERIFIED; ui-3828cf72f867bcb1/control-failure=UNVERIFIED |
| ui-3ff76f68be9e58d7 | client/src/components/notifications/NotificationCenter.tsx:403 | {"labels":{},"tag":"Tabs"} | [{"event":"onValueChange","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-3ff76f68be9e58d7/control-behavior=UNVERIFIED; ui-3ff76f68be9e58d7/control-failure=UNVERIFIED |
| ui-4c70bc6f106bf5e8 | client/src/components/notifications/NotificationCenter.tsx:499 | {"labels":{"data-testid":"clear-all-btn"},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-4c70bc6f106bf5e8/control-behavior=UNVERIFIED; ui-4c70bc6f106bf5e8/control-failure=UNVERIFIED |
| ui-59e29d0517679d8a | client/src/components/notifications/NotificationCenter.tsx:491 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-59e29d0517679d8a/control-behavior=UNVERIFIED; ui-59e29d0517679d8a/control-failure=UNVERIFIED |
| ui-5dc5f6dc725b0714 | client/src/components/notifications/NotificationItem.tsx:341 | {"labels":{"aria-label":"Mark as read","data-testid":null},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleMarkAsRead"}] | UNVERIFIED | ui-5dc5f6dc725b0714/control-behavior=UNVERIFIED; ui-5dc5f6dc725b0714/control-failure=UNVERIFIED |
| ui-60c9c0e6145c26fa | client/src/components/offline/PendingChangesIndicator.tsx:177 | {"labels":{},"tag":"DropdownMenu"} | [{"event":"onOpenChange","expressionKind":"Identifier","handler":"setIsOpen"}] | UNVERIFIED | ui-60c9c0e6145c26fa/control-behavior=UNVERIFIED; ui-60c9c0e6145c26fa/control-failure=UNVERIFIED |
| ui-63e2d179d155f16b | client/src/components/ui/theme-toggle.tsx:53 | {"labels":{},"tag":"DropdownMenuItem"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-63e2d179d155f16b/control-behavior=UNVERIFIED; ui-63e2d179d155f16b/control-failure=UNVERIFIED |
| ui-660d292c53a1a27b | client/src/components/layout/MobileBottomNav.tsx:31 | {"labels":{"href":null},"tag":"Link"} | [] | UNVERIFIED | ui-660d292c53a1a27b/control-behavior=UNVERIFIED; ui-660d292c53a1a27b/control-failure=UNVERIFIED |
| ui-67c713adf99573ce | client/src/components/notifications/NotificationItem.tsx:352 | {"labels":{"aria-label":"Delete notification","data-testid":null},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleDelete"}] | UNVERIFIED | ui-67c713adf99573ce/control-behavior=UNVERIFIED; ui-67c713adf99573ce/control-failure=UNVERIFIED |
| ui-6868a26f3f09e2a9 | client/src/components/layout/TopBar.tsx:82 | {"labels":{"aria-label":null,"data-testid":"sign-out-button"},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleSignOut"}] | UNVERIFIED | ui-6868a26f3f09e2a9/control-behavior=UNVERIFIED; ui-6868a26f3f09e2a9/control-failure=UNVERIFIED |
| ui-6ba0c83dc62c067a | client/src/components/offline/PendingChangesIndicator.tsx:298 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-6ba0c83dc62c067a/control-behavior=UNVERIFIED; ui-6ba0c83dc62c067a/control-failure=UNVERIFIED |
| ui-6f05ab0e825accb5 | client/src/components/auth/AuthProvider.tsx:185 | {"labels":{"type":"button"},"tag":"button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-6f05ab0e825accb5/control-behavior=UNVERIFIED; ui-6f05ab0e825accb5/control-failure=UNVERIFIED |
| ui-6f4ae996df00adfa | client/src/pages/Notifications.tsx:238 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-6f4ae996df00adfa/control-behavior=UNVERIFIED; ui-6f4ae996df00adfa/control-failure=UNVERIFIED |
| ui-6fbecffd9578c892 | client/src/components/offline/PendingChangesIndicator.tsx:287 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleRetryFailed"}] | UNVERIFIED | ui-6fbecffd9578c892/control-behavior=UNVERIFIED; ui-6fbecffd9578c892/control-failure=UNVERIFIED |
| ui-78d565f7f7078b98 | client/src/components/offline/PendingChangesIndicator.tsx:250 | {"labels":{},"tag":"DropdownMenuItem"} | [] | UNVERIFIED | ui-78d565f7f7078b98/control-behavior=UNVERIFIED; ui-78d565f7f7078b98/control-failure=UNVERIFIED |
| ui-84245433268496bc | client/src/components/layout/AppLayout.tsx:55 | {"labels":{"href":"/pricing"},"tag":"a"} | [] | UNVERIFIED | ui-84245433268496bc/control-behavior=UNVERIFIED; ui-84245433268496bc/control-failure=UNVERIFIED |
| ui-87a4ca027697e750 | client/src/components/ui/theme-toggle.tsx:40 | {"labels":{"aria-label":null},"tag":"Button"} | [] | UNVERIFIED | ui-87a4ca027697e750/control-behavior=UNVERIFIED; ui-87a4ca027697e750/control-failure=UNVERIFIED |
| ui-949ed72b89c682cb | client/src/pages/Notifications.tsx:360 | {"labels":{},"tag":"NotificationItem"} | [{"event":"onMarkAsRead","expressionKind":"ArrowFunction","handler":null},{"event":"onDelete","expressionKind":"ArrowFunction","handler":null},{"event":"onNavigate","expressionKind":"Identifier","handler":"handleNavigate"}] | UNVERIFIED | ui-949ed72b89c682cb/control-behavior=UNVERIFIED; ui-949ed72b89c682cb/control-failure=UNVERIFIED |
| ui-975edfade3e58d49 | client/src/components/layout/AppLayout.tsx:101 | {"labels":{},"tag":"Sidebar"} | [{"event":"onMobileClose","expressionKind":"Identifier","handler":"closeMobileMenu"}] | UNVERIFIED | ui-975edfade3e58d49/control-behavior=UNVERIFIED; ui-975edfade3e58d49/control-failure=UNVERIFIED |
| ui-97f927a9cc40024e | client/src/components/layout/Breadcrumb.tsx:184 | {"labels":{"data-testid":null,"href":null},"tag":"Link"} | [] | UNVERIFIED | ui-97f927a9cc40024e/control-behavior=UNVERIFIED; ui-97f927a9cc40024e/control-failure=UNVERIFIED |
| ui-9ba320680f841e27 | client/src/pages/Notifications.tsx:277 | {"labels":{},"tag":"Tabs"} | [{"event":"onValueChange","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-9ba320680f841e27/control-behavior=UNVERIFIED; ui-9ba320680f841e27/control-failure=UNVERIFIED |
| ui-9ba6573d8f3d79ac | client/src/components/ui/theme-toggle.tsx:60 | {"labels":{},"tag":"DropdownMenuItem"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-9ba6573d8f3d79ac/control-behavior=UNVERIFIED; ui-9ba6573d8f3d79ac/control-failure=UNVERIFIED |
| ui-9ca2eb446c30ce51 | client/src/components/layout/TopBar.tsx:77 | {"labels":{"aria-label":"Settings","data-testid":"settings-button"},"tag":"Link"} | [] | UNVERIFIED | ui-9ca2eb446c30ce51/control-behavior=UNVERIFIED; ui-9ca2eb446c30ce51/control-failure=UNVERIFIED |
| ui-a051fac5c8352c75 | client/src/components/notifications/NotificationCenter.tsx:474 | {"labels":{},"tag":"NotificationItem"} | [{"event":"onMarkAsRead","expressionKind":"ArrowFunction","handler":null},{"event":"onDelete","expressionKind":"ArrowFunction","handler":null},{"event":"onNavigate","expressionKind":"Identifier","handler":"handleNavigate"}] | UNVERIFIED | ui-a051fac5c8352c75/control-behavior=UNVERIFIED; ui-a051fac5c8352c75/control-failure=UNVERIFIED |
| ui-a390d99ae55668d5 | client/src/pages/Notifications.tsx:251 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-a390d99ae55668d5/control-behavior=UNVERIFIED; ui-a390d99ae55668d5/control-failure=UNVERIFIED |
| ui-aa788eb9d2142629 | client/src/components/notifications/NotificationToast.tsx:147 | {"labels":{"data-testid":"toast-action"},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleAction"}] | UNVERIFIED | ui-aa788eb9d2142629/control-behavior=UNVERIFIED; ui-aa788eb9d2142629/control-failure=UNVERIFIED |
| ui-b067e9a48325de98 | client/src/components/layout/MobileBottomNav.tsx:47 | {"labels":{},"tag":"button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"onMoreClick"}] | UNVERIFIED | ui-b067e9a48325de98/control-behavior=UNVERIFIED; ui-b067e9a48325de98/control-failure=UNVERIFIED |
| ui-b371ddfc98bfbb10 | client/src/components/layout/Sidebar.tsx:250 | {"labels":{"aria-label":"Close sidebar","data-testid":"sidebar-overlay","role":"button"},"tag":"div"} | [{"event":"onClick","expressionKind":"Identifier","handler":"onMobileClose"},{"event":"onKeyDown","expressionKind":"ArrowFunction","handler":null},{"event":"onTouchEnd","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-b371ddfc98bfbb10/control-behavior=UNVERIFIED; ui-b371ddfc98bfbb10/control-failure=UNVERIFIED |
| ui-b43cc7e819219b5c | client/src/components/notifications/NotificationItem.tsx:323 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-b43cc7e819219b5c/control-behavior=UNVERIFIED; ui-b43cc7e819219b5c/control-failure=UNVERIFIED |
| ui-b72cc52a3e04a587 | client/src/components/layout/Sidebar.tsx:300 | {"labels":{"aria-label":"Close navigation menu","data-testid":"sidebar-close"},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"onMobileClose"}] | UNVERIFIED | ui-b72cc52a3e04a587/control-behavior=UNVERIFIED; ui-b72cc52a3e04a587/control-failure=UNVERIFIED |
| ui-c6223d6d483950f0 | client/src/pages/Notifications.tsx:266 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-c6223d6d483950f0/control-behavior=UNVERIFIED; ui-c6223d6d483950f0/control-failure=UNVERIFIED |
| ui-c650988c8661dc69 | client/src/components/notifications/NotificationItem.tsx:260 | {"labels":{"data-testid":null,"role":"button"},"tag":"div"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleClick"},{"event":"onKeyDown","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-c650988c8661dc69/control-behavior=UNVERIFIED; ui-c650988c8661dc69/control-failure=UNVERIFIED |
| ui-cba895665a9c6e60 | client/src/components/LanguageSwitcher.tsx:42 | {"labels":{},"tag":"SelectItem"} | [] | UNVERIFIED | ui-cba895665a9c6e60/control-behavior=UNVERIFIED; ui-cba895665a9c6e60/control-failure=UNVERIFIED |
| ui-cf2b58eec584dae4 | client/src/components/notifications/NotificationCenter.tsx:387 | {"labels":{"data-testid":"notification-settings-btn"},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-cf2b58eec584dae4/control-behavior=UNVERIFIED; ui-cf2b58eec584dae4/control-failure=UNVERIFIED |
| ui-d0d9ca11329dc60e | client/src/components/layout/AppLayout.tsx:108 | {"labels":{},"tag":"TopBar"} | [{"event":"onMenuClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-d0d9ca11329dc60e/control-behavior=UNVERIFIED; ui-d0d9ca11329dc60e/control-failure=UNVERIFIED |
| ui-dd275739e07f5a9a | client/src/pages/Notifications.tsx:221 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-dd275739e07f5a9a/control-behavior=UNVERIFIED; ui-dd275739e07f5a9a/control-failure=UNVERIFIED |
| ui-e149798fdf5cac49 | client/src/components/layout/Breadcrumb.tsx:217 | {"labels":{"data-testid":null,"href":null},"tag":"Link"} | [] | UNVERIFIED | ui-e149798fdf5cac49/control-behavior=UNVERIFIED; ui-e149798fdf5cac49/control-failure=UNVERIFIED |
| ui-e498f929cdb7d24b | client/src/pages/Notifications.tsx:339 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-e498f929cdb7d24b/control-behavior=UNVERIFIED; ui-e498f929cdb7d24b/control-failure=UNVERIFIED |
| ui-f202dbb108e7e48f | client/src/components/notifications/NotificationToast.tsx:212 | {"labels":{},"tag":"NotificationToast"} | [{"event":"onDismiss","expressionKind":"Identifier","handler":"onDismiss"},{"event":"onMarkRead","expressionKind":"Identifier","handler":"onMarkRead"}] | UNVERIFIED | ui-f202dbb108e7e48f/control-behavior=UNVERIFIED; ui-f202dbb108e7e48f/control-failure=UNVERIFIED |
| ui-f9f1315309a3abbb | client/src/components/notifications/NotificationCenter.tsx:330 | {"labels":{"aria-label":null,"data-testid":"notification-center-trigger"},"tag":"Button"} | [] | UNVERIFIED | ui-f9f1315309a3abbb/control-behavior=UNVERIFIED; ui-f9f1315309a3abbb/control-failure=UNVERIFIED |
| ui-fd41b29f3d2b1fab | client/src/components/notifications/NotificationToast.tsx:128 | {"labels":{"aria-label":"Dismiss notification","data-testid":"dismiss-toast"},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleDismiss"}] | UNVERIFIED | ui-fd41b29f3d2b1fab/control-behavior=UNVERIFIED; ui-fd41b29f3d2b1fab/control-failure=UNVERIFIED |

For every control execute its control-behavior and control-failure acceptance from the global required-check ledger; cover keyboard/mobile, input validation, loading/error/retry, authorization and the real side effect.

## Every frontend API contract

| ID | Method/path | Source | Topology | Backend IDs | Behavior acceptance |
| --- | --- | --- | --- | --- | --- |
| call-0f045f80943d4c48 | POST /api/auth/register | client/src/components/auth/AuthProvider.tsx:148 | matched | ["api-1a2231268bd1fc57"] | UNVERIFIED |
| call-14e7a921cb488164 | PUT /api/auth/preferences | client/src/lib/preferenceWrites.ts:14 | matched | ["api-86e7b60426904482"] | UNVERIFIED |
| call-1a25405e3a71d413 | POST /api/auth/login | client/src/components/auth/AuthProvider.tsx:132 | matched | ["api-9901ca9416b5f43b"] | UNVERIFIED |
| call-29aea1f08af7e088 | GET /api/auth/preferences | client/src/components/auth/AuthProvider.tsx:68 | matched | ["api-d29e42a77351fe87"] | UNVERIFIED |
| call-29ff873da0a56983 | PUT /api/notifications/mark-all-read | client/src/components/notifications/NotificationCenter.tsx:251 | matched | ["api-90e8fe0c684b7fc3"] | UNVERIFIED |
| call-786f4741b5b20d32 | DELETE /api/notifications/clear-all | client/src/components/notifications/NotificationCenter.tsx:293 | matched | ["api-79806241e7837847","api-b5765bd71835678e"] | UNVERIFIED |
| call-96046eae71eeec35 | GET /api/notifications | client/src/components/notifications/NotificationCenter.tsx:150 | matched | ["api-1c1e6f62b55d1d41"] | UNVERIFIED |
| call-c5c1e9f24259778b | PUT /api/notifications/:param/read | client/src/components/notifications/NotificationCenter.tsx:224 | matched | ["api-748719b2ffc698f2"] | UNVERIFIED |
| call-cb860b04fe41fe4d | POST /api/auth/logout | client/src/components/auth/AuthProvider.tsx:159 | matched | ["api-ada499737fe455a9"] | UNVERIFIED |
| call-e50428bcbbb5a563 | GET /api/notifications/preferences | client/src/components/notifications/NotificationCenter.tsx:157 | matched | ["api-a98bdf4156c16cc6"] | UNVERIFIED |
| call-e655004b3be38ccf | DELETE /api/notifications/:param | client/src/components/notifications/NotificationCenter.tsx:266 | matched | ["api-2fcdf83c64884073","api-79806241e7837847","api-7f36d87c329f443f","api-b5765bd71835678e"] | UNVERIFIED |
| call-e8522d80c7b64747 | POST /api/sync/batch | client/src/lib/offline/SyncManager.ts:298 | matched | ["api-2bc47d91358c2c72"] | UNVERIFIED |
| call-f4d5de16a940565d | POST /api/sync/receipts | client/src/lib/offline/SyncManager.ts:386 | matched | ["api-7c8878c0bdcf5f2f"] | UNVERIFIED |

Trace each request to its actual process/mount, assert exact response/error/permission behavior and prove persistence after reload or another worker.

## Every mapped backend registration

| ID | Method/path | Source | Process/mount | Status | Required checks |
| --- | --- | --- | --- | --- | --- |
| api-1a2231268bd1fc57 | POST /api/auth/register | server/routes.ts:318 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-1a2231268bd1fc57/response-contract=UNVERIFIED; api-1a2231268bd1fc57/access-policy=UNVERIFIED; api-1a2231268bd1fc57/input-boundaries=UNVERIFIED; api-1a2231268bd1fc57/tenant-boundary=UNVERIFIED; api-1a2231268bd1fc57/dependency-failure=UNVERIFIED; api-1a2231268bd1fc57/mutation-durability=UNVERIFIED |
| api-1c1e6f62b55d1d41 | GET /api/notifications | server/routes.ts:3099 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-1c1e6f62b55d1d41/response-contract=UNVERIFIED; api-1c1e6f62b55d1d41/access-policy=UNVERIFIED; api-1c1e6f62b55d1d41/input-boundaries=UNVERIFIED; api-1c1e6f62b55d1d41/tenant-boundary=UNVERIFIED; api-1c1e6f62b55d1d41/dependency-failure=UNVERIFIED |
| api-2bc47d91358c2c72 | POST /api/sync/batch | server/routes/sync.ts:357 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-2bc47d91358c2c72/response-contract=UNVERIFIED; api-2bc47d91358c2c72/access-policy=UNVERIFIED; api-2bc47d91358c2c72/input-boundaries=UNVERIFIED; api-2bc47d91358c2c72/tenant-boundary=UNVERIFIED; api-2bc47d91358c2c72/dependency-failure=UNVERIFIED; api-2bc47d91358c2c72/mutation-durability=UNVERIFIED |
| api-2fcdf83c64884073 | DELETE /api/notifications/push-subscriptions | server/routes.ts:3651 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-2fcdf83c64884073/response-contract=UNVERIFIED; api-2fcdf83c64884073/access-policy=UNVERIFIED; api-2fcdf83c64884073/input-boundaries=UNVERIFIED; api-2fcdf83c64884073/tenant-boundary=UNVERIFIED; api-2fcdf83c64884073/dependency-failure=UNVERIFIED; api-2fcdf83c64884073/mutation-durability=UNVERIFIED; api-2fcdf83c64884073/deletion-durability=UNVERIFIED |
| api-748719b2ffc698f2 | PUT /api/notifications/:id/read | server/routes.ts:3119 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-748719b2ffc698f2/response-contract=UNVERIFIED; api-748719b2ffc698f2/access-policy=UNVERIFIED; api-748719b2ffc698f2/input-boundaries=UNVERIFIED; api-748719b2ffc698f2/tenant-boundary=UNVERIFIED; api-748719b2ffc698f2/dependency-failure=UNVERIFIED; api-748719b2ffc698f2/mutation-durability=UNVERIFIED |
| api-79806241e7837847 | DELETE /api/notifications/clear-all | server/routes.ts:3163 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-79806241e7837847/response-contract=UNVERIFIED; api-79806241e7837847/access-policy=UNVERIFIED; api-79806241e7837847/input-boundaries=UNVERIFIED; api-79806241e7837847/tenant-boundary=UNVERIFIED; api-79806241e7837847/dependency-failure=UNVERIFIED; api-79806241e7837847/mutation-durability=UNVERIFIED; api-79806241e7837847/deletion-durability=UNVERIFIED |
| api-7c8878c0bdcf5f2f | POST /api/sync/receipts | server/routes/sync.ts:446 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-7c8878c0bdcf5f2f/response-contract=UNVERIFIED; api-7c8878c0bdcf5f2f/access-policy=UNVERIFIED; api-7c8878c0bdcf5f2f/input-boundaries=UNVERIFIED; api-7c8878c0bdcf5f2f/tenant-boundary=UNVERIFIED; api-7c8878c0bdcf5f2f/dependency-failure=UNVERIFIED; api-7c8878c0bdcf5f2f/mutation-durability=UNVERIFIED |
| api-7f36d87c329f443f | DELETE /api/notifications/mobile-tokens | server/routes.ts:3182 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-7f36d87c329f443f/response-contract=UNVERIFIED; api-7f36d87c329f443f/access-policy=UNVERIFIED; api-7f36d87c329f443f/input-boundaries=UNVERIFIED; api-7f36d87c329f443f/tenant-boundary=UNVERIFIED; api-7f36d87c329f443f/dependency-failure=UNVERIFIED; api-7f36d87c329f443f/mutation-durability=UNVERIFIED; api-7f36d87c329f443f/deletion-durability=UNVERIFIED |
| api-86e7b60426904482 | PUT /api/auth/preferences | server/routes.ts:909 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-86e7b60426904482/response-contract=UNVERIFIED; api-86e7b60426904482/access-policy=UNVERIFIED; api-86e7b60426904482/input-boundaries=UNVERIFIED; api-86e7b60426904482/tenant-boundary=UNVERIFIED; api-86e7b60426904482/dependency-failure=UNVERIFIED; api-86e7b60426904482/mutation-durability=UNVERIFIED |
| api-90e8fe0c684b7fc3 | PUT /api/notifications/mark-all-read | server/routes.ts:3146 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-90e8fe0c684b7fc3/response-contract=UNVERIFIED; api-90e8fe0c684b7fc3/access-policy=UNVERIFIED; api-90e8fe0c684b7fc3/input-boundaries=UNVERIFIED; api-90e8fe0c684b7fc3/tenant-boundary=UNVERIFIED; api-90e8fe0c684b7fc3/dependency-failure=UNVERIFIED; api-90e8fe0c684b7fc3/mutation-durability=UNVERIFIED |
| api-9901ca9416b5f43b | POST /api/auth/login | server/routes.ts:485 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-9901ca9416b5f43b/response-contract=UNVERIFIED; api-9901ca9416b5f43b/access-policy=UNVERIFIED; api-9901ca9416b5f43b/input-boundaries=UNVERIFIED; api-9901ca9416b5f43b/tenant-boundary=UNVERIFIED; api-9901ca9416b5f43b/dependency-failure=UNVERIFIED; api-9901ca9416b5f43b/mutation-durability=UNVERIFIED |
| api-a98bdf4156c16cc6 | GET /api/notifications/preferences | server/routes.ts:3374 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-a98bdf4156c16cc6/response-contract=UNVERIFIED; api-a98bdf4156c16cc6/access-policy=UNVERIFIED; api-a98bdf4156c16cc6/input-boundaries=UNVERIFIED; api-a98bdf4156c16cc6/tenant-boundary=UNVERIFIED; api-a98bdf4156c16cc6/dependency-failure=UNVERIFIED |
| api-ada499737fe455a9 | POST /api/auth/logout | server/routes.ts:633 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-ada499737fe455a9/response-contract=UNVERIFIED; api-ada499737fe455a9/access-policy=UNVERIFIED; api-ada499737fe455a9/input-boundaries=UNVERIFIED; api-ada499737fe455a9/tenant-boundary=UNVERIFIED; api-ada499737fe455a9/dependency-failure=UNVERIFIED; api-ada499737fe455a9/mutation-durability=UNVERIFIED |
| api-b5765bd71835678e | DELETE /api/notifications/:id | server/routes.ts:3217 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-b5765bd71835678e/response-contract=UNVERIFIED; api-b5765bd71835678e/access-policy=UNVERIFIED; api-b5765bd71835678e/input-boundaries=UNVERIFIED; api-b5765bd71835678e/tenant-boundary=UNVERIFIED; api-b5765bd71835678e/dependency-failure=UNVERIFIED; api-b5765bd71835678e/mutation-durability=UNVERIFIED; api-b5765bd71835678e/deletion-durability=UNVERIFIED |
| api-d29e42a77351fe87 | GET /api/auth/preferences | server/routes.ts:889 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-d29e42a77351fe87/response-contract=UNVERIFIED; api-d29e42a77351fe87/access-policy=UNVERIFIED; api-d29e42a77351fe87/input-boundaries=UNVERIFIED; api-d29e42a77351fe87/tenant-boundary=UNVERIFIED; api-d29e42a77351fe87/dependency-failure=UNVERIFIED |

Exercise successful/adverse HTTP contracts, cross-owner denial, input boundaries, dependency failure, durable mutation/deletion and callback/artifact/readiness checks exactly as assigned. Standalone or unresolved processes need their own harness.

## Exact source reachability and test instructions

```json
{
  "reachableSourceFiles": [
    "built-in plugins dsp/BasePlugin.ts",
    "built-in plugins dsp/EQPlugin.ts",
    "client/src/components/LanguageSwitcher.tsx",
    "client/src/components/auth/AuthProvider.tsx",
    "client/src/components/layout/AppLayout.tsx",
    "client/src/components/layout/Breadcrumb.tsx",
    "client/src/components/layout/MobileBottomNav.tsx",
    "client/src/components/layout/Sidebar.tsx",
    "client/src/components/layout/TopBar.tsx",
    "client/src/components/notifications/NotificationBadge.tsx",
    "client/src/components/notifications/NotificationCenter.tsx",
    "client/src/components/notifications/NotificationItem.tsx",
    "client/src/components/notifications/NotificationToast.tsx",
    "client/src/components/notifications/types.ts",
    "client/src/components/offline/PendingChangesIndicator.tsx",
    "client/src/components/ui/badge.tsx",
    "client/src/components/ui/breadcrumb.tsx",
    "client/src/components/ui/button.tsx",
    "client/src/components/ui/card.tsx",
    "client/src/components/ui/dropdown-menu.tsx",
    "client/src/components/ui/popover.tsx",
    "client/src/components/ui/scroll-area.tsx",
    "client/src/components/ui/select.tsx",
    "client/src/components/ui/separator.tsx",
    "client/src/components/ui/tabs.tsx",
    "client/src/components/ui/theme-toggle.tsx",
    "client/src/components/ui/toast.tsx",
    "client/src/components/ui/tooltip.tsx",
    "client/src/contexts/ThemeContext.tsx",
    "client/src/hooks/use-toast.ts",
    "client/src/hooks/useAuth.ts",
    "client/src/hooks/useFluidLayout.ts",
    "client/src/hooks/useOfflineStatus.ts",
    "client/src/hooks/useRequireAuth.ts",
    "client/src/hooks/useWebSocket.ts",
    "client/src/lib/audio/PluginHost.ts",
    "client/src/lib/authenticationBoundary.ts",
    "client/src/lib/daw/AudioWorkletEngine.ts",
    "client/src/lib/daw/TrackPluginChain.ts",
    "client/src/lib/errorService.ts",
    "client/src/lib/idbPersister.ts",
    "client/src/lib/logger.ts",
    "client/src/lib/notificationAction.ts",
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
    "client/src/pages/Notifications.tsx",
    "client/src/stores/studioStore.ts",
    "shared/schema.ts"
  ],
  "addTest": {
    "suggestedPath": "tests/browser/notifications-acceptance.test.mjs",
    "command": "node --import tsx --test tests/browser/notifications-acceptance.test.mjs",
    "cwd": ".",
    "instructions": "Implement the named behavioral assertions using disposable fixtures, then map exact passing case identities in the acceptance map; source associations alone never close a check.",
    "fixtureTemplate": "browser-page"
  },
  "testCandidates": []
}
```

The complete machine ledger retains original evidence/details and global controls, unmapped routes, source coverage and non-JS/desktop/native lanes. See [platform index](../platform-completion-plan.md).
