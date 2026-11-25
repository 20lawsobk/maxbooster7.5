# Stage 2: Static timing analysis of the synthesized gate-level netlist,
# using OpenROAD's built-in OpenSTA engine against the real sky130_fd_sc_hd
# tt_025C_1v80 liberty timing arcs. No standalone `opensta` package exists in
# this environment; OpenROAD bundles the same STA engine.
#
# Goal: find the real critical path and derive an honest Fmax number, not an
# assumed/guessed one.
#
# PDK paths come from real OS environment variables (LIB_TT etc.), exported
# by flow/pdk_env.sh in the invoking shell -- NOT sourced here, since that is
# a bash script and this is a Tcl script. Always invoke this file as:
#   source flow/pdk_env.sh && openroad flow/02_sta.tcl
# so the child openroad process inherits the exported vars via Tcl's `env`.

# OpenROAD's unified database needs a technology (LEF) loaded before it will
# accept a design at all, even for pure timing analysis -- unlike standalone
# OpenSTA, which only needs liberty + verilog. Load tech + cell LEF first.
read_lef $::env(TECH_LEF)
read_lef $::env(CELL_LEF)

read_liberty $::env(LIB_TT)
read_verilog /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_synth.v
link_design gpu_core

# Start from an intentionally fast (aggressive) clock so the setup report's
# own worst-slack number tells us the real max frequency, rather than
# guessing a period and iterating blind.
create_clock -name clk -period 1.0 [get_ports clk]

# All non-clock inputs are testbench/host-driven; treat them as arriving
# well within the clock period (0 input delay) since this core's real
# interface (imem load port, rd_* ports) is not yet wired to a specific host
# bus with known timing.
set_input_delay -clock clk 0.0 [all_inputs -no_clocks]
set_output_delay -clock clk 0.0 [all_outputs]

puts "===== WORST SETUP PATH (max delay) ====="
report_checks -path_delay max -fields {slew cap input_pins} -digits 4

puts "===== WORST HOLD PATH (min delay) ====="
report_checks -path_delay min -fields {slew cap input_pins} -digits 4

puts "===== SETUP SLACK SUMMARY ====="
report_worst_slack -max
report_worst_slack -min

puts "===== TNS/WNS ====="
report_tns
report_wns

puts "===== DESIGN AREA ====="
report_design_area
