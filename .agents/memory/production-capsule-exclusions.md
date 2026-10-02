---
name: Production capsule exclusions
description: Separate ignore rules are required for whole-directory deployment capsules.
---

Whole-directory capsule packing does not apply `.dockerignore`. The app-remainder scanner may honor it, while a separate tar stream packs its target directory directly. Keep explicit exclusions per capsule for workspace credentials and mutable/generated data, and retain only reviewed runtime inputs such as the manifest-validated serving model and named training corpora. If an opt-in feature depends on excluded generated state, fail the deployment preflight rather than shipping a dangling pointer.

**Why:** The app-remainder scan was protected by `.dockerignore`, but the MaxCore capsule still included credential/config files and mutable candidate/pulled training artifacts because it bypassed that scan.

**How to apply:** For each whole-directory capsule, inspect its own input tree, pass narrowly scoped exclusions to the packer, and test membership through the real tar/restore path. Verify required runtime files and supported source/corpora remain, and keep exclusions from matching nested dependency internals unintentionally.

## Publishing-layer exclusions require independent verification

Do not assume the platform's Repl-layer uploader applies the same ignore rules
as the app's capsule scanner.

**Why:** A Reserved VM publish completed packing and the image-size preflight,
then failed uploading the Repl layer with permission denied on an archived
simulation's PulseAudio symlink under `.local`. Both `.dockerignore` and
`.gitignore` excluded `.local`, yet the uploader still accessed it. Thus the
preflight's excluded-byte accounting did not prove the final image size.

**How to apply:** Verify actual bundling exclusions, including build-only
recovery snapshots. Preserve the user's retained simulation copies; do not
delete them or manufacture missing audio/socket targets to silence warnings.
Use the specific failed build's logs as evidence. A live URL returning 200
or general deployment metadata reporting success does not establish that a
new publishing attempt succeeded.