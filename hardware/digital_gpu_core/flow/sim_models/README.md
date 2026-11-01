# Simulation-only cell model copy

`sky130_fd_sc_hd.sim.v` is a byte-for-byte copy of the installed sky130 PDK's
`libs.ref/sky130_fd_sc_hd/verilog/sky130_fd_sc_hd.v`, with exactly one line
patched: the `` `endif SKY130_FD_SC_HD__LPFLOW_BLEEDER_FUNCTIONAL_V`` guard
comment is missing its `//` in the vendor file (confirmed a lone typo -- every
other one of the file's 3100+ endif/else guard comments correctly has `//`),
which makes Icarus Verilog's preprocessor treat the guard name as a bare
token and fail with a syntax error deep in the file. This copy adds the
missing `//` so the line is a comment, matching every other guard in the
file. No other byte differs from the installed PDK file.

The real PDK install under `.volare/` is never modified -- this file exists
only so `iverilog`-based gate-level simulation has a parseable copy of the
cell behavioral models. Synthesis (Yosys) never reads this file; it uses the
liberty (`.lib`) timing/function view directly.
