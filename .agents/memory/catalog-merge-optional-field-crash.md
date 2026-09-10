---
name: Merge-path non-null assertion crash
description: A `!` non-null assertion on an optional externally-sourced field passes typecheck but only crashes when two imported items collide on the merge/dedup branch, not when an item takes the create branch.
---

## The pattern

Catalog/data-import code that merges records from external APIs (e.g. matching an incoming item against an existing DB row by title/UPC and merging fields in) typically has two branches: "create new" and "merge into existing." An optional field from the external API (e.g. a release's `tracks` list) is populated for most items but genuinely absent for some (a single without a track listing, a rate-limited sub-fetch, etc).

If the merge branch reads that optional field with a non-null assertion (`field!.length`) instead of optional chaining (`field?.length`), it typechecks cleanly and works for every item that goes through "create" (which may not touch the field at all, or handles its absence separately). It only throws the first time an item whose field is genuinely missing collides with an existing row and takes the merge branch — e.g. a duplicate/re-issued title, a deluxe edition, or the same release scanned from two different platforms in the same import run.

**Why this matters:** verified live — importing ~90-100 catalog items from a single real artist produced a ~20% failure rate purely from this one assertion, because that catalog had several duplicate-titled entries (live albums, deluxe reissues, the same album appearing via two platforms) feeding the merge branch. A single-item smoke test, or a test artist with no duplicate titles, would never exercise this path and would report success while ~1 in 5 real users' imports silently dropped items.

**How to apply:** when auditing or writing any merge/dedup logic that ingests records from an external or scanned source, grep the merge branch specifically for `!` non-null assertions on fields the interface marks optional (`field?:`). The merge branch is the one that only runs on real-world duplicate collisions, so bugs there hide behind low real-world duplicate rates until the code runs at scale on a real, messy catalog.
