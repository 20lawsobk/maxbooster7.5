"""
Diffusion model trainer — from scratch.

Training data is generated on-the-fly from our existing scene engine
(frameGenerator.py), so we need no external dataset.

Training loop:
  1. Sample a random scene style + text prompt
  2. Render a 64×64 training frame using the scene engine
  3. Sample a random timestep t ∈ [0, T-1]
  4. Corrupt the frame with noise: x_t = sqrt(ᾱ_t)*x0 + sqrt(1-ᾱ_t)*ε
  5. Forward through U-Net: ε̂ = model(x_t, t, text)
  6. Loss: MSE(ε̂, ε)  [noise prediction objective]
  7. Backward → Adam update
  8. Save weights every N steps
"""

import os
import sys
import time
import json
import numpy as np

# Allow importing frameGenerator from parent directory
_parent = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _parent not in sys.path:
    sys.path.insert(0, _parent)

from .scheduler import DDPMScheduler
from .encoder   import TextEncoder, TimeEncoder, tokenize
from .unet      import UNet
from .layers    import Adam

WEIGHTS_PATH = os.path.join(os.path.dirname(__file__), 'weights.npz')
META_PATH    = os.path.join(os.path.dirname(__file__), 'meta.json')

# ── Scene vocabulary for training data generation ──────────────────────────

SCENE_PROMPTS = {
    'concert_stage': [
        'concert stage live hip hop show',
        'concert performer spotlight crowd audience',
        'live music stage rock performance arena',
        'hype concert energetic crowd performer stage',
    ],
    'city_nights': [
        'city night urban rain neon lights skyline',
        'downtown night dark city rain traffic',
        'trap rap city night urban dark moody',
        'city nights glow rain neon street urban',
    ],
    'studio_session': [
        'studio recording session rnb soul booth',
        'studio console mixing producer session',
        'studio session neo soul record warm',
        'recording booth studio microphone producer',
    ],
    'golden_hour': [
        'outdoor golden sunset nature field sky',
        'golden hour landscape hills trees horizon',
        'country folk acoustic outdoor sunset golden',
        'warm golden light nature outdoor landscape',
    ],
    'neon_cityscape': [
        'neon cyberpunk city dark electronic edm',
        'neon lights night city trap dark synth',
        'futuristic neon cityscape dark glow rain',
        'edm electronic neon city dark underground',
    ],
    'music_festival': [
        'festival outdoor crowd hype stage live',
        'festival pop music hype energetic crowd',
        'outdoor festival stage show bright sky',
    ],
    'rooftop_view': [
        'rooftop city skyline night urban indie',
        'rooftop view sunset urban indie pop',
        'rooftop city lights night beautiful',
    ],
}


def _generate_training_frame(scene: str, res: int = 64) -> np.ndarray:
    """
    Generate a training frame using the existing scene engine (PIL-based).
    Returns float32 array [H, W, 3] in [-1, 1].
    """
    try:
        import importlib, importlib.util
        spec = importlib.util.spec_from_file_location(
            'frameGenerator',
            os.path.join(_parent, 'frameGenerator.py'))
        fg = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(fg)

        config = {
            'resolution': (res, res),
            'scene_prompt': scene,
            'title': 'Training',
            'artist': 'Training',
            'genre': 'hip-hop',
            'frame_index': np.random.randint(0, 900),
            'fps': 30,
            'show_title': False,
            'show_progress': False,
        }
        frame_bytes = fg.generate_frame(config)
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(frame_bytes)).convert('RGB').resize((res, res))
        arr = np.array(img, dtype=np.float32) / 127.5 - 1.0   # [-1, 1]
        return arr
    except Exception as e:
        # Fallback: generate a colourful procedural frame without frameGenerator
        rng = np.random.default_rng()
        arr = rng.standard_normal((res, res, 3)).astype(np.float32) * 0.3

        # Add a colour tone per scene type
        palette = {
            'concert_stage':  [0.5,  0.1,  0.8],
            'city_nights':    [0.1,  0.2,  0.6],
            'studio_session': [0.2,  0.5,  0.3],
            'golden_hour':    [0.9,  0.6,  0.1],
            'neon_cityscape': [0.0,  0.8,  0.6],
            'music_festival': [0.7,  0.4,  0.1],
            'rooftop_view':   [0.3,  0.4,  0.7],
        }
        tone = np.array(palette.get(scene, [0.3, 0.3, 0.3]), dtype=np.float32)
        # Add gradient
        for c in range(3):
            grad = np.linspace(-tone[c], tone[c], res).reshape(1, res)
            arr[:, :, c] += grad * 1.0
        return arr.clip(-1.0, 1.0)


def _build_cond(time_enc: TimeEncoder, text_enc: TextEncoder,
                t: int, prompt: str) -> np.ndarray:
    """Concatenate time and text embeddings into a conditioning vector."""
    t_emb   = time_enc.forward(t)
    tokens  = tokenize(prompt)
    tx_emb  = text_enc.forward(tokens)
    return np.concatenate([t_emb, tx_emb])   # [64]


def train(n_samples: int = 300,
          n_epochs:  int = 15,
          lr:        float = 3e-4,
          res:       int   = 32,
          T:         int   = 100,
          log_every: int   = 50,
          resume:    bool  = True) -> dict:
    """
    Train the diffusion model from scratch.

    n_samples: training frames to generate  (300 = ~1 min render + 3 min train)
    n_epochs:  full passes over dataset     (15 epochs, ~3-4 minutes total)
    lr:        Adam learning rate
    res:       frame resolution (32×32 for CPU training speed)
    T:         diffusion timesteps
    resume:    load existing weights if available

    Returns dict with training metadata.
    """
    print(f"[DiffusionTrainer] Starting training: {n_samples} samples × {n_epochs} epochs @ {res}x{res}")

    scheduler  = DDPMScheduler(T=T)
    time_enc   = TimeEncoder(sin_dim=32, emb_dim=32)
    text_enc   = TextEncoder(emb_dim=32, token_emb_dim=24)
    model      = UNet(cond_dim=64)

    if resume and os.path.exists(WEIGHTS_PATH):
        print(f"[DiffusionTrainer] Resuming from {WEIGHTS_PATH}")
        _load_all(model, time_enc, text_enc, WEIGHTS_PATH)

    optimizer  = Adam(lr=lr, weight_decay=1e-5)

    # ── Generate training dataset ──────────────────────────────────────────
    print(f"[DiffusionTrainer] Generating {n_samples} training frames ...")
    scenes    = list(SCENE_PROMPTS.keys())
    dataset   = []    # list of (frame_arr, prompt_str)

    t0 = time.time()
    for i in range(n_samples):
        scene  = scenes[i % len(scenes)]
        prompt = np.random.choice(SCENE_PROMPTS[scene])
        frame  = _generate_training_frame(scene, res)
        dataset.append((frame, prompt))
        if (i + 1) % 100 == 0:
            elapsed = time.time() - t0
            rate = (i + 1) / elapsed
            print(f"  Generated {i+1}/{n_samples} frames ({rate:.1f}/s, {elapsed:.0f}s elapsed)")

    print(f"[DiffusionTrainer] Dataset ready in {time.time()-t0:.0f}s")

    # ── Training loop ──────────────────────────────────────────────────────
    model.set_training(True)
    losses = []
    step = 0
    t_train = time.time()

    for epoch in range(n_epochs):
        np.random.shuffle(dataset)
        epoch_losses = []

        for frame, prompt in dataset:
            # Sample random timestep
            t_step = np.random.randint(0, T)

            # Corrupt frame
            x_t, eps_gt = scheduler.add_noise(frame, t_step)

            # Build conditioning
            cond = _build_cond(time_enc, text_enc, t_step, prompt)

            # Forward
            model.zero_grads()
            time_enc.zero_grads()
            text_enc.zero_grads()

            eps_pred = model.forward(x_t, cond)

            # MSE loss: predict the noise
            diff = eps_pred - eps_gt
            loss = np.mean(diff ** 2)
            epoch_losses.append(float(loss))

            # Backward
            dloss = (2.0 / diff.size) * diff
            model.backward(dloss)

            # Collect all param/grad pairs
            all_pairs = (
                model._get_param_grad_pairs_flat() +
                [(time_enc.params, time_enc.grads)] +
                [(text_enc.params, text_enc.grads)]
            )
            optimizer.step(all_pairs)

            step += 1
            if step % log_every == 0:
                avg = np.mean(epoch_losses[-log_every:])
                elapsed = time.time() - t_train
                print(f"  Epoch {epoch+1}/{n_epochs}  step {step}  "
                      f"loss={avg:.4f}  ({elapsed:.0f}s)")

        losses.append(float(np.mean(epoch_losses)))
        if epoch % 5 == 0 or epoch == n_epochs - 1:
            print(f"[DiffusionTrainer] Epoch {epoch+1}/{n_epochs}  avg_loss={losses[-1]:.4f}")
            _save_all(model, time_enc, text_enc, losses)

    total = time.time() - t_train
    print(f"[DiffusionTrainer] Training complete in {total:.0f}s  final_loss={losses[-1]:.4f}")

    meta = {'epochs': n_epochs, 'samples': n_samples,
            'final_loss': losses[-1], 'total_seconds': total,
            'losses': losses, 'resolution': res, 'T': T}
    with open(META_PATH, 'w') as f:
        json.dump(meta, f, indent=2)

    return meta


# ── Weight I/O ─────────────────────────────────────────────────────────────

def _save_all(model: UNet, time_enc: TimeEncoder,
              text_enc: TextEncoder, losses: list = None):
    weights = model.get_weights()
    for k, v in time_enc.params.items():
        weights[f'time_enc_{k}'] = v
    for k, v in text_enc.params.items():
        weights[f'text_enc_{k}'] = v
    np.savez_compressed(WEIGHTS_PATH, **weights)
    print(f"[DiffusionTrainer] Weights saved → {WEIGHTS_PATH}")


def _load_all(model: UNet, time_enc: TimeEncoder, text_enc: TextEncoder,
              path: str):
    data = dict(np.load(path))
    model.load_weights(data)
    for k in time_enc.params:
        key = f'time_enc_{k}'
        if key in data:
            time_enc.params[k] = data[key].astype(np.float32)
    for k in text_enc.params:
        key = f'text_enc_{k}'
        if key in data:
            text_enc.params[k] = data[key].astype(np.float32)
    print(f"[DiffusionTrainer] Weights loaded from {path}")


def is_trained() -> bool:
    return os.path.exists(WEIGHTS_PATH) and os.path.exists(META_PATH)


def get_meta() -> dict:
    if os.path.exists(META_PATH):
        with open(META_PATH) as f:
            return json.load(f)
    return {}


def load_for_inference(model: UNet, time_enc: TimeEncoder,
                       text_enc: TextEncoder):
    if is_trained():
        _load_all(model, time_enc, text_enc, WEIGHTS_PATH)
        return True
    return False
