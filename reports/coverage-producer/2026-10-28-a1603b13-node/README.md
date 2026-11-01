# Frozen-source Node producer recheck

The existing two-assertion replica suite passed from committed source
`a1603b13b6352a978e3877a2f43f1ccd98a98a18` on October28,2026.
The collector retained one real inspector profile and nine executed production
files. All nine complete Istanbul maps remain incompatible with the recorded
global profile. The counters remain **unmerged** and do not raise global
coverage or establish full-platform acceptance.

The selected source-input digest was unchanged before/after execution:
`41d4c03760221b484d235a49c15ec80702cd5d35be045393b4f069fd842729d4`.
This collector uses its documented selection algorithm, including its stated
omissions; it is not the master's or release inventory digest. The actual test
exit was0, no timeout/output bound was hit, and owned process-group cleanup
completed with zero remaining live members. Child application credentials were
not inherited. The native corroborating profile overlaps the inspector data
and is not added to those counters.

[Usage and limits](../../../docs/testing/node-coverage-producer.md) document the
exact command, prerequisites, allowlist, process ownership and map requirements.
`receipt.json` and adjacent raw profiles/maps retain actual source and runtime
provenance. The archive manifest below hashes every retained cohort artifact.
