---
name: Multi-member capsule restore must merge into existing dirs, never replace them
description: Restore logic for a capsule built from an explicit scattered file list (not one whole directory) must merge into pre-existing destination directories, never delete-then-replace them
---

A capsule that packs a whole directory can restore by extracting to a scratch
dir and doing one atomic rename over the (absent) target — the target never
pre-exists because packing that directory deleted it. That swap pattern is
UNSAFE for a capsule built from an explicit list of scattered files (e.g.
specific files inside a directory while deliberately leaving named siblings
in that same directory on disk), because the top-level directory name in the
archive can already exist at restore time, holding exactly the files that
were excluded from the capsule.

**Why:** a blanket `if (existsSync(dest)) rmSync(dest, {recursive}); rename(...)` deletes the ENTIRE pre-existing destination tree at that shared ancestor before extraction, destroying real content that was never part of the capsule at all — not just the untouched sibling file, but anything else nested under that same top-level name.

**How to apply:** restore for a scattered-file-list capsule must recursively MERGE into a pre-existing destination directory — recurse per child, rename only leaf entries that don't already exist at the destination, and only ever delete the scratch/source side after a successful merge. Treat an existing destination that is a plain FILE (not a directory) as a hard failure, since packing should never leave the same path both on disk and inside the capsule. Test this with a fixture where a packed member and an untouched sibling share a parent directory name — a fixture using disjoint top-level names won't catch this bug class.
