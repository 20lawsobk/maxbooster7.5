---
name: Workflow duplicate process trees
description: Repeated workflow restarts can orphan complete dev-server and MaxCore trees, exhausting threads and killing Vite's esbuild worker
---

Repeated restarts of the application workflow can leave older `npm run dev` process groups and their MaxCore clusters alive. `stopWorkflow` may report success while its child process group continues serving; a new start can then hit `EADDRINUSE` on a sidecar port. The resulting thread pressure can also kill Vite's esbuild service, cascading into client 500s, MIME errors, and browser-launch failures even while `/api/ready` remains healthy.

**Why:** A stopped workflow left its prior app and MaxCore child groups alive in this workspace. A later start collided with the old local PDIM listener; workflow state alone did not reveal which process group still owned the services.

**How to apply:** After stopping a workflow, inspect `ps -eo pid,ppid,pgid,args` and listener owners for the app and sidecar ports. Terminate only stale process groups confirmed to belong to this workspace, verify those ports are free, then start exactly one workflow. Do not trust workflow state alone.