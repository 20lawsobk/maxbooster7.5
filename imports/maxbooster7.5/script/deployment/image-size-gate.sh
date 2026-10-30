#!/usr/bin/env bash
# Reject an over-limit release before Replit starts publishing its image.
# The default matches Replit's documented 8 GB limit for VM deployments.
set -euo pipefail

root="${1:-.}"
limit="${2:-8000000000}"

if [[ ! "$limit" =~ ^[1-9][0-9]*$ ]]; then
  echo "[image-size-gate] FATAL: byte limit must be a positive integer" >&2
  exit 2
fi
if [[ ! -d "$root" ]]; then
  echo "[image-size-gate] FATAL: image root does not exist: $root" >&2
  exit 2
fi

# Count logical bytes, including each hard-linked path: a layer copier need not
# preserve sparse extents or hard links. Allocated disk blocks undercount both.
image_bytes="$(du -s --apparent-size --count-links --block-size=1 --exclude=.git --exclude=.local "$root" | awk '{print $1}')"
if [[ ! "$image_bytes" =~ ^[0-9]+$ ]]; then
  echo "[image-size-gate] FATAL: could not measure image footprint for $root" >&2
  exit 2
fi

if (( image_bytes > limit )); then
  printf '[image-size-gate] BLOCKED: release footprint is %s bytes; Replit VM limit is %s bytes.\n' \
    "$image_bytes" "$limit" >&2
  echo "[image-size-gate] Largest top-level paths (bytes):" >&2
  du -x --apparent-size --count-links --block-size=1 --max-depth=1 --exclude=.git --exclude=.local "$root" \
    | sort -nr | head -n 12 >&2 || true
  echo "[image-size-gate] Reduce or move the listed payloads before publishing; no files were removed." >&2
  exit 1
fi

printf '[image-size-gate] OK: release footprint is %s / %s bytes.\n' "$image_bytes" "$limit"
