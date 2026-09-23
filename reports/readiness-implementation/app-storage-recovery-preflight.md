# App Storage recovery preflight

The owner authorized private App Storage recovery copies and, after verification,
the additive commerce migrations. PDIM and MaxCore remain exclusively local.

## Result: blocked before backup or migration

### Explicit owner-provided bucket recheck

The owner supplied a specific bucket. It is now configured separately as
`DATABASE_RECOVERY_BUCKET_ID`; existing PDIM/application storage configuration
was not changed. A read-only object listing against that exact bucket succeeded.
This supersedes the earlier inability to access the configured destination.

Bucket metadata and bucket IAM-policy reads each returned HTTP 403. Thus object
access is established, but public-access prevention, uniform access, public IAM
principals, and retention policy cannot yet be independently verified by this
runtime. The default-bucket attachment result below does not negate explicit
bucket access. Do not diagnose this as missing storage or ask for another ID.

No sensitive upload or live migration was performed. Next prerequisite is
bucket privacy/retention evidence or permission to read those controls, plus an
approved recovery-retention duration—not another bucket identifier.

### Earlier default/configured-bucket observations

- The runtime's default-bucket endpoint returned no usable bucket identifier.
- A configured bucket environment variable is present, but SDK access using it
  failed. Bucket metadata and IAM checks could not complete.
- The installed SDK returned a generic `Error code undefined`, so no verified
  private-bucket permission or retention claim can be made. This does not establish
  that no bucket exists elsewhere in the account.
- Documentation identifies the App Storage workspace tool as the manual bucket
  creation/attachment surface. Integration search did not return a matching
  provisioning connector. No unrelated integration was proposed.

No credential values or bucket identifier were printed. No backup data was
uploaded, no source dump was retained, no storage policy was changed, and no
database migration was applied.

## Resume

Create or attach the intended private recovery bucket to this app through the
App Storage tool. Recheck runtime access, privacy policy, and retention before
uploading any database data. Then retain a checksummed backup, restore the stored
copy into isolated PostgreSQL, compare schema and row-content hashes, and apply
only the approved additive commerce migrations transactionally after collision
preflight. Bucket-name configuration alone is not access/privacy evidence.