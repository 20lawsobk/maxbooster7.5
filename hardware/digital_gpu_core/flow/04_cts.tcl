# Stage 4: clock tree synthesis + post-CTS legalization/timing repair.
#
# Invoke as:  source flow/pdk_env.sh && openroad -exit flow/04_cts.tcl
#
# Loads the already-placed/repaired design (gpu_core_placed.odb) rather than
# re-synthesizing/re-placing from scratch. SDC-style constraints (clocks,
# I/O delays, wire RC) live in OpenSTA's state, not the ODB file, so they
# must be re-applied exactly as stage 3 set them.

read_lef $::env(TECH_LEF)
read_lef $::env(CELL_LEF)
read_liberty $::env(LIB_TT)
read_db /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_placed.odb

create_clock -name clk -period 12.0 [get_ports clk]
set_input_delay -clock clk 0.0 [all_inputs -no_clocks]
set_output_delay -clock clk 0.0 [all_outputs]
set_wire_rc -signal -layer met2
set_wire_rc -clock  -layer met4

puts "===== RELOADED PLACED DESIGN, CONSTRAINTS RE-APPLIED ====="
report_worst_slack -max
report_worst_slack -min

clock_tree_synthesis -root_buf sky130_fd_sc_hd__clkbuf_16 \
                      -buf_list {sky130_fd_sc_hd__clkbuf_1 sky130_fd_sc_hd__clkbuf_2 sky130_fd_sc_hd__clkbuf_4 sky130_fd_sc_hd__clkbuf_8 sky130_fd_sc_hd__clkbuf_16} \
                      -sink_clustering_enable

puts "===== CTS DONE ====="

# From here on, evaluate timing against the REAL synthesized clock tree
# (insertion delay + skew) instead of the ideal zero-skew clock stage 2/3
# used -- this is the point where hold violations can first appear for
# real, since ideal clocks make hold trivially easy to pass.
set_propagated_clock [all_clocks]

estimate_parasitics -placement
puts "===== POST-CTS TIMING (propagated clock, pre-legalize) ====="
report_worst_slack -max
report_worst_slack -min
report_clock_skew

detailed_placement
check_placement

puts "===== POST-CTS LEGALIZATION DONE ====="

estimate_parasitics -placement
puts "===== POST-CTS-LEGALIZE TIMING ====="
report_worst_slack -max
report_worst_slack -min
report_tns
report_wns

repair_timing -setup
puts "===== POST-CTS REPAIR_TIMING -setup DONE ====="

# repair_timing inserts/clones/resizes cells using its own fast placement
# heuristic, which does NOT guarantee the result is legal (snapped to the
# site/row grid, non-overlapping). Re-legalize after every repair_timing
# call, or the newly-inserted cells can end up with pins TritonRoute later
# reports as having "No access point" (fatal DRT-0073), aborting detailed
# routing entirely.
detailed_placement
check_placement
puts "===== POST-REPAIR-SETUP LEGALIZATION DONE ====="

estimate_parasitics -placement
report_worst_slack -max
report_worst_slack -min
report_tns
report_wns

repair_timing -hold
puts "===== POST-CTS REPAIR_TIMING -hold DONE ====="

detailed_placement
check_placement
puts "===== POST-REPAIR-HOLD LEGALIZATION DONE ====="

estimate_parasitics -placement
puts "===== FINAL POST-CTS TIMING ====="
report_worst_slack -max
report_worst_slack -min
report_tns -digits 4
report_wns -digits 4
report_clock_skew
report_design_area

write_def /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_cts.def
write_db /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_cts.odb
puts "===== WROTE gpu_core_cts.def / .odb ====="
