#!/usr/bin/env bash
# Preserve build tools BEFORE cleanup can remove platform-owned wrappers/caches.
set -Eeuo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/publishing-context.sh"
prepare_publishing_context
echo "[bootstrap] Preparing build toolchain before workspace cleanup"
tools=$(mktemp -d /tmp/deployment-tools.XXXXXX)
isolate_publishing_caches
trap 'rc=$?; trap - EXIT; rm -rf -- "$tools"; exit "$rc"' EXIT
trap 'rc=$?; echo "[bootstrap] FAILED at line $LINENO (exit $rc)" >&2' ERR
trap 'echo "[bootstrap] Interrupted by TERM" >&2; exit 143' TERM
trap 'echo "[bootstrap] Interrupted by INT" >&2; exit 130' INT
export DEPLOY_EXECUTIVE_STARTED_SECONDS
DEPLOY_EXECUTIVE_STARTED_SECONDS=$(date +%s)
node_bin=""
# Do not eagerly glob the entire lazy-mounted Nix store before probing PATH.
# Shell glob expansion is unbounded and happens before the first loop body.
for candidate in .node_bin/node "$(command -v node || true)"; do
  [ -x "$candidate" ] || continue
  echo "[bootstrap] Probing Node: $candidate"
  if [ -x "$candidate" ] && timeout 10 "$candidate" --version >/dev/null 2>&1; then
    node_bin=$(timeout 10 "$candidate" -p 'process.execPath')
    break
  fi
done
[ -n "$node_bin" ] || { echo "No working Node executable for the build executive" >&2; exit 1; }
node_bin=$(readlink -f "$node_bin")
case "$node_bin" in
  /nix/store/*)
    # Immutable store paths survive workspace cleanup. Dereferencing their
    # complete dependency trees wastes disk and can expand copies enormously.
    echo "[bootstrap] Using immutable Node store path"
    ln -s "$node_bin" "$tools/node" ;;
  *)
    echo "[bootstrap] Preserving Node outside workspace (copy limit: 120s)"
    timeout --kill-after=5s 120 cp -L "$node_bin" "$tools/node"
    chmod +x "$tools/node" ;;
esac
export PATH="$tools:$PATH"
# Recovery uses only builtins and precedes package-manager/package.json probes.
# A previous interrupted pack may have removed those dependency inputs.
"$tools/node" script/lib/deploymentPackRecovery.mjs --recover "$PUBLISH_BUILD_ROOT"
for manager in npm pnpm; do
  echo "[bootstrap] Resolving compatible $manager"
  if [ "$manager" = npm ]; then
    mapfile -t candidates < <(timeout --kill-after=2s 10 bash -c \
      'printf "%s\n" /nix/store/*nodejs*/lib/node_modules/npm/bin/npm-cli.js' || true)
    cli=npm-cli.js
    expected=$(timeout 10 "$tools/node" -p "require('./package.json').packageManager.replace(/^npm@/,'')")
  else
    mapfile -t candidates < <(timeout --kill-after=2s 10 bash -c \
      'printf "%s\n" /nix/store/*pnpm*/libexec/pnpm/bin/pnpm.cjs /nix/store/*pnpm*/lib/node_modules/pnpm/bin/pnpm.cjs' || true)
    cli=pnpm.cjs
    expected=""
  fi
  preferred=$(readlink -f "$(command -v "$manager" || true)" 2>/dev/null || true)
  candidates=("$preferred" "${candidates[@]}")
  # One bounded metadata probe, not a fresh Node process per Nix candidate.
  found=$(timeout --kill-after=5s 15 "$tools/node" - "$expected" "$preferred" "${candidates[@]}" <<'NODE'
const fs = require("node:fs");
const path = require("node:path");
const [expected, preferred, ...candidates] = process.argv.slice(2);
const matches = [];
for (let file of candidates) {
  if (!file) continue;
  try {
    // Replit's PATH npm may be a Nix shell wrapper rather than the npm CLI
    // symlink. Follow only an explicit immutable exec target; never execute or
    // source wrapper text during discovery.
    for (let hop = 0; hop < 4; hop++) {
      file = fs.realpathSync(file);
      if (!file.startsWith("/nix/store/")) break;
      const text = fs.readFileSync(file, "utf8");
      const target = text.match(/^exec\s+"(\/nix\/store\/[^"\n]+)"\s+"\$@"\s*$/m)?.[1];
      if (!target) break;
      file = target;
    }
    if (!fs.statSync(file).isFile()) continue;
    const pkg = JSON.parse(fs.readFileSync(path.join(path.dirname(path.dirname(file)), "package.json"), "utf8"));
    if (typeof pkg.version !== "string" || (expected && pkg.version !== expected)) continue;
    matches.push({file, version: pkg.version});
  } catch (error) {
    if (!["ENOENT", "ENOTDIR"].includes(error.code)) throw error;
  }
}
matches.sort((a, b) => Number(b.file === preferred) - Number(a.file === preferred) ||
  b.version.localeCompare(a.version, "en", {numeric: true}));
if (matches.length) process.stdout.write(matches[0].file);
NODE
)
  [ -n "$found" ] || { echo "No durable $manager installation found; refusing cleanup" >&2; exit 1; }
  package_dir=$(readlink -f "$(dirname "$(dirname "$found")")")
  case "$package_dir" in
    /nix/store/*)
      echo "[bootstrap] Using immutable $manager package store path"
      ln -s "$package_dir" "$tools/$manager-package" ;;
    *)
      echo "[bootstrap] Preserving $manager outside workspace (copy limit: 120s)"
      timeout --kill-after=5s 120 cp -aL --no-preserve=mode "$package_dir" "$tools/$manager-package"
      timeout --kill-after=5s 30 chmod -R u+w "$tools/$manager-package" ;;
  esac
  cat > "$tools/$manager" <<EOF
#!/bin/sh
exec "$tools/node" "$tools/$manager-package/bin/$cli" "\$@"
EOF
  chmod +x "$tools/$manager"
  echo "[bootstrap] Verifying preserved $manager"
  (cd /tmp && timeout --kill-after=5s 15 "$tools/$manager" --version)
done
echo "[bootstrap] Toolchain ready; temporary footprint: $(du -sh "$tools" | cut -f1)"
export DEPLOY_BOOTSTRAP_DIR="$tools"
if [ "${1:-}" = "--check" ]; then
  echo "Build toolchain verified outside workspace caches"
  exit 0
fi
echo "[bootstrap] Handing off to dependency-aware build executive"
exec "$tools/node" script/deployment/executive.mjs build
