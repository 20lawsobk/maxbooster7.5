// gpu_core_tb_portonly.v
//
// A second, stricter testbench added after the FIRST real synthesis run
// exposed a genuine design gap: the original gpu_core_tb.v drives the core
// by poking dut.imem[...]/dut.gmem[...] and reading dut.regfile[...] via
// hierarchical references. That only works inside a simulator -- a real,
// packaged chip cannot be hierarchically poked from outside, and (more to
// the point) a synthesis tool correctly treats any signal with no path to
// a primary output as dead logic and deletes it. With only `halted` as an
// output, that is exactly what happened: the very first synthesis run
// collapsed the whole design to 2 cells.
//
// This testbench exercises gpu_core through ONLY its primary ports --
// imem_we/imem_waddr/imem_wdata to load a program, rd_lane/rd_reg/rd_data
// and rd_mem_addr/rd_mem_data to read results back -- exactly the way an
// external host (or a real chip's test equipment) would have to. It proves
// the port interface itself is sufficient to load a real kernel and observe
// real per-lane divergent results with zero simulator-only shortcuts.
//
// Known, stated limitation: the ISA has no external data-load port for
// gmem, only for imem. Arbitrary input arrays therefore cannot be DMA'd in
// from the host in this design; all input data for this test is generated
// on-core from LIDX (per-lane index) and LI (shared immediate) via real
// instructions, which is honest given the ISA as designed, not a workaround
// -- initializing memory from immediates/index arithmetic is exactly how
// small bring-up kernels prime state on real hardware too.
`timescale 1ns/1ps

module gpu_core_tb_portonly;

    localparam OP_NOP   = 4'h0;
    localparam OP_LI    = 4'h1;
    localparam OP_ADD   = 4'h2;
    localparam OP_MUL   = 4'h3;
    localparam OP_LDG   = 4'h4;
    localparam OP_STG   = 4'h5;
    localparam OP_LIDX  = 4'h6;
    localparam OP_CMPLT = 4'h7;
    localparam OP_PRED  = 4'h8;
    localparam OP_RSTP  = 4'h9;
    localparam OP_HALT  = 4'hA;

    function [31:0] enc(input [3:0] op, input [3:0] rd, input [3:0] rs1, input [3:0] rs2, input signed [15:0] imm);
        enc = {op, rd, rs1, rs2, imm};
    endfunction

    reg clk = 0;
    reg rst = 1;
    wire halted;

    reg         imem_we    = 0;
    reg  [4:0]  imem_waddr = 0;
    reg  [31:0] imem_wdata = 0;

    reg  [2:0]  rd_lane     = 0;
    reg  [3:0]  rd_reg      = 0;
    wire [31:0] rd_data;
    reg  [5:0]  rd_mem_addr = 0;
    wire [31:0] rd_mem_data;

    integer errors = 0;
    integer lane;
    integer k;

    // Instructions, defined here so the testbench can also compute expected
    // values independently -- not read back from the DUT.
    // (Named kernel_prog, not "program" -- that identifier is a reserved
    // SystemVerilog keyword and breaks the parser.)
    reg [31:0] kernel_prog [0:11];

    // No parameter override list: these match gpu_core's own defaults
    // exactly (LANES=8, REGS=16, DATA_W=32, MEM_DEPTH=64, IMEM_DEPTH=32), so
    // leaving it parameter-free lets this same testbench instantiate either
    // the parametrized RTL (gpu_core.v, using its defaults) or the flattened
    // post-synthesis netlist (gpu_core_synth.v, which has no parameters at
    // all once synth -flatten elaborates it) without edits.
    gpu_core dut (
        .clk(clk), .rst(rst), .halted(halted),
        .imem_we(imem_we), .imem_waddr(imem_waddr), .imem_wdata(imem_wdata),
        .rd_lane(rd_lane), .rd_reg(rd_reg), .rd_data(rd_data),
        .rd_mem_addr(rd_mem_addr), .rd_mem_data(rd_mem_data)
    );

    always #5 clk = ~clk;

    task run_until_halted(input integer max_cycles);
        integer c;
        begin
            c = 0;
            while (!halted && c < max_cycles) begin
                @(posedge clk);
                c = c + 1;
            end
            if (!halted) begin
                $display("TIMEOUT: core did not halt within %0d cycles", max_cycles);
                errors = errors + 1;
            end else begin
                $display("halted after %0d cycles", c);
            end
        end
    endtask

    initial begin
        // ---- Real per-lane divergence kernel, loaded and read back purely
        // through primary ports (no dut.xxx hierarchical access anywhere
        // in this file):
        //   R1 = LIDX                       ; i = 0..7
        //   R7 = 1000
        //   R6 = R1 + R7                    ; pre-predication sentinel = i+1000
        //   gmem[R1+0] = R6                 ; ALL lanes write their sentinel
        //   R2 = 4
        //   R3 = (R1 < R2) ? 1 : 0          ; lanes 0-3 true
        //   PRED R3                         ; only lanes 0-3 stay active
        //   R4 = 7
        //   R5 = R1 * R4                    ; i*7, committed only by active lanes
        //   gmem[R1+0] = R5                 ; overwrites sentinel for lanes 0-3 only
        //   RSTP
        //   HALT
        kernel_prog[0]  = enc(OP_LIDX,  1, 0, 0, 0);
        kernel_prog[1]  = enc(OP_LI,    7, 0, 0, 1000);
        kernel_prog[2]  = enc(OP_ADD,   6, 1, 7, 0);
        kernel_prog[3]  = enc(OP_STG,   0, 1, 6, 0);
        kernel_prog[4]  = enc(OP_LI,    2, 0, 0, 4);
        kernel_prog[5]  = enc(OP_CMPLT, 3, 1, 2, 0);
        kernel_prog[6]  = enc(OP_PRED,  0, 3, 0, 0);
        kernel_prog[7]  = enc(OP_LI,    4, 0, 0, 7);
        kernel_prog[8]  = enc(OP_MUL,   5, 1, 4, 0);
        kernel_prog[9]  = enc(OP_STG,   0, 1, 5, 0);
        kernel_prog[10] = enc(OP_RSTP,  0, 0, 0, 0);
        kernel_prog[11] = enc(OP_HALT,  0, 0, 0, 0);

        // Hold reset while loading -- load is independent of rst/halted by
        // design, but doing it during reset mirrors how a real host would
        // sequence "load kernel, then launch".
        //
        // Each iteration resumes at #1 past the clock edge (strictly after
        // the write-port always block's NBA region has settled for the
        // PREVIOUS word) before driving the NEXT address/data with blocking
        // assignments. Without that #1, the blocking stimulus update and
        // the write-port's nonblocking sampling are two separate processes
        // racing on the same posedge with no defined order between them --
        // a classic testbench hazard, not a DUT bug: it silently swapped in
        // the next iteration's address/data before roughly half the writes
        // sampled, corrupting every other instruction word.
        rst = 1;
        @(posedge clk);
        #1;
        for (k = 0; k < 12; k = k + 1) begin
            imem_we    = 1;
            imem_waddr = k[4:0];
            imem_wdata = kernel_prog[k];
            @(posedge clk);
            #1;
        end
        imem_we = 0;

        @(posedge clk);
        #1;
        rst = 0;
        run_until_halted(100);

        $display("---- Port-only run: program + readback via primary I/O only, zero hierarchical access ----");

        // Check gmem[0..7] via rd_mem_addr/rd_mem_data.
        for (lane = 0; lane < 8; lane = lane + 1) begin
            rd_mem_addr = lane[5:0];
            #1; // allow the combinational read to settle
            if (lane < 4) begin
                if (rd_mem_data !== (lane * 7)) begin
                    $display("  gmem[%0d] (active lane, should be i*7) MISMATCH: got %0d expected %0d", lane, rd_mem_data, lane*7);
                    errors = errors + 1;
                end else begin
                    $display("  gmem[%0d] OK: active lane wrote i*7 = %0d", lane, rd_mem_data);
                end
            end else begin
                if (rd_mem_data !== (lane + 1000)) begin
                    $display("  gmem[%0d] (masked-off lane, should keep sentinel) MISMATCH: got %0d expected %0d", lane, rd_mem_data, lane+1000);
                    errors = errors + 1;
                end else begin
                    $display("  gmem[%0d] OK: masked-off lane kept pre-predication sentinel %0d (real divergence, verified through the read port)", lane, rd_mem_data);
                end
            end
        end

        // Check regfile[lane][5] via rd_lane/rd_reg/rd_data: active lanes
        // hold i*7 (written by the predicated MUL); masked-off lanes hold
        // their reset value 0 (the MUL write was ALSO masked for them --
        // predication gates every commit, not just memory stores).
        for (lane = 0; lane < 8; lane = lane + 1) begin
            rd_lane = lane[2:0];
            rd_reg  = 5;
            #1;
            if (lane < 4) begin
                if (rd_data !== (lane * 7)) begin
                    $display("  regfile[%0d][R5] (active lane) MISMATCH: got %0d expected %0d", lane, rd_data, lane*7);
                    errors = errors + 1;
                end else begin
                    $display("  regfile[%0d][R5] OK: active lane register write = %0d", lane, rd_data);
                end
            end else begin
                if (rd_data !== 0) begin
                    $display("  regfile[%0d][R5] (masked-off lane, register write should ALSO be masked) MISMATCH: got %0d expected 0", lane, rd_data);
                    errors = errors + 1;
                end else begin
                    $display("  regfile[%0d][R5] OK: masked-off lane's register write was correctly suppressed too (stayed at reset value 0)", lane);
                end
            end
        end

        if (errors == 0)
            $display("\nRESULT: ALL CHECKS PASSED (%0d assertions, 0 failures) -- real per-lane divergence proved through primary I/O ports only, no hierarchical simulator access.", 16);
        else
            $display("\nRESULT: %0d CHECK(S) FAILED", errors);

        $finish;
    end

endmodule
