# SCAN-05 SAST recovery evidence

**Disposition: INCOMPLETE**

This is independent local Semgrep evidence. It does not certify production readiness or alter any security gate.
Finding records intentionally contain no matched source text, metavariable values, or secret values.

## Scanner and rules

- Scanner: Semgrep 1.179.0
- Isolation: PYTHONPATH/PYTHONHOME removed only for scanner children; PYTHONNOUSERSITE=1
- Metrics/version checks: disabled; code upload and autofix: not used
- p/security-audit: 225 rules; source https://semgrep.dev/c/p/security-audit; SHA-256 `83d7cde9157b3c79cc5cfaea26e7bd2ba9c740f2ba07635ad475b2585556c32d`; ETag `W/"79454b659a432e9ef0b774fd2a94f6b18452a37f"`
- local/inventory-coverage-probes: 11 rules; source scanner-built-in; SHA-256 `a500f2d2090d18a56e98052badff524492c27be6ce451c607726f049685bcd9d`; ETag `not supplied`

Registry packs do not expose a semantic pack version in their fetched YAML. The byte digest and HTTP ETag above are the exact rule revision identifiers used.
The built-in, improbable marker coverage probes force Semgrep to parse every supported inventoried language even where registry rules intentionally exclude tests. They add no finding suppression and do not replace the security-audit rules; any coincidental marker match remains visible as an INFO result.

## Coverage

- Git-tracked first-party source inventory: 4989 files / 57316150 bytes
- Inventory manifest SHA-256: `f363a273f7b6892d33a96fe88d0ecd2b338b033ae51f27b948c9d1e26641beb3`
- Scanner-reported paths: 0
- Omitted inventory paths: 4989
- Parse/scanner errors: 1; explicit skips: 0

| Language | Inventory | Scanned | Omitted |
|---|---:|---:|---:|
| dockerfile | 8 | 0 | 8 |
| go | 4 | 0 | 4 |
| javascript | 325 | 0 | 325 |
| python | 1114 | 0 | 1114 |
| rust | 9 | 0 | 9 |
| typescript | 3529 | 0 | 3529 |

Generated dependencies, generated bundles, evidence/report caches, attached assets, and release/archive outputs are excluded. Nested first-party source under external/maxcore and external/pdim remains included; only nested generated segments such as dist are excluded.

## Findings

- Total: 0
- Severity counts: {}

## Incompleteness and errors

- Scanner process exceeded the outer 15-minute bound.
- Scanner exited nonzero (SIGTERM).
- 1 scanner/parse error(s) were reported.
- 4989 inventoried source file(s) were not reported scanned; this evidence is not called full.
- Scanner error (invalid-or-missing-json): ENOENT: no such file or directory, open '/tmp/readiness-sast-ezNwiT/semgrep-raw.json'

Every finding requires source-level validation. Prioritize ERROR findings at exposed trust boundaries, then WARNING findings involving command execution, path traversal, injection, authorization, cryptography, or credential handling.
