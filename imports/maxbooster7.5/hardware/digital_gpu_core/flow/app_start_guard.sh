#!/usr/bin/env bash
# App-start guard: fuses the app workflow and the router job into one coordinated
# system instead of two independent, uncoordinated processes.
#
# Problem this solves: "Start application" and flow/run_stage.sh used to be two
# separate lifecycles that neither knew about the other. Something outside agent
# control (the platform's own restart-on-recovery behavior, tied to the "Project"
# workflow that auto-runs "Start application") brought the app back up WHILE a
# router job was already holding several GB, and the container has no swap -- so
# the combined footprint blew past the 8GiB cgroup ceiling and the kernel killed
# the router job. Confirmed twice via /sys/fs/cgroup/memory.events oom_kill.
#
# Fix: this script IS what the "Start application" workflow now runs. No matter
# who/what triggers that workflow -- the agent, the user, or the platform's own
# recovery -- it will not actually launch the app while a router stage is live.
# It polls a lock file that flow/run_stage.sh maintains for its own lifetime, and
# only execs the real start command once no router stage is running. This makes
# hand-off automatic in both directions instead of relying on the agent to
# remember to stop/restart the app around every router invocation.
set -uo pipefail

LOCK="/tmp/gpu_core_router_active.lock"

# True only if the lock file names a PID that (a) is currently alive AND
# (b) is actually a run_stage.sh/openroad process -- not just any live PID that
# happens to have been recycled into the lock file after the real owner exited.
is_lock_live() {
  [ -f "$LOCK" ] || return 1
  local pid
  pid="$(cat "$LOCK" 2>/dev/null)"
  [ -n "$pid" ] || return 1
  kill -0 "$pid" 2>/dev/null || return 1
  grep -qa "run_stage.sh\|openroad" "/proc/$pid/cmdline" 2>/dev/null || return 1
  return 0
}

# Bounded, not indefinite: Replit's own platform enforces a ~60s "did this
# workflow open its port" timeout and kills the underlying process when it
# gives up, independent of whatever this script's own loop is doing. Waiting
# longer than that here would just get silently killed anyway with no clear
# reason logged. 40s leaves margin under that ceiling: enough to ride out a
# restart that lands in the final moments of a router run or a short gap
# between sections, without pretending we can block for the hours a real
# section can take.
MAX_WAIT=40
WAITED=0
while is_lock_live; do
  if [ "$WAITED" -eq 0 ]; then
    echo "[app-guard] router job active (pid $(cat "$LOCK" 2>/dev/null)) -- deferring app startup until it clears."
  fi
  if [ "$WAITED" -ge "$MAX_WAIT" ]; then
    echo "[app-guard] router job still active after ${WAITED}s -- giving up for this attempt so the platform doesn't kill us mid-wait."
    echo "[app-guard] this workflow needs to be explicitly restarted again once the router job completes."
    exit 1
  fi
  sleep 5
  WAITED=$((WAITED + 5))
done
if [ "$WAITED" -gt 0 ]; then
  echo "[app-guard] router lock cleared after ${WAITED}s -- starting app now."
fi

# APP_GUARD_EXEC exists only so this script is testable in isolation without
# actually launching the real dev server; production always uses the default.
exec ${APP_GUARD_EXEC:-npm run dev}
