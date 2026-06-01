---
name: typecheck OOM vs. heap bump
description: Why the full-project tsc --noEmit OOMs, and the trade-off of the heap-bump fix
---

# Full-project typecheck: OOM vs. slow

The `typecheck` workflow (`tsc --noEmit` over client+shared+server) is extremely heavy on this monorepo.

- With the **default Node heap** it OOMs around ~4GB and crashes — historically this also starved tsx and could take down the running app at boot.
- With **`NODE_OPTIONS=--max-old-space-size=6144`** it does **not** OOM, but a cold full check runs **very slow (>9 min, no output until the end)** and drives container memory to ~97% (7.7/7.9GB) when run **alongside** the `Start application` workflow — at which point the app's `/api/ready` starts timing out.

**Fix applied:** the `typecheck` workflow command carries the `--max-old-space-size=6144` flag (kept idle / not auto-started).

**Why:** the heap bump removes the crash; the remaining cost is time + memory, not OOM.

**How to apply:**
- Run `typecheck` **standalone** — stop/avoid contention with `Start application` (and other node workloads) or it will push memory to the edge and starve the app.
- Do not foreground a full `tsc` in a bash tool call: it exceeds the 2-min tool cap. Run it as the workflow (unbounded) or as a detached background process and poll.
- The real long-term fix for the slowness (not just the OOM) would be splitting into TS project references / scoping the check — larger, riskier work, not yet done.
- Gotcha: `pkill -f 'tsc ...'` / `pgrep -f 'bin/tsc'` will match the killing shell's **own** command line and self-kill (exit 137). Split the pattern in a var (e.g. `PAT="bin""/tsc"`) or kill by PID file. Also note the IDE runs `tsserver.js` (language server) continuously — that is NOT a stray `tsc --noEmit` run.
