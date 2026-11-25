#!/usr/bin/env bash

# Serialize app instances that share local PDIM files. Hold the lock in the
# supervising shell for the full lifetime of the workflow; never remove the
# lock file because open descriptors provide the ownership fence.
dev_acquire_instance_lock() {
  local root="$1"
  local lock_id
  if [[ "${MAXBOOSTER_DEV_LOCK_HELD:-}" == "1" ]]; then
    return 0
  fi
  if ! command -v flock >/dev/null 2>&1; then
    echo "[start-dev] FATAL: flock is required to prevent concurrent PDIM owners" >&2
    return 1
  fi

  lock_id="$(printf '%s' "$root" | sha256sum | cut -c1-16)"
  exec {MAXBOOSTER_DEV_LOCK_FD}>"${TMPDIR:-/tmp}/maxbooster-dev-${lock_id}.lock"
  flock -x "$MAXBOOSTER_DEV_LOCK_FD"
  MAXBOOSTER_DEV_LOCK_HELD=1
}

_owned_descendants() {
  local parent="$1"
  local child
  while IFS= read -r child; do
    [[ -n "$child" ]] || continue
    _owned_descendants "$child"
    printf '%s\n' "$child"
  done < <(ps -o pid= --ppid "$parent" 2>/dev/null || true)
}

_owned_process_is_alive() {
  local state
  state="$(ps -o stat= -p "$1" 2>/dev/null)" || return 1
  [[ -n "$state" && "$state" != Z* ]]
}

# Replit may signal the workflow shell while npm/npx/tsx grandchildren remain.
# Signal the complete owned tree, allow the app's graceful shutdown window, then
# force-stop only the PIDs this workflow started so stale owners cannot keep
# writing shared local PDIM files after a replacement starts.
dev_stop_owned_tree() {
  local root="$1"
  [[ -n "$root" ]] || return 0
  _owned_process_is_alive "$root" || {
    wait "$root" 2>/dev/null || true
    return 0
  }

  local -a tree=()
  mapfile -t tree < <(_owned_descendants "$root")
  local pid
  for pid in "${tree[@]}" "$root"; do
    kill -TERM "$pid" 2>/dev/null || true
  done

  local attempt alive
  for attempt in $(seq 1 300); do
    alive=0
    for pid in "${tree[@]}" "$root"; do
      if _owned_process_is_alive "$pid"; then
        alive=1
      fi
    done
    [[ "$alive" == "0" ]] && break
    sleep 0.1
  done

  if [[ "${alive:-0}" != "0" ]]; then
    for pid in "${tree[@]}" "$root"; do
      kill -KILL "$pid" 2>/dev/null || true
    done
  fi
  wait "$root" 2>/dev/null || true
}
