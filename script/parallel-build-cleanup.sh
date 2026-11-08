#!/usr/bin/env bash
# Destructive: invoke ONLY inside the disposable publishing build root.
set -eu
cd "${1:?A disposable build root is required}"
[[ "$PWD" != "/" ]] || { echo "Refusing filesystem-root cleanup" >&2; exit 1; }

# Cleanup operations are deliberately serialized. In particular, `.local` and
# `.cache` can share filesystem-backed tooling state during publishing; deleting
# them concurrently can make both removals contend for the same resources.
# Never scan first with du.
targets=(.cache .local .agents node_modules/.vite node_modules/.cache)
started=$SECONDS
last_report=$SECONDS

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

for target in "${targets[@]}"; do
  echo "[cleanup] Starting ${target} (elapsed $((SECONDS-started))s)"
  if remove_target "$target"; then
    echo "[cleanup] Finished ${target} (elapsed $((SECONDS-started))s)"
  else
    echo "[cleanup] FAILED ${target}; later cleanup steps were not started" >&2
    exit 1
  fi
  if (( SECONDS-last_report >= 15 )); then
    echo "[cleanup] Still running: ${target} (elapsed $((SECONDS-started))s)"
    last_report=$SECONDS
  fi
done
echo "[cleanup] Complete in $((SECONDS-started))s"
