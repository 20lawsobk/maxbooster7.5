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