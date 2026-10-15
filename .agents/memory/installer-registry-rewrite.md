---
name: Installer registry rewrite
description: Keeping lockfile transport portable after package installation in this workspace.
---

After a package update, review newly changed resolved URLs even when the
previous lockfile used the public registry.

**Why:** The managed installer successfully updated a package but rewrote its
tarball URL to an internal package-firewall host. Local build success would
not establish that an external CI runner can fetch that URL.

**How to apply:** Verify the public registry's version metadata and integrity
against the lock entry before substituting its canonical public tarball URL.
Preserve integrity hashes. Do not bulk-rewrite unrelated lock entries or treat
this transport check as proof of a complete clean install.
