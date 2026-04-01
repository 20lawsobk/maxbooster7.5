"""
Max Booster Video Diffusion API Server.

FastAPI endpoint that exposes the VideoGenerationPipeline to the Node.js
creative model service.  Music intelligence from CreativeContext is passed
directly into the diffusion model via structured fields — not just text prompts.

POST /generate         Full video generation (returns base64-encoded frames)
POST /generate/keyframe  Single-frame generation for keyframe previews
GET  /health           Health check
GET  /ready            Readiness check (model loaded)
"""

import os
import io
import sys
import yaml
import base64
import logging
from pathlib import Path
from typing import Optional

import torch
import numpy as np
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from infer.pipeline import VideoGenerationPipeline
from models.conditioning import STYLE_NAME_TO_ID

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("api_server")

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Max Booster Video Diffusion",
    description="Music-synced video generation via latent diffusion",
    version="1.0.0",
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Global pipeline (lazy-loaded on first request or at startup) ───────────────
_pipeline: Optional[VideoGenerationPipeline] = None
_cfg: dict = {}


def _load_cfg() -> dict:
    config_path = os.environ.get(
        "VIDEO_DIFFUSION_CONFIG",
        str(Path(__file__).parent.parent / "configs" / "diffusion_base.yaml"),
    )
    with open(config_path) as f:
        return yaml.safe_load(f)


def get_pipeline() -> VideoGenerationPipeline:
    global _pipeline, _cfg
    if _pipeline is None:
        _cfg = _load_cfg()
        logger.info("Loading VideoGenerationPipeline...")
        _pipeline = VideoGenerationPipeline(_cfg)
        logger.info("Pipeline ready.")
    return _pipeline


# ── Request / Response schemas ────────────────────────────────────────────────

class GenerateRequest(BaseModel):
    # Content
    prompt: str = Field(default="", description="Text prompt for visual style guidance")
    T: int = Field(default=16, ge=4, le=128, description="Number of frames")
    H: int = Field(default=256, ge=64, le=1024, description="Frame height")
    W: int = Field(default=256, ge=64, le=1024, description="Frame width")

    # Music intelligence (from Max Booster CreativeContext)
    bpm: float = Field(default=120.0, ge=40.0, le=250.0)
    energy: float = Field(default=0.65, ge=0.0, le=1.0)
    energy_peak: float = Field(default=0.85, ge=0.0, le=1.0)
    style_name: str = Field(default="neon_tunnel",
                            description="Primary visual style from KeyframeStyleSelector")
    beat_index: int = Field(default=0, ge=0)
    total_beats: int = Field(default=4, ge=1)
    is_drop: bool = Field(default=False)
    emotional_goal: str = Field(default="curiosity")
    blend_style_name: Optional[str] = Field(default=None,
                                            description="Secondary style to blend when confidence gap < 15%")
    blend_weight: float = Field(default=0.0, ge=0.0, le=1.0)

    # Generation control
    seed: Optional[int] = Field(default=None)
    output_format: str = Field(default="frames_b64",
                               description="frames_b64 | mp4_b64 | json_shape")
    platform: str = Field(default="tiktok",
                          description="tiktok | reels | youtube | shorts")


class KeyframeRequest(BaseModel):
    prompt: str = ""
    H: int = 512
    W: int = 512
    style_name: str = "neon_tunnel"
    bpm: float = 120.0
    energy: float = 0.65
    energy_peak: float = 0.85
    beat_index: int = 0
    total_beats: int = 4
    emotional_goal: str = "curiosity"
    blend_style_name: Optional[str] = None
    blend_weight: float = 0.0
    seed: Optional[int] = None


class GenerateResponse(BaseModel):
    status: str
    frames_b64: Optional[list] = None
    mp4_b64: Optional[str] = None
    shape: Optional[list] = None
    style_used: str = ""
    device: str = ""
    num_frames: int = 0


# ── Helpers ───────────────────────────────────────────────────────────────────

def _style_to_prompt_prefix(style_name: str) -> str:
    """Convert a style name to a descriptive prompt prefix for the diffusion model."""
    prefixes = {
        "plasma_fractal":  "vibrant plasma fractal patterns, neon colors, psychedelic",
        "galaxy_spiral":   "galaxy spiral, deep space, starfield, cosmic nebula",
        "neon_tunnel":     "neon tunnel, cyberpunk corridor, fast motion, electric glow",
        "aurora_curtains": "aurora borealis curtains, northern lights, ethereal green purple",
        "warp_speed":      "warp speed stars, hyperspace, motion blur, white streaks",
        "liquid_metal":    "liquid metal flowing, chrome surface, mercury reflections",
        "fire_embers":     "fire embers, glowing sparks, warm orange red heat",
        "crystal_facets":  "crystal facets, gemstone refraction, prismatic light",
        "concert_stage":   "concert stage lights, laser show, fog machine, crowd silhouette",
        "city_nights":     "city at night, neon signs, rain reflections, urban bokeh",
        "studio_session":  "recording studio, professional music production, warm lighting",
        "golden_hour":     "golden hour sunset, warm orange sky, lens flare, cinematic",
        "neon_cityscape":  "neon cityscape, cyberpunk skyline, rain streets, purple glow",
    }
    return prefixes.get(style_name, "cinematic music video, high quality, dynamic")


def _tensor_to_frames_b64(video: torch.Tensor) -> list:
    """Convert [3, T, H, W] float32 → list of base64-encoded JPEG strings."""
    try:
        from PIL import Image
    except ImportError:
        return []

    frames = []
    v = video.permute(1, 2, 3, 0).cpu().numpy()  # [T, H, W, 3]
    for i in range(v.shape[0]):
        frame = (v[i] * 255).clip(0, 255).astype(np.uint8)
        img = Image.fromarray(frame)
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=90)
        frames.append(base64.b64encode(buf.getvalue()).decode())
    return frames


def _tensor_to_mp4_b64(video: torch.Tensor, fps: int = 24) -> str:
    """Convert [3, T, H, W] float32 → base64-encoded MP4 (requires torchvision)."""
    try:
        import torchvision.io as tvio
        import tempfile
        frames = (video.permute(1, 2, 3, 0) * 255).byte()  # [T, H, W, 3]
        with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as f:
            tvio.write_video(f.name, frames, fps)
            f.seek(0)
            data = open(f.name, "rb").read()
        return base64.b64encode(data).decode()
    except Exception as e:
        logger.warning(f"MP4 export failed: {e}")
        return ""


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/ready")
def ready():
    return {"ready": _pipeline is not None, "device": str(torch.device("cuda" if torch.cuda.is_available() else "cpu"))}


@app.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    try:
        pipe = get_pipeline()
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Pipeline unavailable: {e}")

    # Validate style
    if req.style_name not in STYLE_NAME_TO_ID:
        raise HTTPException(status_code=400,
                            detail=f"Unknown style '{req.style_name}'. Valid: {list(STYLE_NAME_TO_ID)}")

    # Build a rich text embedding from prompt + style description
    prompt_full = f"{_style_to_prompt_prefix(req.style_name)}, {req.prompt}".strip(", ")
    # Placeholder text embedding — replace with real CLIP/LLM encoder in production
    text_dim = pipe.cfg["text"]["dim"]
    text_emb = torch.zeros(1, 77, text_dim, device=pipe.device)

    logger.info(
        f"Generating: style={req.style_name} bpm={req.bpm} energy={req.energy:.2f} "
        f"T={req.T} H={req.H} W={req.W} beat={req.beat_index}/{req.total_beats}"
    )

    video = pipe(
        text_emb=text_emb,
        T=req.T, H=req.H, W=req.W,
        bpm=req.bpm,
        energy=req.energy,
        energy_peak=req.energy_peak,
        style_name=req.style_name,
        beat_index=req.beat_index,
        total_beats=req.total_beats,
        is_drop=req.is_drop,
        emotional_goal=req.emotional_goal,
        blend_style_name=req.blend_style_name,
        blend_weight=req.blend_weight,
        seed=req.seed,
    )  # [1, 3, T, H, W]

    v = video[0]  # [3, T, H, W]

    frames_b64 = None
    mp4_b64    = None

    if req.output_format == "frames_b64":
        frames_b64 = _tensor_to_frames_b64(v)
    elif req.output_format == "mp4_b64":
        fps = 30 if req.platform in ("tiktok", "reels", "shorts") else 24
        mp4_b64 = _tensor_to_mp4_b64(v, fps=fps)

    return GenerateResponse(
        status="ok",
        frames_b64=frames_b64,
        mp4_b64=mp4_b64,
        shape=list(v.shape),
        style_used=req.style_name,
        device=str(pipe.device),
        num_frames=v.shape[1],
    )


@app.post("/generate/keyframe")
def generate_keyframe(req: KeyframeRequest):
    """Generate a single representative frame for the given beat."""
    gen_req = GenerateRequest(
        prompt=req.prompt,
        T=4,  # minimal frames for speed
        H=req.H,
        W=req.W,
        bpm=req.bpm,
        energy=req.energy,
        energy_peak=req.energy_peak,
        style_name=req.style_name,
        beat_index=req.beat_index,
        total_beats=req.total_beats,
        emotional_goal=req.emotional_goal,
        blend_style_name=req.blend_style_name,
        blend_weight=req.blend_weight,
        seed=req.seed,
        output_format="frames_b64",
    )
    result = generate(gen_req)
    # Return only the middle frame as the representative keyframe
    mid = len(result.frames_b64) // 2 if result.frames_b64 else 0
    return {
        "status": "ok",
        "frame_b64": result.frames_b64[mid] if result.frames_b64 else None,
        "style_used": result.style_used,
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("VIDEO_DIFFUSION_PORT", 8010))
    host = os.environ.get("VIDEO_DIFFUSION_HOST", "0.0.0.0")
    uvicorn.run("api_server:app", host=host, port=port, reload=False)
