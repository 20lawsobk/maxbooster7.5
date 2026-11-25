#!/usr/bin/env bash
set -Eeuo pipefail

bootstrap_dir=$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
source "$bootstrap_dir/publishing-context.sh"
prepare_publishing_context
cd -- "$PUBLISH_BUILD_ROOT"

export DEPLOY_PROJECT_ROOT="$PWD"
export DEPLOY_EXECUTIVE_STARTED_SECONDS
DEPLOY_EXECUTIVE_STARTED_SECONDS=$(date +%s)

case "${1:-}" in
  '') ;;
  --check)
    (( $# == 1 )) || {
      echo 'Unexpected bootstrap arguments' >&2
      exit 2
    }
    ;;
  *)
    echo 'Usage: bootstrap.sh [--check]' >&2
    exit 2
    ;;
esac

tools=$(mktemp -d /tmp/deployment-tools.XXXXXX)

cleanup() {
  local rc=$?
  trap - EXIT
  rm -rf -- "$tools" || echo '[bootstrap] Tool cleanup failed' >&2
  exit "$rc"
}

trap cleanup EXIT
trap 'rc=$?; echo "[bootstrap] FAILED at line $LINENO (exit $rc)" >&2' ERR
trap 'echo "[bootstrap] Interrupted by TERM" >&2; exit 143' TERM
trap 'echo "[bootstrap] Interrupted by INT" >&2; exit 130' INT
trap 'echo "[bootstrap] Interrupted by HUP" >&2; exit 129' HUP

isolate_publishing_caches
cd -- "$DEPLOY_PROJECT_ROOT"

node_bin=''
for candidate in .node_bin/node "$(command -v node || true)"; do
  [[ -x "$candidate" ]] || continue
  echo "[bootstrap] Probing Node: $candidate"

  if timeout --kill-after=2s 10 "$candidate" --version >/dev/null 2>&1; then
    node_bin=$(timeout --kill-after=2s 10 "$candidate" -p 'process.execPath')
    break
  fi
done

[[ -n "$node_bin" ]] || {
  echo 'No working Node executable' >&2
  exit 1
}

node_bin=$(readlink -f -- "$node_bin")
case "$node_bin" in
  /nix/store/*)
    ln -s -- "$node_bin" "$tools/node"
    ;;
  *)
    timeout --kill-after=5s 120 cp -L -- "$node_bin" "$tools/node"
    chmod +x "$tools/node"
    ;;
esac

export PATH="$tools:$PATH"
export DEPLOY_BOOTSTRAP_DIR="$tools"

# Recover dependency inputs before package-manager discovery.
"$tools/node" script/lib/deploymentPackRecovery.mjs \
  --recover "$DEPLOY_PROJECT_ROOT"

manager_pin=$(timeout --kill-after=2s 10 "$tools/node" - <<'NODE'
const fs = require("node:fs");
const value = JSON.parse(fs.readFileSync("package.json", "utf8")).packageManager;

if (value !== undefined && typeof value !== "string") {
  throw Error("Invalid packageManager");
}

const match = value?.match(
  /^(npm|pnpm)@(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)(?:\+[^\s]+)?$/,
);

if (value && /^(npm|pnpm)@/.test(value) && !match) {
  throw Error("Expected an exact packageManager version");
}

if (match) process.stdout.write(`${match[1]} ${match[2]}`);
NODE
)

pinned_manager=${manager_pin%% *}
pinned_version=${manager_pin#* }

for manager in npm pnpm; do
  echo "[bootstrap] Resolving compatible $manager"
  expected=''
  if [[ "$manager" == "$pinned_manager" ]]; then
    expected=$pinned_version
  fi

  if [[ "$manager" == npm ]]; then
    cli=npm-cli.js
    mapfile -t candidates < <(
      timeout --kill-after=2s 10 bash -c \
        'printf "%s\n" /nix/store/*nodejs*/lib/node_modules/npm/bin/npm-cli.js' ||
        true
    )
  else
    cli=pnpm.cjs
    mapfile -t candidates < <(
      timeout --kill-after=2s 10 bash -c \
        'printf "%s\n" /nix/store/*pnpm*/libexec/pnpm/bin/pnpm.cjs /nix/store/*pnpm*/lib/node_modules/pnpm/bin/pnpm.cjs' ||
        true
    )
  fi

  preferred=$(
    readlink -f -- "$(command -v "$manager" || true)" 2>/dev/null || true
  )

  found=$(timeout --kill-after=5s 15 "$tools/node" - \
    "$expected" "$preferred" "$manager" "${candidates[@]}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [expected, preferred, manager, ...candidates] = process.argv.slice(2);

if (preferred) candidates.unshift(preferred);

try {
  const manifest = require.resolve(`${manager}/package.json`, {
    paths: [process.cwd(), path.dirname(preferred || process.cwd())],
  });

  candidates.unshift(path.join(
    path.dirname(manifest),
    "bin",
    manager === "npm" ? "npm-cli.js" : "pnpm.cjs",
  ));
} catch (error) {
  if (error.code !== "MODULE_NOT_FOUND") throw error;
}

const seen = new Set();
const matches = [];

for (let file of candidates) {
  if (!file) continue;

  try {
    for (let hop = 0; hop < 4; hop++) {
      file = fs.realpathSync(file);
      if (!file.startsWith("/nix/store/")) break;

      const fd = fs.openSync(file, "r");
      let text;

      try {
        const buffer = Buffer.alloc(65536);
        const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
        text = buffer.subarray(0, bytes).toString("utf8");
      } finally {
        fs.closeSync(fd);
      }

      const target = text.match(
        /^exec\s+"(\/nix\/store\/[^"\n]+)"\s+"\$@"\s*$/m,
      )?.[1];

      if (!target) break;
      file = target;
    }

    if (seen.has(file)) continue;
    seen.add(file);
    if (!fs.statSync(file).isFile()) continue;

    const pkg = JSON.parse(fs.readFileSync(
      path.join(path.dirname(path.dirname(file)), "package.json"),
      "utf8",
    ));

    if (
      pkg.name !== manager ||
      typeof pkg.version !== "string" ||
      (expected && pkg.version !== expected)
    ) continue;

    matches.push({file, version: pkg.version});
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
  }
}

matches.sort((a, b) =>
  Number(b.file === preferred) - Number(a.file === preferred) ||
  b.version.localeCompare(a.version, "en", {numeric: true}),
);

if (matches.length) process.stdout.write(matches[0].file);
NODE
  )

  [[ -n "$found" ]] || {
    echo "No compatible durable $manager installation found" >&2
    exit 1
  }

  package_dir=$(readlink -f -- "$(dirname -- "$(dirname -- "$found")")")

  case "$package_dir" in
    /nix/store/*)
      ln -s -- "$package_dir" "$tools/$manager-package"
      ;;
    *)
      timeout --kill-after=5s 120 cp -aL --no-preserve=mode -- \
        "$package_dir" "$tools/$manager-package"
      timeout --kill-after=5s 30 chmod -R u+w "$tools/$manager-package"
      ;;
  esac

  cat > "$tools/$manager" <<LAUNCHER
#!/bin/sh
exec "$tools/node" "$tools/$manager-package/bin/$cli" "\$@"
LAUNCHER

  chmod +x "$tools/$manager"
  actual=$(cd /tmp && timeout --kill-after=5s 15 "$tools/$manager" --version)

  [[ -z "$expected" || "$actual" == "$expected" ]] || {
    echo "$manager version mismatch" >&2
    exit 1
  }

  echo "[bootstrap] Preserved $manager $actual"
done

executive="$DEPLOY_PROJECT_ROOT/script/deployment/executive.mjs"

bash -n "$DEPLOY_PROJECT_ROOT/build.sh"

# Check the actual import graph and coordinated plan before launching tasks.
timeout --kill-after=5s 30 \
  "$tools/node" --input-type=module - "$executive" <<'NODE'
import {pathToFileURL} from "node:url";

const executiveURL = pathToFileURL(process.argv[2]);
const module = await import(executiveURL.href);

if (
  typeof module.runExecutive !== "function" ||
  typeof module.coordinateBuildPlan !== "function"
) {
  throw Error("Executive exports are incomplete");
}

const {buildPlan} = await import(new URL("./plans.mjs", executiveURL));
module.coordinateBuildPlan(buildPlan());
NODE

if [[ "${1:-}" == --check ]]; then
  echo '[bootstrap] Toolchain, imports and build graph verified; build not executed'
  exit 0
fi

echo '[bootstrap] Handing off toolchain and cleanup ownership to executive'

# After successful exec, executive.main owns cleanup.
# Failed exec leaves Bash's EXIT cleanup in place.
exec "$tools/node" "$executive" build