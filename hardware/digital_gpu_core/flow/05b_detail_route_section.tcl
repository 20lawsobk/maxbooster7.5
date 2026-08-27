# Stage 5b: ONE bounded section of detailed routing.
#
# Reloads env(SECTION_INPUT_DB), runs detailed_route for at most
# env(SECTION_END_ITER) more iterations, writes env(SECTION_OUTPUT_PREFIX)
# .def/.odb/.drc. Each section is its own openroad process: peak memory
# resets between sections instead of accumulating across one long-running
# process, and an interruption only loses the current section instead of
# the whole detailed-route run.
#
# Invoke via the shared runner (applies real multi-threading + real
# elapsed/peak-RSS measurement -- see run_stage.sh's own header for why):
#   SECTION_INPUT_DB=/path/in.odb \
#   SECTION_OUTPUT_PREFIX=/path/out_prefix \
#   SECTION_END_ITER=3 \
#     flow/run_stage.sh 05b_detail_route_section.tcl /path/to/log_prefix
#
# Raw invocation (no threading, no timing/memory capture) still works as:
#   source flow/pdk_env.sh
#   SECTION_INPUT_DB=/path/in.odb \
#   SECTION_OUTPUT_PREFIX=/path/out_prefix \
#   SECTION_END_ITER=3 \
#     openroad -exit flow/05b_detail_route_section.tcl

read_lef $::env(TECH_LEF)
read_lef $::env(CELL_LEF)
read_liberty $::env(LIB_TT)
read_db $::env(SECTION_INPUT_DB)

create_clock -name clk -period 12.0 [get_ports clk]
set_input_delay -clock clk 0.0 [all_inputs -no_clocks]
set_output_delay -clock clk 0.0 [all_outputs]
set_wire_rc -signal -layer met2
set_wire_rc -clock  -layer met4
set_propagated_clock [all_clocks]
set_routing_layers -signal met1-met5 -clock met1-met5

set end_iter   $::env(SECTION_END_ITER)
set out_prefix $::env(SECTION_OUTPUT_PREFIX)

puts "===== SECTION START: input=$::env(SECTION_INPUT_DB) end_iter=$end_iter ====="

detailed_route -bottom_routing_layer met1 -top_routing_layer met5 \
                -output_drc ${out_prefix}.drc \
                -droute_end_iter $end_iter \
                -verbose 1

puts "===== SECTION DETAILED ROUTE DONE (end_iter=$end_iter) ====="

estimate_parasitics -detailed_routing
report_worst_slack -max
report_worst_slack -min

write_def ${out_prefix}.def
write_db ${out_prefix}.odb
puts "===== WROTE ${out_prefix}.def / .odb ====="
