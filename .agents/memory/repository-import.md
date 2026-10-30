---
name: Repository import constraints
description: External blockers observed while importing Max Booster from GitHub.
---

The upstream GitHub LFS endpoint rejected model downloads because the repository exceeded its LFS budget. An embedded Git reference also has no configured submodule URL.

**Why:** These are upstream content-availability problems, not application errors. Source files were imported unchanged, with affected model files retained as LFS pointers; this does not establish runtime readiness.

**How to apply:** Check `imports/IMPORT_STATUS.md` before configuring the imported application. Do not treat pointer files as usable model weights or claim the entire upstream content is available. Recheck upstream access before attempting to retrieve missing assets.

Do not interpret this import's LFS failure as proof that the application's default startup or packaging is blocked.

**Why:** During import, attention was incorrectly focused on recovering legacy model blobs before checking whether the default application path needed them. The user pointed out the built-in replacement. Determine the actual runtime requirement before asking the user to change GitHub billing or recover legacy content.

**How to apply:** Trace the configured release mode and required model state first. Keep source completeness, release packaging, and model-generation readiness distinct.
