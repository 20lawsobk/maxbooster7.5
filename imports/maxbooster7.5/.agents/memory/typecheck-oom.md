---
name: Resource-bounded whole-program typechecks
description: Avoid checker/app memory contention and distinguish complete checks from partial evidence.
---

**Rule:** Run full server and client checks separately from the running app.
Keep typechecking out of the application's startup command.

**Why:** The app and compiler consume additive memory. Concurrent checks have
been killed without diagnostics or stalled the preview, concealing real defects.

**How to apply:** Check the available compiler and current configurations first.
With the native Go checker, pausing the app and using `GOMEMLIMIT=3GiB GOGC=50`
allowed whole-program checks to finish where unconstrained concurrent checking
was killed. This is a soft Go memory target, not a guaranteed RSS ceiling.
Restore the preview afterwards; remember startup resumes enabled automation.

**Rule:** Historical error counts and failures do not establish current results.

**Why:** Earlier notes incorrectly generalized failed or incomplete runs into
permanent claims that the native checker could not work or the tree was always red.

**How to apply:** Require a completed exit status for each configuration.
`--listFilesOnly` proves resolution, not type correctness. If chained checks use
`&&`, server failure means the client remains unmeasured. Per-diff checks omit
dependents and are local hints, not whole-program regression gates.

**Rule:** Use tracked background tasks for long checks, not detached shell jobs.

**Why:** Shell-detached jobs can be reaped when the tool exits, resembling OOM.
Avoid broad `pkill -f` patterns that match their own shell command.

**Rule:** Keep incremental compiler caches outside dependency installation trees.

**Why:** Reinstalling dependencies can erase those caches and force a cold,
memory-heavy check. Inspect present configuration rather than assuming paths.
