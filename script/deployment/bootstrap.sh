#!/usr/bin/env bash
# Preserve build tools BEFORE cleanup can remove platform-owned wrappers/caches.
set -euo pipefail
tools=$(mktemp -d /tmp/deployment-tools.XXXXXX)
trap 'chmod -R u+w "$tools"; rm -rf -- "$tools"' EXIT
export DEPLOY_EXECUTIVE_STARTED_SECONDS
DEPLOY_EXECUTIVE_STARTED_SECONDS=$(date +%s)
node_bin=""
for candidate in .node_bin/node "$(command -v node || true)" /nix/store/*nodejs*/bin/node; do
  if [ -x "$candidate" ] && timeout 10 "$candidate" --version >/dev/null 2>&1; then
    node_bin=$("$candidate" -p 'process.execPath')
    break
  fi
done
[ -n "$node_bin" ] || { echo "No working Node executable for the build executive" >&2; exit 1; }
cp -L "$node_bin" "$tools/node"
chmod +x "$tools/node"
export PATH="$tools:$PATH"
for manager in npm pnpm; do
  if [ "$manager" = npm ]; then
    candidates=(/nix/store/*nodejs*/lib/node_modules/npm/bin/npm-cli.js)
    cli=npm-cli.js
    expected=$("$tools/node" -p "require('./package.json').packageManager.replace(/^npm@/,'')")
  else
    candidates=(/nix/store/*pnpm*/libexec/pnpm/bin/pnpm.cjs /nix/store/*pnpm*/lib/node_modules/pnpm/bin/pnpm.cjs)
    cli=pnpm.cjs
    expected=""
  fi
  preferred=$(readlink -f "$(command -v "$manager" || true)" 2>/dev/null || true)
  candidates=("$preferred" "${candidates[@]}")
  found=""
  best_version=0.0.0
  for candidate in "${candidates[@]}"; do
    package_dir="$(dirname "$(dirname "$candidate")")"
    if [ -f "$candidate" ] && [ -f "$package_dir/package.json" ]; then
      version=$("$tools/node" -p "require(process.argv[1]).version" "$package_dir/package.json")
      if [ -n "$expected" ] && [ "$version" != "$expected" ]; then continue; fi
      if [ "$candidate" = "$preferred" ]; then found=$candidate; break; fi
      if [ "$(printf '%s\n%s\n' "$best_version" "$version" | sort -V | tail -1)" = "$version" ]; then
        found=$candidate; best_version=$version
      fi
    fi
  done
  [ -n "$found" ] || { echo "No durable $manager installation found; refusing cleanup" >&2; exit 1; }
  cp -aL --no-preserve=mode "$(dirname "$(dirname "$found")")" "$tools/$manager-package"
  chmod -R u+w "$tools/$manager-package"
  cat > "$tools/$manager" <<EOF
#!/bin/sh
exec "$tools/node" "$tools/$manager-package/bin/$cli" "\$@"
EOF
  chmod +x "$tools/$manager"
  (cd /tmp && timeout 15 "$tools/$manager" --version)
done
export DEPLOY_BOOTSTRAP_DIR="$tools"
if [ "${1:-}" = "--check" ]; then
  echo "Build toolchain verified outside workspace caches"
  exit 0
fi
exec "$tools/node" script/deployment/executive.mjs build
