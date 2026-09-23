---
name: App Storage runtime attachment
description: A configured bucket name did not prove usable runtime access
---
Verify actual runtime bucket access and privacy before using App Storage for
recovery data. A bucket environment variable alone is not provisioning evidence.

**Why:** The default-bucket sidecar returned an empty identifier while an existing
bucket variable was populated; both explicit SDK access and metadata/IAM checks
failed. The installed SDK reduced the underlying failure to `Error code undefined`.
That opaque error did not establish whether a bucket existed elsewhere.

**How to apply:** Check attachment/access through the App Storage workspace tool,
then inspect privacy and retention. Fail before uploading a database dump when
these checks cannot complete; do not substitute a configured name for evidence.