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

remove_target() {
  local target=$1

  # Go's module cache deliberately marks downloaded module directories
  # read-only. The publishing copy is disposable, but rm still needs write
  # permission on every parent directory to unlink those files. Restore only
  # owner access on this one disposable cache; never chmod source or app data.
  if [[ "$target" == ".cache" && -d "$target" && ! -L "$target" ]]; then
    if ! find "$target" -depth -type d -exec chmod u+rwx -- {} +; then
      echo "[cleanup] Could not make disposable .cache directories removable" >&2
      return 1
    fi
  fi

  rm -rf -- "$target"
}

while (( next < ${#targets[@]} || ${#active[@]} > 0 )); do
  while (( failed == 0 && next < ${#targets[@]} && ${#active[@]} < 2 )); do
    target=${targets[next]}
    echo "[cleanup] Starting ${target} (elapsed $((SECONDS-started))s)"
    remove_target "$target" &
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
