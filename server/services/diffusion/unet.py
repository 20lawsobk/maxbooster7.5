"""
U-Net Denoiser v2 — upgraded for maximum quality.

Architecture changes over v1:
  - Channels: [16,32,48] → [32,64,96]   (5× more parameters)
  - ConvBlocks → ResBlocks               (residual connections at every level)
  - GroupNorm  instead of BatchNorm      (more stable, identical train/inference)
  - SelfAttention2D at bottleneck        (global structure reasoning — the key
                                          upgrade separating modern diffusion
                                          models from simple CNNs)
  - Conditioning injected at ALL levels  (time+text modulate every scale)
  - 2 ResBlocks per level                (deeper effective depth)
  - Pre-norm attention                   (more training stable)

Total parameters: ~350K (vs ~40K in v1)
Training resolution: 32×32 (same, keeps CPU time manageable)
"""

import numpy as np
from .layers import (Conv2D, ResBlock, SelfAttention2D, GroupNorm,
                     Linear, SiLU, MaxPool2x2, upsample2x, upsample2x_backward)

# Channel sizes
CH0 = 32
CH1 = 64
CH2 = 96
COND_DIM = 64   # concatenated time(32) + text(32)


class ConditioningInjector:
    """
    Projects conditioning vector [cond_dim] → [c_out] and adds to feature map.
    Also learns a scale (γ) and shift (β) for feature-wise linear modulation
    (FiLM conditioning — used in DALL-E 2, Imagen, etc.)
    """

    def __init__(self, cond_dim: int, c_out: int):
        self.cond_dim = cond_dim
        self.c_out    = c_out
        # Project to 2×c_out: first half = gamma (scale), second = beta (shift)
        self.linear   = Linear(cond_dim, c_out * 2)
        self.act      = SiLU()
        self._cache   = None

    def forward(self, x: np.ndarray, cond: np.ndarray) -> np.ndarray:
        """x: [H,W,C]  cond: [cond_dim]  → [H,W,C]"""
        proj = self.act.forward(self.linear.forward(cond))   # [c_out*2]
        gamma = proj[:self.c_out] + 1.0                      # scale (init near 1)
        beta  = proj[self.c_out:]                             # shift (init near 0)
        self._cache = (x, gamma, beta, proj)
        return x * gamma[None, None, :] + beta[None, None, :]

    def backward(self, dout: np.ndarray) -> tuple:
        x, gamma, beta, proj = self._cache
        dgamma = (dout * x).sum(axis=(0, 1))   # [c_out]
        dbeta  = dout.sum(axis=(0, 1))          # [c_out]
        dx     = dout * gamma[None, None, :]

        dproj = np.concatenate([dgamma, dbeta])
        dproj_act = self.act.backward(dproj)
        self.linear.backward(dproj_act)
        return dx  # grad w.r.t. x; grad w.r.t. cond accumulates in linear.grads

    def _get_param_grad_pairs(self):
        return [(self.linear.params, self.linear.grads)]


class UNet:
    """
    Full U-Net denoiser with self-attention, residual blocks, and FiLM conditioning.
    """

    def __init__(self, cond_dim: int = COND_DIM):
        self.cond_dim = cond_dim

        # ── Encoder ──────────────────────────────────────────────────────
        self.enc0a = ResBlock(3,    CH0)
        self.enc0b = ResBlock(CH0,  CH0)
        self.cond0 = ConditioningInjector(cond_dim, CH0)
        self.pool0 = MaxPool2x2()

        self.enc1a = ResBlock(CH0,  CH1)
        self.enc1b = ResBlock(CH1,  CH1)
        self.cond1 = ConditioningInjector(cond_dim, CH1)
        self.pool1 = MaxPool2x2()

        self.enc2a = ResBlock(CH1,  CH2)
        self.enc2b = ResBlock(CH2,  CH2)
        self.cond2 = ConditioningInjector(cond_dim, CH2)

        # ── Bottleneck with Self-Attention ────────────────────────────────
        # At 32×32 input, bottleneck is 8×8 — small enough for efficient attention
        self.bot_res1  = ResBlock(CH2, CH2)
        self.attention = SelfAttention2D(CH2, n_heads=4)   # THE key upgrade
        self.bot_res2  = ResBlock(CH2, CH2)
        self.bot_cond  = ConditioningInjector(cond_dim, CH2)

        # ── Decoder ───────────────────────────────────────────────────────
        self.dec1a = ResBlock(CH2 + CH1, CH1)
        self.dec1b = ResBlock(CH1,       CH1)
        self.cond_d1 = ConditioningInjector(cond_dim, CH1)

        self.dec0a = ResBlock(CH1 + CH0, CH0)
        self.dec0b = ResBlock(CH0,       CH0)
        self.cond_d0 = ConditioningInjector(cond_dim, CH0)

        # ── Output ────────────────────────────────────────────────────────
        self.out_gn   = GroupNorm(CH0, G=min(8, CH0))
        self.out_act  = SiLU()
        self.out_conv = Conv2D(CH0, 3, k=1, pad=0)

        self._cache = {}

    # ── Parameters ────────────────────────────────────────────────────────

    def _get_param_grad_pairs_flat(self) -> list:
        pairs = []

        def add_resblock(r: ResBlock):
            pairs.append((r.conv1.params, r.conv1.grads))
            pairs.append((r.gn1.params,   r.gn1.grads))
            pairs.append((r.conv2.params, r.conv2.grads))
            pairs.append((r.gn2.params,   r.gn2.grads))
            if r.proj:
                pairs.append((r.proj.params, r.proj.grads))

        def add_cond(c: ConditioningInjector):
            pairs.append((c.linear.params, c.linear.grads))

        def add_attn(a: SelfAttention2D):
            pairs.append((a.params, a.grads))
            pairs.append((a.norm.params, a.norm.grads))

        for rb in [self.enc0a, self.enc0b, self.enc1a, self.enc1b,
                   self.enc2a, self.enc2b, self.bot_res1, self.bot_res2,
                   self.dec1a, self.dec1b, self.dec0a, self.dec0b]:
            add_resblock(rb)

        for ci in [self.cond0, self.cond1, self.cond2, self.bot_cond,
                   self.cond_d1, self.cond_d0]:
            add_cond(ci)

        add_attn(self.attention)

        pairs.append((self.out_gn.params,   self.out_gn.grads))
        pairs.append((self.out_conv.params,  self.out_conv.grads))

        return pairs

    def zero_grads(self):
        for params, grads in self._get_param_grad_pairs_flat():
            for k in grads:
                grads[k][:] = 0.0

    def set_training(self, mode: bool):
        for rb in [self.enc0a, self.enc0b, self.enc1a, self.enc1b,
                   self.enc2a, self.enc2b, self.bot_res1, self.bot_res2,
                   self.dec1a, self.dec1b, self.dec0a, self.dec0b]:
            rb.set_training(mode)
        self.out_gn.set_training(mode)

    # ── Forward ───────────────────────────────────────────────────────────

    def forward(self, x: np.ndarray, cond: np.ndarray) -> np.ndarray:
        """
        x:    [H, W, 3]   noisy image in [-1, 1]
        cond: [64]         time(32) + text(32) conditioning
        returns: [H, W, 3] predicted noise
        """
        c = self._cache

        # Encoder L0: [H, W, 3] → [H, W, CH0]
        e0a = self.enc0a.forward(x)
        e0b = self.enc0b.forward(e0a)
        e0b = self.cond0.forward(e0b, cond)          # FiLM conditioning
        p0  = self.pool0.forward(e0b)                # [H/2, W/2, CH0]

        # Encoder L1: [H/2, W/2, CH0] → [H/2, W/2, CH1]
        e1a = self.enc1a.forward(p0)
        e1b = self.enc1b.forward(e1a)
        e1b = self.cond1.forward(e1b, cond)
        p1  = self.pool1.forward(e1b)                # [H/4, W/4, CH1]

        # Encoder L2: [H/4, W/4, CH1] → [H/4, W/4, CH2]
        e2a = self.enc2a.forward(p1)
        e2b = self.enc2b.forward(e2a)
        e2b = self.cond2.forward(e2b, cond)          # [H/4, W/4, CH2]

        # Bottleneck with Self-Attention
        bot1 = self.bot_res1.forward(e2b)            # [H/4, W/4, CH2]
        attn = self.attention.forward(bot1)          # [H/4, W/4, CH2] — global attention
        bot2 = self.bot_res2.forward(attn)
        bot2 = self.bot_cond.forward(bot2, cond)

        # Decoder L1: upsample + skip from enc1b
        up1  = upsample2x(bot2)                      # [H/2, W/2, CH2]
        cat1 = np.concatenate([up1, e1b], axis=2)    # [H/2, W/2, CH2+CH1]
        d1a  = self.dec1a.forward(cat1)
        d1b  = self.dec1b.forward(d1a)
        d1b  = self.cond_d1.forward(d1b, cond)       # [H/2, W/2, CH1]

        # Decoder L0: upsample + skip from enc0b
        up0  = upsample2x(d1b)                       # [H, W, CH1]
        cat0 = np.concatenate([up0, e0b], axis=2)    # [H, W, CH1+CH0]
        d0a  = self.dec0a.forward(cat0)
        d0b  = self.dec0b.forward(d0a)
        d0b  = self.cond_d0.forward(d0b, cond)       # [H, W, CH0]

        # Output head
        out_norm = self.out_act.forward(self.out_gn.forward(d0b))
        out      = self.out_conv.forward(out_norm)   # [H, W, 3]

        c.update({
            'e0b': e0b, 'e1b': e1b, 'e2b': e2b,
            'bot1': bot1, 'attn': attn, 'bot2': bot2,
            'up1': up1, 'cat1': cat1, 'd1b': d1b,
            'up0': up0, 'cat0': cat0, 'd0b': d0b,
            'out_norm': out_norm,
        })
        return out

    # ── Backward ──────────────────────────────────────────────────────────

    def backward(self, dloss: np.ndarray) -> None:
        c = self._cache

        # Output head
        dout_norm = self.out_conv.backward(dloss)
        dd0b_gn   = self.out_act.backward(dout_norm)
        dd0b      = self.out_gn.backward(dd0b_gn)

        # Decoder L0 conditioning
        dd0b = self.cond_d0.backward(dd0b)

        # Decoder L0 ResBlocks
        dd0a  = self.dec0b.backward(dd0b)
        dcat0 = self.dec0a.backward(dd0a)

        # Split concat: first CH1 = upsample grad, last CH0 = skip grad
        dup0   = dcat0[:, :, :CH1]
        de0b_d = dcat0[:, :, CH1:]

        # Upsample L0 backward
        dd1b = upsample2x_backward(dup0)

        # Decoder L1 conditioning
        dd1b = self.cond_d1.backward(dd1b)

        # Decoder L1 ResBlocks
        dd1a  = self.dec1b.backward(dd1b)
        dcat1 = self.dec1a.backward(dd1a)

        # Split concat
        dup1   = dcat1[:, :, :CH2]
        de1b_d = dcat1[:, :, CH2:]

        # Upsample L1 backward
        dbot2 = upsample2x_backward(dup1)

        # Bottleneck
        dbot2  = self.bot_cond.backward(dbot2)
        dattn  = self.bot_res2.backward(dbot2)
        dbot1  = self.attention.backward(dattn)
        de2b   = self.bot_res1.backward(dbot1)

        # Encoder L2 conditioning
        de2b   = self.cond2.backward(de2b)

        # Encoder L2
        de2a   = self.enc2b.backward(de2b)
        dp1    = self.enc2a.backward(de2a)

        # Pool1 backward + skip grad
        de1b_p = self.pool1.backward(dp1)
        de1b   = de1b_p + de1b_d

        # Encoder L1 conditioning
        de1b   = self.cond1.backward(de1b)

        # Encoder L1
        de1a   = self.enc1b.backward(de1b)
        dp0    = self.enc1a.backward(de1a)

        # Pool0 backward + skip grad
        de0b_p = self.pool0.backward(dp0)
        de0b   = de0b_p + de0b_d

        # Encoder L0 conditioning
        de0b   = self.cond0.backward(de0b)

        # Encoder L0
        de0a   = self.enc0b.backward(de0b)
        self.enc0a.backward(de0a)

    # ── Weight serialization ───────────────────────────────────────────────

    def get_weights(self) -> dict:
        weights = {}
        for params, _ in self._get_param_grad_pairs_flat():
            uid = str(id(params))
            for k, v in params.items():
                weights[f'{uid}_{k}'] = v.copy()
        return weights

    def load_weights(self, weights: dict):
        for params, _ in self._get_param_grad_pairs_flat():
            uid = str(id(params))
            for k in params:
                key = f'{uid}_{k}'
                if key in weights:
                    params[k] = weights[key].astype(np.float32)

    def get_named_weights(self) -> dict:
        """Named weight serialization for readable .npz files."""
        weights = {}
        blocks = {
            'enc0a': self.enc0a, 'enc0b': self.enc0b,
            'enc1a': self.enc1a, 'enc1b': self.enc1b,
            'enc2a': self.enc2a, 'enc2b': self.enc2b,
            'bot_res1': self.bot_res1, 'bot_res2': self.bot_res2,
            'dec1a': self.dec1a, 'dec1b': self.dec1b,
            'dec0a': self.dec0a, 'dec0b': self.dec0b,
        }
        conds = {
            'cond0': self.cond0, 'cond1': self.cond1, 'cond2': self.cond2,
            'bot_cond': self.bot_cond, 'cond_d1': self.cond_d1, 'cond_d0': self.cond_d0,
        }
        for name, rb in blocks.items():
            for k, v in rb.conv1.params.items(): weights[f'{name}_c1_{k}'] = v
            for k, v in rb.gn1.params.items():   weights[f'{name}_g1_{k}'] = v
            for k, v in rb.conv2.params.items(): weights[f'{name}_c2_{k}'] = v
            for k, v in rb.gn2.params.items():   weights[f'{name}_g2_{k}'] = v
            if rb.proj:
                for k, v in rb.proj.params.items(): weights[f'{name}_pr_{k}'] = v

        for name, ci in conds.items():
            for k, v in ci.linear.params.items(): weights[f'{name}_lin_{k}'] = v

        for k, v in self.attention.params.items(): weights[f'attn_{k}'] = v
        for k, v in self.attention.norm.params.items(): weights[f'attn_norm_{k}'] = v
        for k, v in self.out_gn.params.items():   weights[f'out_gn_{k}'] = v
        for k, v in self.out_conv.params.items(): weights[f'out_conv_{k}'] = v
        return weights

    def load_named_weights(self, weights: dict):
        blocks = {
            'enc0a': self.enc0a, 'enc0b': self.enc0b,
            'enc1a': self.enc1a, 'enc1b': self.enc1b,
            'enc2a': self.enc2a, 'enc2b': self.enc2b,
            'bot_res1': self.bot_res1, 'bot_res2': self.bot_res2,
            'dec1a': self.dec1a, 'dec1b': self.dec1b,
            'dec0a': self.dec0a, 'dec0b': self.dec0b,
        }
        conds = {
            'cond0': self.cond0, 'cond1': self.cond1, 'cond2': self.cond2,
            'bot_cond': self.bot_cond, 'cond_d1': self.cond_d1, 'cond_d0': self.cond_d0,
        }

        def _load(params, key):
            if key in weights:
                params[key.split('_')[-1]] = weights[key].astype(np.float32)

        for name, rb in blocks.items():
            for k in rb.conv1.params:
                key = f'{name}_c1_{k}'
                if key in weights: rb.conv1.params[k] = weights[key].astype(np.float32)
            for k in rb.gn1.params:
                key = f'{name}_g1_{k}'
                if key in weights: rb.gn1.params[k] = weights[key].astype(np.float32)
            for k in rb.conv2.params:
                key = f'{name}_c2_{k}'
                if key in weights: rb.conv2.params[k] = weights[key].astype(np.float32)
            for k in rb.gn2.params:
                key = f'{name}_g2_{k}'
                if key in weights: rb.gn2.params[k] = weights[key].astype(np.float32)
            if rb.proj:
                for k in rb.proj.params:
                    key = f'{name}_pr_{k}'
                    if key in weights: rb.proj.params[k] = weights[key].astype(np.float32)

        for name, ci in conds.items():
            for k in ci.linear.params:
                key = f'{name}_lin_{k}'
                if key in weights: ci.linear.params[k] = weights[key].astype(np.float32)

        for k in self.attention.params:
            key = f'attn_{k}'
            if key in weights: self.attention.params[k] = weights[key].astype(np.float32)
        for k in self.attention.norm.params:
            key = f'attn_norm_{k}'
            if key in weights: self.attention.norm.params[k] = weights[key].astype(np.float32)
        for k in self.out_gn.params:
            key = f'out_gn_{k}'
            if key in weights: self.out_gn.params[k] = weights[key].astype(np.float32)
        for k in self.out_conv.params:
            key = f'out_conv_{k}'
            if key in weights: self.out_conv.params[k] = weights[key].astype(np.float32)
