import logging
import sys


def get_logger(name: str, rank: int = 0, level: int = logging.INFO) -> logging.Logger:
    """
    Return a structured logger.
    Only rank-0 processes log at INFO; all ranks log at ERROR+.
    """
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter(
        fmt="%(asctime)s [%(name)s] [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    ))

    effective_level = level if rank == 0 else logging.ERROR
    logger.setLevel(effective_level)
    handler.setLevel(effective_level)
    logger.addHandler(handler)
    logger.propagate = False
    return logger
