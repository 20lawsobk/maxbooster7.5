---
name: Production capsule exclusions
description: Separate ignore rules are required for whole-directory deployment capsules.
---

Whole-directory capsule packing does not apply `.dockerignore`. The app-remainder scanner may honor it, while a separate tar stream packs its target directory directly. Keep explicit exclusions per capsule for workspace credentials and mutable/generated data, and retain only reviewed runtime inputs such as the manifest-validated serving model and named training corpora. If an opt-in feature depends on excluded generated state, fail the deployment preflight rather than shipping a dangling pointer.

**Why:** The app-remainder scan was protected by `.dockerignore`, but the MaxCore capsule still included credential/config files and mutable candidate/pulled training artifacts because it bypassed that scan.

**How to apply:** For each whole-directory capsule, inspect its own input tree, pass narrowly scoped exclusions to the packer, and test membership through the real tar/restore path. Verify required runtime files and supported source/corpora remain, and keep exclusions from matching nested dependency internals unintentionally.