---
name: Fabric gateway bucket resolve race
description: TOCTOU race when concurrent uploads auto-create a bucket
---

# Bucket/volume resolve is check-then-create

The S3-like fabric gateway (`artifacts/api-server/src/routes/fabric.ts`)
auto-creates a bucket (pocket) + `root` volume on first upload. The resolve was
`listPockets → find → if missing create`, a TOCTOU race: N concurrent uploads to
a brand-new bucket each see "not found" and each create a duplicate pocket/volume.
Objects then scatter across duplicates and reads resolve to only one → some
objects come back "Object not found".

**How to apply:**
- Serialize the create path per `owner::bucket` key (in-process promise chain);
  reads don't need the lock.
- Resolution is deterministic: when duplicates exist, pick the **oldest**
  (sort by `createdAt`, tiebreak `id`) so reads and writes converge on the same
  pocket/volume even if a duplicate slipped through earlier.
- General rule: any auto-provision-on-first-use path in this codebase needs the
  same serialize + deterministic-pick treatment.
