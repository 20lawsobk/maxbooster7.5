---
name: Workflow duplicate process trees
description: Repeated workflow restarts can orphan complete dev-server and MaxCore trees, exhausting threads and killing Vite's esbuild worker
---

Repeated restarts of the application workflow can leave older `npm run dev` process groups and their MaxCore clusters alive. The resulting thread pressure kills Vite's esbuild service, which cascades into client 500s, MIME errors, and browser-launch failures even while `/api/ready` remains healthy.

**Why:** A clean workflow stop removed the stale process group; one fresh start restored Vite transforms and browser rendering without code changes.

**How to apply:** When Vite reports `The service is no longer running` or Chromium cannot create threads, inspect process groups before editing source. Stop the workflow cleanly, confirm no old app/MaxCore/esbuild processes remain, then start exactly one workflow.