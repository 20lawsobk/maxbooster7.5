# Frozen master before required-awareness and release-isolation repairs

Actual UTC execution: 2026-10-28 01:46:41–02:09:19 (October27 in Detroit),
22m38s. Source/configuration/test inputs remained unchanged, SHA-256
`8cad7cae3ab4895c19ba78fba1b7ff5d9670c16a2a4fea7008a3e7631180c6be`.

The complete structured/raw evidence and command logs are in
`master-evidence.tar.gz`; `manifest.json` hashes every member and the archive.
Extract it into an owned review directory with `tar -xzf master-evidence.tar.gz`.
Generated HTML/assets are reproducible and omitted; JSON counters, source maps,
LCOV, XML/TAP logs, source inventory and Python profiles are retained.
The original receipt paths refer to the then-canonical report root; matching
members retain the same relative paths in this archive.

Build, unit/additional, Python, commerce, subsystems, browser,80-page rendering,
operations,types,lint and production audit passed. Coverage thresholds and
strict feature-evidence gates remain unmet. The Node run contains one stale
success fixture installing qs6.16.0, correctly rejected by the patched floor.
The HTTP run contains one actual CareerCoach500 for an unavailable required
awareness endpoint404. The bounded spike load exceeded500ms p95 (613.903365ms)
while release compression/native packaging competed for CPU; isolated recheck
is required, with no threshold relaxation. Six exact public/auth access-policy
checks linked successfully; the remaining feature requirements are unverified.

A concurrent portable release failed its source-integrity guard after rebuilding
and verifying all runtime capsules. The main build changed its admitted imported
API bundle, and Python tests leaked a generated image into admitted source
uploads. That failure is preserved separately under
`reports/release-rehearsal/2026-10-27-analytics-dependencies-final/`.
It did not perform cold startup. These findings require real source/test fixes
and a later serialized rehearsal; this archive does not certify those changes.
