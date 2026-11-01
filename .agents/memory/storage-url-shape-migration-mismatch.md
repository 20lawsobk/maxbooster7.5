---
name: Storage-URL-shape migration mismatch
description: Code written when files lived on local disk can silently stop working after a service migrates to a storage-backend-issued URL, because the old local-path check just returns false instead of erroring.
---

Rule: when a service migrates from storing files as local filesystem paths to storing them as backend-issued relative URLs (e.g. /api/storage/file/ followed by a key), any older code that still checks "does this look like / exist as a local path" (fs.existsSync(path.join(process.cwd(), storedValue)) or similar) does not throw or warn when given the new URL shape — it just evaluates false, and the calling feature silently degrades (e.g. artwork quietly omitted from a generated package) instead of failing loudly or working correctly.

**Why:** found this exact bug in a legacy ZIP-packaging code path in this app that pre-dated the migration to PDIM-backed storage URLs. In that instance the code path turned out to be unreachable dead code, but the pattern itself is a real risk anywhere it IS reachable.

**How to apply:** after any migration of a stored value's shape (local path → service URL, string → object, etc.), grep for every place the OLD shape is tested for or parsed, not just every place it is written. A stale reader that fails closed (returns empty / omits) rather than throwing is much harder to notice than one that crashes.
