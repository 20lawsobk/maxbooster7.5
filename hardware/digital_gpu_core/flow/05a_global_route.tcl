# Stage 5a: global route only, from the CTS checkpoint.
#
# Split out of the old monolithic 05_route.tcl so global routing gets its
# own checkpoint (gpu_core_globalroute.def/.odb). Running it as its own
# process means its memory is fully released when it exits, and detailed
# routing (05b) always has a safe, independent point to resume from instead
# of re-running global route after every interruption.
#
# Invoke via the shared runner (real multi-threading + real elapsed/peak-RSS
# measurement -- see run_stage.sh's own header for why):
#   flow/run_stage.sh 05a_global_route.tcl /path/to/log_prefix
#
# Raw invocation still works as:
#   source flow/pdk_env.sh && openroad -exit flow/05a_global_route.tcl

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
puts "===== POST-GLOBAL-ROUTE TIMING (route-based parasitics) ====="
report_worst_slack -max
report_worst_slack -min
report_tns
report_wns

write_def /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_globalroute.def
write_db /home/runner/workspace/hardware/digital_gpu_core/flow/gpu_core_globalroute.odb
puts "===== WROTE gpu_core_globalroute.def / .odb ====="
