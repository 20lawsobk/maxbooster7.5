# App Storage recovery preflight

The owner authorized private App Storage recovery copies and, after verification,
the additive commerce migrations. PDIM and MaxCore remain exclusively local.

## Result: blocked before backup or migration

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