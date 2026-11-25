"""
Latent video diffusion model training.

VAE is frozen.  Only VideoDiT + TextConditioner + MusicConditioner are trained.
Supports both text-only and joint text+music conditioning.

Run via: scripts/launch_diffusion.sh
"""

import os
import yaml
import argparse
import torch
from torch.utils.data import DataLoader
from torch.nn.parallel import DistributedDataParallel as DDP

import sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.autoencoder_3d import VideoVAE3D
from models.dit_video import VideoDiT
from models.conditioning import TextConditioner, MusicConditioner
from models.diffusion import LatentDiffusionVideo, NoiseScheduler
from data.datasets import CaptionedVideoDataset
from data.transforms_video import VideoTransform
from utils.logging import get_logger
from utils.checkpoint import save_checkpoint, load_checkpoint
from utils.distributed import setup_ddp, cleanup_ddp, is_main


def train_diffusion(cfg: dict):
    rank, world_size = setup_ddp()
    logger = get_logger("diffusion", rank=rank)

    transform = VideoTransform(cfg["data"])
    ds = CaptionedVideoDataset(cfg["data"])
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

    # Frozen VAE
    vae = VideoVAE3D(cfg["vae"]).cuda().eval()
    vae.load_state_dict(torch.load(cfg["vae_ckpt"], map_location="cuda"))
    for p in vae.parameters():
        p.requires_grad = False

    # Trainable modules
    dit       = VideoDiT(cfg["dit"]).cuda()
    text_cond = TextConditioner(cfg["text"]["dim"], cfg["dit"]["embed_dim"]).cuda()
    music_cond = MusicConditioner(cfg["dit"]["embed_dim"]).cuda()

    scheduler = NoiseScheduler(
        num_steps=cfg["diffusion"]["num_steps"],
        schedule=cfg["diffusion"].get("schedule", "cosine"),
    )

    ldm = LatentDiffusionVideo(
        vae, dit, scheduler,
        cfg_dropout=cfg["train"].get("cfg_dropout", 0.1),
    )

    trainable_params = (
        list(dit.parameters())
        + list(text_cond.parameters())
        + list(music_cond.parameters())
    )
    opt = torch.optim.AdamW(trainable_params, lr=cfg["train"]["lr"], weight_decay=1e-2)
    scaler = torch.cuda.amp.GradScaler()

    if world_size > 1:
        ldm = DDP(ldm, device_ids=[rank])

    total_steps = cfg["train"]["total_steps"]
    warmup = cfg["train"].get("warmup_steps", 1000)
    scheduler_lr = torch.optim.lr_scheduler.OneCycleLR(
        opt, max_lr=cfg["train"]["lr"],
        total_steps=total_steps,
        pct_start=warmup / total_steps,
    )

    start_step = 0
    if cfg["train"].get("resume"):
        start_step = load_checkpoint(dit, opt, cfg["train"]["resume"])

    step = start_step
    while step < total_steps:
        if sampler:
            sampler.set_epoch(step // len(dl))
        for batch in dl:
            if step >= total_steps:
                break
            x       = transform(batch["video"]).cuda()
            txt_emb = batch["text_emb"].cuda()         # [B, L, text_dim]

            with torch.cuda.amp.autocast():
                t_cond = text_cond(txt_emb)            # [B, L, embed_dim]
                # Music conditioner is populated during inference; during training
                # we optionally pass zeros (unconditional for music stream)
                m_cond = None
                m = ldm.module if world_size > 1 else ldm
                loss = m(x, text_cond=t_cond, music_cond=m_cond)

            opt.zero_grad(set_to_none=True)
            scaler.scale(loss).backward()
            scaler.unscale_(opt)
            torch.nn.utils.clip_grad_norm_(trainable_params, 1.0)
            scaler.step(opt)
            scaler.update()
            scheduler_lr.step()

            if step % cfg["train"]["log_every"] == 0 and is_main(rank):
                lr = scheduler_lr.get_last_lr()[0]
                logger.info(f"step={step:07d}  loss={loss.item():.4f}  lr={lr:.2e}")

            if step % cfg["train"]["ckpt_every"] == 0 and step > 0 and is_main(rank):
                save_checkpoint(
                    dit, opt, step,
                    path=os.path.join(cfg["train"]["out_dir"], f"dit_step{step:07d}.pt"),
                )
            step += 1

    cleanup_ddp()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", required=True)
    args = parser.parse_args()
    with open(args.config) as f:
        cfg = yaml.safe_load(f)
    train_diffusion(cfg)
