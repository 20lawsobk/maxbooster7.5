# Stage 3: floorplan + global/detailed placement.
#
# Invoke as:  source flow/pdk_env.sh && openroad -exit flow/03_floorplan_place.tcl
#
# Design raw standard-cell area (from stage-2 STA's report_design_area) is
# ~689,715 um^2. Targeting 45% utilization (not 100%) deliberately leaves
# real routing headroom -- stage 2 found a single min-drive gate fanning out
# to ~1637 loads unbuffered; the resizer repair pass later in this script
# needs physical room to insert a real buffer tree for nets like that.

read_lef $::env(TECH_LEF)
read_lef $::env(CELL_LEF)
read_liberty $::env(LIB_TT)
read_verilog /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_synth.v
link_design gpu_core

# Stage 2's pre-placement/pre-buffering STA (ideal clock, no wire RC) is not
# a valid basis for picking a target period -- it was dominated by an
# unbuffered ~1637-fanout net that repair_design exists to fix. A first
# attempt at this stage with an arbitrary 4.0ns (250MHz) ask showed, after
# repair_design's real buffering alone (before any setup-driven repair),
# WNS -10.61ns -- i.e. an actual achieved critical path around 14.6ns.
# 12.0ns (~83MHz) is a deliberately-relaxed-from-that-evidence target so
# repair_timing/CTS below converge in reasonable time instead of grinding
# against thousands of endpoints chasing an unreachable target; the final
# achieved Fmax gets reported from real post-route STA regardless of this
# intermediate optimization target.
create_clock -name clk -period 12.0 [get_ports clk]
set_input_delay -clock clk 0.0 [all_inputs -no_clocks]
set_output_delay -clock clk 0.0 [all_outputs]

# Real per-unit-length wire R/C, derived by OpenROAD internally from the
# tech LEF's own RPERSQ/CPERSQDIST/EDGECAPACITANCE fields for each named
# layer (not hand-computed/guessed here). met2 approximates signal routing,
# met4 approximates the clock net -- a standard pre-route estimate; it gets
# replaced by real extracted parasitics after detailed routing.
set_wire_rc -signal -layer met2
set_wire_rc -clock  -layer met4

initialize_floorplan -utilization 45 -aspect_ratio 1.0 -core_space 10 -site unithd

puts "===== FLOORPLAN DONE ====="
puts [ord::get_die_area]

# The vendor tech LEF encodes each layer's PITCH/OFFSET/DIRECTION as design
# rule properties, but has no explicit TRACKS statements -- track grids are
# left to the flow to generate. Values below are copied verbatim from the
# PDK's own OpenLane track config
# (sky130A/libs.tech/openlane/sky130_fd_sc_hd/tracks.info), not guessed.
make_tracks li1  -x_offset 0.23 -x_pitch 0.46 -y_offset 0.17 -y_pitch 0.34
make_tracks met1 -x_offset 0.17 -x_pitch 0.34 -y_offset 0.17 -y_pitch 0.34
make_tracks met2 -x_offset 0.23 -x_pitch 0.46 -y_offset 0.23 -y_pitch 0.46
make_tracks met3 -x_offset 0.34 -x_pitch 0.68 -y_offset 0.34 -y_pitch 0.68
make_tracks met4 -x_offset 0.46 -x_pitch 0.92 -y_offset 0.46 -y_pitch 0.92
make_tracks met5 -x_offset 1.70 -x_pitch 3.40 -y_offset 1.70 -y_pitch 3.40

puts "===== TRACKS GENERATED ====="

# Standard-cell rows exist now; place the design's IO pins on the block
# boundary before placement (met2 vertical runs, met3 horizontal runs --
# this is a hard-macro-style core block, not a full chip with a pad ring).
place_pins -hor_layers met3 -ver_layers met2

puts "===== IO PIN PLACEMENT DONE ====="

global_placement -density 0.55

puts "===== GLOBAL PLACEMENT DONE ====="

estimate_parasitics -placement

puts "===== PRE-DETAILED-PLACE TIMING (placement-based parasitics) ====="
report_worst_slack -max
report_worst_slack -min

detailed_placement
check_placement

puts "===== DETAILED PLACEMENT DONE + LEGALITY CHECKED ====="

estimate_parasitics -placement
puts "===== POST-DETAILED-PLACE TIMING (real per-layer wire RC now applied) ====="
report_worst_slack -max
report_worst_slack -min
report_tns
report_wns

# Stage 2's STA found one min-drive-strength gate feeding ~1637 loads with
# no buffer tree at all -- this is what repair_design exists to fix: it
# inserts real buffers (sized/sited against the placement that now exists)
# on nets violating max fanout/max capacitance/max transition, then
# repair_design's follow-on legalizes their placement.
set_max_fanout 24 [current_design]
repair_design

puts "===== REPAIR_DESIGN (buffer insertion for high-fanout/high-cap nets) DONE ====="

estimate_parasitics -placement
puts "===== POST-REPAIR_DESIGN TIMING ====="
report_worst_slack -max
report_worst_slack -min
report_tns
report_wns

repair_timing -setup

puts "===== REPAIR_TIMING -setup DONE ====="

estimate_parasitics -placement
puts "===== POST-REPAIR_TIMING TIMING ====="
report_worst_slack -max
report_worst_slack -min
report_tns
report_wns
report_design_area

write_def /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_placed.def
write_db /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_placed.odb
puts "===== WROTE gpu_core_placed.def / .odb ====="
