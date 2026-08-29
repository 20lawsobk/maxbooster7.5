---
name: ShellExec background task nesting trap
description: Combining run_in_background:true with an inner shell-level &/nohup/disown makes the tracked task exit immediately and untrackable, even if the real process survives — put the long-running command directly as the top-level command instead.
---

## The trap

`ShellExec` with `run_in_background: true` already gives you a trackable,
Monitor-able background task. If the command you pass ALSO backgrounds
itself internally (a trailing `&`, wrapped in `nohup ... &`, followed by
`disown`), the OUTER task — the one `run_in_background` and `Monitor` are
actually watching — finishes and exits as soon as it has spawned and
disowned the inner process. From that point on:

- `Monitor` immediately reports the task has already finished (nothing left
  to watch), even though the real long-running command may still be
  starting up or running.
- Whether the inner process actually survives independently is unreliable —
  it can end up silently killed when the shell session backing the outer
  task is torn down, `nohup`'s SIGHUP protection notwithstanding.

## How to apply

Never nest backgrounding. Pass the real long-running command directly as
the top-level `command` with `run_in_background: true` and nothing else
managing backgrounding inside it, e.g.:

```
command: "long_running_thing --flag > /tmp/out.log 2>&1; echo EXIT:$? >> /tmp/out.log"
run_in_background: true
```

Then arm `Monitor` on the returned task id for a pattern like `EXIT:\d+`.
This is the only combination that keeps the task trackable end-to-end.
