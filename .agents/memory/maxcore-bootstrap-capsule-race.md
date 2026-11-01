---
name: MaxCore bootstrap capsule-restore race
description: A boot-time provisioning check must disambiguate "dependency missing because a background restore is still in flight" from "genuinely never provisioned" — conflating them causes a permanent degraded-mode latch with no retry path.
---

## The pattern

A supervisor/probe that starts by checking for some dependency (a binary, a
directory, a file) can be racing an **asynchronous background process that
also produces that same dependency** — e.g. a deploy-time asset/capsule
restore kicked off by a startup script, running detached while the main app
process starts up in parallel. If the check treats "not found yet" as
unconditionally "never installed, run the one-shot install/bootstrap now",
that one-shot step fails instantly (the target directory doesn't exist yet),
and if the failure is latched permanently (no retry scheduled), the app is
stuck reporting degraded/unhealthy forever — even though the background
restore would have finished seconds later and nothing was ever actually
broken.

**Why this happened on this project:** a nested vendored workspace was
stripped from the deploy build image (to stay under an image size limit) and
restored via a detached background process racing the main app's boot. The
app's fire-and-forget startup call for that subsystem ran before the
restore landed, saw the binary missing, ran the one-shot bootstrap script
(which fails immediately on a missing directory by design — that part is
correct in isolation), and latched the failure with no code path back to
ever trying again.

## How to apply

1. **Add an independent signal to disambiguate the two cases.** Don't just
   check "is the dependency present" — also check for something that proves
   a restore is plausibly still in flight (e.g. a packed capsule/archive
   still sitting at its pre-extraction path, a lock file, a marker the
   restore script writes). Only fall through to the one-shot
   install/bootstrap path when that signal says "no restore is happening" —
   i.e. a genuine clean checkout or truly-never-installed state.
2. **While a restore is plausibly pending, wait — don't bootstrap.** Poll on
   a short interval (a plain `fs.existsSync` check is cheap), and log at a
   throttled interval so a multi-minute restore doesn't flood the log.
   Escalate the log level (info → warn) after a stall threshold so operators
   can still find a genuinely stuck/failed restore instead of only ever
   seeing quiet lines.
3. **Never permanently latch a provisioning failure.** Whether the failure
   is the "waiting" branch or a genuine bootstrap failure, always schedule a
   backoff retry (capped exponential backoff is fine) instead of setting a
   terminal error state with no path back to retrying. The one-shot
   bootstrap script itself can stay exactly as-is (fast-exit on a missing
   directory is correct) — the bug is entirely in the caller's decision
   about *when* to invoke it and *what to do after it fails*.
4. **Add a re-entrancy guard the moment you add a retry loop to a
   previously call-once-at-boot function.** A scheduled retry can now fire
   while an earlier attempt — which might itself be a slow subprocess taking
   minutes — is still in progress. Without a guard, two overlapping
   invocations can both pass the readiness check and both act concurrently
   (e.g. two children spawned, racing for the same port).
5. **In a multi-worker cluster, a network-based readiness check naturally
   self-heals across all workers** once any one of them wins the race and
   successfully starts the shared resource on a shared loopback port — even
   though the losing workers' own internal "did I spawn a child" flag stays
   false. That asymmetry (`running: false` in N-1 workers, but the actual
   HTTP-based readiness probe reporting healthy everywhere) is fine as long
   as the thing that actually gates the app's health/readiness endpoint is
   the network check, not the per-process internal flag.
