#!/usr/bin/env bash
# Destructive: invoke ONLY inside the disposable publishing build root.
set -eu
cd "${1:?A disposable build root is required}"
[[ "$PWD" != "/" ]] || { echo "Refusing filesystem-root cleanup" >&2; exit 1; }

# Two independent filesystem operations at a time. More delete workers can
# saturate metadata I/O rather than improve throughput. Never scan first with du.
targets=(.local .cache .agents node_modules/.vite node_modules/.cache)
declare -A active=()
next=0
failed=0
started=$SECONDS
last_report=$SECONDS

stop() {
  trap - INT TERM
  for pid in "${!active[@]}"; do kill -TERM "$pid" 2>/dev/null || :; done
  for pid in "${!active[@]}"; do wait "$pid" 2>/dev/null || :; done
  exit 130
}
trap stop INT TERM

while (( next < ${#targets[@]} || ${#active[@]} > 0 )); do
  while (( failed == 0 && next < ${#targets[@]} && ${#active[@]} < 2 )); do
    target=${targets[next]}
    echo "[cleanup] Starting ${target} (elapsed $((SECONDS-started))s)"
    rm -rf -- "$target" &
    active[$!]=$target
    next=$((next+1))
  done
  for pid in "${!active[@]}"; do
    if ! kill -0 "$pid" 2>/dev/null; then
      if wait "$pid"; then
        echo "[cleanup] Finished ${active[$pid]} (elapsed $((SECONDS-started))s)"
      else
        echo "[cleanup] FAILED ${active[$pid]}; draining active deletions" >&2
        failed=1
      fi
      unset 'active[$pid]'
    fi
  done
  if (( SECONDS-last_report >= 15 )); then
    echo "[cleanup] Still running: ${active[*]} (elapsed $((SECONDS-started))s)"
    last_report=$SECONDS
  fi
  if (( failed && ${#active[@]} == 0 )); then exit 1; fi
  if (( ${#active[@]} > 0 )); then sleep 1; fi
done
echo "[cleanup] Complete in $((SECONDS-started))s"
