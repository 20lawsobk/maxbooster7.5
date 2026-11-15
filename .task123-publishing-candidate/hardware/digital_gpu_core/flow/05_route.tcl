# Stage 5: global + detailed routing of the post-CTS design.
#
# Invoke as:  source flow/pdk_env.sh && openroad -exit flow/05_route.tcl
#
# li1 (local interconnect) is intentionally excluded from the general
# routing layer range -- it's reserved for very short intra-cell hops in
# this PDK's convention, not general-purpose signal routing. met1-met5
# covers the full general-purpose stack available in sky130_fd_sc_hd.

read_lef $::env(TECH_LEF)
read_lef $::env(CELL_LEF)
read_liberty $::env(LIB_TT)
read_db /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_cts.odb

create_clock -name clk -period 12.0 [get_ports clk]
set_input_delay -clock clk 0.0 [all_inputs -no_clocks]
set_output_delay -clock clk 0.0 [all_outputs]
set_wire_rc -signal -layer met2
set_wire_rc -clock  -layer met4
set_propagated_clock [all_clocks]

puts "===== RELOADED POST-CTS DESIGN, CONSTRAINTS RE-APPLIED ====="
report_worst_slack -max
report_worst_slack -min

set_routing_layers -signal met1-met5 -clock met1-met5

global_route -guide_file /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core.guide \
             -congestion_iterations 30 \
             -allow_congestion \
             -verbose

puts "===== GLOBAL ROUTE DONE ====="

estimate_parasitics -global_routing
puts "===== POST-GLOBAL-ROUTE TIMING (route-based parasitics, more accurate than placement-based) ====="
report_worst_slack -max
report_worst_slack -min
report_tns
report_wns

detailed_route -bottom_routing_layer met1 -top_routing_layer met5 \
                -output_drc /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_route.drc \
                -droute_end_iter 30 \
                -verbose 1

puts "===== DETAILED ROUTE DONE ====="

write_def /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_routed.def
write_db /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_routed.odb
puts "===== WROTE gpu_core_routed.def / .odb ====="
