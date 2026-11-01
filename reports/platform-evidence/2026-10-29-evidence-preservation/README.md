# Preserved candidate evidence and subsequent integration

The three candidate cohorts below are byte-for-byte copies of their completed
outside-workspace evidence. Their original manifests, failure logs, proposed
source, instructions and historical statuses remain intact. No candidate
`NOT_LANDED` or `NOT_RUN` field has been rewritten after the parent's integration.
The implementation is now in the local `main` working tree above checkpoint
`d9d04498`; this preservation operation makes no source change or commit.

| Preserved cohort | Files | Bytes | Original scope |
| --- | ---: | ---: | --- |
| [Case identities](../2026-10-28-case-identity-repair-candidate/README.md) | 59 | 850,761 | 90 identity occurrences; original inputs/assertions retained. |
| [Commerce and catalog](../2026-10-29-commerce-catalog-repairs/README.md) | 40 | 767,314 | Explicit legacy subject selection; retained report-source classification. |
| [Access policy](../2026-10-29-access-policy-candidate/README.md) | 11 | 75,619 | Two denial bodies, actual anonymous plans, ten session-policy cases and owned SQL restoration. |

All 110 copied files match their original bytes. The copier verified 89 original
manifest entries, rejected dependency/cache copies, and copied no symlinks or
files at or above 100 MiB. Configured credential values were compared in memory;
no matches were found and no values were retained. This is a bounded configured
value check, not a claim that every possible unknown secret has been detected.

[The copy inventory](copied-files.json) retains every original source location,
repository destination, byte count and SHA-256. [The receipt](receipt.json)
records exclusions, counts, actual execution references and Git-ignored raw
logs that the parent must explicitly retain when staging. Original historical
manifests remain authoritative for their original file sets; the copy inventory
also binds each manifest itself.

## Subsequent actual integration results

The separate [main HTTP receipt](../2026-10-29-main-access-policy/receipt.json)
records the real `server/index.ts` entrypoint with disposable PostgreSQL, local
PDIM and denied external egress. Its [raw summary](../2026-10-29-main-access-policy/http/summary.json)
and [JUnit](../2026-10-29-main-access-policy/http/integration.junit.xml) contain
110 passing leaf cases, zero failures and zero skips. All ten added session
policy cases ran; application, test and analytics descendants have empty
remaining-process lists, and PostgreSQL cleanup passed. The complete source
inputs stayed unchanged during this subset invocation.

The separate [commerce receipt](../2026-10-29-integration-rechecks/commerce/results.json)
and [JUnit](../2026-10-29-integration-rechecks/commerce/legacy-beat.xml) record
14 passing SQL-backed money-loop cases, zero failures and zero skips. The
actual adapter command consumes the registered subject selector. Its raw log
records owned PostgreSQL/Redis shutdown and temporary-file removal.

These results qualify their executed subsets. They do not promote old candidate
proof into a new canonical master, establish deployed provider delivery, close
all feature checks, mark a whole page Green, or grant production approval.
The parent still needs the fresh frozen full master and complete launch gates.
Test exercises overlap, so their counts are not added into a platform total.

## Read-only replay

From the repository root:

```sh
python3 reports/platform-evidence/2026-10-29-evidence-preservation/verify-copy.py
```

This standard-library verifier checks all copied bytes, the six referenced
execution artifacts and exact retained XML leaf counts. It writes no file and
runs no product tests. It exits nonzero for a missing, redirected, changed,
duplicate, oversized or unadmitted artifact, or differing recorded outcomes.
The script can also take `--repo /path/to/checkout`.

Use the current test instructions in [the testing guide](../../../docs/testing/README.md)
and [measured completion](../../../docs/testing/measured-progress.md) to execute
new work. Historical test copies under `reports/` are retained replay evidence;
the canonical source runners own current execution. Preserve earlier failures
and their original manifests when later fixes or source epochs supersede them.
