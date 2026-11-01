"""
Checkpoint utilities with optional EMA (Exponential Moving Average).
"""

import os
import torch
from typing import Optional


def save_checkpoint(
    model: torch.nn.Module,
    optimizer: torch.optim.Optimizer,
    step: int,
    path: str,
    ema_model: Optional[torch.nn.Module] = None,
    extra: Optional[dict] = None,
) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    payload = {
        "step": step,
        "model": model.state_dict(),
        "optimizer": optimizer.state_dict(),
    }
    if ema_model is not None:
        payload["ema"] = ema_model.state_dict()
    if extra:
        payload.update(extra)
    torch.save(payload, path)
    print(f"[checkpoint] Saved step {step} → {path}")


def load_checkpoint(
    model: torch.nn.Module,
    optimizer: Optional[torch.optim.Optimizer],
    path: str,
    load_ema: bool = False,
) -> int:
    ckpt = torch.load(path, map_location="cpu")
    key = "ema" if (load_ema and "ema" in ckpt) else "model"
    model.load_state_dict(ckpt[key])
    if optimizer is not None and "optimizer" in ckpt:
        optimizer.load_state_dict(ckpt["optimizer"])
    step = ckpt.get("step", 0)
    print(f"[checkpoint] Loaded step {step} from {path}")
    return step


class EMA:
    """Maintains an exponential moving average of model weights."""
    def __init__(self, model: torch.nn.Module, decay: float = 0.9999):
        self.model  = model
        self.decay  = decay
        self.shadow = {k: v.clone().float() for k, v in model.state_dict().items()}

    @torch.no_grad()
    def update(self) -> None:
        for k, v in self.model.state_dict().items():
            self.shadow[k] = self.decay * self.shadow[k] + (1 - self.decay) * v.float()

    def apply_shadow(self) -> None:
        """Temporarily apply EMA weights to the model (for evaluation)."""
        self._backup = {k: v.clone() for k, v in self.model.state_dict().items()}
        self.model.load_state_dict({k: v.to(next(self.model.parameters()).device)
                                     for k, v in self.shadow.items()})

    def restore(self) -> None:
        """Restore original weights after evaluation."""
        self.model.load_state_dict(self._backup)
