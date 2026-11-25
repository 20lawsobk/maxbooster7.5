---
name: Weave rebase build conflicts
description: Resolving Replit's annotated merge conflicts in tracked generated build output.
---

When a rebase reports annotated conflicts in generated `dist` assets, the merge driver's stage content can itself contain marker text. A normal side checkout may leave that text in the working file. For generated output, restore the clean target-branch tree or rebuild after the rebase rather than hand-merging minified bundles. Resolve source files separately and verify the conflict markers are gone before continuing through the merge-resolution flow.

**Why:** A rebase of large tracked build output left marker-bearing stage content and temporary merge artifacts, so choosing a side from the conflict buffer did not yield clean generated files.

**How to apply:** Use this only during an active rebase. Preserve source-level task changes, keep generated output aligned with the target branch or a fresh build, and never commit temporary merge artifacts.
