---
name: Dev server runs without hot-reload/watch
description: This project's dev workflow launches the server with plain tsx (no --watch), so edited source is not live until the workflow is explicitly restarted — read this before trusting any "I fixed it and tested it" result.
---

## The rule

The "Start application" workflow launches the Node server via a script that runs
`npx tsx server/index.ts` with no `--watch` flag (no nodemon/tsx-watch either).
Editing a `.ts` source file does **NOT** change the behavior of the already-running
process. The old code keeps serving requests — including to curl/API tests, E2E
browser tests, and audit scripts — until the workflow is explicitly restarted.

**Why this matters:** a fix can be 100% correct on disk, and a subsequent
verification pass (by the same agent, a different agent, or a testing subagent)
can still "confirm" the bug is present, because it is testing the OLD in-memory
code. This produces a false "still broken" report even though the diff was right.
Conversely it can also produce a false "confirmed working" report if the
verification happens to pass against stale code by coincidence — either direction
is possible, so a passing test is not proof the *current* diff is what ran.

Concretely observed once: an overlap-preserving segment-split fix in a comping
service was correct and complete on disk, but a controlled curl+DB reproduction
kept showing the old destructive (pre-fix) behavior across a whole debugging
session. Only after an explicit workflow restart did the same test show the
correct post-fix behavior. A render-pipeline anomaly investigated in the same
session (one 404 on a freshly rendered file that could not be reproduced in 5+
follow-up attempts) is also most plausibly explained by this same stale-process
condition, since it was observed in the same pre-restart window.

## How to apply

- After ANY edit to server-side source — whether you made it or a subagent did —
  restart the "Start application" workflow **before** treating a test against
  the live server as evidence of anything about that edit.
- If a live-server test result seems to contradict what the code on disk clearly
  says, the very first hypothesis to rule out is "the running process predates
  this edit" — restart and re-test before spending time on more exotic theories.
- This applies transitively to audits/scripts that probe the live server
  (e.g. an endpoint audit script): re-run them fresh after a restart if any
  server code changed since their last run, or their "confirmed clear" result
  may itself be validating stale code.
- Applies to this specific project's current dev launch command; if the launch
  script is ever changed to add `--watch` or a supervisor with file-watching,
  re-verify whether this caveat still holds before relying on it.
