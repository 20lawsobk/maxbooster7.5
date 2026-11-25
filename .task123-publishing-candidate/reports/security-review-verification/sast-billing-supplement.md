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

- Git-tracked first-party source inventory: 3 files / 392444 bytes
- Inventory manifest SHA-256: `beac1a03364214ba405663924797ff05f8346766d1eba97341b10b94cadc32c7`
- Scanner-reported paths: 3
- Omitted inventory paths: 0
- Parse/scanner errors: 0; explicit skips: 0

| Language | Inventory | Scanned | Omitted |
|---|---:|---:|---:|
| typescript | 3 | 3 | 0 |

Generated dependencies, generated bundles, evidence/report caches, attached assets, and release/archive outputs are excluded. Nested first-party source under external/maxcore and external/pdim remains included; only nested generated segments such as dist are excluded.

## Findings

- Total: 0
- Severity counts: {}

## Incompleteness and errors

- None for the declared inventory.

Every finding requires source-level validation. Prioritize ERROR findings at exposed trust boundaries, then WARNING findings involving command execution, path traversal, injection, authorization, cryptography, or credential handling.
