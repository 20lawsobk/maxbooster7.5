"""
U-Net Denoiser v3 — 4-level architecture with dual attention.

Upgrades over v2:
  - 4 encoder/decoder levels  [32,64,96,128]   (was 3: [32,64,96])
  - Dual SelfAttention2D: at L3 AND bottleneck  (captures structure at 2 scales)
  - Deeper bottleneck: 3 ResBlocks + attention  (more capacity at narrowest point)
  - 8 attention heads at bottleneck             (was 4 — richer multi-head reasoning)
  - 4 heads at L3                               (mid-scale structure reasoning)
  - FiLM conditioning at ALL 4 encoder + ALL 4 decoder levels
  - 2 ResBlocks per level throughout

Spatial resolution flow (48×48 input):
  L0: 48×48  → 24×24  (MaxPool)
  L1: 24×24  → 12×12  (MaxPool)
  L2: 12×12  →  6×6   (MaxPool)
  L3:  6×6   →  3×3   (MaxPool → bottleneck)
  Bot:  3×3  with dual-head attention (9 positions, cheapest possible)

Attention positions:
  L3:  6×6 = 36 positions (mid-scale features)
  Bot: 3×3 =  9 positions (global reasoning, near-free cost)

Estimated parameters: ~2.1M (vs 1.2M in v2) — 75% increase
"""

import numpy as np
from .layers import (Conv2D, ResBlock, SelfAttention2D, GroupNorm,
                     Linear, SiLU, MaxPool2x2, upsample2x, upsample2x_backward)

# Channel sizes — 4 levels
CH0 = 32
CH1 = 64
CH2 = 96
CH3 = 128
COND_DIM = 64   # time(32) + text(32)


class ConditioningInjector:
    """
    FiLM conditioning: projects cond → (γ, β) and applies x*γ + β.
    Used in DALL-E 2, Imagen — modulates every feature map with text+time.
    """

    def __init__(self, cond_dim: int, c_out: int):
        self.cond_dim = cond_dim
        self.c_out    = c_out
        self.linear   = Linear(cond_dim, c_out * 2)
        self.act      = SiLU()
        self._cache   = None

    def forward(self, x: np.ndarray, cond: np.ndarray) -> np.ndarray:
        proj  = self.act.forward(self.linear.forward(cond))
        gamma = proj[:self.c_out] + 1.0
        beta  = proj[self.c_out:]
        self._cache = (x, gamma, beta, proj)
        return x * gamma[None, None, :] + beta[None, None, :]

    def backward(self, dout: np.ndarray) -> np.ndarray:
        x, gamma, beta, proj = self._cache
        dgamma = (dout * x).sum(axis=(0, 1))
        dbeta  = dout.sum(axis=(0, 1))
        dx     = dout * gamma[None, None, :]
        dproj  = np.concatenate([dgamma, dbeta])
        self.linear.backward(self.act.backward(dproj))
        return dx

    def _get_param_grad_pairs(self):
        return [(self.linear.params, self.linear.grads)]


class UNet:
    """
    4-level U-Net with dual self-attention and FiLM conditioning throughout.
    """

    def __init__(self, cond_dim: int = COND_DIM):
        self.cond_dim = cond_dim

        # ── Encoder ──────────────────────────────────────────────────────────
        # L0: [H, W, 3] → [H, W, CH0]
        self.enc0a = ResBlock(3,    CH0)
        self.enc0b = ResBlock(CH0,  CH0)
        self.cond0 = ConditioningInjector(cond_dim, CH0)
        self.pool0 = MaxPool2x2()

        # L1: [H/2, W/2, CH0] → [H/2, W/2, CH1]
        self.enc1a = ResBlock(CH0,  CH1)
        self.enc1b = ResBlock(CH1,  CH1)
        self.cond1 = ConditioningInjector(cond_dim, CH1)
        self.pool1 = MaxPool2x2()

        # L2: [H/4, W/4, CH1] → [H/4, W/4, CH2]
        self.enc2a = ResBlock(CH1,  CH2)
        self.enc2b = ResBlock(CH2,  CH2)
        self.cond2 = ConditioningInjector(cond_dim, CH2)
        self.pool2 = MaxPool2x2()

        # L3: [H/8, W/8, CH2] → [H/8, W/8, CH3]   ← NEW level
        # SelfAttention2D here = mid-scale structure reasoning
        self.enc3a   = ResBlock(CH2,  CH3)
        self.enc3b   = ResBlock(CH3,  CH3)
        self.attn_l3 = SelfAttention2D(CH3, n_heads=4)    # 4 heads @ 6×6
        self.cond3   = ConditioningInjector(cond_dim, CH3)
        self.pool3   = MaxPool2x2()

        # ── Bottleneck — 3×3 with dual attention ─────────────────────────────
        # 3×3 = only 9 positions — attention is near-free, maximum global reasoning
        self.bot_res1  = ResBlock(CH3, CH3)
        self.bot_attn  = SelfAttention2D(CH3, n_heads=8)   # 8 heads @ 3×3
        self.bot_res2  = ResBlock(CH3, CH3)
        self.bot_res3  = ResBlock(CH3, CH3)                 # extra depth
        self.bot_cond  = ConditioningInjector(cond_dim, CH3)

        # ── Decoder ───────────────────────────────────────────────────────────
        # Dec3: upsample + skip from enc3b → [H/4, W/4, CH2]
        self.dec3a    = ResBlock(CH3 + CH3, CH2)
        self.dec3b    = ResBlock(CH2,       CH2)
        self.cond_d3  = ConditioningInjector(cond_dim, CH2)

        # Dec2: upsample + skip from enc2b → [H/2, W/2, CH1]
        self.dec2a    = ResBlock(CH2 + CH2, CH1)
        self.dec2b    = ResBlock(CH1,       CH1)
        self.cond_d2  = ConditioningInjector(cond_dim, CH1)

        # Dec1: upsample + skip from enc1b → [H, W, CH0]
        self.dec1a    = ResBlock(CH1 + CH1, CH0)
        self.dec1b    = ResBlock(CH0,       CH0)
        self.cond_d1  = ConditioningInjector(cond_dim, CH0)

        # Dec0: upsample + skip from enc0b → [H, W, CH0]
        self.dec0a    = ResBlock(CH0 + CH0, CH0)
        self.dec0b    = ResBlock(CH0,       CH0)
        self.cond_d0  = ConditioningInjector(cond_dim, CH0)

        # ── Output head ───────────────────────────────────────────────────────
        self.out_gn   = GroupNorm(CH0, G=min(8, CH0))
        self.out_act  = SiLU()
        self.out_conv = Conv2D(CH0, 3, k=1, pad=0)

        self._cache = {}

    # ── Parameters ────────────────────────────────────────────────────────────

    def _get_param_grad_pairs_flat(self) -> list:
        pairs = []

        def add_rb(r: ResBlock):
            pairs.append((r.conv1.params, r.conv1.grads))
            pairs.append((r.gn1.params,   r.gn1.grads))
            pairs.append((r.conv2.params, r.conv2.grads))
            pairs.append((r.gn2.params,   r.gn2.grads))
            if r.proj:
                pairs.append((r.proj.params, r.proj.grads))

        def add_ci(c: ConditioningInjector):
            pairs.append((c.linear.params, c.linear.grads))

        def add_attn(a: SelfAttention2D):
            pairs.append((a.params, a.grads))
            pairs.append((a.norm.params, a.norm.grads))

        for rb in [self.enc0a, self.enc0b,
                   self.enc1a, self.enc1b,
                   self.enc2a, self.enc2b,
                   self.enc3a, self.enc3b,
                   self.bot_res1, self.bot_res2, self.bot_res3,
                   self.dec3a, self.dec3b,
                   self.dec2a, self.dec2b,
                   self.dec1a, self.dec1b,
                   self.dec0a, self.dec0b]:
            add_rb(rb)

        for ci in [self.cond0, self.cond1, self.cond2, self.cond3, self.bot_cond,
                   self.cond_d3, self.cond_d2, self.cond_d1, self.cond_d0]:
            add_ci(ci)

        add_attn(self.attn_l3)
        add_attn(self.bot_attn)

        pairs.append((self.out_gn.params,   self.out_gn.grads))
        pairs.append((self.out_conv.params,  self.out_conv.grads))

        return pairs

    def zero_grads(self):
        for params, grads in self._get_param_grad_pairs_flat():
            for k in grads:
                grads[k][:] = 0.0

    def set_training(self, mode: bool):
        for rb in [self.enc0a, self.enc0b,
                   self.enc1a, self.enc1b,
                   self.enc2a, self.enc2b,
                   self.enc3a, self.enc3b,
                   self.bot_res1, self.bot_res2, self.bot_res3,
                   self.dec3a, self.dec3b,
                   self.dec2a, self.dec2b,
                   self.dec1a, self.dec1b,
                   self.dec0a, self.dec0b]:
            rb.set_training(mode)
        self.out_gn.set_training(mode)

    # ── Forward ──────────────────────────────────────────────────────────────

    def forward(self, x: np.ndarray, cond: np.ndarray) -> np.ndarray:
        """
        x:    [H, W, 3]    noisy image in [-1, 1]
        cond: [COND_DIM]   time(32) + text(32)
        returns: [H, W, 3] predicted noise
        """
        c = self._cache

        # ── Encoder ──────────────────────────────────────────────────────────
        # L0
        e0a = self.enc0a.forward(x)
        e0b = self.enc0b.forward(e0a)
        e0b = self.cond0.forward(e0b, cond)          # [H, W, CH0]
        p0  = self.pool0.forward(e0b)                # [H/2, W/2, CH0]

        # L1
        e1a = self.enc1a.forward(p0)
        e1b = self.enc1b.forward(e1a)
        e1b = self.cond1.forward(e1b, cond)          # [H/2, W/2, CH1]
        p1  = self.pool1.forward(e1b)                # [H/4, W/4, CH1]

        # L2
        e2a = self.enc2a.forward(p1)
        e2b = self.enc2b.forward(e2a)
        e2b = self.cond2.forward(e2b, cond)          # [H/4, W/4, CH2]
        p2  = self.pool2.forward(e2b)                # [H/8, W/8, CH2]

        # L3 — with mid-scale attention
        e3a    = self.enc3a.forward(p2)
        e3b    = self.enc3b.forward(e3a)
        e3b    = self.attn_l3.forward(e3b)           # 4-head attention @ H/8
        e3b    = self.cond3.forward(e3b, cond)       # [H/8, W/8, CH3]
        p3     = self.pool3.forward(e3b)             # [H/16, W/16, CH3]

        # ── Bottleneck — 3 ResBlocks + 8-head attention ───────────────────────
        bot1 = self.bot_res1.forward(p3)
        attn = self.bot_attn.forward(bot1)           # global reasoning @ H/16
        bot2 = self.bot_res2.forward(attn)
        bot3 = self.bot_res3.forward(bot2)           # extra depth
        bot3 = self.bot_cond.forward(bot3, cond)     # [H/16, W/16, CH3]

        # ── Decoder ──────────────────────────────────────────────────────────
        # Dec3: upsample bot → [H/8, W/8] + skip e3b
        up3  = upsample2x(bot3)                      # [H/8, W/8, CH3]
        cat3 = np.concatenate([up3, e3b], axis=2)    # [H/8, W/8, CH3+CH3]
        d3a  = self.dec3a.forward(cat3)
        d3b  = self.dec3b.forward(d3a)
        d3b  = self.cond_d3.forward(d3b, cond)       # [H/8, W/8, CH2]

        # Dec2: upsample → [H/4, W/4] + skip e2b
        up2  = upsample2x(d3b)                       # [H/4, W/4, CH2]
        cat2 = np.concatenate([up2, e2b], axis=2)    # [H/4, W/4, CH2+CH2]
        d2a  = self.dec2a.forward(cat2)
        d2b  = self.dec2b.forward(d2a)
        d2b  = self.cond_d2.forward(d2b, cond)       # [H/4, W/4, CH1]

        # Dec1: upsample → [H/2, W/2] + skip e1b
        up1  = upsample2x(d2b)                       # [H/2, W/2, CH1]
        cat1 = np.concatenate([up1, e1b], axis=2)    # [H/2, W/2, CH1+CH1]
        d1a  = self.dec1a.forward(cat1)
        d1b  = self.dec1b.forward(d1a)
        d1b  = self.cond_d1.forward(d1b, cond)       # [H/2, W/2, CH0]

        # Dec0: upsample → [H, W] + skip e0b
        up0  = upsample2x(d1b)                       # [H, W, CH0]
        cat0 = np.concatenate([up0, e0b], axis=2)    # [H, W, CH0+CH0]
        d0a  = self.dec0a.forward(cat0)
        d0b  = self.dec0b.forward(d0a)
        d0b  = self.cond_d0.forward(d0b, cond)       # [H, W, CH0]

        # ── Output head ──────────────────────────────────────────────────────
        out_norm = self.out_act.forward(self.out_gn.forward(d0b))
        out      = self.out_conv.forward(out_norm)   # [H, W, 3]

        c.update({
            'e0b': e0b, 'e1b': e1b, 'e2b': e2b, 'e3b': e3b,
            'bot1': bot1, 'attn': attn, 'bot2': bot2, 'bot3': bot3,
            'up3': up3, 'cat3': cat3, 'd3b': d3b,
            'up2': up2, 'cat2': cat2, 'd2b': d2b,
            'up1': up1, 'cat1': cat1, 'd1b': d1b,
            'up0': up0, 'cat0': cat0, 'd0b': d0b,
            'out_norm': out_norm,
        })
        return out

    # ── Backward ─────────────────────────────────────────────────────────────

    def backward(self, dloss: np.ndarray) -> None:
        c = self._cache

        # Output head
        dout_norm = self.out_conv.backward(dloss)
        dd0b_gn   = self.out_act.backward(dout_norm)
        dd0b      = self.out_gn.backward(dd0b_gn)

        # Dec0
        dd0b  = self.cond_d0.backward(dd0b)
        dd0a  = self.dec0b.backward(dd0b)
        dcat0 = self.dec0a.backward(dd0a)
        dup0   = dcat0[:, :, :CH0]
        de0b_d = dcat0[:, :, CH0:]

        # Dec1
        dd1b  = upsample2x_backward(dup0)
        dd1b  = self.cond_d1.backward(dd1b)
        dd1a  = self.dec1b.backward(dd1b)
        dcat1 = self.dec1a.backward(dd1a)
        dup1   = dcat1[:, :, :CH1]
        de1b_d = dcat1[:, :, CH1:]

        # Dec2
        dd2b  = upsample2x_backward(dup1)
        dd2b  = self.cond_d2.backward(dd2b)
        dd2a  = self.dec2b.backward(dd2b)
        dcat2 = self.dec2a.backward(dd2a)
        dup2   = dcat2[:, :, :CH2]
        de2b_d = dcat2[:, :, CH2:]

        # Dec3
        dd3b  = upsample2x_backward(dup2)
        dd3b  = self.cond_d3.backward(dd3b)
        dd3a  = self.dec3b.backward(dd3b)
        dcat3 = self.dec3a.backward(dd3a)
        dup3   = dcat3[:, :, :CH3]
        de3b_d = dcat3[:, :, CH3:]

        # Bottleneck
        dbot3  = upsample2x_backward(dup3)
        dbot3  = self.bot_cond.backward(dbot3)
        dbot2  = self.bot_res3.backward(dbot3)
        dattn  = self.bot_res2.backward(dbot2)
        dbot1  = self.bot_attn.backward(dattn)
        dp3    = self.bot_res1.backward(dbot1)

        # Enc L3
        de3b_p = self.pool3.backward(dp3)
        de3b   = de3b_p + de3b_d
        de3b   = self.cond3.backward(de3b)
        de3b   = self.attn_l3.backward(de3b)
        de3a   = self.enc3b.backward(de3b)
        dp2    = self.enc3a.backward(de3a)

        # Enc L2
        de2b_p = self.pool2.backward(dp2)
        de2b   = de2b_p + de2b_d
        de2b   = self.cond2.backward(de2b)
        de2a   = self.enc2b.backward(de2b)
        dp1    = self.enc2a.backward(de2a)

        # Enc L1
        de1b_p = self.pool1.backward(dp1)
        de1b   = de1b_p + de1b_d
        de1b   = self.cond1.backward(de1b)
        de1a   = self.enc1b.backward(de1b)
        dp0    = self.enc1a.backward(de1a)

        # Enc L0
        de0b_p = self.pool0.backward(dp0)
        de0b   = de0b_p + de0b_d
        de0b   = self.cond0.backward(de0b)
        de0a   = self.enc0b.backward(de0b)
        self.enc0a.backward(de0a)

    # ── Weight serialization ──────────────────────────────────────────────────

    def _all_named_rbs(self) -> dict:
        return {
            'enc0a': self.enc0a, 'enc0b': self.enc0b,
            'enc1a': self.enc1a, 'enc1b': self.enc1b,
            'enc2a': self.enc2a, 'enc2b': self.enc2b,
            'enc3a': self.enc3a, 'enc3b': self.enc3b,
            'bot_res1': self.bot_res1, 'bot_res2': self.bot_res2, 'bot_res3': self.bot_res3,
            'dec3a': self.dec3a, 'dec3b': self.dec3b,
            'dec2a': self.dec2a, 'dec2b': self.dec2b,
            'dec1a': self.dec1a, 'dec1b': self.dec1b,
            'dec0a': self.dec0a, 'dec0b': self.dec0b,
        }

    def _all_named_conds(self) -> dict:
        return {
            'cond0': self.cond0, 'cond1': self.cond1,
            'cond2': self.cond2, 'cond3': self.cond3,
            'bot_cond': self.bot_cond,
            'cond_d3': self.cond_d3, 'cond_d2': self.cond_d2,
            'cond_d1': self.cond_d1, 'cond_d0': self.cond_d0,
        }

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
        weights = {}
        for name, rb in self._all_named_rbs().items():
            for k, v in rb.conv1.params.items(): weights[f'{name}_c1_{k}'] = v
            for k, v in rb.gn1.params.items():   weights[f'{name}_g1_{k}'] = v
            for k, v in rb.conv2.params.items(): weights[f'{name}_c2_{k}'] = v
            for k, v in rb.gn2.params.items():   weights[f'{name}_g2_{k}'] = v
            if rb.proj:
                for k, v in rb.proj.params.items(): weights[f'{name}_pr_{k}'] = v

        for name, ci in self._all_named_conds().items():
            for k, v in ci.linear.params.items(): weights[f'{name}_lin_{k}'] = v

        for k, v in self.attn_l3.params.items():    weights[f'attn_l3_{k}']      = v
        for k, v in self.attn_l3.norm.params.items(): weights[f'attn_l3_norm_{k}'] = v
        for k, v in self.bot_attn.params.items():   weights[f'attn_bot_{k}']     = v
        for k, v in self.bot_attn.norm.params.items(): weights[f'attn_bot_norm_{k}'] = v
        for k, v in self.out_gn.params.items():     weights[f'out_gn_{k}']       = v
        for k, v in self.out_conv.params.items():   weights[f'out_conv_{k}']     = v
        return weights

    def load_named_weights(self, weights: dict):
        for name, rb in self._all_named_rbs().items():
            for k in rb.conv1.params:
                if f'{name}_c1_{k}' in weights: rb.conv1.params[k] = weights[f'{name}_c1_{k}'].astype(np.float32)
            for k in rb.gn1.params:
                if f'{name}_g1_{k}' in weights: rb.gn1.params[k] = weights[f'{name}_g1_{k}'].astype(np.float32)
            for k in rb.conv2.params:
                if f'{name}_c2_{k}' in weights: rb.conv2.params[k] = weights[f'{name}_c2_{k}'].astype(np.float32)
            for k in rb.gn2.params:
                if f'{name}_g2_{k}' in weights: rb.gn2.params[k] = weights[f'{name}_g2_{k}'].astype(np.float32)
            if rb.proj:
                for k in rb.proj.params:
                    if f'{name}_pr_{k}' in weights: rb.proj.params[k] = weights[f'{name}_pr_{k}'].astype(np.float32)

        for name, ci in self._all_named_conds().items():
            for k in ci.linear.params:
                if f'{name}_lin_{k}' in weights: ci.linear.params[k] = weights[f'{name}_lin_{k}'].astype(np.float32)

        for k in self.attn_l3.params:
            if f'attn_l3_{k}' in weights: self.attn_l3.params[k] = weights[f'attn_l3_{k}'].astype(np.float32)
        for k in self.attn_l3.norm.params:
            if f'attn_l3_norm_{k}' in weights: self.attn_l3.norm.params[k] = weights[f'attn_l3_norm_{k}'].astype(np.float32)
        for k in self.bot_attn.params:
            if f'attn_bot_{k}' in weights: self.bot_attn.params[k] = weights[f'attn_bot_{k}'].astype(np.float32)
        for k in self.bot_attn.norm.params:
            if f'attn_bot_norm_{k}' in weights: self.bot_attn.norm.params[k] = weights[f'attn_bot_norm_{k}'].astype(np.float32)
        for k in self.out_gn.params:
            if f'out_gn_{k}' in weights: self.out_gn.params[k] = weights[f'out_gn_{k}'].astype(np.float32)
        for k in self.out_conv.params:
            if f'out_conv_{k}' in weights: self.out_conv.params[k] = weights[f'out_conv_{k}'].astype(np.float32)
