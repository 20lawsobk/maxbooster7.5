#!/usr/bin/env bash
# Restores the EDA/CUDA hardware-design toolchain (netgen, klayout, magic-vlsi,
# openroad, yosys, gtkwave, verilator, iverilog, cudatoolkit) that was removed
# from replit.nix to get the deploy image under Replit's 8 GiB limit.
#
# These packages are NOT deleted — they're archived as a Nix export capsule
# so they can come back byte-identical without waiting on nixpkgs' binary
# cache. This script is the reverse of how the capsule was built:
#   nix-store --export <218 exclusive paths> | zstd -19 -T3 -o capsule.nar.zst
#
# Usage: bash scripts/restore-eda-cuda-capsule.sh
set -euo pipefail

CAPSULE="local-capsules/eda-cuda-toolchain.nar.zst"
CHECKSUM_FILE="${CAPSULE}.sha256"
MANIFEST="local-capsules/eda-cuda-toolchain.manifest.json"

if [ ! -f "$CAPSULE" ]; then
  echo "ERROR: $CAPSULE not found. This capsule is a local-only file (not" >&2
  echo "committed to git, since it is multiple GB - see the manifest for" >&2
  echo "why) - it only exists in the original workspace's filesystem," >&2
  echo "preserved by Replit's checkpoint system." >&2
  exit 1
fi

echo "Verifying checksum..."
sha256sum -c "$CHECKSUM_FILE"

echo "Re-adding packages to replit.nix (edit manually if this script is run"
echo "standalone outside the original restore flow) and importing into the"
echo "Nix store..."
zstd -d --long=27 -c "$CAPSULE" | nix-store --import

echo "Done. Restored paths are re-registered in the Nix store database."
echo "Remember to also add the 9 packages back to replit.nix's deps list"
echo "(see $MANIFEST for the exact package list) so the Nix environment"
echo "references them again."
