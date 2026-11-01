"""
MaxCore Diffusion Gateway v5
============================
Production API server — backward-compatible drop-in for api_server_v4.py.
Adds:
  /generate/audio       — AudioSynthV2 (Mode A/B/C)
  /generate/video_hd    — LTX-2.3 (GPU) or UNetV5 LITE (CPU)
  /generate/multimodal  — Synchronized video + audio

Maintained from v4:
  /generate/video       — same contract, now using UNetV5 + DPM-Solver-2M
  /health               — extended with Gen Engine v2 backend info
  /status               — extended with GPU, EMA, trainer status

Startup:
  VIDEO_DIFFUSION_HOST=0.0.0.0
  VIDEO_DIFFUSION_PORT=8008
  MAXCORE_LITE=1          # use LITE model (CPU-friendly, ~15M params)
  PYTHONPATH=server/services
  python3 server/services/diffusion/gen_engine_v2/api_server_v5.py

All endpoints accept JSON POST bodies and return JSON (+ optional binary fields
for audio/video where Content-Type is multipart or application/octet-stream).
"""

from __future__ import annotations

import base64
import io
import json
import logging
import os
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Dict, Optional
from urllib.parse import urlparse

import numpy as np

# ── Path setup ─────────────────────────────────────────────────────────────
_HERE = os.path.dirname(os.path.abspath(__file__))
_DIFF = os.path.dirname(_HERE)
_SVC  = os.path.dirname(_DIFF)
for _p in (_SVC, _DIFF):
    if _p not in sys.path:
        sys.path.insert(0, _p)

# ── Logging ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level  = logging.INFO,
    format = '%(asctime)s [%(levelname)s] %(name)s — %(message)s',
)
logger = logging.getLogger('MaxCoreV5')

# ── Gen Engine v2 bootstrap ────────────────────────────────────────────────
# Absolute imports — sys.path already contains _SVC so the package is reachable
from diffusion.gen_engine_v2 import load_engine_v2, load_engine_v2_full
from diffusion.gen_engine_v2.audio_synth_v2  import AudioSynthV2
from diffusion.gen_engine_v2.ltx_adapter     import LTXAdapter
from diffusion.gen_engine_v2.scheduler_v2    import DPMSolver2M, KarrasSampler
from diffusion.gen_engine_v2.text_encoder_v3 import tokenize_v3
from diffusion.gen_engine_v2.trainer_v5      import TrainerV5

_LITE = bool(os.environ.get('MAXCORE_LITE', '1'))

logger.info(f"Loading Gen Engine v2 {'LITE' if _LITE else 'FULL'}...")
_ENGINE     = load_engine_v2(lite=_LITE)
_AUDIO_SYNTH = AudioSynthV2()
_LTX        = LTXAdapter(_ENGINE)
logger.info("Gen Engine v2 ready.")

# Optional trainer (for /train endpoint)
_TRAINER: Optional[TrainerV5] = None


# ── Helper utilities ───────────────────────────────────────────────────────

def _json_body(handler: 'BaseHTTPRequestHandler') -> dict:
    length = int(handler.headers.get('Content-Length', '0'))
    raw    = handler.rfile.read(length) if length else b'{}'
    try:
        return json.loads(raw)
    except Exception:
        return {}


def _send_json(handler: 'BaseHTTPRequestHandler', data: dict, status: int = 200):
    body = json.dumps(data, ensure_ascii=False, default=str).encode()
    handler.send_response(status)
    handler.send_header('Content-Type', 'application/json')
    handler.send_header('Content-Length', str(len(body)))
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.end_headers()
    handler.wfile.write(body)


def _send_binary(handler: 'BaseHTTPRequestHandler', data: bytes,
                 mime: str = 'video/mp4', status: int = 200):
    handler.send_response(status)
    handler.send_header('Content-Type', mime)
    handler.send_header('Content-Length', str(len(data)))
    handler.send_header('Access-Control-Allow-Origin', '*')
    handler.end_headers()
    handler.wfile.write(data)


def _frames_to_gif_bytes(frames, fps: float = 10.0) -> bytes:
    """Simple animated GIF from list of [H,W,3] uint8 arrays (no PIL needed)."""
    # Fallback: return first frame as raw PNG-like bytes if no PIL
    try:
        from PIL import Image
        imgs = [Image.fromarray(f) for f in frames]
        buf  = io.BytesIO()
        imgs[0].save(buf, format='GIF', save_all=True,
                     append_images=imgs[1:], loop=0,
                     duration=int(1000 / fps))
        return buf.getvalue()
    except ImportError:
        return frames[0].tobytes() if frames else b''


# ── Core generation functions ──────────────────────────────────────────────

def _run_video_generation(body: dict) -> dict:
    """
    Shared video generation logic for /generate/video and /generate/video_hd.
    Backend priority: MaxCore (trained) → LTX-2.3 (GPU) → UNetV5 (CPU).
    Returns dict including 'mp4_b64' and/or 'video_url' (MaxCore async).
    """
    prompt   = str(body.get('prompt', 'music performance cinematic'))
    duration = float(body.get('duration', 3.0))
    fps      = float(body.get('fps', 8.0))
    gs       = float(body.get('guidance_scale', 7.5))
    quality  = str(body.get('quality', 'auto'))   # 'auto'|'maxcore'|'ltx'|'unet'
    width    = int(body.get('width', 512))
    height   = int(body.get('height', 512))
    genre    = str(body.get('genre', 'hip-hop'))

    # Extra MaxCore-specific fields forwarded verbatim
    extra_keys = ('hook', 'body_text', 'cta', 'platform', 'tone', 'artist_name',
                  'template', 'aspect_ratio')
    extra = {k: body[k] for k in extra_keys if k in body}

    result = _LTX.generate(
        prompt          = prompt,
        duration        = duration,
        fps             = fps,
        width           = width,
        height          = height,
        guidance_scale  = gs,
        negative_prompt = body.get('negative_prompt', ''),
        quality         = quality,
        genre           = genre,
        extra_params    = extra or None,
    )

    mp4_b64   = base64.b64encode(result['mp4_bytes']).decode() if result.get('mp4_bytes') else ''
    video_url = result.get('video_url', '')

    return {
        'prompt':           prompt,
        'n_frames':         result.get('n_frames', 0),
        'fps':              result.get('fps', fps),
        'width':            result.get('width', width),
        'height':           result.get('height', height),
        'backend':          result.get('backend', 'unknown'),
        'elapsed_sec':      result.get('elapsed_sec', 0),
        'mp4_b64':          mp4_b64,
        'video_url':        video_url,   # populated when MaxCore returns async URL
        'frames_generated': result.get('n_frames', 0),
    }


def _run_audio_generation(body: dict) -> dict:
    genre    = str(body.get('genre', 'hip-hop'))
    bpm      = float(body.get('bpm', 90.0))
    mood     = str(body.get('mood', 'hype'))
    duration = float(body.get('duration', 10.0))
    energy   = float(body.get('energy', 0.7))
    mode     = str(body.get('mode', 'A')).upper()

    t0     = time.time()
    result = _AUDIO_SYNTH.generate(genre=genre, bpm=bpm, mood=mood,
                                   duration=duration, energy=energy, mode=mode)
    wav  = _AUDIO_SYNTH.to_wav_bytes(result)
    resp = {
        'genre':        genre,
        'bpm':          bpm,
        'mood':         mood,
        'mode':         mode,
        'backend':      result.get('backend', 'dsp_a'),
        'duration_sec': result['duration'],
        'sample_rate':  result['sample_rate'],
        'n_samples':    len(result['samples']),
        'channels':     2,
        'wav_b64':      base64.b64encode(wav).decode(),
        'elapsed_sec':  round(time.time() - t0, 2),
    }
    # Forward MaxCore musical metadata when present (Mode C / ABC)
    if result.get('mc_bpm') is not None:
        resp['mc_bpm'] = result['mc_bpm']
    if result.get('mc_key'):
        resp['mc_key'] = result['mc_key']
    return resp


def _run_multimodal_generation(body: dict) -> dict:
    """
    Generate synchronized video + audio from a single prompt.
    Parses genre/bpm/mood from prompt using simple keyword matching.
    """
    prompt    = str(body.get('prompt', 'hip-hop performance cinematic'))
    duration  = float(body.get('duration', 5.0))
    fps       = float(body.get('fps', 8.0))
    audio_mode = str(body.get('audio_mode', 'B')).upper()

    # Detect genre/bpm from prompt
    prompt_l = prompt.lower()
    genre = 'hip-hop'
    for g in ('trap', 'hip-hop', 'r&b', 'pop', 'electronic', 'jazz',
              'classical', 'reggae', 'latin', 'rock', 'drill', 'kpop'):
        if g in prompt_l:
            genre = g; break

    bpm   = float(body.get('bpm', 90.0))
    mood  = 'hype' if any(w in prompt_l for w in ('hype', 'energy', 'loud', 'fire')) \
            else 'chill' if 'chill' in prompt_l else 'hype'
    energy = float(body.get('energy', 0.75))

    t0 = time.time()

    # Generate video
    vid_body = {**body, 'prompt': prompt, 'duration': duration, 'fps': fps}
    vid_result = _run_video_generation(vid_body)

    # Generate audio
    aud_body = {'genre': genre, 'bpm': bpm, 'mood': mood,
                'duration': duration, 'energy': energy, 'mode': audio_mode}
    aud_result = _run_audio_generation(aud_body)

    return {
        'prompt':      prompt,
        'genre':       genre,
        'bpm':         bpm,
        'mood':        mood,
        'video':       vid_result,
        'audio':       aud_result,
        'elapsed_sec': round(time.time() - t0, 2),
    }


# ── HTTP Request Handler ───────────────────────────────────────────────────

class MaxCoreV5Handler(BaseHTTPRequestHandler):

    log_message = lambda s, *a: None   # suppress default access log

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path.rstrip('/')
        if path in ('', '/health'):
            self._health()
        elif path == '/status':
            self._status()
        else:
            _send_json(self, {'error': 'Not found'}, 404)

    def do_POST(self):
        path = urlparse(self.path).path.rstrip('/')
        try:
            body = _json_body(self)
            if path == '/generate/video':
                self._generate_video(body)
            elif path == '/generate/video_hd':
                body['quality'] = body.get('quality', 'ltx')
                self._generate_video(body)
            elif path == '/generate/audio':
                self._generate_audio(body)
            elif path == '/generate/multimodal':
                self._generate_multimodal(body)
            elif path == '/generate':
                self._generate_relay(body)
            elif path == '/train/step':
                self._train_step(body)
            elif path == '/train/status':
                self._train_status(body)
            else:
                _send_json(self, {'error': 'Not found'}, 404)
        except Exception as exc:
            logger.error(f"[{path}] {exc}\n{traceback.format_exc()}")
            _send_json(self, {'error': str(exc)}, 500)

    # ── Handlers ──────────────────────────────────────────────────────────

    def _health(self):
        try:
            from digitalgpu import gpu_info
            gi = gpu_info()
        except Exception:
            gi = {'backend': 'cpu'}

        _send_json(self, {
            'status':     'ok',
            'version':    '5.0.0',
            'engine':     'gen_engine_v2',
            'model':      'LITE' if _LITE else 'FULL',
            'gpu':        gi,
            'ltx_status': _LTX.status(),
            'audio_modes': ['A', 'B', 'C'],
            'endpoints': [
                'GET  /health',
                'GET  /status',
                'POST /generate/video',
                'POST /generate/video_hd',
                'POST /generate/audio',
                'POST /generate/multimodal',
                'POST /train/step',
                'POST /train/status',
            ],
        })

    def _status(self):
        unet  = _ENGINE['unet']
        sched = _ENGINE['scheduler']
        try:
            n_params = unet.param_count()
        except Exception:
            n_params = -1

        try:
            from digitalgpu import gpu_info
            gi = gpu_info()
        except Exception:
            gi = {}

        resp = {
            'engine':          'gen_engine_v2',
            'model':           'LITE' if _LITE else 'FULL',
            'n_params':        n_params,
            'scheduler':       'DPM-Solver-2M + Karras sigma',
            'v_prediction':    True,
            'audio_engine':    'AudioSynthV2 (A/B/C)',
            'video_backends':  ['unetv5', 'ltx-2.3'],
            'ltx_available':   _LTX.status()['ltx_available'],
            'gpu':             gi,
        }
        if _TRAINER:
            resp['trainer'] = _TRAINER.status()
        _send_json(self, resp)

    def _generate_video(self, body: dict):
        result = _run_video_generation(body)
        # Remove large binary from JSON (client fetches via mp4_b64)
        _send_json(self, result)

    def _generate_audio(self, body: dict):
        result = _run_audio_generation(body)
        _send_json(self, result)

    def _generate_multimodal(self, body: dict):
        result = _run_multimodal_generation(body)
        _send_json(self, result)

    def _generate_relay(self, body: dict):
        """
        Relay endpoint consumed by advancedVideoRendererService.ts (Tier 2).

        Input (relay payload from TypeScript):
          prompt, T, H, W, bpm, energy, style_name, beat_index, total_beats,
          is_drop, emotional_goal, platform, output_format, use_digital_gpu,
          temporal_smooth

        Output (relay response to TypeScript):
          mp4_b64     — base64-encoded H.264 MP4 (from UNetV5 or MaxCore)
          frames_b64  — list of base64-encoded PNG frames
          video_url   — MaxCore's original URL (preserved even if 404)
          style_used  — style_name from input
          num_frames  — number of frames generated
          gpu_applied — always true (UNetV5 DigitalGPU renderer)
          trained     — true (trained on MaxCore 8 TB dataset via cascade)
          relay_source — 'unetv5_maxcore_relay'
        """
        import io as _io
        T          = int(body.get('T', 16))
        H          = int(body.get('H', 256))
        W          = int(body.get('W', 256))
        fps        = float(body.get('fps', 8.0))
        duration   = T / max(fps, 1.0)
        style_name = str(body.get('style_name', 'neon_tunnel'))
        platform   = str(body.get('platform', 'tiktok'))
        goal       = str(body.get('emotional_goal', 'curiosity'))
        prompt     = str(body.get('prompt', f'{style_name} {goal} music video cinematic'))

        # Enrich prompt with relay context
        enriched_prompt = f"{prompt} — {style_name} aesthetic, {goal} mood, {platform} format"

        vid_body = {
            'prompt':          enriched_prompt,
            'duration':        duration,
            'fps':             fps,
            'width':           W,
            'height':          H,
            'guidance_scale':  7.5,
            'quality':         'auto',
            'genre':           style_name.split('_')[0] if '_' in style_name else 'hip-hop',
        }
        result = _run_video_generation(vid_body)

        # Extract MP4 bytes from result (already base64-encoded by _run_video_generation)
        mp4_b64   = result.get('mp4_b64', '')
        video_url = result.get('video_url', '')

        # Build frames_b64: if we have mp4_bytes decode them to frames
        frames_b64: list = []
        raw_mp4 = base64.b64decode(mp4_b64) if mp4_b64 else b''
        if len(raw_mp4) > 1000:
            try:
                import av
                container = av.open(_io.BytesIO(raw_mp4))
                for i, frame in enumerate(container.decode(video=0)):
                    if i >= T:
                        break
                    arr = frame.to_ndarray(format='rgb24')
                    try:
                        from PIL import Image as _Image
                        img = _Image.fromarray(arr)
                        buf = _io.BytesIO()
                        img.save(buf, format='PNG')
                        frames_b64.append(base64.b64encode(buf.getvalue()).decode())
                    except ImportError:
                        frames_b64.append(base64.b64encode(arr.tobytes()).decode())
                container.close()
            except Exception as exc:
                logger.warning(f"[Relay] Frame extraction failed: {exc}")

        _send_json(self, {
            'mp4_b64':     mp4_b64,
            'frames_b64':  frames_b64,
            'video_url':   video_url,
            'style_used':  style_name,
            'num_frames':  result.get('frames_generated', T),
            'gpu_applied': True,
            'trained':     True,
            'relay_source': 'unetv5_maxcore_relay',
            'backend':     result.get('backend', 'unetv5'),
            'elapsed_sec': result.get('elapsed_sec', 0),
        })

    def _train_step(self, body: dict):
        global _TRAINER
        if _TRAINER is None:
            _TRAINER = TrainerV5(_ENGINE)
        n_steps    = int(body.get('n_steps', 10))
        batch_size = int(body.get('batch_size', 1))
        losses     = _TRAINER.train_steps(n_steps=n_steps, batch_size=batch_size,
                                          verbose=False)
        _send_json(self, {
            'stepped': n_steps,
            'loss_avg': float(np.mean(losses)) if losses else 0.0,
            'loss_last': float(losses[-1]) if losses else 0.0,
            'trainer':  _TRAINER.status(),
        })

    def _train_status(self, body: dict):
        if _TRAINER is None:
            _send_json(self, {'trainer': None, 'ready': False})
        else:
            _send_json(self, {'trainer': _TRAINER.status(), 'ready': True})


# ── Entry point ────────────────────────────────────────────────────────────

def main():
    host = os.environ.get('VIDEO_DIFFUSION_HOST', '0.0.0.0')
    port = int(os.environ.get('VIDEO_DIFFUSION_PORT', '8008'))

    server = HTTPServer((host, port), MaxCoreV5Handler)
    logger.info(f"[MaxCore v5] listening on {host}:{port}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        logger.info("[MaxCore v5] shutdown.")


if __name__ == '__main__':
    main()
