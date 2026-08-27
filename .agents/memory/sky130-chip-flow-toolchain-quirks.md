---
name: Hand-orchestrated Yosys/sky130 toolchain quirks
description: Environment/tooling gotchas hit while running a native (non-OpenLane) Yosys -> OpenROAD -> Magic -> Netgen flow against the SkyWater sky130 PDK installed via volare, in a container with no Docker.
---

## volare silently 401s if a GitHub integration token is present
`volare` (the sky130 PDK version manager) calls the public GitHub API to list/fetch PDK releases. If the repl has a GitHub integration installed, its `GITHUB_TOKEN`/`GITHUB_PERSONAL_ACCESS_TOKEN`/`GITHUB_PAT`/`GITHUB_REPO` env vars get auto-picked-up by generic HTTP tooling and sent as auth — but a token scoped to the user's own repo(s) is not valid for volare's public PDK-release API calls, so requests 401 instead of falling back to anonymous access.

**Why:** volare has no code of its own that reads these vars deliberately; some underlying HTTP client/library defaults to using any ambient GitHub credential it finds.
**How to apply:** run volare commands with those vars stripped, e.g. `env -u GITHUB_TOKEN -u GITHUB_PERSONAL_ACCESS_TOKEN -u GITHUB_REPO -u GITHUB_PAT volare enable ...`, so it falls back to anonymous public GitHub API access. Never print/inspect the token values themselves while debugging this.

## Double-backgrounding kills the task before it starts
Passing `run_in_background: true` to a shell-exec tool call AND ALSO appending a trailing `&` inside the script body is not redundant-but-harmless — it silently orphans/kills the real command before it produces output. The wrapper exits 0 immediately, no log file or process appears, and the thing you meant to background (e.g. a large PDK download) never actually ran.
**Why:** the outer tool already backgrounds the whole script; adding an inner `&` backgrounds a child of a process that the outer mechanism may tear down immediately since it considers the (empty) foreground command already finished.
**How to apply:** background at exactly one layer — either the tool's `run_in_background` flag, or a trailing `&`, never both. If a background download/build produces no log and no process, suspect double-backgrounding first.

## One real typo in the sky130 PDK's own verilog cell library breaks Icarus Verilog
`libs.ref/sky130_fd_sc_hd/verilog/sky130_fd_sc_hd.v` (as fetched via volare) has exactly one line — an `` `endif GUARDNAME`` closing a `` `ifndef SKY130_FD_SC_HD__LPFLOW_BLEEDER_FUNCTIONAL_V`` — missing the `//` that all 3100+ other endif/else guard-name comments in the same file have. Icarus Verilog's preprocessor cannot parse a bare trailing identifier after `` `endif`` and throws a hard-to-diagnose syntax error deep in the file (tens of thousands of lines past the real cause), preceded by a wall of unrelated "macro UNIT_DELAY undefined (and assumed null)" warnings that are a red herring (defining `-D UNIT_DELAY=#1` does NOT fix it).
**Why:** confirmed via `grep -c` that this exact bare-trailing-identifier pattern occurs exactly once in the file, vs 3100+ correctly-commented instances — a genuine isolated vendor typo, not a systemic incompatibility.
**How to apply:** for iverilog-based gate-level simulation, never edit the installed PDK in place. Make a private sanitized copy (e.g. `flow/sim_models/sky130_fd_sc_hd.sim.v`) with only that one line patched (add `// ` before the trailing guard name), and point the simulator at the copy. Yosys synthesis itself is unaffected since it reads the `.lib` file, never this `.v` behavioral model.

## Yosys `check -noinit` can report false-positive "no driver" on port wires
After a full `synth -flatten` -> `dfflibmap` -> `abc -liberty` -> `clean -purge` flow, `check -noinit` reported "used but has no driver" for several real output ports (a registered output and two combinational read-port outputs) even though the design was logically complete and non-trivial (tens of thousands of real cells). The written `write_verilog` netlist showed these exact signals correctly connected to real cell outputs (e.g. `.Q(the_signal)`).
**Why:** `write_verilog`'s own backend prep passes (BMUXMAP/DEMUXMAP) run strictly after `check`, and appear to perform additional port-to-driver wire canonicalization that `check` at that point in the flow doesn't yet see — i.e. the warning reflects a transient/intermediate netlist state, not the final one.
**How to apply:** don't trust a `check` "no driver" warning on ports as ground truth by itself when the design is otherwise large/real (as opposed to the classic degenerate-netlist case). Confirm with an actual gate-level simulation of the written netlist (real cell behavioral models) reproducing the RTL-level testbench's pass/fail results — that is definitive; log warnings at intermediate stages are not.
