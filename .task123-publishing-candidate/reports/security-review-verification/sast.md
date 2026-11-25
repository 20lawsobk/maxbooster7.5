# SCAN-05 SAST recovery evidence

**Disposition: complete for declared inventory**

This is independent local Semgrep evidence. It does not certify production readiness or alter any security gate.
Finding records intentionally contain no matched source text, metavariable values, or secret values.

## Scanner and rules

- Scanner: Semgrep 1.172.0
- Isolation: PYTHONPATH/PYTHONHOME removed only for scanner children; PYTHONNOUSERSITE=1
- Metrics/version checks: disabled; code upload and autofix: not used
- p/security-audit: 225 rules; source https://semgrep.dev/c/p/security-audit; SHA-256 `b109a039df712f30c6d3e25e1e8358053fd0f1c91b92d0e8d2871cd141fe602f`; ETag `W/"eba951b81c18bf273fd189807814713b13bff45e"`
- local/inventory-coverage-probes: 11 rules; source scanner-built-in; SHA-256 `a500f2d2090d18a56e98052badff524492c27be6ce451c607726f049685bcd9d`; ETag `not supplied`

Registry packs do not expose a semantic pack version in their fetched YAML. The byte digest and HTTP ETag above are the exact rule revision identifiers used.
The built-in, improbable marker coverage probes force Semgrep to parse every supported inventoried language even where registry rules intentionally exclude tests. They add no finding suppression and do not replace the security-audit rules; any coincidental marker match remains visible as an INFO result.

## Coverage

- Git-tracked first-party source inventory: 3503 files / 44079371 bytes
- Inventory manifest SHA-256: `1ca8f3be21154eef2484806463f5c12bd38afd5e92b97380e31d150b7d04be91`
- Scanner-reported paths: 3503
- Omitted inventory paths: 0
- Parse/scanner errors: 0; explicit skips: 0

| Language | Inventory | Scanned | Omitted |
|---|---:|---:|---:|
| dockerfile | 7 | 7 | 0 |
| go | 4 | 4 | 0 |
| javascript | 151 | 151 | 0 |
| python | 452 | 452 | 0 |
| rust | 9 | 9 | 0 |
| typescript | 2880 | 2880 | 0 |

Generated dependencies, generated bundles, evidence/report caches, attached assets, and release/archive outputs are excluded. Nested first-party source under external/maxcore and external/pdim remains included; only nested generated segments such as dist are excluded.

## Findings

- Total: 28
- Severity counts: {"ERROR":11,"WARNING":17}

| Priority | Rule | Location | CWE |
|---|---|---|---|
| P1 | python.lang.security.use-defused-xml.use-defused-xml | external/maxcore/artifacts/ai-training-server/ai_model/awareness/sources.py:9 | CWE-611: Improper Restriction of XML External Entity Reference |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/ai_model/isolated_audio_worker.py:36 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | external/maxcore/artifacts/ai-training-server/ai_model/media_contract.py:158 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/tests/test_documented_stack_restore.py:23 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/tests/test_generation_durable_delivery.py:119 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/tests/test_generation_plan_contract.py:38 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/tests/test_generation_plan_contract.py:142 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/tests/test_generation_release_selection.py:49 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/tests/test_generation_release_selection.py:109 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/tests/test_generation_restart_reconciliation.py:42 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/tests/test_generation_route_bindings.py:52 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/tests/test_generation_route_bindings.py:171 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.exec-detected.exec-detected | external/maxcore/artifacts/ai-training-server/tests/test_isolated_audio.py:59 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | external/pdim/.replit_integration_files/server/replit_integrations/object_storage/objectStorage.ts:278 | CWE-319: Cleartext Transmission of Sensitive Information |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | external/pdim/artifacts/api-server/src/pocket-dimension/fabric/storage/ReplitChunkStore.ts:24 | CWE-319: Cleartext Transmission of Sensitive Information |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | external/pdim/artifacts/api-server/src/services/hybridStorageService.ts:88 | CWE-319: Cleartext Transmission of Sensitive Information |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | external/pdim/artifacts/api-server/src/services/storageService.ts:122 | CWE-319: Cleartext Transmission of Sensitive Information |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | scripts/maxcore-eval-browser.mjs:4 | CWE-319: Cleartext Transmission of Sensitive Information |
| P2 | python.lang.security.audit.exec-detected.exec-detected | scripts/maxcore-isolated-recovery-acceptance.py:54 | CWE-95: Improper Neutralization of Directives in Dynamically Evaluated Code ('Eval Injection') |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | scripts/maxcore-isolated-recovery-acceptance.py:118 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P1 | javascript.lang.security.detect-child-process.detect-child-process | server/services/backup/databaseBackupService.ts:222 | CWE-78: Improper Neutralization of Special Elements used in an OS Command ('OS Command Injection') |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | tests/chaos/harness.py:36 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | tests/chaos/harness.py:57 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P2 | python.lang.security.audit.dynamic-urllib-use-detected.dynamic-urllib-use-detected | tests/chaos/harness.py:67 | CWE-939: Improper Authorization in Handler for Custom URL Scheme |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | tests/integration/maxcore-local-supervisor.integration.test.ts:27 | CWE-319: Cleartext Transmission of Sensitive Information |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | tests/integration/maxcore-local-supervisor.integration.test.ts:73 | CWE-319: Cleartext Transmission of Sensitive Information |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | tests/unit/local-pdim-protocol.test.ts:588 | CWE-319: Cleartext Transmission of Sensitive Information |
| P1 | typescript.react.security.react-insecure-request.react-insecure-request | tests/unit/local-pdim-protocol.test.ts:603 | CWE-319: Cleartext Transmission of Sensitive Information |

## Incompleteness and errors

- None for the declared inventory.

Every finding requires source-level validation. Prioritize ERROR findings at exposed trust boundaries, then WARNING findings involving command execution, path traversal, injection, authorization, cryptography, or credential handling.
