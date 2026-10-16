---
name: App Storage runtime attachment
description: Explicit bucket access can work despite absent default attachment and denied GCS administrative reads
---
Verify actual runtime bucket access and privacy before using App Storage for
recovery data. A bucket environment variable alone is not provisioning evidence.

**Why:** An empty default-bucket identifier and a stale configured bucket initially
failed. The owner's explicit Replit bucket worked. GCS bucket metadata/IAM reads
still returned 403, but those administrative permissions are not supported
requirements for Replit managed App Storage. Imposing them incorrectly blocked
authorized recovery. A real retained backup and downloaded-copy restore passed.

**How to apply:** Use the explicit owner bucket through supported authenticated
object operations. Consult current Replit documentation for managed privacy and
persistence guarantees; confirm a non-sensitive canary is readable authenticated
and denied anonymously. Keep generation-bound CRC/SHA readback and isolated restore
checks. Describe retention as until explicit deletion, not WORM or a locked duration.
Do not demand GCS IAM/PAP/retention-policy reads or screenshots from the user.

## Large filesystem recovery

The user expects persistent storage disk usage to have been replaced by the
configured Replit App Storage bucket. Backup/restore integration alone does not
satisfy that expectation for live PDIM persistence.

**Why:** The user reiterated this requirement after a local quota failure
prevented awareness ingestion.

**How to apply:** Treat bucket-backed live persistence as unfinished until
acknowledged writes and recovery are verified against the bucket. Preserve
existing records and PDIM interfaces; never describe space reclamation or a
restart as completing that migration.

Stream backups directly to private storage and compare the generation-pinned
download against quiesced originals. Do not stage both a compressed archive and
an extracted verification copy on local disk.

**Why:** Local staging exhausted a hidden quota despite ample reported free space;
streaming and readback comparison verified the full filesystem backup without
that extra allocation.

**How to apply:** Keep root runtime data separate from unencrypted source capsules,
without excluding nested source datasets by accident. A release bootstrap snapshot
is not continuous backup of later production writes; never describe it as such.