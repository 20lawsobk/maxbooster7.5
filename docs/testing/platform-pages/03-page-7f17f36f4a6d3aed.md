# 03. /forgot-password — ForgotPassword

Generated; edit the generator or source business-section supplements and regenerate. Inventory inclusion is not test passage.

Declaration `page-7f17f36f4a6d3aed`; source `client/src/pages/ForgotPassword.tsx:1`; registration `{"file":"client/src/App.tsx","line":207}`; status **UNVERIFIED**.

## Page acceptance

| Check | Status | Exact acceptance |
| --- | --- | --- |
| page-7f17f36f4a6d3aed/page-states | UNVERIFIED | Exercise this page's actual loading, empty, error/retry and successful states, including navigation and reload. |
| page-7f17f36f4a6d3aed/page-access | UNVERIFIED | Verify the page's declared public/authenticated/admin access policy and cross-user resource boundary. |
| page-7f17f36f4a6d3aed/page-persistence | UNVERIFIED | Submit applicable page actions, verify the corresponding backend result, and reload to confirm durable state; verify failed writes do not show success. |

Implement each exact check, then map current passing case identities and source hashes. Keep missing prerequisites and external delivery explicitly unverified.

## All business sections

| Page work/provenance field | Required detail |
| --- | --- |
| ordinal | 3 |
| id | page-7f17f36f4a6d3aed |
| path | /forgot-password |
| component | ForgotPassword |
| source | {"file":"client/src/pages/ForgotPassword.tsx","line":1} |
| registration | {"file":"client/src/App.tsx","line":207} |
| status | UNVERIFIED |
| businessJourneyWork | Exercise email entry, validation, enumeration-resistant acknowledgment, rate limiting, retry and delivery failure; prove actual controlled reset delivery and token issuance separately from a success message. |
| routeSpecificWork | Verify this exact registered path, direct navigation, reload, auth transition and unknown/malformed parameters; do not reuse another path’s result as automatic alias acceptance. |
| coverageOfSource | {"additionalReachableAuditWork":["client/src/components/ui/Logo.tsx","client/src/components/ui/alert.tsx","client/src/components/ui/button.tsx","client/src/components/ui/card.tsx","client/src/components/ui/input.tsx","client/src/components/ui/label.tsx","client/src/components/ui/toast.tsx","client/src/hooks/use-toast.ts","client/src/lib/utils.ts"],"inspectedJsxSourceFiles":[{"file":"client/src/pages/ForgotPassword.tsx","lineCount":332,"sha256":"1cd2a205d7ce040fbdfa14571d63a37c17f68c5d2c9e6bba9b1e7f06c26941ce"}],"registeredReachableSourceFiles":["client/src/components/ui/Logo.tsx","client/src/components/ui/alert.tsx","client/src/components/ui/button.tsx","client/src/components/ui/card.tsx","client/src/components/ui/input.tsx","client/src/components/ui/label.tsx","client/src/components/ui/toast.tsx","client/src/hooks/use-toast.ts","client/src/lib/utils.ts","client/src/pages/ForgotPassword.tsx"],"scope":"Actual AST source sections and complete-control modules, transparent reexports and recursively rendered domain components. Shared UI/layout internals, hooks/services/libs, runtime conditional branches and unresolved dynamic bindings remain explicit register-wide audit work; this is a plan, not completed execution.","sourceControlsEnumerated":10,"sourceSectionsEnumerated":2} |
| evidenceReferences | [{"path":"reports/test-verification/history/2026-10-26-integrated-before-rechecks/README.md","scope":"Historical integrated scopes and failures; does not close this section."},{"path":"reports/release-rehearsal/2026-10-27-final/summary.json","scope":"Prepared portable cold startup only; productionReady remains false."}] |
| analysisSourceFreshness | {"checkedFiles":1,"meaning":"Source-analysis freshness only; not behavioral execution evidence.","staleSourceFiles":[],"status":"SOURCE_HASHES_MATCH","unavailableSourceFiles":[]} |

### ForgotPassword complete controls, state, rendered children and API bindings — ForgotPassword:1

| Work field | Required detail |
| --- | --- |
| id | section-d97695de653a7e2d |
| kind | complete-module |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":332,"file":"client/src/pages/ForgotPassword.tsx","line":1}] |
| frontendWork | ["Exercise every rendered control and conditional state in ForgotPassword complete controls, state, rendered children and API bindings — ForgotPassword:1; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 10 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [{"attributes":{"href":"\"/\""},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":175},"tag":"Link","text":""},{"attributes":{"aria-describedby":"{emailError ? \"email-error\" : undefined}","aria-invalid":"{!!emailError}","autoComplete":"\"email\"","className":"{emailError ? \"border-destructive\" : \"\"}","data-testid":"\"input-forgot-password-email\"","disabled":"{loading}","id":"\"email\"","onBlur":"{handleEmailBlur}","onChange":"{(e) => handleEmailChange(e.target.value)}","placeholder":"\"you@example.com\"","required":true,"type":"\"email\"","value":"{email}"},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":208},"tag":"Input","text":""},{"attributes":{"className":"\"w-full\"","data-testid":"\"button-send-reset-link\"","disabled":"{loading &#124;&#124; !!emailError}","type":"\"submit\""},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":233},"tag":"Button","text":"{loading ? \"Sending...\" : \"Send Reset Link\"}"},{"attributes":{"href":"\"/login\""},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":242},"tag":"Link","text":"Back to Login"},{"attributes":{"className":"\"text-sm\"","data-testid":"\"link-back-to-login\"","type":"\"button\"","variant":"\"link\""},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":243},"tag":"Button","text":"Back to Login"},{"attributes":{"href":"\"/login\""},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":281},"tag":"Link","text":"Back to Login"},{"attributes":{"className":"\"w-full\"","data-testid":"\"button-back-to-login\""},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":282},"tag":"Button","text":"Back to Login"},{"attributes":{"className":"\"w-full\"","data-testid":"\"button-resend-email\"","disabled":"{loading &#124;&#124; resendCooldown > 0}","onClick":"{handleResend}","variant":"\"outline\""},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":289},"tag":"Button","text":"{loading ? \"Sending...\" : resendCooldown > 0 ? ( <> <Clock className=\"h-4 w-4 mr-2\" /> Resend in {resendCooldown}s </> ) : ( <> <RefreshCw className=\"h-4 w-4 mr-2\" /> Resend Email </> )}"},{"attributes":{"className":"\"w-full text-muted-foreground\"","data-testid":"\"button-try-different-email\"","disabled":"{loading}","onClick":"{() => { setSubmitted(false); setEmail(\"\"); setEmailError(\"\"); setRequestError(\"\"); }}","size":"\"sm\"","variant":"\"ghost\""},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":308},"tag":"Button","text":"Try a different email"},{"attributes":{},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":205},"tag":"form","text":""}] |
| interactionIds | ["ui-6dd768fa0b298a00","ui-5cb9c6ea88fe23eb","ui-082633f099986fd0","ui-6117bf37c4e86f37","ui-d52f4f17aefef764","ui-46724a053d87e8a0","ui-85abce3ccf1bdd10","ui-e5d789fe83a1d29d","ui-1313c0413badc57d","ui-e99fc02fd50d55b4"] |
| frontendContractIds | ["call-4d4513bae9bbdb6c"] |
| backendRouteIds | ["api-2e1ec62470369301"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### {!submitted ? "Forgot Password?" : "Check Your Email"} — ForgotPassword:189

| Work field | Required detail |
| --- | --- |
| id | section-1369eefbee7ca147 |
| kind | CardTitle |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":191,"file":"client/src/pages/ForgotPassword.tsx","line":189}] |
| frontendWork | ["Exercise every rendered control and conditional state in {!submitted ? \"Forgot Password?\" : \"Check Your Email\"} — ForgotPassword:189; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 0 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [] |
| interactionIds | [] |
| frontendContractIds | ["call-4d4513bae9bbdb6c"] |
| backendRouteIds | ["api-2e1ec62470369301"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

### Email Address {emailError && ( <p id="email-error" className="text-sm text-destructive flex items-center gap-1" > <AlertCircle className="h-3 w-3" /> {emailError} </p> )} {loading ? "Sending..." : "Send Reset Link"} Back to Login — ForgotPassword:205

| Work field | Required detail |
| --- | --- |
| id | section-75e5afd8193a3615 |
| kind | form |
| status | UNVERIFIED |
| sourceFiles | [{"endLine":254,"file":"client/src/pages/ForgotPassword.tsx","line":205}] |
| frontendWork | ["Exercise every rendered control and conditional state in Email Address {emailError && ( <p id=\"email-error\" className=\"text-sm text-destructive flex items-center gap-1\" > <AlertCircle className=\"h-3 w-3\" /> {emailError} </p> )} {loading ? \"Sending...\" : \"Send Reset Link\"} Back to Login — ForgotPassword:205; resolve dynamic list items, nested rendered children and event-handler effects from actual source.","Check controlled inputs, displayed labels/values, tab/dialog/form transitions, reset/cancel/submit and fresh-session rehydration; retain all 5 source controls enumerated for this section."] |
| backendWork | ["Trace this section’s callbacks to every candidate frontend contract below and confirm the exact mounted process, HTTP method/path, request/response schema, storage/service and worker. Candidate file calls are not yet proven section bindings.","Implement and verify missing production behavior only after reproducing the exact contract gap; preserve precise statuses and real errors rather than broad accepted status sets."] |
| validationPermissionsSecurity | ["Prove anonymous, authenticated owner, foreign owner and applicable subscription/admin/role scopes; identify the actual intended access policy even for public informational controls.","Test all actual field limits, required/optional boundaries, malformed values, CSRF/session handling, safe rendering/URLs/files, no cross-account cache leakage and secrets/PII redaction."] |
| durableProviderGenerationJourneys | ["For every mutation, verify persisted state and bytes from a fresh request/process, duplicate/replay/concurrency handling, transaction/lease authority, interruption and recovery; for display-only sections prove source-of-truth correspondence.","For provider, payment, download, notification or generation controls, verify the actual output/receipt/entitlement and failure lifecycle with an owned fixture; separately require controlled deployed delivery and truthful unavailable states. Explicitly resolve applicability from source; never auto-pass absent fixtures."] |
| failureAccessibilityMobileI18nPerformance | ["Exercise loading, empty, success, validation error, unauthorized/forbidden, missing record, timeout, dependency outage, retry and cancellation/unmount states supported by this section.","Verify accessible names, semantic roles, keyboard order/focus/escape, screen-reader errors/status, contrast and reduced motion.","Verify narrow/touch/mobile layouts, zoom, RTL and translated/missing/long text, locale dates/numbers/currency/time zones and supported language switching.","Measure relevant render/request/media work with representative records, pagination/large lists and bounded retries; inspect subscriptions/listeners/timers cleanup and record workload/latency rather than projected capacity."] |
| evidenceNeeded | ["Current-source instrumented line/statement/function/branch counters at 100% for the relevant source, with raw maps and no silently excluded files.","Named component/browser cases for every listed interaction and state; real HTTP/database/service/worker cases for each bound backend contract, with exact statuses, durable assertions and negative owner/security cases.","Record command/tool versions, source hashes, fixture isolation, timestamps, actual exits and cleanup; map exact passing case identities to platform-register required checks. Static inspection and source/test associations do not close acceptance."] |
| controls | [{"attributes":{"aria-describedby":"{emailError ? \"email-error\" : undefined}","aria-invalid":"{!!emailError}","autoComplete":"\"email\"","className":"{emailError ? \"border-destructive\" : \"\"}","data-testid":"\"input-forgot-password-email\"","disabled":"{loading}","id":"\"email\"","onBlur":"{handleEmailBlur}","onChange":"{(e) => handleEmailChange(e.target.value)}","placeholder":"\"you@example.com\"","required":true,"type":"\"email\"","value":"{email}"},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":208},"tag":"Input","text":""},{"attributes":{"className":"\"w-full\"","data-testid":"\"button-send-reset-link\"","disabled":"{loading &#124;&#124; !!emailError}","type":"\"submit\""},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":233},"tag":"Button","text":"{loading ? \"Sending...\" : \"Send Reset Link\"}"},{"attributes":{"href":"\"/login\""},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":242},"tag":"Link","text":"Back to Login"},{"attributes":{"className":"\"text-sm\"","data-testid":"\"link-back-to-login\"","type":"\"button\"","variant":"\"link\""},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":243},"tag":"Button","text":"Back to Login"},{"attributes":{},"source":{"file":"client/src/pages/ForgotPassword.tsx","line":205},"tag":"form","text":""}] |
| interactionIds | ["ui-5cb9c6ea88fe23eb","ui-082633f099986fd0","ui-6117bf37c4e86f37","ui-d52f4f17aefef764","ui-46724a053d87e8a0"] |
| frontendContractIds | ["call-4d4513bae9bbdb6c"] |
| backendRouteIds | ["api-2e1ec62470369301"] |
| apiBindingStatus | CANDIDATE_FILE_CALLS_REQUIRE_SECTION_TRACE |

## Every control

| ID | Source | Tag/labels | Handlers | Status | Required checks |
| --- | --- | --- | --- | --- | --- |
| ui-082633f099986fd0 | client/src/pages/ForgotPassword.tsx:208 | {"labels":{"data-testid":"input-forgot-password-email","id":"email","type":"email"},"tag":"Input"} | [{"event":"onChange","expressionKind":"ArrowFunction","handler":null},{"event":"onBlur","expressionKind":"Identifier","handler":"handleEmailBlur"}] | UNVERIFIED | ui-082633f099986fd0/control-behavior=UNVERIFIED; ui-082633f099986fd0/control-failure=UNVERIFIED |
| ui-1313c0413badc57d | client/src/pages/ForgotPassword.tsx:289 | {"labels":{"data-testid":"button-resend-email"},"tag":"Button"} | [{"event":"onClick","expressionKind":"Identifier","handler":"handleResend"}] | UNVERIFIED | ui-1313c0413badc57d/control-behavior=UNVERIFIED; ui-1313c0413badc57d/control-failure=UNVERIFIED |
| ui-46724a053d87e8a0 | client/src/pages/ForgotPassword.tsx:243 | {"labels":{"data-testid":"link-back-to-login","type":"button"},"tag":"Button"} | [] | UNVERIFIED | ui-46724a053d87e8a0/control-behavior=UNVERIFIED; ui-46724a053d87e8a0/control-failure=UNVERIFIED |
| ui-5cb9c6ea88fe23eb | client/src/pages/ForgotPassword.tsx:205 | {"labels":{},"tag":"form"} | [{"event":"onSubmit","expressionKind":"Identifier","handler":"handleSubmit"}] | UNVERIFIED | ui-5cb9c6ea88fe23eb/control-behavior=UNVERIFIED; ui-5cb9c6ea88fe23eb/control-failure=UNVERIFIED |
| ui-6117bf37c4e86f37 | client/src/pages/ForgotPassword.tsx:233 | {"labels":{"data-testid":"button-send-reset-link","type":"submit"},"tag":"Button"} | [] | UNVERIFIED | ui-6117bf37c4e86f37/control-behavior=UNVERIFIED; ui-6117bf37c4e86f37/control-failure=UNVERIFIED |
| ui-6dd768fa0b298a00 | client/src/pages/ForgotPassword.tsx:175 | {"labels":{"href":"/"},"tag":"Link"} | [] | UNVERIFIED | ui-6dd768fa0b298a00/control-behavior=UNVERIFIED; ui-6dd768fa0b298a00/control-failure=UNVERIFIED |
| ui-7519845872f222ab | client/src/components/ui/input.tsx:8 | {"labels":{},"tag":"input"} | [] | UNVERIFIED | ui-7519845872f222ab/control-behavior=UNVERIFIED; ui-7519845872f222ab/control-failure=UNVERIFIED |
| ui-85abce3ccf1bdd10 | client/src/pages/ForgotPassword.tsx:281 | {"labels":{"href":"/login"},"tag":"Link"} | [] | UNVERIFIED | ui-85abce3ccf1bdd10/control-behavior=UNVERIFIED; ui-85abce3ccf1bdd10/control-failure=UNVERIFIED |
| ui-d52f4f17aefef764 | client/src/pages/ForgotPassword.tsx:242 | {"labels":{"href":"/login"},"tag":"Link"} | [] | UNVERIFIED | ui-d52f4f17aefef764/control-behavior=UNVERIFIED; ui-d52f4f17aefef764/control-failure=UNVERIFIED |
| ui-e5d789fe83a1d29d | client/src/pages/ForgotPassword.tsx:282 | {"labels":{"data-testid":"button-back-to-login"},"tag":"Button"} | [] | UNVERIFIED | ui-e5d789fe83a1d29d/control-behavior=UNVERIFIED; ui-e5d789fe83a1d29d/control-failure=UNVERIFIED |
| ui-e99fc02fd50d55b4 | client/src/pages/ForgotPassword.tsx:308 | {"labels":{"data-testid":"button-try-different-email"},"tag":"Button"} | [{"event":"onClick","expressionKind":"ArrowFunction","handler":null}] | UNVERIFIED | ui-e99fc02fd50d55b4/control-behavior=UNVERIFIED; ui-e99fc02fd50d55b4/control-failure=UNVERIFIED |

For every control execute its control-behavior and control-failure acceptance from the global required-check ledger; cover keyboard/mobile, input validation, loading/error/retry, authorization and the real side effect.

## Every frontend API contract

| ID | Method/path | Source | Topology | Backend IDs | Behavior acceptance |
| --- | --- | --- | --- | --- | --- |
| call-4d4513bae9bbdb6c | POST /api/auth/forgot-password | client/src/pages/ForgotPassword.tsx:20 | matched | ["api-2e1ec62470369301"] | UNVERIFIED |

Trace each request to its actual process/mount, assert exact response/error/permission behavior and prove persistence after reload or another worker.

## Every mapped backend registration

| ID | Method/path | Source | Process/mount | Status | Required checks |
| --- | --- | --- | --- | --- | --- |
| api-2e1ec62470369301 | POST /api/auth/forgot-password | server/routes.ts:2032 | {"resolved":true,"scope":"main-app"} | UNVERIFIED | api-2e1ec62470369301/response-contract=UNVERIFIED; api-2e1ec62470369301/access-policy=UNVERIFIED; api-2e1ec62470369301/input-boundaries=UNVERIFIED; api-2e1ec62470369301/tenant-boundary=UNVERIFIED; api-2e1ec62470369301/dependency-failure=UNVERIFIED; api-2e1ec62470369301/mutation-durability=UNVERIFIED |

Exercise successful/adverse HTTP contracts, cross-owner denial, input boundaries, dependency failure, durable mutation/deletion and callback/artifact/readiness checks exactly as assigned. Standalone or unresolved processes need their own harness.

## Exact source reachability and test instructions

```json
{
  "reachableSourceFiles": [
    "client/src/components/ui/Logo.tsx",
    "client/src/components/ui/alert.tsx",
    "client/src/components/ui/button.tsx",
    "client/src/components/ui/card.tsx",
    "client/src/components/ui/input.tsx",
    "client/src/components/ui/label.tsx",
    "client/src/components/ui/toast.tsx",
    "client/src/hooks/use-toast.ts",
    "client/src/lib/utils.ts",
    "client/src/pages/ForgotPassword.tsx"
  ],
  "addTest": {
    "suggestedPath": "tests/browser/forgot-password-acceptance.test.mjs",
    "command": "node --import tsx --test tests/browser/forgot-password-acceptance.test.mjs",
    "cwd": ".",
    "instructions": "Implement the named behavioral assertions using disposable fixtures, then map exact passing case identities in the acceptance map; source associations alone never close a check.",
    "fixtureTemplate": "browser-page"
  },
  "testCandidates": []
}
```

The complete machine ledger retains original evidence/details and global controls, unmapped routes, source coverage and non-JS/desktop/native lanes. See [platform index](../platform-completion-plan.md).
