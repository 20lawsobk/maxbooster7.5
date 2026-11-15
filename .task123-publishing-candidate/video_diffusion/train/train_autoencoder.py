"""
Autoencoder (VideoVAE3D) pre-training.

Loss = L1 reconstruction + β·KL divergence + perceptual loss (LPIPS, optional).
Run via: scripts/launch_autoencoder.sh
"""

import os
import yaml
import argparse
import torch
import torch.nn.functional as F
from torch.utils.data import DataLoader
from torch.nn.parallel import DistributedDataParallel as DDP

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.autoencoder_3d import VideoVAE3D
from data.datasets import VideoDataset
from data.transforms_video import VideoTransform
from utils.logging import get_logger
from utils.checkpoint import save_checkpoint, load_checkpoint
from utils.distributed import setup_ddp, cleanup_ddp, is_main


def kl_loss(mean: torch.Tensor, logvar: torch.Tensor) -> torch.Tensor:
    return -0.5 * torch.mean(1 + logvar - mean.pow(2) - logvar.exp())


def train_autoencoder(cfg: dict):
    rank, world_size = setup_ddp()
    logger = get_logger("autoencoder", rank=rank)

    transform = VideoTransform(cfg["data"])
    ds = VideoDataset(cfg["data"])
    sampler = (
        torch.utils.data.DistributedSampler(ds, num_replicas=world_size, rank=rank)
        if world_size > 1 else None
    )
    dl = DataLoader(
        ds,
        batch_size=cfg["train"]["batch_size"],
        shuffle=(sampler is None),
        sampler=sampler,
        num_workers=cfg["train"]["num_workers"],
        pin_memory=True,
        drop_last=True,
    )

    model = VideoVAE3D(cfg["model"]).cuda()
    if world_size > 1:
        model = DDP(model, device_ids=[rank])

    opt = torch.optim.AdamW(
        model.parameters(),
        lr=cfg["train"]["lr"],
        weight_decay=cfg["train"].get("weight_decay", 1e-2),
        betas=(0.9, 0.999),
    )
    scaler = torch.cuda.amp.GradScaler()

    start_step = 0
    if cfg["train"].get("resume"):
        start_step = load_checkpoint(model, opt, cfg["train"]["resume"])

    # Cosine LR schedule with linear warm-up
    total_steps = cfg["train"]["total_steps"]
    warmup = cfg["train"].get("warmup_steps", 500)
    scheduler = torch.optim.lr_scheduler.OneCycleLR(
        opt, max_lr=cfg["train"]["lr"],
        total_steps=total_steps,
        pct_start=warmup / total_steps,
    )

    model.train()
    step = start_step
    while step < total_steps:
        if sampler:
            sampler.set_epoch(step // len(dl))
        for batch in dl:
            if step >= total_steps:
                break
            x = transform(batch["video"]).cuda()  # [B, 3, T, H, W]

            with torch.cuda.amp.autocast():
                m = model.module if world_size > 1 else model
                x_rec, mean, logvar = m(x)
                rec_loss = F.l1_loss(x_rec, x)
                kld      = kl_loss(mean, logvar)
                loss     = rec_loss + cfg["train"].get("kl_weight", 1e-6) * kld

            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0)
            scaler.step(opt)
            scaler.update()
            scheduler.step()

            if step % cfg["train"]["log_every"] == 0 and is_main(rank):
                lr = scheduler.get_last_lr()[0]
                logger.info(
                    f"step={step:07d}  loss={loss.item():.4f}  "
                    f"rec={rec_loss.item():.4f}  kl={kld.item():.4f}  lr={lr:.2e}"
                )

            if step % cfg["train"]["ckpt_every"] == 0 and step > 0 and is_main(rank):
                save_checkpoint(
                    model.module if world_size > 1 else model,
                    opt, step,
                    path=os.path.join(cfg["train"]["out_dir"], f"ae_step{step:07d}.pt"),
                )
            step += 1

    cleanup_ddp()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    with open(args.config) as f:
        cfg = yaml.safe_load(f)
    train_autoencoder(cfg)
