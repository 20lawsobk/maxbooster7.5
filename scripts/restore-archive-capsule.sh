#!/usr/bin/env bash
# Manual, on-demand restore for archive-capsules/*.pdim.
#
# These capsules are NOT part of the deploy/runtime capsule system
# (script/build.ts + dist/pdim-restore.mjs) — nothing restores them
# automatically at boot, because nothing at runtime reads them. They exist
# purely so this workspace doesn't have to carry their raw, uncompressed
# bytes (hardware chip-flow checkpoints, a Windows plugin build folder)
# forever. Run this script by hand when you actually need the files back
# (e.g. resuming the OpenROAD flow or the Windows VST3 build).
#
# Usage:
#   scripts/restore-archive-capsule.sh <name>   # e.g. hardware-gpu-core-odb
#   scripts/restore-archive-capsule.sh all      # restore every capsule
#   scripts/restore-archive-capsule.sh list     # show available capsules
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CAPSULE_DIR="$ROOT/archive-capsules"

restore_one() {
  local name="$1"
  local pdim="$CAPSULE_DIR/$name.pdim"
  local manifest="$CAPSULE_DIR/$name.manifest.json"

  if [[ ! -f "$pdim" ]]; then
    echo "error: no capsule named '$name' in $CAPSULE_DIR" >&2
    return 1
  fi
  if [[ ! -f "$manifest" ]]; then
    echo "error: missing manifest for '$name' ($manifest)" >&2
    return 1
  fi

  local expected actual
  expected=$(grep -o '"sha256": *"[^"]*"' "$manifest" | sed -E 's/.*"([0-9a-f]+)"/\1/')
  actual=$(sha256sum "$pdim" | awk '{print $1}')
  if [[ "$expected" != "$actual" ]]; then
    echo "error: sha256 mismatch for '$name' — capsule may be corrupt or truncated" >&2
    echo "  expected: $expected" >&2
    echo "  actual:   $actual" >&2
    return 1
  fi

  echo "restoring '$name' -> $ROOT (sha256 verified)"
  gzip -dc "$pdim" | tar -xf - -C "$ROOT"
  echo "done: $name"
}

list_capsules() {
  local f base
  for f in "$CAPSULE_DIR"/*.pdim; do
    [[ -e "$f" ]] || continue
    base=$(basename "$f" .pdim)
    echo "$base"
  done
}

case "${1:-}" in
  ""|-h|--help)
    echo "Usage: $0 <capsule-name|all|list>"
    echo "Available capsules:"
    list_capsules | sed 's/^/  /'
    exit 1
    ;;
  list)
    list_capsules
    ;;
  all)
    while IFS= read -r name; do
      restore_one "$name"
    done < <(list_capsules)
    ;;
  *)
    restore_one "$1"
    ;;
esac
