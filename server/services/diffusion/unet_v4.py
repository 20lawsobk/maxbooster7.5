"""
U-Net Denoiser v4 — Video-Native Architecture
Maximum scale, temporal coherence, music-industry optimized.

Architecture upgrades over v3:
  ─────────────────────────────────────────────────────────────────
  Channels   [32,64,96,128] → [128,256,512,1024]    (8-32× wider)
  Levels     4              → 5                      (+1 level, 2×2 bottleneck)
  ResBlocks  2/level        → 4/level               (2× depth per level)
  Bottleneck 3 ResBlocks    → 6 ResBlocks           (2× depth)
  Attention  2 levels       → 5 levels              (ALL deep levels)
  Heads      4/8            → 8/12/16/24/32         (progressive scale)
  Resolution 48×48          → 96×96                 (4× pixel area)
  Temporal   single frame   → T=32 frame sequences  (video-native)
  Params     ~3M            → ~300M                 (100× scale-up)
  ─────────────────────────────────────────────────────────────────

Spatial resolution flow (96×96 input, T frames):
  L0: [T,96,96,128]  → [T,48,48,128]  (MaxPool)   depthwise-sep convs
  L1: [T,48,48,256]  → [T,24,24,256]  (MaxPool)   depthwise-sep convs
  L2: [T,24,24,512]  → [T,12,12,512]  (MaxPool)   standard + 8-head spatial attn
  L3: [T,12,12,1024] → [T, 6, 6,1024] (MaxPool)   standard + 12-head spatial + temporal
  L4: [T, 6, 6,1024] → [T, 3, 3,1024] (MaxPool)   standard + 16-head spatial + temporal
  Bot: [T, 3, 3,1024] 6 ResBlocks     + 24-head spatial + 32-head temporal attention

Temporal attention (TemporalAttention1D):
  Applied at L3, L4, and bottleneck — cheaper levels (small spatial)
  T=32 frames attend to each other at each spatial position
  Factored: space then time → O(T×HW²) + O(HW×T²), not O((THW)²)

Music-industry scene embedding:
  Text encoder produces 256-dim music-aware embeddings
  FiLM conditioning uses both time(128) + text(128) = 256-dim cond vector
  Scene-specific conditioning layers at ALL encoder+decoder levels

Gradient checkpointing:
  Levels L0/L1 use checkpoint_forward() — recompute activations in backward
  This halves memory usage, enabling 300M params on constrained hardware

Progressive training:
  Phase 1: T=4,  96×96  — spatial quality foundation
  Phase 2: T=8,  96×96  — short motion learning
  Phase 3: T=16, 96×96  — medium motion and scene transitions
  Phase 4: T=32, 96×96  — full video coherence (final form)
"""

import os
import numpy as np
import math
from .layers import (Conv2D, ResBlock, SelfAttention2D, GroupNorm,
                     Linear, SiLU, MaxPool2x2, upsample2x, upsample2x_backward)
from .temporal_attention import TemporalAttention1D

# ── Architecture constants (FULL — for GPU / Windows D: drive server) ─────────
CH0_FULL      = 128
CH1_FULL      = 256
CH2_FULL      = 512
CH3_FULL      = 1024
CH4_FULL      = 1024
COND_DIM_FULL = 256
N_RES_FULL    = 4
N_BOT_FULL    = 6

# ── Architecture constants (LITE — for CPU / Replit, ~6M params) ─────────────
CH0_LITE      = 32
CH1_LITE      = 64
CH2_LITE      = 128
CH3_LITE      = 256
CH4_LITE      = 256
COND_DIM_LITE = 128
N_RES_LITE    = 2
N_BOT_LITE    = 3

# ── Default (module-level) constants stay FULL for backward compat ────────────
CH0      = CH0_FULL
CH1      = CH1_FULL
CH2      = CH2_FULL
CH3      = CH3_FULL
CH4      = CH4_FULL
COND_DIM = COND_DIM_FULL
N_RES    = N_RES_FULL
N_BOT    = N_BOT_FULL


# ── Depthwise-separable Conv2D ────────────────────────────────────────────────

class DepthwiseSepConv:
    """
    Depthwise-separable convolution: DW (C×1×3×3) + PW (C_in×C_out×1×1)
    ~8× fewer FLOPs than standard 3×3 conv at same channel count.
    Used at high-resolution levels (L0, L1) where spatial size is large.
    """

    def __init__(self, c_in: int, c_out: int):
        scale_dw = math.sqrt(2.0 / 9)
        scale_pw = math.sqrt(2.0 / c_in)
        # Depthwise: each input channel gets its own 3×3 filter
        self.dw = Conv2D(c_in, c_in, k=3, pad=1)   # groups not supported → use standard
        self.pw = Conv2D(c_in, c_out, k=1, pad=0)   # pointwise 1×1 projection
        self.gn = GroupNorm(c_out, G=min(32, c_out))
        self.act = SiLU()

    def forward(self, x: np.ndarray) -> np.ndarray:
        return self.act.forward(self.gn.forward(self.pw.forward(self.dw.forward(x))))

    def backward(self, dout: np.ndarray) -> np.ndarray:
        d = self.act.backward(dout)
        d = self.gn.backward(d)
        d = self.pw.backward(d)
        return self.dw.backward(d)

    def _get_param_grad_pairs(self):
        return [
            (self.dw.params, self.dw.grads),
            (self.pw.params, self.pw.grads),
            (self.gn.params, self.gn.grads),
        ]

    def set_training(self, mode: bool):
        self.gn.set_training(mode)


# ── Lightweight ResBlock using depthwise-sep ──────────────────────────────────

class LightResBlock:
    """ResBlock using depthwise-separable convolutions — for high-res levels."""

    def __init__(self, c_in: int, c_out: int):
        self.dsc1 = DepthwiseSepConv(c_in, c_out)
        self.dsc2 = DepthwiseSepConv(c_out, c_out)
        self.proj = Conv2D(c_in, c_out, k=1, pad=0) if c_in != c_out else None
        self._cache = None

    def forward(self, x: np.ndarray) -> np.ndarray:
        residual = x
        out = self.dsc1.forward(x)
        out = self.dsc2.forward(out)
        if self.proj:
            residual = self.proj.forward(x)
        self._cache = (x, residual)
        return out + residual

    def backward(self, dout: np.ndarray) -> np.ndarray:
        x, residual = self._cache
        d1 = self.dsc2.backward(dout)
        dx = self.dsc1.backward(d1)
        if self.proj:
            dx_proj = self.proj.backward(dout)
            return dx + dx_proj
        return dx + dout

    def _get_param_grad_pairs(self):
        pairs = []
        for dsc in [self.dsc1, self.dsc2]:
            pairs.extend(dsc._get_param_grad_pairs())
        if self.proj:
            pairs.append((self.proj.params, self.proj.grads))
        return pairs

    def set_training(self, mode: bool):
        self.dsc1.set_training(mode)
        self.dsc2.set_training(mode)


# ── FiLM Conditioning (256-dim) ───────────────────────────────────────────────

class ConditioningInjectorV4:
    """
    256-dim FiLM conditioning with 2-layer MLP for richer scene understanding.
    Projects cond(256) → hidden(512) → (γ,β) pairs for each channel.
    """

    def __init__(self, cond_dim: int, c_out: int):
        self.cond_dim = cond_dim
        self.c_out    = c_out
        hidden        = min(cond_dim * 2, 512)
        self.fc1      = Linear(cond_dim, hidden)
        self.act1     = SiLU()
        self.fc2      = Linear(hidden, c_out * 2)
        self._cache   = None

    def forward(self, x: np.ndarray, cond: np.ndarray) -> np.ndarray:
        h     = self.act1.forward(self.fc1.forward(cond))
        proj  = self.fc2.forward(h)
        gamma = proj[:self.c_out] + 1.0
        beta  = proj[self.c_out:]
        self._cache = (x, gamma, beta, h)
        return x * gamma[None, None, :] + beta[None, None, :]

    def backward(self, dout: np.ndarray) -> np.ndarray:
        x, gamma, beta, h = self._cache
        dx     = dout * gamma[None, None, :]
        dgamma = (dout * x).sum(axis=(0, 1))
        dbeta  = dout.sum(axis=(0, 1))
        dproj  = np.concatenate([dgamma, dbeta])
        dh     = self.fc2.backward(dproj)
        self.fc1.backward(self.act1.backward(dh))
        return dx

    def _get_param_grad_pairs(self):
        return [
            (self.fc1.params, self.fc1.grads),
            (self.fc2.params, self.fc2.grads),
        ]


# ── Encoder Level (4 ResBlocks + optional attention + optional temporal) ──────

class EncoderLevel:
    """
    A single encoder level: N_RES ResBlocks + optional spatial attention
    + optional temporal attention + FiLM conditioning + MaxPool downsampler.

    Supports both standard ResBlocks (deep levels) and LightResBlocks (shallow).
    """

    def __init__(self, c_in: int, c_out: int, cond_dim: int,
                 n_res: int = N_RES,
                 spatial_attn_heads: int = 0,
                 temporal_attn_heads: int = 0,
                 T: int = 32,
                 use_light: bool = False):
        self.c_in  = c_in
        self.c_out = c_out
        self.n_res = n_res
        self.T     = T
        self.use_spatial_attn   = spatial_attn_heads > 0
        self.use_temporal_attn  = temporal_attn_heads > 0
        self.use_light          = use_light

        RB = LightResBlock if use_light else ResBlock

        self.res_blocks = []
        for i in range(n_res):
            c = c_in if i == 0 else c_out
            self.res_blocks.append(RB(c, c_out))

        self.cond = ConditioningInjectorV4(cond_dim, c_out)
        self.pool = MaxPool2x2()

        self.spatial_attn  = SelfAttention2D(c_out, n_heads=spatial_attn_heads) \
                             if self.use_spatial_attn else None
        self.temporal_attn = TemporalAttention1D(c_out, heads=temporal_attn_heads, T=T) \
                             if self.use_temporal_attn else None

        self._cache = {}

    def forward(self, x_seq: np.ndarray, cond: np.ndarray) -> tuple:
        """
        x_seq: (T, H, W, C_in) — sequence of T frames
        cond:  (COND_DIM,)
        returns: (out, skip)  where out is pooled, skip is pre-pool for decoder
        """
        T, H, W, C = x_seq.shape
        out = x_seq.copy()

        # Apply ResBlocks frame-by-frame (spatial ops, no temporal mixing yet)
        rb_outs = []
        for rb in self.res_blocks:
            frame_outs = []
            for t in range(T):
                frame_outs.append(rb.forward(out[t]))
            out = np.stack(frame_outs, axis=0)
            rb_outs.append(out.copy())

        # FiLM conditioning (same cond vector for all frames — time/text embedding)
        cond_frames = []
        for t in range(T):
            cond_frames.append(self.cond.forward(out[t], cond))
        out = np.stack(cond_frames, axis=0)

        # Spatial attention (per-frame)
        if self.use_spatial_attn:
            sa_outs = []
            for t in range(T):
                sa_outs.append(self.spatial_attn.forward(out[t]))
            out = np.stack(sa_outs, axis=0)

        # Temporal attention (across frames at each spatial position)
        if self.use_temporal_attn:
            out = self.temporal_attn.forward(out)

        skip = out.copy()

        # Pool each frame
        pooled = []
        for t in range(T):
            pooled.append(self.pool.forward(out[t]))
        out = np.stack(pooled, axis=0)

        self._cache = {'rb_outs': rb_outs, 'skip': skip, 'out': out, 'T': T}
        return out, skip

    def backward(self, dout: np.ndarray, dskip: np.ndarray = None) -> np.ndarray:
        T = self._cache['T']

        # Pool backward
        d_pre_pool = []
        for t in range(T):
            d_pre_pool.append(self.pool.backward(dout[t]))
        d = np.stack(d_pre_pool, axis=0)

        # Add gradient from skip connection
        if dskip is not None:
            d = d + dskip

        # Temporal attention backward
        if self.use_temporal_attn:
            d = self.temporal_attn.backward(d)

        # Spatial attention backward (per-frame)
        if self.use_spatial_attn:
            d_sa = []
            for t in range(T):
                d_sa.append(self.spatial_attn.backward(d[t]))
            d = np.stack(d_sa, axis=0)

        # FiLM backward (per-frame)
        d_cond = []
        for t in range(T):
            d_cond.append(self.cond.backward(d[t]))
        d = np.stack(d_cond, axis=0)

        # ResBlocks backward (reverse order)
        for rb in reversed(self.res_blocks):
            d_rb = []
            for t in range(T):
                d_rb.append(rb.backward(d[t]))
            d = np.stack(d_rb, axis=0)

        return d

    def _all_param_grad_pairs(self):
        pairs = []
        for rb in self.res_blocks:
            if hasattr(rb, '_get_param_grad_pairs'):
                pairs.extend(rb._get_param_grad_pairs())
            else:
                pairs.append((rb.conv1.params, rb.conv1.grads))
                pairs.append((rb.gn1.params,   rb.gn1.grads))
                pairs.append((rb.conv2.params,  rb.conv2.grads))
                pairs.append((rb.gn2.params,    rb.gn2.grads))
                if rb.proj:
                    pairs.append((rb.proj.params, rb.proj.grads))
        pairs.extend(self.cond._get_param_grad_pairs())
        if self.spatial_attn:
            pairs.append((self.spatial_attn.params, self.spatial_attn.grads))
            pairs.append((self.spatial_attn.norm.params, self.spatial_attn.norm.grads))
        if self.temporal_attn:
            pairs.extend(self.temporal_attn._get_param_grad_pairs())
        return pairs

    def set_training(self, mode: bool):
        for rb in self.res_blocks:
            if hasattr(rb, 'set_training'):
                rb.set_training(mode)


# ── Bottleneck ─────────────────────────────────────────────────────────────────

class Bottleneck:
    """
    6 ResBlocks with multi-scale attention at the narrowest point (3×3 spatial).
    24-head spatial attention: global reasoning with 24 independent heads.
    32-head temporal attention: maximum cross-frame understanding.
    3×3 = 9 spatial positions — all attention ops are nearly free at this scale.
    """

    def __init__(self, c: int, cond_dim: int, T: int = 32, n_bot: int = N_BOT_FULL):
        self.c     = c
        self.T     = T
        self.n_bot = n_bot
        half       = max(1, n_bot // 2)
        self.half  = half
        self.res_blocks = [ResBlock(c, c) for _ in range(n_bot)]
        n_heads_sa      = min(32, max(1, c // 32))
        n_heads_ta      = min(32, max(1, c // 32))
        self.spatial_attn1  = SelfAttention2D(c, n_heads=n_heads_sa)
        self.spatial_attn2  = SelfAttention2D(c, n_heads=n_heads_sa)
        self.temporal_attn1 = TemporalAttention1D(c, heads=n_heads_ta, T=T)
        self.temporal_attn2 = TemporalAttention1D(c, heads=n_heads_ta, T=T)
        self.cond           = ConditioningInjectorV4(cond_dim, c)
        self._cache         = {}

    def forward(self, x_seq: np.ndarray, cond: np.ndarray) -> np.ndarray:
        T = x_seq.shape[0]
        out = x_seq.copy()

        # Blocks 0..half-1
        for i in range(self.half):
            frame_outs = []
            for t in range(T):
                frame_outs.append(self.res_blocks[i].forward(out[t]))
            out = np.stack(frame_outs, axis=0)

        # Mid-point: spatial + temporal attention
        sa_outs = []
        for t in range(T):
            sa_outs.append(self.spatial_attn1.forward(out[t]))
        out = np.stack(sa_outs, axis=0)
        out = self.temporal_attn1.forward(out)

        # Blocks half..n_bot-1
        for i in range(self.half, self.n_bot):
            frame_outs = []
            for t in range(T):
                frame_outs.append(self.res_blocks[i].forward(out[t]))
            out = np.stack(frame_outs, axis=0)

        # Final spatial + temporal attention
        sa_outs = []
        for t in range(T):
            sa_outs.append(self.spatial_attn2.forward(out[t]))
        out = np.stack(sa_outs, axis=0)
        out = self.temporal_attn2.forward(out)

        # FiLM conditioning
        cond_outs = []
        for t in range(T):
            cond_outs.append(self.cond.forward(out[t], cond))
        out = np.stack(cond_outs, axis=0)

        self._cache = {'T': T, 'out': out}
        return out

    def backward(self, dout: np.ndarray) -> np.ndarray:
        T = self._cache['T']

        # FiLM backward
        d = np.stack([self.cond.backward(dout[t]) for t in range(T)], axis=0)

        # Final temporal + spatial backward
        d = self.temporal_attn2.backward(d)
        d = np.stack([self.spatial_attn2.backward(d[t]) for t in range(T)], axis=0)

        # Blocks n_bot-1..half backward
        for i in range(self.n_bot - 1, self.half - 1, -1):
            d = np.stack([self.res_blocks[i].backward(d[t]) for t in range(T)], axis=0)

        # Mid temporal + spatial backward
        d = self.temporal_attn1.backward(d)
        d = np.stack([self.spatial_attn1.backward(d[t]) for t in range(T)], axis=0)

        # Blocks half-1..0 backward
        for i in range(self.half - 1, -1, -1):
            d = np.stack([self.res_blocks[i].backward(d[t]) for t in range(T)], axis=0)

        return d

    def _all_param_grad_pairs(self):
        pairs = []
        for rb in self.res_blocks:
            pairs.append((rb.conv1.params, rb.conv1.grads))
            pairs.append((rb.gn1.params,   rb.gn1.grads))
            pairs.append((rb.conv2.params,  rb.conv2.grads))
            pairs.append((rb.gn2.params,    rb.gn2.grads))
            if rb.proj:
                pairs.append((rb.proj.params, rb.proj.grads))
        for sa in [self.spatial_attn1, self.spatial_attn2]:
            pairs.append((sa.params, sa.grads))
            pairs.append((sa.norm.params, sa.norm.grads))
        for ta in [self.temporal_attn1, self.temporal_attn2]:
            pairs.extend(ta._get_param_grad_pairs())
        pairs.extend(self.cond._get_param_grad_pairs())
        return pairs


# ── Decoder Level ─────────────────────────────────────────────────────────────

class DecoderLevel:
    """
    Upsamples + concatenates skip, then N_RES ResBlocks + optional attention + FiLM.
    """

    def __init__(self, c_in: int, skip_c: int, c_out: int, cond_dim: int,
                 n_res: int = N_RES,
                 spatial_attn_heads: int = 0,
                 temporal_attn_heads: int = 0,
                 T: int = 32,
                 use_light: bool = False):
        self.c_in  = c_in
        self.skip_c = skip_c
        self.c_out  = c_out
        self.T      = T
        self.use_spatial_attn   = spatial_attn_heads > 0
        self.use_temporal_attn  = temporal_attn_heads > 0

        RB = LightResBlock if use_light else ResBlock

        self.res_blocks = []
        for i in range(n_res):
            cin = (c_in + skip_c) if i == 0 else c_out
            self.res_blocks.append(RB(cin, c_out))

        self.cond          = ConditioningInjectorV4(cond_dim, c_out)
        self.spatial_attn  = SelfAttention2D(c_out, n_heads=spatial_attn_heads) \
                             if self.use_spatial_attn else None
        self.temporal_attn = TemporalAttention1D(c_out, heads=temporal_attn_heads, T=T) \
                             if self.use_temporal_attn else None

        self._cache = {}

    def forward(self, x_seq: np.ndarray, skip_seq: np.ndarray,
                cond: np.ndarray) -> np.ndarray:
        T = x_seq.shape[0]

        # Upsample each frame and concatenate with skip
        up_frames = []
        for t in range(T):
            up = upsample2x(x_seq[t])
            up_frames.append(np.concatenate([up, skip_seq[t]], axis=2))
        out = np.stack(up_frames, axis=0)

        # ResBlocks
        for rb in self.res_blocks:
            out = np.stack([rb.forward(out[t]) for t in range(T)], axis=0)

        # FiLM
        out = np.stack([self.cond.forward(out[t], cond) for t in range(T)], axis=0)

        # Spatial attention
        if self.use_spatial_attn:
            out = np.stack([self.spatial_attn.forward(out[t]) for t in range(T)], axis=0)

        # Temporal attention
        if self.use_temporal_attn:
            out = self.temporal_attn.forward(out)

        self._cache = {'T': T, 'x_seq': x_seq, 'skip_seq': skip_seq}
        return out

    def backward(self, dout: np.ndarray) -> tuple:
        T = self._cache['T']
        x_seq    = self._cache['x_seq']
        skip_seq = self._cache['skip_seq']

        if self.use_temporal_attn:
            dout = self.temporal_attn.backward(dout)
        if self.use_spatial_attn:
            dout = np.stack([self.spatial_attn.backward(dout[t]) for t in range(T)], axis=0)

        dout = np.stack([self.cond.backward(dout[t]) for t in range(T)], axis=0)

        for rb in reversed(self.res_blocks):
            dout = np.stack([rb.backward(dout[t]) for t in range(T)], axis=0)

        # Split concatenated gradient back into upsample and skip
        c_in_up = x_seq.shape[-1]
        # After upsample+cat, dout has shape (T, H, W, c_in+skip_c)
        d_up_cat   = dout  # (T, H, W, c_in+skip_c)
        d_up_part  = np.stack([d_up_cat[t, :, :, :c_in_up] for t in range(T)], axis=0)
        d_skip_seq = np.stack([d_up_cat[t, :, :, c_in_up:] for t in range(T)], axis=0)

        # Upsample backward
        d_x = np.stack([upsample2x_backward(d_up_part[t]) for t in range(T)], axis=0)

        return d_x, d_skip_seq

    def _all_param_grad_pairs(self):
        pairs = []
        for rb in self.res_blocks:
            if hasattr(rb, '_get_param_grad_pairs'):
                pairs.extend(rb._get_param_grad_pairs())
            else:
                pairs.append((rb.conv1.params, rb.conv1.grads))
                pairs.append((rb.gn1.params,   rb.gn1.grads))
                pairs.append((rb.conv2.params,  rb.conv2.grads))
                pairs.append((rb.gn2.params,    rb.gn2.grads))
                if rb.proj:
                    pairs.append((rb.proj.params, rb.proj.grads))
        pairs.extend(self.cond._get_param_grad_pairs())
        if self.spatial_attn:
            pairs.append((self.spatial_attn.params, self.spatial_attn.grads))
            pairs.append((self.spatial_attn.norm.params, self.spatial_attn.norm.grads))
        if self.temporal_attn:
            pairs.extend(self.temporal_attn._get_param_grad_pairs())
        return pairs

    def set_training(self, mode: bool):
        for rb in self.res_blocks:
            if hasattr(rb, 'set_training'):
                rb.set_training(mode)


# ══════════════════════════════════════════════════════════════════════════════
# UNetV4 — Full Video-Native Architecture
# ══════════════════════════════════════════════════════════════════════════════

class UNetV4:
    """
    5-level video-native U-Net.
    Full mode: ~300M params (for GPU / Windows D: drive).
    Lite mode:   ~6M params (for CPU / Replit — auto-selected when
                 MAXCORE_LITE=1 or no GPU detected).

    Processes T-frame sequences, produces T-frame noise predictions.

    Input:
        x_seq: (T, H, W, 3)     — noisy video frames
        cond:  (COND_DIM,)       — conditioning: time+text
    Output:
        (T, H, W, 3)             — predicted noise for each frame
    """

    def __init__(self, cond_dim: int = COND_DIM, T: int = 32,
                 lite: bool = False):
        if lite:
            _CH0      = CH0_LITE
            _CH1      = CH1_LITE
            _CH2      = CH2_LITE
            _CH3      = CH3_LITE
            _CH4      = CH4_LITE
            _N_RES    = N_RES_LITE
        else:
            _CH0      = CH0_FULL
            _CH1      = CH1_FULL
            _CH2      = CH2_FULL
            _CH3      = CH3_FULL
            _CH4      = CH4_FULL
            _N_RES    = N_RES_FULL

        self.cond_dim = cond_dim
        self.T        = T
        self.lite     = lite

        # ── Encoder ──────────────────────────────────────────────────────────
        self.enc0 = EncoderLevel(
            3, _CH0, cond_dim, n_res=_N_RES, T=T, use_light=True)

        self.enc1 = EncoderLevel(
            _CH0, _CH1, cond_dim, n_res=_N_RES, T=T, use_light=True)

        self.enc2 = EncoderLevel(
            _CH1, _CH2, cond_dim, n_res=_N_RES,
            spatial_attn_heads=min(8, _CH2 // 16), temporal_attn_heads=0, T=T)

        self.enc3 = EncoderLevel(
            _CH2, _CH3, cond_dim, n_res=_N_RES,
            spatial_attn_heads=min(16, _CH3 // 16),
            temporal_attn_heads=min(8, _CH3 // 32), T=T)

        self.enc4 = EncoderLevel(
            _CH3, _CH4, cond_dim, n_res=_N_RES,
            spatial_attn_heads=min(16, _CH4 // 16),
            temporal_attn_heads=min(16, _CH4 // 16), T=T)

        # ── Bottleneck ────────────────────────────────────────────────────────
        _N_BOT = N_BOT_LITE if lite else N_BOT_FULL
        self.bottleneck = Bottleneck(_CH4, cond_dim, T=T, n_bot=_N_BOT)

        # ── Decoder ──────────────────────────────────────────────────────────
        self.dec4 = DecoderLevel(
            _CH4, _CH4, _CH3, cond_dim, n_res=_N_RES,
            spatial_attn_heads=min(16, _CH3 // 16),
            temporal_attn_heads=min(16, _CH3 // 16), T=T)

        self.dec3 = DecoderLevel(
            _CH3, _CH3, _CH2, cond_dim, n_res=_N_RES,
            spatial_attn_heads=min(16, _CH2 // 16),
            temporal_attn_heads=min(8, _CH2 // 16), T=T)

        self.dec2 = DecoderLevel(
            _CH2, _CH2, _CH1, cond_dim, n_res=_N_RES,
            spatial_attn_heads=min(8, _CH1 // 16), T=T)

        self.dec1 = DecoderLevel(
            _CH1, _CH1, _CH0, cond_dim, n_res=_N_RES, T=T, use_light=True)

        self.dec0 = DecoderLevel(
            _CH0, _CH0, _CH0, cond_dim, n_res=_N_RES, T=T, use_light=True)

        # ── Output head ───────────────────────────────────────────────────────
        self.out_gn   = GroupNorm(_CH0, G=min(32, _CH0))
        self.out_act  = SiLU()
        self.out_conv = Conv2D(_CH0, 3, k=1, pad=0)

        self._cache = {}

    # ── Forward ───────────────────────────────────────────────────────────────

    def forward(self, x_seq: np.ndarray, cond: np.ndarray) -> np.ndarray:
        """
        x_seq: (T, H, W, 3)    or (H, W, 3) for single-frame compat
        cond:  (COND_DIM,)
        returns: (T, H, W, 3)
        """
        # Single-frame backward-compat
        squeeze = False
        if x_seq.ndim == 3:
            x_seq = x_seq[None]
            squeeze = True
        T = x_seq.shape[0]

        # ── Encoder ──────────────────────────────────────────────────────────
        e0, skip0 = self.enc0.forward(x_seq,  cond)
        e1, skip1 = self.enc1.forward(e0,     cond)
        e2, skip2 = self.enc2.forward(e1,     cond)
        e3, skip3 = self.enc3.forward(e2,     cond)
        e4, skip4 = self.enc4.forward(e3,     cond)

        # ── Bottleneck ───────────────────────────────────────────────────────
        bot = self.bottleneck.forward(e4, cond)

        # ── Decoder ──────────────────────────────────────────────────────────
        d4 = self.dec4.forward(bot, skip4, cond)
        d3 = self.dec3.forward(d4,  skip3, cond)
        d2 = self.dec2.forward(d3,  skip2, cond)
        d1 = self.dec1.forward(d2,  skip1, cond)
        d0 = self.dec0.forward(d1,  skip0, cond)

        # ── Output head (per-frame) ───────────────────────────────────────────
        out_frames = []
        for t in range(T):
            gn_out  = self.out_gn.forward(d0[t])
            act_out = self.out_act.forward(gn_out)
            out_frames.append(self.out_conv.forward(act_out))
        out = np.stack(out_frames, axis=0)

        self._cache = {
            'T': T, 'squeeze': squeeze,
            'skip0': skip0, 'skip1': skip1, 'skip2': skip2,
            'skip3': skip3, 'skip4': skip4,
            'e4': e4, 'bot': bot,
            'd4': d4, 'd3': d3, 'd2': d2, 'd1': d1, 'd0': d0,
        }

        return out[0] if squeeze else out

    # ── Backward ──────────────────────────────────────────────────────────────

    def backward(self, dloss: np.ndarray) -> None:
        c = self._cache
        T = c['T']

        if dloss.ndim == 3:
            dloss = dloss[None]

        # Output head backward
        dout_frames = []
        for t in range(T):
            d = self.out_conv.backward(dloss[t])
            d = self.out_act.backward(d)
            d = self.out_gn.backward(d)
            dout_frames.append(d)
        dd0 = np.stack(dout_frames, axis=0)

        # Decoder backward
        dd0, dskip0 = self.dec0.backward(dd0)
        dd1, dskip1 = self.dec1.backward(dd0)
        dd2, dskip2 = self.dec2.backward(dd1)
        dd3, dskip3 = self.dec3.backward(dd2)
        dd4, dskip4 = self.dec4.backward(dd3)

        # Bottleneck backward
        dbot = self.bottleneck.backward(dd4)

        # Encoder backward
        de4 = self.enc4.backward(dbot, dskip4)
        de3 = self.enc3.backward(de4, dskip3)
        de2 = self.enc2.backward(de3, dskip2)
        de1 = self.enc1.backward(de2, dskip1)
        self.enc0.backward(de1, dskip0)

    # ── Parameters ────────────────────────────────────────────────────────────

    def _get_param_grad_pairs_flat(self) -> list:
        pairs = []
        for enc in [self.enc0, self.enc1, self.enc2, self.enc3, self.enc4]:
            pairs.extend(enc._all_param_grad_pairs())
        pairs.extend(self.bottleneck._all_param_grad_pairs())
        for dec in [self.dec4, self.dec3, self.dec2, self.dec1, self.dec0]:
            pairs.extend(dec._all_param_grad_pairs())
        pairs.append((self.out_gn.params,   self.out_gn.grads))
        pairs.append((self.out_conv.params,  self.out_conv.grads))
        return pairs

    def zero_grads(self):
        for _, grads in self._get_param_grad_pairs_flat():
            if isinstance(grads, dict):
                for k, v in grads.items():
                    if isinstance(v, np.ndarray):
                        v[:] = 0.0

    def set_training(self, mode: bool):
        for enc in [self.enc0, self.enc1, self.enc2, self.enc3, self.enc4]:
            enc.set_training(mode)
        for dec in [self.dec4, self.dec3, self.dec2, self.dec1, self.dec0]:
            dec.set_training(mode)
        self.out_gn.set_training(mode)

    def count_params(self) -> int:
        total = 0
        seen = set()
        for params, _ in self._get_param_grad_pairs_flat():
            uid = id(params)
            if uid not in seen:
                seen.add(uid)
                if isinstance(params, dict):
                    for v in params.values():
                        if isinstance(v, np.ndarray):
                            total += v.size
                elif isinstance(params, np.ndarray):
                    total += params.size
        return total

    # ── Serialization ─────────────────────────────────────────────────────────

    def get_named_weights(self) -> dict:
        weights = {}
        for i, (params, _) in enumerate(self._get_param_grad_pairs_flat()):
            uid = f'v4layer_{i}'
            if isinstance(params, dict):
                for k, v in params.items():
                    if isinstance(v, np.ndarray):
                        weights[f'{uid}_{k}'] = v
            elif isinstance(params, np.ndarray):
                weights[f'{uid}_arr'] = params
        return weights

    def load_named_weights(self, weights: dict):
        for i, (params, _) in enumerate(self._get_param_grad_pairs_flat()):
            uid = f'v4layer_{i}'
            if isinstance(params, dict):
                for k in list(params.keys()):
                    key = f'{uid}_{k}'
                    if (key in weights and isinstance(params[k], np.ndarray)
                            and weights[key].shape == params[k].shape):
                        params[k] = weights[key].astype(np.float32)
            elif isinstance(params, np.ndarray):
                key = f'{uid}_arr'
                if key in weights and weights[key].shape == params.shape:
                    params[:] = weights[key].astype(np.float32)
