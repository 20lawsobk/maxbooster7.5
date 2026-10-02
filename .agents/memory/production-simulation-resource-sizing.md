---
name: Production simulation resource sizing
description: Keep production-simulation disk admission from recursively scanning excluded workspace data.
---

Use a non-recursive filesystem-allocation upper bound for production-simulation scratch sizing when all copied build inputs and the disposable destination share the workspace filesystem. A recursive `du -sb` of the workspace walks `.git`, local state, caches, and other deployment-excluded content before filtering begins. Verify the relevant source paths share the target filesystem before relying on this bound; if they do not, account for each source filesystem or measure only the filtered member set.

Mount-wide free space from `df` is not proof that a workspace or scratch path can accept a large write: hidden per-workspace or path-specific quotas can return `EDQUOT` while the mount still reports ample space. Separate mounts such as `/tmp` and `/home/runner` can have different limits, so relocating a multi-gigabyte copy is not automatically a capacity fix.

**Why:** The full-workspace scan traversed tens of gigabytes and delayed the filtered copy without improving the conservative disk-admission decision. Production restore attempts also hit quota errors on workspace, `/tmp`, and an ephemeral home overlay despite large `df` availability.

**How to apply:** Keep the simulation's existing free-space reserve and estimate scratch conservatively from filesystem allocation. Check path-specific quota using supported controls where possible; otherwise use bounded probes before large copies and preserve failure evidence before cleanup. Do not reintroduce an unfiltered recursive size scan before the copy stage or treat `df` alone as quota headroom.