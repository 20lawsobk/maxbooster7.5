# Retained failed analytics/dependency release preparation

The actual `release:prepare` command failed after **1,417.375 seconds**, exit 1,
without timing out. It built and round-trip verified the root dependencies,
MaxCore, PDIM and portable CPU Python capsules, then packed the application.
The final **source-during-preparation inventory guard** rejected the attempt.
This was not a capsule packing or round-trip failure. No new prepared release
replaced the previous payload, and no cold-start command ran.

The master-style code/configuration digest remained
`8cad7cae3ab4895c19ba78fba1b7ff5d9670c16a2a4fea7008a3e7631180c6be`
before and after. The release inventory is deliberately broader and includes
ignored generated runtime bundles and image files. That difference does not
permit bypassing the release guard.

[source-drift-diagnosis.json](source-drift-diagnosis.json) and
[source-inventory-after.json](source-inventory-after.json) retain the actual
post-failure admitted inventory and filesystem mutation times inside the attempt:

- The imported API bundle `external/maxcore/artifacts/api-server/dist/index.mjs`
  was overwritten at `2026-10-28T01:46:44.827778Z`; its current SHA-256 is
  `091430c60b16374b2acf14d166782a1db6a5c8c6275be16e2caac7b7a435fc07`
  (1,028,146 bytes). The separately labeled previous successful release had
  `1fca53d852b26931397caaed578cf1c7503749511e7891abfc5839872625b0e9`
  (1,025,205 bytes).
- A new source-local image,
  `external/maxcore/artifacts/ai-training-server/uploads/images/img_c2d04937f6ec4cc8.png`,
  was created at `2026-10-28T01:57:26.396013Z`, SHA-256
  `7568f15aa8c9338a32b0876fc50d89d9048536ac2e4f05ed1fcbf8966899739a`
  (3,393,204 bytes). The canonical retrieval `test_pipeline.py` renders an
  unseeded image in `test_ingest_generated_asset`, using the source-global image
  upload directory without a temporary-directory fixture. Its retained JUnit
  timestamp and final-case duration coincide with this creation. The generated
  file itself is not copied into this evidence archive.
- Directory mutation times also identify imported video `uploads/videos/.tmp`,
  API-spec, root `dist`, `samples` and test paths. Directory timestamps alone are
  not a changed release entry: the inventory records modes and hashes, not times.

The original preparer retained its initial release inventory only in memory and
removed its private work tree on failure. Therefore that complete initial
inventory is **unavailable**; the historical manifest is not represented as an
exact before snapshot of this failed attempt. Future attempts must preserve both
admitted inventories to provide an exact recorded diff.

The command, full sanitized log, driver hash, before/after code-input inventories
and failure are retained in [summary.json](summary.json) and
[prepare.txt](prepare.txt). Verified runtime caches remain private generated
build artifacts and must pass their normal source/policy/checksum gates before
reuse. The previous successful release receipt remains separately preserved.
Production readiness is **false**.
