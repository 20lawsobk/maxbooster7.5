#!/usr/bin/env bash
# On-demand shell for the EDA/CUDA chip-design toolchain (netgen, klayout,
# magic-vlsi, openroad, yosys, gtkwave, verilator, iverilog, cudatoolkit).
#
# Why this exists: these tools used to live directly in replit.nix. That
# file feeds BOTH the always-on dev workflow environment AND the deploy
# build container's Nix closure (script/build.ts's pre-flight measures every
# store path reachable from the build env's own env vars -- exactly what
# replit.nix puts on PATH there). The chip-design closure is ~10.5 GiB; the
# production app never touches it (hardware/ is .dockerignore'd), but every
# publish paid for it anyway and eventually blew past the platform's 8 GiB
# image limit. See Task #181.
#
# Fix: the tools are fetched into a throwaway `nix-shell` subshell only for
# the lifetime of one flow invocation, instead of being part of the
# persistent project environment. Nothing here touches replit.nix, so the
# dev workflow and the deploy build closure never see these packages.
#
# Usage:
#   flow/toolchain_env.sh <command> [args...]
#
# Examples:
#   flow/toolchain_env.sh yosys -s flow/01_synth.ys
#   flow/toolchain_env.sh openroad -threads 3 -exit flow/03_floorplan_place.tcl
#   flow/toolchain_env.sh iverilog -g2012 -o /tmp/sim gpu_core.v gpu_core_tb.v
#
# run_stage.sh (the openroad stage runner) already wraps its own invocation
# through this script -- most stages should go through run_stage.sh instead
# of calling this directly. Call this directly for one-off tool use (yosys
# synthesis, iverilog/verilator simulation, gtkwave/klayout inspection,
# netgen LVS, magic layout).
set -euo pipefail

CHIP_FLOW_PACKAGES=(
  netgen
  klayout
  magic-vlsi
  openroad
  yosys
  gtkwave
  verilator
  iverilog
  cudatoolkit
)

if [ "$#" -eq 0 ]; then
  echo "Usage: $0 <command> [args...]" >&2
  exit 1
fi

PKG_ARGS=()
for pkg in "${CHIP_FLOW_PACKAGES[@]}"; do
  PKG_ARGS+=(-p "$pkg")
done

exec nix-shell "${PKG_ARGS[@]}" --run "$(printf '%q ' "$@")"
