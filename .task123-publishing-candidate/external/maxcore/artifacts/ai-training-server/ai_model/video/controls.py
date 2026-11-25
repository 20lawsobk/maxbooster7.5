"""Dedicated procedural video controls; no unsupported scene/identity claims."""
import json
import subprocess

from ai_model.capabilities import dimensions, finite_number, reject_semantic_controls, bounded_text, choice, MAX_VIDEO_PIXEL_FRAMES
from .cinematic_engine import render_cinematic_open
from .scenes import SceneConfig, TextElement


def render_video(*, duration_sec=4, width=640, height=360, fps=24,
                 headline="", background="gradient", color1="0x1a1a2e",
                 color2="0x16213e", continuity="single_scene", audio_path=None,
                 scene_headlines=None, production=None, seed=0,
                 subject=None, reference=None, style=None):
    reject_semantic_controls(subject=subject, reference=reference, style=style)
    bounded_text(headline, "headline", 280)
    bounded_text(color1, "color1", 8)
    bounded_text(color2, "color2", 8)
    choice(background, "background", ("solid", "gradient"))
    choice(continuity, "continuity", ("single_scene", "storyboard"))
    width, height = dimensions(width, height, maximum=1920, even=True)
    duration_sec = finite_number(duration_sec, "duration_sec", .05, 300)
    if type(fps) is not int or fps not in (8, 16, 24, 30):
        raise ValueError("fps must be 8, 16, 24 or 30")
    if width * height * round(duration_sec * fps) > MAX_VIDEO_PIXEL_FRAMES:
        raise ValueError("Video exceeds the pixel-frame budget; reduce duration, dimensions or FPS")
    if production is not None:
        if headline or scene_headlines is not None or continuity != "single_scene" or audio_path is not None:
            raise ValueError("Production owns its scenes and audio; do not combine legacy scene/audio controls")
        import re
        if not all(re.fullmatch(r"0x[0-9a-fA-F]{6}", c) for c in (color1, color2)):
            raise ValueError("Colors must use 0xRRGGBB")
        if type(seed) is not int or seed < 0:
            raise ValueError("seed must be a nonnegative integer")
        from .production import render_production
        return render_production(production, duration_sec=duration_sec, width=width,
                                 height=height, fps=fps, color1=color1, color2=color2, seed=seed)
    if background not in ("solid", "gradient"):
        raise ValueError("Only solid and gradient procedural backgrounds are supported")
    if continuity not in ("single_scene", "storyboard"):
        raise ValueError("Only single_scene or storyboard continuity is supported, not subject identity")
    if continuity == "storyboard":
        if (not isinstance(scene_headlines, list) or not 2 <= len(scene_headlines) <= 8
                or any(not isinstance(text, str) or not text.strip() or len(text) > 280
                       for text in scene_headlines)):
            raise ValueError("A storyboard requires 2–8 scene headlines of 1–280 characters")
        if headline:
            raise ValueError("Use scene_headlines instead of headline for a storyboard")
        for text in scene_headlines:
            bounded_text(text, "scene headline", 280)
        if duration_sec > 60:
            raise ValueError("Storyboard duration must not exceed 60 seconds")
    elif scene_headlines is not None:
        raise ValueError("scene_headlines requires storyboard continuity")
    import re
    if not all(re.fullmatch(r"0x[0-9a-fA-F]{6}", c) for c in (color1, color2)):
        raise ValueError("Colors must use 0xRRGGBB")
    headlines = scene_headlines if continuity == "storyboard" else [headline]
    frames = round(duration_sec * fps)
    if frames < len(headlines):
        raise ValueError("Each scene requires at least one frame")
    base, remainder = divmod(frames, len(headlines))
    scenes = [SceneConfig(
        duration=(base + (index < remainder)) / fps, fps=fps,
        bg_type=background, bg_color1=color1, bg_color2=color2,
        retrieval_conditioned=False,
        texts=[TextElement(text=text, size=max(12, width // 16))] if text else [],
    ) for index, text in enumerate(headlines)]
    result = render_cinematic_open(scenes, width, height, frames / fps,
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