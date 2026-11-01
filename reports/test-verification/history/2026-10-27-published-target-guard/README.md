# Published migration target integrity recheck

The [earlier focused cohort](../2026-10-27-focused-final-hardening/README.md)
remains unchanged. Its 15-case and 17-case fabric receipts did **not certify**
the later published-target-loss-before-source-cleanup guard. This separate,
later receipt supplies evidence for that boundary; it does not retroactively
change the scope of those earlier passing results.

The execution started October 27, 2026 at 17:47:30 America/Detroit (21:47:30 UTC)
and completed in 19.392 seconds with exit 0: 25 passing JUnit leaf cases, zero
failures, zero errors and zero skips. These comprise 16 migration fault/restart cases, two canonical PDIM
immutable-replica cases, one root-fabric regression and six Neon schema contracts.
Within these fixtures, missing or corrupted published target bytes retain the
healthy original source and conservative accounting until recovery. The cases
also check SQL fencing, filesystem bytes, local PDIM Lua, late writers, target-key
rotation and schema requirements.

The command and exact source hashes are in [receipt.json](receipt.json), with
individual cases in [node.xml](node.xml). Fixtures use disposable Unix-socket-only
PostgreSQL and no application/provider credentials. Source inputs remained
unchanged. An independent read-only review confirmed the 25 case results, both
artifacts' byte identity with their executor originals, the recorded log hash,
all eight source-file hashes and the complete source-input digest against the
current checkout. Exact scans against seven configured credential values present
in the executor, plus three credential patterns, found zero matches; credential
values are not recorded.

Run `sha256sum -c SHA256SUMS` from this directory to verify the retained files.
Deployed migrations, complete-platform coverage, provider delivery and global
launch readiness remain separate gates.
