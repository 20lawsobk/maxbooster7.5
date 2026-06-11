---
name: Background processes don't survive across tool calls
description: Why nohup/& long jobs vanish between bash calls, and the workflow-based workaround for long typechecks
---

Backgrounded shell processes (`nohup ... &`) are reaped the moment the bash tool call returns — they do NOT persist across separate tool calls. A probe (`nohup bash -c 'sleep 25; echo ALIVE > f' &`, checked in the next tool call) confirmed the sentinel file is never written.

**Why it matters:** any job longer than the bash tool's ~120s ceiling — notably a cold full `tsc` (~3–5 min on this repo) — cannot be run via `nohup &` + poll. The process is dead before the next poll, leaving an EMPTY output file. Empty `tsc` output greps as "0 errors", a dangerous FALSE clean. A pgrep that embeds the search string in its own command line also self-matches, giving a false "still running" reading — don't trust it; check `ps -eo args | grep '[t]sconfig'` (bracket trick) or the done-sentinel instead.

**How to apply:** run long jobs through Replit-managed **workflows**, which persist across tool calls and container restarts. The `tccap` workflow already does this: clears nothing by itself, runs `tsc -p tsconfig.server.json > /tmp/tc_server.txt` then client → `/tmp/tc_client.txt`, then `touch /tmp/tc_done; echo CAPTURE_COMPLETE`. Start it with `restart_workflow` (timeout ~30s just to launch; it keeps running managed after the tool returns), then poll the `/tmp/tc_done` sentinel from later bash calls. The split configs use `.cache/tsbuildinfo.server`/`.client` (base config uses `tsbuildinfo.full` — irrelevant to the split gate); clear the split build-info files first for an accurate cold count. Copy `/tmp/tc_*.txt` to `.local/` immediately on completion — `/tmp` is wiped on container restart. Only trust a count when the done-sentinel exists.
