"""
Diffusion trainer v3 — self-improving with long-term memory.

New in v3:
  - 100+ training prompts across 12 scene categories (was 30 across 7)
  - LongTermMemory integration: scene mastery, experience replay, session log
  - RotatingBatchScheduler: priority-weighted scene sampling + auto-shuffle
  - 20% of each epoch replays hard examples from memory buffer
  - Per-scene loss tracking feeds back into next session's sampling weights
  - Continuous-mode flag for background self-training loop
"""

import os
import sys
import time
import json
import math
import numpy as np

_here   = os.path.dirname(os.path.abspath(__file__))
_parent = os.path.dirname(_here)
if _parent not in sys.path:
    sys.path.insert(0, _parent)

from .scheduler import DDPMScheduler
from .encoder   import TextEncoder, TimeEncoder, tokenize
from .unet      import UNet
from .layers    import Adam, EMA
from .memory    import LongTermMemory, RotatingBatchScheduler

WEIGHTS_PATH = os.path.join(_here, 'weights.npz')
META_PATH    = os.path.join(_here, 'meta.json')


# ══════════════════════════════════════════════════════════════════════════════
# 100+ training prompts across 12 scene categories
# ══════════════════════════════════════════════════════════════════════════════

SCENE_PROMPTS = {

    'concert_stage': [
        'concert stage live hiphop show spotlight crowd dark purple energetic',
        'concert performer spotlight stage crowd hype energetic raised fist',
        'live music rock performance arena crowd dark bright intense stage',
        'performer under white spotlight stage dark crowd audience cinematic',
        'festival mainstage crowd epic lights dark smoke beam spotlight',
        'hip hop show stage performer mic stand crowd chanting dark moody',
        'rap concert stage dark neon crowd waving hands performer intense',
        'sold-out arena concert stage lights crowd dark dramatic cinematic',
        'outdoor amphitheater concert evening lights crowd trees stage warm',
        'headline act concert stage confetti crowd dark explosive energetic',
        'comeback concert stage dramatic lighting crowd emotion performer',
        'opening night concert stage debut crowd excitement performer neon',
    ],

    'city_nights': [
        'city night urban rain neon lights skyline dark moody blue reflections',
        'downtown night dark city rain traffic wet neon glow street bokeh',
        'trap rap city night urban dark moody neon glow rain blue cinematic',
        'city nights glow rain neon street urban dark cinematic atmosphere',
        'urban cityscape night blue neon rain moody atmospheric aerial view',
        'rooftop city skyline night neon dark cinematic aerial perspective',
        'new york city night skyline bridge lights dark rain cinematic',
        'los angeles night freeway lights blur dark city glow warm',
        'atlanta city night trap urban dark glow rain reflective street',
        'chicago night city lake skyline dark cold blue lights cinematic',
        'tokyo city night neon signs rain dark foreign language blur',
        'city intersection night crosswalk rain neon lights dark wet pavement',
    ],

    'studio_session': [
        'recording studio session rnb soul neo warm booth console glow',
        'studio mixing console producer session warm amber intimate close',
        'studio session recording booth microphone warm cinematic intimate',
        'producer studio session neosoul groove warm smooth chill vibration',
        'studio control room mixing session warm soft amber producer focused',
        'home studio bedroom producer laptop beats dark warm focused glow',
        'professional recording studio grand piano warm wood golden intimate',
        'studio session late night headphones producer dark focused blue glow',
        'studio vocal booth singer microphone pop filter warm intimate glow',
        'grammy studio session legendary vintage console warm amber legendary',
        'analog tape recording studio warm vintage equipment amber glow',
        'studio engineer mixing board dark focused blue glow professional',
    ],

    'golden_hour': [
        'outdoor golden sunset nature field sky warm orange country peaceful',
        'golden hour landscape hills trees horizon warm romantic cinematic',
        'country folk acoustic outdoor sunset golden peaceful warm nostalgic',
        'warm golden light nature outdoor landscape cinematic peaceful calm',
        'sunset golden sky field trees warm romantic melancholy atmospheric',
        'dawn golden light mist nature field peaceful cinematic spiritual',
        'golden hour beach ocean waves warm light reflection magical',
        'autumn golden leaves park path trees warm afternoon light walk',
        'desert golden hour cactus hills warm orange sky dramatic',
        'mountain vista golden sunset clouds warm dramatic epic cinematic',
        'sunflower field golden afternoon warm light peaceful countryside',
        'vineyard golden hour rows vines warm sky romantic Europe',
    ],

    'neon_cityscape': [
        'neon cyberpunk city dark electronic edm glow magenta cyan future',
        'neon lights night city trap dark synth glow vibrant electric',
        'futuristic neon cityscape dark glow rain cyberpunk purple haze',
        'edm electronic neon city dark underground rave strobe laser smoke',
        'synthwave neon retro city dark purple cyan aesthetic grid',
        'hologram neon city futuristic dark glow cinematic purple digital',
        'neon sign alley rain reflective dark city atmospheric glow night',
        'cyberpunk market neon stalls rain dark crowded urban future',
        'neon bridge reflection water dark city glow electric blue',
        'underground tunnel neon strips dark train station future glow',
        'vaporwave neon sunset grid dark aesthetic purple pink glow',
        'blade runner city rain neon dark dystopia glow cinematic fog',
    ],

    'music_festival': [
        'festival outdoor crowd hype stage live pop summer bright energy',
        'festival music hype energetic crowd stage afrobeats vibrant outdoor',
        'outdoor festival stage show bright sky crowd summer happy dance',
        'festival sunset crowd warm golden stage live beautiful magic',
        'coachella desert festival stages crowds tents sunny warm afternoon',
        'glastonbury festival mud crowd green rain british summer flags',
        'electric forest festival night lights trees crowd magical dark',
        'lollapalooza festival city park stages crowd summer hot bright',
        'burning man festival desert night fire art crowd dark dramatic',
        'festival main stage fireworks night crowd dark celebration epic',
        'reggae festival beach outdoor palm trees crowd relaxed warm',
        'jazz festival outdoors summer band crowd elegant warm afternoon',
    ],

    'rooftop_view': [
        'rooftop city skyline night urban indie chill warm nostalgic vibe',
        'rooftop sunset city beautiful warm golden indie peaceful breath',
        'rooftop city view aerial cinematic beautiful night lights drama',
        'penthouse rooftop city skyline golden sunset romantic warm glow',
        'rooftop pool party sunset city lights warm summer evening chill',
        'rooftop bar city night lights cocktail intimate warm romantic',
        'rooftop garden city green plants warm afternoon peaceful bohemian',
        'rooftop helipad city skyline night dark dramatic cinematic aerial',
    ],

    'underground_club': [
        'underground club dark bass house music strobe lights crowd dancing',
        'dark underground techno rave bass smoke machine strobe black wall',
        'basement club dark neon minimal techno crowd sweaty intense',
        'underground party dark lights bass music subwoofer crowd energy',
        'nightclub dark dance floor strobe laser lights crowd grinding music',
        'warehouse party underground dark EDM crowd rave fog machine strobe',
        'underground jazz club dark intimate stage dim amber blue smoke',
        'hip hop underground cipher dark crowd rapper mic pass',
        'drill music dark underground basement studio gritty London Chicago',
    ],

    'rain_mood': [
        'rainy window city lights blurred dark moody introspective alone',
        'rain street walk dark umbrella neon reflections city night mood',
        'rain on glass dark bedroom alone introspective blue light outside',
        'heavy rain city night dark empty street neon wet cinematic',
        'rain forest dark green atmospheric mist moody melancholy walk',
        'rain roof puddles dark suburban street night lonely cinematic',
        'thunderstorm dark city dramatic lightning brief flash cinematic',
        'misty rain bridge dark city silhouette dramatic moody blue',
        'drizzle cafe window dark street lights blur warm inside cold out',
    ],

    'morning_light': [
        'sunrise morning light bedroom curtains warm golden peaceful calm',
        'morning mist forest light rays golden peaceful spiritual nature',
        'early morning studio fresh start warm coffee golden light focused',
        'sunrise city rooftop dawn warm pink sky hopeful beginning',
        'morning beach sunrise waves soft golden pink sky peaceful calm',
        'sunrise highway road trip warm golden ahead hopeful freedom drive',
        'morning light church stained glass warm rays spiritual uplift',
        'dawn mountain peak sunrise clouds below warm dramatic epic',
        'morning kitchen warm golden light coffee steam peaceful domestic',
    ],

    'warehouse_rave': [
        'warehouse rave dark industrial bare concrete pillars strobe laser',
        'abandoned warehouse party dark techno crowd smoke machine intense',
        'industrial rave space dark pipes rust concrete strobe art',
        'warehouse concert live performance dark crowd art direction brick',
        'raw industrial space dark music event moody dramatic concrete',
        'factory rave dark machinery shadows DJ booth crowd underground',
        'warehouse art show dark moody crowd installation light projection',
        'industrial nightclub dark metal aesthetic underground bass music',
    ],

    'intimate_venue': [
        'small intimate venue acoustic concert warm 200 seats close crowd',
        'jazz club stage band audience small dim amber warm cocktail',
        'coffee shop acoustic performance warm cozy intimate small crowd',
        'church acoustics intimate performance choir warm sacred beautiful',
        'art gallery evening performance installation intimate warm crowd',
        'comedy club intimate dark small venue brick stage microphone warm',
        'speakeasy intimate bar live band warm dark brass wood vintage',
        'living room session intimate acoustic warm friends recording circle',
        'rooftop intimate concert sunset small crowd warm personal special',
    ],
}

# Flat list of all (scene, prompt) pairs — for random sampling
ALL_PAIRS = [
    (scene, prompt)
    for scene, prompts in SCENE_PROMPTS.items()
    for prompt in prompts
]
print(f"[DiffusionTrainer v3] Dataset: {len(ALL_PAIRS)} prompts "
      f"across {len(SCENE_PROMPTS)} scene categories", flush=True)


# ── Training-frame generation ──────────────────────────────────────────────

def _load_frame_generator():
    import importlib.util
    spec = importlib.util.spec_from_file_location(
        'frameGenerator',
        os.path.join(_parent, 'frameGenerator.py'))
    fg = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(fg)
    return fg

_fg_cache = None

def _generate_training_frame(scene: str, frame_idx: int, res: int = 48) -> np.ndarray:
    global _fg_cache
    try:
        if _fg_cache is None:
            _fg_cache = _load_frame_generator()
        fg = _fg_cache
        config = {
            'resolution': (res * 4, res * 4),
            'scene_prompt': scene,
            'title': 'MaxBooster', 'artist': 'AI', 'genre': 'hip-hop',
            'frame_index': frame_idx, 'fps': 30,
            'show_title': False, 'show_progress': False,
        }
        frame_bytes = fg.generate_frame(config)
        from PIL import Image
        import io
        img = Image.open(io.BytesIO(frame_bytes)).convert('RGB').resize((res, res), Image.BILINEAR)
        arr = np.array(img, dtype=np.float32) / 127.5 - 1.0
        return arr
    except Exception:
        return _procedural_frame(scene, res)


def _procedural_frame(scene: str, res: int) -> np.ndarray:
    """Rich procedural fallback frames with scene-specific palettes."""
    rng = np.random.default_rng()
    arr = np.zeros((res, res, 3), dtype=np.float32)

    palettes = {
        'concert_stage':    [(0.5, 0.1, 0.8), (0.8, 0.1, 0.5)],
        'city_nights':      [(0.05, 0.1, 0.5), (0.0, 0.3, 0.6)],
        'studio_session':   [(0.5, 0.35, 0.1), (0.3, 0.2, 0.05)],
        'golden_hour':      [(0.9, 0.6, 0.1), (0.7, 0.4, 0.05)],
        'neon_cityscape':   [(0.0, 0.8, 0.7), (0.7, 0.0, 0.9)],
        'music_festival':   [(0.8, 0.5, 0.1), (0.9, 0.7, 0.2)],
        'rooftop_view':     [(0.4, 0.5, 0.8), (0.6, 0.5, 0.3)],
        'underground_club': [(0.1, 0.0, 0.3), (0.3, 0.0, 0.5)],
        'rain_mood':        [(0.1, 0.15, 0.35), (0.05, 0.1, 0.2)],
        'morning_light':    [(0.9, 0.75, 0.4), (0.95, 0.6, 0.3)],
        'warehouse_rave':   [(0.15, 0.05, 0.1), (0.5, 0.1, 0.1)],
        'intimate_venue':   [(0.6, 0.4, 0.15), (0.4, 0.25, 0.05)],
    }
    colors = palettes.get(scene, [(0.3, 0.3, 0.3)])

    yv = np.linspace(0, 1, res).reshape(res, 1)
    xv = np.linspace(0, 1, res).reshape(1, res)
    weight_base = np.exp(-((yv - 0.5)**2 + (xv - 0.5)**2) / 0.3)

    for R, G, B in colors:
        jitter = 0.5 + 0.5 * rng.random()
        arr[:, :, 0] += R * weight_base * jitter
        arr[:, :, 1] += G * weight_base * jitter
        arr[:, :, 2] += B * weight_base * jitter

    # Vertical gradient for depth
    sky = np.linspace(0.3, 0.0, res).reshape(res, 1) * np.ones((1, res))
    arr[:, :, 2] += sky * 0.4
    arr += rng.standard_normal((res, res, 3)).astype(np.float32) * 0.12
    return arr.clip(-1.0, 1.0)


# ── Data augmentation ──────────────────────────────────────────────────────

def augment(frame: np.ndarray) -> np.ndarray:
    if np.random.random() < 0.5:
        frame = frame[:, ::-1, :].copy()
    for c in range(3):
        frame[:, :, c] = (
            frame[:, :, c] * np.random.uniform(0.85, 1.15)
            + np.random.uniform(-0.08, 0.08)
        ).clip(-1.0, 1.0)
    return frame


# ── Losses ─────────────────────────────────────────────────────────────────

_SOBEL_KX = np.array([[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], dtype=np.float32)
_SOBEL_KY = np.array([[-1, -2, -1], [0, 0, 0], [1, 2, 1]], dtype=np.float32)


def _sobel_gradient(x: np.ndarray) -> np.ndarray:
    from scipy.signal import convolve2d
    grad = np.zeros_like(x)
    for c in range(x.shape[2]):
        gx = convolve2d(x[:, :, c], _SOBEL_KX, mode='same', boundary='symm')
        gy = convolve2d(x[:, :, c], _SOBEL_KY, mode='same', boundary='symm')
        grad[:, :, c] = np.sqrt(gx**2 + gy**2 + 1e-8)
    return grad


def perceptual_loss(pred, target,
                    lambda_edge: float = 0.15,
                    lambda_freq: float = 0.03):
    diff  = pred - target
    mse   = np.mean(diff ** 2)
    dmse  = (2.0 / diff.size) * diff

    grad_pred   = _sobel_gradient(pred)
    grad_target = _sobel_gradient(target)
    edge_diff   = grad_pred - grad_target
    edge_loss   = np.mean(np.abs(edge_diff))
    dedge       = np.sign(edge_diff) / edge_diff.size * lambda_edge

    fft_pred   = np.abs(np.fft.rfft2(pred[:, :, 0]))
    fft_target = np.abs(np.fft.rfft2(target[:, :, 0]))
    freq_loss  = np.mean((fft_pred - fft_target) ** 2) * lambda_freq
    dfreq      = np.zeros_like(pred)
    dfreq[:, :, 0] = 2 * (pred[:, :, 0] - target[:, :, 0]) * lambda_freq / pred.size

    total  = mse + edge_loss + freq_loss
    dtotal = dmse + dedge + dfreq
    return total, dtotal


def _clip_gradients(pairs, max_norm: float = 1.0):
    total_sq = sum(
        float(np.sum(g ** 2))
        for _, grads in pairs
        for g in grads.values()
        if g is not None
    )
    norm = math.sqrt(total_sq + 1e-8)
    if norm > max_norm:
        scale = max_norm / norm
        for _, grads in pairs:
            for k in grads:
                if grads[k] is not None:
                    grads[k] *= scale


def _build_cond(time_enc, text_enc, t, prompt):
    t_emb  = time_enc.forward(t)
    tokens = tokenize(prompt)
    tx_emb = text_enc.forward(tokens)
    return np.concatenate([t_emb, tx_emb]).astype(np.float32)


# ── Weight I/O ─────────────────────────────────────────────────────────────

def _save_all(model, time_enc, text_enc, losses=None):
    weights = model.get_named_weights()
    for k, v in time_enc.params.items():
        weights[f'time_enc_{k}'] = v
    for k, v in text_enc.params.items():
        weights[f'text_enc_{k}'] = v
    np.savez_compressed(WEIGHTS_PATH, **weights)
    kb = os.path.getsize(WEIGHTS_PATH) // 1024
    print(f"[DiffusionTrainer v3] Saved weights ({kb} KB) → {WEIGHTS_PATH}", flush=True)


def _load_all(model, time_enc, text_enc, path):
    data = dict(np.load(path, allow_pickle=False))
    try:
        model.load_named_weights(data)
    except Exception as e:
        print(f"[DiffusionTrainer v3] Named load error: {e}")
        model.load_weights(data)
    for k in time_enc.params:
        key = f'time_enc_{k}'
        if key in data:
            time_enc.params[k] = data[key].astype(np.float32)
    for k in text_enc.params:
        key = f'text_enc_{k}'
        if key in data:
            text_enc.params[k] = data[key].astype(np.float32)
    print(f"[DiffusionTrainer v3] Weights loaded from {path}", flush=True)


# ── Dataset generation ─────────────────────────────────────────────────────

def build_dataset(n_samples: int, res: int) -> list:
    """Generate n_samples training frames, one per scene prompt pair."""
    print(f"[DiffusionTrainer v3] Generating {n_samples} training frames @ {res}×{res}...",
          flush=True)
    t0 = time.time()
    dataset = []
    scenes  = list(SCENE_PROMPTS.keys())

    for i in range(n_samples):
        scene_idx = i % len(scenes)
        scene     = scenes[scene_idx]
        prompts   = SCENE_PROMPTS[scene]
        prompt    = prompts[i % len(prompts)]
        frame_idx = np.random.randint(0, 900)
        frame     = _generate_training_frame(scene, frame_idx, res)
        dataset.append((frame, prompt, scene))
        if (i + 1) % 200 == 0:
            rate = (i + 1) / (time.time() - t0)
            print(f"  Generated {i+1}/{n_samples} ({rate:.1f}/s)", flush=True)

    print(f"[DiffusionTrainer v3] Dataset ready in {time.time()-t0:.0f}s "
          f"({len(dataset)} frames, {len(scenes)} scene types)", flush=True)
    return dataset


# ══════════════════════════════════════════════════════════════════════════════
# Main training function
# ══════════════════════════════════════════════════════════════════════════════

def train(n_samples:  int   = 600,
          n_epochs:   int   = 20,
          lr:         float = 2e-4,
          lr_min:     float = 5e-6,
          res:        int   = 48,
          T:          int   = 100,
          log_every:  int   = 100,
          resume:     bool  = True,
          ema_decay:  float = 0.9995,
          use_perceptual: bool = True,
          lambda_edge: float = 0.15,
          lambda_freq: float = 0.03,
          session_label: str = '') -> dict:
    """
    Training tiers:
      Quick:            300  × 10  → ~28 min  CPU @ 48×48
      Medium (default): 600  × 20  → ~110 min CPU @ 48×48
      Deep:             1000 × 30  → ~275 min CPU @ 48×48

    Memory system is always active — each session builds on all previous ones.
    """
    label = f" [{session_label}]" if session_label else ""
    print(f"[DiffusionTrainer v3]{label} {n_samples}×{n_epochs} @ {res}×{res}  "
          f"lr={lr:.0e}→{lr_min:.0e}  resume={resume}", flush=True)
    print(f"[DiffusionTrainer v3] Prompts: {len(ALL_PAIRS)} across "
          f"{len(SCENE_PROMPTS)} scene categories", flush=True)

    # Initialise all components
    memory    = LongTermMemory()
    scheduler = DDPMScheduler(T=T, schedule='cosine')
    time_enc  = TimeEncoder(sin_dim=64, emb_dim=32)
    text_enc  = TextEncoder(emb_dim=32, token_emb_dim=48)
    model     = UNet(cond_dim=64)
    optimizer = Adam(lr=lr, weight_decay=1e-5, lr_min=lr_min)
    ema       = EMA(decay=ema_decay)

    if resume and os.path.exists(WEIGHTS_PATH):
        try:
            _load_all(model, time_enc, text_enc, WEIGHTS_PATH)
        except Exception as e:
            print(f"[DiffusionTrainer v3] Weights incompatible, training fresh: {e}",
                  flush=True)

    mem_summary = memory.summary()
    print(f"[DiffusionTrainer v3] Memory: {mem_summary}", flush=True)

    # Build dataset
    dataset = build_dataset(n_samples, res)
    scenes  = list(SCENE_PROMPTS.keys())

    # Build batch scheduler — scene rotation with memory-driven priority
    batch_sched = RotatingBatchScheduler(
        memory,
        scenes,
        [(f, p) for f, p, _ in dataset],
    )

    model.set_training(True)
    all_pairs = (
        model._get_param_grad_pairs_flat()
        + [(time_enc.params, time_enc.grads)]
        + [(text_enc.params, text_enc.grads)]
    )

    losses       = []
    scene_losses = {s: [] for s in scenes}
    total_steps  = n_samples * n_epochs
    step         = 0
    t_train      = time.time()

    for epoch in range(n_epochs):
        # Shuffle base dataset
        np.random.shuffle(dataset)

        # Cosine LR
        optimizer.cosine_anneal(epoch, n_epochs)

        epoch_losses = []

        for frame_raw, prompt, scene in dataset:
            frame = augment(frame_raw)

            # Curriculum timestep sampling
            if epoch < n_epochs // 4:
                t_step = int(np.random.triangular(T // 4, T // 2, 3 * T // 4))
            else:
                t_step = np.random.randint(0, T)

            x_t, eps_gt = scheduler.add_noise(frame, t_step)
            cond        = _build_cond(time_enc, text_enc, t_step, prompt)

            model.zero_grads()
            time_enc.zero_grads()
            text_enc.zero_grads()

            eps_pred = model.forward(x_t, cond)

            if use_perceptual:
                loss, dloss = perceptual_loss(eps_pred, eps_gt, lambda_edge, lambda_freq)
            else:
                diff  = eps_pred - eps_gt
                loss  = float(np.mean(diff ** 2))
                dloss = (2.0 / diff.size) * diff

            epoch_losses.append(float(loss))
            scene_losses[scene].append(float(loss))

            model.backward(dloss)
            _clip_gradients(all_pairs, max_norm=1.0)
            optimizer.step(all_pairs)
            ema.update(all_pairs)

            # Record to long-term memory
            memory.record_step(scene, prompt, frame, float(loss), epoch_losses)

            step += 1
            if step % log_every == 0:
                avg     = np.mean(epoch_losses[-log_every:])
                elapsed = time.time() - t_train
                eta     = (total_steps - step) * (elapsed / step)
                print(f"  Ep{epoch+1}/{n_epochs} step{step}/{total_steps}  "
                      f"loss={avg:.4f}  lr={optimizer.lr:.2e}  "
                      f"replay={len(memory.replay)}  ETA={eta/60:.0f}min",
                      flush=True)

        # Replay 20% of next epoch from hard examples in memory buffer
        replay_batch = memory.get_replay_batch(max(1, n_samples // 5))
        for entry in replay_batch:
            try:
                frame_r = memory.replay.get_frame(entry)
                frame_r = augment(frame_r)
                t_step  = np.random.randint(T // 4, T)
                x_t, eps_gt = scheduler.add_noise(frame_r, t_step)
                cond = _build_cond(time_enc, text_enc, t_step, entry['prompt'])
                model.zero_grads(); time_enc.zero_grads(); text_enc.zero_grads()
                eps_pred = model.forward(x_t, cond)
                if use_perceptual:
                    r_loss, r_dloss = perceptual_loss(eps_pred, eps_gt, lambda_edge, lambda_freq)
                else:
                    r_diff  = eps_pred - eps_gt
                    r_loss  = float(np.mean(r_diff ** 2))
                    r_dloss = (2.0 / r_diff.size) * r_diff
                model.backward(r_dloss)
                _clip_gradients(all_pairs, max_norm=1.0)
                optimizer.step(all_pairs)
                ema.update(all_pairs)
                epoch_losses.append(float(r_loss))
                step += 1
            except Exception:
                pass

        epoch_loss = float(np.mean(epoch_losses))
        losses.append(epoch_loss)

        if epoch % 5 == 0 or epoch == n_epochs - 1:
            print(f"[DiffusionTrainer v3] Epoch {epoch+1}/{n_epochs}  "
                  f"loss={epoch_loss:.4f}  lr={optimizer.lr:.2e}  "
                  f"scenes={memory.summary()['scenes_tracked']}  "
                  f"replay={memory.summary()['replay_buffer']}",
                  flush=True)
            backup = ema.apply(all_pairs)
            _save_all(model, time_enc, text_enc, losses)
            ema.restore(all_pairs, backup)

    total_time = time.time() - t_train
    print(f"[DiffusionTrainer v3] Done in {total_time/60:.1f}min  "
          f"final_loss={losses[-1]:.4f}", flush=True)

    # Final EMA save
    backup = ema.apply(all_pairs)
    _save_all(model, time_enc, text_enc, losses)
    ema.restore(all_pairs, backup)

    meta = {
        'version':        3,
        'epochs':         n_epochs,
        'samples':        n_samples,
        'final_loss':     float(losses[-1]),
        'total_seconds':  total_time,
        'losses':         losses,
        'resolution':     res,
        'T':              T,
        'schedule':       'cosine',
        'ema_decay':      ema_decay,
        'perceptual_loss': use_perceptual,
        'channels':       [32, 64, 96, 128],
        'attention':      True,
        'attention_levels': 2,
        'resblocks':      True,
        'scene_categories': len(SCENE_PROMPTS),
        'total_prompts':  len(ALL_PAIRS),
        'session_label':  session_label,
    }
    with open(META_PATH, 'w') as f:
        json.dump(meta, f, indent=2)

    # Persist session to long-term memory
    memory.complete_session(meta, total_time)

    return meta


# ── Helpers ────────────────────────────────────────────────────────────────

def is_trained() -> bool:
    return os.path.exists(WEIGHTS_PATH) and os.path.exists(META_PATH)


def get_meta() -> dict:
    if os.path.exists(META_PATH):
        with open(META_PATH) as f:
            return json.load(f)
    return {}


def load_for_inference(model, time_enc, text_enc):
    if is_trained():
        _load_all(model, time_enc, text_enc, WEIGHTS_PATH)
        return True
    return False
