"""
Distributed training helpers.  Supports single-GPU and multi-GPU (DDP/FSDP).
"""

import os
import torch
import torch.distributed as dist
from typing import Tuple


def setup_ddp() -> Tuple[int, int]:
    """
    Initialise the process group and return (rank, world_size).
    When not launched via torchrun, falls back to single-GPU mode.
    """
    if "RANK" not in os.environ:
        return 0, 1

    rank       = int(os.environ["RANK"])
    local_rank = int(os.environ["LOCAL_RANK"])
    world_size = int(os.environ["WORLD_SIZE"])

    torch.cuda.set_device(local_rank)
    dist.init_process_group(backend="nccl")
    return rank, world_size


def cleanup_ddp() -> None:
    if dist.is_initialized():
        dist.destroy_process_group()


def is_main(rank: int) -> bool:
    return rank == 0


def all_reduce_mean(tensor: torch.Tensor) -> torch.Tensor:
    if dist.is_initialized():
        dist.all_reduce(tensor, op=dist.ReduceOp.SUM)
        tensor /= dist.get_world_size()
    return tensor
