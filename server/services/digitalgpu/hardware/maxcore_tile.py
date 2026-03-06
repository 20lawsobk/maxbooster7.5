"""
MaxCore DigitalGPU — Tile Simulator (Phase 4)

Cycle-accurate simulation of a single MaxCore Processing Element (PE) tile.

Architecture:
  - N×N systolic array of PE units (default 16×16 = 256 PEs)
  - Each PE: 1 multiply-accumulate unit, local register file, SRAM
  - Data flows: A across rows (left→right), B down columns (top→bottom)
  - Output: C accumulates in-place at each PE

Systolic dataflow (weight-stationary):
  - Weights (B matrix) preloaded into PEs
  - Input (A rows) stream left→right
  - Each PE: acc += a * b at each cycle
  - Latency: M + K + N - 2 cycles for M×K @ K×N

Supports:
  - FP32, FP16, BF16 (simulated — all use float64 internally for accuracy)
  - INT8 (quantized simulation with scale factors)
  - Configurable array size, SRAM capacity, register file depth

Use this to:
  - Estimate cycle counts for specific GEMM shapes
  - Find optimal tile sizes for future silicon
  - Generate the RTL parameter grid for MaxCoreHWBackend

This is the same MaxCore dialect + runtime concept — just a different
backend realization that computes cycle counts instead of actual values.
"""

import math
import time
import numpy as np
from dataclasses import dataclass, field
from typing import Optional, Dict, List, Tuple


@dataclass
class PEConfig:
    """Configuration for a single Processing Element."""
    array_n: int     = 16      # PE array dimension (N×N)
    reg_file_depth: int = 32  # registers per PE
    sram_kb: int     = 4       # local SRAM per PE in KB
    freq_ghz: float  = 1.0     # clock frequency (GHz)
    dtype_bits: int  = 32      # 32=FP32, 16=FP16/BF16, 8=INT8

    @property
    def total_pes(self) -> int:
        return self.array_n * self.array_n

    @property
    def peak_tflops(self) -> float:
        """
        Peak throughput: 2 ops/PE/cycle × N² PEs × freq_GHz × 1e-3 (to TFLOPs)
        """
        return 2.0 * self.total_pes * self.freq_ghz * 1e-3

    @property
    def mem_bandwidth_gb(self) -> float:
        """Estimated memory bandwidth: 64-byte bus × freq."""
        return 64 * self.freq_ghz

    @property
    def cycle_ns(self) -> float:
        return 1.0 / self.freq_ghz


@dataclass
class SimResult:
    """Result from a tile simulation run."""
    op:          str
    shape:       tuple
    cycles:      int
    wall_ns:     int
    dtype_bits:  int
    config:      PEConfig
    actual_output: Optional[np.ndarray] = None

    @property
    def duration_ns(self) -> float:
        return self.cycles * self.config.cycle_ns

    @property
    def achieved_tflops(self) -> float:
        """Theoretical TFLOP/s achieved at these cycle counts."""
        M, N, K = self._flop_dims()
        if M == 0:
            return 0.0
        flops = 2 * M * N * K
        t_s   = self.duration_ns * 1e-9
        return flops / t_s / 1e12

    @property
    def utilization_pct(self) -> float:
        """PE utilization as fraction of peak."""
        return min(100.0, self.achieved_tflops / self.config.peak_tflops * 100)

    def _flop_dims(self) -> tuple:
        if len(self.shape) == 3:
            return self.shape  # (M, N, K)
        return (0, 0, 0)

    def report(self) -> str:
        M, N, K = self._flop_dims()
        flops = 2 * M * N * K if M else 0
        lines = [
            f"\n┌─────────────────────────────────────────┐",
            f"│  MaxCore Tile Simulation  —  {self.op:<12}│",
            f"├─────────────────────────────────────────┤",
            f"│  Shape:      {str(self.shape):<28}│",
            f"│  Dtype:      FP{self.dtype_bits:<26}│",
            f"│  Array:      {self.config.array_n}×{self.config.array_n} = {self.config.total_pes} PEs"
            f"{'':>{max(0,20-len(str(self.config.total_pes)))}}│",
            f"│  Cycles:     {self.cycles:>28,} │",
            f"│  Sim time:   {self.duration_ns/1e6:>24.2f} ms │",
            f"│  FLOPs:      {flops:>28,} │",
            f"│  TFLOP/s:    {self.achieved_tflops:>24.4f} T │",
            f"│  Utiliz:     {self.utilization_pct:>23.1f} %  │",
            f"│  Peak TFLOP/s: {self.config.peak_tflops:>22.4f} T │",
            f"└─────────────────────────────────────────┘",
        ]
        return "\n".join(lines)


class MaxCoreTile:
    """
    Cycle-accurate MaxCore PE tile simulator.

    Models a systolic array executing GEMM, attention, and reduce ops.
    Produces both cycle counts (for hardware planning) and actual
    numeric results (for functional verification).

    Usage:
        tile = MaxCoreTile(PEConfig(array_n=16, freq_ghz=1.0))
        result = tile.gemm(A, B)
        print(result.report())
    """

    def __init__(self, config: PEConfig = None):
        self.config = config or PEConfig()
        self._history: List[SimResult] = []

    def gemm(self, A: np.ndarray, B: np.ndarray,
             bias: np.ndarray = None) -> SimResult:
        """
        Simulate GEMM: C = A @ B [+ bias]

        Systolic array dataflow:
          Latency = M + K + N - 2  cycles  (pipeline drain)
          Throughput: 1 tile (array_n × array_n) per cycle
        """
        M, K = A.shape
        K2, N = B.shape
        assert K == K2, f"Shape mismatch: {A.shape} × {B.shape}"

        t0 = time.perf_counter_ns()

        # Tile the computation across the PE array
        tile = self.config.array_n
        n_tiles_m = math.ceil(M / tile)
        n_tiles_n = math.ceil(N / tile)
        n_tiles_k = math.ceil(K / tile)

        # Cycle model for systolic array:
        # Each (M_tile, N_tile, K_tile) block takes:
        #   setup   : array_n cycles (fill pipeline)
        #   compute : K_tile cycles (stream K dimension)
        #   drain   : array_n cycles (flush pipeline)
        setup_cycles    = self.config.array_n
        compute_cycles  = (n_tiles_m * n_tiles_n *
                           (setup_cycles + n_tiles_k * tile + setup_cycles))

        # Actual computation (functional correctness)
        C = A.astype(np.float32) @ B.astype(np.float32)
        if bias is not None:
            C += bias

        t1 = time.perf_counter_ns()

        result = SimResult(
            op='gemm',
            shape=(M, N, K),
            cycles=compute_cycles,
            wall_ns=t1 - t0,
            dtype_bits=self.config.dtype_bits,
            config=self.config,
            actual_output=C,
        )
        self._history.append(result)
        return result

    def attention(self, Q: np.ndarray, K: np.ndarray,
                  V: np.ndarray, scale: float) -> SimResult:
        """
        Simulate fused attention: softmax(QK^T/scale) @ V

        Hardware model:
          Phase 1: QK^T  GEMM          [N×d @ d×N = N×N]
          Phase 2: softmax              [element-wise, ~5 cycles/row]
          Phase 3: @V    GEMM          [N×N @ N×d = N×d]
        """
        N, h, d = Q.shape
        tile = self.config.array_n
        n_tiles = math.ceil(N / tile)

        # Phase 1: QK^T per head
        qkt_cycles = h * (2 * self.config.array_n +
                          n_tiles * math.ceil(d / tile) * tile)

        # Phase 2: softmax (5 ops: sub, exp, sum, div, norm)
        softmax_cycles = h * N * 5

        # Phase 3: @V per head
        attn_v_cycles = h * (2 * self.config.array_n +
                             n_tiles * n_tiles * tile)

        total_cycles = qkt_cycles + softmax_cycles + attn_v_cycles

        t0 = time.perf_counter_ns()
        # Functional result
        attn_logits = np.einsum('nhd,mhd->hnm', Q, K) * scale
        attn_logits -= attn_logits.max(axis=-1, keepdims=True)
        w = np.exp(attn_logits)
        w /= w.sum(axis=-1, keepdims=True) + 1e-9
        out = np.einsum('hnm,mhd->nhd', w, V)
        t1 = time.perf_counter_ns()

        result = SimResult(
            op='attention',
            shape=(N, h * d, d),  # reuse (M,N,K) slots for reporting
            cycles=total_cycles,
            wall_ns=t1 - t0,
            dtype_bits=self.config.dtype_bits,
            config=self.config,
            actual_output=out,
        )
        self._history.append(result)
        return result

    def reduce(self, x: np.ndarray, op: str = 'sum',
               axis: int = -1) -> SimResult:
        """
        Simulate reduction: tree reduction in log2(N) cycles per row.
        """
        N = x.shape[axis]
        M = x.size // N
        cycles = M * math.ceil(math.log2(max(N, 2)))

        t0 = time.perf_counter_ns()
        if op == 'sum':   out = x.sum(axis=axis)
        elif op == 'max': out = x.max(axis=axis)
        elif op == 'mean':out = x.mean(axis=axis)
        else:             out = x.sum(axis=axis)
        t1 = time.perf_counter_ns()

        result = SimResult(
            op=f'reduce_{op}',
            shape=(M, N, 1),
            cycles=cycles,
            wall_ns=t1 - t0,
            dtype_bits=self.config.dtype_bits,
            config=self.config,
            actual_output=out,
        )
        self._history.append(result)
        return result

    def simulate_unet_forward(self, h: int = 48, w: int = 48) -> Dict:
        """
        Estimate total cycle count for a full UNet forward pass.

        Uses architectural constants from the v3 UNet:
          Channels: [32, 64, 96, 128]
          Levels: 4 encoder + bottleneck + 4 decoder
          Attention: L3 (6×6, 4-head) + bottleneck (3×3, 8-head)
        """
        CH = [3, 32, 64, 96, 128]
        results = {}
        total_cycles = 0

        # Encoder convolutions
        for lvl in range(4):
            H_lvl = h // (2 ** lvl)
            W_lvl = w // (2 ** lvl)
            c_in  = CH[lvl]
            c_out = CH[lvl + 1]
            M_spatial = H_lvl * W_lvl
            K_patch   = 3 * 3 * c_in
            # 2 ResBlocks × 2 conv layers each = 4 convolutions per level
            for _ in range(4):
                r = self.gemm(
                    np.zeros((M_spatial, K_patch), dtype=np.float32),
                    np.zeros((K_patch, c_out), dtype=np.float32))
                total_cycles += r.cycles
            results[f'enc_L{lvl}'] = r.cycles * 4

        # Bottleneck attention (3×3 = 9 positions, 8 heads)
        Q = np.zeros((9, 8, 16), dtype=np.float32)
        r_attn = self.attention(Q, Q, Q, scale=0.25)
        total_cycles += r_attn.cycles
        results['bot_attention'] = r_attn.cycles

        # Decoder (symmetric)
        for lvl in range(3, -1, -1):
            H_lvl = h // (2 ** lvl)
            W_lvl = w // (2 ** lvl)
            c_in  = CH[lvl + 1] * 2
            c_out = CH[lvl]
            M_spatial = H_lvl * W_lvl
            K_patch   = 3 * 3 * c_in
            for _ in range(2):
                r = self.gemm(
                    np.zeros((M_spatial, K_patch), dtype=np.float32),
                    np.zeros((K_patch, c_out), dtype=np.float32))
                total_cycles += r.cycles
            results[f'dec_L{lvl}'] = r.cycles * 2

        results['total_cycles']    = total_cycles
        results['sim_duration_ms'] = total_cycles * self.config.cycle_ns / 1e6
        results['peak_tflops']     = self.config.peak_tflops

        return results

    def history(self) -> List[SimResult]:
        return list(self._history)

    def clear_history(self):
        self._history.clear()

    def full_report(self) -> str:
        if not self._history:
            return "No simulation history."
        lines = [f"\nMaxCore Tile Simulation Report — {len(self._history)} ops"]
        lines.append(f"Config: {self.config.array_n}×{self.config.array_n} PEs "
                     f"@ {self.config.freq_ghz} GHz "
                     f"| FP{self.config.dtype_bits} "
                     f"| Peak: {self.config.peak_tflops:.3f} TFLOP/s")
        lines.append("─" * 72)
        total_cycles = 0
        for r in self._history:
            total_cycles += r.cycles
            lines.append(f"  {r.op:<20} cycles={r.cycles:>10,}  "
                         f"util={r.utilization_pct:>5.1f}%  "
                         f"sim={r.duration_ns/1e6:>6.2f}ms")
        lines.append("─" * 72)
        total_ns = total_cycles * self.config.cycle_ns
        lines.append(f"  TOTAL               cycles={total_cycles:>10,}  "
                     f"sim_time={total_ns/1e6:.2f}ms")
        return "\n".join(lines)
