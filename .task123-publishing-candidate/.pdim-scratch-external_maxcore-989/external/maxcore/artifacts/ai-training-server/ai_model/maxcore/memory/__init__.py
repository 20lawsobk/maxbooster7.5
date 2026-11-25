"""Memory layer for the digital GPU: a real, budgeted virtual-VRAM allocator."""
from .pool import Allocation, VramOOMError, VramPool

__all__ = ["VramPool", "VramOOMError", "Allocation"]
