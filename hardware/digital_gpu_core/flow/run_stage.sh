#!/usr/bin/env bash
# Centralized stage runner for the RTL-to-GDSII flow.
#
# Every stage script up to now was invoked with a bare `openroad -exit
# flow/stageN.tcl`. Two real gaps that opened up:
#
# 1. No multi-threading. This container has 4 vCPUs (confirmed via nproc),
#    but no invocation ever passed OpenROAD's own `-threads` flag (confirmed
#    it exists via `openroad -help`: "-threads count|max  use count
#    threads"). A live detail-route run showed 4 OS threads in
#    /proc/<pid>/status but ~99% aggregate CPU the entire time it ran --
#    i.e. the real parallel algorithms (global_placement, global_route,
#    detailed_route's worker-based routing) were doing their heavy
#    computation on one effective thread, leaving 3 cores idle. Default
#    here is 3, not the full 4: this design's per-thread memory scaling
#    under detailed_route is unmeasured, and the container has already hit
#    two real OOM kills this session, so one core is deliberately left as
#    headroom rather than assuming max thread count is free. Override with
#    OPENROAD_THREADS=n for a specific run.
#
# 2. No real per-stage timing/memory data. /usr/bin/time -v is not
#    installed in this sandbox, so bottleneck claims for early stages were
#    based on manual, gap-prone `ps`/`free` snapshots. This polls the
#    kernel's own VmHWM (peak resident set size, monotonically
#    non-decreasing for the life of the process -- not sampled/guessed)
#    every 5s and reports real elapsed wall-clock + real peak RSS when the
#    stage finishes, so future bottleneck-hunting has real numbers per
#    stage instead of impressions.
#
# Usage:
#   flow/run_stage.sh <stage.tcl> <log_prefix>
#   OPENROAD_THREADS=3 SECTION_INPUT_DB=... SECTION_OUTPUT_PREFIX=... \
#     SECTION_END_ITER=3 flow/run_stage.sh 05b_detail_route_section.tcl /tmp/detail_route_s1
#
# log_prefix.log      = normal openroad stdout/stderr (unchanged behavior)
# log_prefix.mem      = "<epoch> <VmHWM_kb>" samples every 5s while it runs
# log_prefix.summary  = final elapsed_seconds / peak_rss_mb / exit_status

set -uo pipefail
cd "$(dirname "$0")/.."

# Fusion lock: the app-start guard (flow/app_start_guard.sh) polls this file for
# the whole lifetime of this script, not just while openroad itself is running,
# so the app cannot come back up during PDK sourcing/setup either. A plain EXIT
# trap covers normal completion, error exit, and this script being signaled --
# it does NOT cover this process itself being OOM-killed, but the OOM killer
# targets the largest resident consumer (openroad, launched below), not this
# lightweight wrapper, so the wrapper reliably survives to clean up the lock
# even when its child does not.
ROUTER_LOCK="/tmp/gpu_core_router_active.lock"
echo "$$" > "$ROUTER_LOCK"
cleanup_router_lock() { rm -f "$ROUTER_LOCK"; }
trap cleanup_router_lock EXIT

source flow/pdk_env.sh

STAGE="$1"
LOG_PREFIX="$2"
THREADS="${OPENROAD_THREADS:-3}"
MEM_CEILING_KB=$((6 * 1024 * 1024))   # 6GiB soft-alert line inside the 8GiB cgroup cap

STDOUT_LOG="${LOG_PREFIX}.log"
MEM_LOG="${LOG_PREFIX}.mem"
SUMMARY="${LOG_PREFIX}.summary"

: > "$MEM_LOG"
START_EPOCH=$(date +%s)

echo "===== run_stage: $STAGE threads=$THREADS start=$(date -u -d "@$START_EPOCH" +%FT%TZ) =====" | tee "$STDOUT_LOG"

# openroad is deliberately NOT on the persistent PATH (see Task #181 /
# toolchain_env.sh) -- fetch it into a throwaway nix-shell for this one
# invocation instead of baking the ~10.5 GiB EDA/CUDA closure into the
# always-on project environment that the deploy build also measures.
./flow/toolchain_env.sh openroad -threads "$THREADS" -exit "flow/$STAGE" >> "$STDOUT_LOG" 2>&1 &
OR_PID=$!

# nix-shell interposes a wrapper process between $OR_PID and the real
# openroad process (nix-shell forks a child shell rather than exec'ing it),
# so $OR_PID's own VmHWM is no longer the real memory consumer. Sum VmHWM
# across the whole live process subtree rooted at $OR_PID instead, so the
# peak-RSS numbers this script reports stay meaningful after Task #181.
collect_pids() {
  local -a frontier=("$1") all=("$1")
  while [ "${#frontier[@]}" -gt 0 ]; do
    local -a next=()
    for status_file in /proc/[0-9]*/status; do
      local cpid ppid
      ppid=$(grep -m1 '^PPid:' "$status_file" 2>/dev/null | awk '{print $2}')
      [ -z "${ppid:-}" ] && continue
      for f in "${frontier[@]}"; do
        if [ "$ppid" = "$f" ]; then
          cpid=$(basename "$(dirname "$status_file")")
          next+=("$cpid")
          all+=("$cpid")
          break
        fi
      done
    done
    frontier=("${next[@]}")
  done
  printf '%s\n' "${all[@]}"
}

PEAK_KB=0
while kill -0 "$OR_PID" 2>/dev/null; do
  SAMPLE_KB=0
  while IFS= read -r p; do
    HWM=$(grep -m1 '^VmHWM:' "/proc/$p/status" 2>/dev/null | awk '{print $2}')
    [ -n "${HWM:-}" ] && SAMPLE_KB=$((SAMPLE_KB + HWM))
  done < <(collect_pids "$OR_PID")
  if [ "$SAMPLE_KB" -gt 0 ]; then
    FLAG=""
    if [ "$SAMPLE_KB" -gt "$MEM_CEILING_KB" ]; then FLAG=" ALERT_APPROACHING_CGROUP_LIMIT"; fi
    echo "$(date +%s) ${SAMPLE_KB}${FLAG}" >> "$MEM_LOG"
    if [ "$SAMPLE_KB" -gt "$PEAK_KB" ]; then PEAK_KB=$SAMPLE_KB; fi
  fi
  sleep 5
done

wait "$OR_PID"
STATUS=$?
END_EPOCH=$(date +%s)
ELAPSED=$((END_EPOCH - START_EPOCH))

{
  echo "stage=$STAGE threads=$THREADS exit_status=$STATUS"
  echo "elapsed_seconds=$ELAPSED"
  echo "peak_rss_kb=$PEAK_KB"
  echo "peak_rss_mb=$((PEAK_KB / 1024))"
} | tee "$SUMMARY"

exit $STATUS
