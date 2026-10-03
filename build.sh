#!/usr/bin/env bash
set -euo pipefail

# Legacy build entrypoint. Keep one deployment implementation: script/build.ts
# rebuilds the frontend/server, portable Node/Python and Rust sidecar, validates
# the required model and dependencies, then packs the four independent runtime
# capsules concurrently and the critical app remainder capsule.
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
export DEPLOY_PACK=1
# Recovery must precede npm: an interrupted pack may have removed node_modules.
# This retains the simulation boundary; it does not authorize payload cleanup.
node script/lib/deploymentPackRecovery.mjs --recover .
exec npm run build