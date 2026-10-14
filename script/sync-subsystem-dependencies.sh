#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# The root project is npm-managed and Vercel may not provide a global pnpm
# binary. Bootstrap an exact pnpm version through npm instead of depending on
# an ambient tool installation. The subsystem lockfiles still remain frozen.
PNPM_VERSION="${PNPM_VERSION:-10.26.1}"
run_pnpm() {
  npm exec --yes --package="pnpm@${PNPM_VERSION}" -- pnpm "$@"
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
  echo "==> Installing current locked dependencies: $subsystem"
  (
    cd "$ROOT/$subsystem"
    CI=true run_pnpm install --frozen-lockfile
  )
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
