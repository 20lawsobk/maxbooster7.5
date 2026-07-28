"""
Max Booster — In-House Video Diffusion Engine
Built from scratch using NumPy only — no PyTorch, no TensorFlow.

Architecture:
  - DDPM/DDIM noise scheduler (linear beta schedule)
  - Tiny U-Net denoiser with time + text conditioning
  - Music-scene text encoder (bag-of-words → dense embedding)
  - Sinusoidal time embedding
  - Adam optimizer (hand-coded)
  - DDIM 20-step inference for fast generation

Training data: generated on-the-fly from existing scene engine.
Inference: text + genre → 64x64 RGB frames → upscaled to target resolution.
"""
