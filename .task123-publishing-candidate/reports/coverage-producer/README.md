# Isolated Node coverage evidence

These attempts belong to the first standalone source-mapped Node producer.
They do not replace `reports/test-verification/coverage`, change its denominator,
or establish production readiness. Usage and boundaries are documented in
[node-coverage-producer.md](../../docs/testing/node-coverage-producer.md).

| Attempt | Actual result | Interpretation |
| --- | --- | --- |
| [first-node](2026-10-27-first-node/receipt.json) | Test/producer exit 1 | Installed `tsx` omitted original `sourcesContent`; incomplete evidence was rejected. |
| [node-with-originals](2026-10-27-node-with-originals/receipt.json) | Collected, unmerged | Explicit owned native coverage output retained loader source content. This early attempt predates whole-source inventory checks. |
| [final-node](2026-10-27-final-node/receipt.json) | Behavioral exit 0; collection failed | Another source file changed during execution. Before/after inventory digests differ; the attempt is not stable proof. |
| [stable-node](2026-10-27-stable-node/receipt.json) | Two assertions passed; collected, unmerged | Whole selected source/config inventory was stable. One internal-inspector profile retained nine production scripts. All nine complete maps are incompatible with the recorded global baseline. |
| [framework tests](framework/receipt.json) | Eight passed; none failed/skipped | Negative provenance cases and actual inspector/UTF-16 fixture, rerun after continuation. |
| [process-cleanup framework tests](framework-process-cleanup/receipt.json) | Thirteen passed; none failed/skipped | Includes actual TERM-resistant descendants, timeout/output escalation, direct exit preservation and spawn failure. |
| [safe P1 admission framework tests](framework-process-admission/receipt.json) | Fourteen passed; none failed/skipped | Also rejects a real PostgreSQL suite before execution/output; P1 admits only the proven in-process replica suite. |
| [stable artifact audit](framework/stable-artifact-audit.json) | Retained evidence validated | Raw counter/manifest/map/original-source hashes and nine converted file records revalidated; historical whole-tree digest does not certify subsequent dependency changes. |
| [final analytics/dependency producer](2026-10-27-analytics-dependencies-node/receipt.json) | Two assertions passed; collected, unmerged | Final P1 allowlist and owned cleanup applied after source freeze; selected inputs unchanged, zero remaining live group members. Nine complete maps remain incompatible with the recorded global profile. |

| [committed-source producer recheck](2026-10-28-a1603b13-node/receipt.json) | Two assertions passed; collected, unmerged | Sourcea1603b13, unchanged selected inputs, oneprofile/ninefiles, nine incompatible complete maps and complete owned cleanup. |

The stable run's source revision was `c06fbecdb32a5c3b76662f631604bfd9abac386b`
with uncommitted code/configuration additions identified in its full inventory.
Its selected-input SHA-256 was
`c91dae9af283638fd45b310ca7fad5663092e204eca6d630d8933a96152e268e`.
Subsequent dependency changes require another versioned stable-source run before
claiming that those revised inputs were exercised. The producer's inventory
algorithm differs from the master's; do not compare their digest strings as if
they described the same selected files.

The final producer selected-input SHA-256 was
`5279598cd10c71406a9674a1a20387bc1ac705ae4dc5fb54c1d3ac82db829976`.
This uses the collector's selection algorithm, with the documented omissions;
it is not the master or portable release inventory digest. Its cleanup receipt
records no remaining live owned-group members. The admitted canonical suite is
in-process and requires no independent PostgreSQL session.

The failed attempts remain intact. Native corroborating counters and inspector
counters describe overlapping execution and are never summed. No global
percentage increase has been claimed.
