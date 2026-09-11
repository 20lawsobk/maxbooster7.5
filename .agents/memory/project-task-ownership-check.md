---
name: Project task ownership check before completing
description: How to tell whether a project task showing IN_PROGRESS is actually mine (main agent) to complete, versus owned by an isolated task agent elsewhere
---

## The problem
The lightweight task list shown in project state/View blocks displays state as plain
`IN_PROGRESS` with no visible distinction between a task being worked directly in
this repl (`MAIN_IN_PROGRESS`) and one being worked by an isolated task agent in a
completely separate repl (`IN_PROGRESS`). Both render identically as `"IN_PROGRESS"`
in that summary. Doing substantial direct edits in this repl toward a task's stated
goal does NOT by itself mean that task record is mine to close out — the user may
have separately asked me (main agent) to do the same work directly while an
isolated task agent is independently also working the formal task record.

## How to check before calling markTaskComplete
Just call it — `markTaskComplete({ task_ref, ... })` is authoritative and safe to
attempt speculatively. If the task isn't actually a main-repl in-progress task, it
fails fast with `outcome: "no_active_task"` and an explicit message ("Task #N is
not an in-progress main task on this project") instead of doing anything
destructive. `queryProjectTasks({ taskRefs: [...] })` afterward confirms the same
`state`/`displayState` but does not by itself disambiguate ownership — the
`markTaskComplete` rejection is the actual signal, not the displayed state string.

## What the rejection implies and what to do about it
A `no_active_task` rejection means an isolated task agent (in a separate repl) owns
that task record and will eventually try to merge its own changes into this same
codebase. If I've also been directly editing the same files this session (per
direct user instruction, in Build mode, not via the project-tasks flow), that
merge is a real future collision risk — not hypothetical. Surface this plainly to
the user (by task ref + title, per the standard communication rules) so they can
decide whether to cancel/reassign the isolated task or reconcile the two efforts,
rather than silently leaving both in flight.

**Why:** discovered when a from-scratch direct rewrite of a service (done at
explicit user request across a long session) turned out to exactly overlap an
existing formal project task already assigned to an isolated task agent; the
rejection was the only thing that revealed the dual-ownership situation.
