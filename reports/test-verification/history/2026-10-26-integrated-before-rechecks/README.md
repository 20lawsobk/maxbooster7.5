# Integrated master before follow-up repairs

This preserves the exact completed October 26 master run before its subsequent
rechecks. It ran from 23:29:14 through 23:51:06 UTC on baseline
`4c72114a55a9425d4af743a72a71e4c58a532d2f` plus the recorded working-tree inputs.
The controller verified `sourceInputsUnchanged: true` with no changed inputs.
The result is **FAIL**; no production-readiness claim follows from this archive.

The retained [manifest](manifest.json) lists original paths, byte counts and SHA256
hashes; [manifest.sha256](manifest.sha256) protects that inventory. Artifacts were
copied without editing their bytes. XML and artifact hashes were verified, and
an exact scan for configured credential values found no matches. Full V8 coverage,
duplicate HTML and application raw logs were not copied.

| Scope | Result at this run |
| --- | --- |
| Root unit | 2646 passed, 3 failed, 2649 total |
| Additional unit | 18 passed |
| Node | 110 files passed; TAP 505 passed, 2 skipped, 0 failed (parent tests included) |
| Python | 1225 JUnit-counter cases, 0 failures/errors, 12 skips; 106 files passed, 1 skipped, 19 operational files blocked |
| Commerce | 22 commands passed; 136 JUnit leaf passes, 1 skip |
| Native/imported | All 6 commands passed, including original PDIM 54 cases |
| Focused Chromium | 5 passed |
| HTTP | 478 passed, 5 failed, 9 skipped across 21 files |
| 80 pages | 80 render observations passed; `PASS_WITH_UNTESTED_CATEGORIES`, sealed non-ML readiness boundary |
| Bounded HTTP | 10/20 worker phases passed; distinct from global capacity |
| Operations/checks | Recovery/operational commands, build, types, lint and production audit passed |
| Coverage/evidence | Coverage threshold and strict platform/remediation gates failed |

The three unit failures concern a replaced beat prompt and moved media-job/helper
boundaries. The five HTTP failures need their actual authorization/client-risk
contracts checked before reclassification. The coverage run measured 12.97% lines,
12.85% statements, 8.51% functions and 8.58% branches; it also excluded one dormant
StudioLoader file after an invalid Wouter import prevented transformation.
These are observations from this specific run, not a verdict on later repairs.

See the current [consolidated results](../../../../docs/testing/results.md) and
[completion ledger](../../../../docs/testing/completion-execution-plan.md)
for later rechecks. Do not add overlapping unit/coverage/TAP counts into a grand
total, count a skip as a pass, or use page renders as proof of every feature.
