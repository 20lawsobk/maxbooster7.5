# 09. /simplified-dashboard — SimplifiedDashboard

Generated; edit the generator or source business-section supplements and regenerate. Inventory inclusion is not test passage.

Declaration `page-dc3bfa7924ddde50`; source `client/src/pages/SimplifiedDashboard.tsx:1`; registration `{"file":"client/src/App.tsx","line":213}`; status **UNVERIFIED**.

## Page acceptance

| Check | Status | Exact acceptance |
| --- | --- | --- |
| page-dc3bfa7924ddde50/page-states | UNVERIFIED | Exercise this page's actual loading, empty, error/retry and successful states, including navigation and reload. |
| page-dc3bfa7924ddde50/page-access | UNVERIFIED | Verify the page's declared public/authenticated/admin access policy and cross-user resource boundary. |
| page-dc3bfa7924ddde50/page-persistence | UNVERIFIED | Submit applicable page actions, verify the corresponding backend result, and reload to confirm durable state; verify failed writes do not show success. |

Implement each exact check, then map current passing case identities and source hashes. Keep missing prerequisites and external delivery explicitly unverified.

## All business sections

| Page work/provenance field | Required detail |
| --- | --- |
| ordinal | 9 |
| id | page-dc3bfa7924ddde50 |
| path | /simplified-dashboard |
| component | SimplifiedDashboard |
| source | {"file":"client/src/pages/SimplifiedDashboard.tsx","line":1} |
| registration | {"file":"client/src/App.tsx","line":213} |
| status | UNVERIFIED |
| businessJourneyWork | Exercise onboarding-status choices, simplified quick actions, getting-started progress, activity and full-dashboard transition; verify preference persistence and route/auth behavior on a fresh session. |
| routeSpecificWork | Verify this exact registered path, direct navigation, reload, auth transition and unknown/malformed parameters; do not reuse another path’s result as automatic alias acceptance. |
| coverageOfSource | {"additionalReachableAuditWork":["built-in plugins dsp/BasePlugin.ts","built-in plugins dsp/EQPlugin.ts","client/src/components/LanguageSwitcher.tsx","client/src/components/auth/AuthProvider.tsx","client/src/components/dashboard/dashboardDataContracts.ts","client/src/components/layout/Breadcrumb.tsx","client/src/components/layout/MobileBottomNav.tsx","client/src/components/layout/Sidebar.tsx","client/src/components/layout/TopBar.tsx","client/src/components/notifications/NotificationBadge.tsx","client/src/components/notifications/NotificationCenter.tsx","client/src/components/notifications/NotificationItem.tsx","client/src/components/notifications/NotificationToast.tsx","client/src/components/notifications/types.ts","client/src/components/offline/PendingChangesIndicator.tsx","client/src/components/ui/badge.tsx","client/src/components/ui/breadcrumb.tsx","client/src/components/ui/button.tsx","client/src/components/ui/card.tsx","client/src/components/ui/dropdown-menu.tsx","client/src/components/ui/popover.tsx","client/src/components/ui/progress.tsx","client/src/components/ui/scroll-area.tsx","client/src/components/ui/select.tsx","client/src/components/ui/separator.tsx","client/src/components/ui/tabs.tsx","client/src/components/ui/theme-toggle.tsx","client/src/components/ui/toast.tsx","client/src/components/ui/tooltip.tsx","client/src/contexts/ThemeContext.tsx","client/src/hooks/use-toast.ts","client/src/hooks/useAuth.ts","client/src/hooks/useFluidLayout.ts","client/src/hooks/useOfflineStatus.ts","client/src/hooks/useRequireAuth.ts","client/src/hooks/useWebSocket.ts","client/src/lib/audio/PluginHost.ts","client/src/lib/authenticationBoundary.ts","client/src/lib/daw/AudioWorkletEngine.ts","client/src/lib/daw/TrackPluginChain.ts","client/src/lib/errorService.ts","client/src/lib/idbPersister.ts","client/src/lib/logger.ts","client/src/lib/notificationAction.ts","client/src/lib/offline/DraftStorage.ts","client/src/lib/offline/OfflineCache.ts","client/src/lib/offline/OfflineQueue.ts","client/src/lib/offline/SyncManager.ts","client/src/lib/offline/accountCoordinator.ts","client/src/lib/offline/accountLocalStorage.ts","client/src/lib/offline/identity.ts","client/src/lib/offline/index.ts","client/src/lib/offline/operationFingerprint.ts","client/src/lib/offline/studioOfflineLifecycle.ts","client/src/lib/onboardingMode.ts","client/src/lib/preferenceWrites.ts","client/src/lib/queryClient.ts","client/src/lib/sessionProbe.ts","client/src/lib/studioLayoutStore.ts","client/src/lib/utils.ts","client/src/stores/studioStore.ts","shared/schema.ts"],"inspectedJsxSourceFiles":[{"file":"client/src/pages/SimplifiedDashboard.tsx","lineCount":115,"sha256":"c0ad5dddfdcb9b0291bcf6e00c8d9e6d577dadbc738d407f4ea20a431e50f79b"},{"file":"client/src/components/layout/AppLayout.tsx","lineCount":146,"sha256":"783a4fd28f85506c1639adc157c65c53bf7e60f1826c431be3a1b39f332f9eb3"},{"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","lineCount":404,"sha256":"a24483c0348f9f6330fc290fb4d8bc044f43b3a617773efea3c10ed898785f02"}],"registeredReachableSourceFiles":["built-in plugins dsp/BasePlugin.ts","built-in plugins dsp/EQPlugin.ts","client/src/components/LanguageSwitcher.tsx","client/src/components/auth/AuthProvider.tsx","client/src/components/dashboard/dashboardDataContracts.ts","client/src/components/layout/AppLayout.tsx","client/src/components/layout/Breadcrumb.tsx","client/src/components/layout/MobileBottomNav.tsx","client/src/components/layout/Sidebar.tsx","client/src/components/layout/TopBar.tsx","client/src/components/notifications/NotificationBadge.tsx","client/src/components/notifications/NotificationCenter.tsx","client/src/components/notifications/NotificationItem.tsx","client/src/components/notifications/NotificationToast.tsx","client/src/components/notifications/types.ts","client/src/components/offline/PendingChangesIndicator.tsx","client/src/components/onboarding/SimplifiedDashboard.tsx","client/src/components/ui/badge.tsx","client/src/components/ui/breadcrumb.tsx","client/src/components/ui/button.tsx","client/src/components/ui/card.tsx","client/src/components/ui/dropdown-menu.tsx","client/src/components/ui/popover.tsx","client/src/components/ui/progress.tsx","client/src/components/ui/scroll-area.tsx","client/src/components/ui/select.tsx","client/src/components/ui/separator.tsx","client/src/components/ui/tabs.tsx","client/src/components/ui/theme-toggle.tsx","client/src/components/ui/toast.tsx","client/src/components/ui/tooltip.tsx","client/src/contexts/ThemeContext.tsx","client/src/hooks/use-toast.ts","client/src/hooks/useAuth.ts","client/src/hooks/useFluidLayout.ts","client/src/hooks/useOfflineStatus.ts","client/src/hooks/useRequireAuth.ts","client/src/hooks/useWebSocket.ts","client/src/lib/audio/PluginHost.ts","client/src/lib/authenticationBoundary.ts","client/src/lib/daw/AudioWorkletEngine.ts","client/src/lib/daw/TrackPluginChain.ts","client/src/lib/errorService.ts","client/src/lib/idbPersister.ts","client/src/lib/logger.ts","client/src/lib/notificationAction.ts","client/src/lib/offline/DraftStorage.ts","client/src/lib/offline/OfflineCache.ts","client/src/lib/offline/OfflineQueue.ts","client/src/lib/offline/SyncManager.ts","client/src/lib/offline/accountCoordinator.ts","client/src/lib/offline/accountLocalStorage.ts","client/src/lib/offline/identity.ts","client/src/lib/offline/index.ts","client/src/lib/offline/operationFingerprint.ts","client/src/lib/offline/studioOfflineLifecycle.ts","client/src/lib/onboardingMode.ts","client/src/lib/preferenceWrites.ts","client/src/lib/queryClient.ts","client/src/lib/sessionProbe.ts","client/src/lib/studioLayoutStore.ts","client/src/lib/utils.ts","client/src/pages/SimplifiedDashboard.tsx","client/src/stores/studioStore.ts","shared/schema.ts"],"scope":"Actual AST source sections and complete-control modules, transparent reexports and recursively rendered domain components. Shared UI/layout internals, hooks/services/libs, runtime conditional branches and unresolved dynamic bindings remain explicit register-wide audit work; this is a plan, not completed execution.","sourceControlsEnumerated":9,"sourceSectionsEnumerated":11} |
| evidenceReferences | [{"path":"reports/test-verification/history/2026-10-26-integrated-before-rechecks/README.md","scope":"Historical integrated scopes and failures; does not close this section."},{"path":"reports/release-rehearsal/2026-10-27-final/summary.json","scope":"Prepared portable cold startup only; productionReady remains false."}] |
| analysisSourceFreshness | {"checkedFiles":3,"meaning":"Source-analysis freshness only; not behavioral execution evidence.","staleSourceFiles":[],"status":"SOURCE_HASHES_MATCH","unavailableSourceFiles":[]} |

### SimplifiedDashboard complete controls, state, rendered children and API bindings — SimplifiedDashboard:1

| Work field | Required detail |
| --- | --- |
| id | section-3462014deeb0cf14 |
| kind | complete-module |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":115,"file":"client/src/pages/SimplifiedDashboard.tsx","line":1}] |
| frontendWork | ["Exercise every rendered control and conditional state in SimplifiedDashboard complete controls, state, rendered children and API bindings — SimplifiedDashboard:1; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 1 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [{"attributes":{},"source":{"file":"client/src/pages/SimplifiedDashboard.tsx","line":107},"tag":"SimplifiedDashboardComponent","text":""}] |
| interactionIds | ["ui-39c924f316fa2b11"] |
| frontendContractIds | ["call-510bfdc2f30f3a59"] |
| backendRouteIds | ["api-a54c9817ea044f10"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### AppLayout complete controls, state, rendered children and API bindings — AppLayout:1

| Work field | Required detail |
| --- | --- |
| id | section-3a1b16f554e23df2 |
| kind | complete-module |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":146,"file":"client/src/components/layout/AppLayout.tsx","line":1}] |
| frontendWork | ["Exercise every rendered control and conditional state in AppLayout complete controls, state, rendered children and API bindings — AppLayout:1; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 4 source controls enumerated for this section."] |
| backendWork | ["No frontend contract is currently statically linked from this module. Trace props, hooks, callbacks, template URLs, inherited clients and dynamic imports; explicitly establish any backend contract before closing this section.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [{"attributes":{"className":"\"underline font-semibold hover:text-amber-100\"","href":"\"/pricing\""},"source":{"file":"client/src/components/layout/AppLayout.tsx","line":55},"tag":"a","text":"Subscribe to unlock full access"},{"attributes":{},"source":{"file":"client/src/components/layout/AppLayout.tsx","line":100},"tag":"Sidebar","text":""},{"attributes":{},"source":{"file":"client/src/components/layout/AppLayout.tsx","line":107},"tag":"TopBar","text":""},{"attributes":{},"source":{"file":"client/src/components/layout/AppLayout.tsx","line":140},"tag":"MobileBottomNav","text":""}] |
| interactionIds | ["ui-84245433268496bc","ui-6328b98825213623","ui-a2d4f10a25f80786","ui-705fd60d835ea90e"] |
| frontendContractIds | [] |
| backendRouteIds | [] |
| apiBindingStatus | UNRESOLVED_OR_LOCAL_ONLY_REQUIRES_REVIEW |

### SimplifiedDashboard complete controls, state, rendered children and API bindings — SimplifiedDashboard:1

| Work field | Required detail |
| --- | --- |
| id | section-b171c65bc51275ea |
| kind | complete-module |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":404,"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":1}] |
| frontendWork | ["Exercise every rendered control and conditional state in SimplifiedDashboard complete controls, state, rendered children and API bindings — SimplifiedDashboard:1; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 4 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [{"attributes":{"className":"\"mt-4\"","onClick":"{() => void refetch()}","variant":"\"outline\""},"source":{"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":162},"tag":"Button","text":"Retry"},{"attributes":{"disabled":"{upgrading}","onClick":"{onUpgrade}","variant":"\"outline\""},"source":{"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":189},"tag":"Button","text":"{upgrading ? \"Enabling Full Mode…\" : \"Upgrade to Full Mode\"}"},{"attributes":{"className":"\"mt-3\"","onClick":"{() => setLocation(action.href)}","size":"\"sm\"","variant":"\"outline\""},"source":{"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":249},"tag":"Button","text":"Get Started"},{"attributes":{"className":"\"text-xs\"","onClick":"{() => setLocation(task.href)}","size":"\"sm\"","variant":"\"ghost\""},"source":{"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":305},"tag":"Button","text":"Get Started"}] |
| interactionIds | ["ui-e3140489bade506e","ui-92ff2656d59c1a42","ui-edf2849ec9c5472c","ui-9e8b48d9bfea4e81"] |
| frontendContractIds | ["call-dbf6d050a8e4b342"] |
| backendRouteIds | ["api-c5843e01128919e4"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### Welcome to Max Booster — SimplifiedDashboard:180

| Work field | Required detail |
| --- | --- |
| id | section-9cb49cbdd5b66123 |
| kind | h1 |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":182,"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":180}] |
| frontendWork | ["Exercise every rendered control and conditional state in Welcome to Max Booster — SimplifiedDashboard:180; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 0 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [] |
| interactionIds | [] |
| frontendContractIds | ["call-dbf6d050a8e4b342"] |
| backendRouteIds | ["api-c5843e01128919e4"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### Your Progress — SimplifiedDashboard:198

| Work field | Required detail |
| --- | --- |
| id | section-c814edc31fe4e425 |
| kind | CardTitle |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":201,"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":198}] |
| frontendWork | ["Exercise every rendered control and conditional state in Your Progress — SimplifiedDashboard:198; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 0 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [] |
| interactionIds | [] |
| frontendContractIds | ["call-dbf6d050a8e4b342"] |
| backendRouteIds | ["api-c5843e01128919e4"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### Quick Actions — SimplifiedDashboard:228

| Work field | Required detail |
| --- | --- |
| id | section-4b08446637d0ad94 |
| kind | CardTitle |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":228,"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":228}] |
| frontendWork | ["Exercise every rendered control and conditional state in Quick Actions — SimplifiedDashboard:228; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 0 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [] |
| interactionIds | [] |
| frontendContractIds | ["call-dbf6d050a8e4b342"] |
| backendRouteIds | ["api-c5843e01128919e4"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### {action.title} — SimplifiedDashboard:245

| Work field | Required detail |
| --- | --- |
| id | section-802e773d58a2a3f1 |
| kind | h3 |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":245,"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":245}] |
| frontendWork | ["Exercise every rendered control and conditional state in {action.title} — SimplifiedDashboard:245; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 0 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [] |
| interactionIds | [] |
| frontendContractIds | ["call-dbf6d050a8e4b342"] |
| backendRouteIds | ["api-c5843e01128919e4"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### Getting Started — SimplifiedDashboard:271

| Work field | Required detail |
| --- | --- |
| id | section-42ed5c45f67ae776 |
| kind | CardTitle |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":271,"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":271}] |
| frontendWork | ["Exercise every rendered control and conditional state in Getting Started — SimplifiedDashboard:271; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 0 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [] |
| interactionIds | [] |
| frontendContractIds | ["call-dbf6d050a8e4b342"] |
| backendRouteIds | ["api-c5843e01128919e4"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### {task.title} — SimplifiedDashboard:296

| Work field | Required detail |
| --- | --- |
| id | section-9c659b0181d93361 |
| kind | h4 |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":296,"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":296}] |
| frontendWork | ["Exercise every rendered control and conditional state in {task.title} — SimplifiedDashboard:296; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 0 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [] |
| interactionIds | [] |
| frontendContractIds | ["call-dbf6d050a8e4b342"] |
| backendRouteIds | ["api-c5843e01128919e4"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### Recent Activity — SimplifiedDashboard:327

| Work field | Required detail |
| --- | --- |
| id | section-d26834bdf2ec0670 |
| kind | CardTitle |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":327,"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":327}] |
| frontendWork | ["Exercise every rendered control and conditional state in Recent Activity — SimplifiedDashboard:327; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 0 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [] |
| interactionIds | [] |
| frontendContractIds | ["call-dbf6d050a8e4b342"] |
| backendRouteIds | ["api-c5843e01128919e4"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### Pro Tips — SimplifiedDashboard:365

| Work field | Required detail |
| --- | --- |
| id | section-9c91bc490a7c38df |
| kind | CardTitle |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":368,"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":365}] |
| frontendWork | ["Exercise every rendered control and conditional state in Pro Tips — SimplifiedDashboard:365; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 0 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [] |
| interactionIds | [] |
| frontendContractIds | ["call-dbf6d050a8e4b342"] |
| backendRouteIds | ["api-c5843e01128919e4"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### 🎵 Start with Distribution — SimplifiedDashboard:373

| Work field | Required detail |
| --- | --- |
| id | section-5d866ad1aa9e1af5 |
| kind | h4 |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":375,"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":373}] |
| frontendWork | ["Exercise every rendered control and conditional state in 🎵 Start with Distribution — SimplifiedDashboard:373; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 0 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [] |
| interactionIds | [] |
| frontendContractIds | ["call-dbf6d050a8e4b342"] |
| backendRouteIds | ["api-c5843e01128919e4"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### 🤖 Review AI Drafts — SimplifiedDashboard:382

| Work field | Required detail |
| --- | --- |
| id | section-ce006cb0ae3ee864 |
| kind | h4 |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":382,"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":382}] |
| frontendWork | ["Exercise every rendered control and conditional state in 🤖 Review AI Drafts — SimplifiedDashboard:382; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 0 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [] |
| interactionIds | [] |
| frontendContractIds | ["call-dbf6d050a8e4b342"] |
| backendRouteIds | ["api-c5843e01128919e4"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### 📈 Track Your Progress — SimplifiedDashboard:389

| Work field | Required detail |
| --- | --- |
| id | section-0843731464543dbd |
| kind | h4 |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":391,"file":"client/src/components/onboarding/SimplifiedDashboard.tsx","line":389}] |
| frontendWork | ["Exercise every rendered control and conditional state in 📈 Track Your Progress — SimplifiedDashboard:389; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 0 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [] |
| interactionIds | [] |
| frontendContractIds | ["call-dbf6d050a8e4b342"] |
| backendRouteIds | ["api-c5843e01128919e4"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

## Every control

| ID | Source | Tag/labels | Handlers | Status | Required checks |
| --- | --- | --- | --- | --- | --- |
| ui-02fb5e1aaab5c7c9 | client/src/components/offline/PendingChangesIndicator.tsx:179 | {"labels":{},"tag":"Button"} | [] | UNVERIFIED | ui-02fb5e1aaab5c7c9/control-behavior=UNVERIFIED; ui-02fb5e1aaab5c7c9/control-failure=UNVERIFIED |
| ui-05c73bbe7051147e | client/src/components/layout/Breadcrumb.tsx:169 | {"labels":{"data-testid":null,"href":null},"tag":"Link"} | [] | UNVERIFIED | ui-05c73bbe7051147e/control-behavior=UNVERIFIED; ui-05c73bbe7051147e/control-failure=UNVERIFIED |
| ui-0959f9e08b8b3663 | client/src/components/notifications/NotificationCenter.tsx:521 | {"labels":{},"tag":"NotificationToastContainer"} | [{"event":"onDismiss","expressionKind":"Identifier","handler":"handleDismissToast"},{"event":"onMarkRead","expressionKind":"Identifier","handler":"handleToastRead"}] | UNVERIFIED | ui-0959f9e08b8b3663/control-behavior=UNVERIFIED; ui-0959f9e08b8b3663/control-failure=UNVERIFIED |
| ui-0b10e417bbea8507 | client/src/components/layout/Breadcrumb.tsx:149 | {"labels":{"data-testid":null,"href":null},"tag":"Link"} | [] | UNVERIFIED | ui-0b10e417bbea8507/control-behavior=UNVERIFIED; ui-0b10e417bbea8507/control-failure=UNVERIFIED |
| ui-0ba2a629dacc5a4e | client/src/components/notifications/NotificationCenter.tsx:370 | {"labels":{"data-testid":"mark-all-read-btn"},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-0ba2a629dacc5a4e/control-behavior=UNVERIFIED; ui-0ba2a629dacc5a4e/control-failure=UNVERIFIED |
| ui-10a17ec9718ae282 | client/src/components/LanguageSwitcher.tsx:32 | {"labels":{},"tag":"Select"} | [{"event":"onValueChange","expressionKind":"Identifier","handler":"handleLanguageChange"}] | UNVERIFIED | ui-10a17ec9718ae282/control-behavior=UNVERIFIED; ui-10a17ec9718ae282/control-failure=UNVERIFIED |
| ui-147a7510c4c070cd | client/src/components/ui/theme-toggle.tsx:67 | {"labels":{},"tag":"DropdownMenuItem"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-147a7510c4c070cd/control-behavior=UNVERIFIED; ui-147a7510c4c070cd/control-failure=UNVERIFIED |
| ui-19351da557492895 | client/src/components/offline/PendingChangesIndicator.tsx:273 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleSync"}] | UNVERIFIED | ui-19351da557492895/control-behavior=UNVERIFIED; ui-19351da557492895/control-failure=UNVERIFIED |
| ui-2871509b1d1a7a88 | client/src/components/layout/TopBar.tsx:67 | {"labels":{},"tag":"Link"} | [] | UNVERIFIED | ui-2871509b1d1a7a88/control-behavior=UNVERIFIED; ui-2871509b1d1a7a88/control-failure=UNVERIFIED |
| ui-2a334e7fe9e1f64a | client/src/components/notifications/NotificationCenter.tsx:328 | {"labels":{},"tag":"Popover"} | [{"event":"onOpenChange","expressionKind":"Identifier","handler":"setIsOpen"}] | UNVERIFIED | ui-2a334e7fe9e1f64a/control-behavior=UNVERIFIED; ui-2a334e7fe9e1f64a/control-failure=UNVERIFIED |
| ui-2b75ce276d7518e4 | client/src/components/notifications/NotificationToast.tsx:84 | {"labels":{"data-testid":null,"role":"alert"},"tag":"div"} | [{"event":"onMouseEnter","expressionKind":"ArrowFunction","handler":null},{"event":"onMouseLeave","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-2b75ce276d7518e4/control-behavior=UNVERIFIED; ui-2b75ce276d7518e4/control-failure=UNVERIFIED |
| ui-2eea6ab9192c3719 | client/src/components/layout/Sidebar.tsx:240 | {"labels":{"aria-label":"Close sidebar","data-testid":"sidebar-overlay","role":"button"},"tag":"div"} | [{"event":"onClick","expressionKind":"Identifier","handler":"onMobileClose"},{"event":"onKeyDown","expressionKind":"ArrowFunction","handler":null},{"event":"onTouchEnd","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-2eea6ab9192c3719/control-behavior=UNVERIFIED; ui-2eea6ab9192c3719/control-failure=UNVERIFIED |
| ui-39c924f316fa2b11 | client/src/pages/SimplifiedDashboard.tsx:107 | {"labels":{},"tag":"SimplifiedDashboardComponent"} | [{"event":"onUpgrade","expressionKind":"Identifier","handler":"handleUpgrade"}] | UNVERIFIED | ui-39c924f316fa2b11/control-behavior=UNVERIFIED; ui-39c924f316fa2b11/control-failure=UNVERIFIED |
| ui-3ff76f68be9e58d7 | client/src/components/notifications/NotificationCenter.tsx:403 | {"labels":{},"tag":"Tabs"} | [{"event":"onValueChange","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-3ff76f68be9e58d7/control-behavior=UNVERIFIED; ui-3ff76f68be9e58d7/control-failure=UNVERIFIED |
| ui-479d9c9cc8f8853b | client/src/components/layout/Sidebar.tsx:324 | {"labels":{"data-testid":null,"href":null},"tag":"Link"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-479d9c9cc8f8853b/control-behavior=UNVERIFIED; ui-479d9c9cc8f8853b/control-failure=UNVERIFIED |
| ui-4a6000d07de3aa8e | client/src/components/layout/Sidebar.tsx:287 | {"labels":{"data-testid":"sidebar-close"},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"onMobileClose"}] | UNVERIFIED | ui-4a6000d07de3aa8e/control-behavior=UNVERIFIED; ui-4a6000d07de3aa8e/control-failure=UNVERIFIED |
| ui-4c70bc6f106bf5e8 | client/src/components/notifications/NotificationCenter.tsx:499 | {"labels":{"data-testid":"clear-all-btn"},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-4c70bc6f106bf5e8/control-behavior=UNVERIFIED; ui-4c70bc6f106bf5e8/control-failure=UNVERIFIED |
| ui-51bf4bf12bd1f8e8 | client/src/components/layout/TopBar.tsx:39 | {"labels":{"data-testid":"mobile-menu-button"},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"onMenuClick"}] | UNVERIFIED | ui-51bf4bf12bd1f8e8/control-behavior=UNVERIFIED; ui-51bf4bf12bd1f8e8/control-failure=UNVERIFIED |
| ui-59e29d0517679d8a | client/src/components/notifications/NotificationCenter.tsx:491 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-59e29d0517679d8a/control-behavior=UNVERIFIED; ui-59e29d0517679d8a/control-failure=UNVERIFIED |
| ui-5dc5f6dc725b0714 | client/src/components/notifications/NotificationItem.tsx:341 | {"labels":{"aria-label":"Mark as read","data-testid":null},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleMarkAsRead"}] | UNVERIFIED | ui-5dc5f6dc725b0714/control-behavior=UNVERIFIED; ui-5dc5f6dc725b0714/control-failure=UNVERIFIED |
| ui-60c9c0e6145c26fa | client/src/components/offline/PendingChangesIndicator.tsx:177 | {"labels":{},"tag":"DropdownMenu"} | [{"event":"onOpenChange","expressionKind":"Identifier","handler":"setIsOpen"}] | UNVERIFIED | ui-60c9c0e6145c26fa/control-behavior=UNVERIFIED; ui-60c9c0e6145c26fa/control-failure=UNVERIFIED |
| ui-6328b98825213623 | client/src/components/layout/AppLayout.tsx:100 | {"labels":{},"tag":"Sidebar"} | [{"event":"onMobileClose","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-6328b98825213623/control-behavior=UNVERIFIED; ui-6328b98825213623/control-failure=UNVERIFIED |
| ui-63e2d179d155f16b | client/src/components/ui/theme-toggle.tsx:53 | {"labels":{},"tag":"DropdownMenuItem"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-63e2d179d155f16b/control-behavior=UNVERIFIED; ui-63e2d179d155f16b/control-failure=UNVERIFIED |
| ui-660d292c53a1a27b | client/src/components/layout/MobileBottomNav.tsx:31 | {"labels":{"href":null},"tag":"Link"} | [] | UNVERIFIED | ui-660d292c53a1a27b/control-behavior=UNVERIFIED; ui-660d292c53a1a27b/control-failure=UNVERIFIED |
| ui-67c713adf99573ce | client/src/components/notifications/NotificationItem.tsx:352 | {"labels":{"aria-label":"Delete notification","data-testid":null},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleDelete"}] | UNVERIFIED | ui-67c713adf99573ce/control-behavior=UNVERIFIED; ui-67c713adf99573ce/control-failure=UNVERIFIED |
| ui-6ba0c83dc62c067a | client/src/components/offline/PendingChangesIndicator.tsx:298 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-6ba0c83dc62c067a/control-behavior=UNVERIFIED; ui-6ba0c83dc62c067a/control-failure=UNVERIFIED |
| ui-6f05ab0e825accb5 | client/src/components/auth/AuthProvider.tsx:185 | {"labels":{"type":"button"},"tag":"button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-6f05ab0e825accb5/control-behavior=UNVERIFIED; ui-6f05ab0e825accb5/control-failure=UNVERIFIED |
| ui-6fbecffd9578c892 | client/src/components/offline/PendingChangesIndicator.tsx:287 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleRetryFailed"}] | UNVERIFIED | ui-6fbecffd9578c892/control-behavior=UNVERIFIED; ui-6fbecffd9578c892/control-failure=UNVERIFIED |
| ui-705fd60d835ea90e | client/src/components/layout/AppLayout.tsx:140 | {"labels":{},"tag":"MobileBottomNav"} | [{"event":"onMoreClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-705fd60d835ea90e/control-behavior=UNVERIFIED; ui-705fd60d835ea90e/control-failure=UNVERIFIED |
| ui-78d565f7f7078b98 | client/src/components/offline/PendingChangesIndicator.tsx:250 | {"labels":{},"tag":"DropdownMenuItem"} | [] | UNVERIFIED | ui-78d565f7f7078b98/control-behavior=UNVERIFIED; ui-78d565f7f7078b98/control-failure=UNVERIFIED |
| ui-84245433268496bc | client/src/components/layout/AppLayout.tsx:55 | {"labels":{"href":"/pricing"},"tag":"a"} | [] | UNVERIFIED | ui-84245433268496bc/control-behavior=UNVERIFIED; ui-84245433268496bc/control-failure=UNVERIFIED |
| ui-87a4ca027697e750 | client/src/components/ui/theme-toggle.tsx:40 | {"labels":{"aria-label":null},"tag":"Button"} | [] | UNVERIFIED | ui-87a4ca027697e750/control-behavior=UNVERIFIED; ui-87a4ca027697e750/control-failure=UNVERIFIED |
| ui-92ff2656d59c1a42 | client/src/components/onboarding/SimplifiedDashboard.tsx:189 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"onUpgrade"}] | UNVERIFIED | ui-92ff2656d59c1a42/control-behavior=UNVERIFIED; ui-92ff2656d59c1a42/control-failure=UNVERIFIED |
| ui-97f927a9cc40024e | client/src/components/layout/Breadcrumb.tsx:184 | {"labels":{"data-testid":null,"href":null},"tag":"Link"} | [] | UNVERIFIED | ui-97f927a9cc40024e/control-behavior=UNVERIFIED; ui-97f927a9cc40024e/control-failure=UNVERIFIED |
| ui-9ba6573d8f3d79ac | client/src/components/ui/theme-toggle.tsx:60 | {"labels":{},"tag":"DropdownMenuItem"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-9ba6573d8f3d79ac/control-behavior=UNVERIFIED; ui-9ba6573d8f3d79ac/control-failure=UNVERIFIED |
| ui-9e8b48d9bfea4e81 | client/src/components/onboarding/SimplifiedDashboard.tsx:305 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-9e8b48d9bfea4e81/control-behavior=UNVERIFIED; ui-9e8b48d9bfea4e81/control-failure=UNVERIFIED |
| ui-a051fac5c8352c75 | client/src/components/notifications/NotificationCenter.tsx:474 | {"labels":{},"tag":"NotificationItem"} | [{"event":"onMarkAsRead","expressionKind":"ArrowFunction","handler":null},{"event":"onDelete","expressionKind":"ArrowFunction","handler":null},{"event":"onNavigate","expressionKind":"Identifier","handler":"handleNavigate"}] | UNVERIFIED | ui-a051fac5c8352c75/control-behavior=UNVERIFIED; ui-a051fac5c8352c75/control-failure=UNVERIFIED |
| ui-a2d4f10a25f80786 | client/src/components/layout/AppLayout.tsx:107 | {"labels":{},"tag":"TopBar"} | [{"event":"onMenuClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-a2d4f10a25f80786/control-behavior=UNVERIFIED; ui-a2d4f10a25f80786/control-failure=UNVERIFIED |
| ui-a4635e8e9888dd0e | client/src/components/layout/TopBar.tsx:78 | {"labels":{"data-testid":"sign-out-button"},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleSignOut"}] | UNVERIFIED | ui-a4635e8e9888dd0e/control-behavior=UNVERIFIED; ui-a4635e8e9888dd0e/control-failure=UNVERIFIED |
| ui-aa788eb9d2142629 | client/src/components/notifications/NotificationToast.tsx:147 | {"labels":{"data-testid":"toast-action"},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleAction"}] | UNVERIFIED | ui-aa788eb9d2142629/control-behavior=UNVERIFIED; ui-aa788eb9d2142629/control-failure=UNVERIFIED |
| ui-b067e9a48325de98 | client/src/components/layout/MobileBottomNav.tsx:47 | {"labels":{},"tag":"button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"onMoreClick"}] | UNVERIFIED | ui-b067e9a48325de98/control-behavior=UNVERIFIED; ui-b067e9a48325de98/control-failure=UNVERIFIED |
| ui-b43cc7e819219b5c | client/src/components/notifications/NotificationItem.tsx:323 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-b43cc7e819219b5c/control-behavior=UNVERIFIED; ui-b43cc7e819219b5c/control-failure=UNVERIFIED |
| ui-c650988c8661dc69 | client/src/components/notifications/NotificationItem.tsx:260 | {"labels":{"data-testid":null,"role":"button"},"tag":"div"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleClick"},{"event":"onKeyDown","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-c650988c8661dc69/control-behavior=UNVERIFIED; ui-c650988c8661dc69/control-failure=UNVERIFIED |
| ui-c9b6fd0662599ae8 | client/src/components/layout/Sidebar.tsx:368 | {"labels":{},"tag":"Link"} | [] | UNVERIFIED | ui-c9b6fd0662599ae8/control-behavior=UNVERIFIED; ui-c9b6fd0662599ae8/control-failure=UNVERIFIED |
| ui-cba895665a9c6e60 | client/src/components/LanguageSwitcher.tsx:42 | {"labels":{},"tag":"SelectItem"} | [] | UNVERIFIED | ui-cba895665a9c6e60/control-behavior=UNVERIFIED; ui-cba895665a9c6e60/control-failure=UNVERIFIED |
| ui-cf2b58eec584dae4 | client/src/components/notifications/NotificationCenter.tsx:387 | {"labels":{"data-testid":"notification-settings-btn"},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-cf2b58eec584dae4/control-behavior=UNVERIFIED; ui-cf2b58eec584dae4/control-failure=UNVERIFIED |
| ui-d6048cde5e5d07e5 | client/src/components/layout/TopBar.tsx:68 | {"labels":{"data-testid":"settings-button"},"tag":"Button"} | [] | UNVERIFIED | ui-d6048cde5e5d07e5/control-behavior=UNVERIFIED; ui-d6048cde5e5d07e5/control-failure=UNVERIFIED |
| ui-e149798fdf5cac49 | client/src/components/layout/Breadcrumb.tsx:217 | {"labels":{"data-testid":null,"href":null},"tag":"Link"} | [] | UNVERIFIED | ui-e149798fdf5cac49/control-behavior=UNVERIFIED; ui-e149798fdf5cac49/control-failure=UNVERIFIED |
| ui-e3140489bade506e | client/src/components/onboarding/SimplifiedDashboard.tsx:162 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-e3140489bade506e/control-behavior=UNVERIFIED; ui-e3140489bade506e/control-failure=UNVERIFIED |
| ui-edf2849ec9c5472c | client/src/components/onboarding/SimplifiedDashboard.tsx:249 | {"labels":{},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-edf2849ec9c5472c/control-behavior=UNVERIFIED; ui-edf2849ec9c5472c/control-failure=UNVERIFIED |
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
| call-510bfdc2f30f3a59 | GET /api/auth/onboarding-status | client/src/pages/SimplifiedDashboard.tsx:31 | matched | ["api-a54c9817ea044f10"] | UNVERIFIED |
| call-786f4741b5b20d32 | DELETE /api/notifications/clear-all | client/src/components/notifications/NotificationCenter.tsx:293 | matched | ["api-79806241e7837847","api-b5765bd71835678e"] | UNVERIFIED |
| call-96046eae71eeec35 | GET /api/notifications | client/src/components/notifications/NotificationCenter.tsx:150 | matched | ["api-1c1e6f62b55d1d41"] | UNVERIFIED |
| call-c5c1e9f24259778b | PUT /api/notifications/:param/read | client/src/components/notifications/NotificationCenter.tsx:224 | matched | ["api-748719b2ffc698f2"] | UNVERIFIED |
| call-cb860b04fe41fe4d | POST /api/auth/logout | client/src/components/auth/AuthProvider.tsx:159 | matched | ["api-ada499737fe455a9"] | UNVERIFIED |
| call-dbf6d050a8e4b342 | GET /api/dashboard/comprehensive | client/src/components/onboarding/SimplifiedDashboard.tsx:55 | matched | ["api-c5843e01128919e4"] | UNVERIFIED |
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
| api-a54c9817ea044f10 | GET /api/auth/onboarding-status | server/routes.ts:718 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-a54c9817ea044f10/response-contract=UNVERIFIED; api-a54c9817ea044f10/access-policy=UNVERIFIED; api-a54c9817ea044f10/input-boundaries=UNVERIFIED; api-a54c9817ea044f10/tenant-boundary=UNVERIFIED; api-a54c9817ea044f10/dependency-failure=UNVERIFIED |
| api-a98bdf4156c16cc6 | GET /api/notifications/preferences | server/routes.ts:3374 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-a98bdf4156c16cc6/response-contract=UNVERIFIED; api-a98bdf4156c16cc6/access-policy=UNVERIFIED; api-a98bdf4156c16cc6/input-boundaries=UNVERIFIED; api-a98bdf4156c16cc6/tenant-boundary=UNVERIFIED; api-a98bdf4156c16cc6/dependency-failure=UNVERIFIED |
| api-ada499737fe455a9 | POST /api/auth/logout | server/routes.ts:633 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-ada499737fe455a9/response-contract=UNVERIFIED; api-ada499737fe455a9/access-policy=UNVERIFIED; api-ada499737fe455a9/input-boundaries=UNVERIFIED; api-ada499737fe455a9/tenant-boundary=UNVERIFIED; api-ada499737fe455a9/dependency-failure=UNVERIFIED; api-ada499737fe455a9/mutation-durability=UNVERIFIED |
| api-b5765bd71835678e | DELETE /api/notifications/:id | server/routes.ts:3217 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-b5765bd71835678e/response-contract=UNVERIFIED; api-b5765bd71835678e/access-policy=UNVERIFIED; api-b5765bd71835678e/input-boundaries=UNVERIFIED; api-b5765bd71835678e/tenant-boundary=UNVERIFIED; api-b5765bd71835678e/dependency-failure=UNVERIFIED; api-b5765bd71835678e/mutation-durability=UNVERIFIED; api-b5765bd71835678e/deletion-durability=UNVERIFIED |
| api-c5843e01128919e4 | GET /api/dashboard/comprehensive | server/routes.ts:2567 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-c5843e01128919e4/response-contract=UNVERIFIED; api-c5843e01128919e4/access-policy=UNVERIFIED; api-c5843e01128919e4/input-boundaries=UNVERIFIED; api-c5843e01128919e4/tenant-boundary=UNVERIFIED; api-c5843e01128919e4/dependency-failure=UNVERIFIED |
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
    "client/src/components/dashboard/dashboardDataContracts.ts",
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
    "client/src/components/onboarding/SimplifiedDashboard.tsx",
    "client/src/components/ui/badge.tsx",
    "client/src/components/ui/breadcrumb.tsx",
    "client/src/components/ui/button.tsx",
    "client/src/components/ui/card.tsx",
    "client/src/components/ui/dropdown-menu.tsx",
    "client/src/components/ui/popover.tsx",
    "client/src/components/ui/progress.tsx",
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
    "client/src/lib/onboardingMode.ts",
    "client/src/lib/preferenceWrites.ts",
    "client/src/lib/queryClient.ts",
    "client/src/lib/sessionProbe.ts",
    "client/src/lib/studioLayoutStore.ts",
    "client/src/lib/utils.ts",
    "client/src/pages/SimplifiedDashboard.tsx",
    "client/src/stores/studioStore.ts",
    "shared/schema.ts"
  ],
  "addTest": {
    "suggestedPath": "tests/browser/simplified-dashboard-acceptance.test.mjs",
    "command": "node --import tsx --test tests/browser/simplified-dashboard-acceptance.test.mjs",
    "cwd": ".",
    "instructions": "Implement the named behavioral assertions using disposable fixtures, then map exact passing case identities in the acceptance map; source associations alone never close a check.",
    "fixtureTemplate": "browser-page"
  },
  "testCandidates": [
    {
      "path": "tests/unit/dashboard-projects-page-regressions.test.ts",
      "association": "static-import-or-literal-source-reference",
      "executionStatus": "executed"
    },
    {
      "path": "tests/unit/simplifiedDashboardContracts.test.ts",
      "association": "static-import-or-literal-source-reference",
      "executionStatus": "executed"
    }
  ]
}
```

The complete machine ledger retains original evidence/details and global controls, unmapped routes, source coverage and non-JS/desktop/native lanes. See [platform index](../platform-completion-plan.md).
