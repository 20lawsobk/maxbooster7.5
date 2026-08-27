#!/usr/bin/env bash
# Shared PDK path resolution for every stage of the RTL-to-GDSII flow.
# Sourced by each stage script so paths are defined exactly once.
export PDK_VERSION_ROOT="/home/runner/.volare/volare/sky130/versions/a519523b0d9bc913a6f87a5eed083597ed9e2e93/sky130A"
export STD_CELL="sky130_fd_sc_hd"

export LIB_TT="$PDK_VERSION_ROOT/libs.ref/$STD_CELL/lib/${STD_CELL}__tt_025C_1v80.lib"
export CELL_LEF="$PDK_VERSION_ROOT/libs.ref/$STD_CELL/lef/${STD_CELL}.lef"
export TECH_LEF="$PDK_VERSION_ROOT/libs.ref/$STD_CELL/techlef/${STD_CELL}__nom.tlef"
export CELL_VERILOG="$PDK_VERSION_ROOT/libs.ref/$STD_CELL/verilog/${STD_CELL}.v"
export CELL_PRIMITIVES_V="$PDK_VERSION_ROOT/libs.ref/$STD_CELL/verilog/primitives.v"
export CELL_GDS="$PDK_VERSION_ROOT/libs.ref/$STD_CELL/gds/${STD_CELL}.gds"
export MAGIC_TECH="$PDK_VERSION_ROOT/libs.tech/magic/sky130A.tech"
export MAGIC_CELL_MAG_DIR="$PDK_VERSION_ROOT/libs.ref/$STD_CELL/mag"
export NETGEN_SETUP="$PDK_VERSION_ROOT/libs.tech/netgen/sky130A_setup.tcl"

export FLOW_DIR="/home/runner/workspace/hardware/digital_gpu_core/flow"
export RTL_FILE="/home/runner/workspace/hardware/digital_gpu_core/gpu_core.v"
