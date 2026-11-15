"""
Learning-rate and noise schedules.
"""

import math
import torch


def cosine_schedule(step: int, total: int, min_lr: float, max_lr: float,
                    warmup: int = 0) -> float:
    if step < warmup:
        return max_lr * step / max(1, warmup)
    progress = (step - warmup) / max(1, total - warmup)
    return min_lr + 0.5 * (max_lr - min_lr) * (1 + math.cos(math.pi * progress))


def snr_gamma_loss_weight(
    alphas_cumprod: torch.Tensor,
    t: torch.Tensor,
    gamma: float = 5.0,
) -> torch.Tensor:
    """
    Min-SNR loss weighting (Hang et al., 2023).
    γ=5 balances reconstruction quality vs perceptual quality.
    """
    snr = alphas_cumprod[t] / (1 - alphas_cumprod[t])
    return torch.minimum(snr, torch.full_like(snr, gamma)) / snr
