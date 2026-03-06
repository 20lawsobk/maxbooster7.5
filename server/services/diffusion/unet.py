"""
Tiny U-Net denoising network — pure NumPy, no frameworks.

Architecture:
  Input:  [H, W, 3]  noisy image (H=W=64)
  Cond:   time_emb [32] + text_emb [32] → cond [64] injected via channel-wise addition

  Encoder:
    L0: Conv(3→CH0) BN SiLU → Conv(CH0→CH0) BN SiLU              [H,  W,  CH0]
    ↓ MaxPool                                                       [H/2,W/2,CH0]
    L1: Conv(CH0→CH1) BN SiLU → Conv(CH1→CH1) BN SiLU             [H/2,W/2,CH1]
    ↓ MaxPool                                                       [H/4,W/4,CH1]
    L2: Conv(CH1→CH2) BN SiLU → Conv(CH2→CH2) BN SiLU             [H/4,W/4,CH2]

  Bottleneck (with conditioning injection):
    Linear(64→CH2) → reshape → add to feature map
    Conv(CH2→CH2) BN SiLU                                          [H/4,W/4,CH2]

  Decoder:
    ↑ Upsample 2x                                                   [H/2,W/2,CH2]
    L1: Conv(CH2+CH1→CH1) BN SiLU → Conv(CH1→CH1) BN SiLU         [H/2,W/2,CH1]
    ↑ Upsample 2x                                                   [H,  W,  CH1]
    L0: Conv(CH1+CH0→CH0) BN SiLU → Conv(CH0→CH0) BN SiLU         [H,  W,  CH0]

  Output: Conv1x1(CH0→3)                                           [H,  W,  3]
  Loss target: predicted noise ε_θ(x_t, t, text)
"""

import numpy as np
from .layers import Conv2D, BatchNorm, SiLU, Linear, MaxPool2x2, ConvBlock, upsample2x, upsample2x_backward


CH0 = 16
CH1 = 32
CH2 = 48
COND_DIM = 64     # concatenated time + text embedding


class UNet:
    """
    Tiny U-Net conditioned on time and text embeddings.
    All parameters stored in self.params dict for easy serialization.
    """

    def __init__(self, cond_dim: int = COND_DIM):
        self.cond_dim = cond_dim

        # ── Encoder ──────────────────────────────────────────────────────
        self.enc0a = ConvBlock(3,    CH0)
        self.enc0b = ConvBlock(CH0,  CH0)
        self.pool0 = MaxPool2x2()

        self.enc1a = ConvBlock(CH0,  CH1)
        self.enc1b = ConvBlock(CH1,  CH1)
        self.pool1 = MaxPool2x2()

        self.enc2a = ConvBlock(CH1,  CH2)
        self.enc2b = ConvBlock(CH2,  CH2)

        # ── Conditioning injection ────────────────────────────────────────
        # Project cond_dim → CH2, add to each spatial position
        self.cond_proj = Linear(cond_dim, CH2)

        # ── Bottleneck ────────────────────────────────────────────────────
        self.bot = ConvBlock(CH2, CH2)

        # ── Decoder ───────────────────────────────────────────────────────
        # After upsample, concat with skip → CH2+CH1 in
        self.dec1a = ConvBlock(CH2 + CH1, CH1)
        self.dec1b = ConvBlock(CH1,       CH1)

        self.dec0a = ConvBlock(CH1 + CH0, CH0)
        self.dec0b = ConvBlock(CH0,       CH0)

        # ── Output projection ─────────────────────────────────────────────
        self.out_conv = Conv2D(CH0, 3, k=1, pad=0)

        # Cache for backward
        self._cache = {}

    # ── Parameter access ──────────────────────────────────────────────────

    @property
    def layer_list(self):
        return [
            self.enc0a, self.enc0b,
            self.enc1a, self.enc1b,
            self.enc2a, self.enc2b,
            self.cond_proj,
            self.bot,
            self.dec1a, self.dec1b,
            self.dec0a, self.dec0b,
            self.out_conv,
        ]

    def all_param_grad_pairs(self) -> list:
        """Return list of (params_dict, grads_dict) for Adam optimizer."""
        pairs = []
        for layer in self.layer_list:
            if hasattr(layer, 'params') and layer.params:
                if hasattr(layer, 'grads'):
                    pairs.append((layer.params, layer.grads))
            # ConvBlock exposes params/grads of sub-layers
            if hasattr(layer, 'conv') and hasattr(layer.conv, 'params'):
                pairs.append((layer.conv.params, layer.conv.grads))
                pairs.append((layer.bn.params, layer.bn.grads))
        return pairs

    def _get_param_grad_pairs_flat(self) -> list:
        """Flat list of (params, grads) for all primitive layers."""
        result = []
        for layer in self.layer_list:
            if isinstance(layer, ConvBlock):
                result.append((layer.conv.params, layer.conv.grads))
                result.append((layer.bn.params,   layer.bn.grads))
            elif isinstance(layer, (Conv2D, Linear)):
                result.append((layer.params, layer.grads))
        return result

    def zero_grads(self):
        for params, grads in self._get_param_grad_pairs_flat():
            for k in grads:
                grads[k][:] = 0.0

    def set_training(self, mode: bool):
        for layer in self.layer_list:
            if hasattr(layer, 'set_training'):
                layer.set_training(mode)
            if hasattr(layer, 'bn'):
                layer.bn.training = mode

    # ── Forward ───────────────────────────────────────────────────────────

    def forward(self, x: np.ndarray, cond: np.ndarray) -> np.ndarray:
        """
        x:    [H, W, 3]   noisy image in [-1, 1]
        cond: [cond_dim]  concatenated time + text embeddings
        returns: [H, W, 3]  predicted noise
        """
        c = self._cache

        # Encoder L0
        e0a = self.enc0a.forward(x)
        e0b = self.enc0b.forward(e0a)      # skip0: [H,  W,  CH0]
        p0  = self.pool0.forward(e0b)

        # Encoder L1
        e1a = self.enc1a.forward(p0)
        e1b = self.enc1b.forward(e1a)      # skip1: [H/2, W/2, CH1]
        p1  = self.pool1.forward(e1b)

        # Encoder L2 (bottleneck input)
        e2a = self.enc2a.forward(p1)
        e2b = self.enc2b.forward(e2a)      # [H/4, W/4, CH2]

        # Conditioning injection
        cond_vec = self.cond_proj.forward(cond)          # [CH2]
        e2b_cond = e2b + cond_vec[None, None, :]         # broadcast to [H/4, W/4, CH2]

        # Bottleneck
        bot = self.bot.forward(e2b_cond)                 # [H/4, W/4, CH2]

        # Decoder L1: upsample + concat with skip1
        up1  = upsample2x(bot)                           # [H/2, W/2, CH2]
        cat1 = np.concatenate([up1, e1b], axis=2)        # [H/2, W/2, CH2+CH1]
        d1a  = self.dec1a.forward(cat1)
        d1b  = self.dec1b.forward(d1a)                   # [H/2, W/2, CH1]

        # Decoder L0: upsample + concat with skip0
        up0  = upsample2x(d1b)                           # [H,  W,  CH1]
        cat0 = np.concatenate([up0, e0b], axis=2)        # [H,  W,  CH1+CH0]
        d0a  = self.dec0a.forward(cat0)
        d0b  = self.dec0b.forward(d0a)                   # [H,  W,  CH0]

        # Output
        out  = self.out_conv.forward(d0b)                # [H,  W,  3]

        c.update({
            'x': x, 'cond': cond, 'cond_vec': cond_vec,
            'e0b': e0b, 'e1b': e1b,
            'e2b': e2b, 'e2b_cond': e2b_cond,
            'bot': bot, 'up1': up1, 'cat1': cat1,
            'd1b': d1b, 'up0': up0, 'cat0': cat0,
            'd0b': d0b,
        })
        return out

    # ── Backward ──────────────────────────────────────────────────────────

    def backward(self, dloss: np.ndarray) -> None:
        """
        dloss: [H, W, 3]  gradient of MSE loss w.r.t. output
        Backpropagates through the full U-Net, accumulates gradients.
        """
        c = self._cache

        # Output conv
        dd0b = self.out_conv.backward(dloss)

        # Decoder L0
        dd0a = self.dec0b.backward(dd0b)
        dcat0 = self.dec0a.backward(dd0a)

        # Split concat gradient
        dup0 = dcat0[:, :, :CH1]
        de0b_dec = dcat0[:, :, CH1:]

        # Upsample L0 backward
        dd1b = upsample2x_backward(dup0)

        # Decoder L1
        dd1a = self.dec1b.backward(dd1b)
        dcat1 = self.dec1a.backward(dd1a)

        # Split concat gradient
        dup1 = dcat1[:, :, :CH2]
        de1b_dec = dcat1[:, :, CH2:]

        # Upsample L1 backward
        dbot = upsample2x_backward(dup1)

        # Bottleneck
        de2b_cond = self.bot.backward(dbot)

        # Conditioning backward
        dcond_vec = de2b_cond.sum(axis=(0, 1))           # [CH2]
        self.cond_proj.backward(dcond_vec)
        de2b = de2b_cond                                  # gradient passes through addition

        # Encoder L2
        de2a = self.enc2b.backward(de2b)
        dp1  = self.enc2a.backward(de2a)

        # Pool1 backward + skip1 gradient sum
        de1b_from_pool = self.pool1.backward(dp1)
        de1b = de1b_from_pool + de1b_dec

        # Encoder L1
        de1a = self.enc1b.backward(de1b)
        dp0  = self.enc1a.backward(de1a)

        # Pool0 backward + skip0 gradient sum
        de0b_from_pool = self.pool0.backward(dp0)
        de0b = de0b_from_pool + de0b_dec

        # Encoder L0
        de0a = self.enc0b.backward(de0b)
        self.enc0a.backward(de0a)

    # ── Weight serialization ───────────────────────────────────────────────

    def get_weights(self) -> dict:
        """Serialize all weights to a dict of numpy arrays."""
        weights = {}
        layer_names = [
            'enc0a', 'enc0b', 'enc1a', 'enc1b', 'enc2a', 'enc2b',
            'cond_proj', 'bot', 'dec1a', 'dec1b', 'dec0a', 'dec0b', 'out_conv',
        ]
        for name in layer_names:
            layer = getattr(self, name)
            if isinstance(layer, ConvBlock):
                for k, v in layer.conv.params.items():
                    weights[f'{name}_conv_{k}'] = v.copy()
                for k, v in layer.bn.params.items():
                    weights[f'{name}_bn_{k}'] = v.copy()
                weights[f'{name}_bn_running_mean'] = layer.bn.running_mean.copy()
                weights[f'{name}_bn_running_var']  = layer.bn.running_var.copy()
            elif isinstance(layer, (Conv2D, Linear)):
                for k, v in layer.params.items():
                    weights[f'{name}_{k}'] = v.copy()
        return weights

    def load_weights(self, weights: dict):
        """Load weights from a dict (inverse of get_weights)."""
        layer_names = [
            'enc0a', 'enc0b', 'enc1a', 'enc1b', 'enc2a', 'enc2b',
            'cond_proj', 'bot', 'dec1a', 'dec1b', 'dec0a', 'dec0b', 'out_conv',
        ]
        for name in layer_names:
            layer = getattr(self, name)
            if isinstance(layer, ConvBlock):
                for k in layer.conv.params:
                    key = f'{name}_conv_{k}'
                    if key in weights:
                        layer.conv.params[k] = weights[key].copy()
                for k in layer.bn.params:
                    key = f'{name}_bn_{k}'
                    if key in weights:
                        layer.bn.params[k] = weights[key].copy()
                rmk = f'{name}_bn_running_mean'
                rvk = f'{name}_bn_running_var'
                if rmk in weights: layer.bn.running_mean = weights[rmk].copy()
                if rvk in weights: layer.bn.running_var  = weights[rvk].copy()
            elif isinstance(layer, (Conv2D, Linear)):
                for k in layer.params:
                    key = f'{name}_{k}'
                    if key in weights:
                        layer.params[k] = weights[key].copy()
