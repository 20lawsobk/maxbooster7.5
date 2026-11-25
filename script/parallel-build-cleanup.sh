#!/usr/bin/env bash
# Destructive: invoke ONLY inside the disposable publishing build root.
set -eu
cd "${1:?A disposable build root is required}"
[[ "$PWD" != "/" ]] || { echo "Refusing filesystem-root cleanup" >&2; exit 1; }

# The workspace-root `.cache` is Replit-managed and actively repopulated by the
# builder; it is excluded from the release payload, so never recursively delete
# it. npm ci replaces node_modules itself, and compiler caches are pruned once
# after the build before capsule packing. Never scan first with du.
targets=(.local .agents)
started=$SECONDS
last_report=$SECONDS

remove_target() {
  local target=$1

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
