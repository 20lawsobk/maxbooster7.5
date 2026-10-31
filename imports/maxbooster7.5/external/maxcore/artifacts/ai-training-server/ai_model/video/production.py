"""Exact, authored production composition using MaxCore's existing media engines.

This is not a learned visual or language model. Inputs remain author-owned copy
and images; requested sound must actually render or the entire job fails.
"""
import base64
import io
import math
from pathlib import Path
import subprocess
import tempfile

from PIL import Image
from ai_model.capabilities import bounded_text, choice, finite_number, MAX_SOURCE_IMAGE_PIXELS
from .scenes import SceneConfig, TextElement, _wrap

TRANSITIONS = ("fade", "dissolve", "wipeleft", "fadeblack")
GRADES = ("none", "warm", "cool", "cinematic", "neon")
MAX_ASSET_BYTES = 4 * 1024 * 1024
MAX_TOTAL_ASSET_BYTES = 8 * 1024 * 1024


def _fields(value, name, allowed, required=()):
    if not isinstance(value, dict):
        raise ValueError(f"{name} must be an object")
    if set(value) - set(allowed) or set(required) - set(value):
        raise ValueError(f"{name} has unsupported or missing fields")


def validate_image(value):
    if not isinstance(value, str) or not value or len(value) > 4 * ((MAX_ASSET_BYTES + 2) // 3):
        raise ValueError("Production image must be base64, at most 4 MiB")
    try:
        data = base64.b64decode(value, validate=True)
        if not data or len(data) > MAX_ASSET_BYTES:
            raise ValueError("Production image exceeds 4 MiB")
        with Image.open(io.BytesIO(data)) as image:
            if image.format not in ("PNG", "JPEG", "WEBP"):
                raise ValueError("Production images must be PNG, JPEG or WebP")
            if image.width * image.height > MAX_SOURCE_IMAGE_PIXELS:
                raise ValueError("Production image exceeds source pixel budget")
            if getattr(image, "n_frames", 1) != 1:
                raise ValueError("Animated images are not supported as still scenes")
            image.verify()
    except Exception as exc:
        raise ValueError(f"Invalid production image: {exc}") from exc
    return len(data)


def validate_production(value, duration_sec, fps):
    _fields(value, "production",
            ("version", "scenes", "transition", "color_grade", "logo_b64", "narration", "music"),
            ("version", "scenes", "transition", "color_grade"))
    if type(value["version"]) is not int or value["version"] != 1:
        raise ValueError("Unsupported production version")
    choice(value["transition"], "transition", TRANSITIONS)
    choice(value["color_grade"], "color_grade", GRADES)
    scenes = value["scenes"]
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= 8:
        raise ValueError("Production requires 1–8 scenes")
    frame_counts, asset_bytes = [], 0
    for scene in scenes:
        _fields(scene, "scene", ("text", "duration_sec", "image_b64"), ("text", "duration_sec"))
        bounded_text(scene["text"], "scene text", 280)
        if not scene["text"].strip():
            raise ValueError("Scene text must not be empty")
        duration = finite_number(scene["duration_sec"], "scene duration", .5, 30)
        frame_counts.append(math.floor(duration * fps + .5))
        if "image_b64" in scene:
            asset_bytes += validate_image(scene["image_b64"])
    total = sum(frame_counts)
    if total / fps > 60 or total != math.floor(duration_sec * fps + .5):
        raise ValueError("Production scene durations must match the requested duration and total at most 60 seconds")
    if "logo_b64" in value:
        asset_bytes += validate_image(value["logo_b64"])
    if asset_bytes > MAX_TOTAL_ASSET_BYTES:
        raise ValueError("Combined production images exceed 8 MiB")
    if "narration" in value:
        narration = value["narration"]
        _fields(narration, "narration", ("text", "voice", "wpm"), ("text", "voice", "wpm"))
        bounded_text(narration["text"], "narration", 3000)
        if not narration["text"].strip():
            raise ValueError("Narration must not be empty")
        choice(narration["voice"], "voice", ("en-us", "en-gb"))
        if type(narration["wpm"]) is not int or not 100 <= narration["wpm"] <= 220:
            raise ValueError("Narration pace must be an integer from 100–220")
    if "music" in value:
        music = value["music"]
        _fields(music, "music", ("bpm", "key", "instrument", "arrangement"),
                ("bpm", "key", "instrument", "arrangement"))
        from ai_model.capabilities import capabilities
        from ai_model.audio.digital_gpu_synth import _NOTE_SEMI
        finite_number(music["bpm"], "music BPM", 60, 200)
        bounded_text(music["key"], "music key", 32)
        parts = music["key"].split()
        if len(parts) != 2 or parts[0] not in _NOTE_SEMI or parts[1] not in ("minor", "major"):
            raise ValueError("Unsupported music key")
        supported = capabilities("audio")
        choice(music["instrument"], "instrument", supported["instruments"])
        choice(music["arrangement"], "arrangement", supported["arrangements"])
    return frame_counts


def render_production(production, *, duration_sec, width, height, fps, color1, color2, seed):
    from .cinematic_engine import render_cinematic_open
    from .controls import validate_video
    from ai_model.media_contract import require_audio_stream
    frame_counts = validate_production(production, duration_sec, fps)
    duration = sum(frame_counts) / fps
    with tempfile.TemporaryDirectory(prefix="maxcore-production-") as temporary:
        root = Path(temporary)
        audio = None
        if "music" in production:
            from ai_model.audio.controls import render_audio
            audio = str(root / "music.wav")
            render_audio(audio, job_id=f"production:{seed}", duration_sec=duration,
                         sample_rate=44100, **production["music"])
        if "narration" in production:
            from ai_model.audio.voiceover import synthesize_voiceover, mix_voiceover_over_music
            narration = production["narration"]
            spoken = str(root / "narration.wav")
            if not synthesize_voiceover(narration["text"], spoken,
                                        voice=narration["voice"], wpm=narration["wpm"], exact_text=True):
                raise RuntimeError("Requested narration could not be synthesized")
            if require_audio_stream(spoken) > duration:
                raise ValueError("Narration exceeds video duration; shorten it or extend the scenes")
            mixed = str(root / "soundtrack.wav")
            if audio:
                if not mix_voiceover_over_music(spoken, audio, mixed, duration):
                    raise RuntimeError("Requested narration/music mix failed")
            else:
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", spoken, "-af", "apad",
                                "-t", str(duration), mixed],
                               check=True, capture_output=True, timeout=90)
            require_audio_stream(mixed, minimum_duration=duration)
            audio = mixed
        if audio:
            from ai_model.audio.finishing import finish_audio
            mastered = str(root / "mastered.wav")
            finish_audio(audio, mastered)
            audio = mastered
        scenes = []
        for index, (source, frames) in enumerate(zip(production["scenes"], frame_counts)):
            size = max(12, min(width // 18, height // 16))
            text_file = root / f"scene-{index}.txt"
            text_file.write_text(_wrap(source["text"], max(12, int(width * .8 / (size * .6)))),
                                 encoding="utf-8")
            scene = SceneConfig(
                duration=frames / fps, fps=fps, bg_color1=color1, bg_color2=color2,
                reference_b64=source.get("image_b64"), retrieval_conditioned=False,
                color_grade="" if production["color_grade"] == "none" else production["color_grade"],
                texts=[TextElement(text=source["text"], text_file=str(text_file), size=size)],
            )
            scene.logo_b64 = production.get("logo_b64")
            scenes.append(scene)
        result = render_cinematic_open(
            scenes, width, height, duration, audio_path=audio,
            transition=production["transition"], transition_dur=.25,
            preserve_scene_timing=True,
            rolling_reference=False,
        )
        if not result.success:
            raise RuntimeError(result.error or "Production composition failed")
        try:
            validate_video(result.file_path, width, height, sum(frame_counts), fps)
            if audio:
                from ai_model.audio.finishing import verify_finished_audio
                require_audio_stream(result.file_path, minimum_duration=duration - 1 / fps)
                result.audio_finishing = verify_finished_audio(result.file_path)
                result.audio_finishing["adaptive_ducking"] = "music" in production and "narration" in production
                subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", result.file_path,
                                "-map", "0:a:0", "-f", "null", "-"],
                               check=True, capture_output=True, timeout=120)
        except Exception:
            Path(result.file_path).unlink(missing_ok=True)
            raise
        return result
