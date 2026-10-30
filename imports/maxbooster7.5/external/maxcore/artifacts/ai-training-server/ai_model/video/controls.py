"""Dedicated procedural video controls; no unsupported scene/identity claims."""
import json
import subprocess

from ai_model.capabilities import dimensions, finite_number, reject_semantic_controls
from .cinematic_engine import render_cinematic_open
from .scenes import SceneConfig, TextElement


def render_video(*, duration_sec=4, width=640, height=360, fps=24,
                 headline="", background="gradient", color1="0x1a1a2e",
                 color2="0x16213e", continuity="single_scene", audio_path=None,
                 subject=None, reference=None, style=None):
    reject_semantic_controls(subject=subject, reference=reference, style=style)
    width, height = dimensions(width, height, maximum=1920, even=True)
    duration_sec = finite_number(duration_sec, "duration_sec", .05, 300)
    if fps not in (8, 16, 24, 30):
        raise ValueError("fps must be 8, 16, 24 or 30")
    if background not in ("solid", "gradient"):
        raise ValueError("Only solid and gradient procedural backgrounds are supported")
    if continuity != "single_scene":
        raise ValueError("Only single_scene continuity is supported, not subject identity")
    import re
    if not all(re.fullmatch(r"0x[0-9a-fA-F]{6}", c) for c in (color1, color2)):
        raise ValueError("Colors must use 0xRRGGBB")
    scene = SceneConfig(
        duration=duration_sec, fps=fps, bg_type=background, bg_color1=color1,
        bg_color2=color2, retrieval_conditioned=False,
        texts=[TextElement(text=headline, size=max(12, width // 16))] if headline else [],
    )
    result = render_cinematic_open([scene], width, height, duration_sec,
                                  audio_path=audio_path)
    if not result.success:
        raise ValueError(result.error)
    validate_video(result.file_path, width, height, round(duration_sec * fps), fps)
    return result


def validate_video(path, width, height, frames, fps):
    """Probe decoded frame count then decode the entire stream, failing on corruption."""
    probe = subprocess.run(
        ["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v:0",
         "-show_entries", "stream=width,height,nb_read_frames,avg_frame_rate",
         "-of", "json", str(path)], capture_output=True, text=True, timeout=120,
        check=True)
    streams = json.loads(probe.stdout).get("streams", [])
    if not streams:
        raise ValueError("Video artifact has no video stream")
    stream = streams[0]
    rate = stream["avg_frame_rate"].split("/")
    if (stream["width"], stream["height"], int(stream["nb_read_frames"])) != (
            width, height, frames) or int(rate[0]) / int(rate[1]) != fps:
        raise ValueError("Decoded video dimensions/frame count/rate differ from request")
    subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", str(path),
                    "-map", "0:v:0", "-f", "null", "-"],
                   capture_output=True, timeout=300, check=True)
    return stream