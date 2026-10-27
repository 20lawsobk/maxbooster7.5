# Published migration target integrity recheck

The previous focused cohort did not certify the later recovery guard. This new stable-source receipt runs 25 passing JUnit leaf cases: 16 migration fault/restart cases, two canonical PDIM immutable-replica cases, one root-fabric regression and six Neon schema contracts. It proves that missing or corrupted published target bytes retain the healthy original source and conservative accounting until the target is recovered; it also checks real SQL fencing, filesystem bytes, local PDIM Lua, late writers, target-key rotation and schema requirements.

Command and exact source SHA256 values are in receipt.json. Fixtures use disposable Unix-socket-only PostgreSQL and no application/provider credentials. Source inputs remained unchanged. This is not a deployed migration, complete-platform coverage or global launch certificate.
