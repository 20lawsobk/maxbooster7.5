#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Normal builds verify installed dependencies without modifying them. Explicit
# synchronization requires the pinned local pnpm and cached packages; it must
# never bootstrap tools or run subsystem preinstall scripts that delete locks.
PNPM_VERSION="${PNPM_VERSION:-10.26.1}"
run_pnpm() {
  command -v pnpm >/dev/null || { echo "Install pnpm $PNPM_VERSION before explicit subsystem synchronization" >&2; exit 1; }
  test "$(pnpm --version)" = "$PNPM_VERSION" || { echo "Expected pnpm $PNPM_VERSION" >&2; exit 1; }
  pnpm "$@"
}

# The root uses npm; these two independent workspaces use pnpm. Installing
# the root package-lock cannot update their private node_modules trees.
for subsystem in external/maxcore external/pdim; do
  for input in package.json pnpm-lock.yaml pnpm-workspace.yaml; do
    test -f "$ROOT/$subsystem/$input" || {
      echo "ERROR: missing locked dependency input: $subsystem/$input" >&2
      exit 1
    }
  done
  if [ "${SUBSYSTEM_INSTALL:-0}" = "1" ]; then
  echo "==> Installing cached locked dependencies: $subsystem"
  (
    cd "$ROOT/$subsystem"
    CI=true run_pnpm install --offline --frozen-lockfile --ignore-scripts
  )
  fi
  cmp -s "$ROOT/$subsystem/pnpm-lock.yaml" "$ROOT/$subsystem/node_modules/.pnpm/lock.yaml" || {
    echo "ERROR: $subsystem installed dependency lock is absent or stale. Run SUBSYSTEM_INSTALL=1 bash script/sync-subsystem-dependencies.sh with the required packages cached." >&2
    exit 1
  }
done

cd "$ROOT"
node --input-type=module <<'JS'
import { inspectDependencies } from "./scripts/verify-runtime-artifacts.mjs";
const result = inspectDependencies(process.cwd(), ["external/maxcore", "external/pdim"]);
if (!result.ready) {
  console.error(result.failures.join("\n"));
  process.exit(1);
}
console.log("Both subsystem dependency trees passed the runtime dependency gate.");
JS
