#!/usr/bin/env bash
set -euo pipefail

# Publish scaffold: compile, prepare runtimes, pack; start.sh restores and boots.
# Updated from the August 26 publishing layout for the current five bundles,
# native sidecar and model contract. Never authorize cleanup from runtime flags.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if [[ "$#" -ne 2 || "$1" != "--publish-disposable-copy" ]]; then
  echo "Build refused: use build.sh --publish-disposable-copy <root> only in a disposable publishing copy; npm run build is compile-only." >&2
  exit 1
fi
# Dependency-free recovery runs before npm/tsx; the helper validates the exact
# root and rejects inherited authorization before any filesystem mutation.
exec node script/lib/deploymentPackRecovery.mjs "$@"